// SMOKE-1 — a READ-ONLY sweep of every sidebar page, for every role, at two
// widths and in both themes. 67 account-URL visits (40 URLs) x 2 x 2 = 268 screenshots.
//
// WHAT THIS IS FOR: §5h says a page is not done until it has been opened in
// a browser, and Darryl opens them. This does not replace that — a person
// still has to LOOK. What it replaces is the part a person should not have
// to do: opening thirty-six pages four times each to find out whether any of
// them logs an error, requests something that 4xx's, renders no heading, or
// scrolls sideways on a phone. It fails on facts; the screenshots are for
// judgement.
//
// IT NEVER CLICKS ANYTHING THAT WRITES. No Save, Approve, Decline, Delete,
// Create backup, Restore, Mark all Present. The only click in the whole run
// is the login button. Visiting Admin -> Backup & Restore is a read; touching
// it is not, and a restore drops the database.
//
// TWO THINGS IT CANNOT SEE, stated so a green run is not over-read:
//   - anything behind an interaction, since it does not interact;
//   - anything that only a person notices — DV4's invisible average was
//     perfectly valid markup, and F2's "Term 3 - C" was a correct render of
//     the wrong term. Both needed eyes. That is why the screenshots exist.
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { APP_ORIGIN, login } from './auth.js';
import { PAGES, THEMES, WHO, WIDTHS } from './pages.js';

// THE ONLY ALLOWED CONSOLE ERROR, matched as a substring and nothing wider.
// React StrictMode double-invokes SocketProvider's effect in dev, so the
// first socket is closed while still connecting. Recorded in §5h as not a
// transport problem and absent from a production build. A looser pattern
// here would hide the errors this suite exists to find.
const ALLOWED_CONSOLE = ['WebSocket is closed before the connection is established'];

const OUT = 'e2e-out';

// NOT `mode: 'serial'`. It was, and the first run proved why that is wrong
// for a sweep: one failure in the first test SKIPPED THE OTHER ELEVEN, so a
// single bad selector cost the whole report. `workers: 1` in the config
// already runs these one at a time, which is all the ordering this needs.
// A sweep must survive its own failures — finding one problem is not a
// reason to stop looking for the others.

