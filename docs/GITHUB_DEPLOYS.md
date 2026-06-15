# SYSTEMS. — GitHub Auto-Deploy

Push-to-deploy is wired up and off by default (`ENABLE_GITHUB_DEPLOYS=false`).
It needs `GITHUB_WEBHOOK_SECRET`, plus `GITHUB_TOKEN` for private repos. This is
the riskiest flag in the project: a push pulls and builds external code on your
host. Turn it on only after you've validated it on the real server.

## How it works

`POST /api/webhook/github`:

- verifies the `X-Hub-Signature-256` HMAC over the raw request body using
  `GITHUB_WEBHOOK_SECRET`, with a constant-time compare
- handles `ping` and `push` events and ignores anything else
- looks up the system by its mapped repo (`owner/name`) and checks the push
  branch against the system's `deploy_branch`
- downloads the commit zipball from GitHub (using `GITHUB_TOKEN` for private
  repos)
- runs the normal redeploy pipeline, the same one a manual redeploy uses

## Connecting a repo

Map a system to a repo:

```
PATCH /api/projects/:slug/repo  { "repo": "owner/name", "branch": "main" }
```

## Security

Setup is admin-only, every webhook signature is verified, pushes to unmatched
branches are rejected, and both setup and deploys are audited. Since it pulls
and builds external code, keep it off until you've validated it on the host.

Code lives in `api/src/routes/webhook.js`, with the HMAC and branch helpers in
`api/src/util/webhook.js`.
