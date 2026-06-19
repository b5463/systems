'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const unzipper = require('unzipper');
const { safeResolve } = require('../util/pathsafe');

/**
 * Extract a ZIP file to a destination directory.
 * Prevents zip slip by ensuring all extracted paths are under destDir.
 *
 * @param {string} zipPath - Absolute path to the ZIP file
 * @param {string} destDir - Absolute path to destination directory
 * @returns {Promise<string[]>} List of extracted file paths (relative to destDir)
 */
const MAX_ENTRIES = 5000;
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB per file

async function extractZip(zipPath, destDir) {
  await fsp.mkdir(destDir, { recursive: true });

  const extractedFiles = [];
  let entryCount = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on('entry', async (entry) => {
        entryCount++;
        if (entryCount > MAX_ENTRIES) {
          entry.autodrain();
          reject(new Error(`ZIP contains more than ${MAX_ENTRIES} entries`));
          return;
        }

        const entryPath = entry.path;
        const type = entry.type;

        // Zip slip prevention (shared, unit-tested guard)
        const fullOutputPath = safeResolve(destDir, entryPath);
        if (!fullOutputPath) {
          entry.autodrain();
          reject(new Error(`Zip slip attempt detected: entry "${entryPath}" resolves outside destination`));
          return;
        }

        if (type === 'Directory') {
          try {
            await fsp.mkdir(fullOutputPath, { recursive: true });
          } catch (err) {
            // Ignore already-exists
          }
          entry.autodrain();
        } else {
          try {
            await fsp.mkdir(path.dirname(fullOutputPath), { recursive: true });
            await new Promise((res, rej) => {
              let written = 0;
              const ws = fs.createWriteStream(fullOutputPath);
              ws.on('finish', res);
              ws.on('error', rej);
              entry.on('data', (chunk) => {
                written += chunk.length;
                if (written > MAX_FILE_BYTES) {
                  ws.destroy();
                  entry.destroy();
                  rej(new Error(`File "${entryPath}" exceeds the 100MB per-file limit`));
                }
              });
              entry.pipe(ws);
            });
            extractedFiles.push(path.relative(destDir, fullOutputPath));
          } catch (err) {
            reject(err);
          }
        }
      })
      .on('finish', resolve)
      .on('error', reject);
  });

  return extractedFiles;
}

/**
 * Detect the type of project in a directory.
 * @param {string} dirPath
 * @returns {Promise<'dockerfile'|'node'|'python'|'static'>}
 */
async function detectProjectType(dirPath) {
  const entries = await fsp.readdir(dirPath);

  // Check recursively one level down if there's a single subdirectory
  // (common when zip contains a root folder)
  let searchDir = dirPath;
  if (entries.length === 1) {
    const single = path.join(dirPath, entries[0]);
    try {
      const stat = await fsp.stat(single);
      if (stat.isDirectory()) {
        searchDir = single;
      }
    } catch {
      // ignore
    }
  }

  const files = await fsp.readdir(searchDir);
  const fileSet = new Set(files.map(f => f.toLowerCase()));

  if (fileSet.has('dockerfile')) return 'dockerfile';
  if (fileSet.has('package.json')) return 'node';
  if (fileSet.has('requirements.txt') || fileSet.has('pyproject.toml')) return 'python';
  return 'static';
}

/**
 * Generate a Dockerfile in the project directory based on type.
 * @param {'dockerfile'|'node'|'python'|'static'} projectType
 * @param {string} dirPath
 */
async function generateDockerfile(projectType, dirPath) {
  if (projectType === 'dockerfile') {
    // Already has a Dockerfile, nothing to do
    return;
  }

  let content;

  if (projectType === 'node') {
    content = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`;
  } else if (projectType === 'python') {
    // Determine entry point
    const files = await fsp.readdir(dirPath);
    const fileSet = new Set(files);
    const entryPoint = fileSet.has('app.py') ? 'app.py' : 'main.py';

    content = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt* ./
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi
COPY . .
EXPOSE 3000
CMD ["python", "${entryPoint}"]
`;
  } else if (projectType === 'static') {
    // Write a custom nginx config that listens on 3000
    const nginxConf = `server {
    listen 3000;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
`;
    await fsp.writeFile(path.join(dirPath, 'nginx.conf'), nginxConf);

    // `COPY . html` would otherwise publish secrets/VCS files from the archive.
    // Keep those out of the build context. NOTE: never list Dockerfile or
    // .dockerignore here — dockerode builds via the classic Engine API, which
    // applies .dockerignore to the Dockerfile lookup too, so self-excluding the
    // Dockerfile makes the daemon fail with "Cannot locate specified Dockerfile".
    // The build-helper files are instead removed from the web root below.
    const dockerignore = `.git\n.gitignore\n.env\n.env.*\nnode_modules\n`;
    await fsp.writeFile(path.join(dirPath, '.dockerignore'), dockerignore);

    // nginx-unprivileged runs rootless (uid 101) and never chowns system dirs,
    // so it starts cleanly under our hardening (CapDrop: ALL + no-new-privileges).
    // Stock nginx:alpine chowns /var/cache/nginx at startup, which needs CAP_CHOWN
    // and aborts ("Operation not permitted") once capabilities are dropped.
    // USER root only for the build steps; runtime stays as the non-root 101.
    content = `FROM nginxinc/nginx-unprivileged:alpine
USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
# Drop build-helper files from the served web root (they were needed for COPY).
RUN rm -f /usr/share/nginx/html/nginx.conf \\
          /usr/share/nginx/html/Dockerfile \\
          /usr/share/nginx/html/.dockerignore
USER 101
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
`;
  }

  await fsp.writeFile(path.join(dirPath, 'Dockerfile'), content);
}

module.exports = { extractZip, detectProjectType, generateDockerfile };
