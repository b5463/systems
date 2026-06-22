'use strict';

const { prisma } = require('./client');

module.exports = {
  prisma,
  userRepo: require('./users'),
  projectRepo: require('./projects'),
  auditRepo: require('./audit'),
  adminRepo: require('./admin'),
  statsRepo: require('./stats'),
};
