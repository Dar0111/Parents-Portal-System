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
`format/contactRule.js`. The school calendar joins the list on the Parent
branch and becomes a three-way copy (server → client → mobile); the client
proof already holds the first two equal.

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
and the rest dimmed, and `RoleHome` as their placeholder home (decision 3).

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
because its sidebar is on screen from `sm` up; on a phone the drawer is
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
  action is on its own row, neutral, out of the filter** (the web's §21b):
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
