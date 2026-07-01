'use strict';

// V4 deploy mapping layer.
// Maps legacy project slugs to V4 system IDs and environment names for use
// in legacy deploy routes when ENABLE_V4_SYSTEMS=true.
//
// Phase 3 wire-up: once Alex delivers the new V4 systems/environments tables
// and the legacy_project_map table, replace the stub implementations here
// with real queries against those tables.

const { projectRepo } = require('../repo');

// Resolve a project slug to a V4 system ID.
// Phase 2.5 bridge: until legacy_project_map exists, the V4 system ID is
// derived from the project's numeric ID as a string.
async function resolveSystemId(slug) {
  const project = await projectRepo.findBySlug(slug);
  if (!project) return null;
  return { systemId: String(project.id), environment: 'production', projectId: project.id };
}

// Build the V4 metadata block to attach to legacy deploy responses.
// Returns null when slug cannot be resolved.
async function v4DeployMeta(slug) {
  const resolved = await resolveSystemId(slug);
  if (!resolved) return null;
  return {
    _v4: {
      systemId: resolved.systemId,
      environment: resolved.environment,
      source: 'v3-compat',
    },
  };
}

module.exports = { resolveSystemId, v4DeployMeta };
