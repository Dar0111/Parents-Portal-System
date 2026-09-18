// One pagination contract for every list endpoint (2026-09-19, Server
// hardening C). Offset-based: ?limit= (default 50, max 200) and ?offset=
// (default 0). Each handler keeps its existing array key and adds a sibling
// `page: { limit, offset, total, has_more }`, where `total` counts the
// FILTERED set (the same WHERE the rows came from — C4) and `has_more` is
// `offset + limit < total`. Cursor paging was rejected for these lists (each
// sorts on a different key and the web tables want "1–50 of 812"); the one
// exception is GET /messages/with/:userId, which pages newest-first on
// ?before=<message_id> so live socket inserts cannot shift a page — that
// route reads only `limit` from here.
//
// Sorting (C1): a paginated table cannot sort client-side (it would sort one
// page), so every list also accepts ?sort=<key>&order=asc|desc against an
// explicit per-endpoint allow-list mapping a key to an ORDER BY expression.
// An unknown key is a 400 naming the allowed keys; `order` outside asc/desc is
// a 400. Without `sort` the handler's own default order applies. A
// tiebreaker column is always appended so no row can appear on two pages.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseNonNegativeInt(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

// Returns { limit, offset } or { error } — the error is the 400 message.
function parsePagination(query) {
  let limit = DEFAULT_LIMIT;
  let offset = 0;

  if (query.limit !== undefined) {
    const parsed = parseNonNegativeInt(query.limit);
    if (parsed === null || parsed < 1 || parsed > MAX_LIMIT) {
      return { error: `limit must be an integer between 1 and ${MAX_LIMIT}.` };
    }
    limit = parsed;
  }

  if (query.offset !== undefined) {
    const parsed = parseNonNegativeInt(query.offset);
    if (parsed === null) {
      return { error: 'offset must be an integer of 0 or more.' };
    }
    offset = parsed;
  }

  return { limit, offset };
}

// sortable: { key: 'sql expression' } — an expression may name several
// columns ("s.last_name, s.first_name"); the direction is applied to each.
// Returns { orderBy } (a full "ORDER BY …" clause) or { error }.
function parseSort(query, { sortable, defaultOrderBy, tiebreaker }) {
  const keys = Object.keys(sortable);

  if (query.order !== undefined && !['asc', 'desc'].includes(query.order)) {
    return { error: "order must be 'asc' or 'desc'." };
  }

  if (query.sort === undefined) {
    if (query.order !== undefined) {
      return { error: 'order requires sort.' };
    }
    return { orderBy: `ORDER BY ${defaultOrderBy}, ${tiebreaker}` };
  }

  if (!Object.prototype.hasOwnProperty.call(sortable, query.sort)) {
    return { error: `sort must be one of: ${keys.join(', ')}.` };
  }

  const dir = query.order === 'desc' ? 'DESC' : 'ASC';
  const expr = sortable[query.sort]
    .split(',')
    .map((column) => `${column.trim()} ${dir}`)
    .join(', ');
  return { orderBy: `ORDER BY ${expr}, ${tiebreaker}` };
}

// The one call a list handler makes. Returns
//   { ok: true, limit, offset, orderBy }  or  { ok: false, message }.
function readListParams(query, sortOptions) {
  const page = parsePagination(query);
  if (page.error) return { ok: false, message: page.error };
  const sort = parseSort(query, sortOptions);
  if (sort.error) return { ok: false, message: sort.error };
  return { ok: true, limit: page.limit, offset: page.offset, orderBy: sort.orderBy };
}

function pageMeta({ limit, offset, total }) {
  return { limit, offset, total, has_more: offset + limit < total };
}

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, parsePagination, parseSort, readListParams, pageMeta };
