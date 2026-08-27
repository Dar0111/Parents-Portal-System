// Route :id params are untrusted strings until parsed. Never pass req.params
// straight into a query — Number('abc') is NaN, and NaN reaches the DB layer
// unvalidated. Returns a positive integer, or null if the value isn't one.
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

module.exports = { parseId };
