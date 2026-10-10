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

**The palette change (`feat/ui-palette`, 2026-10-01 — the owner's option C,
zinc plus one blue accent; option B shipped first on the branch and was
replaced before merge) reached the phone through this script and nothing
else**: the non-status values in `index.css` are now hex (lower-cased on the
way through), the backdrop is `color-mix(in oklab, #hex N%, transparent)`
(the hex branch of the same rule), and the panel decorations are
`rgb(R G B / α)`. Against `main`, `npm run tokens:write` changed 36 light
and 36 dark values in both derived files; no screen, `tailwind.config.js`
or mirror changed. The phone has no separate palette and no per-screen
override — Login and Forgot password use the app's tokens like every other
screen. **A parsing trap worth knowing:**
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

## M3. The theme is NativeWind's ROOT VARIABLES, set from JS — stored on the device, Light by default

`src/theme/theme.js` mirrors `client/src/pages/settings/theme.js`: key
`pp.theme` in AsyncStorage, values light / dark / system, **default Light on a
fresh device** (Darryl, 2026-09-19 — not System). No print branch: nothing on
a phone prints.

**The mechanism since FR7 (fix round, 2026-10-04):** `applyTheme` writes the
RESOLVED theme's value for every token into NativeWind's root variables
through `StyleSheet.registerCompiled({ rootVariables })` — the call
`global.css` itself makes at import — and every class reading `var(--name)`
re-renders with it, the way `data-theme` is the switch on the web
(`theme.js:11–18`, `:36–39`, `:79–83`). `system` resolves against
`Appearance.getColorScheme()` now; `ThemeProvider` re-applies on an
`Appearance` change only while the stored preference is `system`
(`ThemeProvider.jsx:48–52`).

**NEVER `colorScheme.set()` and NEVER `Appearance.setColorScheme()`.** That
was the old mechanism; on Android each is `AppCompatDelegate.setDefaultNightMode`,
a process-wide night-mode change that Expo Go's window takes as a
configuration change (`theme.js:19–26`) — the blank strip at the bottom after
a theme switch on the owner's check, until a restart. A theme switch is JS
state only now. **Native dialogs (the date picker, Alert) do not follow the
app's theme** — KNOWN_ISSUES. **It depends on `registerCompiled`'s
`rootVariables` shape** (keys `--<token>`; a plain value sets light and dark
both): re-verify on every NativeWind / react-native-css-interop upgrade. DEV
only: a Fast Refresh that re-injects `global.css` puts the variables back on
the phone's scheme until the next apply (`theme.js:31–33`).

**The faces and the splash:** M23.

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
word, the error path seen once. **The Android export also checks the assets
(since feat/ui-refresh):** `npx expo export --platform android
--dump-assetmap`, and `assetmap.json` must list the message tone and the four
font files (`Merriweather_700Bold`, `SourceSans3_400Regular` / `600SemiBold` /
`700Bold`) — the fonts load at runtime (M23), so a missing file would show
only as the system face. The phone check list per branch is on its
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

**One strip per signed-in screen, below the header (re-check fix,
2026-10-04).** A layout wraps only its route's SCENE
(`@react-navigation/core` `useDescriptors.tsx:241–270`), and the drawer
renders that scene under its header (`@react-navigation/drawer`
`DrawerView.tsx:276–291`), as the native stack does. So `withStrip` on the
drawer and on the stack (`navigation/AppShell.jsx:199–206`, `:248`, `:280`)
puts the ONE strip below the header on drawer and pushed screens alike, and
**Main and Home take a bare layout** (`AppShell.jsx:208–221`, `:281`;
`RootNavigator.jsx:59–69`, `:153`). Main's old strip sat ABOVE the drawer's
header and was a second one — two "Live updates paused" strips on Dashboard
and Students with the API stopped. The strip's copy and Refresh are
unchanged, and there is still one bottom frame per screen (M3, FR7).

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

**A screen may serve two roles' drawer routes (2026-10-05).** The admin's
Messages is `/admin/messages` → `AdminMessages`, which `AppShell` maps to the
PARENT's `MessagesScreen` — the owner's decision of 2026-10-05 (teacher ↔
admin only; CLAUDE.md → ADMIN SCOPE AUDIT). The detail stack is every role's,
so its `NewMessage` and `MessageThread` pushes need nothing new. What differs
by role is read from `useAuth()` in the screen, never from a second file:
`NewMessageScreen` holds one group, Teachers, for both roles, with "Teacher
name" and a role's own empty message; `MessageThreadScreen` shows "Announce
to a class" to a teacher on a PARENT's thread only (the role from a message
that names the other person, else from the contacts row). A shared component
replaces this reuse after the Fri 9 Oct 2026 check.

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

