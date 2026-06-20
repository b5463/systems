'use strict';

const { features } = require('./flags');

function shouldSend(env = process.env) {
  return !!(features(env).notifications && env.NOTIFY_WEBHOOK_URL);
}

function normalizedEvent(event = {}, env = process.env) {
  return {
    source: 'SYSTEMS.',
    site: env.BASE_DOMAIN || null,
    kind: event.kind || 'event',
    slug: event.slug || null,
    detail: event.detail || null,
    severity: event.severity || (String(event.kind || '').includes('failed') ? 'critical' : 'info'),
    at: new Date().toISOString(),
  };
}

function summary(e) {
  return [e.kind.replaceAll('_', ' '), e.slug, e.detail].filter(Boolean).join(' · ');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function buildPayload(event = {}, env = process.env) {
  const e = normalizedEvent(event, env);
  const format = String(env.NOTIFY_FORMAT || 'generic').toLowerCase();
  if (format === 'slack') {
    return {
      text: summary(e),
      attachments: [{
        color: e.severity === 'critical' ? '#d64545' : e.severity === 'warning' ? '#d6a23c' : '#45c267',
        fields: [
          { title: 'System', value: e.slug || 'platform', short: true },
          { title: 'Event', value: e.kind, short: true },
          { title: 'Detail', value: e.detail || '—', short: false },
        ],
        footer: e.site || 'SYSTEMS.',
        ts: Math.floor(Date.parse(e.at) / 1000),
      }],
    };
  }
  if (format === 'discord') {
    return {
      username: 'SYSTEMS.',
      embeds: [{
        title: e.kind.replaceAll('_', ' '),
        description: e.detail || 'No additional detail.',
        color: e.severity === 'critical' ? 14042437 : e.severity === 'warning' ? 14066236 : 4571751,
        fields: [{ name: 'System', value: e.slug || 'platform', inline: true }],
        timestamp: e.at,
        footer: { text: e.site || 'SYSTEMS.' },
      }],
    };
  }
  if (format === 'email') {
    const title = '[SYSTEMS.] ' + e.kind.replaceAll('_', ' ');
    const text = summary(e) + '\nTime: ' + e.at + (e.site ? '\nSite: ' + e.site : '');
    return {
      subject: title,
      text,
      html: '<strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(text).replaceAll('\n', '<br>') + '</p>',
    };
  }
  return e;
}

module.exports = { shouldSend, buildPayload, normalizedEvent };
