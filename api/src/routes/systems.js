'use strict';

const { projectRepo } = require('../repo');
const { features } = require('../util/flags');
const { parsePagination, paginationEnvelope } = require('../util/pagination');
const { projectToSystem, projectToEnv, deployHistoryToRelease, findSystemInProjects } = require('../util/v4systems');

function v4Disabled(reply) {
  return reply.code(404).send({ error: 'V4 systems API not enabled', hint: 'Set ENABLE_V4_SYSTEMS=true' });
}

async function systemsRoutes(fastify) {
  fastify.get('/api/systems', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().v4Systems) return v4Disabled(reply);
    const all = await projectRepo.listAll();
    const systems = all.map(projectToSystem);
    const pg = parsePagination(request.query || {});
    const slice = systems.slice(pg.offset, pg.offset + pg.perPage);
    const { pagination } = paginationEnvelope(slice, systems.length, pg);
    return { systems: slice, pagination };
  });

  fastify.get('/api/systems/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().v4Systems) return v4Disabled(reply);
    const all = await projectRepo.listAll();
    const project = findSystemInProjects(all, request.params.id);
    if (!project) return reply.code(404).send({ error: 'System not found' });
    return { system: projectToSystem(project) };
  });

  fastify.get('/api/systems/:id/environments', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().v4Systems) return v4Disabled(reply);
    const all = await projectRepo.listAll();
    const project = findSystemInProjects(all, request.params.id);
    if (!project) return reply.code(404).send({ error: 'System not found' });
    return { environments: [projectToEnv(project)] };
  });

  fastify.get('/api/systems/:id/releases', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().v4Systems) return v4Disabled(reply);
    const all = await projectRepo.listAll();
    const project = findSystemInProjects(all, request.params.id);
    if (!project) return reply.code(404).send({ error: 'System not found' });
    const history = await projectRepo.getDeployHistory(project.id, 20);
    const systemId = String(project.id);
    return { releases: history.map((r) => deployHistoryToRelease(r, systemId)) };
  });
}

module.exports = systemsRoutes;
