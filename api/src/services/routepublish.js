'use strict';

// V4 Phase 4 — route publication transaction.
//
// Publishing a route is: mark pending → write the Caddy config → validate →
// reload → probe the live endpoint → mark active. Any failure reverts the
// status to 'failed' (never 'active') and records the reason; the previous
// route file is left untouched so a bad publish can't take a working route
// down. Every attempt is written to route_publication_attempts.
//
// Docker/Caddy/HTTP steps are injected so the whole flow is unit-tested without
// a host; production wires the real caddy + health modules via setDeps.

const { prisma } = require('../repo/client');
const routeRepo = require('../repo/routes');
const { canTransitionRoute } = require('./domainrouting');

let deps = null;
function realDeps() {
  return {
    caddy: require('./caddy'),
    health: require('./health'),
  };
}
function getDeps() { return deps || (deps = realDeps()); }
function setDeps(overrides) { deps = overrides ? { ...realDeps(), ...overrides } : null; }

// Update the environment's authoritative route_status (and keep the legacy
// route_published boolean mirrored) with a guard against illegal transitions.
async function setEnvRouteStatus(environmentId, from, to, error) {
  if (!canTransitionRoute(from, to)) {
    // Not fatal — a redundant transition just no-ops rather than corrupting
    // state; log to the caller via return.
    return { changed: false, from, to };
  }
  const data = { routeStatus: to, routeLastError: error || null };
  if (to === 'active') { data.routePublished = true; data.routeLastPublishedAt = new Date(); }
  if (to === 'failed' || to === 'inactive' || to === 'superseded') data.routePublished = false;
  // org-scope-exempt: PK of an environment the caller already resolved org-scoped
  await prisma.systemEnvironment.update({ where: { id: environmentId }, data });
  return { changed: true, from, to };
}

// Publish (or re-publish) the route for one environment↔domain pair.
// `renderOpts` is passed to caddy.writeRoute (slug, port, visibility, basicUser,
// basicHash, apex, canonicalHost, maintenance).
async function publishRoute({ organisationId, system, environment, domain, renderOpts }) {
  const d = getDeps();
  const systemId = system.id;
  const environmentId = environment.id;
  const domainId = domain ? domain.id : null;
  const from = environment.routeStatus || 'inactive';

  const fail = async (reason) => {
    await setEnvRouteStatus(environmentId, 'pending', 'failed', reason);
    if (domainId) await routeRepo.upsertRoute(organisationId, { systemId, environmentId, domainId, routeStatus: 'failed', lastError: reason });
    await routeRepo.recordAttempt(organisationId, { systemId, environmentId, domainId, status: 'failed', error: reason });
    return { ok: false, status: 'failed', error: reason };
  };

  // 1. pending
  await setEnvRouteStatus(environmentId, from, 'pending');
  if (domainId) await routeRepo.upsertRoute(organisationId, { systemId, environmentId, domainId, routeStatus: 'pending' });

  // 2. write config
  let written;
  try {
    written = await d.caddy.writeRoute(renderOpts);
  } catch (err) {
    return fail(`config_write_failed: ${err.message}`);
  }

  // A private/removed route has no file to validate/probe — it's inactive.
  if (written && written.written === false) {
    await setEnvRouteStatus(environmentId, 'pending', 'inactive');
    if (domainId) await routeRepo.upsertRoute(organisationId, { systemId, environmentId, domainId, routeStatus: 'inactive' });
    await routeRepo.recordAttempt(organisationId, { systemId, environmentId, domainId, status: 'inactive' });
    return { ok: true, status: 'inactive' };
  }

  // 3. validate
  const valid = await d.caddy.validate();
  if (!valid.ok && valid.reason !== 'caddy_not_found') {
    return fail(`validate_failed: ${valid.reason || 'invalid_config'}`);
  }

  // 4. reload
  const reloaded = await d.caddy.reload();
  if (!reloaded.ok && reloaded.reason !== 'caddy_not_found') {
    return fail(`reload_failed: ${reloaded.reason || 'reload_failed'}`);
  }

  // 5. probe — never mark active until the endpoint answers. Skipped only when
  // there's no port to probe (e.g. a maintenance-only route).
  if (renderOpts && renderOpts.port) {
    try {
      await d.health.waitForHealthy(d.health.targetForPort(renderOpts.port), (renderOpts.healthPath) || '/');
    } catch (err) {
      return fail(`probe_failed: ${err.message}`);
    }
  }

  // 6. active
  await setEnvRouteStatus(environmentId, 'pending', 'active');
  if (domainId) await routeRepo.upsertRoute(organisationId, { systemId, environmentId, domainId, routeStatus: 'active' });
  await routeRepo.recordAttempt(organisationId, { systemId, environmentId, domainId, status: 'active' });
  return { ok: true, status: 'active' };
}

module.exports = { publishRoute, setEnvRouteStatus, setDeps };
