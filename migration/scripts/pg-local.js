#!/usr/bin/env node
// A private PostgreSQL 17 for rehearsals, from the embedded-postgres binaries
// installed in the tooling folder. Everything lives under <DATA_DIR>/pg17.
//
//   node scripts/pg-local.js serve    initialise if needed, start, stay up
//                                     until SIGINT/SIGTERM (run in background)
//   node scripts/pg-local.js stop     pg_ctl stop on the data directory
//   node scripts/pg-local.js status   is it answering?
//
// initdb tries the ICU provider first (what Supabase-era servers have), and
// falls back to libc "C" if this build refuses; which one it got is printed
// and recorded in the data directory's INIT_FLAGS file, because the collation
// matrix depends on it.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { dep, TOOLING_DIR } = require('../lib/deps');
const { LOCAL_PG, localConfig } = require('../lib/env');
const { safeMessage } = require('../lib/safeMessage');
const P = require('../lib/paths');

const mod = dep('embedded-postgres');
const EmbeddedPostgres = mod.default || mod;

const ICU_FLAGS = ['--encoding=UTF8', '--locale-provider=icu', '--icu-locale=en-US', '--locale=C'];
const LIBC_FLAGS = ['--encoding=UTF8', '--locale=C'];
const INIT_MARK = path.join(P.PG_LOCAL_DIR, 'INIT_FLAGS');

function instance(initdbFlags) {
  return new EmbeddedPostgres({
    databaseDir: LOCAL_PG.dataDir,
    user: LOCAL_PG.user,
    password: LOCAL_PG.password,
    port: LOCAL_PG.port,
    persistent: true,
    initdbFlags,
    onLog: () => {},
    onError: (m) => process.stderr.write(String(m)),
  });
}

async function initialiseIfNeeded() {
  if (fs.existsSync(path.join(LOCAL_PG.dataDir, 'PG_VERSION'))) {
    return fs.existsSync(INIT_MARK) ? fs.readFileSync(INIT_MARK, 'utf8').trim() : 'unknown';
  }
  fs.mkdirSync(P.PG_LOCAL_DIR, { recursive: true });
  try {
    await instance(ICU_FLAGS).initialise();
    fs.writeFileSync(INIT_MARK, `${ICU_FLAGS.join(' ')}\n`);
    return 'icu';
  } catch (error) {
    console.log(`initdb with ICU refused (${safeMessage(error)}); retrying with libc C`);
    fs.rmSync(LOCAL_PG.dataDir, { recursive: true, force: true });
    await instance(LIBC_FLAGS).initialise();
    fs.writeFileSync(INIT_MARK, `${LIBC_FLAGS.join(' ')}\n`);
    return 'libc-C';
  }
}

async function serve() {
  const provider = await initialiseIfNeeded();
  const pg = instance(provider === 'icu' ? ICU_FLAGS : LIBC_FLAGS);
  await pg.start();
  try {
    await pg.createDatabase(LOCAL_PG.database);
    console.log(`created database ${LOCAL_PG.database}`);
  } catch (error) {
    if (!/already exists/.test(String(error && error.message))) throw error;
  }
  const cfg = localConfig();
  console.log(`READY local PostgreSQL on ${cfg.host}:${cfg.port} database=${cfg.database} user=${cfg.user} initdb=${provider}`);
  const stop = async () => {
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => {}, 1 << 30);
}

function pgCtl(args) {
  const bin = path.join(TOOLING_DIR, 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin', 'pg_ctl.exe');
  if (!fs.existsSync(bin)) throw new Error(`pg_ctl not found at ${bin}`);
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  return r.status;
}

async function status() {
  const { pool } = require('../lib/pg');
  const p = pool(localConfig());
  try {
    const { rows } = await p.query('SELECT version() AS v, current_setting(\'server_version\') AS sv');
    console.log(`UP ${rows[0].sv} — ${rows[0].v}`);
  } catch (error) {
    console.log(`DOWN (${error.code || safeMessage(error)})`);
    process.exitCode = 1;
  } finally {
    await p.end();
  }
}

const cmd = process.argv[2] || 'serve';
if (cmd === 'serve') serve().catch((e) => { console.error('pg-local serve failed:', safeMessage(e)); process.exit(1); });
else if (cmd === 'stop') process.exit(pgCtl(['stop', '-D', LOCAL_PG.dataDir, '-m', 'fast']));
else if (cmd === 'status') status();
else { console.error('usage: pg-local.js serve|stop|status'); process.exit(2); }
