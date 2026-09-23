// SMOKE-1 — a READ-ONLY sweep of every sidebar page, for every role, at two
// widths and in both themes. 36 URLs x 2 x 2 = 144 screenshots.
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

test.describe.configure({ mode: 'serial' });

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

          await login(page, role);
          loggedIn = true;

          mkdirSync(`${OUT}/${role}/${theme}`, { recursive: true });

          for (const path of PAGES[role]) {
            consoleErrors = [];
            badResponses = [];

            await page.goto(`${APP_ORIGIN}${path}`, { waitUntil: 'networkidle' });

            // THE HEADING. There is exactly one <h1> in the app — Header.jsx
            // renders it from nav.js by path, or from usePageTitle on a
            // detail view. Empty means the page rendered a shell with no
            // identity, which is what a blank-page defect looks like from
            // outside (the 2026-09-22 one shipped past build, oxlint AND an
            // SSR render).
            const heading = page.locator('h1');
            await expect(heading, `${path}: no <h1>`).toHaveCount(1);
            const headingText = (await heading.innerText()).trim();
            expect(headingText, `${path}: the page heading is empty`).not.toBe('');

            // Vite's error overlay is a custom element; its presence means
            // the dev server failed to compile something and the page the
            // screenshot shows is not the page.
            await expect(
              page.locator('vite-error-overlay'),
              `${path}: Vite error overlay is on screen`
            ).toHaveCount(0);

            // HORIZONTAL SCROLL AT 390px. The document is the only scroller
            // (§9), so scrollWidth > clientWidth on <html> means something
            // overflows the viewport — the in-table scroller lives in its own
            // wrapper and must never reach the document.
            if (width.name === '390px') {
              const overflow = await page.evaluate(() => {
                const el = document.documentElement;
                return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
              });
              expect(
                overflow.scrollWidth,
                `${path}: horizontal scroll at 390px (${overflow.scrollWidth} > ${overflow.clientWidth})`
              ).toBeLessThanOrEqual(overflow.clientWidth);
            }

            const file = path.replace(/^\//, '').replace(/\//g, '_') || 'root';
            await page.screenshot({
              path: `${OUT}/${role}/${theme}/${file}__${width.name}.png`,
              fullPage: true,
            });

            expect(consoleErrors, `${path}: console errors`).toEqual([]);
            expect(badResponses, `${path}: 4xx/5xx responses`).toEqual([]);
          }

          await context.close();
        });
      }
    });
  }
}
