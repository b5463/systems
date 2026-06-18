# SYSTEMS. — Notifications

SYSTEMS. can fire a best-effort outbound webhook on deploy events. It's wired up
and off by default. Nothing sends unless `ENABLE_NOTIFICATIONS=true` and
`NOTIFY_WEBHOOK_URL` is set.

## Triggers

| `kind` | When |
|---|---|
| `deploy` | Deploy completed successfully |
| `deploy_failed` | Deploy failed |
| `redeploy` | Redeploy completed |
| `system_error` | Reconciler flipped a system to error (container died / build stuck) |
| `alert_raised` | Infrastructure threshold crossed for the first time (disk full, backup overdue, Docker down) |
| `test` | Manual test from the Server screen |

Alert notifications use transition-based firing: a `disk_critical` alert fires
once when the threshold is first crossed, not on every reconcile cycle. It does
not re-fire until the condition clears and raises again.

## Payload

A small JSON body is POSTed to `NOTIFY_WEBHOOK_URL`:

```json
{ "source": "SYSTEMS.", "site": "...", "kind": "...", "slug": "...", "detail": "...", "at": "..." }
```

Sending is best-effort. A failed POST is logged and never blocks a deploy.

## Testing it

The Server screen has a "send test" button, which hits
`POST /api/server/notify-test`. Use it to confirm your receiver works.

## Channels

Generic webhook only for now. Point it at your own receiver, a Discord or Slack
relay, whatever you like. More channels can come later.

## Security

It's admin-controlled via `.env`, the webhook URL is treated as config, and
failures are logged rather than retried aggressively. Kept intentionally small.

Code lives in `api/src/services/notify.js` and `api/src/util/notify.js`.
