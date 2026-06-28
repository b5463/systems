'use strict';

const { projectRepo } = require('../repo');

// Strip the basic-auth hash before any project row leaves the API. It's not
// plaintext, but a bcrypt hash should never be exposed to clients. Centralized
// so no route can forget it.
function pub(p) {
  if (p) {
    delete p.basic_hash;
    p.limits = {
      memoryMb: p.limit_memory_mb ?? null,
      cpuLimit: p.limit_cpu ?? null,
      pidsLimit: p.limit_pids ?? null,
      restartPolicy: p.limit_restart_policy || null,
      logMaxSize: p.limit_log_max_size || null,
      logMaxFile: p.limit_log_max_file ?? null,
      healthPath: p.health_path || '/',
    };
    delete p.limit_memory_mb;
    delete p.limit_cpu;
    delete p.limit_pids;
    delete p.limit_restart_policy;
    delete p.limit_log_max_size;
    delete p.limit_log_max_file;
    delete p.health_path;
    p.activeSlot = p.active_slot || 'blue';
    delete p.active_slot;
    delete p.port_blue;
    delete p.port_green;
    p.isPreview = !!p.is_preview;
    delete p.is_preview;
    p.sourceBranch = p.source_branch || null;
    delete p.source_branch;
    p.pullRequestNumber = p.pull_request_number || null;
    delete p.pull_request_number;
    p.previewExpiresAt = p.preview_expires_at || null;
    delete p.preview_expires_at;
    p.runtime = p.runtime || null;
    p.nodeId = p.node_id || null;
    delete p.node_id;
  }
  return p;
}

// Fetch a project by slug (full row).
async function getProject(slug) {
  return projectRepo.findBySlug(slug);
}

// Fetch a project or send a 404 and return null. Lets handlers do:
//   const project = await loadOr404(reply, slug); if (!project) return;
async function loadOr404(reply, slug) {
  const project = await getProject(slug);
  if (!project) { reply.code(404).send({ error: 'Project not found' }); return null; }
  return project;
}

module.exports = { pub, getProject, loadOr404 };
