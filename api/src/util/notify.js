'use strict';

const { features } = require('./flags');

// Pure helpers for outbound notifications. Deciding *whether* to send and
// *what* to send is testable here; the actual HTTP POST lives in
// services/notify.js. Notifications are a V2 feature: OFF unless
// ENABLE_NOTIFICATIONS=true AND a NOTIFY_WEBHOOK_URL is configured.

function shouldSend(env = process.env) {
  return !!(features(env).notifications && env.NOTIFY_WEBHOOK_URL);
}

function buildPayload(event = {}, env = process.env) {
  return {
    source: 'SYSTEMS.',
    site: env.BASE_DOMAIN || null,
    kind: event.kind || 'event',
    slug: event.slug || null,
    detail: event.detail || null,
    at: new Date().toISOString(),
  };
}

module.exports = { shouldSend, buildPayload };
