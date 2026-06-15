'use strict';

// V2 feature flags — risky features are OFF by default and only enabled via
// explicit env config. Pure + unit-tested.

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function features(env = process.env) {
  return {
    dockerfileMode: bool(env.ENABLE_DOCKERFILE_MODE, false), // advanced: builds run project Dockerfile
    shellConsole: bool(env.ENABLE_SHELL_CONSOLE, false),     // interactive container shell
    githubDeploys: bool(env.ENABLE_GITHUB_DEPLOYS, false),
    notifications: bool(env.ENABLE_NOTIFICATIONS, false),
    dbProvisioning: bool(env.ENABLE_DB_PROVISIONING, false),
    largeUploads: bool(env.ENABLE_LARGE_UPLOADS, false),     // chunked/streamed uploads
    backupScheduler: bool(env.ENABLE_BACKUP_SCHEDULER, false), // periodic auto-backup
    dbMode: (env.DB_MODE || 'shared').toLowerCase(),         // 'shared' | 'per-project'
    uploadMaxMb: Number(env.UPLOAD_MAX_MB) || 100,
    v2UploadMaxMb: Number(env.V2_UPLOAD_MAX_MB) || 2048,
  };
}

module.exports = { bool, features };
