# Mobile conventions — Stage 5 (Expo)

> The full text behind `CLAUDE.md` → STAGE 5 MOBILE CONVENTIONS. That section
> holds the rule and the pointer; this file holds the reasoning, the worked
> mechanism and what each dispatch measured. Frozen per section as each branch
> lands; **M1–M8 froze with `feat/mobile-scaffold` on 2026-09-27.** The web's
> `docs/FRONTEND_CONVENTIONS.md` still governs every rule it states — this file
> records only where the phone is DIFFERENT, and why.

The base decisions, all Darryl's (2026-09-27, PLAN APPROVED for Stage 5):
Expo SDK 57 in Expo Go (the Play Store build, auto-update off on the phone);
in-app notifications via Socket.io only, no `expo-notifications`; text size
dropped in favour of the OS font scale; notifications as a screen; Font
Awesome 7 through `@fortawesome/react-native-fontawesome`; React Navigation
drawer; the school seal as icon and splash; a 15 000 ms axios timeout;
Teacher → Attendance gets `beforeRemove` (on the Teacher branch).

---

## M1. `mobile/` is its own package — no shared code, only proved copies

`mobile/` has its own `package.json`, its own `node_modules` and its own lint,
beside `server/` and `client/` (LOCKED DECISIONS: separate folders, no
workspaces, no monorepo tooling). Nothing is imported across the three.

**A module the web already owns is COPIED, byte for byte, and
`mobile/scripts/check-mirrors.mjs` proves the copy equal on every mobile
dispatch.** Sharing would need Metro `watchFolders` plus Vite
`server.fs.allow`, a `file:` dependency (a copy at install time with no
proof) or a symlink (unreliable on Windows) — each is the tooling the locked
decision refuses. The check compares each pair after CRLF normalisation and
names the first differing line. **A deliberate divergence is a new mobile
file, never an edit to a mirrored one.** The six pairs as of the scaffold:
`api/extractError.js`, `auth/authFailure.js`, `auth/roles.js`,
`layout/nav.js` → `navigation/nav.js`, `format/passwordRule.js`,
`format/contactRule.js`. The school calendar joined the list on the Parent
branch as a three-way copy (server → client → mobile). **Now 24 pairs —
`mobile/scripts/check-mirrors.mjs` is the list**, and it also compares the
calendar with the server's by value.

**Renderers are rewritten, never copied.** `grade.jsx` and `TermValue.jsx`
emit `<span>`; the mobile twins emit `<Text>` over the same copied logic. Same
names, same states, same "never a bare dash" (§3).

The copies are ESM `.js` files in a package with no `"type"` field. Metro
does not care; Node does, for the proofs that import them — hence
`--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` on every `proof:*` script.
Setting `"type": "module"` was rejected: `metro.config.js`, `babel.config.js`
and `tailwind.config.js` must stay CommonJS for Expo's tooling.

## M2. Tokens are GENERATED from the web's stylesheet — one source, two derived files

React Native's colour parser knows hex, `rgb(a)` and `hsl(a)`, not `oklch()`
or `color-mix()`, and RN has no `data-theme` attribute. So
`mobile/scripts/check-tokens.mjs` reads `client/src/index.css` — the first
`:root` block (light) and the `[data-theme="dark"]` block — converts every
value and writes two files:

| File | Holds | Used by |
|---|---|---|
| `mobile/src/theme/tokens.js` | `{ light, dark, names }`, CommonJS | `tailwind.config.js` (the class names), and the places a class cannot reach: `StatusBar`, the navigator's theme, an SVG icon's `color` |
| `mobile/global.css` | the same values as custom properties under `@layer base`: light in `:root`, dark under `@media (prefers-color-scheme: dark)` | NativeWind — the block it swaps when the colour scheme changes |

**The plain run (`npm run lint:tokens`) regenerates in memory and fails if
either file differs from what `index.css` now says**, so a token added,
renamed or re-valued on the web fails the mobile lint until
`npm run tokens:write` is run and the diff reviewed. Names are checked three
ways against the web before anything is written (`:root`, the dark block and
`@theme inline` must agree). **A value in a shape the script does not know
THROWS** — it never guesses a hex.

The conversion is Björn Ottosson's OKLab reference, probed against seven
Tailwind v4 palette hexes before the script was written (slate-50 → `#f8fafc`,
slate-900 → `#0f172b`, slate-950 → `#020618`, emerald-700 → `#007a55`,
rose-600 → `#ec003f`, sky-500 → `#00a6f4`, amber-400 → `#ffb900`), all seven
exact. `color-mix(… N%, transparent)` becomes `rgba(…, N/100)`;
`rgb(R G B / A)` becomes `rgba(R,G,B,A)`. 71 tokens × 2 themes as of
2026-09-27.

**The seal palette (`feat/ui-palette`, 2026-10-01) reached the phone through
this script and nothing else**: most non-status values in `index.css` are now
hex (lower-cased on the way through), the backdrop is
`color-mix(in oklab, #hex N%, transparent)` (the hex branch of the same
rule), and the three gold decoration tokens are `rgb(200 150 20 / α)`.
`npm run tokens:write` changed 36 light and 38 dark values in both derived
files; no screen, `tailwind.config.js` or mirror changed. The phone has no
separate palette and no per-screen override — Login and Forgot password use
the app's tokens like every other screen. **A parsing trap worth knowing:**
the script takes the FIRST `:root` in `index.css`, which is the word inside
the file's header comment, and then the first `{` after it — which today is
the real `:root {` block. A `{` written into that header comment would make
the script read the wrong text.

**`tailwind.config.js` REPLACES the palette (`theme.colors`, not
`extend.colors`)**: `bg-slate-500` does not exist in this project, so the
compiler enforces §8 before the lint does. Every colour class is a token name
resolving to `var(--name)`.

**`npm run lint:colors`** is the web's `check-color-tokens.mjs` plus one
RN-specific rule: a hex / `rgb()` / `hsl()` string literal anywhere under
`src/` other than `theme/tokens.js` fails, because a `style={{ color: '#fff' }}`
never passes through Tailwind and the web's three regexes would not see it.
An icon's `color` prop reads `tokens['fg-faint']`, never a literal.

## M3. The theme is NativeWind's colour scheme, stored on the device, Light by default

