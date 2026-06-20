# SYSTEMS. — Roadmap

SYSTEMS. is currently at **2.0.0-rc.1**.

This roadmap is split by status:

- **Not done** contains remaining implementation, host-validation, and future-platform work.
- **Done** contains shipped work. Completed headings and items are struck through.
- A feature can be built and listed as done while its Windows-host validation remains separately listed as not done.

# Not done

## Windows-host validation

These paths are implemented but still require end-to-end validation on the real Windows host:

- Validate the **deploy_{slug}** container runtime with Caddy reaching mapped host ports through **SYSTEMS_APP_UPSTREAM_HOST**.
- Validate live Caddy configuration generation, validation, reload, public routing, automatic HTTPS, and certificate issuance.
- Validate public, password-protected, private, and bare-root-domain routes.
- Validate Node API and worker containers end to end.
- Validate custom Dockerfile builds with **ENABLE_DOCKERFILE_MODE**.
- Validate 2 GB chunked uploads with **ENABLE_LARGE_UPLOADS**.
- Validate per-system Postgres provisioning with **ENABLE_DB_PROVISIONING**.
- Validate GitHub deploy-on-push with **ENABLE_GITHUB_DEPLOYS**.
- Validate outbound webhook notifications with **ENABLE_NOTIFICATIONS**.
- Validate the in-dashboard shell console with its feature flag enabled.
- Run the full backup and non-production restore drill from [WINDOWS_VALIDATION_CHECKLIST.md](WINDOWS_VALIDATION_CHECKLIST.md).

## v2.5 — Finish and harden the single host

- Move safe administrator settings out of **.env** into audited, DB-backed editable settings.
- Add health and resource-pressure alert coverage beyond the existing disk, backup, Docker, and Postgres alerts.
- Polish gated features after host validation:
  - Show GitHub deploy status and delivery failures in the UI.
  - Format notifications for Slack, Discord, and email destinations.
  - Improve large-upload progress and recovery UX.
- Implement and test the dedicated, backed-up SQLite-to-Postgres control-plane migration runner.

## v3 — Beyond one box

- **Multi-node:** per-node Docker and Caddy, scheduler/placement, node health, and route distribution.
- **Zero-downtime deploys:** blue/green or rolling cutover gated on health checks.
- **Preview environments:** ephemeral branch and pull-request deployments.
- **Roles and SSO:** owner/admin/viewer roles plus OIDC/SSO.
- **Secrets management:** a dedicated per-system secrets store with rotation.
- **Build pipeline:** cache, selectable runtimes, and a build queue or farm.
- **Backups and disaster recovery at scale:** object storage, restore drills, and Postgres point-in-time recovery.
- **API and CLI:** scoped API tokens and a **systems** CLI for CI deployments.

# Done

## ~~V1.1 — Foundation / product shell~~ **Done**

- ~~Rebrand to SYSTEMS. with a monochrome-first operational design.~~ **Done.**
- ~~Responsive desktop sidebar and mobile navigation shell.~~ **Done.**
- ~~Systems, Ship, Events, Server, Admin, and System detail surfaces.~~ **Done.**
- ~~System detail tabs for Overview, Deployments, Logs, Metrics, Console, and Settings.~~ **Done.**
- ~~Status truth model with grouped primary, secondary, and danger actions.~~ **Done.**
- ~~Honest loading, empty, error, and unavailable states without fake data.~~ **Done.**
- ~~PWA branding, manifest, icons, and metadata.~~ **Done.**
- ~~Read-only server-status endpoint.~~ **Done.**
- ~~Initial documentation, security direction, and configuration skeletons.~~ **Done.**

## ~~V1.1.5 — Windows target and hardening baseline~~ **Done**

- ~~Windows-first .env, C:/ProgramData/SYSTEMS paths, and deployment documentation.~~ **Done.**
- ~~Windows setup, deploy, backup, restore, update, health, and firewall PowerShell scripts.~~ **Done.**
- ~~Default per-container memory, CPU, PID, restart, and log-rotation limits.~~ **Done.**
- ~~Server self-observability for uptime, disk, backups, and effective defaults.~~ **Done.**
- ~~Typed-slug confirmation for destructive deletion and backup-awareness messaging.~~ **Done.**

## ~~V1.2 — Working deployment platform~~ **Done**

- ~~Slug rules and reserved-name validation.~~ **Done.**
- ~~Reverse-proxy abstraction with nginx and Caddy route generators.~~ **Done.**
- ~~Public, password-protected, and private visibility modes.~~ **Done.**
- ~~Private systems publish no public route.~~ **Done.**
- ~~Real health and HTTPS checks with persisted results.~~ **Done.**
- ~~Delete versus purge semantics with typed confirmation for purge.~~ **Done.**
- ~~Deployment history retention and rollback image preservation.~~ **Done.**
- ~~Detected deployment type stored per system.~~ **Done.**
- ~~Caddy systems.d route files and automatic-HTTPS configuration.~~ **Done.**
- ~~Persisted editable system settings schema.~~ **Done.**
- ~~HttpOnly/SameSite cookie sessions, session-bound CSRF, strict Origin checks, rotation, and revocation.~~ **Done.**
- ~~Login backoff and persistent exact-IP/CIDR denylist.~~ **Done.**
- ~~Build timeouts, concurrent-build admission, and build resource ceilings.~~ **Done.**
- ~~SQLite control-plane database with documented Postgres migration design.~~ **Done.**

## ~~V1.5 — More runtimes~~ **Built**

- ~~Node API deployments.~~ **Built; host validation remains.**
- ~~Long-running worker and bot deployments.~~ **Built; host validation remains.**
- ~~Admin-only custom Dockerfile support behind ENABLE_DOCKERFILE_MODE.~~ **Built; host validation remains.**

