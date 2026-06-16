'use strict';

const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const ISOLATED_NETWORK = 'acronym-isolated';

// Per-deployed-container resource limits (pure; unit-tested in util/limits).
const { containerLimits } = require('../util/limits');

/**
 * Ensure the isolated Docker network exists.
 * Deployed containers run on this network, which:
 *   - Allows outbound internet access (not Internal)
 *   - Disables inter-container communication (ICC = false)
 *   - Is separate from the API/nginx compose network
 */
async function ensureIsolatedNetwork() {
  const networks = await docker.listNetworks({
    filters: JSON.stringify({ name: [ISOLATED_NETWORK] }),
  });
  const exact = networks.find(n => n.Name === ISOLATED_NETWORK);
  if (!exact) {
    await docker.createNetwork({
      Name: ISOLATED_NETWORK,
      Driver: 'bridge',
      Options: {
        'com.docker.network.bridge.enable_icc': 'false',
      },
      CheckDuplicate: true,
    });
    console.log(`[docker] Created isolated network: ${ISOLATED_NETWORK}`);
  }
}

/**
 * Build a Docker image from a directory containing a Dockerfile.
 * @param {string} projectSlug
 * @param {string} buildContextPath
 * @param {function} onProgress - Called with each progress line string
 * @returns {Promise<string>} Image ID
 */
async function buildImage(projectSlug, buildContextPath, onProgress) {
  const tag = `acronym-deploy/${projectSlug}:latest`;

  return new Promise((resolve, reject) => {
    docker.buildImage(
      { context: buildContextPath, src: fs.readdirSync(buildContextPath) },
      { t: tag, rm: true, forcerm: true },
      (err, stream) => {
        if (err) return reject(err);

        let imageId = null;

        docker.modem.followProgress(
          stream,
          (finalErr, output) => {
            if (finalErr) return reject(finalErr);

            for (const item of output) {
              if (item.aux && item.aux.ID) {
                imageId = item.aux.ID;
              }
              if (item.stream) {
                const match = item.stream.match(/Successfully built ([a-f0-9]+)/i);
                if (match) imageId = match[1];
              }
            }

            if (!imageId) {
              docker.getImage(tag).inspect((inspectErr, data) => {
                if (inspectErr) return reject(inspectErr);
                resolve(data.Id);
              });
            } else {
              resolve(imageId);
            }
          },
          (event) => {
            if (event.stream) {
              onProgress(event.stream);
            } else if (event.error) {
              onProgress(`ERROR: ${event.error}\n`);
            } else if (event.status) {
              const line = event.progress
                ? `${event.status}: ${event.progress}\n`
                : `${event.status}\n`;
              onProgress(line);
            }
          }
        );
      }
    );
  });
}

/**
 * Run a Docker container for a deployed project.
 * Security hardening applied: CapDrop ALL, no-new-privileges, isolated network.
 * @param {string} projectSlug
 * @param {string} imageId
 * @param {number} port - Host port → container port 3000
 * @param {Object} envVars - Key/value env vars to inject
 * @returns {Promise<string>} Container ID
 */
async function runContainer(projectSlug, imageId, port, envVars = {}, opts = {}) {
  const containerName = `deploy_${projectSlug}`;

  const Env = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);

  const container = await docker.createContainer({
    name: containerName,
    Image: imageId,
    Env,
    ExposedPorts: { '3000/tcp': {} },
    HostConfig: {
      PortBindings: {
        '3000/tcp': [{ HostPort: String(port) }],
      },
      NetworkMode: ISOLATED_NETWORK,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      // env-driven resource limits (memory, CPU, PIDs, restart, log rotation)
      ...containerLimits(opts),
    },
    Labels: {
      managed: 'acronym-deploy',
      project: projectSlug,
    },
  });

  await container.start();
  return container.id;
}

/**
 * Start an existing (stopped) container.
 */
async function startContainer(containerId) {
  await docker.getContainer(containerId).start();
}

/**
 * Stop a running container (10s graceful timeout).
 */
async function stopContainer(containerId) {
  const container = docker.getContainer(containerId);
  await container.stop({ t: 10 });
}

/**
 * Restart a container.
 */
async function restartContainer(containerId) {
  const container = docker.getContainer(containerId);
  await container.restart({ t: 10 });
}

/**
 * Remove a container.
 */
async function removeContainer(containerId, force = true) {
  const container = docker.getContainer(containerId);
  await container.remove({ force, v: false });
}

/**
 * Remove a Docker image.
 */
async function removeImage(imageId, force = true) {
  const image = docker.getImage(imageId);
  await image.remove({ force });
}

/**
 * Get a single stats snapshot for a container.
 * @returns {Promise<{cpu_percent, memory_mb, memory_limit_mb, rx_bytes, tx_bytes}>}
 */
