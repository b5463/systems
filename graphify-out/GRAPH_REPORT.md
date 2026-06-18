# Graph Report - C:\Users\AlexanderMoravcik\Desktop\ACR - Rework\systems  (2026-06-18)

## Corpus Check
- 140 files · ~294,760 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1001 nodes · 1301 edges · 110 communities (74 shown, 36 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 174 edges (avg confidence: 0.84)
- Token cost: 578,018 input · 385,345 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Dashboard Frontend Core|Dashboard Frontend Core]]
- [[_COMMUNITY_Slug, DB-Provision & E2E Tooling|Slug, DB-Provision & E2E Tooling]]
- [[_COMMUNITY_Architecture & Design Rationale|Architecture & Design Rationale]]
- [[_COMMUNITY_Deploy Build Pipeline|Deploy Build Pipeline]]
- [[_COMMUNITY_Chunked Upload & Sessions|Chunked Upload & Sessions]]
- [[_COMMUNITY_CI, Compose & Security Hardening|CI, Compose & Security Hardening]]
- [[_COMMUNITY_Auth, Audit & Database Core|Auth, Audit & Database Core]]
- [[_COMMUNITY_Dashboard Dependencies|Dashboard Dependencies]]
- [[_COMMUNITY_API Dependencies|API Dependencies]]
- [[_COMMUNITY_Projects & Health Checks|Projects & Health Checks]]
- [[_COMMUNITY_Admin User Management UI|Admin User Management UI]]
- [[_COMMUNITY_System Detail & Lifecycle UI|System Detail & Lifecycle UI]]
- [[_COMMUNITY_API Bootstrap & Integration|API Bootstrap & Integration]]
- [[_COMMUNITY_Container Logs & Docker|Container Logs & Docker]]
- [[_COMMUNITY_User & Audit Persistence|User & Audit Persistence]]
- [[_COMMUNITY_TOTP  2FA|TOTP / 2FA]]
- [[_COMMUNITY_API Client & WebSocket|API Client & WebSocket]]
- [[_COMMUNITY_Container Reconciliation|Container Reconciliation]]
- [[_COMMUNITY_NginxCaddy Proxy Routing|Nginx/Caddy Proxy Routing]]
- [[_COMMUNITY_Caddy & Postgres Provisioning|Caddy & Postgres Provisioning]]
- [[_COMMUNITY_Windows Ops Scripts|Windows Ops Scripts]]
- [[_COMMUNITY_Env Var Encryption|Env Var Encryption]]
- [[_COMMUNITY_GitHub Webhook Deploys|GitHub Webhook Deploys]]
- [[_COMMUNITY_Backup Service|Backup Service]]
- [[_COMMUNITY_Windows Common Helpers|Windows Common Helpers]]
- [[_COMMUNITY_Brand Identity Assets|Brand Identity Assets]]
- [[_COMMUNITY_Validation Utils & Tests|Validation Utils & Tests]]
- [[_COMMUNITY_Server Info & Host Metrics|Server Info & Host Metrics]]
- [[_COMMUNITY_Background Service Workers|Background Service Workers]]
- [[_COMMUNITY_Server View UI|Server View UI]]
- [[_COMMUNITY_Ship  Deploy UI|Ship / Deploy UI]]
- [[_COMMUNITY_Stats & Project Loader|Stats & Project Loader]]
- [[_COMMUNITY_Notifications & Feature Flags|Notifications & Feature Flags]]
- [[_COMMUNITY_Stats Charts UI|Stats Charts UI]]
- [[_COMMUNITY_Container Resource Limits|Container Resource Limits]]
- [[_COMMUNITY_Ribbon Art Generator|Ribbon Art Generator]]
- [[_COMMUNITY_App Shell & Navigation|App Shell & Navigation]]
- [[_COMMUNITY_BackupNotify Tests|Backup/Notify Tests]]
- [[_COMMUNITY_Toast Notifications|Toast Notifications]]
- [[_COMMUNITY_App & TOTP Test Harness|App & TOTP Test Harness]]
- [[_COMMUNITY_HMAC & TOTP Primitives|HMAC & TOTP Primitives]]
- [[_COMMUNITY_Container Exec Route|Container Exec Route]]
- [[_COMMUNITY_Slug Validation|Slug Validation]]
- [[_COMMUNITY_Confirm Dialog|Confirm Dialog]]
- [[_COMMUNITY_System Settings UI|System Settings UI]]
- [[_COMMUNITY_Backup & Notify Utils|Backup & Notify Utils]]
- [[_COMMUNITY_DomainURL Config|Domain/URL Config]]
- [[_COMMUNITY_Feature Flag Helpers|Feature Flag Helpers]]
- [[_COMMUNITY_Path Safety Guards|Path Safety Guards]]
- [[_COMMUNITY_Project Type Classifier|Project Type Classifier]]
- [[_COMMUNITY_Secret Generation|Secret Generation]]
- [[_COMMUNITY_Upload Validation|Upload Validation]]
- [[_COMMUNITY_globals|globals]]
- [[_COMMUNITY_backupStamp|backupStamp]]
- [[_COMMUNITY_demuxStream|demuxStream]]
- [[_COMMUNITY_createDemuxer|createDemuxer]]
- [[_COMMUNITY_Env Crypto Test Suite|Env Crypto Test Suite]]
- [[_COMMUNITY_Health Check Test Suite|Health Check Test Suite]]
- [[_COMMUNITY_Container Limits Test Suite|Container Limits Test Suite]]
- [[_COMMUNITY_getProject|getProject]]
- [[_COMMUNITY_Proxy Kind Test Suite|Proxy Kind Test Suite]]
- [[_COMMUNITY_desiredStatus|desiredStatus]]
- [[_COMMUNITY_Thresholds Test Suite|Thresholds Test Suite]]
- [[_COMMUNITY_Reconcile Status Test Suite|Reconcile Status Test Suite]]
- [[_COMMUNITY_buildImage|buildImage]]
- [[_COMMUNITY_findFreePort|findFreePort]]
- [[_COMMUNITY_getContainerStats|getContainerStats]]
- [[_COMMUNITY_execContainer|execContainer]]
- [[_COMMUNITY_extractZip|extractZip]]
- [[_COMMUNITY_backupsToPrune|backupsToPrune]]
- [[_COMMUNITY_databaseUrl|databaseUrl]]
- [[_COMMUNITY_maskUrl|maskUrl]]
- [[_COMMUNITY_provisionPlan|provisionPlan]]
- [[_COMMUNITY_containerLimits|containerLimits]]
- [[_COMMUNITY_pub|pub]]
- [[_COMMUNITY_diskTone|diskTone]]
- [[_COMMUNITY_confirmMatches|confirmMatches]]
- [[_COMMUNITY_otpauthURL|otpauthURL]]
- [[_COMMUNITY_progressState|progressState]]
- [[_COMMUNITY_branchAllowed|branchAllowed]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_FlowField|FlowField]]
- [[_COMMUNITY_StatsCharts|StatsCharts]]
- [[_COMMUNITY_StatusBadge|StatusBadge]]
- [[_COMMUNITY_Write-Systems Status Helpers|Write-Systems Status Helpers]]
- [[_COMMUNITY_FUNDING Config (GitHub Sponsors)|FUNDING Config (GitHub Sponsors)]]

