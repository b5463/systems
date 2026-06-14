# SYSTEMS. — Notifications (V2)

> This isn't built yet — it's a plan. Off by default
> (`ENABLE_NOTIFICATIONS=false`). Nothing sends alerts right now.

## Planned triggers
deploy failed · health check failed · health recovered · disk low · DB backup
failed · SYSTEMS. backup failed.

## Planned channels
email / generic webhook first; Discord/Slack later.

## Security (when built)
Admin-only config; secrets masked; a "send test notification" action; failure
logging; rate limiting. Kept intentionally small.