## ~~V2 — Full deployment engine~~ **Built**

- ~~2 GB streaming and chunked uploads behind ENABLE_LARGE_UPLOADS.~~ **Built; host validation remains.**
- ~~Managed per-system Postgres databases behind ENABLE_DB_PROVISIONING.~~ **Built; host validation remains.**
- ~~GitHub push-to-deploy with HMAC verification behind ENABLE_GITHUB_DEPLOYS.~~ **Built; host validation remains.**
- ~~In-dashboard shell console behind its feature flag.~~ **Built; host validation remains.**
- ~~Outbound webhook notifications behind ENABLE_NOTIFICATIONS.~~ **Built; host validation remains.**
- ~~Manual in-app backups using an online SQLite snapshot and optional Caddy route copy.~~ **Done.**
- ~~Optional scheduled backups with ENABLE_BACKUP_SCHEDULER.~~ **Done.**
- ~~Container-state reconciliation on startup and on an interval.~~ **Done.**
- ~~Recovery of builds left stuck after a process restart.~~ **Done.**
- ~~Opt-in TOTP two-factor authentication and session revocation through token_version.~~ **Done.**
- ~~One primary system can serve the bare root domain.~~ **Done.**
- ~~Dry-run deployment planning through /api/deploy/plan.~~ **Done.**
- ~~Threshold alerts for disk, backup age, Docker, and Postgres state transitions.~~ **Done.**
- ~~Seven-day metrics history with 1h, 6h, 24h, and 7d views plus bounded server-side downsampling.~~ **Done.**
- ~~API assembly through buildApp() with route-level app.inject integration tests.~~ **Done.**
- ~~Generated pastel ribbon artwork for login and empty states.~~ **Done.**

## ~~2.0-rc — Reliability and security hardening~~ **Done**

- ~~Reconcile crashed containers and interrupted builds without stale running/building rows.~~ **Done.**
- ~~Merge environment-variable updates and support explicit removal without wiping omitted secrets.~~ **Done.**
- ~~Clear dangling container IDs after failed environment-triggered recreation.~~ **Done.**
- ~~Serialize deploy-port allocation.~~ **Done.**
- ~~Expire abandoned chunked-upload sessions and temporary files.~~ **Done.**
- ~~Validate basic-auth usernames before writing Caddy directives.~~ **Done.**
- ~~Use equal-time login behavior to avoid username enumeration.~~ **Done.**
- ~~Reject the default JWT secret in production.~~ **Done.**
- ~~Invalidate other sessions after password and 2FA changes.~~ **Done.**
- ~~Add indexes for hot project, deployment-history, statistics, session, and audit lookups.~~ **Done.**
- ~~Prune retained statistics history.~~ **Done.**
- ~~Harden responses with CSP, production HSTS, frame denial, nosniff, referrer, and permissions policies.~~ **Done.**
- ~~Add tamper-evident audit-log hash chaining and verification.~~ **Done.**

## ~~2.0-rc — UX and product polish~~ **Done**

- ~~Mobile bottom tab bar.~~ **Done.**
- ~~Keyboard shortcuts and ? help overlay.~~ **Done.**
- ~~Optimistic lifecycle actions with success and failure toasts.~~ **Done.**
- ~~Copy controls for secrets and identifiers.~~ **Done.**
- ~~Reusable confirmation dialogs with focus management.~~ **Done.**
- ~~Redeploy confirmation before replacing the running container.~~ **Done.**
- ~~Route transitions, Systems search, and sorting.~~ **Done.**
- ~~Clear Failed versus Crashed vocabulary.~~ **Done.**
- ~~Incident-recovery actions for logs, restart, redeploy, and rollback.~~ **Done.**
- ~~First-run onboarding and clearer Server setup/unmeasured framing.~~ **Done.**
- ~~Ship deployment-lifecycle rail clarified as a pipeline reference.~~ **Done.**
- ~~Truth-grid explanations and neutral-state legend behavior.~~ **Done.**
- ~~Purge colocated with Delete and clearly marked permanent.~~ **Done.**
- ~~Login first-run framing for ADMIN_USERS and closed signup.~~ **Done.**
- ~~Failed and Crashed cards paired with a next action.~~ **Done.**
- ~~Semantic section headings, associated form labels, reduced-motion handling, and 44 by 44 pixel touch targets.~~ **Done.**

## ~~2.0-rc — Maintainability and tooling~~ **Done**

- ~~Shared API helpers and frontend configuration/date/status utilities.~~ **Done.**
- ~~Shared upload-to-temporary-file helper.~~ **Done.**
- ~~System Settings extracted into its own component.~~ **Done.**
- ~~ESLint and Prettier configuration for API and dashboard packages.~~ **Done.**
- ~~Pure-logic unit tests and route-level integration tests.~~ **Done.**

## ~~v2.5 — Completed single-host work~~ **Done**

- ~~Cookie-session, CSRF, Origin, password-policy, proxy-trust, denylist, and response-header hardening.~~ **Done.**
- ~~Build timeout, concurrency, CPU, and memory enforcement.~~ **Done.**
- ~~Per-system CPU, memory, PID, restart-policy, log-rotation, and health-path overrides.~~ **Done.**
- ~~Safe cleanup of orphaned managed images and release directories without touching rollback targets.~~ **Done.**
- ~~Disk-cleanup preview and execution on the Server screen.~~ **Done.**
- ~~Longer metrics history with bounded response sizes.~~ **Done.**
- ~~Transition-only alert notifications instead of repeated alerts on every poll.~~ **Done.**