## God Nodes (most connected - your core abstractions)
1. `SYSTEMS. (Deployment Engine)` - 20 edges
2. `Systems View` - 17 edges
3. `db` - 15 edges
4. `SystemDetail View` - 15 edges
5. `auditLog()` - 14 edges
6. `Ship View` - 12 edges
7. `features()` - 11 edges
8. `REST API Client` - 11 edges
9. `shots Screenshot Script` - 11 edges
10. `Architecture & Data Model` - 11 edges

## Surprising Connections (you probably didn't know these)
- `System Detail View` --conceptually_related_to--> `Systems View`  [INFERRED]
  docs/assets/screenshots/system.png → dashboard/src/views/Systems.vue
- `acronym-certbot Service` --semantically_similar_to--> `Windows Deployment (canonical)`  [INFERRED] [semantically similar]
  docker-compose.yml → docs/WINDOWS_DEPLOYMENT.md
- `Deploy GIF (Ship Flow Animation)` --references--> `Ship View`  [INFERRED]
  docs/assets/screenshots/deploy.gif → dashboard/src/views/Ship.vue
- `Ship View` --conceptually_related_to--> `SYSTEMS App (Self-host Deployment Dashboard)`  [INFERRED]
  dashboard/src/views/Ship.vue → docs/assets/screenshots/dashboard.png
- `Safe-By-Default Config` --semantically_similar_to--> `Opt-In Feature Flags`  [INFERRED] [semantically similar]
  docs/HARDENING.md → README.md