**Loading since build 2 (`feat/dashboards-look`, 2026-10-07; FRONTEND
§5a-vii).** With NOTHING on screen, `DataList` shows the skeleton — three
card-shaped blocks in the list's own `cardClass` frame, painted after 300 ms
(`hooks/useSkeleton.js`, the web's file) — as its `ListEmptyComponent`, so the
header stays mounted. **With rows on screen it keeps them, as it always did —
and since build 2 they are SAFE while the list loads:** every card and the
footer sit in a wrapper that takes no touches (`pointerEvents="none"`) and is
out of the screen reader's reach (`importantForAccessibility=
"no-hide-descendants"`, `accessibilityElementsHidden` — the phone's `inert`),
greyed (opacity 0.6) once the read has taken the same 300 ms. **Until build 2
those kept cards stayed pressable**: Admin → Students applying a new filter
left the previous filter's cards on screen, each still opening its student,
until the new answer arrived (`admin/StudentsScreen.jsx:56–86` keeps its rows
through `setLoading(true)`) — the owner's question in the build 2 plan,
answered yes. **The header is not made inert**: its filters must stay usable.
`DataList` is never given the screen's filters, so on its own it cannot tell
a same-query re-read from a new query. **A screen whose query can change
passes `queryKey`** (option 1, `feat/skeleton-querykey`, 2026-10-11; the
web's rule, `hooks/useSkeleton.js` mirrored) — its load's dependency array:
the same key keeps the cards (a pull, a reconnect re-read, "Show more"
appending); a new filter, range or kind hands FlatList no rows, so its
empty content — the skeleton — shows from the render the key changes in,
never the old cards (an error still shows first). In the component the prop
is `handedRows` and `rows` is what the list shows. 10 screens pass one; the
7 lists that load with no query pass none. `extraData` makes FlatList
re-render its cells when loading starts or stops.

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

**SUPERSEDED IN PART BY `fix/leave-guard` (2026-10-01, the owner's
decision): every user-initiated exit now asks while the screen is FOCUSED
and has unsaved marks.** A drawer item, the account card, the bell and
Logout call `requestLeave()` in `navigation/leaveGuard.js` (the web's
`layout/leaveGuard.js`, a mirror); the screen registers its Alert through
`useFocusEffect` + `setLeaveGuard`, and catches the hardware Back button
with `BackHandler` (an OPEN drawer is left to close itself). The title is
**"Leave without saving?"** on every bulk screen; the body stays this
screen's sentence. **Because the screen stays mounted, "Leave and discard"
resets the marks to the last saved state (`recorded`) BEFORE the exit
runs** — without that the marks would quietly survive and "discard" would be
untrue (§5i). **Sign-out now asks**; a killed app and session expiry still
lose the marks with no prompt — neither is user-initiated. The slot screen
(M13) needed nothing: a stack screen's only exit is Back, already guarded.
Proofs: `proof-leave-guard.mjs` (the module, plus the screen's source text:
focus-only, reset-before-exit, hardware Back) and `proof-drawer.mjs` (every
drawer exit wired through `requestLeave` — source text).

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
  was the server's and only the server's: a valid date, not in the future**
  (`validateStudentOptionals`); the web set no limit either, so today was
  accepted on both — no age rule was invented (first-half finding,
  2026-09-28). **The birthday is not collected since the privacy build
  (2026-10-10, M26)** — the field and the rule are gone.
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

## M16. The admin shell: eight items (nine since Messages, 2026-10-05 — M9), one web-only item hidden, one Settings

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
the admin System line `text-xl`. (Since feat/ui-refresh the dashboard hero's
name is `font-serif text-xl`, 17.5dp — `screens/dashboards/ProfileHero.jsx:46`
— and the figures are `font-bold`, `screens/dashboards/Card.jsx:175`, tabular
since build 2.) There is no render proof on the phone (M7):
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
  proves 71 × 2 equal), and the font is the same on the same phone — then
  Roboto on both; **since feat/ui-refresh both use Source Sans 3 and
  Merriweather** (M23). The rem stays 14.
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
- **The look since feat/ui-refresh is the web sidebar's**
  (`navigation/DrawerContent.jsx:35–41`): the brand block with the product
  name in the title face; rows as rounded pills at 48dp; **the active row is
  said three ways** — the brand tint, the heavier label and a 3dp brand bar on
  its left edge (`:134`), never colour alone, with
  `accessibilityState.selected`; group labels as eyebrows, still folding
  (below); and the user card as a rounded, bordered tile
  (`rounded-2xl border border-edge bg-surface-subtle`, `:278–287`). The
  drawer is 296dp wide, was 280 (`AppShell.jsx:253–257`).
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

## M22. The new-message toast on the phone — the web's rules, and where the phone differs

**`feat/message-toast`, 2026-10-02.** FRONTEND_CONVENTIONS §26 is the rule
set; the decisions are the mirrored `realtime/messageToast.js` (the **26th
mirror**) and `UnreadProvider` hands the conversations rows on through
`subscribeConversations`, exactly as on the web. Only these differ:

- **Where:** a sibling of AppShell's stack (`navigation/AppShell.jsx` wraps
  it in a `View`), absolutely placed at the top under the header, over the
  drawer screens and the pushed ones alike. **No new import:**
  `@react-navigation/elements` is not a direct dependency, and the app sets
  no header height of its own, so the toast sits at the top safe-area inset
  plus React Navigation's default Android header height (56) plus 8.
  Android is the device; an iOS modal presentation would draw over it.
- **No hover, so no pause** — 5 s, started again by every new toast.
- **Announced** by `accessibilityLiveRegion="polite"` on an always-mounted
  box plus `AccessibilityInfo.announceForAccessibility(label)`.
- **"In that conversation"** is the FOCUSED route, read with
  `useNavigationState` from AppShell (the root stack's `Home`) and walked to
  the leaf: `MessageThread` with `params.otherId`. A thread lower in the
  stack is not "in" it.
- **View** goes through `requestLeave` (M14) and navigates
  `Home → MessageThread { otherId, name }` — AppShell is the root's `Home`
  screen, so the toast's navigation is the root's.
- **Admin:** the toast, the tone and the vibration too since 2026-10-05 —
  `isBuilt('/admin/messages')` is true (Admin → Messages, teacher ↔ admin;
  M9). Until then it was false and the admin got none.
- **Imported as `../realtime/MessageToast.jsx`, extension included** — the
  web build failed on the case-only clash with `messageToast.js` (§26).
- **One send at a time is a REF, and the newest unread reply wins (build 1
  fix round, 2026-10-05).** The thread's `send()`
  (`screens/parent/MessageThreadScreen.jsx`, both roles) checks `sendingRef`
  first, sets it before the POST and clears it in `finally` — the web's guard
  (§26); `sending` still drives the button. `UnreadProvider` takes a ticket
  from `api/tickets.js` — **the 28th mirror**, the web's file byte for byte —
  before every read and drops a reply that is no longer the newest (count,
  rows and failure alike), so a late older read can no longer put a stale
  count on the badge or stale rows in this toast. **The web's Enter rule
  (§26: a plain Enter never types a new line) has no phone counterpart** —
  the phone sends with its button, and the keyboard's return types the
  line.
- **TONE AND VIBRATION on a toast SHOW or UPDATE** (fix round, 2026-10-02;
  the owner reversed "no sound, no vibration"). Never on a skip (my own
  message, the open conversation), never for a role with no Messages screen
  (none since 2026-10-05 — the admin's was the last), once per show / update.
  `realtime/toastAlert.js` (phone-only, pure — play and vibrate are passed
  in) tries the tone first and swallows its failure, then vibrates **150 ms**
  (React Native's `Vibration`, no package). A tone that fails is silent; the
  vibration and the toast still happen.
- **The tone is a bundled WAV, `assets/sounds/message-tone.wav`** — 16-bit
  PCM mono 22 050 Hz, **360 ms, 7 938 samples, 15 920 bytes** (44 + 2 ×
  7 938), loudest sample **0.2156** of full scale (at most 0.26, no clipping)
  — GENERATED by `scripts/make-message-tone.mjs` (`npm run tone:write`, Node
  `fs`, not a shell redirect) from the mirrored `TONE`: **"two-note rise"**
  (feat/ui-refresh), four sine voices summed — 587 Hz from 0 ms for 140 ms,
  880 Hz from 80 ms for 280 ms, and their octaves 1174 Hz (0–60 ms) and
  1760 Hz (80–170 ms), peak 0.125 each; per voice a LINEAR rise from 0.0001
  over 6 ms then an EXPONENTIAL decay to 0.0001 at its end (held there for the
  web's 20 ms stop pad) — the web's Web Audio envelope, sample by sample
  (`realtime/messageToast.js:24–59`; `scripts/proof-message-toast.mjs:231–242`).
  It replaced "two-tone down" (1047 → 784 Hz, 17 684 bytes), which the owner
  found clinical (`messageToast.js:30–32`); that had replaced a flat 880 Hz
  beep (6 660 bytes). No URL, no third-party file; imported like the seal's
  PNG.
- **`expo-audio` ~57.0.5** (`npx expo install expo-audio`; SDK 57 ships no
  `expo-av`; it runs in Expo Go with no native build — restart Metro with
  `--clear` after the install). **One `useAudioPlayer` for the life of the
  toast**, released on unmount — and AppShell unmounts on logout. Each tone is
  `seekTo(0)` (its rejection swallowed) then `play()`.
- **The audio mode, ONE module-level promise:** `setAudioModeAsync({
  interruptionMode: 'duckOthers', shouldPlayInBackground: false,
  playsInSilentMode: false })` — read from the installed types:
  `interruptionMode` works on both platforms (`interruptionModeAndroid` is
  deprecated and not used), and `'duckOthers'` lowers other apps' audio
  without pausing it. The default was `'mixWithOthers'`. It is
  `createAudioModeGate` in `toastAlert.js`, held at module level in
  `MessageToast.jsx` (a logout and login do not set it again) and started on
  mount.
- **Silent / vibrate-only: NO TONE (fix round B9, 2026-10-02) — the rule is
  that the phone's tone follows its notification-sound rules.** expo-audio
  plays on the MEDIA stream (`AudioPlayer.kt:39`, `AudioAttributes.DEFAULT`;
  no JS option changes the usage), but its `play()` returns early when
  `!shouldPlayInSilentMode()` — `playsInSilentMode || ringerMode ==
  RINGER_MODE_NORMAL` (`AudioModule.kt:139-140`, `:467-475`) — and the
  native default is `playsInSilentMode = true` (`:63`). So the guard works
  only once OUR mode has RESOLVED: **every play awaits the gate**
  (`createGatedPlay`; after the first time the await is an already-settled
  promise, no added wait). A rejected mode is **retried once, by the next
  alert**; a second failure means no tone for the session (playing with the
  native default would ignore silent mode). The failure is reported by one
  `console.warn('[message-tone] …')` inside `if (__DEV__)` — the Metro
  terminal shows it; the Android export carries none of it (grepped). The
  vibration never waits for the tone.
- **Do Not Disturb: the tone STILL PLAYS — a known Expo Go limitation**
  (KNOWN_ISSUES). expo-audio reads the ringer mode, never the interruption
  filter, and no SDK 57 module in Expo Go reads DND for JS. **The fix is the
  APK (survey option C):** a native interruption-filter check, or a player
  with notification usage. React Native's `Vibration` (`VibrationModule.kt:30`,
  no audio attributes) ignores the ringer and DND too (KNOWN_ISSUES).
- **Owner re-check, Tecno in Expo Go — PASSED on `a567e8c`:** normal ringer
  = **tone + vibration**; B9 silent AND vibrate-only = **vibration only, no
  tone** (at `a797680`, before the gate, the tone had played in silent).
  B11 DND — **the tone plays** (the known issue above). B13 music —
  **ducks, OK**. If the tone ever plays in silent again, the Metro
  terminal's `[message-tone]` warning, or its absence, says whether the
  audio mode was set.
- **APK build: the expo-audio config plugin is intentionally NOT configured.**
  `npx expo install` added it to `app.json` and it was removed (its defaults
  add `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` and a background-playback
  service; Expo Go needs none). If a build ever needs it, use
  `["expo-audio", { "recordAudioAndroid": false, "enableBackgroundPlayback": false }]`.
  A standalone APK will also need `android.permission.VIBRATE` (Expo Go has
  it). `proof-message-toast` fails if the plugin reappears.
- **Proved by `proof-message-toast` (40)**: the mirror's decisions plus
  `otherIdFromRoute` on the real nested shape (root → Home → stack →
  drawer / thread) — **negative control with Edit: the walk stopped at the
  top-level route → 9/11** at 11 checks; the alert with fake play and
  vibrate on show / update / replace, none for own / open / admin, a failing
  tone still vibrating with the toast shown — **negative control: the
  try/catch removed → 26/27** at 27; the WAV's header, its 400 ms / 17 684
  bytes, its loudest sample (≤ 0.44, no clipping), the `TONE` values, and
  its bytes against what the script builds from `TONE` — **negative
  control: one voice's peak changed in the phone `TONE`, no regeneration →
  27/29**; source text (expo-audio's player, the local asset, no URL, the
  duck-others mode); and `app.json` without the plugin — **negative control:
  the plugin added → 26/27** at 27, removed. **The silent-mode gate (B9, +11
  → 40):** no tone while the mode is pending and the vibration not waiting,
  the tone once it resolves, one mode call for many alerts, a rejected mode
  reported and retried once by the next alert, a mode that keeps failing
  tried twice and never a third time with every alert still vibrating, a
  throwing mode / report / player never throwing or rejecting, no unhandled
  rejection; source text (ONE module-level gate, play only through it, one
  `console.warn` inside `if (__DEV__)`) — **negative controls with Edit: the
  `await` removed → 38/40; the retry removed → 38/40**, each restored to
  40/40. The toast on screen, the timer, the sound, whether the ringer
  really silences it, the vibration, the announcement and View are the phone
  check.

## M23. The refresh on the phone — faces as families, one `Text`, one `Button`, entrances only, pull-to-refresh (`feat/ui-refresh`, 2026-10-02 → 10-04)

The web's rules are FRONTEND_CONVENTIONS §27; only these differ.

- **A weight class IS a font family, and `theme.fontWeight` is emptied**
  (`mobile/tailwind.config.js:14–57`, `fontWeight: {}` at `:49`). React
  Native has no font matching: a custom family is one file, and a
  `fontWeight` beside it makes Android fake the bold. So `font-sans` /
  `font-normal` are Source Sans 3 Regular, `font-medium` and `font-semibold`
  SemiBold (600, as on the web), `font-bold` Bold, `font-serif`
  Merriweather Bold — titles, never beside a weight class.
- **Every `<Text>` comes from `components/Text.jsx`**, which adds `font-sans`
  unless the call site names a family (`Text.jsx:7–28`); it is the only file
  that imports react-native's `Text`.
- **Four bundled files** (`@expo-google-fonts`, `src/theme/fonts.js:2–21`)
  load at runtime through `expo-font` — no config plugin in `app.json`.
  **The splash waits for them with a clock:** loaded, failed or 2.5 s,
  whichever comes first (`fonts.js:26–40`; `navigation/RootNavigator.jsx:81–91`),
  so the worst case is the system face, never a stuck splash (M4).
- **The rem stays 14** (M19). The sizes are Tailwind's own (the branch's
  larger scale was reverted, FR5).
- **`components/Button.jsx` over `components/buttonStyles.js`:** the web's
  five variants; heights as a `minHeight` NUMBER in dp — `md` 48, `sm` 44,
  `lg` 52 — and Android's ripple for the press, never a style function (M20)
  (`buttonStyles.js:9–39`; `Button.jsx:7–21`). `SectionHeader.jsx` is the
  web's, with no Reload (`SectionHeader.jsx:4–13`).
- **Motion:** React Native `Animated` through `motion/Reveal.jsx`, the web's
  numbers in milliseconds; **an unknown reduced-motion setting means NO
  motion** (`motion/reduceMotion.js:4–28`). None on attendance marking, the
  Grades slot, the toast or the native leave-guard Alert — neither
  `teacher/AttendanceScreen.jsx`, `teacher/SlotScreen.jsx` nor
  `realtime/MessageToast.jsx` imports motion.
- **Pull-to-refresh is the phone's reload** — on every screen that shows
  server data, re-running that screen's own fetch with its filters and sort;
  a paged list starts again at page 1 (KNOWN_ISSUES). **Off while anything is
  unsaved on the two leave-guard screens:** Attendance
  (`teacher/AttendanceScreen.jsx:151–164`), which also blocks taps on the
  roster and Save during a pull (`:357–358`, `:396`), and the Grades slot
  (`teacher/SlotScreen.jsx:222–255`). **The LiveStatus Refresh reconnects the
  socket and refetches both counts** (`realtime/LiveStatus.jsx:14–17`,
  `:30–31`) — the only refresh button on the phone.
- **The radius scale on the phone (`feat/look-fixes`, 2026-10-05; FRONTEND
  §27f).** Container `rounded-xl` (10.5dp at rem 14) — `cardClass`; control
  `rounded-lg` (7dp) — every `Button` (`components/buttonStyles.js`), the
  inputs, the date field and its clear button, `Segmented` (no longer a pill),
  the bell, the attendance marks; tag `rounded-md` (5.25dp) — `StatusBadge`.
  **Every variant has a 1dp border** in its own colour (ghost transparent), so
  a button that changes variant keeps its box. Heights unchanged (48 / 44 /
  52dp); the drawer is not touched.
- **Apply is KEYED by its state** (`components/FilterActions.jsx`): going dirty
  or clean mounts a fresh Pressable instead of restyling the old one. Restyled
  in place, the owner's phone showed a dirty Apply as an empty blue box in Dark
  on every filter bar; the cause was not provable from the source, so both
  routes are closed (the remount, and a box that no longer changes border).
- **`DataList` is ONE FlatList in every state** (`components/DataList.jsx`):
  loading, the error and the empty state are its `ListEmptyComponent` under the
  same `ListHeaderComponent`, so a screen's filter header is never remounted —
  Search keeps its focus when the results go empty. A failed "Show more" keeps
  the loaded rows; the error and its Retry render in the footer with "Show
  more" still under them.
- **The new-message toast renders nothing while the drawer is open**
  (`navigation/drawerOpen.js`, pure — the drawer router's own rule, read from
  the focused path; `realtime/MessageToast.jsx`). The store, the 5 s timer,
  the tone and the announcement run as before.
- **Admin → Grades reads its sections again (build 1 fix round, 2026-10-05).**
  The sections read used to swallow a failure into an empty list: with the
  API down, a picked grade showed an empty Section row with no error, and
  because a drawer screen stays mounted the list never came back. Now
  (`screens/admin/GradesScreen.jsx`) a failure keeps the last good list and
  sets `sectionsError`; while a grade is picked the Section row is that error
  with Retry, the effect keyed by `sectionsAttempt`; a pull and coming back to
  the screen bump the attempt while the read is failed (a ref, so the focus
  effect never loops on the error). The web page has the same error and Retry
  under its pickers, and its learner-list error gained the Retry the phone
  already had. The phone's 15 s timeout (`api/client.js`) means a stopped API
  fails at once (refused) and an unreachable laptop after 15 s — both land in
  that error.
- **No load on Admin → Grades is restarted while it is in flight (build 1
  follow-up, 2026-10-05).** The owner's phone sat on "Loading…" for the
  learner list with the API stopped, while the web said "Cannot reach the
  server" at once. A throwaway loop drove the real `api/client.js`: a request
  with no reply reached `.catch` after **15 014 ms** (`ECONNABORTED`), a
  refused port after 12 ms — so one read always settles; the phone's request
  to the laptop is the slow kind. What kept it loading: **a pull re-read the
  learner list every time**, cancelling the read in flight and starting the
  15 s again. Now each load tracks in-flight and failed (refs): a pull, coming
  back to the screen, Retry and the socket reconnecting (the API is back) re-
  read only a FAILED sections or learner read, never one in flight; the
  report card keeps its re-read on focus and on a pull (that is how a lock or
  unlock shows) but never twice at once for the same learner. The timeout
  itself is unchanged.
- **Skeleton loading, tier 1 (build 2, `feat/dashboards-look`, 2026-10-07;
  FRONTEND §5a-vii).** `components/Skeleton.jsx` on the phone: the `edge`
  fill (`edge-strong` the one-line fallback, judged on the device), a
  `progressbar` with the spinner's own label, the shapes hidden from the
  screen reader and laid out at opacity 0 for the first 300 ms (the height is
  held). **The shimmer is a SWEEP since the fix round (F6, 2026-10-08; an
  opacity pulse, twice, before):** the web's one light band crossing the
  bars, built from what is installed — React Native has no fixed
  backgrounds and no mask without a new package. The region holds one
  `Animated.Value`, the band's left edge in its own coordinates, run from
  off the left edge to the region's width, **three passes of 1.5 s on the
  native driver**, then still; each bar measures where it sits in the
  region (`measureLayout`), clips to its own corners, and moves its copy of
  the band by `x − its left` (`Animated.subtract`) — so the slices line up
  into one band and the gaps stay clean. The band is a `react-native-svg`
  gradient (installed for the icons), `surface` in the light theme and
  `edge-strong` in the dark one, from the theme's tokens. **None under
  reduce motion, or before the OS has answered** (unknown means no, as for
  every motion here). It is the one loop in the app. Used by `DataList`
  (M11), the dashboard `Card` (`skeleton`: figure, lead, list, counts,
  facts) and `ReportCardView`. **Every list of bars is keyed by position
  (F8):** `Lines` keyed its bars by width class and the System shape passes
  `w-1/2` twice — two siblings with one key, LogBox's "Console Error" on the
  owner's phone; the counts shape and DataList's skeleton cards were keyed
  the same way. **An avatar circle (F4):** a screen whose cards carry
  `avatar` passes `skeletonAvatar` to `DataList`, and each card placeholder
  leads with a 38dp circle (RecordCard's Avatar) — Admin → Users, both
  Students screens and, since option 1, admin Attendance, teacher Attendance
  records, teacher Excuse Letters and both Messages screens.
- **A dashboard re-read keeps every card's answer** (useCard, the web's file:
  the same query read again is `refreshing` — the content takes no touches
  and is marked busy — and a new query starts from nothing). **So a pull now
  shows the native refresh indicator while the cards re-read**
  (`refreshing={pulled && rereading}`; it was `refreshing={false}`, and the
  card spinners were the only feedback), and a focus re-read clears `pulled`
  and stays quiet. The teacher's attendance banners re-read through useCard's
  `refresh` counter, not a dep, so a banner keeps its answer instead of
  dropping to "Checking…" on every return to the dashboard.
- **The dashboards' look, Part C (build 2 commit 2, 2026-10-07; FRONTEND
  §15e).** The phone stays ONE column; only these differ from before:
  `dashboards/Card.jsx` is `rounded-xl` on every tone (the amber frame was
  `rounded-2xl` beside a `rounded-xl` default), no shadow, **the icon inline
  before the title in `fg-muted`, no chip**, and **`Stat` takes tabular
  figures** (`fontVariant: ['tabular-nums']`, the report card's precedent).
  `ProfileHero` is `rounded-xl` with **the facts as one `text-sm` muted line
  joined by " · "** — no pills, no fact icons. The parent hero is `rounded-xl`
  and its labels lose their uppercase tracking (`HERO_LABEL`; the Attendance
  card's "Last 7 days" keeps the eyebrow). **Admin:** Waiting for approval,
  then **one Users card ("People" until the fix round, F2) with three
  counts, each its own link** (`countRows` in `admin/dashboard/logic.js`, a
  `Pressable` with `accessibilityRole="link"`, 48dp, the ripple — the one
  card that is not itself pressable, decision 3), then System. **Parent:**
  the web's order — Grades, Attendance, Messages, Excuse letters, Upcoming
  events, then **Announcements & memos last, as a list** (one row per post,
  a hairline between). Teacher: unchanged but for the look.
- **The admin dashboard after the fix round (2026-10-08; FRONTEND §15e).**
  **F1 — the lockout notice is compact and holds its space:** the warning,
  then "Why this matters" (`accessibilityState` expanded; the explanation
  word for word behind it) and "Confirm your email" (announced as a link)
  on a row under it, as the phone's attendance banner puts its button;
  `hazardSlot` decides — the notice on the server's flag; while the
  dashboard loads with the session's `email_verified_at` empty, the same
  notice at opacity 0, untouchable and hidden from the screen reader; else
  nothing. **F3 — Teachers and Parents open Users already filtered:** the
  press navigates with `preset: { role, status, key }` (Teachers: Role =
  Teacher, any status; Parents: Parent + Active — the server's counts),
  the key the moment of the press; Users, a drawer screen that stays
  mounted, takes a NEW preset DURING RENDER into the draft and the applied
  filters (`presetFilters`: only a role and a status it offers), so the
  focus read is already filtered and nothing shows as unapplied.

## M24. The status bar is PAINTED — never a style-only status bar (re-check fix, 2026-10-04)

- **Root:** React Native's own `StatusBar` in `App.jsx` (`ThemedStatusBar`,
  `App.jsx:17–32`): `barStyle` from the resolved theme (dark icons in Light,
  light in Dark), `backgroundColor={tokens.surface}` — the header's colour,
  the top of every signed-in screen — and `translucent={false}`: the app is
  laid out below the bar.
- **Why never style-only:** React Native's `StatusBar` re-sends a background
  colour on every Android update; given none, it sends
  `DEFAULT_BACKGROUND_COLOR`, the window's status-bar colour with its alpha
  dropped (`react-native/.../statusbar/StatusBarModule.kt:68–78`;
  `Libraries/Components/StatusBar/StatusBar.js:235–245`, `:471–500`), so a
  transparent bar came back opaque black — under dark icons in Light. The
  root `expo-status-bar` set only the style (`NativeStatusBarWrapper.tsx:20–33`)
  from `02107c2` (2026-09-27) until `0ac7fec`; it is no longer imported (the
  package is still installed — APK_READY_PLAN).
- **A screen whose top is not a header** renders
  `components/ScreenStatusBar.jsx` with its top colour, only while FOCUSED
  (`useIsFocused`) — a native-stack screen stays mounted under the one pushed
  over it: `brand-panel` on Login, Forgot password and the forced password
  change (`LoginScreen.jsx:105`, `ForgotPasswordScreen.jsx:110`,
  `ForcedPasswordChangeScreen.jsx:94`), `page` on the public About
  (`AboutScreen.jsx:354`). The newest mounted StatusBar wins, an update
  replaces it in place, an unmount hands the bar back (`StatusBar.js:363–426`).
- **The icons need no per-screen logic:** in each theme the header, band and
  page colours share a lightness (`theme/tokens.js` — light `#ffffff` /
  `#f4f4f5` / `#fafafa`, dark `#18181b` / `#27272a` / `#09090b`).
