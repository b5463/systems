# SYSTEMS. — Notifications (V2)

> Wired up, but off by default. A best-effort outbound webhook POST fires on
> deploy success/failure, redeploy, and when reconciliation flips a system to
> error. Nothing sends unless `ENABLE_NOTIFICATIONS=true` **and**
> `NOTIFY_WEBHOOK_URL` is set.

## Triggers
deploy succeeded · deploy failed · redeploy · reconciliation flipped a system to
error.

## Payload
A small JSON body is POSTed to `NOTIFY_WEBHOOK_URL`:

```json
{ "source": "SYSTEMS.", "site": "...", "kind": "...", "slug": "...", "detail": "...", "at": "..." }
```

Sending is best-effort — a failed POST is logged and never blocks a deploy.

## Channels
Generic webhook only for now (point it at your own receiver, Discord/Slack
relay, etc.). More channels can come later.

## Security
Admin-controlled via `.env`; the webhook URL is treated as config; failures are
logged, not retried aggressively. Kept intentionally small.

Code: `api/src/services/notify.js`, `api/src/util/notify.js`.