for (const role of Object.keys(PAGES)) {
  for (const theme of THEMES) {
    test.describe(`${WHO[role]} — ${theme}`, () => {
      for (const width of WIDTHS) {
        test(`${width.name}`, async ({ browser }) => {
          const context = await browser.newContext({ viewport: width.viewport });

          // BEFORE navigation, not after: index.html applies the theme in an
          // inline script that runs ahead of the bundle (§8), so setting it
          // later would repaint a page that had already rendered light.
          // localStorage only — there is no settings endpoint for the theme
          // and `routes/settings.js` allow-lists five keys, none of them
          // this. Nothing server-side is written.
          await context.addInitScript(
            ([key, value]) => {
              try {
                window.localStorage.setItem(key, value);
              } catch {
                // Private windows and blocked storage: the app survives it
                // and so does this (§8's own try/catch rule).
              }
            },
            ['pp.theme', theme]
          );

          const page = await context.newPage();

          // Collected per PAGE, not per run, so a failure names the URL.
          let consoleErrors = [];
          let badResponses = [];
          let failedRequests = [];
          let loggedIn = false;

          page.on('console', (msg) => {
            if (msg.type() !== 'error') return;
            const text = msg.text();
            if (ALLOWED_CONSOLE.some((allowed) => text.includes(allowed))) return;
            consoleErrors.push(text);
          });

          page.on('response', (res) => {
            // A 401 from /auth/me BEFORE login is the app asking whether a
            // stored token is still good, and the honest answer is no. After
            // login it would be a real defect, which is why this is gated on
            // the flag rather than on the path alone.
            if (!loggedIn) return;
            const status = res.status();
            if (status >= 400) badResponses.push(`${status} ${res.request().method()} ${res.url()}`);
          });

          // DIAGNOSTIC ONLY — no retry, no wait, no behaviour change.
          //
          // A request that never gets a response never reaches the handler
          // above, so `net::ERR_CONNECTION_REFUSED` only ever showed up as
          // an anonymous console error: "Failed to load resource", with no
          // URL. Three runs in seven have failed that way, always the first
          // test, always the admin dashboard — and every report so far could
          // say WHAT happened but not to WHICH request.
          //
          // `requestfailed` fires for exactly those, carrying the URL and
          // the transport-level reason. The next occurrence names the
          // endpoint, which is what an INVESTIGATE needs and what a warm-up
          // guessed at and got wrong.
          page.on('requestfailed', (req) => {
            if (!loggedIn) return;
            failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText || 'no reason given'}`);
          });

          await login(page, role);
          loggedIn = true;

          mkdirSync(`${OUT}/${role}/${theme}`, { recursive: true });

          // A SWEEP MUST SURVIVE ITS OWN FAILURES AT THE PAGE LEVEL TOO.
          // The first real run proved it twice: `mode: 'serial'` let one bad
          // selector skip eleven tests, and then a genuine finding on
          // /teacher/grades threw out of this loop and hid every teacher page
          // after it. Problems are collected per page and asserted once at
          // the end, so one defect costs one line of the report instead of
          // the rest of the sweep.
          const problems = [];
          const note = (path, message) => problems.push(`${path}: ${message}`);

          for (const path of PAGES[role]) {
            consoleErrors = [];
            badResponses = [];
            failedRequests = [];

            await page.goto(`${APP_ORIGIN}${path}`, { waitUntil: 'networkidle' });

            // THE HEADING. There is exactly one <h1> in the app — Header.jsx
            // renders it from nav.js by path, or from usePageTitle on a
            // detail view. Empty means the page rendered a shell with no
            // identity, which is what a blank-page defect looks like from
            // outside (the 2026-09-22 one shipped past build, oxlint AND an
            // SSR render).
            const headings = page.locator('h1');
            const headingCount = await headings.count();
            if (headingCount === 0) {
              note(path, 'no <h1> at all');
            } else {
              // MORE THAN ONE is a finding, not a tolerance: Shell renders
              // the page's <h1> from nav.js, so a second one is two
              // top-level headings in one document and a screen reader
              // announces two page titles.
              if (headingCount > 1) {
                const texts = await headings.allInnerTexts();
                note(path, `${headingCount} <h1> elements — ${texts.map((t) => JSON.stringify(t.trim())).join(', ')}`);
              }
              if ((await headings.first().innerText()).trim() === '') {
                note(path, 'the page heading is empty');
              }
            }

            // Vite's error overlay is a custom element; its presence means
            // the dev server failed to compile something and the page the
            // screenshot shows is not the page.
            if ((await page.locator('vite-error-overlay').count()) > 0) {
              note(path, 'Vite error overlay is on screen');
            }

            // HORIZONTAL SCROLL AT 390px. The document is the only scroller
            // (§9), so scrollWidth > clientWidth on <html> means something
            // overflows the viewport — the in-table scroller lives in its own
            // wrapper and must never reach the document.
            if (width.name === '390px') {
              const overflow = await page.evaluate(() => {
                const el = document.documentElement;
                return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
              });
              if (overflow.scrollWidth > overflow.clientWidth) {
                note(path, `horizontal scroll at 390px (${overflow.scrollWidth} > ${overflow.clientWidth})`);
              }
            }

            const file = path.replace(/^\//, '').replace(/\//g, '_') || 'root';
            await page.screenshot({
              path: `${OUT}/${role}/${theme}/${file}__${width.name}.png`,
              fullPage: true,
            });

            for (const e of consoleErrors) note(path, `console error — ${e}`);
            for (const r of badResponses) note(path, `bad response — ${r}`);
            for (const r of failedRequests) note(path, `request FAILED (no response) — ${r}`);
          }

          await context.close();

          // One assertion, every finding in it. The screenshots are already
          // written by now, which is the point: a failing sweep still leaves
          // the evidence a person has to look at.
          expect(problems, `${WHO[role]} · ${theme} · ${width.name} — ${problems.length} finding(s)`).toEqual([]);
        });
      }
    });
  }
}