- **Device-checked on the owner's Tecno, Android 14, in Expo Go.** The full
  check ran with Expo Go's Full Screen for Apps on **Show Cutout**: Light and
  Dark, cold boot, live switch, after a native dialog, the phone's dark mode
  on and off. With **Auto** (the default), a cold boot in Light painted
  correctly (Dashboard, drawer, Login), so no phone setting is needed.
  **Not yet on Android 15+ or in the APK:** under enforced edge-to-edge
  Android ignores the colour (KNOWN_ISSUES).

## M25. Form drafts on the phone — kept on the device, back when the form reopens (`feat/form-drafts`, 2026-10-04)

The web's FRONTEND §28, on the four compose screens (excuse letter,
announcement, event, admin announcement / memo) and the Messages thread.
**Same core:** `src/drafts/draftCore.js` is a mirror (pair 27) — the key with
numeric ids only, the allow-list, the 32 000-character limit, the copy.
Where the phone differs:

- **AsyncStorage, not a tab.** The draft is on the device until the server
  confirms the submit, a confirmed Discard draft, or a deliberate logout —
  a killed app keeps it. The notice says so: "Draft restored. It is kept on
  this phone until you submit it, discard it or log out." (a message:
  "…until you send it…"). `src/drafts/deviceDrafts.js` is PURE — the storage
  is passed in, so the proof drives it in Node; `src/drafts/useDraft.js`
  binds it to AsyncStorage, the store `pp.theme` already uses. No new
  package.