`src/theme/theme.js` mirrors `client/src/pages/settings/theme.js`: key
`pp.theme` in AsyncStorage, values light / dark / system, **default Light on a
fresh device** (Darryl, 2026-09-19 — not System). `applyTheme` hands the
preference to NativeWind's `colorScheme.set()`, which is what resolves the
`prefers-color-scheme` media block in `global.css` — the phone's `data-theme`.
`system` is handed through as `system` so it follows the OS live;
`ThemeProvider` re-resolves on `Appearance` changes only while the stored
preference is `system`. No print branch: nothing on a phone prints.

`ThemeProvider` exposes `tokens` — the hex table for the RESOLVED theme — for
the handful of non-className consumers. Everything with a `className` reads
the variables and never touches it.

**The text-size setting is dropped on mobile (decision 3).** The web's
Normal / Large is an `html` class scaling a rem type scale; a phone already
has this at the OS level, and every `<Text>` keeps `allowFontScaling` at its
default of `true`. Settings → Personalization on the Parent branch offers
Theme only. **This is a declared deviation from the web, not an omission.**

## M4. Auth parity — the same three rules, one structural difference

`src/api/client.js` is the twin of `client/src/api/axios.js`: `unwrap` or
`raw` mandatory, a missing key throws naming what was missing and what came
back, the array form copies only the keys named (the `term_averages` lesson),
`raw` returns the full response, `listParams` and `fetchAll` unchanged.
Three differences, each stated in the file's header:

1. **The token is in `expo-secure-store`** (`src/auth/tokenStore.js`), read
   once at boot into an in-memory mirror; the request interceptor awaits a
   PROVIDER the store registers, so `client.js` imports nothing native and a
   Node proof can load it. Three writers: login, `applyToken`, the 401
   branch.
2. **A 401 cannot redirect.** The interceptor clears the store and calls the
   session-ended listener `AuthContext` registers; the root navigator swaps
   to the auth stack because `user` is null. **The reason travels in memory**
   (`takeLogoutReason`, read once by Login), never in a navigation param — a
   param is the phone's URL, and §5c says nothing about the session goes in
   a URL.
3. **`timeout: 15000`** (decision 8). The web has none; a dead hotspot would
   otherwise hang a screen forever. axios files it as `ECONNABORTED` with no
   response, which `classifyAuthFailure` already keeps.

Everything else is §22 verbatim: only a 401 ends a session; a 503, no
response or a timeout renders `AuthUnavailable` with Try again and the token
kept; the forced change is routed on `user.must_change_password` from
`/auth/me`, never on the 403; `applyToken` stores the replacement BEFORE
re-reading `/me`.

**The root navigator IS `ProtectedRoute` + `RootRedirect`.** Which stack is
MOUNTED is decided from context, in the web's order (loading → authError →
!user → must_change_password → home). A `Stack.Screen` that is not mounted
cannot be navigated to, which is what makes the guards structural rather than
a redirect that could loop.

**The native splash is released when the THEME is ready, never held for
`/auth/me` (phone check, 2026-09-27).** The first build held it until the
session read finished, and on the 503 check the phone sat on Expo Go's white
loading view for 30+ seconds: under that overlay nothing of ours can render,
the dev menu does not open, and there is no way out but a force-close. The
web never had this hazard — its "no login flash" is a spinner of its own. So
the order is theme applied → splash hidden → **our** `LoadingSpinner` on
`bg-page` while the session reads → Login, `AuthUnavailable` or the home.
The 15 s timeout guarantees the spinner ends. **Do not move the hide back
behind the session read.**

**Boot trace.** `AuthContext` and `RootNavigator` print `[boot] …` lines
under `__DEV__` — Expo forwards `console.log` to the Metro terminal, the one
channel a phone stuck at boot still has. Token PRESENCE and the status code
only; never the token, never a login id.

## M5. The network is the hotspot, and the proof order is fixed

`EXPO_PUBLIC_API_URL` in `mobile/.env` (gitignored by the root `.env` rule,
proved with `git check-ignore` before the file existed) is the laptop's IPv4
on the phone's hotspot plus `:5000/api`. Expo inlines it at bundle time —
**changing it means restarting `npx expo start`**. The socket origin is
derived by stripping `/api`, never set separately.

**What actually opened the port on 2026-09-27 was not a port rule.** Windows
already held a program-level Allow for `D:\node.js\node.exe` on the Public
and Private profiles ("Node.js JavaScript Runtime", the rule the
allow-prompt creates), which covers every port node.exe listens on — the API's
5000 and Metro's 8081 alike. The two named port rules the plan proposed were
not found afterwards; the program rule is the one to look for
(`Get-NetFirewallRule -Direction Inbound | Get-NetFirewallApplicationFilter`).
A hotspot lands on the **Public** profile, so a rule scoped to Private does
nothing.

The order, and it does not change: phone Chrome reaches
`http://<ip>:5000/api/health` with `"db":"ok"` FIRST; only then
`npx expo start`. The DEV-only Connection screen (`src/screens/dev/`) shows
the URL the bundle was built with and repeats that request from inside the
app — the Expo equivalent of `/dev/ui`, **excluded at Metro's resolver
(`src/screens/dev/**` is the empty module when `!context.dev`) and grepped
absent from `npx expo export` output before each commit**, with a positive
control (a production string that must be present).

**Why the resolver and not `__DEV__` — two measurements, stated as
measurements.** The first production export carried every string of the
Connection screen (a static import keeps a module in the graph whatever any
branch says) AND the label of a `__DEV__ ? <Link/> : null` branch in two
screens — so a `__DEV__` JSX branch is not removed code. A later export of
the same toolchain dropped the strings of `if (__DEV__) console.log(...)`
lines entirely. Which constructs the Babel → Hermes pipeline folds is not
established here, and "the export does not inline `__DEV__`" — written on
the first measurement — was an inference, not a fact. **Do not build an
exclusion rule on `__DEV__`; the resolver rule is measured and holds, and
the grep with its positive control is what proves it each time.**

Two traps recorded from the first run: **npm during a Wi-Fi switch fails with
`ECONNRESET` and `create-expo-app` prints "Your project is ready!" anyway** —
check for `package-lock.json` before believing it; and the laptop's four
APIPA adapters can make Expo CLI pick the wrong interface, fixed with
`REACT_NATIVE_PACKAGER_HOSTNAME=<ip>`.

**Cleartext.** Expo Go allows plain `http://` to a LAN IP. A standalone or
development build does not in release; it needs `expo-build-properties` with
`android.usesCleartextTraffic: true` (KNOWN ISSUES).

