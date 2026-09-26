// THE PALETTE IS REPLACED, NOT EXTENDED. `theme.colors` (not `extend.colors`)
// means `bg-slate-500`, `text-rose-600` and every other raw palette utility do
// not exist in this project — the compiler enforces §8 before the lint does.
// Every colour class is a token name (`bg-page`, `text-fg-muted`,
// `border-edge`), each resolving to a CSS variable that `global.css` defines
// for light and, under the dark media block, for dark. Both files are
// generated from client/src/index.css by scripts/check-tokens.mjs.
const { names } = require('./src/theme/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.jsx', './src/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    colors: {
      transparent: 'transparent',
      ...Object.fromEntries(names.map((name) => [name, `var(--${name})`])),
    },
    extend: {},
  },
  plugins: [],
};
