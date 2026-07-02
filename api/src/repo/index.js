'use strict';

const { prisma } = require('./client');

module.exports = {
  prisma,
  userRepo: require('./users'),
  projectRepo: require('./projects'),
  auditRepo: require('./audit'),
  adminRepo: require('./admin'),
  statsRepo: require('./stats'),
  secretRepo: require('./secrets'),
  tokenRepo: require('./tokens'),
  nodeRepo: require('./nodes'),
  backupRepo: require('./backups'),
  jobRepo: require('./jobs'),
  // V4 Phase 1 foundational repositories (org-scoped model)
  orgRepo: require('./organisations'),
  adminUserRepo: require('./adminusers'),
  adminSessionRepo: require('./adminsessions'),
  auditV4Repo: require('./auditv4'),
};
