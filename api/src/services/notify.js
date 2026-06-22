'use strict';

const { shouldSend, buildPayload } = require('../util/notify');
const { retry } = require('../util/retry');
const { getSetting } = require('../util/settings');

// Best-effort outbound notification. Never throws, never blocks a request path.
// Posts a small JSON payload to NOTIFY_WEBHOOK_URL when notifications are
// enabled. Compatible with Slack/Discord/generic webhook receivers.
//
// Transient failures (network errors, 5xx, 429) are retried a couple of times
// with exponential backoff; a 4xx is treated as permanent and not retried.
async function send(event) {
  if (!shouldSend()) return { sent: false, reason: 'disabled' };
  const url = process.env.NOTIFY_WEBHOOK_URL;
  const payload = buildPayload(event, { ...process.env, NOTIFY_FORMAT: await getSetting('notificationFormat') });
  try {
    await retry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (res.status >= 500 || res.status === 429) {
          throw new Error(`webhook responded ${res.status}`);
        }
        return res;
      } finally {
        clearTimeout(timer);
      }
    }, { retries: 2, baseMs: 300, maxMs: 3000 });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

module.exports = { send };
