// Strips every key whose name contains "password" (case-insensitive), not
// just the literal key "password". A plain `const { password, ...safe } =
// user` only catches the exact column name — a JOIN that aliases the hash
// (creator_password, sender_password, u2_password, ...) would sail straight
// through and leak the bcrypt hash in the API response. This is the one
// shared implementation; every route that returns a user row uses this.
function sanitizeUser(row) {
  if (!row || typeof row !== 'object') return row;

  const safe = {};
  for (const [key, value] of Object.entries(row)) {
    if (/password/i.test(key)) continue;
    safe[key] = value;
  }
  return safe;
}

module.exports = { sanitizeUser };
