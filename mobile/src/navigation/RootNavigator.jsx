import { useEffect } from 'react';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '../auth/AuthContext';
import AuthUnavailable from '../auth/AuthUnavailable';
import LoadingSpinner from '../components/LoadingSpinner';
import ConnectionScreen from '../screens/dev/ConnectionScreen';
import ForcedPasswordChangeScreen from '../screens/ForcedPasswordChangeScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import LoginScreen from '../screens/LoginScreen';
import RoleHome from '../screens/RoleHome';
import { useTheme } from '../theme/ThemeProvider';

// THE PHONE'S ProtectedRoute + RootRedirect, in one place. Which stack is
// mounted is decided from context, in the web's order:
//
//   loading            OUR spinner on bg-page (no login flash — the web's)
//   authError          AuthUnavailable, token kept, Try again (§22)
//   !user              the auth stack: Login, Forgot password
//   must_change_password   ONLY the forced-change screen (§11)
//   otherwise          the role's home
//
// A `Stack.Screen` that is not mounted cannot be navigated to, which is what
// makes the guards structural rather than a redirect that could loop.
// The DEV-only Connection screen is registered in both stacks, so it can be
// reached before AND after sign-in — and only when its import resolved to a
// component: in a production bundle src/screens/dev/ is an empty module
// (metro.config.js), so `ConnectionScreen` is undefined and nothing is
// registered. `__DEV__` is deliberately NOT the guard: a `__DEV__ ?` JSX
// branch left its strings in the first production bundle (measured), and a
// static import keeps the module in the graph regardless of any branch.
const Stack = createNativeStackNavigator();

// THE SPLASH IS RELEASED WHEN THE THEME IS READY, NOT WHEN /auth/me ANSWERS
// (phone check, 2026-09-27). The first build held it until the session read
// finished; on the 503 check the phone sat on Expo Go's white loading view
// for 30+ seconds with no way out and nothing to read — under that overlay
// the dev menu does not open and no screen of ours can show. The web never
// had this hazard: its "no login flash" is a SPINNER of its own, not a
// native overlay. So: theme applied → splash hidden → our spinner on
// `bg-page` while the session reads → then Login, AuthUnavailable or the
// home. The 15 s timeout in api/client.js guarantees the spinner ends.
export default function RootNavigator() {
  const { user, loading, authError, retry } = useAuth();
  const { ready, resolved, tokens } = useTheme();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (__DEV__) {
      console.log(
        `[boot] navigator: ready=${ready} loading=${loading} authError=${authError ? JSON.stringify(authError) : 'null'} user=${user ? user.role : 'null'}`
      );
    }
  }, [ready, loading, authError, user]);

  if (!ready) return null;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-page">
        <LoadingSpinner />
      </View>
    );
  }

  if (authError) {
    return <AuthUnavailable message={authError} onRetry={retry} />;
  }

  const navTheme = {
    ...(resolved === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(resolved === 'dark' ? DarkTheme : DefaultTheme).colors,
      primary: tokens.primary,
      background: tokens.page,
      card: tokens.surface,
      text: tokens.fg,
      border: tokens.edge,
      notification: tokens['danger-icon'],
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            {ConnectionScreen ? <Stack.Screen name="Connection" component={ConnectionScreen} /> : null}
          </>
        ) : user.must_change_password ? (
          <Stack.Screen name="ForcedPasswordChange" component={ForcedPasswordChangeScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={RoleHome} />
            {ConnectionScreen ? <Stack.Screen name="Connection" component={ConnectionScreen} /> : null}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
