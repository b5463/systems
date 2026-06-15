# SYSTEMS. — Notifications

SYSTEMS. can fire a best-effort outbound webhook on deploy events. It's wired up
and off by default. Nothing sends unless `ENABLE_NOTIFICATIONS=true` and
`NOTIFY_WEBHOOK_URL` is set.

## Triggers

A POST fires when a deploy succeeds, a deploy fails, a redeploy happens, or
reconciliation flips a system to error.

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
