// Connection settings. Values are read from files and kept in objects — they
// are never copied into process.env, never logged and never returned to a
// caller that prints.
//
//   source   MySQL — the running application's server/.env (read-only use)
//   local    the embedded PostgreSQL this package starts for rehearsals
//   staging  the Supabase project — <DATA_DIR>/secrets/supabase.env, written
//            by the owner, never pasted into a chat. Expected keys:
//              PG_URL=postgresql://…   (preferred; the direct or pooler URL)
//            or PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
//              PG_SSL=require|verify-full (default require)
const fs = require('fs');
const path = require('path');
const { dep } = require('./deps');
const P = require('./paths');

const dotenv = dep('dotenv');

function readEnvFile(file) {
  if (!fs.existsSync(file)) return null;
  return dotenv.parse(fs.readFileSync(file));
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

function stagingConfig() {
  const env = readEnvFile(path.join(P.SECRETS_DIR, 'supabase.env'));
  if (!env) return null;
  if (env.PG_URL) {
    return { connectionString: env.PG_URL, ssl: sslOption(env.PG_SSL) };
  }
  return {
    host: env.PGHOST,
    port: Number(env.PGPORT) || 5432,
    database: env.PGDATABASE || 'postgres',
    user: env.PGUSER,
    password: env.PGPASSWORD,
    ssl: sslOption(env.PG_SSL),
  };
}

function sslOption(mode) {
  if (mode === 'verify-full') return true;
  return { rejectUnauthorized: false };
}

// --target local|staging  (default local)
function targetConfig(argv = process.argv) {
  const i = argv.indexOf('--target');
  const name = i >= 0 ? argv[i + 1] : 'local';
  if (name === 'local') return { name, pg: localConfig() };
  if (name === 'staging') {
    const pg = stagingConfig();
    if (!pg) throw new Error(`No staging secrets at ${path.join(P.SECRETS_DIR, 'supabase.env')} — create it first.`);
    return { name, pg };
  }
  throw new Error(`Unknown --target ${name}`);
}

module.exports = { sourceConfig, localConfig, stagingConfig, targetConfig, LOCAL_PG };
