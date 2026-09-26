import 'react-native-gesture-handler';
import './global.css';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
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
function ThemedStatusBar() {
  const { resolved } = useTheme();
  return <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />;
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