- **Nothing reopens after a kill** (decision 3). There is no "continue
  draft" prompt and no `open` flag: the app starts on its home screen, and
  the draft comes back when that form or thread is opened again.
- **Read once per key before any write.** The hook writes nothing until the
  stored draft has been read (`readyKey`, `useDraft.js:44–99`), so a form's
  opening values can never overwrite a kept draft before it is restored.
  Writes are 500 ms after the last change and flushed at once when the app
  leaves the foreground (`AppState`) and on unmount (Close, Back).
- **Text that is empty after trimming is not a draft (build 1 follow-up,
  2026-10-05)** — the web's rule (FRONTEND §28b), the same `DRAFT_TEXT_FIELDS`
  and `isBlankDraft`, held byte-equal by `proof-form-drafts`. A blank form is
  never saved (the flush clears the key), and a blank draft kept on the device
  from before is NOT restored or noticed — the form gets null, as when nothing
  was kept — and is removed. Reaches the four compose screens and the thread.
- **Logout clears every `pp.draft.*` key on the device** —
  `auth/AuthContext.jsx:102–103`, `await deviceDrafts.clearAll()` before the
  token goes; **the 401 listener does not** (`:75–80`).
- **Discard draft asks with a system `Alert`** ("Discard this draft?", Keep
  draft / Discard draft, destructive) — on the phone a dialog is already the
  confirmation every irreversible action uses (`components/DraftNotice.jsx`).
