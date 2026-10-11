// Logging in for the smoke run, and the rules about credentials.
//
// THE VALUES LIVE IN `client/e2e/.env.e2e`, WHICH IS GITIGNORED and which
// this repo's tooling never reads, prints or commits. `.env.e2e.example`
// carries the NAMES only. A missing variable fails naming the VARIABLE —
// never the value, never a hint about it — because a failure message ends up
// in a terminal, a log and quite possibly a screenshot.
//
// WHAT A LOGIN WRITES, checked rather than assumed: exactly ONE row in
// `activity_logs` (`routes/auth.js` → `logActivity(user.id, 'login', ...)`).
// There is no `last_login` column anywhere in the schema, no session row,
// and `token_version` is untouched — it moves only on a password change, a
// reset or an admin temporary password. So three logins leave three
// `activity_logs` rows, which is audit history and is never cleaned up
// (CLAUDE.md's cleanup protocol keeps `activity_logs` by rule).
//
// THE BROWSER USES `localhost`, NOT `127.0.0.1`, AND THAT IS LOAD-BEARING.
// `server.js:28` allows exactly one CORS origin — `http://localhost:3000`
// (`CORS_ORIGIN` default, matching `server/.env.example:13`). A browser
// opened at `http://127.0.0.1:3000` sends that as its `Origin`, CORS refuses
// it, and every API call fails — so the suite would report a broken app.
// The readiness polls in `globalSetup` are Node `fetch`, no Origin header
// and no CORS, so those use `127.0.0.1` deliberately (the same reason the
// server suites do: Node on Windows resolves `localhost` to `::1` first
// while the server listens on IPv4).
import { expect } from '@playwright/test';

export const APP_ORIGIN = process.env.E2E_APP_ORIGIN || 'http://localhost:3000';
export const API_ORIGIN = process.env.E2E_API_ORIGIN || 'http://127.0.0.1:5000';

const VARS = {
  admin: ['E2E_ADMIN_ID', 'E2E_ADMIN_PW'],
  teacher: ['E2E_TEACHER_ID', 'E2E_TEACHER_PW'],
  parent: ['E2E_PARENT_ID', 'E2E_PARENT_PW'],
  // The Grade 6 pair — Marwin's adviser and Marwin's parent. Numbered rather
  // than named, because the names are what must never be in a variable a
  // terminal echoes, and because one of them is shared by two seeded accounts.
  teacher2: ['E2E_TEACHER2_ID', 'E2E_TEACHER2_PW'],
  parent2: ['E2E_PARENT2_ID', 'E2E_PARENT2_PW'],
};

export function credentialsFor(role) {
  const [idVar, pwVar] = VARS[role];
  const login_id = process.env[idVar];
  const password = process.env[pwVar];
  // Name the variable, never the value, and never say which of the two is
  // missing in a way that confirms the other exists.
  if (!login_id) throw new Error(`${idVar} is not set. Fill client/e2e/.env.e2e — see .env.e2e.example.`);
  if (!password) throw new Error(`${pwVar} is not set. Fill client/e2e/.env.e2e — see .env.e2e.example.`);
  return { login_id, password };
}