## M6. The template's agent files do not survive the scaffold

`create-expo-app` (SDK 57 blank template) generates `CLAUDE.md`
(`@AGENTS.md`), `AGENTS.md` and `.claude/settings.json` inside the project.
**All three were deleted in the scaffold commit.** `AGENTS.md` is Expo's
generic instruction set — "Use Expo Router for all navigation", `npx tsc`,
`npx expo lint` — and a nested `CLAUDE.md` would inject it into every session
working under `mobile/`, against decision 6 and against the repo's rule that
its root `CLAUDE.md` is the one source of truth. The template's six
placeholder PNGs and `App.js` went too: the seal is icon, adaptive icon and
splash (decision 7), and the entry is `App.jsx`. The template's `.gitignore`,
`index.js` and `LICENSE` stay as generated.

## M7. Lint and proofs — what a mobile dispatch reports

Four lint figures, one set, run AFTER the last file is written (§17a):
`npm run lint` (oxlint, `no-undef` on, `__DEV__` and `process` as globals,
`src/theme/tokens.js` under `env.node` because it is CommonJS by design),
`npm run lint:mirrors`, `npm run lint:tokens`, `npm run lint:colors`. The
baselines live in `docs/TESTING.md` → Lint baselines (mobile) and Mobile
proofs. oxlint 1.85 carries a `react(set-state-in-effect)` advisory the web's
1.79 does not; the one hit is `AuthContext.readSession` setting `loading`
before its await — the web's own shape — and it is stated, not absorbed.

A proof is plain Node under `mobile/scripts/`, drives pure modules, prints a
count, and says in its header what it cannot prove. **There is no render
proof on mobile** — React Native does not render under Node — so **every
screen is proved on the phone**, both themes, every text field typed a full
word, the error path seen once. The phone check list per branch is on its
CHANGELOG row; the scaffold's is: sign in as each seeded role · the 401 path
(change the fixture parent's password on the web to bump `token_version`; the
phone logs out with the reason) · the 503 path (stop MySQL; `AuthUnavailable`,
token kept, Try again recovers) · Light / Dark / System on the role home.

**A phone check that writes ends with cleanup by id, backup first**, exactly
as the web's browser checks: `GET /api/health` answers → `POST /api/backups`
returns 201 → write. Tala Halimbawa is the fixture learner; every suite stays
on Marwin; never during a server suite.

**Reload by COLD BOOT — force-close Expo Go and reopen the project — never
by `r` in the Metro terminal (measured 2026-09-27).** Over the hotspot, `r`
printed "› Reloading apps" with no "Bundled" line after it twice in one
evening and left the phone on Expo Go's spinner; a cold boot loaded every
time. A check result read off an `r` reload is not a result: the first
"401 path shows no message" was one of those stuck reloads, and the cold boot
passed. Two more facts about that overlay: while it is up the shake gesture
opens no dev menu (Expo Go disables it during load), so "no dev menu" is not
evidence that the JS crashed; and Metro's "(1 module)" on a warm reload is
the delta count, not a broken bundle.

**Before RECORDING the phone for a demo, hide Expo Go's floating tools
button and any phone edge-panel overlay** (Darryl, `feat/ui-polish` check,
2026-09-30). Both float over the app and cover real controls — the From ×
on Teacher → Attendance records was hidden by one — so a recording shows a
screen the app does not actually draw.