- **The hand-off question is an `Alert` too**, shown when a thread hands text
  to an announcement over a saved new-announcement draft: the hand-off text is
  its body; **Keep saved draft** restores the saved one, **Use this message**
  writes the hand-off over it at once (`saveNow`, passed to `onRestore`)
  (`screens/teacher/AnnouncementComposeScreen.jsx:82–104`). A confirmed post
  clears `thread-<fromThread>` (`:158–159`).
- **The announcement draft is written only while there is a section to post
  to** (`active`, `:113`): with none the form never opens and the hand-off's
  text stays in its conversation. **A restored draft keeps its own section**
  — the one-section auto-select does not run over it (`:130–138`), and the
  auto-selected section counts as what the form opened with, so it alone
  never makes a draft (Events: the single grade, likewise).
- **A blocked thread keeps its draft**: `active: draftFor === otherId &&
  !blockedReason` (`screens/parent/MessageThreadScreen.jsx:106`).
- **Close, not Cancel, on the four compose screens** — and nowhere else.

**Proof:** `scripts/proof-form-drafts.mjs` (TESTING → Mobile proofs). The
phone check (M7) owns the debounce, AppState, a killed app and both Alerts —
**device-checked 2026-10-04 in Expo Go on a Tecno, Android 14.**

---

## M26. Privacy on the phone — the web's rules, as a root branch and a Settings row (`feat/privacy`, 2026-10-10)

