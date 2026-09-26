// THE WEB'S check-color-tokens.mjs, adapted for React Native. Fails when any
// file under src/ carries a raw palette colour utility, an arbitrary colour
// value, a `dark:` variant — OR a hex / rgb literal outside src/theme/tokens.js,
// which is the RN-specific hole: a `style={{ color: '#fff' }}` never goes
// through Tailwind, so the web's three regexes would not see it. Every colour
// a screen uses is a token name in a className, or a value read from
// theme/tokens.js (an SVG icon, the StatusBar). Run from `mobile/`:
//
//   node scripts/check-color-tokens.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(here, '..');
const SRC = path.join(MOBILE, 'src');
const EXEMPT = new Set([path.join(SRC, 'theme', 'tokens.js')]);

const FAMILIES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';
const PREFIXES =
  'bg|text|border|ring|divide|placeholder|decoration|outline|from|to|via|shadow|fill|stroke|accent|caret|inset-ring|ring-offset|border-[trblxy]|border-[se]';
const PALETTE = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(?:${PREFIXES})-(?:${FAMILIES})(?:-\\d{2,3})?(?:/\\d{1,3})?(?![\\w-])`, 'g');
const ARBITRARY = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(?:${PREFIXES})-\\[(?:#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\(|oklch\\(|oklab\\(|color\\()[^\\]]*\\]`, 'g');
const DARK = /(?<![\w-])dark:/g;
// A colour literal in JS: '#abc', '#aabbcc', rgb(...), rgba(...), hsl(...).
const LITERAL = /(['"`])(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))\1/g;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(jsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const findings = [];
for (const file of walk(SRC)) {
  if (EXEMPT.has(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const re of [PALETTE, ARBITRARY, DARK, LITERAL]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) findings.push(`${path.relative(MOBILE, file)}:${i + 1}: ${m[0]}`);
    }
  });
}

if (findings.length) {
  console.error(`check-color-tokens: ${findings.length} raw colour${findings.length === 1 ? '' : 's'} outside src/theme/tokens.js:`);
  for (const f of findings) console.error('  ' + f);
  process.exit(1);
}
console.log('check-color-tokens: 0 raw colours outside src/theme/tokens.js');
