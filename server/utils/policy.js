const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

// THE DATA PRIVACY NOTICE AND THE TERMS OF USE (feat/privacy, 2026-10-10).
//
// SHIPPED WITH THE APP, not an admin setting (the owner's answer 2): the text
// lives in server/policy/*.md and its version in server/policy/versions.json,
// so git keeps every version's exact wording and a new version is a deliberate
// release. Both are read ONCE, when the server starts — changing the text
// means editing the file, bumping the version, and restarting the API.
//
// A NEW VERSION ASKS AGAIN. Acceptance is per (document, version): bump a
// version and every parent's policy_pending is true until they accept it.
//
// The text today is a placeholder ("Draft — awaiting the school's approval");
// no legal text is written here (KNOWN_ISSUES).

const POLICY_DIR = path.join(__dirname, '..', 'policy');

// The order both screens list them in.
const DOCUMENTS = ['privacy_notice', 'terms_of_use'];

function loadDocuments() {
  const versions = JSON.parse(fs.readFileSync(path.join(POLICY_DIR, 'versions.json'), 'utf8'));
  return DOCUMENTS.map((document) => {
    const entry = versions[document];
    if (!entry || !entry.version || !entry.title || !entry.file) {
      throw new Error(`server/policy/versions.json has no complete entry for ${document}`);
    }
    if (String(entry.version).length > 32) {
      throw new Error(`server/policy/versions.json: ${document}'s version is longer than 32 characters`);
    }
    return {
      document,
      title: entry.title,
      version: String(entry.version),
      text: fs.readFileSync(path.join(POLICY_DIR, entry.file), 'utf8').replace(/\r\n/g, '\n').trim(),
    };
  });
}

const CURRENT = loadDocuments();

// Only parents accept, in this build. Staff acceptance is deferred (the
// owner's answer 3); when it comes, this is the one line that widens.
const ROLES_THAT_ACCEPT = ['parent'];

function mustAccept(role) {
  return ROLES_THAT_ACCEPT.includes(role);
}

// SQL fragment + params for "how many CURRENT documents has this user
// accepted". middleware/auth.js folds it into its users SELECT as a
// subquery, so the gate costs no extra round trip.
function acceptedCountSql(userIdColumn) {
  const clauses = CURRENT.map(() => '(pa.document = ? AND pa.version = ?)').join(' OR ');
  return {
    sql: `(SELECT COUNT(*) FROM policy_acceptances pa WHERE pa.user_id = ${userIdColumn} AND (${clauses}))`,
    params: CURRENT.flatMap((d) => [d.document, d.version]),
  };
}

function isPending(role, acceptedCount) {
  return mustAccept(role) && Number(acceptedCount || 0) < CURRENT.length;
}

// Every acceptance of a CURRENT version this user has given, keyed by document.
async function currentAcceptances(userId) {
  const [rows] = await pool.query(
    `SELECT document, version, accepted_at FROM policy_acceptances
      WHERE user_id = ? AND (${CURRENT.map(() => '(document = ? AND version = ?)').join(' OR ')})`,
    [userId, ...CURRENT.flatMap((d) => [d.document, d.version])]
  );
  return Object.fromEntries(rows.map((r) => [r.document, r]));
}

module.exports = { CURRENT, DOCUMENTS, mustAccept, acceptedCountSql, isPending, currentAcceptances };
