// Connection settings. Values are read from files and kept in objects — they
// are never copied into process.env, never logged and never returned to a
// caller that prints.
//
//   source   MySQL — the running application's server/.env (read-only use)
//   local    the embedded PostgreSQL this package starts for rehearsals
//   staging  the Supabase project — <DATA_DIR>/secrets/supabase.env, written
//            by the owner, never pasted into a chat. EXACTLY THREE KEYS (the
//            owner's addition A2, 2026-10-24; docs/06 §0 has the template):
//              PG_OWNER_URL             the dashboard's Session pooler URI for
//                                       the owner role (postgres.<ref>), with
//                                       the database password
//              PORTAL_MIGRATE_PASSWORD  what scripts/set-role-passwords.js gives
//                                       portal_migrate
//              PORTAL_APP_PASSWORD      the same for portal_app
//            Everything else about staging is DERIVED from PG_OWNER_URL so no
//            value is written twice: host, port, database, the project ref,
//            and each role's pooler user name — Supabase's Supavisor takes
//            `<role>.<project ref>` for every role (A1; the docs' "the project
//            reference is included in the username following a `.`"). The
//            direct host is IPv6-only on this network and is not used.
//
//   TLS on staging (A3): always on. verify-full — the chain checked against
//   the project's CA and the host name against the certificate — when
//   <DATA_DIR>/secrets/prod-ca-2021.crt is present (the dashboard's
//   Database Settings → SSL Configuration download; Supabase's docs use that
//   file with the pooler host too). Without the file a staging connection is
//   REFUSED unless --tls-encrypt-only is passed, and then every script prints
//   that it is encrypting without verifying. tlsFacts() reports what the
//   open connection actually checked.
const fs = require('fs');
const path = require('path');
const { dep } = require('./deps');
const P = require('./paths');

const dotenv = dep('dotenv');

const SECRETS_FILE = path.join(P.SECRETS_DIR, 'supabase.env');
const CA_FILE = path.join(P.SECRETS_DIR, 'prod-ca-2021.crt');
const STAGING_KEYS = ['PG_OWNER_URL', 'PORTAL_MIGRATE_PASSWORD', 'PORTAL_APP_PASSWORD'];
const ROLES = ['portal_migrate', 'portal_app'];
const SESSION_POOLER_PORT = 5432;

// A file written in Windows Notepad arrives with CRLF line endings and, often,
// a UTF-8 byte-order mark; dotenv tolerates both, but nothing here relies on
// that: the BOM is dropped, CRLF becomes LF, and every value is trimmed of
// trailing whitespace before it is used.
function readTextFile(file) {
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return null;
  const parsed = dotenv.parse(readTextFile(file));
  for (const key of Object.keys(parsed)) parsed[key] = String(parsed[key]).trim();
  return parsed;
}

function sourceConfig() {
  const env = readEnvFile(P.SOURCE_ENV_FILE);
  if (!env) throw new Error(`Source .env not found at ${P.SOURCE_ENV_FILE} (set MIGRATION_SOURCE_ENV).`);
  return {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'parents_portal',
    mysqldumpPath: env.MYSQLDUMP_PATH || 'mysqldump',
  };
}

const LOCAL_PG = {
  port: Number(process.env.MIGRATION_PG_PORT) || 54329,
  user: 'portal_migrate',
  password: 'local-rehearsal-only',
  database: 'parents_portal_pg',
  dataDir: path.join(P.PG_LOCAL_DIR, 'data'),
};

function localConfig() {
  return {
    host: '127.0.0.1',
    port: LOCAL_PG.port,
    user: LOCAL_PG.user,
    password: LOCAL_PG.password,
    database: LOCAL_PG.database,
  };
}

// --- the staging secrets: names only ever leave this module ------------------

// Which of the three keys the secrets file lacks. `file: false` when the file
// itself is missing (then every key is missing). Never a value.
function stagingKeysMissing() {
  const env = readEnvFile(SECRETS_FILE);
  if (!env) return { file: false, missing: [...STAGING_KEYS] };
  return { file: true, missing: STAGING_KEYS.filter((k) => !env[k] || String(env[k]).trim() === '') };
}

