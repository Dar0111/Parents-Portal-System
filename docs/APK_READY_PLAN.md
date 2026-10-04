# A standalone Android APK — ready plan

> **NOT BUILT — ready plan, 2026-10-01.** Nothing in this file exists in the
> code yet. It is the approved plan (Darryl, 2026-10-01, from the Survey 2
> part A report) so the build can start without re-surveying. When it is
> built, the dispatch that builds it moves the rules into
> `docs/MOBILE_CONVENTIONS.md` and leaves this file as history.

## Why

The phone app runs in **Expo Go** today. Two reasons to leave it before the
defense: the Play Store's Expo Go moves to SDK 58 in October 2026 and an
auto-updated Expo Go stops loading this SDK 57 project (KNOWN_ISSUES), and a
panel member's phone should not need Expo Go, a Metro server or a QR code.
A sideloaded APK needs none of them — only the laptop's API on the same
network.

## Decisions (Darryl, 2026-10-01)

| | Decision |
|---|---|
| Build route | **EAS Build, `preview` profile, an APK** (cloud build — no Android SDK on this laptop, and no Gradle under a user folder with a space in its name) |
| Expo account | **Darryl creates it and logs in himself** (`eas login`). No agent types or stores those credentials |
| Android package | **`ph.edu.chfes.parentsportal`** — permanent once installed on a phone; changing it later is a different app |
| The server address | **(b) in-app server address** — the baked value is only the default |
| Cleartext HTTP | `expo-build-properties` → `usesCleartextTraffic: true` (below) |

## 1. Config changes

### `mobile/app.json`

```json
{
  "expo": {
    "android": {
      "package": "ph.edu.chfes.parentsportal",
      "versionCode": 1,
      "adaptiveIcon": { "foregroundImage": "./assets/school-seal.png", "backgroundColor": "#ffffff" }
    },
    "plugins": [
      ["expo-splash-screen", { "…": "unchanged" }],
      "expo-secure-store",
      "@react-native-community/datetimepicker",
      ["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]
    ]
  }
}
```

- `npx expo install expo-build-properties` (the SDK-57 version) before
  adding the plugin line.
- `eas init` (run by Darryl, logged in) writes `extra.eas.projectId` into
  `app.json` — commit that line; it is an id, not a secret.
- **`versionCode` goes up by 1 on every rebuild** that is installed over an
  earlier one; Android refuses a same-or-lower code as an update.

### `mobile/eas.json` (new)

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "EXPO_PUBLIC_API_URL": "http://<the demo network's laptop IP>:5000/api" }
    }
  }
}
```

- **The `env` block is required.** `mobile/.env` is git-ignored, and EAS
  uploads the project the way git sees it — without this block the APK is
  baked with `http://localhost:5000/api` (the phone itself) and cannot reach
  anything. Put an address, never a credential, here: the file is committed.
- The value is only the **default** the in-app server address starts from
  (section 2); a wrong or stale IP is fixed on the phone, not by a rebuild.

### Cleartext HTTP, and how narrow it can be

Android refuses plain `http://` in a release build (Expo Go allowed it). The
API and the photos are `http://<laptop IP>:5000` on the hotspot LAN, so the
APK must allow it:

- **This plan: `usesCleartextTraffic: true`, app-wide.** The server address
  is chosen on the phone at run time (section 2), so no address can be named
  in advance, and Android's network-security config has no CIDR or wildcard
  for IPs. The app only ever talks to the one configured server.
- **The narrow alternative, if the network is ever fixed:** a
  `network_security_config.xml` with one `<domain-config
  cleartextTrafficPermitted="true">` naming that single IP, written by a
  small local config plugin and pointed to from the manifest. Only worth it
  with a fixed address (for example the laptop as the Windows hotspot,
  normally `192.168.137.1`).
- KNOWN_ISSUES already carries the release-build cleartext row; it is
  updated, not duplicated, when this is built.

## 2. The in-app server address — design

