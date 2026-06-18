# Contributing to SYSTEMS.

Thanks for taking a look. This is a small, opinionated, single-host deployment
engine — contributions that keep it focused and honest are very welcome.

## Local setup

```bash
# API (full functionality needs a Docker socket)
cp .env.example .env            # set JWT_SECRET, ENV_SECRET, ADMIN_USERS
cd api && npm install && npm run dev      # http://localhost:3000

# Dashboard
cd dashboard && npm install && npm run dev   # proxies /api to :3000
```

## Before you open a PR

Everything below runs in CI on every push and pull request — run it locally
first so the loop is fast:

```bash
# API
cd api
npm run lint
npm test
npm run test:coverage     # enforces a coverage floor on src/util/*

# Dashboard
cd dashboard
npm run lint
npm run build
```

CI also runs `npm audit --audit-level=high` and a Playwright e2e smoke suite
(`dashboard/e2e/`). To run the e2e suite locally:

```bash
cd dashboard
npm i -D @playwright/test && npx playwright install chromium
npx playwright test --config=e2e/playwright.config.mjs
```

## Standards

- **Tests with behaviour changes.** Pure logic goes in `api/src/util/*` with a
  matching `api/test/*.test.js` (`node:test`); that's what the coverage gate
  measures. Routes/services are covered by `app.inject()` integration tests.
- **Keep status honest.** Never report a component as healthy/live unless it has
  actually been verified — see [ADR-0004](docs/adr/0004-honest-status-reconciliation.md).
- **Risky capabilities stay off by default** behind an `ENABLE_*` flag — see
  [ADR-0005](docs/adr/0005-risky-features-off-by-default.md).
- **Lint must pass** (ESLint for both packages; Prettier for the dashboard).
- Keep modules small and single-purpose; match the style of the file you're in.

## Security

- Never commit secrets or a real `.env`. Treat uploaded/deployed code as
  untrusted. See [`docs/SECURITY.md`](docs/SECURITY.md).
- Report a security issue privately to the maintainer rather than opening a
  public issue.

## Decisions

Significant design choices are recorded as ADRs in [`docs/adr/`](docs/adr/README.md).
If your change reverses or extends one, add or update a record.
