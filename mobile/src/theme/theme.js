import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { StyleSheet as NativeWindStyleSheet } from 'nativewind';
import { dark, light, names } from './tokens';

// THE MOBILE TWIN OF client/src/pages/settings/theme.js — Light / Dark /
// System, stored on THIS DEVICE only (AsyncStorage, key `pp.theme`), DEFAULT
// LIGHT on a fresh device (Darryl, 2026-09-19 — not System), and no server
// column. The print branch does not exist here: nothing on a phone prints.
//
// THE MECHANISM IS NATIVEWIND'S ROOT VARIABLES, set from JS (fix round,
// 2026-10-04). global.css declares every token as a `:root` variable, light
// and dark; `applyTheme` writes the RESOLVED theme's value into each of them
// through NativeWind's public `StyleSheet.registerCompiled` — the call
// global.css itself makes at import — and every class reading `var(--name)`
// re-renders with it, the way `data-theme` on <html> is the switch on the
// web. No screen carries a per-theme variant (§8).
//
// IT NEVER CALLS `Appearance.setColorScheme` (the old mechanism, through
// NativeWind's `colorScheme.set`). On Android that is
// `AppCompatDelegate.setDefaultNightMode` — a process-wide night-mode change
// that Expo Go's window takes as a configuration change, and after it the
// layout and the status bar no longer matched the edge-to-edge window the app
// draws for (the owner's phone check, 2026-10-04: a blank strip at the bottom
// of every screen and a black status bar in Light, until the app restarted).
// A theme switch is now JS state only; the native window is never touched.
// Native chrome the app does not draw — a system Alert, the date picker
// dialog — does NOT follow the app's theme (docs/KNOWN_ISSUES.md): on the
// owner's phone it rendered light even with the phone in Dark.
//
// DEV ONLY: a Fast Refresh that re-injects global.css puts the variables
// back on the phone's own scheme until the next theme apply (a cold boot,
// M7, applies it at once).

// The resolved theme's value for every token, keyed as global.css names them.
function rootVariablesFor(resolved) {
  const table = resolved === 'dark' ? dark : light;
  return Object.fromEntries(names.map((name) => [`--${name}`, table[name]]));
}
//
// THE TEXT-SIZE SETTING IS DROPPED ON MOBILE (Darryl, Stage 5 decision 3): the
// OS font scale does that job, and every <Text> keeps `allowFontScaling` at
// its default of true. Recorded in docs/MOBILE_CONVENTIONS.md as a deviation.

export const THEME_KEY = 'pp.theme';
export const THEMES = ['light', 'dark', 'system'];
const DEFAULT_THEME = 'light';

export const THEME_OPTIONS = [
  { value: 'light', label: 'Light', description: 'The default.' },
  { value: 'dark', label: 'Dark', description: 'Darker colors, easier on the eyes at night.' },
  { value: 'system', label: 'System', description: "Follows your device's setting and changes with it." },
];

// The stored PREFERENCE (light | dark | system). Unknown or missing reads as
// the default and is left in storage untouched until the user picks.
export async function readTheme() {
  try {
    const stored = await AsyncStorage.getItem(THEME_KEY);
    return THEMES.includes(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

// The RESOLVED theme (light | dark) for a preference — `Appearance` is the
// phone's own setting, the counterpart of the web's matchMedia.
export function resolveTheme(preference) {
  if (preference === 'dark') return 'dark';
  if (preference === 'system') return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  return 'light';
}

// Applies for this session: the resolved theme's values go into NativeWind's
// root variables. `system` resolves against the phone's setting NOW;
// ThemeProvider applies it again whenever that setting changes, while the
// stored preference is `system`. The return value is what it resolved to,
// for the callers that need a hex (StatusBar, the navigator).
export function applyTheme(preference) {
  const resolved = resolveTheme(THEMES.includes(preference) ? preference : DEFAULT_THEME);
  NativeWindStyleSheet.registerCompiled({ rootVariables: rootVariablesFor(resolved) });
  return resolved;
}

// Applies, then tries to remember. Returns whether the device will remember
// (false = storage refused; the theme still applied for this session).
export async function saveTheme(preference) {
  applyTheme(preference);
  try {
    if (preference === DEFAULT_THEME) await AsyncStorage.removeItem(THEME_KEY);
    else await AsyncStorage.setItem(THEME_KEY, preference);
    return true;
  } catch {
    return false;
  }
}