async function getContainerStats(containerId) {
  const container = docker.getContainer(containerId);

  const stats = await new Promise((resolve, reject) => {
    container.stats({ stream: false }, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });

  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage -
    stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const numCPUs =
    stats.cpu_stats.online_cpus ||
    (stats.cpu_stats.cpu_usage.percpu_usage
      ? stats.cpu_stats.cpu_usage.percpu_usage.length
      : 1);

  const cpu_percent =
    systemDelta > 0 ? (cpuDelta / systemDelta) * numCPUs * 100 : 0;

  const memory_mb = stats.memory_stats.usage / (1024 * 1024);
  const memory_limit_mb = stats.memory_stats.limit / (1024 * 1024);

  let rx_bytes = 0;
  let tx_bytes = 0;
  if (stats.networks) {
    for (const iface of Object.values(stats.networks)) {
      rx_bytes += iface.rx_bytes || 0;
      tx_bytes += iface.tx_bytes || 0;
    }
  }

  return {
    cpu_percent: Math.round(cpu_percent * 100) / 100,
    memory_mb: Math.round(memory_mb * 100) / 100,
    memory_limit_mb: Math.round(memory_limit_mb * 100) / 100,
    rx_bytes,
    tx_bytes,
  };
}

/**
 * Get the last N lines of container logs as a plain string.
 */
async function getContainerLogs(containerId, tail = 100) {
  const container = docker.getContainer(containerId);
  const stream = await container.logs({
    stdout: true,
    stderr: true,
    tail,
    follow: false,
  });
  return demuxStream(stream);
}

/**
 * Stream container logs live.
 * @returns {Promise<stream>} Destroy to stop.
 */
async function streamContainerLogs(containerId, onData, onEnd) {
  const container = docker.getContainer(containerId);

  const stream = await container.logs({
    stdout: true,
    stderr: true,
    tail: 100,
    follow: true,
  });

  const demuxer = createDemuxer(onData, onEnd);
  stream.on('data', (chunk) => demuxer(chunk));
  stream.on('end', () => onEnd && onEnd());
  stream.on('error', (err) => {
    onData && onData(`[stream error] ${err.message}\n`);
    onEnd && onEnd();
  });

  return stream;
}

/**
 * Open an interactive exec session (/bin/sh) inside a container.
 * Returns { stream, resize } — write to the stream to send input, listen
 * 'data' for output, and call resize({ h, w }) to resize the TTY.
 */
async function execContainer(containerId, onData, onEnd) {
  const container = docker.getContainer(containerId);

  const exec = await container.exec({
    Cmd: ['/bin/sh'],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: ['TERM=xterm'],
  });

  const stream = await new Promise((resolve, reject) => {
    exec.start({ hijack: true, stdin: true }, (err, s) => {
      if (err) return reject(err);
      resolve(s);
    });
  });

  stream.on('data', (chunk) => {
    onData && onData(chunk.toString());
  });
  stream.on('end', () => {
    onEnd && onEnd();
  });
  stream.on('error', (err) => {
    onData && onData(`[error] ${err.message}\n`);
    onEnd && onEnd();
  });

  const resize = async ({ h, w }) => {
    if (!Number.isInteger(h) || !Number.isInteger(w) || h <= 0 || w <= 0) return;
    await exec.resize({ h, w });
  };

  return { stream, resize };
}

/**
 * List all containers managed by this platform.
 */
async function listManagedContainers() {
  return docker.listContainers({
    all: true,
    filters: JSON.stringify({ label: ['managed=acronym-deploy'] }),
  });
}

/**
 * Find a free host port in range [start, end].
 * Checks both Docker-bound ports and any extra usedPorts set (e.g. from DB).
 */
async function findFreePort(start = 4000, end = 5000, usedPorts = new Set()) {
  const containers = await docker.listContainers({ all: true });
  const boundPorts = new Set(usedPorts);

  for (const container of containers) {
    if (container.Ports) {
      for (const portMapping of container.Ports) {
        if (portMapping.PublicPort) {
          boundPorts.add(portMapping.PublicPort);
        }
      }
    }
  }

  for (let port = start; port <= end; port++) {
    if (!boundPorts.has(port)) return port;
  }

  throw new Error(`No free port found in range ${start}-${end}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function demuxStream(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);

  let result = '';
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const size = buffer.readUInt32BE(offset + 4);
    offset += 8;
    if (offset + size > buffer.length) break;
    result += buffer.slice(offset, offset + size).toString('utf8');
    offset += size;
  }

  return result;
}

function createDemuxer(onData) {
  let headerBuf = Buffer.alloc(0);
  let remainingPayload = 0;
  let payloadBuf = Buffer.alloc(0);
  let inPayload = false;

  return function demux(chunk) {
    let buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let pos = 0;

    while (pos < buf.length) {
      if (!inPayload) {
        const needed = 8 - headerBuf.length;
        const take = Math.min(needed, buf.length - pos);
        headerBuf = Buffer.concat([headerBuf, buf.slice(pos, pos + take)]);
        pos += take;

        if (headerBuf.length === 8) {
          remainingPayload = headerBuf.readUInt32BE(4);
          headerBuf = Buffer.alloc(0);
          inPayload = true;
          payloadBuf = Buffer.alloc(0);
        }
      } else {
        const take = Math.min(remainingPayload - payloadBuf.length, buf.length - pos);
        payloadBuf = Buffer.concat([payloadBuf, buf.slice(pos, pos + take)]);
        pos += take;

        if (payloadBuf.length === remainingPayload) {
          onData && onData(payloadBuf.toString('utf8'));
          inPayload = false;
          remainingPayload = 0;
          payloadBuf = Buffer.alloc(0);
        }
      }
    }
  };
}

module.exports = {
  ensureIsolatedNetwork,
  containerLimits,
  buildImage,
  runContainer,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  removeImage,
  getContainerStats,
  getContainerLogs,
  streamContainerLogs,
  execContainer,
  listManagedContainers,
  findFreePort,
};
