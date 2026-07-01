'use strict';

// V2 feature flags — risky features are OFF by default and only enabled via
// explicit env config. Pure + unit-tested.

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function features(env = process.env) {
  return {
    dockerfileMode: bool(env.ENABLE_DOCKERFILE_MODE, false),
    shellConsole: bool(env.ENABLE_SHELL_CONSOLE, false),
    githubDeploys: bool(env.ENABLE_GITHUB_DEPLOYS, false),
    notifications: bool(env.ENABLE_NOTIFICATIONS, false),
    dbProvisioning: bool(env.ENABLE_DB_PROVISIONING, false),
    largeUploads: bool(env.ENABLE_LARGE_UPLOADS, false),
    backupScheduler: bool(env.ENABLE_BACKUP_SCHEDULER, false),
    dbMode: (env.DB_MODE || 'shared').toLowerCase(),
    uploadMaxMb: Number(env.UPLOAD_MAX_MB) || 100,
    v2UploadMaxMb: Number(env.V2_UPLOAD_MAX_MB) || 2048,
    // v3 feature flags
    previewEnvironments: bool(env.ENABLE_PREVIEW_ENVIRONMENTS, false),
    multiNode: bool(env.ENABLE_MULTI_NODE, false),
    objectStorageBackups: bool(env.ENABLE_OBJECT_STORAGE_BACKUPS, false),
    apiTokens: bool(env.ENABLE_API_TOKENS, false),
    secretsManagement: bool(env.ENABLE_SECRETS_MANAGEMENT, false),
    buildCache: bool(env.ENABLE_BUILD_CACHE, false),
    // V4 feature gates
    v4Systems: bool(env.ENABLE_V4_SYSTEMS, false),
  };
}

module.exports = { bool, features };