## Hyperedges (group relationships)
- **Deploy/redeploy build pipeline flow** — deploy_beginDeploy, deploy_runBuildPipeline, deploy_beginRedeploy, deploy_runRedeployPipeline, upload_uploadRoutes, webhook_webhookRoutes [INFERRED 0.85]
- **JWT + token_version session invalidation** — app_authenticate, auth_signToken, auth_authRoutes, admin_adminRoutes, db_table_users [INFERRED 0.85]
- **Audit log writers across routes** — db_auditLog, admin_adminRoutes, auth_authRoutes, deploy_runBuildPipeline, projects_projectsRoutes, env_envRoutes [INFERRED 0.75]
- **Reverse-proxy abstraction (Caddy/nginx)** — proxy_publishRoute, caddy_writeRoute, nginx_addProjectRoute [INFERRED 0.85]
- **ZIP-to-container deploy pipeline** — zip_extractZip, zip_detectProjectType, zip_generateDockerfile, docker_buildImage, docker_runContainer [INFERRED 0.75]
- **Background scheduler services** — backup_start, reconcile_start, health_checkSystem [INFERRED 0.65]
- **Path traversal / zip-slip guards** — pathsafe_safeResolve, pathsafe_isWithin, upload_uploadTempPath [INFERRED 0.85]
- **Slug validation as security boundary** — slug_isValidSlug, slug_slugError, dbprovision_dbName, dbprovision_dbUser [INFERRED 0.75]
- **HMAC constant-time secret verification** — totp_verify, webhook_verifySignature, dbprovision_genPassword [INFERRED 0.65]
- **Input validation / injection-guard test concerns** — pathsafetest_suite, slugtest_suite, caddytest_suite, v2test_suite [INFERRED 0.75]
- **Authentication & secret-handling tests** — totptest_suite, envcryptotest_suite, integrationtest_suite [INFERRED 0.75]
- **Auth Token Propagation Flow** — auth_store, client_api, ws_helper, router_index [INFERRED 0.85]
- **App Bootstrap & Shell** — main_bootstrap, app_root, router_index, auth_store [INFERRED 0.75]
- **Xterm WebSocket terminal streams** — execterminal_execterminal, logconsole_logconsole, ws_openws [INFERRED 0.85]
- **Toast notification flow** — copybutton_copybutton, toast_toast, usetoast_usetoast [INFERRED 0.85]
- **App shell navigation surface** — appshell_appshell, navicon_navicon, systemslogo_systemslogo, keyboardshortcuts_keyboardshortcuts [INFERRED 0.85]
- **System deploy lifecycle flow** — ship_view, systems_view, systemdetail_view, ep_deploy, ep_projects [INFERRED 0.85]
- **Authentication and 2FA flow** — login_view, admin_view, auth_store, ep_auth_2fa [INFERRED 0.75]
- **Server health and status surfacing** — server_view, systems_view, ep_server_info [INFERRED 0.75]
- **SYSTEMS Windows Operational Lifecycle** — setup-windows_script, deploy-systems-windows_script, update-systems-windows_script, backup-systems-windows_script, restore-systems-windows_script [INFERRED 0.85]
- **Read-only Security/Health Audit Scripts** — check-systems-health-windows_script, check-firewall-windows_script, verify-hardening-windows_script [INFERRED 0.75]
- **Shared Helper Dot-Sourcing** — backup-systems-windows_script, restore-systems-windows_script, deploy-systems-windows_script, update-systems-windows_script, setup-windows_script, check-systems-health-windows_script, check-firewall-windows_script, verify-hardening-windows_script [INFERRED 0.95]
- **Opt-In Risky Features (Off By Default)** — readme_opt_in_flags, dockerfile_mode_untrusted, github_deploys_webhook, large_uploads_doc, databases_doc, notifications_doc [INFERRED 0.85]
- **Zip-To-Live Deploy Pipeline** — deployment_build_detection, deployment_zip_slip_guard, deployment_hardened_container, architecture_routing_model, deployment_redeploy_rollback [INFERRED 0.85]
- **Backup & Recovery Chain** — backups_in_app, backups_ps_scripts, disaster_recovery_doc, backups_env_excluded [INFERRED 0.85]
- **Windows Host Validation & Deployment** — windowsdeployment_doc, windowsvalidationchecklist_doc, serverdeploymentguide_powershell_scripts, windowsdeployment_caddy_networking [INFERRED 0.85]
- **Off-by-Default Feature Flag Security Posture** — security_optional_feature_flags, v2roadmap_feature_flag_posture, shellconsole_exec_endpoint, security_github_webhook_hmac [INFERRED 0.75]
- **Dev Compose Stack Services** — dockercompose_acronym_nginx, dockercompose_acronym_api, dockercompose_acronym_certbot [INFERRED 0.85]
- **SYSTEMS Wordmark Variants** — systemswordmark_brand, systemswordmark_docs, systemswordmarkwhite_brand, systemswordmarkwhite_docs [INFERRED 0.95]
- **App Icon Variants (S. monogram)** — icon192_appicon, icon512_appicon [INFERRED 0.95]
- **Ribbon Field Art Family** — ribbonfield_art, header_art, socialpreview_svg, socialpreview_png [INFERRED 0.95]

