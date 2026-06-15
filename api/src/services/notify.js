'use strict';

const { shouldSend, buildPayload } = require('../util/notify');

// Best-effort outbound notification. Never throws, never blocks a request path.
// Posts a small JSON payload to NOTIFY_WEBHOOK_URL when notifications are
// enabled. Compatible with Slack/Discord/generic webhook receivers.
async function send(event) {
  if (!shouldSend()) return { sent: false, reason: 'disabled' };
  const url = process.env.NOTIFY_WEBHOOK_URL;
  const payload = buildPayload(event);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { send };
