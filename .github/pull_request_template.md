## What & why

<!-- What does this change, and why? Link any related issue. -->

## How it was tested

<!-- Commands run, scenarios covered. New behaviour should come with tests. -->

## Checklist

- [ ] `npm run lint` passes (api + dashboard as relevant)
- [ ] `npm test` and `npm run test:coverage` pass (api)
- [ ] `npm run build` passes (dashboard, if touched)
- [ ] Behaviour changes are covered by tests
- [ ] Docs updated (`README` / `docs/*` / an ADR if a design decision changed)
- [ ] No secrets, credentials, or real `.env` committed
- [ ] Security considered: auth, uploaded-code trust, proxy/routes, Docker access
- [ ] Risky capabilities stay behind an `ENABLE_*` flag, off by default
- [ ] Status stays honest (nothing reported live/healthy without verification)
