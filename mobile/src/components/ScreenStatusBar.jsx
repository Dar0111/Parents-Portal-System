import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

// THE STATUS BAR FOR A SCREEN WHOSE TOP IS NOT A HEADER (re-check fix,
// 2026-10-04). App.jsx paints the bar the header colour; a screen that draws
// something else at its top — the sign-in band, the public About's page —
// renders this with that colour. React Native's StatusBar keeps a stack of its
// mounted components and the newest wins, so this overrides App.jsx's while
// it is mounted and hands the bar back when it unmounts.
//
// ONLY WHILE FOCUSED: a native-stack screen stays mounted under the one pushed
// on top of it (Login under Forgot password and About), and a hidden screen
// must not keep its colour on the bar. The icons follow the theme exactly as
// App.jsx's do — every top colour in one theme shares its lightness.
export default function ScreenStatusBar({ color }) {
  const focused = useIsFocused();
  const { resolved } = useTheme();
  if (!focused) return null;
  return <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={color} translucent={false} />;
}