// PG_OWNER_URL → host, port, database, the owner's user name and password, and
// the project ref. Every refusal names the RULE, never the value.
function parseOwnerUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error('PG_OWNER_URL is not a URL — paste the dashboard\'s Session pooler URI as one line.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('PG_OWNER_URL must start with postgresql:// (the dashboard\'s Session pooler URI).');
  }
  const host = url.hostname;
  if (!/\.pooler\.supabase\.com$/i.test(host)) {
    throw new Error('PG_OWNER_URL must name the Session pooler host (…pooler.supabase.com); the direct host is IPv6-only here and is not used.');
  }
  const port = url.port ? Number(url.port) : SESSION_POOLER_PORT;
  if (port !== SESSION_POOLER_PORT) {
    throw new Error(`PG_OWNER_URL must use the Session pooler port ${SESSION_POOLER_PORT}; transaction mode (6543) breaks SET, prepared statements and multi-statement transactions.`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres';
  const user = decodeURIComponent(url.username || '');
  const password = decodeURIComponent(url.password || '');
  const dot = user.indexOf('.');
  if (dot <= 0 || dot === user.length - 1) {
    throw new Error('PG_OWNER_URL\'s user name must carry the project ref as postgres.<ref> (the pooler\'s format).');
  }
  if (!password) throw new Error('PG_OWNER_URL carries no password — the dashboard URI needs the database password filled in.');
  return { host, port, database, ownerUser: user, ownerPassword: password, ref: user.slice(dot + 1) };
}

// The TLS option for a staging connection and the mode it implements.
function stagingTls(host, argv = process.argv) {
  if (fs.existsSync(CA_FILE)) {
    return {
      mode: 'verify-full',
      ssl: { rejectUnauthorized: true, ca: readTextFile(CA_FILE), servername: host },
    };
  }
  if (argv.includes('--tls-encrypt-only')) {
    return { mode: 'encrypt-only (NOT VERIFIED: no CA file)', ssl: { rejectUnauthorized: false } };
  }
  throw new Error(`No CA file at ${CA_FILE} — download prod-ca-2021.crt from the dashboard (Database Settings → SSL Configuration) into the secrets folder for verify-full, or pass --tls-encrypt-only to connect encrypted without verifying the server.`);
}

// A pg config for one role on staging: 'owner' (the dashboard's postgres.<ref>
// as written in PG_OWNER_URL), 'portal_migrate' or 'portal_app' (each as
// <role>.<ref> with its own password key). Returns null when the file is
// missing; throws, naming the key or the rule, when something in it is wrong.
function stagingConfig(role = 'portal_migrate', argv = process.argv) {
  const env = readEnvFile(SECRETS_FILE);
  if (!env) return null;
  if (!env.PG_OWNER_URL) throw new Error('supabase.env has no PG_OWNER_URL.');
  const owner = parseOwnerUrl(env.PG_OWNER_URL);
  const tls = stagingTls(owner.host, argv);
  const base = {
    host: owner.host,
    port: owner.port,
    database: owner.database,
    ssl: tls.ssl,
    application_name: 'parents-portal-migration',
  };
  if (role === 'owner') {
    return { ...base, user: owner.ownerUser, password: owner.ownerPassword, tlsMode: tls.mode, ref: owner.ref };
  }
  if (!ROLES.includes(role)) throw new Error(`Unknown staging role ${role}.`);
  const key = role === 'portal_app' ? 'PORTAL_APP_PASSWORD' : 'PORTAL_MIGRATE_PASSWORD';
  if (!env[key] || String(env[key]).trim() === '') throw new Error(`supabase.env has no ${key}.`);
  return { ...base, user: `${role}.${owner.ref}`, password: env[key], tlsMode: tls.mode, ref: owner.ref };
}

// --target local|staging (default local) — the NAME alone, read from the
// arguments and nothing else, so a guard can refuse a flag BEFORE any secret
// file is opened (D-65).
function targetName(argv = process.argv) {
  const i = argv.indexOf('--target');
  const name = i >= 0 ? argv[i + 1] : 'local';
  if (name !== 'local' && name !== 'staging') throw new Error(`Unknown --target ${name}`);
  return name;
}

// { name, pg, tlsMode }. `role` applies to staging only.
function targetConfig(argv = process.argv, role = 'portal_migrate') {
  const name = targetName(argv);
  if (name === 'local') return { name, pg: localConfig(), tlsMode: 'none (local loopback)' };
  const cfg = stagingConfig(role, argv);
  if (!cfg) throw new Error(`No staging secrets at ${SECRETS_FILE} — create it first (docs/06 §0 lists the three keys).`);
  const { tlsMode, ref, ...pg } = cfg;
  void ref;
  return { name, pg, tlsMode };
}

// The one place a destructive flag (--drop-first, --truncate) may act: the
// embedded cluster on the loopback address, its own port and its own database,
// without TLS. A target that merely CALLS itself local is not enough.
function isDisposableLocal(target) {
  return Boolean(
    target
      && target.name === 'local'
      && target.pg
      && target.pg.host === '127.0.0.1'
      && target.pg.port === LOCAL_PG.port
      && target.pg.database === LOCAL_PG.database
      && !target.pg.ssl
  );
}

// What an OPEN pg connection actually negotiated — printed by the scripts that
// connect to staging. Certificate names are public; nothing here is a secret.
function tlsFacts(client) {
  const s = client && client.connection && client.connection.stream;
  if (!s || typeof s.getPeerCertificate !== 'function') return { encrypted: false, note: 'plain TCP (no TLS socket)' };
  const cert = s.getPeerCertificate(false) || {};
  return {
    encrypted: s.encrypted === true,
    protocol: typeof s.getProtocol === 'function' ? s.getProtocol() : null,
    chain_verified: s.authorized === true,
    authorization_error: s.authorizationError ? String(s.authorizationError) : null,
    subject_cn: cert.subject ? cert.subject.CN || null : null,
    issuer_cn: cert.issuer ? cert.issuer.CN || null : null,
    valid_to: cert.valid_to || null,
    subject_alt_names: cert.subjectaltname || null,
  };
}

module.exports = {
  sourceConfig,
  localConfig,
  stagingConfig,
  stagingKeysMissing,
  parseOwnerUrl,
  targetName,
  targetConfig,
  isDisposableLocal,
  tlsFacts,
  LOCAL_PG,
  STAGING_KEYS,
  ROLES,
  SECRETS_FILE,
  CA_FILE,
};
