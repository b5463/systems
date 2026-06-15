# SYSTEMS. — GitHub Auto-Deploy (V2)

> Wired up, but gated and off by default (`ENABLE_GITHUB_DEPLOYS=false`).
> This is the riskiest flag: a push pulls and builds external code on the host,
> so enable it only after host validation.

## How it works
`POST /api/webhook/github`:

- verifies the `X-Hub-Signature-256` HMAC over the **raw** request body using
  `GITHUB_WEBHOOK_SECRET` (constant-time compare),
- handles `ping` and `push` events (anything else is ignored),
- looks up the system by its mapped repo (`owner/name`) and checks the push
  branch against the system's `deploy_branch`,
- downloads the commit zipball from GitHub (using `GITHUB_TOKEN` for private
  repos),
- runs the normal redeploy pipeline (same as a manual redeploy).

## Connecting a repo
Map a system to a repo with:

```
PATCH /api/projects/:slug/repo  { "repo": "owner/name", "branch": "main" }
```

## Security
Admin-only setup; every webhook signature is verified; pushes to unmatched
branches are rejected; setup and deploys are audited. Because it pulls and
builds external code, it is host-validated and the riskiest of the V2 flags —
keep it off until you've validated it on the host.

Code: `api/src/routes/webhook.js` (HMAC + branch helpers in
`api/src/util/webhook.js`).