## Communities (110 total, 36 thin omitted)

### Community 0 - "Dashboard Frontend Core"
Cohesion: 0.05
Nodes (63): Admin View, App Root Component, Auth Pinia Store, REST API Client, ApiError, config (BASE_DOMAIN/hostFor), Dashboard Config, Deploy Domain Config & URL Helpers (+55 more)

### Community 1 - "Slug, DB-Provision & E2E Tooling"
Cohesion: 0.06
Nodes (48): audit, { chromium }, pages, require, serverInfo, systems, start(), baseDomain() (+40 more)

### Community 2 - "Architecture & Design Rationale"
Cohesion: 0.05
Nodes (57): buildApp() Injectable App, Component Topology, Internal Data Model, Architecture & Data Model, Primary System (Apex Domain), Container-State Reconciliation, Routing Model, SQLite+nginx vs Postgres+Caddy Cutover (+49 more)

### Community 3 - "Deploy Build Pipeline"
Cohesion: 0.07
Nodes (38): appendBuildLog(), beginDeploy(), buildListeners, buildLogs, buildStatus, { db, auditLog }, deployLock, dockerService (+30 more)

### Community 4 - "Chunked Upload & Sessions"
Cohesion: 0.05
Nodes (31): deploy, { features }, fs, fsp, sessions, { slugError }, { v4: uuidv4 }, { validateChunk, fitsOnDisk, uploadTempPath, progressState } (+23 more)

### Community 5 - "CI, Compose & Security Hardening"
Cohesion: 0.07
Nodes (39): CI Job: API lint + tests, CI Job: Dashboard lint + build, CI Workflow, Dashboard index.html (PWA shell), Dashboard README, Vue 3 / Vite / Pinia PWA Stack, acronym-api Service, acronym-certbot Service (+31 more)

### Community 6 - "Auth, Audit & Database Core"
Cohesion: 0.10
Nodes (34): adminRoutes, fastify.authenticate decorator, buildApp, auditRoutes, authRoutes, signToken, auditLog, db module (better-sqlite3) (+26 more)

### Community 7 - "Dashboard Dependencies"
Cohesion: 0.06
Nodes (32): dependencies, chart.js, pinia, vue, vue-chartjs, vue-router, @xterm/addon-fit, @xterm/xterm (+24 more)

### Community 8 - "API Dependencies"
Cohesion: 0.06
Nodes (30): dependencies, bcrypt, better-sqlite3, dockerode, fastify, @fastify/cors, @fastify/jwt, @fastify/multipart (+22 more)

### Community 9 - "Projects & Health Checks"
Cohesion: 0.08
Nodes (22): bcrypt, { confirmMatches }, { db, auditLog }, dockerService, fsp, health, path, proxy (+14 more)

### Community 10 - "Admin User Management UI"
Cohesion: 0.07
Nodes (25): addingUser, addUser(), addUserError, atCap, confirmRemoveId, deleteUser(), deletingId, loadUsers() (+17 more)

### Community 11 - "System Detail & Lifecycle UI"
Cohesion: 0.11
Nodes (20): ACTION_DONE, confirmRedeploy, doRedeploy(), doRollback(), fileInput, isRunning, lifecycle(), loadDeployHistory() (+12 more)

### Community 12 - "API Bootstrap & Integration"
Cohesion: 0.11
Nodes (20): initDefaultUsers(), ensureIsolatedNetwork(), buildApp(), Fastify, backup, { buildApp }, { ensureIsolatedNetwork }, { initDefaultUsers } (+12 more)

### Community 13 - "Container Logs & Docker"
Cohesion: 0.11
Nodes (10): { db }, { loadOr404 }, { streamContainerLogs, getContainerLogs }, { containerLimits }, createDemuxer(), demuxStream(), Docker, fs (+2 more)

