import { useEffect } from 'react';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { nextStep } from '../auth/accountSteps';
import { useAuth } from '../auth/AuthContext';
import AuthUnavailable from '../auth/AuthUnavailable';
import LoadingSpinner from '../components/LoadingSpinner';
import NotificationProvider from '../realtime/NotificationProvider';
import SocketProvider from '../realtime/SocketProvider';
import UnreadProvider from '../realtime/UnreadProvider';
import AboutScreen from '../screens/AboutScreen';
import ConfirmContactScreen from '../screens/ConfirmContactScreen';
import ConnectionScreen from '../screens/dev/ConnectionScreen';
import ForcedPasswordChangeScreen from '../screens/ForcedPasswordChangeScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import LoginScreen from '../screens/LoginScreen';
import PolicyConsentScreen from '../screens/PolicyConsentScreen';
import { useFontsSettled } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import AppShell, { ScreenFrame } from './AppShell';
import { isBuilt } from './routes';

// THE PHONE'S ProtectedRoute + RootRedirect, in one place. Which stack is
// mounted is decided from context, in the web's order:
//
//   loading            OUR spinner on bg-page (no login flash — the web's)
//   authError          AuthUnavailable, token kept, Try again (§22)
//   !user              the auth stack: Login, Forgot password, About (public)
//   a step left        ONLY that step's screen, in the server's order —
//                      nextStep() from the mirrored auth/accountSteps.js
//                      (feat/first-signin, 2026-10-18; M26):
//                        consent   PolicyConsent
//                        contact   ConfirmContact (a confirmed Gmail or number)
//                        password  ForcedPasswordChange (the new password)
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

// A `screenLayout` IS CALLED AS A PLAIN FUNCTION, NOT RENDERED (B1,
// fix/mobile-popto, 2026-09-29). React Navigation's useDescriptors calls
// `layout({ children, ... })` once per route INSIDE the navigator's own
// render, so a layout that calls hooks puts them in the navigator's hook
// list — and the list changes length every time a route is pushed or
// popped: React's "change in the order of Hooks called by
// NativeStackNavigator". `ScreenFrame` reads two contexts, so it is
// RENDERED here as an element, the shape AppShell's `withStrip` already
// has. Never pass a hook-calling component to `screenLayout` directly.
function frameLayout({ children }) {
  return <ScreenFrame>{children}</ScreenFrame>;
}

// HOME TAKES NO FRAME (fix round, 2026-10-04). Home is AppShell, whose own
// navigators already frame every screen they hold, and whose drawer panel
// pads its own bottom (M9). A frame here too stacked the bottom inset: a
// drawer screen was lifted by it THREE times (this frame, the detail stack's
// around the drawer, the drawer screen's own) and the drawer panel ended two
// insets above the navigation bar — the blank strip of the owner's phone
// check. A screen-level `layout` beats the navigator's `screenLayout`, and it
// is called the same way, so it is a module-level function with no hook.
function bareLayout({ children }) {
  return children;
}

// THE SPLASH IS RELEASED WHEN THE THEME IS READY, NOT WHEN /auth/me ANSWERS
// (phone check, 2026-09-27). The first build held it until the session read
// finished; on the 503 check the phone sat on Expo Go's white loading view
// for 30+ seconds with no way out and nothing to read — under that overlay
// the dev menu does not open and no screen of ours can show. The web never
// had this hazard: its "no login flash" is a SPINNER of its own, not a
// native overlay. So: theme applied → splash hidden → our spinner on
// `bg-page` while the session reads → then Login, AuthUnavailable or the
// home. The 15 s timeout in api/client.js guarantees the spinner ends.
//
// THE FONTS ARE THE ONE OTHER THING THE SPLASH WAITS FOR, AND ONLY WITH A
// CLOCK (feat/ui-refresh, 2026-10-02). `fontsSettled` is true when the four
// bundled font files have loaded, or failed, or 2.5 s have passed —
// theme/fonts.js — so this gate cannot stall the way the session read did:
// the worst case is the app opening in the system font. It is here so the
// first screen is not drawn in one typeface and redrawn in another.
export default function RootNavigator() {
  const { user, loading, authError, retry } = useAuth();
  const { ready: themeReady, resolved, tokens } = useTheme();
  const fontsSettled = useFontsSettled();
  const ready = themeReady && fontsSettled;

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

  // Signed in for the providers' purposes only once ALL THREE steps are past:
  // a socket and two count requests for a session the server still refuses
  // (`POLICY_ACCEPTANCE_REQUIRED`, `CONTACT_VERIFICATION_REQUIRED`,
  // `MUST_CHANGE_PASSWORD`) would only fail.
  const step = nextStep(user);
  const signedIn = Boolean(user) && !step;

  const tree = (
    <NavigationContainer theme={navTheme}>
      {/* `screenLayout={frameLayout}`: the auth screens sit outside AppShell's
          navigators and need the same bottom safe-area frame (their tops
          pad by inset already). Not `withStrip` — the providers are not
          mounted here, and the strip would report a channel that has not
          been opened. Home overrides it with `bareLayout` (above). */}
      <Stack.Navigator screenLayout={frameLayout} screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="About" component={AboutScreen} initialParams={{ publicView: true }} />
            {ConnectionScreen ? <Stack.Screen name="Connection" component={ConnectionScreen} /> : null}
          </>
        ) : step === 'consent' ? (
          <Stack.Screen name="PolicyConsent" component={PolicyConsentScreen} />
        ) : step === 'contact' ? (
          <Stack.Screen name="ConfirmContact" component={ConfirmContactScreen} />
        ) : step === 'password' ? (
          <Stack.Screen name="ForcedPasswordChange" component={ForcedPasswordChangeScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={AppShell} layout={bareLayout} />
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
