// THE MESSAGES THREAD, IN A REAL BROWSER (feat/shared-messages, commit 1).
//
// What it locks, on every role's thread page (admin, teacher, parent):
//   (a) a thread opens at its NEWEST message — with unread messages too, where
//       marking them read keeps the first-load spinner up (the follow-up's F1,
//       2026-10-06);
//   (b) the message box is in the window when a thread opens (F2);
//   and "Load earlier messages" keeps the reader's place — the list moves to
//   the end only when the newest message changes.
// Written before feat/shared-messages moved the thread into one component
// (commit 1, against the two old pages), so the refactor had to keep all three.
//
// HOW: Vite builds scripts/loop/messages-thread/entry.jsx — the REAL thread
// pages, with the api, auth, socket and unread modules swapped for the
// fixtures in mocks.jsx by the plugin below — into .ssr-tmp/loop-messages/
// (ignored by git and by lint, deleted at the end of every run). Headless
// Chromium opens it at 1366×600, the owner's laptop window, served by
// Playwright's own request interception: no server, no port, no API, no
// database, no sign-in, so it writes nothing and needs nobody's servers. The
// geometry is the app's: the fonts, the stylesheet and Shell's frame.
//
// THE CONTROLS ARE PART OF THE RUN, and a run without them is not green. Each
// rebuilds the pages with one change made IN MEMORY by the plugin (no file is
// edited) and must turn its own check red:
//   A — the pre-fix effect: the newest message is recorded while the list is
//       not on screen yet → (a) fails with unread messages;
//   B — no keepBoxInView when a thread opens → (b) fails;
//   C — the newest-id check removed → "Load earlier" jumps to the end.
// A control must change THREAD_FILES — each file exactly once, nothing else —
// or the run fails: a control whose target moved must not pass by accident.
//
// Run from client/:  node scripts/loop-messages-thread.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from '@playwright/test';

const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = path.join(CLIENT, 'scripts', 'loop', 'messages-thread');
const ENTRY = path.join(HARNESS, 'entry.jsx');
const MOCKS = path.join(HARNESS, 'mocks.jsx');
const OUT = path.join(CLIENT, '.ssr-tmp', 'loop-messages');
const ORIGIN = 'http://loop.test';
const VIEWPORT = { width: 1366, height: 600 };
const COMPOSER = 'textarea[aria-label="Write a message"]';

// The four modules the stand-ins replace.
const MOCKED = ['src/api/axios.js', 'src/auth/AuthContext.jsx', 'src/realtime/SocketProvider.jsx', 'src/realtime/UnreadProvider.jsx'];

// Where the thread's positioning lives. Each control must change each of these
// exactly once. Commit 1 named the two thread pages; since the refactor
// (commit 2) every role's page is a wrapper around the one shared component,
// so a control changes that file and nothing else.
const THREAD_FILES = ['src/pages/messages/MessageThread.jsx'];

// Shell's frame, as entry.jsx copies it: each class list must still be in its
// source, or the stand-in has drifted from the app.
const FRAME = [
  ['src/layout/Shell.jsx', 'className="flex min-h-screen bg-page"'],
  ['src/layout/Shell.jsx', 'sticky top-0 hidden h-screen shrink-0 flex-col self-start border-r border-edge bg-surface md:flex'],
  ['src/layout/Shell.jsx', "collapsed ? 'w-16' : 'w-64'"],
  ['src/layout/Shell.jsx', 'className="flex min-w-0 flex-1 flex-col"'],
  ['src/layout/Shell.jsx', 'className="min-w-0 flex-1 space-y-6 p-4 sm:p-6 lg:p-8"'],
  ['src/layout/Header.jsx', 'className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-edge bg-surface px-4 sm:px-6 lg:px-8"'],
];

const CONTROLS = {
  A: {
    what: 'the pre-fix effect',
    find: /if \(!list \|\| loading \|\| loadedForRef\.current !== otherId\) return;/g,
    replace:
      'if (!list || loading || loadedForRef.current !== otherId) { positionedForRef.current = otherId; lastIdRef.current = messages[messages.length - 1]?.id ?? null; return; }',
    target: { unread: 6, paged: false, check: 'a' },
  },
  B: {
    what: 'no keepBoxInView on open',
    find: /if \(opening\) \{\s*keepBoxInView\(composerRef\.current\);\s*return;\s*\}/g,
    replace: 'if (opening) { return; }',
    target: { unread: 6, paged: false, check: 'b' },
  },
  C: {
    what: 'the newest-id check removed',
    find: /if \(!opening && lastId === lastIdRef\.current\) return;/g,
    replace: '',
    target: { unread: 0, paged: true, check: 'earlier' },
  },
};

