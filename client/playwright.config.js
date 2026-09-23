import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// SMOKE-1's config. Deliberately small: one browser, one worker, no HTML
// report, no trace viewer. What this run produces is 144 screenshots and a
// list of failures with URLs in them — both readable without a UI.

// `.env.e2e` by hand rather than by dotenv: one less dependency for six
// variables, and doing it here makes the "values never leave this file"
// rule visible instead of implied. The file is gitignored (verified with
// `git check-ignore` BEFORE it existed) and its values are never printed —
// a missing one fails naming the VARIABLE, in `e2e/auth.js`.
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