**The scaffold's phone check (2026-09-27):** Connection check 200 in 76 ms;
ADMIN001, TCH-001 and Tala's parent each on the role home; Light / Dark /
System all flipping (System read the phone's night mode); the 401 path on a
cold boot with a stale token → Login with the session-ended sentence; the
forced change (TCH-002 temp password → new password → home). **The 503 path
FAILED**: MySQL stopped, cold boot with a stored token → Expo Go's spinner
for 30+ s, and Terminal 1 logged no `Authenticate: database unreachable:`
for it, while the same cold boot reaches `/auth/me` with MySQL up. **The
re-check on the released-splash build PASSED:** `[boot]` printed token
present → `/auth/me -> 503 (unavailable)` → the navigator with
`authError="Database unreachable."`, Terminal 1 logged the one request, the
phone showed "Can't reach the school server" with Try again, and Try again
after MySQL started landed on the role home. The first build's boot made no
request and nothing measured says why — the row is closed as not reproduced,
with the cause stated as not established (`docs/KNOWN_ISSUES.md`). **All
seven checks passed on 2026-09-27 and the branch merged.**

## M8. Icons are the web's names, resolved once

`navigation/nav.js` is a verbatim copy of the web's, so it names icons as
`fa-gauge`, `fa-lock`. `src/icons.js` maps every name the app uses to a FA 7
SVG object from `@fortawesome/free-solid-svg-icons` (matching the web's
`fontawesome-free` 7.3.1) and renders it through
`@fortawesome/react-native-fontawesome` over `react-native-svg`. **An unmapped
name throws in DEV** — a missing glyph beside a label is invisible in a
screenshot, the same silent failure §5h warns about; production falls back to
the info glyph so a typo cannot blank a screen. An icon's `color` is a token
value from `ThemeProvider`, never a literal (M2).

The seal (`src/components/Seal.jsx`) always sits on its `seal-bg` disc, white
in both themes, with the web's alt text as `accessibilityLabel` (§9).

---

## M9. The shell: a drawer named by paths, and a route map that is pure

**Frozen 2026-09-27 (`feat/mobile-parent`; M9–M12 with the branch).** The phone's `Shell`
is `navigation/AppShell.jsx`: a drawer per role built from the verbatim
`nav.js`, inside a native stack that holds the screens which are not nav
items (Notifications, the Settings sub-screens; later the thread, the
reading views, compose, the grade breakdown).

**A drawer route is NAMED BY ITS PATH.** Two web-shaped strings arrive on the
phone — a nav item's `to` and a notification's `link`, both `/parent/…` — and
naming the route by that string means both navigate with what they already
carry. `navigation/routes.js` maps path → screen NAME and **stays pure** (no
RN import) so `scripts/proof-routes.mjs` can load it; `AppShell.jsx` is the
one file that maps a name to a component. Adding a screen is two lines.

**Unbuilt is decided by the route map, not by `nav.js`'s `built` flag.**
`nav.js` is a copy of the web's, where every item is built. A path with no
route renders dimmed in the drawer with "not on the phone yet" as its
accessible name — §6's unbuilt state, reintroduced exactly as CLAUDE.md
said Stage 5 would — and a notification whose link is unbuilt opens the
role's home instead (`linkToRoute`). Nothing throws on an unknown path.
Teacher and admin therefore get the drawer now with Settings and About live
and the rest dimmed, and `RoleHome` as their placeholder home (decision 3;
until branch 4 — M16: `RoleHome.jsx` is gone).

**The strip is in the navigator's layout, not in each screen.** Both
navigators wrap every screen with `LiveStatus` through `screenLayout`, which
is §5g's "wherever anything depending on the channel is shown": the badges
are in the drawer and the bell is in every header, so that is every screen.

**The same layout owns the BOTTOM SAFE AREA (re-check finding,
2026-09-27).** Android runs edge-to-edge here, so the system navigation bar
overlays the bottom of every screen: on the first re-check it sat on the
thread's composer and on the drawer's Logout, and the status bar sat on the
drawer's seal. `AppShell.ScreenFrame` pads every screen's bottom by
`useSafeAreaInsets().bottom` on the page colour, applied through
`screenLayout` in the drawer, the detail stack AND the auth stack (there
without the strip, since the providers are not mounted). The headers own
the top inset. **The drawer is outside every screen layout and pads both
edges itself** (`DrawerContent`: the scroll view's top, the footer's
bottom). A screen never adds its own bottom inset on top of the frame.

**Badges are joined at the row.** `DrawerContent.badgeFor` is the web's
`badgeFor`: Messages from `UnreadProvider`, the rest from
`NotificationProvider`, admin's Announcements carrying memos, a badge only
on a built item. Nothing sums the two providers.

**The menu button carries a DOT when any drawer badge is above zero — a
mobile addition, declared here (phone check, 2026-09-27).** The web's
narrow-screen header has no badge on its hamburger (`layout/Header.jsx`)
because its sidebar is on screen from `md` up; on a phone the drawer is
closed nearly always, so a Messages badge nobody can see is a count that
does not exist — a message rang no bell (correct, messages are not in the
bell) and the phone showed nothing at all. The dot is presence only; the
numbers stay on the drawer rows. It is the sum of the rows' own badges,
each the server's (§10), so it answers a different question from the bell's
count and neither is derived from the other. `AppShell.MenuButton`.

## M10. The socket on a phone: three additions, no server change

`realtime/SocketProvider.jsx` keeps the web's contract — one socket, two
events, receive-only, a latency optimisation never the delivery path — and
adds what a phone needs:

1. **`auth` is a function**, evaluated on every (re)connect, so a session
   that came back through `applyToken` reconnects with the fresh token.
2. **`AppState`**: Android drops idle sockets in the background; on return to
   `active` the provider calls `connect()`. socket.io's own reconnection
   covers the rest.
3. **`subscribeConnect`**: both count providers refetch on every connect,
   because a background gap may have missed a `notification_counts`. A
   refetch, never a count computed on the phone (§10).

**`LiveStatus` Refresh reconnects and refetches both counts** (decision 4);
every list has pull-to-refresh for its own rows. The strip's copy is the
web's. **No server file changed**: `server/socket.js` verifies
`handshake.auth.token` and joins `user:<id>` for any client.

**The providers mount only around a signed-in tree.** A count provider
mounted with no token fires a request, takes the 401, and stores a logout
reason for a session that never existed — so `RootNavigator` wraps the
navigator in the three providers only when `user` exists and is not on the
forced-change screen.

## M11. Lists without DataTable: one card contract, a FlatList, no local sort

`components/DataList.jsx` is the phone's `DataTable`: presentational, never
fetches, loading / error / empty inside the frame, rows in the server's
order. Paging is the caller's: `hasMore` + `onLoadMore` renders a "Show
more" footer against the API's `page.has_more`, and `onRefresh` gives
pull-to-refresh. **Nothing is sorted on the phone** — a list arrives in the
order the endpoint chose, and a sort control is a `sort` param, not
`Array#sort`.

`components/RecordCard.jsx` renders the web's `renderCard` DATA contract
(§5a-iii): `avatar`, `title`, `subtitle`, `meta`, `status` + `statusTone`,
and exactly one interactive element, `onSelect`. That is why a page's card
builder copies verbatim (`parent/excuseLetters/card.jsx`). One mobile
addition: `unread`, for the Notifications rows — a dot AND a bolder title, so
read and unread differ by more than colour.

**The Notifications screen is the web's bell panel as a screen** (decision
4): same rows, same page size of 8, same two writes, the row's `link`
resolved through `routes.js`. Opening a row marks it read and asks the
provider to refetch; nothing subtracts one.

**Settings is a list of rows pushing sub-screens** (decision 2). `tabs.js` is
a verbatim copy, so the rows and their order are the web's; the screen each
opens is looked up by LABEL, because the web keys admin's first tab and
everyone else's on the same empty `to`. Account information is the ONE
screen that shows a parent's `login_id`, masked until Show is tapped (§5c).
Change password confirms with a native `Alert` naming the decision (§5e).
Personalization is Theme only (M3).

**The parent screens (branch 2, second half) keep these shapes:**

- **A reading view is a PUSHED screen and renders the LIST ROW it was given**
  — excuse letters, announcements, memos, events — never `GET /:id` (§20c;
  the three content endpoints have no `GET /:id` at all). One `PostRead`
  screen carries the three content kinds; only the meta line differs.
- **Compose and the grade breakdown are MODAL screens** (`presentation:
  'modal'`), the two the web opened as dialogs. Compose navigates back to the
  list WITH `notice` in the route params; the list shows it above its rows
  (§7c) and re-reads on that focus only, not on every focus.