const ROLES = ['admin', 'teacher', 'parent'];
const CASES = [
  { unread: 6, paged: false, label: '6 unread' },
  { unread: 0, paged: false, label: '0 unread' },
  { unread: 0, paged: true, label: 'two pages' },
];

const results = [];
function report(ok, line) {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
}

function rel(id) {
  return path.relative(CLIENT, id.split('?')[0]).replace(/\\/g, '/');
}

function harnessPlugin(control, applied) {
  return {
    name: 'loop-messages-harness',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || rel(importer) === rel(MOCKS)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      // Vite's own spelling of the path (forward slashes), the one entry.jsx's
      // import of './mocks.jsx' resolves to: two spellings would be two
      // modules, each with its own counters and hook values.
      return MOCKED.includes(rel(resolved.id)) ? normalizePath(MOCKS) : null;
    },
    transform(code, id) {
      if (!control) return null;
      const file = rel(id);
      if (!file.startsWith('src/')) return null;
      const hits = code.match(control.find);
      if (!hits) return null;
      applied.set(file, hits.length);
      return { code: code.replace(control.find, control.replace), map: null };
    },
  };
}

async function bundle(name, control) {
  const outDir = path.join(OUT, name);
  const applied = new Map();
  await build({
    configFile: false,
    envDir: false,
    publicDir: false,
    root: CLIENT,
    logLevel: 'error',
    plugins: [harnessPlugin(control, applied), react(), tailwindcss()],
    build: {
      outDir,
      emptyOutDir: true,
      rolldownOptions: {
        input: ENTRY,
        output: { entryFileNames: 'loop.js', assetFileNames: 'assets/[name]-[hash][extname]' },
      },
    },
  });
  const css = fs
    .readdirSync(path.join(outDir, 'assets'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => `<link rel="stylesheet" href="/assets/${f}">`)
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${css}</head><body><div id="root"></div><script type="module" src="/loop.js"></script></body></html>`;
  return { outDir, html, applied };
}

// Measured inside the page: the list is the scroller around the newest
// message, the box is the composer.
function measure(newest) {
  const bubble = [...document.querySelectorAll('p')].find((p) => p.textContent === newest);
  let list = bubble;
  while (list && getComputedStyle(list).overflowY !== 'auto') list = list.parentElement;
  const box = document.querySelector('textarea[aria-label="Write a message"]');
  if (!bubble || !list || !box) return null;
  const l = list.getBoundingClientRect();
  const b = bubble.getBoundingClientRect();
  const c = box.getBoundingClientRect();
  return {
    scrollTop: list.scrollTop,
    clientHeight: list.clientHeight,
    scrollHeight: list.scrollHeight,
    newestInList: b.top >= l.top - 1 && b.bottom <= l.bottom + 1,
    boxTop: c.top,
    boxBottom: c.bottom,
    innerHeight: window.innerHeight,
    pageScrolls: document.documentElement.scrollHeight > window.innerHeight,
    modules: window.__loopModules,
    reads: window.__loop.reads,
    unknown: window.__loop.unknown.slice(),
  };
}

function atNewest(m) {
  return m.scrollTop + m.clientHeight >= m.scrollHeight - 2 && m.newestInList;
}

async function settled(page) {
  await page.waitForFunction(
    (composer) => window.__loop && window.__loop.inflight === 0 && document.querySelector(composer),
    COMPOSER,
    { timeout: 15_000 }
  );
  await page.waitForTimeout(300);
}

// One role, one case: the checks it yields, each { key, ok, detail }.
async function runCase(context, built, role, c) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.route(`${ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: built.html });
    const file = path.join(built.outDir, decodeURIComponent(pathname));
    if (!file.startsWith(built.outDir) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: file });
  });
  const total = c.paged ? 80 : 30;
  const newest = `Fixture message ${total}, the newest`;
  const checks = [];
  try {
    await page.goto(`${ORIGIN}/?role=${role}&unread=${c.unread}&paged=${c.paged ? 1 : 0}`);
    await settled(page);
    const m = await page.evaluate(measure, newest);
    if (!m) throw new Error('the list, the newest message or the box is not on the page');
    if (m.modules !== 1) throw new Error(`the stand-ins loaded ${m.modules}×, not once`);
    if (m.scrollHeight <= m.clientHeight + 100) throw new Error(`the fixture does not overflow the list (${m.scrollHeight}/${m.clientHeight})`);
    if (!m.pageScrolls) throw new Error('the page does not scroll at this size, so (b) could not fail');
    const where = `list ${Math.round(m.scrollTop)}+${m.clientHeight}/${m.scrollHeight}`;
    if (!c.paged) {
      checks.push({ key: 'a', ok: atNewest(m), detail: where });
      checks.push({ key: 'b', ok: m.boxTop >= 0 && m.boxBottom <= m.innerHeight, detail: `box ${Math.round(m.boxTop)}–${Math.round(m.boxBottom)} of ${m.innerHeight}` });
      const want = c.unread > 0 ? 1 : 0;
      checks.push({ key: 'reads', ok: m.reads === want, detail: `read-all ${m.reads}×, expected ${want}×` });
    } else {
      // The reader goes up to the top of the list and asks for the page before.
      const opened = atNewest(m);
      await page.evaluate((composer) => {
        const box = document.querySelector(composer);
        let list = [...document.querySelectorAll('p')].find((p) => /^Fixture message/.test(p.textContent));
        while (list && getComputedStyle(list).overflowY !== 'auto') list = list.parentElement;
        list.scrollTop = 0;
        const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Load earlier messages');
        if (!button || !box) throw new Error('no "Load earlier messages" button');
        button.click();
      }, COMPOSER);
      await page.waitForFunction(
        (oldest) => window.__loop.inflight === 0 && [...document.querySelectorAll('p')].some((p) => p.textContent === oldest),
        'Fixture message 1',
        { timeout: 15_000 }
      );
      await page.waitForTimeout(300);
      const after = await page.evaluate(measure, newest);
      const kept = after.scrollTop + after.clientHeight < after.scrollHeight - 100;
      checks.push({
        key: 'earlier',
        ok: opened && kept,
        detail: `opened at the newest ${opened}; after: list ${Math.round(after.scrollTop)}+${after.clientHeight}/${after.scrollHeight}`,
      });
    }
    if (m.unknown.length) checks.push({ key: 'fixtures', ok: false, detail: `requests with no fixture: ${m.unknown.join(', ')}` });
  } catch (err) {
    checks.push({ key: 'setup', ok: false, detail: err.message.split('\n')[0] });
  }
  if (errors.length) checks.push({ key: 'errors', ok: false, detail: `page error: ${errors[0].split('\n')[0]}` });
  await page.close();
  return checks;
}