### Community 14 - "User & Audit Persistence"
Cohesion: 0.12
Nodes (12): bcrypt, Database, db, DB_PATH, fs, path, bcrypt, { db, auditLog } (+4 more)

### Community 15 - "TOTP / 2FA"
Cohesion: 0.12
Nodes (17): assert, buf, code, now, prev, secret, t, { test } (+9 more)

### Community 16 - "API Client & WebSocket"
Cohesion: 0.15
Nodes (11): api, ApiError, authHeader(), handle(), openWs(), wsUrl(), auth, router (+3 more)

### Community 17 - "Container Reconciliation"
Cohesion: 0.17
Nodes (13): auditLog(), { db, auditLog }, dockerService, notify, reconcileOnce(), { reconcileStatus }, start(), assert (+5 more)

### Community 18 - "Nginx/Caddy Proxy Routing"
Cohesion: 0.14
Nodes (12): fsp, getDocker(), path, reloadNginx(), caddy, kind(), nginx, publishRoute() (+4 more)

### Community 19 - "Caddy & Postgres Provisioning"
Cohesion: 0.20
Nodes (16): caddy exec, findCaddyContainer, caddy reload, caddy removeRoute, renderRoute, caddy validate, writeRoute, provision (postgres) (+8 more)

### Community 20 - "Windows Ops Scripts"
Cohesion: 0.36
Nodes (16): Confirm-Typed, Get-ConfigValue, Get-RepoRoot, Get-SystemsPaths, Import-DotEnv, Test-DockerLinux, Test-TcpPort, Systems Common Helpers (+8 more)

### Community 21 - "Env Var Encryption"
Cohesion: 0.17
Nodes (12): crypto, { db, auditLog }, decryptEnvVars(), dockerService, encryptEnvVars(), getEncryptionKey(), { loadOr404 }, assert (+4 more)

### Community 22 - "GitHub Webhook Deploys"
Cohesion: 0.16
Nodes (10): { db, auditLog }, deploy, { features }, fsp, notify, { v4: uuidv4 }, { verifySignature, branchAllowed }, branchAllowed() (+2 more)

### Community 23 - "Backup Service"
Cohesion: 0.21
Nodes (11): backupDir(), { backupsToPrune, backupStamp }, dataDir(), { db, auditLog }, fs, fsp, notify, path (+3 more)

### Community 24 - "Windows Common Helpers"
Cohesion: 0.16
Nodes (5): Get-ConfigValue(), Get-SystemsPaths(), Import-DotEnv(), Write-SystemsWarn(), Write-RollbackHelp()

