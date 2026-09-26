import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { colorScheme as nativewindScheme } from 'nativewind';

// THE MOBILE TWIN OF client/src/pages/settings/theme.js — Light / Dark /
// System, stored on THIS DEVICE only (AsyncStorage, key `pp.theme`), DEFAULT
// LIGHT on a fresh device (Darryl, 2026-09-19 — not System), and no server
// column. The print branch does not exist here: nothing on a phone prints.
//
// THE MECHANISM IS NATIVEWIND'S COLOUR SCHEME, not a class. global.css keys
// every token on `@media (prefers-color-scheme: dark)`, and NativeWind
// resolves that media query against the scheme set here — so `colorScheme.set`
// is the whole switch, the way `data-theme` on <html> is on the web. No screen
// carries a per-theme variant (§8).
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

// Applies for this session. `system` is handed to NativeWind as `system` so it
// follows the OS live; the return value is what it resolves to right now, for
// the callers that need a hex (StatusBar, the navigator).
export function applyTheme(preference) {
  nativewindScheme.set(THEMES.includes(preference) ? preference : DEFAULT_THEME);
  return resolveTheme(preference);
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