const WORDS = {
  a: '(a) opens at the newest message',
  b: '(b) the message box is in the window',
  reads: 'marks read only when something is unread',
  earlier: '"Load earlier messages" keeps the reader\'s place',
  fixtures: 'every request has a fixture',
  setup: 'the case ran',
  errors: 'no page error',
};

function frameMatchesShell() {
  const missing = FRAME.filter(([file, text]) => !fs.readFileSync(path.join(CLIENT, file), 'utf8').includes(text));
  report(missing.length === 0, `the stand-in frame is Shell's (sidebar, 64px header, <main> padding)${missing.length ? ` — missing in ${missing.map(([f]) => f).join(', ')}` : ''}`);
}

async function main() {
  frameMatchesShell();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });

    const real = await bundle('real', null);
    for (const role of ROLES) {
      for (const c of CASES) {
        for (const check of await runCase(context, real, role, c)) {
          report(check.ok, `${role} · ${c.label} · ${WORDS[check.key]}${check.ok ? '' : ` — ${check.detail}`}`);
        }
      }
    }

    for (const [name, control] of Object.entries(CONTROLS)) {
      const built = await bundle(`control-${name}`, control);
      const changed = [...built.applied.entries()].sort();
      const expected = [...THREAD_FILES].sort();
      const appliedRight =
        changed.length === expected.length && changed.every(([file, n], i) => file === expected[i] && n === 1);
      report(
        appliedRight,
        `control ${name} (${control.what}) changes each thread file once${appliedRight ? '' : ` — changed: ${changed.map(([f, n]) => `${f} ×${n}`).join(', ') || 'nothing'}`}`
      );
      const c = CASES.find((x) => x.unread === control.target.unread && x.paged === control.target.paged);
      for (const role of ROLES) {
        const check = (await runCase(context, built, role, c)).find((x) => x.key === control.target.check);
        const red = Boolean(check) && !check.ok;
        report(red, `control ${name} · ${role} · ${c.label} · ${WORDS[control.target.check]} fails as it must${red ? '' : ' — it did not go red'}`);
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(OUT, { recursive: true, force: true });
  }

  const passed = results.filter(Boolean).length;
  console.log(`loop-messages-thread: ${passed}/${results.length}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(`loop-messages-thread failed: ${err.message.split('\n')[0]}`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(1);
});
