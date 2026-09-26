import { useEffect } from 'react';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '../auth/AuthContext';
import AuthUnavailable from '../auth/AuthUnavailable';
import LoadingSpinner from '../components/LoadingSpinner';
import NotificationProvider from '../realtime/NotificationProvider';
import SocketProvider from '../realtime/SocketProvider';
import UnreadProvider from '../realtime/UnreadProvider';
import AboutScreen from '../screens/AboutScreen';
import ConnectionScreen from '../screens/dev/ConnectionScreen';
import ForcedPasswordChangeScreen from '../screens/ForcedPasswordChangeScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import LoginScreen from '../screens/LoginScreen';
import { useTheme } from '../theme/ThemeProvider';
import AppShell from './AppShell';
import { isBuilt } from './routes';

// THE PHONE'S ProtectedRoute + RootRedirect, in one place. Which stack is
// mounted is decided from context, in the web's order:
//
//   loading            OUR spinner on bg-page (no login flash — the web's)
//   authError          AuthUnavailable, token kept, Try again (§22)
//   !user              the auth stack: Login, Forgot password, About (public)
//   must_change_password   ONLY the forced-change screen (§11)
//   otherwise          AppShell — the drawer and the detail stack, inside
//                      the three realtime providers
//
// A `Stack.Screen` that is not mounted cannot be navigated to, which is what
// makes the guards structural rather than a redirect that could loop.
// THE PROVIDERS MOUNT ONLY AROUND A SIGNED-IN TREE: a count provider mounted
// with no token would fire a request, take the 401, and store a logout
// reason for a session that never existed.
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

  const signedIn = Boolean(user) && !user.must_change_password;

  const tree = (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="About" component={AboutScreen} initialParams={{ publicView: true }} />
            {ConnectionScreen ? <Stack.Screen name="Connection" component={ConnectionScreen} /> : null}
          </>
        ) : user.must_change_password ? (
          <Stack.Screen name="ForcedPasswordChange" component={ForcedPasswordChangeScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={AppShell} />
            {ConnectionScreen ? <Stack.Screen name="Connection" component={ConnectionScreen} /> : null}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );

  if (!signedIn) return tree;

  return (
    <SocketProvider>
      <UnreadProvider enabled={isBuilt(`/${user.role}/messages`)}>
        <NotificationProvider>{tree}</NotificationProvider>
      </UnreadProvider>
    </SocketProvider>
  );
}
