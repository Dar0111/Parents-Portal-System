// Dependency resolution for the migration package.
//
// The repo's house rule is that no shell command writes repo files, so the
// package's dependencies are installed OUTSIDE the worktree, in
// <MIGRATION_DATA_DIR>/tooling (see that folder's package.json). This helper
// tries a normal require first (a future `npm install` inside migration/
// works unchanged) and falls back to the tooling folder.
const path = require('path');
const { createRequire } = require('module');
const { DATA_DIR } = require('./paths');

const TOOLING_DIR = process.env.MIGRATION_TOOLING_DIR || path.join(DATA_DIR, 'tooling');

// A require() anchored INSIDE the tooling folder, so bare names resolve
// through its node_modules and a package's "exports" map is honoured (an
// ESM-only package such as embedded-postgres cannot be loaded by a directory
// path; Node 24 can require() an ES module by its bare name).
const toolingRequire = createRequire(path.join(TOOLING_DIR, 'package.json'));

function dep(name) {
  try {
    return require(name);
  } catch (first) {
    try {
      return toolingRequire(name);
    } catch (second) {
      const error = new Error(
        `Cannot load "${name}". Install it in migration/ or in ${TOOLING_DIR} (npm install --prefix "${TOOLING_DIR}").`
      );
      error.cause = second;
      throw error;
    }
  }
}

module.exports = { dep, TOOLING_DIR };
