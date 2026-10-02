// THE PALETTE IS REPLACED, NOT EXTENDED. `theme.colors` (not `extend.colors`)
// means `bg-slate-500`, `text-rose-600` and every other raw palette utility do
// not exist in this project — the compiler enforces §8 before the lint does.
// Every colour class is a token name (`bg-page`, `text-fg-muted`,
// `border-edge`), each resolving to a CSS variable that `global.css` defines
// for light and, under the dark media block, for dark. Both files are
// generated from client/src/index.css by scripts/check-tokens.mjs.
const { names } = require('./src/theme/tokens');

// THE TYPEFACES (feat/ui-refresh, 2026-10-02) — the web's two, bundled:
// Source Sans 3 for text and Merriweather 700 for titles. The names below are
// the keys `src/theme/fonts.js` registers with expo-font.
//
// A WEIGHT CLASS IS A FAMILY HERE, AND `theme.fontWeight` IS EMPTIED ON
// PURPOSE. React Native has no font matching: a custom family is ONE file,
// and a `fontWeight` beside it makes Android fake the bold by smearing the
// regular file. So `font-medium`, `font-semibold` and `font-bold` each name
// the real file for that weight, and with `fontWeight` emptied no class can
// emit a `fontWeight` at all — the 200-odd weight classes already on the
// screens kept working without being touched.
//
//   font-sans / font-normal    Source Sans 3 Regular  — the default: the
//                              shared `Text` (components/Text.jsx) adds it
//                              to any text that names no family
//   font-medium, font-semibold Source Sans 3 SemiBold — `medium` is 600, as
//                              on the web: only three weights ship
//   font-bold                  Source Sans 3 Bold
//   font-serif                 Merriweather Bold — titles; never beside a
//                              weight class (both are families; one wins)
//
// THE SIZES ARE THE WEB'S SCALE, in rem, and the phone's rem stays 14 (M19):
// one step up from Tailwind's, because Source Sans 3 runs smaller than the
// Roboto it replaces — the apparent size is what it was, not bigger.
const SOURCE_SANS = {
  regular: 'SourceSans3_400Regular',
  semibold: 'SourceSans3_600SemiBold',
  bold: 'SourceSans3_700Bold',
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.jsx', './src/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    colors: {
      transparent: 'transparent',
      ...Object.fromEntries(names.map((name) => [name, `var(--${name})`])),
    },
    fontWeight: {},
    extend: {
      fontFamily: {
        sans: SOURCE_SANS.regular,
        normal: SOURCE_SANS.regular,
        medium: SOURCE_SANS.semibold,
        semibold: SOURCE_SANS.semibold,
        bold: SOURCE_SANS.bold,
        serif: 'Merriweather_700Bold',
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],
        sm: ['0.9375rem', { lineHeight: '1.375rem' }],
        base: ['1.0625rem', { lineHeight: '1.625rem' }],
        lg: ['1.1875rem', { lineHeight: '1.75rem' }],
        xl: ['1.3125rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.625rem', { lineHeight: '2.125rem' }],
        '3xl': ['2rem', { lineHeight: '2.5rem' }],
      },
    },
  },
  plugins: [],
};
