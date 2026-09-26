// NativeWind v4 on Expo SDK 57 — the two presets the installation guide names,
// in this order. `jsxImportSource: 'nativewind'` is what lets `className` on a
// core component resolve at all; without it every class is silently dropped
// and the app renders unstyled with no error.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