- **A bounded filter auto-applies** through `components/Segmented.jsx` — the
  status chips, Upcoming / All, the four term segments (§21). **The page
  action is on its own row, neutral, out of the filter** (the web's §21e):
  beside the chips it squeezed them and cut "Declined" off (phone check,
  2026-09-27). `DataList` keeps the list's 16px gutter around its header in
  every branch, the empty one included — "New message" sat flush against
  the edge before the first conversation existed.
- **A date from the native picker is a STRING built from its local parts**
  (`getFullYear` / `getMonth` / `getDate`), never `toISOString()` (§5a-iv);
  `maximumDate` mirrors the server's not-in-the-future rule and the server
  still decides.
- **The report card is the web's NARROW branch only** — four segments and one
  row per learning area; the wide SF9 table is not built on a phone. Two
  renderers for the Final cell by mode (§5a-v), no General Average box in
  Key Stage 1 (§14c), and `initial_grade` is in the payload and never
  rendered.
- **The month grid is five columns of letter pills**; the year record scrolls
  sideways with its row labels fixed; "Also recorded" carries a weekend row.
- **`KeyboardAvoidingView` uses `behavior="padding"` on Android as well as
  iOS (re-check 2 finding, 2026-09-27).** With edge-to-edge, Android no
  longer resizes the window for the keyboard, so the iOS-only line every
  form carried left the thread's composer behind it. The screen frame's
  bottom inset and the view's padding add up to exactly the keyboard's
  height, so no `keyboardVerticalOffset` is set. Every screen with a text
  field near the bottom — the thread, compose, the two Settings forms, the
  three auth screens — carries the same line.
- **The thread's "Load earlier" is the web's button with the web's wording**
  (decision 5), paged by `before=<id>`; it writes read-all on open exactly as
  the web does, and the badge refetches.
- **The pure half of each page lives in a `logic.js` beside it**
  (`dashboard/`, `reportCard/`, `attendance/`), the web's functions lifted
  unchanged so a proof can drive them (§17b).

## M12. Writes on the phone, and the cleanup that follows every check

Every write a phone check makes ends with cleanup **by id**, and the order
is the working agreement's: `GET /api/health` answers → `POST /api/backups`
returns 201 → the delete → assert zero left. **The cleanup is a scratchpad
Node script on the server pool** (correction a): run from `server/` so its
`.env` and `config/db.js` resolve, `dotenv` required by absolute path, the
admin token never printed. The checkpoint's run is the pattern:

```
1. health: 200 {"db":"ok"}          3. backup: 201 parents_portal_2026-09-27_114346.sql
4. before: notifications(memo,96) = 6   5. DELETE /api/memos/96: 200 — notifications left: 6
6. SQL deleted 6; left = 0; memo rows left = 0      7. Ligaya contact: 09171234567 -> 09170000007
```

**A content DELETE endpoint removes its row and NOTHING ELSE** (measured on
`DELETE /api/memos/:id`, 2026-09-27; the announcements and events handlers
have the same shape): the fan-out's `notifications` rows — one per
recipient, six for one memo — stay behind, hidden by the read-time
visibility re-check and never deleted (`docs/API_REFERENCE.md` →
Notifications: "nothing deletes the row and there is no cleanup job"). So
cleanup after any web action that fanned out is **the API delete, then SQL
by `item_type` + `item_id`, then a count that must be zero** (correction b).

| Write on the phone | Rows it creates | Cleanup |
|---|---|---|
| `POST /excuse-letters`, `PUT /excuse-letters/:id` | `excuse_letters` (Tala), one `excuse_submitted` notification to the adviser, `activity_logs` | no delete endpoint: SQL `notifications` by (`excuse_letter`, id) then `excuse_letters` by id; the review's `excuse_reviewed` row the same way |
| `POST /messages` (and the teacher's reply) | `messages`, both directions | no delete endpoint: SQL by id |
| `PATCH /messages/read-all/:id`, `PATCH /notifications/:id/read`, `read-all` | none; flips on fixture rows | none — the rows go with their items |
| `PUT /auth/contact` | none; Ligaya's number | restore the fixture value `09170000007` (`migrate-fixture-learner.js`) — read it first; the checkpoint did not and had to look it up |
| `PUT /auth/change-password` | none; `token_version` | restore the seed password through the same screen; a web session for the account 401s once, expected |
| a teacher's or admin's web action (memo, announcement, event, review) | its row + one notification per recipient | the API delete, then the notifications by `item_type` + `item_id`, assert zero |

`activity_logs` rows are audit history and are never cleaned. Tala Halimbawa
is the fixture learner and Ligaya her parent; every suite stays on Marwin;
never during a server suite.

**Proofs that import the app's modules register a resolve hook.** Metro
resolves `'../format/date'`; Node's ESM loader needs the `.js`. Each proof
registers one hook from a `data:` URL (`node:module`'s `register`) that
appends `.js` to a relative, extensionless specifier and nothing else, then
imports the module dynamically — no new file, no `"type": "module"`.

## M13. Grades on a phone: one slot at a time, the web's guard driven by React Navigation

**Branch 3, 2026-09-28. Darryl's decision 1: the save confirmation is an
inline panel with the web's full lists.**

The web's class record is one sheet of 30-odd columns. The phone keeps the
**same data, the same request and the same server**, and changes only what is
on screen at once: Teacher → Grades is Subject → Class → Term and then the
fixed frame (WW1–5, PT1–3, ST1 / ST2 / TE) as a LIST, each row naming its
highest possible score ("Set HPS" when it has none) and "N of M scored". A
row opens the **slot screen**, the only place anything is typed or saved; the
list re-reads on focus so a save shows on return.

- **The request is the web's, by construction.** `classRecord/buildPayload.js`
  is a verbatim copy; the slot screen only ever writes drafts for its own
  column, so the body carries that one slot (by `type` + `slot_no` when it is
  new, by `slot_id` when it exists), its scores and — for a Summative part —
  the class-wide maxima. `proof:one-slot` drives it with those drafts.
  `classRecord/useSlotRecord.js` is the web's `useClassRecord` over the
  phone's api module (not a mirror: its imports differ).
- **Set HPS is a dry run; Save all writes** (the working agreement's line):
  typing the HPS or a score sends `PUT /grades/class-record` with
  `dry_run: true` after 400 ms, and the live line under each learner (the
  group's total, PS, WS, Initial, Term or Letter) is the server's answer,
  dimmed while one is in flight. Save writes the slot, the typed components
  and a `grades` row for each learner given a score. **A row for EVERY
  active learner (a shell row) comes only from a save that carries the
  Summative maxima** — `server/routes/grades.js` fans `exam_max` out to the
  whole class and creates rows where there are none. Measured 2026-09-28: a
  WW1-only save with a score for Tala left Marwin with no row.
- **The leave guard is `classRecord/backGuard.js`, verbatim.** The web's
  machine decides; only what its actions DO changes. `push` and `back` are the
  web's history sentinel and are no-ops on a phone (a cancellable removal
  needs no sentinel); `ask` is a native Alert with the web's words ("Leave
  without saving?" / Stay on this page / Leave and discard); and
  `usePreventRemove` is armed exactly while the machine's `armed` is true.
  The slot screen is a STACK screen, so Back is a real removal and the prompt
  fires. `proof:back-guard` drives every transition and the action map.
- **The term is pinned once** from the school calendar (a lazy `useState`,
  §13g) and the segment overrides it; encode scope is `GET /assignments`
  only, never `useTeacherTargets`.

## M14. The attendance roster, and where the approved `beforeRemove` can fire

**Branch 3, 2026-09-28. Darryl's decision 2: a date or section change with
unsaved marks prompts in-screen too.**

The encode screen is the web's phone card list (§17c): one card per learner,
the four full-word buttons 44px tall, `pickStatus` / `markRestPresent` /
`rosterCounts` from the verbatim `attendance/roster.js` (`proof:roster`), and
a pinned Save bar with the unsaved count. Counts only, never a rate.

**MEASURED IN THE ROUTER, NOT ASSUMED: a DRAWER screen is never removed.**
`@react-navigation/routers`' drawer router keeps every route in its state and
changes only the index — a drawer item, the header's menu and the hardware
Back (`backBehavior: 'firstRoute'`) all move the index. So `beforeRemove`
cannot fire on Teacher → Attendance, and the screen stays MOUNTED: **its
unsaved marks survive a trip to another screen and are there on return.**
The approved prompt is wired anyway (`usePreventRemove`, for any real
removal), and the prompt that DOES fire is the in-screen one — a date or
section change reloads the roster and would discard the marks, so it asks
first with the same words. **Not covered, and stated:** signing out, or the
app being killed, discards unsaved marks with no prompt — neither is a
navigation. A prompt on the drawer jump itself would need the drawer to know
about the screen's state; it was not built, because nothing is lost there.
Accepted by Darryl on 2026-09-28; sign-out and a killed app are a LOW
`docs/KNOWN_ISSUES.md` row.

**THE OTHER SIDE OF "NEVER UNMOUNTED": A READ SCREEN GOES STALE (F1,
2026-09-28).** The same fact that keeps unsaved marks alive kept Attendance
records showing its first fetch: a day saved on Attendance afterwards did not
appear until a filter was re-applied. **A drawer screen that shows what
another screen writes fetches in `useFocusEffect`, not a mount-only
`useEffect`** — it runs on every focus and whenever the fetch changes while
focused. Found on Records, the screen that reads what Attendance writes.

## M15. The teacher's lists and writes

**Branch 3, 2026-09-27/28.**

- **A staged filter carries Apply, Reset and the cue** (`components/
  FilterActions.jsx`, §21): Students (search + section), Excuse Letters and
  Events (status or grade + range), Attendance records (section + range).
  **One bounded control auto-applies** (Announcements' section).
  `components/filterState.js` is a verbatim copy.
- **A date is `components/DateField.jsx`** (SCOPE EXPANSION, approved): a
  YYYY-MM-DD string in and out, built from the picker's LOCAL parts, never
  `toISOString()`; `maximumDate` mirrors a server rule. **The birthday rule
  is the server's and only the server's: a valid date, not in the future**
  (`validateStudentOptionals`); the web sets no limit either, so today is
  accepted on both — no age rule was invented (first-half finding,
  2026-09-28).
- **`RecordCard` renders `actions` only on a static card**, as data
  (`[{ label, onPress, tone }]`), so the verbatim card builders pass through
  whatever the screen hands them. Edit / Delete are author-only; Delete is a
  native Alert naming the post (§5e).
- **ONE composer.** "Announce to a class" on the thread (role-gated on the
  shared thread screen) opens `AnnouncementCompose` with the unsent draft and
  a target only from the contacts row; the composer re-validates it.
- **A notification link must carry the viewer's own role prefix**
  (`linkToRoute`, found by `proof:routes` once `/teacher/...` was built).
- **The report card is one view, two readers** (`parent/ReportCardView.jsx`):
  the parent's Grades, and the teacher's read-only learner screen from the
  class summary — no breakdown tap there.
- **The class summary is a sideways sheet with a fixed learner column**
  (Darryl's decision 3): two halves side by side, every row one fixed height
  on both, the subjects and the Average scrolling. No print on the phone.
- **Enrol is one modal screen with the web's four phases** (decision 4), and
  Create parent on a record opens the same screen at its parent phase.

**Cleanup for this branch's writes** (M12's order, backup first, zero
counts): the first-half check left a fictional learner, its pending parent,
a declined letter, two messages and the fan-out of two announcements, one
event, the letter and the pending parent — 11 `notifications` rows, all
deleted by `(item_type, item_id)` on 2026-09-28 with Tala compared by value
before and after. **The second half writes the class key** (`grades` rows —
for every learner only if Summative maxima were saved — `assessment_slots`,
`grade_components`, possible `grade_available` notifications) **and one
attendance date**; both are empty before the check, so the cleanup deletes
everything under them by key, guarded by the ids a read-only survey found.
Run 2026-09-28: 1 grade row, 1 slot, 1 component, 2 attendance rows, 0
notifications; Marwin 0 grade rows before and after.

## M16. The admin shell: eight items, one web-only item hidden, one Settings

**Branch 4, 2026-09-29. Darryl's fixed decision: Backup & Restore is web
only — no screen, no nav item.**

- **The nav is the verbatim `nav.js`, so it still lists Backup & Restore.**
  `routes.js` names it in `WEB_ONLY`, and `AppShell` drops a web-only item
  before the drawer sees the list: **hidden, not dimmed** — a dimmed row
  would claim the page is coming. A notification link to it opens the admin
  home. The admin sees eight items: Dashboard, Users, Students, Grades,
  Attendance, Announcements, Settings, About.
- **One Settings, and the web's words.** The drawer item is Settings for
  every role; the verbatim `tabs.js` gives the admin a first row, **School
  settings** — the school's details, with the school year locked and the term
  derived from the calendar — then Account information, Change password and
  Personalization (the theme). No second "Settings" exists to clash with.
- **The dashboard's System card shows the last backup's age and links to
  School settings, never to backups**, and says the feature is on the web.
- **`RoleHome.jsx` is gone** (Darryl, Q4): every role has a real home.
- **A modal screen returns to the drawer with `popTo('Main', …)`, never
  `navigate('Main', …)`** (A1, 2026-09-29). React Navigation 7's stack
  goes back to an existing route only when it is the current one or `pop`
  is set; otherwise `navigate` PUSHES a second `Main` — a fresh drawer whose
  screens have lost their state. Measured on the real `StackRouter`:
  `navigate` left `[Main, GradeLock, Main]`, `popTo` left `[Main]` with the
  original key. Fixed on the five admin modal screens (branch 4) and on
  every other return on `fix/mobile-popto` (`5440bca`): the parent letter
  compose, four teacher screens, Notifications, a record's return from
  Enroll (`popTo('StudentDetail', …)`) and the sign-in stack's Forgot
  password (`popTo('Login')`). `proof:routes` drives the real router and
  scans `mobile/src` for any `navigate('Main'` or `navigate('Login'`.
- **Every admin screen re-fetches on focus** (M14; Darryl's A4) — the
  dashboard, Users and School settings — and Users asks the bell's provider
  to refetch too, so the Users badge follows a review (§10: a refetch, never
  a decrement).

## M17. Sensitive admin actions, and the one value shown once

**Branch 4, 2026-09-29.** Each action confirms exactly as the web does (§5e,
decided by whether the API can undo it): **create teacher, edit, and
deactivate / activate do not confirm** (the undo is deactivate, or the same
endpoint); **approve / reject confirm and name the decision** ("…cannot be
returned to pending afterward"), a rejection needing a reason; **reset
password is two phases** — confirm by name, then the password shown once.
Your own active account shows "You cannot deactivate yourself" instead of
the control; the last-active-admin refusal is the server's 400, shown.

**The temporary password** (`admin/users/TempPasswordModal.jsx`):

- lives only in that popup's state — never a navigation param (they persist
  in navigation state), never a status line, never a log;
- is cleared on close AND **when the app leaves the foreground** (Darryl's
  A3), which also closes the popup;
- is covered by **`expo-screen-capture`** (Darryl, Q1) — Android's secure
  flag, set only while a password is on screen and lifted when it clears;
- has **no Copy button** (Darryl, Q2, a declared difference): the phone's
  clipboard can keep it in a history the app cannot clear. In development,
  Expo's attached network inspector can still see the response; a
  production build has none.

**Every live-DB write outside a suite accepts a backup only when it is
COMPLETE** (branch 4, after three first-call resets left truncated or empty
dumps): a 201, its `backups` row, a real size and the "-- Dump completed on"
footer — else one retry, else nothing is written. Any `.sql` the run left
with no row is listed and never deleted (`docs/KNOWN_ISSUES.md`,
truncated-dump row).

## M18. The admin's lists: status on the list, a lock sheet, a switch for memos

**Branch 4, 2026-09-29.**

- **Students** defaults to ALL statuses (an admin roster hiding inactive
  learners is incomplete); status, grade, section and search are staged. The
  web keeps Deactivate / Activate on the LIST, and the web's narrow card had
  no status control at all; the phone card therefore carries two peers —
  **Open and Deactivate / Activate — as a static card with actions**
  (§5a-iii), a declared difference. The record screen is the teacher's shape
  without scope: Edit always, "Student not found" on a 404, no Create parent.
- **Grades is its own subject list, not the report card** — the web's admin
  page draws its own table too — with the lock mark on each term cell. A term
  cell WITH A GRADE ROW opens the lock sheet, a Pending one included (the lock
  has no completeness gate); a term with no row is not a button. One
  deliberate step, no confirmation (reversible). **`ReportCardView` is
  untouched**, so Darryl's A2 holds by construction. Delete is not surfaced.
- **Attendance is view only** and fetches NOTHING until a grade or a date
  range is applied; it names a section with no adviser.
- **Announcements and memos switch with two segments** (Darryl, Q3 — the web
  stacks them). Edit only your own announcement, delete any; every memo is
  the admin's. Every write sends both target keys, null when absent. Delete
  is a native Alert with the web's sentence.

## M19. The phone's size scale is 14/16 of the web's — RESOLVED: keep 14

**feat/ui-polish, 2026-09-30.** Found and deferred first ("not before the
defense"); **resolved the same day as "keep 14"** (Darryl, the type-scale
plan): the owner finds the phone's text too big even with the Tecno's system
font size on Small, so raising the rem to 16 would go the wrong way. What
changed instead is the figures, one step down on the web AND the phone
(FRONTEND_CONVENTIONS §24): `Stat` `text-xl` (17.5dp), `large` `text-2xl`
(21dp), the parent hero's figures `text-xl`, its name `text-lg` (15.75dp),
the admin System line `text-xl`. There is no render proof on the phone (M7):
these are class values times the 14dp rem, confirmed on the device by the
phone check. **Still open, as `docs/KNOWN_ISSUES.md` rows:** the 38.5dp touch
targets below, and a `maxFontSizeMultiplier` cap (1.3 recommended) — React
19 ignores `Text.defaultProps`, so a cap needs a `Text`/`TextInput` wrapper
across ~80 files.

The finding, as recorded when it was deferred:

- **The difference, measured in the code, not by eye:** NativeWind 4.2.7's
  `withNativeWind` defaults **`inlineRem = 14`**
  (`node_modules/nativewind/dist/metro/index.js:14`), and
  `mobile/metro.config.js` does not override it. The web's root is the
  browser's 16px (18px under Large, `client/src/index.css`). So every
  rem-based class — text, spacing, radii, heights — renders at **14/16 on the
  phone**: `text-sm` 12.25 vs 14, `p-4` 14 vs 16.
- **The part that matters most: `h-11`, the "44px touch target" §17c and
  M14 speak of, is 38.5 units on the phone** — under the 44 (iOS) / 48
  (Android) guidance.
- **Colours are NOT different** (generated from the web's tokens; `lint:tokens`
  proves 71 × 2 equal), and the font is the same on the same phone (the web's
  system stack is Roboto in Android Chrome; React Native's default is Roboto).
- **Why it was deferred:** `inlineRem: 16` resizes every phone screen by
  ~14% and needs a full phone sweep. (Superseded: the rem stays 14, above.)

## M20. The drawer follows the web sidebar — grouped, foldable, one user card

**feat/nav-drawer-groups, 2026-09-30** (plan approved with Darryl's decisions
1–2: folding on the phone only; the fold state remembered). Numbered M20
because M19 was already the size scale.

- **The same groups, labels and order as the web, by construction.**
  `layout/navGroups.js` became the **23rd mirror**
  (`mobile/src/navigation/navGroups.js`); the drawer calls the same
  `groupNav()` the sidebar does. Dashboard on top; parent My child / School,
  teacher My class / Communicate, admin Manage / Communicate; Settings and
  About as a separate bottom group under a divider. **Admin's System group
  does not exist on the phone** — its one item, Backup & Restore, is web only
  (`routes.js` `WEB_ONLY`), AppShell drops it before the drawer sees the list,
  and `groupNav()` already drops an empty group. No AppShell change was
  needed.
- **The same active style and badges** as before and as the web:
  `bg-brand-soft` + `text-brand`, the `bg-primary` pill capped at `99+`,
  `badgeFor()` unchanged.
- **Folding is the phone's own** (`navigation/drawerFold.js`, pure, no
  imports): a group label is a button (`accessibilityState.expanded`, a
  chevron turned 90° when open). **Remembered per role on the device,**
  AsyncStorage `pp.navGroups` = `{ role: [folded labels] }` — the FOLDED
  labels, so a group nobody touched, or one added later, is open; anything
  unreadable is `{}`, every group open, never a hidden page. **The group
  holding the active page is always open**, decided at render and never
  written back, so leaving that page restores what the user chose. The
  unlabelled group (an item navGroups.js does not name) has no header and
  never folds. The web does not fold: it has the room, and its rail cannot.
- **The user card is the web's.** Avatar (initials), name, and the second
  line from `userCardLines()`: **a parent's is "Parent" alone and the name
  never falls back to the login id** (§5c — the login id is the child's
  LRN); staff show role · login id, as on the web. Tapping the avatar and
  name closes the drawer and opens Account information (the `AccountInfo`
  stack screen, the same one Settings pushes); **Logout is a separate icon
  button beside it**, never inside it — it replaced the full-width worded
  button. The web card's avatar and name open Account information too
  (`/{role}/settings`, admin `/admin/settings/account`, built from nav.js and
  settings/tabs.js).
- **Touch targets are 48dp, set in dp** (`minHeight: 48`; the card 56, the
  Logout 48 × 48). `min-h-12` would be 42dp at this rem (M19). The rest of
  the phone's 38.5dp targets stay the open KNOWN_ISSUES row.
- **NO STYLE FUNCTION ON A `Pressable` — NativeWind drops it (fix round,
  2026-09-30).** css-interop wraps every Pressable
  (`cssInterop(Pressable, { className: 'style' })`, whether or not a
  `className` is passed) and merges a non-array `style` as `{ ...style }`,
  so a function arrives as `{}`. 6980e06 gave the user card its width that
  way (`({ pressed }) => ({ flex: 1, minWidth: 0, … })`): the card shrank to
  its avatar, the name column (`flex-1 min-w-0`) got no width, and the
  phone showed only the avatar and the Logout icon for every role while the
  data was right. Layout goes in `className` or a plain style OBJECT; the
  drawer has no pressed feedback, as before this branch. **`dashboards/Card.jsx`
  already has one** (pressed opacity only): no layout lost, but its dimming
  never reached the phone either — pre-existing, left as is.
- **Not on the phone:** the web's icon-only rail and its tooltips. No new
  colour; no new icon (the chevron is `fa-chevron-right`, rotated).
- **Proved by `proof-drawer`** (60; 45 before the fix round): every phone item placed exactly once in
  the web's groups and order, per role; System and `/admin/backups` absent
  on the phone with a control that the same file still groups them for the
  web; the fold parse, toggle, per-role independence, the active-group rule
  and that deciding "open" writes nothing; the card lines — **with two
  negative controls**: a grouping that drops the unlabelled group, and a card
  that fell back to the login id, each caught by the same check. **Since the
  fix round** it also feeds the real 22-key `/auth/me` user for all three
  roles and asserts both card lines, and runs the card's own `style`
  expression — read out of `DrawerContent.jsx` — through the REAL css-interop
  runtime (a `react-native` stub and a minimal React hook dispatcher), which
  must deliver `flex: 1`; 6980e06's card, kept verbatim in the proof, must
  fail both checks. It went 58/60 on the unfixed drawer. What it cannot
  prove — the look, the tap, the fold surviving a cold boot — is the phone
  check.

## M21. Profile photos on the phone — the library only, and the web's rules

**feat/profile-photos, 2026-09-30** (Darryl's decisions 3 and 4). Every rule
of FRONTEND_CONVENTIONS §25 holds; this is only where the phone differs.

- **`expo-image-picker` (`~57.0.20`, installed with `npx expo install`, so it
  matches SDK 57 and ships inside Expo Go) — `launchImageLibraryAsync` ONLY,
  never the camera.** On current Android the library opens the system photo
  picker, which needs no storage permission, and the camera would add a
  permission prompt. Images only, `allowsEditing` with a 1:1 crop, quality
  0.8, so what is sent is small. **No `app.json` change**: Expo Go ignores
  config plugins; a future release build revisits permissions beside the
  cleartext row. `proof-photo-url` scans all of `mobile/src` for any camera
  call, with a control that one IS caught.
- **The upload is a `FormData` part `{ uri, name, type }` through the one
  axios client** — no Content-Type set by hand (axios sets
  `multipart/form-data` for a FormData body off the browser and React
  Native's networking adds the boundary), inside the 15 s timeout. **The part's
  name is a fixed word** (`photo.jpg` / `.png` / `.webp`), never the picked
  file's name or anything from the account — proved by a source check with a
  control. The server's reply is re-read through `refresh()` (§5b).
- **Remove asks with a native `Alert`, in the web's words** — for your own
  photo on Account information and for someone else's on Admin → Users (a
  card action shown only when the row has a photo). Upload does not ask.
- **`Avatar` takes `photo`** and draws an `Image` inside the brand-soft
  circle — the size as a plain style OBJECT on both (M20: never a style
  function), `onError` → the initials, keyed on the failed address. A card
  passes `avatarPhoto`. `format/photoUrl.js` is the **24th mirror**, built
  from `API_BASE_URL` (`EXPO_PUBLIC_API_URL`), so the photo comes from the
  same host as the API over the hotspot.
- **Proved by `proof-photo-url` (26)**: the address from the phone's base and
  every refusal, the camera and file-name scans with their controls, and which
  avatars carry a photo (the drawer card, `RecordCard`, Account information,
  both Messages lists, both admin Users lists) — and that the learner cards
  never do. What it cannot prove — a photo drawing, the picker, the upload
  over the hotspot, the fallback on a load error — is the phone check.
