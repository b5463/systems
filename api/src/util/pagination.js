'use strict';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 100;

function parsePagination(query) {
  const page = Math.max(1, Math.floor(Number(query.page) || DEFAULT_PAGE));
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(Number(query.per_page || query.perPage) || DEFAULT_PER_PAGE)));
  const offset = (page - 1) * perPage;
  return { page, perPage, offset };
}

function paginationEnvelope(items, total, { page, perPage }) {
  return {
    data: items,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  };
}

module.exports = { DEFAULT_PAGE, DEFAULT_PER_PAGE, MAX_PER_PAGE, parsePagination, paginationEnvelope };