The rules are FRONTEND §29 and API_REFERENCE §5b; this states only where the
phone differs.

- **The consent screen is a RootNavigator branch, not a redirect.** The order
  is the web's and the server's: `!user` → the auth stack;
  `must_change_password` → ONLY `ForcedPasswordChange`; **`policy_pending` →
  ONLY `PolicyConsent`**; otherwise Home. An unmounted `Stack.Screen` cannot be
  reached, so the gate is structural (M4).
- **No realtime providers until BOTH gates are past.**
  `signedIn = user && !must_change_password && !policy_pending` — the socket
  and the two count providers wrap only a signed-in tree: a socket and two
  count requests for a session the server refuses would only fail. (The web
  gets the same for free: its socket lives in Shell, and `/consent` is outside
  Shell.)
- **The screen is the sign-in family's frame** (ForcedPasswordChangeScreen's
  band and card). **Each tick is a whole 48dp row**, announced as a
  `checkbox` with its `checked` state; the box is a View in the app's tokens
  (`bg-primary` / `border-edge-strong`), the mark `fa-check` — no new colour,
  no new icon. The third tick names the child by first name, never the LRN.
  **The words are the web's, word for word** (FRONTEND §29a, the fix round's
  PF4): the three tick sentences, "I agree and continue", and "Sign out"
  under "Declining ends portal use only; your child’s school records stay as
  they are."
