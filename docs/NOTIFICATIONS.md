# SYSTEMS. — Notifications (V2)

> Status: **planned / scaffold**. Off by default (`ENABLE_NOTIFICATIONS=false`).
> Not implemented live — do not assume alerts are sent.

## Planned triggers
deploy failed · health check failed · health recovered · disk low · DB backup
failed · SYSTEMS. backup failed.

## Planned channels
email / generic webhook first; Discord/Slack later.

## Security (when built)
Admin-only config; secrets masked; a "send test notification" action; failure
logging; rate limiting. Kept intentionally small.
