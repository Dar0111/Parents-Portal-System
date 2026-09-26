import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { light, dark } from './tokens';
import { applyTheme, readTheme, resolveTheme, saveTheme } from './theme';

// Holds the preference and the resolved theme for the whole app, and applies
// the stored preference ONCE at boot — the counterpart of `initTheme()` in
// main.jsx. `tokens` is the hex table for the resolved theme, for the handful
// of places a class cannot reach (StatusBar, the navigator's background, an
// SVG icon's colour). Everything with a className reads the CSS variables and
// never touches this.
//
// System stays live: an Appearance listener re-resolves while, and only while,
// the stored preference is `system`.

const ThemeContext = createContext({
  preference: 'light',
  resolved: 'light',
  tokens: light,
  ready: false,
  setPreference: async () => true,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState('light');
  const [resolved, setResolved] = useState('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readTheme().then((stored) => {
      if (cancelled) return;
      setPreferenceState(stored);
      setResolved(applyTheme(stored));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (preference !== 'system') return undefined;
    const sub = Appearance.addChangeListener(() => setResolved(resolveTheme('system')));
    return () => sub.remove();
  }, [preference]);

  const setPreference = useCallback(async (next) => {
    setPreferenceState(next);
    setResolved(resolveTheme(next));
    return saveTheme(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, tokens: resolved === 'dark' ? dark : light, ready, setPreference }),
    [preference, resolved, ready, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