### Community 25 - "Brand Identity Assets"
Cohesion: 0.24
Nodes (14): Trailing Period Accent Mark, Dark Palette (#0a0a0c / #0f1013), Ribbon Field Visual Aesthetic, SYSTEMS Brand Identity, Docs Header Ribbon Art, App Icon 192 (S. monogram), App Icon 512 (S. monogram), Ribbon Field Decorative Art (+6 more)

### Community 26 - "Validation Utils & Tests"
Cohesion: 0.15
Nodes (13): Caddy Route Rendering Test Suite, Path Safety Test Suite, caddy service (renderRoute, writeRoute), dbprovision-runner service (quoteIdent, quoteLiteral), Slug Validation Test Suite, dbprovision util (dbName, databaseUrl, maskUrl), flags util (features), pathsafe util (isWithin, safeResolve) (+5 more)

### Community 27 - "Server Info & Host Metrics"
Cohesion: 0.18
Nodes (9): backupDir(), dataDir(), Docker, dockerService, { features }, fs, fsp, net (+1 more)

### Community 28 - "Background Service Workers"
Cohesion: 0.18
Nodes (12): runBackup, backup start (scheduler), ensureIsolatedNetwork, listManagedContainers, runContainer, checkSystem, health request, notify send (+4 more)

### Community 29 - "Server View UI"
Cohesion: 0.17
Nodes (7): backingUp, backup, backupMsg, defaults, disk, notifyMsg, testingNotify

### Community 30 - "Ship / Deploy UI"
Cohesion: 0.22
Nodes (5): onDrop(), onPick(), plan, setFile(), visDesc

### Community 31 - "Stats & Project Loader"
Cohesion: 0.24
Nodes (7): { db }, { getContainerStats }, { loadOr404 }, getContainerStats(), { db }, getProject(), loadOr404()

### Community 32 - "Notifications & Feature Flags"
Cohesion: 0.36
Nodes (7): send(), { shouldSend, buildPayload }, bool(), features(), buildPayload(), { features }, shouldSend()

### Community 33 - "Stats Charts UI"
Cohesion: 0.20
Nodes (8): cpuData, cpuOptions, cpuVal, labels, memData, memOptions, memVal, rxVal

### Community 34 - "Container Resource Limits"
Cohesion: 0.25
Nodes (7): runContainer(), assert, { containerLimits }, env, l, { test }, containerLimits()

### Community 35 - "Ribbon Art Generator"
Cohesion: 0.28
Nodes (8): angleAt(), ART, buildPaths(), __dirname, DOCS, PALETTE, paths, ribbonPath()

### Community 36 - "App Shell & Navigation"
Cohesion: 0.25
Nodes (9): AppShell, useAuthStore, ConfirmDialog, ExecTerminal, KeyboardShortcuts, LogConsole, NavIcon, SystemsLogo (+1 more)

### Community 37 - "Backup/Notify Tests"
Cohesion: 0.25
Nodes (7): assert, { backupsToPrune, backupStamp }, entries, p, s, { shouldSend, buildPayload }, { test }

### Community 38 - "Toast Notifications"
Cohesion: 0.32
Nodes (6): clear(), DURATION, remove(), schedule(), timers, toasts

### Community 39 - "App & TOTP Test Harness"
Cohesion: 0.29
Nodes (7): Fastify app (buildApp), db module, API ESLint Flat Config, Route Integration Test Suite, systems-api Package Manifest, TOTP Test Suite, totp util

### Community 40 - "HMAC & TOTP Primitives"
Cohesion: 0.33
Nodes (6): buildPayload, base32Decode, hotp, totp, verify, verifySignature

### Community 41 - "Container Exec Route"
Cohesion: 0.40
Nodes (3): { db, auditLog }, dockerService, { features }

### Community 44 - "Slug Validation"
Cohesion: 0.40
Nodes (5): dbName, dbUser, isReserved, isValidSlug, slugError

### Community 46 - "System Settings UI"
Cohesion: 0.50
Nodes (3): body, k, vars

### Community 48 - "Backup & Notify Utils"
Cohesion: 0.67
Nodes (3): Backup & Notify Test Suite, backup util (backupsToPrune, backupStamp), notify util (shouldSend, buildPayload)

### Community 52 - "Feature Flag Helpers"
Cohesion: 0.67
Nodes (3): bool, features, shouldSend

### Community 53 - "Path Safety Guards"
Cohesion: 0.67
Nodes (3): isWithin, safeResolve, uploadTempPath

### Community 54 - "Project Type Classifier"
Cohesion: 0.67
Nodes (3): classify, defaultHealthPath, routesByDefault

### Community 55 - "Secret Generation"
Cohesion: 0.67
Nodes (3): genPassword, base32Encode, generateSecret

### Community 56 - "Upload Validation"
Cohesion: 0.67
Nodes (3): fitsOnDisk, mb, validateChunk

## Knowledge Gaps
- **432 isolated node(s):** `globals`, `name`, `version`, `description`, `license` (+427 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `User & Audit Persistence` to `Deploy Build Pipeline`, `Container Exec Route`, `Projects & Health Checks`, `API Bootstrap & Integration`, `Container Logs & Docker`, `Container Reconciliation`, `Env Var Encryption`, `GitHub Webhook Deploys`, `Backup Service`, `Stats & Project Loader`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `auditLog()` connect `Container Reconciliation` to `Deploy Build Pipeline`, `Container Exec Route`, `Projects & Health Checks`, `User & Audit Persistence`, `Env Var Encryption`, `GitHub Webhook Deploys`, `Backup Service`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `require` connect `Slug, DB-Provision & E2E Tooling` to `Nginx/Caddy Proxy Routing`, `Deploy Build Pipeline`, `API Bootstrap & Integration`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `SYSTEMS. (Deployment Engine)` (e.g. with `Zip In, Live URL Out` and `Self-Hosted, Admin-Only`) actually correct?**
  _`SYSTEMS. (Deployment Engine)` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `Systems View` (e.g. with `shots Screenshot Script` and `SystemDetail View`) actually correct?**
  _`Systems View` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `SystemDetail View` (e.g. with `shots Screenshot Script` and `Systems View`) actually correct?**
  _`SystemDetail View` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `globals`, `name`, `version` to the rest of the system?**
  _463 weakly-connected nodes found - possible documentation gaps or missing edges._