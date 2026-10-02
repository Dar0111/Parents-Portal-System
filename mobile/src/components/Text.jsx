import { createContext, useContext } from 'react';
import { Text as NativeText } from 'react-native';

// THE APP'S TEXT (feat/ui-refresh, 2026-10-02). React Native has no document
// font: a family reaches text only as a class or style on each `Text`, and
// React 19 ignores `Text.defaultProps` (M19). So every screen imports THIS
// `Text` instead of react-native's, and it adds the text face (`font-sans`,
// Source Sans 3 Regular) to any text that does not name a family itself.
//
// A family class is any of font-sans / -normal / -medium / -semibold / -bold
// / -serif / -mono (tailwind.config.js: a weight class IS a family here).
// Decided on the class STRING rather than left to stylesheet order, so the
// default can never beat a `font-semibold` written at the call site.
//
// NESTED TEXT INHERITS, as it does in React Native: a `Text` inside another
// `Text` gets no default, so `<Text className="font-semibold">Grade <Text
// className="text-fg-muted">6</Text></Text>` keeps the inner run semibold.
//
// Everything else is react-native's Text untouched: `allowFontScaling` stays
// at its default (the OS font scale is the phone's text size — M3), and every
// prop is passed through.
const InsideText = createContext(false);

const NAMES_A_FAMILY = /(?:^|\s)font-(?:sans|normal|medium|semibold|bold|serif|mono)(?:\s|$)/;

export default function Text({ className = '', children, ...rest }) {
  const nested = useContext(InsideText);
  const resolved = nested || NAMES_A_FAMILY.test(className) ? className : `font-sans ${className}`;

  return (
    <NativeText className={resolved} {...rest}>
      <InsideText.Provider value={true}>{children}</InsideText.Provider>
    </NativeText>
  );
}
