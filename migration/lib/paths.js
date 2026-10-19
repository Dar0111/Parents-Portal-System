// Where things live. Nothing here holds a value from .env.
//
//   REPO_ROOT   this worktree (…/Parents_Portal-pg-migration)
//   APP_TREE    the tree the running application uses (…/Parents_Portal) —
//               the source .env and server/backups/ live there and are only
//               ever READ by this package (override: MIGRATION_APP_TREE)
//   DATA_DIR    …/Parents_Portal-migration-data — every file this package
//               produces (snapshots, manifests, rehearsal output, the local
//               PostgreSQL data directory, secrets) goes here, never into a
//               repo and never into server/backups (override: MIGRATION_DATA_DIR)
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const APP_TREE = process.env.MIGRATION_APP_TREE || path.resolve(REPO_ROOT, '..', 'Parents_Portal');
const DATA_DIR = process.env.MIGRATION_DATA_DIR || path.resolve(REPO_ROOT, '..', 'Parents_Portal-migration-data');

module.exports = {
  REPO_ROOT,
  APP_TREE,
  DATA_DIR,
  SOURCE_ENV_FILE: process.env.MIGRATION_SOURCE_ENV || path.join(APP_TREE, 'server', '.env'),
  APP_BACKUPS_DIR: path.join(APP_TREE, 'server', 'backups'),
  SCHEMA_DIR: path.join(REPO_ROOT, 'migration', 'schema'),
  SERVER_SRC_DIR: path.join(REPO_ROOT, 'server'),
  SECRETS_DIR: path.join(DATA_DIR, 'secrets'),
  SNAPSHOT_DIR: path.join(DATA_DIR, 'snapshots'),
  MANIFEST_DIR: path.join(DATA_DIR, 'manifests'),
  REHEARSAL_DIR: path.join(DATA_DIR, 'rehearsal'),
  PG_LOCAL_DIR: path.join(DATA_DIR, 'pg17'),
};
