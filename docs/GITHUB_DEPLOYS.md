# SYSTEMS. — GitHub Auto-Deploy (V2)

> Status: **webhook signature verification implemented & unit-tested**; the
> deploy-on-push wiring is **scaffold / planned** and **host-validation
> required**. Off by default (`ENABLE_GITHUB_DEPLOYS=false`).

## Implemented (pure, tested) — `util/webhook.js`
- `verifySignature` — `X-Hub-Signature-256` HMAC-SHA256, constant-time compare
- `branchAllowed` — `refs/heads/<branch>` filter

## Planned / host-validated
Repo connection model, webhook endpoint (rate-limited, signature-verified),
secret storage (masked), deploy-on-push → existing build pipeline, build logs +
events. Tokens never exposed; setup + deploys audited.

## Security
Admin-only setup; verify every webhook signature; reject unmatched branches;
rate-limit the endpoint; store `GITHUB_WEBHOOK_SECRET` as a secret.
