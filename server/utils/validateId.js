// Route :id params are untrusted strings until parsed. Never pass req.params
// straight into a query — Number('abc') is NaN, and NaN reaches the DB layer
// unvalidated. Returns a positive integer, or null if the value isn't one.
//
// AT MOST POSTGRESQL'S `integer` (P3-C-R2, the route-port review): every id
// column is int4 (migration/docs/02 §A), so a larger value can name no row,
// and BINDING one is 22003 — a 500, or, where a handler queries before its
// try (POST /api/messages' canMessage), an unhandled rejection that ends the
// process. Such an id is not a valid id: the route's own 400. MySQL's
// INT UNSIGNED compared it and found nothing (404, or an empty 200) — a
// deliberate, recorded difference (migration/docs/02 §B).
const MAX_ID = 2147483647;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= MAX_ID ? id : null;
}

module.exports = { parseId, MAX_ID };