- **The exit is `refresh()`** — no navigate: the re-read brings
  `policy_pending` back false and RootNavigator renders Home. A `409` (a
  version changed meanwhile) reloads the documents and clears the ticks. A
  one-time decision has no pull-to-refresh; a failed read has Try again.
- **Settings → Security & policy is a pushed screen** (`SecurityPolicy`,
  registered in AppShell, opened from the row by its label like the others):
  the documents, their versions, and a parent's accepted dates as the Manila
  day (`format/date.js`, a mirror). **Pull-to-refresh keeps what is on
  screen** (M23); a first load is Build 2's skeleton.
- **The four learner fields are gone** from `teacher/EnrollScreen` and both
  StudentDetail screens, the record one card, as on the web (§29e) — and with
  them the birthday `DateField` and the gender `Segmented` on those screens.
  The parent's own number stays on the enrol screen's parent phase.
- **Edit student's LRN, Grade level and Section look read-only** (the fix
  round, PF5): they were already `editable={false}` but drawn like fields you
  can type in. Both StudentDetail screens now give them the web's disabled
  look — `surface-subtle` behind `fg-muted` text, as an inline style so it
  wins over FormField's `bg-surface text-fg` whatever the stylesheet order —
  and `accessibilityState={{ disabled: true }}`. The server refuses a class
  change anyway; the phone check owns how it looks.

