import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '../auth/AuthContext';
import AuthUnavailable from '../auth/AuthUnavailable';
import ConnectionScreen from '../screens/dev/ConnectionScreen';
import ForcedPasswordChangeScreen from '../screens/ForcedPasswordChangeScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import LoginScreen from '../screens/LoginScreen';
import RoleHome from '../screens/RoleHome';
import { useTheme } from '../theme/ThemeProvider';

// THE PHONE'S ProtectedRoute + RootRedirect, in one place. Which stack is
// mounted is decided from context, in the web's order:
//
//   loading            the splash stays up (no login flash — the web's spinner)
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
// registered. `__DEV__` is deliberately NOT the guard; it is not inlined by
// the Hermes export and would leave the screen in the bundle.
const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, loading, authError, retry } = useAuth();
  const { ready, resolved, tokens } = useTheme();

  useEffect(() => {
    if (!loading && ready) SplashScreen.hideAsync().catch(() => {});
  }, [loading, ready]);

  if (loading || !ready) return null;

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
