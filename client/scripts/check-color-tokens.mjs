// Fails when any file under src/ (other than src/index.css) carries a raw
// palette color utility, an arbitrary color value, or a `dark:` variant.
//
// Since 2026-09-19 (feat/design-tokens, docs/FRONTEND_CONVENTIONS.md §8) every
// color a page uses is a semantic token defined once in src/index.css —
// bg-surface, text-fg-muted, border-edge, ring-focus-ring, the tone triplets —
// so a theme is a change to that one file, never a `dark:` sprinkled through
// fifty pages. Run with `npm run lint:tokens`; the SSR proof of every client
// dispatch runs it too. Zero matches is the done-condition.
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.argv[2] || 'src');
const EXEMPT = new Set([path.join(SRC, 'index.css')]);

const FAMILIES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';
const PREFIXES =
  'bg|text|border|ring|divide|placeholder|decoration|outline|from|to|via|shadow|fill|stroke|accent|caret|inset-ring|ring-offset|border-[trblxy]|border-[se]';
// (variant:)* prefix-family(-shade)?(/alpha)?   — a token name never contains a family word.
const PALETTE = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(?:${PREFIXES})-(?:${FAMILIES})(?:-\\d{2,3})?(?:/\\d{1,3})?(?![\\w-])`, 'g');
// (variant:)* prefix-[#hex] / -[rgb(…)] / -[hsl(…)] / -[oklch(…)] / -[oklab(…)]
const ARBITRARY = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(?:${PREFIXES})-\\[(?:#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\(|oklch\\(|oklab\\(|color\\()[^\\]]*\\]`, 'g');
const DARK = /(?<![\w-])dark:/g;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(jsx?|tsx?|css|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const findings = [];
for (const file of walk(SRC)) {
  if (EXEMPT.has(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const re of [PALETTE, ARBITRARY, DARK]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) findings.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${m[0]}`);
    }
  });
}

if (findings.length) {
  console.error(`check-color-tokens: ${findings.length} raw color utilit${findings.length === 1 ? 'y' : 'ies'} outside src/index.css:`);
  for (const f of findings) console.error('  ' + f);
  process.exit(1);
}
console.log('check-color-tokens: 0 raw color utilities outside src/index.css');
