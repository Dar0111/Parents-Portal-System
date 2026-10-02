import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { Merriweather_700Bold } from '@expo-google-fonts/merriweather/700Bold';
import { SourceSans3_400Regular } from '@expo-google-fonts/source-sans-3/400Regular';
import { SourceSans3_600SemiBold } from '@expo-google-fonts/source-sans-3/600SemiBold';
import { SourceSans3_700Bold } from '@expo-google-fonts/source-sans-3/700Bold';

// THE APP'S FOUR FONT FILES (feat/ui-refresh, 2026-10-02): Source Sans 3 at
// 400 / 600 / 700 and Merriweather 700 — the weights tailwind.config.js names
// and no others. Each is imported from its OWN folder of the font package:
// the package's index requires every weight it has, and all of them would
// land in the bundle.
//
// BUNDLED, NEVER A URL: the .ttf files ship inside the app (the Android
// export's assetmap lists them), so a phone on the demo hotspot needs no
// font host. The keys are the family names the classes resolve to.
const FONTS = {
  SourceSans3_400Regular,
  SourceSans3_600SemiBold,
  SourceSans3_700Bold,
  Merriweather_700Bold,
};

// How long the splash may wait for the fonts. In Expo Go the files come from
// Metro over the LAN; a healthy load is well under a second.
const FONT_WAIT_MS = 2500;

// FONT LOADING NEVER BLOCKS THE APP. "Settled" is true once the fonts have
// loaded, OR failed, OR `FONT_WAIT_MS` has passed — whichever is first. The
// navigator holds the splash for that and for nothing longer, so the M4
// hazard (a boot gate that can stall under Expo Go's overlay) cannot arise:
// the gate has a clock of its own. On the two unhappy paths the app simply
// opens in the system font — every family name falls back to it — and text
// that renders after a late load picks the real font up.
export function useFontsSettled() {
  const [loaded, error] = useFonts(FONTS);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  return loaded || Boolean(error) || timedOut;
}

// For the places a class cannot reach — the navigator's header title.
export const TITLE_FONT = 'Merriweather_700Bold';
