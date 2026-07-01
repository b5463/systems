'use strict';

const { features } = require('../util/flags');
const { parsePagination, paginationEnvelope } = require('../util/pagination');

function v4Disabled(reply) {
  return reply.code(404).send({ error: 'V4 products API not enabled', hint: 'Set ENABLE_V4_SYSTEMS=true' });
}

async function productsRoutes(fastify) {
  fastify.get('/api/products', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().v4Systems) return v4Disabled(reply);
    // Phase 2: read from products table once Alex delivers V4 tables.
    // Products have no V3 equivalent so the list is empty until then.
    const pg = parsePagination(request.query || {});
    const { pagination } = paginationEnvelope([], 0, pg);
    return { products: [], pagination };
  });

  fastify.get('/api/products/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().v4Systems) return v4Disabled(reply);
    // Phase 2: read from products table once Alex delivers V4 tables.
    return reply.code(404).send({ error: 'Product not found' });
  });
}

module.exports = productsRoutes;