**Proof:** `scripts/proof-privacy.mjs` (TESTING → Mobile proofs) — the
mirrored tab list driven; the root order (with a swapped-gates control), the
providers' condition, the screen's ticks and exit, the settings screen and the
retired fields read as source. **The phone check (M7) owns** a real sign-in
landing on the consent screen, a real tick and accept, and the skeleton's
300 ms.

## M27. The phone thread keeps the web's three positioning rules (`feat/shared-messages`, 2026-10-11)

The phone already had ONE thread screen for every role
(`screens/parent/MessageThreadScreen.jsx`, pushed as `MessageThread` from
each role's list and picker); the web's became one on the same branch
(FRONTEND §30). What differed was where the list sat, found by reading the
code, not on a device:

- **A thread with unread messages opens at its NEWEST message, however long
  read-all and the badge refresh take.** The list used to move 50 ms after
  any change in the NUMBER of messages; read-all is awaited while the
  full-screen spinner is still up, so the move often fired with no list
  mounted and nothing moved it once the list appeared — the web's F1 of
  2026-10-06. Now the move consumes nothing until the list is mounted and
  holds THIS thread's messages (`loading` is a dependency), and the first time
  it does — on open, or another thread on the reused screen — the list goes
  to its end.
- **"Load earlier messages" keeps the reader's place.** After the first
  positioning the list goes to its end only when the newest message changes —
  one that arrived, or my own send. Load earlier prepends, so it no longer
  throws the reader to the end. The pending move is a ref, so a later render
  that decides NOT to move cannot cancel one already scheduled.
- **A failed re-read keeps the messages**; only a thread that never loaded is
  left empty — the web's rule since feat/look-fixes.
- **What does not apply on the phone:** the web's "box in view" rule — the
  composer is a fixed bar under the list (`KeyboardAvoidingView`), always on
  screen.
- **Nothing else changed:** the composer, "Announce to a class", the device
  draft, pull to refresh (it is `load()`, and an unchanged newest message
  does not move the list), the 403.

**Proof:** `scripts/proof-message-thread.mjs` (TESTING → Mobile proofs) —
source text (M7), each rule with its negative control: the old effect, the
guard removed, the newest-id check removed, the old catch. **The phone check
owns** a real thread opening at its newest message, a real Load earlier, and
a re-read failing on the hotspot.

**Not changed here, a KNOWN_ISSUES row:** the phone teacher picker's empty
groups still say "match that search" with no search for Teachers and Admin;
the web's picker follows the cause since §30b.