**Goal:** the APK works on whatever network the demo is on, and a real user
never sees a server setting unless the server is unreachable.

- **Storage:** AsyncStorage key **`pp.server`** — the full API base,
  `http(s)://host[:port]/api`. Absent means the baked
  `EXPO_PUBLIC_API_URL`. Never in SecureStore (it is not a secret) and never
  in a URL or a log line with a user's data.
- **Applied at boot, before the first request.** `api/client.js` gains
  `setApiBase(url)` / `getApiBase()` (the axios instance's `baseURL`), and
  `API_BASE_URL` / `SOCKET_ORIGIN` become getters — today they are constants
  read by `realtime/` (the socket) and `components/Avatar.jsx` (photos,
  through `format/photoUrl.js`). `AuthContext` waits for the stored address
  before its `/auth/me`.
- **Where it is shown — only when the server is unreachable.** The
  "Can't reach the school server" states (`AuthUnavailable`, and Login's
  network error) gain one link, **"Change server address"**, opening a new
  `ServerAddressScreen`: the current address, a field, **Test** (must answer
  `GET /api/health` with `success` and a `db` field before it can be saved),
  **Save**, and **Use the default**. Nothing on the signed-in screens.
- **Changing the server signs you out.** A token belongs to the server that
  issued it; saving a different address clears the stored token and returns
  to Login. The same address re-saved changes nothing.
- **Validation (pure, proved):** trimmed; `http:` or `https:`; a host; an
  optional port; `/api` appended when missing and a trailing slash dropped;
  anything else refused with one sentence. No login id, no account value is
  ever part of it.
- **Files:** `mobile/src/api/serverAddress.js` (new — read, validate, save,
  reset), `mobile/src/api/client.js`, `mobile/src/auth/AuthContext.jsx`,
  the socket provider under `mobile/src/realtime/`,
  `mobile/src/components/Avatar.jsx`, `AuthUnavailable` and the Login
  screen, `mobile/src/screens/auth/ServerAddressScreen.jsx` (new), the root
  navigator (one route, outside the signed-in stack).

## 3. What changes in a release build

- **The dev Connection check** is already excluded: Metro's resolver
  returns an empty module for `src/screens/dev/` whenever `context.dev` is
  false (`mobile/metro.config.js`), which a release build is. The
  DEV-string grep (TESTING → Mobile proofs) proves it on the export.
- **Name, icon, splash:** already set in `app.json` (Parent's Portal, the
  seal, the white splash).
- **Photo-picker permissions:** the app uses the photo LIBRARY only (M21);
  on current Android that is the system photo picker and needs no storage
  permission. **After the first build, check what the APK actually asks
  for** (phone → App info → Permissions, or `aapt dump permissions` on the
  APK). If `android.permission.CAMERA` or `RECORD_AUDIO` appear (added by a
  library's manifest), block them in `app.json`:
  `"android": { "blockedPermissions": ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"] }`
  and rebuild.
- **No red error screen** in release: an uncaught error closes the screen
  instead. The phone check covers every role once on the APK.
- SecureStore, AsyncStorage (`pp.theme`, `pp.navGroups`, `pp.server`) and
  the socket behave as in Expo Go.

### APK items from the UI refresh (`feat/ui-refresh`, 2026-10-04)

- **The fonts load at runtime.** `expo-font` has no config plugin in
  `app.json` (`mobile/app.json:18–30`); `src/theme/fonts.js` loads the four
  bundled files with `useFonts` and the splash waits for them with a 2.5 s
  clock (MOBILE M23). The export's `assetmap.json` lists them (TESTING →
  Mobile proofs). Nothing to add for the APK; the plugin would only embed
  them at build time instead.
- **`expo-status-bar` is installed but no longer imported** (`mobile/package.json`;
  the root uses React Native's own `StatusBar`, M24). Removing it is a
  package change — its own small dispatch, not part of the APK build.
- **Check the status bar and the display cutout on the APK.** The colour
  comes from React Native `StatusBar`'s `backgroundColor`, which Android
  ignores under enforced edge-to-edge (Android 15+ with a target SDK of
  35+). On the first APK, on an Android 15+ phone if one is available: is
  the bar the header's colour (the band's on Login) with readable icons, in
  Light and Dark, with Full Screen for Apps on Auto and on Show Cutout?
  (KNOWN_ISSUES.)

### APK items from the message toast (`feat/message-toast`, 2026-10-02)

The phone's new-message toast plays a bundled tone through **expo-audio**
and vibrates 150 ms (MOBILE_CONVENTIONS M22). Expo Go needs no config for
either; an APK does:

- **The expo-audio config plugin is intentionally NOT in `app.json`.**
  `npx expo install expo-audio` added it and it was removed — its defaults
  add `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` and a background-playback
  service, none of which the tone needs (`proof-message-toast` fails if it
  reappears). If the build ever needs it, add exactly
  `["expo-audio", { "recordAudioAndroid": false, "enableBackgroundPlayback": false }]`
  and update that proof check in the same dispatch.
- **`android.permission.VIBRATE`** — Expo Go has it; the APK must declare
  it (`"android": { "permissions": ["android.permission.VIBRATE"] }`), and
  the permission check in section 4.6 confirms it is there.
- **Do Not Disturb (KNOWN_ISSUES, two rows).** In Expo Go the tone plays
  during DND (expo-audio uses the media stream and reads only the ringer)
  and the vibration ignores DND and the ringer. A native build can fix both,
  either with **a native interruption-filter check**
  (`NotificationManager.getCurrentInterruptionFilter()` together with the
  ringer mode, gating the tone and the vibration), or by playing the tone
  with **notification-usage audio** (`AudioAttributes.USAGE_NOTIFICATION`)
  so Android applies its own notification rules. Either needs its own
  small native module or a config plugin — **a separate PLAN ONLY**, not
  part of the first APK build.

## 4. Build → install → rebuild checklist

1. Darryl: create the Expo account; `npx eas-cli login`; in `mobile/`,
   `npx eas-cli init` (links the project).
2. The dispatch: `app.json` (package, versionCode, the plugin),
   `eas.json` with the default address, the server-address code, proofs,
   the full mobile gate — committed.
3. `npx eas-cli build -p android --profile preview`. The free plan has a
   monthly build quota and a low-priority queue — **check the current
   limits on expo.dev first**; a build is typically 15–30 minutes in the
   queue plus the build.
4. Download the APK from the build page (or its QR) onto the Tecno. Allow
   "Install unknown apps" for Chrome or Files, install.
5. **The M5 order still holds:** the phone's Chrome reaches
   `http://<laptop IP>:5000/api/health` with `"db":"ok"` first; then open
   the app. If it cannot reach the server, "Change server address" → the
   laptop's current IP → Test → Save.
6. Check every role once (both themes), a photo from the library, a
   message both ways (the toast's tone and vibration; no tone in silent or
   vibrate-only), the bell; confirm the permissions (section 3, including
   `VIBRATE` and no `RECORD_AUDIO`).
7. **Rebuild:** bump `versionCode`, build, install over the old APK (the
   stored server address and theme survive an update; a new `package`
   would not).

## 5. Proofs and gates to add

- **`proof-server-address`** (new): validation (scheme, host, port, `/api`
  appended, trailing slash, garbage refused), the default when nothing is
  stored, reset to the default, a different address clears the session and
  the same one does not — with a negative control on the validator.
- **`proof-api-unwrap`** updated for the base getter (the base is no longer
  a constant).
- **The export grep** on the release bundle, as today, plus a control string
  from `ServerAddressScreen`.
- **The phone check on the installed APK** (section 4.6), not on Expo Go.
- CLAUDE.md estimate when built: about +600 (a new MOBILE section — M22 is
  now the message toast, so the next free number; the cleartext and SDK-58
  KNOWN_ISSUES rows updated).
