'use strict';

// Shared pagination policy (V4 Phase 0). Every list endpoint that can grow
// parses its query through this so defaults and hard maximums are uniform,
// and returns the same envelope shape: { entries, total, limit, offset }.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parsePagination(query = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  let limit = Number(query.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = defaultLimit;
  limit = Math.min(Math.floor(limit), maxLimit);

  let offset = Number(query.offset);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  offset = Math.floor(offset);

  return { limit, offset };
}

function envelope(entries, total, { limit, offset }) {
  return { entries, total, limit, offset };
}

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, parsePagination, envelope };
