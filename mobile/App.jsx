import 'react-native-gesture-handler';
import './global.css';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/auth/tokenStore';
import { AuthProvider } from './src/auth/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import ThemeProvider, { useTheme } from './src/theme/ThemeProvider';

// The splash stays up until the stored theme is applied and /auth/me has
// answered (RootNavigator hides it) — the phone's version of "a refresh shows
// the spinner with no login flash".
SplashScreen.preventAutoHideAsync().catch(() => {});

// Not exported: the status bar follows the resolved theme, and this is the
// one place above the navigator that can read it.
//
// THE BAR IS PAINTED, NEVER LEFT TO ITS DEFAULT (re-check fix, 2026-10-04).
// React Native's StatusBar sends a background colour on every Android update;
// given none, it re-sends DEFAULT_BACKGROUND_COLOR — the window's status-bar
// colour with its alpha dropped — so a transparent bar came back opaque
// black, under dark icons in Light. expo-status-bar has no colour prop, so
// this is React Native's own StatusBar. The colour is the header's
// (`surface`), the top of every signed-in screen; a screen with another top
// colour overrides it while focused (components/ScreenStatusBar.jsx).
// `translucent` stays false: the app is laid out below the bar, as it was.
function ThemedStatusBar() {
  const { resolved, tokens } = useTheme();
  return <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={tokens.surface} translucent={false} />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <ThemedStatusBar />
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
