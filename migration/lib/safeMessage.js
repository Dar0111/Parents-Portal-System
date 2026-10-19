// The ONE place an error message is made printable. Every script routes the
// text it prints or stores about an error through here: a quoted value
// (MySQL's "Duplicate entry 'x' for key …" carries the row value; PostgreSQL
// quotes identifiers and some values), any run of 6+ digits (an LRN, a phone
// number, an id-shaped token) and any e-mail shape are masked. Only the first
// line of error.message is ever used — never error.detail, error.stack,
// error.sql or query parameters.
function safeMessage(error) {
  const first = String(error && error.message !== undefined ? error.message : error).split('\n')[0];
  return first
    .replace(/'(?:[^'\\]|\\.)*'/g, "'…'")
    .replace(/"(?:[^"\\]|\\.)*"/g, '"…"')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
    .replace(/\d{6,}/g, '<digits>');
}

module.exports = { safeMessage };