// Logs in through the REAL form, not by injecting a token. A minted token
// would skip the one flow every role depends on and would violate the
// standing rule against minting them at all.
export async function login(page, role) {
  const { login_id, password } = credentialsFor(role);

  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel(/login id/i).fill(login_id);
  // `input[type="password"]`, NOT getByLabel(/password/i): the field has a
  // reveal toggle whose accessible name is "Show password", so the label
  // regex matched TWO elements and Playwright's strict mode refused. The
  // attribute selector is unambiguous and is what the field actually is —
  // and the toggle is exactly the affordance the login page is documented as
  // being the only form to have.
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  // Landing anywhere inside a role shell is the success condition; which
  // dashboard is the router's business, not this helper's.
  await expect(page).toHaveURL(/\/(admin|teacher|parent)(\/|$)/, { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// globalSetup: WAIT FOR BOTH SERVERS, and fail naming the one that is down.
//
// This suite does NOT start them. Playwright's `webServer` could, and that is
// the wrong trade here: the API owns the real dev database, a socket server
// and whatever MAIL_TRANSPORT it was started with, so a harness that starts
// and kills it will eventually kill one somebody was using. One clear failure
// beats forty confusing ones.
//
// THE RETRY LOOP IS NOT DEFENSIVE PADDING. The cleanup scripts in UI-A and
// UI-B both failed their FIRST invocation with a bare `fetch failed`, against
// a server that was up and answered instantly on the second try — twice,
// hours apart, after a long idle gap. The cause is not diagnosed (it is not
// IPv6: those scripts already used 127.0.0.1). Whatever it is, one cold
// connection must cost a retry here, not a failed run of 144 screenshots.
async function waitFor(name, url, attempts = 20, gapMs = 500) {
  let lastError = 'no attempt made';
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message;
    }
    await new Promise((resolve) => setTimeout(resolve, gapMs));
  }
  throw new Error(
    `${name} is not responding at ${url} after ${attempts} tries (last: ${lastError}).\n` +
    `Start it first — the smoke run does not start servers.`
  );
}

// ---------------------------------------------------------------------------
// THE CONSENT GATE (feat/privacy, 2026-10-10). A parent who has not accepted
// the Data Privacy Notice and the Terms of Use lands on /consent, not on
// /parent, and the API refuses everything else — so both parent accounts
// accept through the REAL endpoint before any test signs in (one more `login`
// row each, the only new write). globalSetup RETURNS the teardown, which
// Playwright runs after the last test: it deletes exactly the acceptance rows
// this run added — by id, against a snapshot taken first — so a seeded parent
// is asked again at the next real sign-in. Prints nothing about the accounts.
// STAFF TOO since feat/staff-acceptance (2026-10-11): the three staff smoke
// accounts accept the same way — the two documents, no child tick — and their
// rows go in the same teardown, so a seeded teacher or admin meets the consent
// screen again at the next real sign-in.

// The database, through the SERVER's own driver and .env (the client package
// has neither). Read, never printed.
async function withServerDb(fn) {
  const { createRequire } = await import('node:module');
  const serverDir = new URL('../../server/', import.meta.url);
  const require = createRequire(new URL('package.json', serverDir));
  require('dotenv').config({ path: new URL('.env', serverDir) });
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'parents_portal',
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

async function acceptanceIds(userIds) {
  return withServerDb(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM policy_acceptances WHERE user_id IN (?)', [userIds]);
    return rows.map((r) => r.id);
  });
}

async function acceptForParents() {
  const accounts = [];
  for (const role of ['parent', 'parent2']) {
    const { login_id, password } = credentialsFor(role);
    const res = await fetch(`${API_ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_id, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.token) throw new Error(`Consent setup: the ${role} account did not sign in (HTTP ${res.status}).`);
    accounts.push({ role, token: body.token, id: body.user.id, pending: body.user.policy_pending === true });
  }
  for (const role of ['admin', 'teacher', 'teacher2']) {
    const { login_id, password } = credentialsFor(role);
    const res = await fetch(`${API_ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_id, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.token) throw new Error(`globalSetup: the ${role} smoke account could not sign in (HTTP ${res.status})`);
    accounts.push({ role, token: body.token, id: body.user.id, pending: body.user.policy_pending === true, staff: true });
  }
  const userIds = [...new Set(accounts.map((a) => a.id))];
  const before = new Set(await acceptanceIds(userIds));

  for (const a of accounts) {
    if (!a.pending) continue;
    const auth = { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' };
    const docs = await (await fetch(`${API_ORIGIN}/api/policy`, { headers: auth })).json();
    const versions = Object.fromEntries((docs.documents || []).map((d) => [d.document, d.version]));
    const res = await fetch(`${API_ORIGIN}/api/policy/accept`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(a.staff ? { versions } : { versions, on_behalf_of_child: true }),
    });
    if (!res.ok) throw new Error(`Consent setup: the ${a.role} account's accept answered HTTP ${res.status}.`);
  }

  return async function removeThisRunsAcceptances() {
    const added = (await acceptanceIds(userIds)).filter((id) => !before.has(id));
    if (added.length) {
      await withServerDb((conn) => conn.query('DELETE FROM policy_acceptances WHERE id IN (?)', [added]));
    }
  };
}

export default async function globalSetup() {
  // TWO SERVERS, TWO HOSTS, AND THE RULE IS NOT THE SAME FOR BOTH. Measured
  // 2026-09-24 with netstat, after the first run failed against a Vite that
  // was demonstrably up:
  //
  //   port 5000   0.0.0.0:5000   LISTENING   ← the API, IPv4 and [::]
  //   port 3000   [::1]:3000     LISTENING   ← Vite, IPv6 loopback ONLY
  //
  // The API poll uses 127.0.0.1 for the reason the server suites document:
  // Node on Windows resolves `localhost` to ::1 first, and that mismatch was
  // ECONNRESET mid-run. **That rule is about the API and must not be
  // generalised** — this file did generalise it, and against Vite the same
  // substitution points at an address nothing is listening on (ECONNREFUSED,
  // while `http://localhost:3000` answers 200).
  //
  // `vite.config.js` sets only `port`, so Vite binds `localhost` = ::1. It is
  // NOT changed to suit a test: `APP_ORIGIN` is polled as it stands, which is
  // also the origin the browser must use, because `server.js` allows exactly
  // one CORS origin and `http://[::1]:3000` is not it.
  await waitFor('The API', `${API_ORIGIN}/api/health`);
  await waitFor('The Vite dev server', APP_ORIGIN);

  // Every smoke account accepts first (both parents; the three staff since
  // feat/staff-acceptance); the returned function is the global teardown
  // that removes what this accepted (see acceptForParents above). Nothing runs
  // after this return — the note below records a warm-up that was removed.
  return acceptForParents();

  // NO WARM-UP HERE, AND THE ATTEMPT IS WORTH RECORDING (UI-C1a).
  //
  // A third request was added here to "warm" the API through the host the
  // browser uses, on the theory that the polls above only warm `127.0.0.1`
  // while Chromium talks to `localhost`. It changed nothing: the run still
  // failed with `net::ERR_CONNECTION_REFUSED` on the admin dashboard's first
  // two card requests.
  //
  // THE PREMISE WAS WRONG. `globalSetup` runs in NODE. The failure is in
  // CHROMIUM, in a process that has not started yet, with its own connection
  // pool and its own DNS. Node cannot warm a browser that does not exist.
  //
  // Removed rather than left looking like a fix that did not work. The
  // diagnostic in `smoke.spec.js` — which now records WHICH request was
  // refused — is what the next occurrence needs; root cause is its own
  // INVESTIGATE before the final smoke gate. `docs/KNOWN_ISSUES.md` has the
  // row. Playwright `retries` stay off: a retry would hide it.
}
