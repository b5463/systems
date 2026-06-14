'use strict';

// Small, pure, unit-tested operational thresholds + confirmation logic.

// Disk usage → UI tone. Warn at 75%, alert at 90%.
function diskTone(usedPct) {
  if (!Number.isFinite(usedPct)) return 'idle';
  if (usedPct >= 90) return 'error';
  if (usedPct >= 75) return 'warn';
  return 'ok';
}

// A backup is "overdue" after a week.
function backupOverdue(ageHours, limitHours = 168) {
  return Number.isFinite(ageHours) && ageHours > limitHours;
}

// Typed confirmation for destructive actions (purge / DB reset): the operator
// must type the exact slug/name. Trims, never coerces empties to a match.
function confirmMatches(input, expected) {
  return typeof input === 'string' && typeof expected === 'string'
    && expected.length > 0 && input === expected;
}

module.exports = { diskTone, backupOverdue, confirmMatches };
