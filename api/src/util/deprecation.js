'use strict';

// V4 Phase 0.5 — deprecation header helper.
//
// Ready to apply to legacy routes once their V4 replacements exist (do NOT
// apply before then — the roadmap keeps legacy APIs first-class until the V4
// surface is stable). Emits the standard trio:
//
//   Deprecation: true                       (RFC 9745)
//   Link: <successor>; rel="successor-version"
//   Sunset: <http-date>                     (RFC 8594, only when a date is set)
//
// Usage, once a replacement is live:
//   const { deprecated } = require('../util/deprecation');
//   fastify.get('/api/projects', { onSend: deprecated({ successor: '/api/systems' }) }, ...)

function applyDeprecation(reply, { successor, sunset } = {}) {
  reply.header('Deprecation', 'true');
  if (successor) reply.header('Link', `<${successor}>; rel="successor-version"`);
  if (sunset) {
    const date = sunset instanceof Date ? sunset : new Date(sunset);
    if (!Number.isNaN(date.getTime())) reply.header('Sunset', date.toUTCString());
  }
  return reply;
}

// Fastify onSend-hook form, for attaching per-route without touching handlers.
function deprecated(opts = {}) {
  return async function onSend(request, reply, payload) {
    applyDeprecation(reply, opts);
    return payload;
  };
}

module.exports = { applyDeprecation, deprecated };
