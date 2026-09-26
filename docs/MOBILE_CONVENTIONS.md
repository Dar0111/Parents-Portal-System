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
a redirect that could loop. The splash stays up until the theme is applied
and `/auth/me` has answered — the phone's "spinner with no login flash".

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
app — the Expo equivalent of `/dev/ui`, registered under `__DEV__` only and
**grepped absent from `npx expo export` output before the commit**, with a
positive control (a production string that must be present).

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
