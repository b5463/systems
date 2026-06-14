# SYSTEMS. — GitHub Auto-Deploy (V2)

> The webhook signature check is written and tested. The rest — deploying on
> push — is just a sketch so far and needs a real server. Off by default
> (`ENABLE_GITHUB_DEPLOYS=false`).

## Implemented (pure, tested) — `util/webhook.js`
- `verifySignature` — `X-Hub-Signature-256` HMAC-SHA256, constant-time compare
- `branchAllowed` — `refs/heads/<branch>` filter

## Still to do (needs a real server)
Repo connection model, webhook endpoint (rate-limited, signature-verified),
secret storage (masked), deploy-on-push → existing build pipeline, build logs +
events. Tokens never exposed; setup + deploys audited.

## Security
Admin-only setup; verify every webhook signature; reject unmatched branches;
rate-limit the endpoint; store `GITHUB_WEBHOOK_SECRET` as a secret.
