'use strict';

// V3→V4 bridge adapter.
// Until Phase 2 tables (systems, products, system_environments, releases,
// legacy_project_map) are available, the V4 read APIs are served by adapting
// existing Project rows to the V4 shape. Replace these adapters with direct
// V4 table queries once Alex delivers Phase 2 tables.

function projectToSystem(p) {
  if (!p) return null;
  return {
    id: String(p.id),
    slug: p.slug,
    name: p.name,
    status: p.status || 'unknown',
    type: p.deploy_type || 'container',
    visibility: p.visibility || 'private',
    productId: null,
    organisationId: null,
    repo: p.repo || null,
    isPreview: !!p.is_preview,
    nodeId: p.node_id ? String(p.node_id) : null,
    health: {
      state: p.health_state || null,
      status: p.health_status != null ? Number(p.health_status) : null,
    },
    createdAt: p.created_at || null,
    updatedAt: p.updated_at || null,
    _source: 'v3-compat',
  };
}

function projectToEnv(p) {
  if (!p) return null;
  return {
    id: `${p.id}:production`,
    systemId: String(p.id),
    environment: 'production',
    status: p.status || 'unknown',
    routeStatus: p.route_published ? 'active' : 'inactive',
    containerId: p.container_id || null,
    port: p.port_blue || p.port || null,
    activeSlot: p.active_slot || 'blue',
    createdAt: p.created_at || null,
    updatedAt: p.updated_at || null,
    _source: 'v3-compat',
  };
}

function deployHistoryToRelease(row, systemId) {
  return {
    id: String(row.id),
    systemId,
    environment: 'production',
    imageId: row.image_id || null,
    containerId: row.container_id || null,
    deployedAt: row.deployed_at || null,
    _source: 'v3-compat',
  };
}

// Resolve a system by numeric id string or slug from an array of projects.
function findSystemInProjects(projects, idOrSlug) {
  const asNumber = Number(idOrSlug);
  if (!Number.isNaN(asNumber) && String(asNumber) === String(idOrSlug)) {
    return projects.find((p) => p.id === asNumber) || null;
  }
  return projects.find((p) => p.slug === idOrSlug) || null;
}

module.exports = { projectToSystem, projectToEnv, deployHistoryToRelease, findSystemInProjects };
