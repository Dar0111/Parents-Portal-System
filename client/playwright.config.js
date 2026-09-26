import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// SMOKE-1's config. Deliberately small: one browser, one worker, no HTML
// report, no trace viewer. What this run produces is 264 screenshots and a
// list of failures with URLs in them — both readable without a UI.

// `.env.e2e` by hand rather than by dotenv: one less dependency for six
// variables, and doing it here makes the "values never leave this file"
// rule visible instead of implied. The file is gitignored (verified with
// `git check-ignore` BEFORE it existed) and its values are never printed —
// a missing one fails naming the VARIABLE, in `e2e/auth.js`.
// THE TEMPLATE MUST STAY EMPTY, and this refuses to run if it does not.
//
// The two filenames differ by `.example` and sit in the same folder, which is
// a real trap and caught the first person to use it: the values went into the
// COMMITTED template instead of the gitignored file, on a branch already
// pushed to a public repo. Nothing leaked — the edit was uncommitted and was
// caught before `git add` — but the margin was one command.
//
// So the guard fails CLOSED rather than relying on the names being distinct
// enough to notice. It names the variable and never prints the value; that is
// the same rule `e2e/auth.js` follows for a missing one, and it matters more
// here, because the whole point is that this value should not exist.
const EXAMPLE_FILE = new URL('./e2e/.env.e2e.example', import.meta.url);
if (existsSync(EXAMPLE_FILE)) {
  const filled = [];
  for (const line of readFileSync(EXAMPLE_FILE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(eq + 1).trim() !== '') filled.push(trimmed.slice(0, eq).trim());
  }
  if (filled.length > 0) {
    throw new Error(
      `client/e2e/.env.e2e.example is a COMMITTED template and must hold names only, ` +
      `but ${filled.length} variable(s) have a value: ${filled.join(', ')}.\n` +
      `Move them to client/e2e/.env.e2e (gitignored) and empty the template. ` +
      `Do not commit this file with values — the branch is pushed to a public repo.`
    );
  }
}

const ENV_FILE = new URL('./e2e/.env.e2e', import.meta.url);
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Existing environment wins, so a shell variable can override the file
    // without editing it.
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

export default defineConfig({
  testDir: './e2e',

  // outputDir, and NOT the defaults: Playwright would otherwise create
  // `test-results/` and `playwright-report/` in `client/`, two untracked
  // folders nobody asked for. Everything this run writes goes to one
  // gitignored place.
  outputDir: 'e2e-out/_artifacts',
  reporter: [['list']],

  // ONE WORKER. Three roles against one dev database, and a parallel run
  // makes a console error hard to attribute — which is the whole output of
  // this suite. It also keeps the screenshots in a readable order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,

  // A page that takes more than 30s is a finding, not something to wait out.
  timeout: 90_000,
  expect: { timeout: 10_000 },

  use: {
    headless: true,
    // NOT baseURL — every navigation in the spec is absolute, through
    // APP_ORIGIN, so the CORS-origin rule in `e2e/auth.js` is stated once
    // and cannot be bypassed by a relative goto.
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },

  // The readiness poll lives in `e2e/auth.js` as its default export, rather
  // than in a file of its own: being able to reach the API and the app is a
  // precondition of logging in, which is what that module is about.
  globalSetup: './e2e/auth.js',
});
