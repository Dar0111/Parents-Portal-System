// THE TOKEN MIRROR — one source, two derived files (Stage 5 scaffold, 2026-09-27).
//
// `client/src/index.css` is the ONLY place a colour is chosen (FRONTEND_CONVENTIONS
// §8). This script reads its `:root` block (light) and its `[data-theme="dark"]`
// block, converts every value to something React Native can parse, and writes:
//
//   src/theme/tokens.js   { light, dark, names } as CommonJS — for the places a
//                         class name cannot reach (StatusBar, the navigator's
//                         theme, the splash background)
//   global.css            the same values as CSS custom properties under
//                         `@layer base`, light in `:root`, dark under
//                         `@media (prefers-color-scheme: dark)` — the block
//                         NativeWind swaps when the colour scheme changes
//
// WHY CONVERT AT ALL. The web writes `oklch()` and `color-mix()`; RN's colour
// parser knows hex, rgb(a) and hsl(a), nothing else. The maths is Björn
// Ottosson's OKLab reference (the same one Tailwind v4 used to derive its
// palette), and it was probed against seven Tailwind hexes before this file
// was written — slate-50, slate-900, slate-950, emerald-700, rose-600,
// sky-500, amber-400 — all seven exact. A value in a shape this file does not
// know THROWS rather than being guessed.
//
// TWO MODES. `--write` regenerates both files. With no flag it regenerates in
// memory and compares, byte for byte after CRLF normalisation, so a token
// added, renamed or re-valued on the web fails the mobile lint until the two
// files are regenerated — that is the whole drift guard. Run from `mobile/`:
//
//   node scripts/check-tokens.mjs --write
//   node scripts/check-tokens.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(here, '..');
const SOURCE = path.resolve(MOBILE, '..', 'client', 'src', 'index.css');
const TOKENS_OUT = path.join(MOBILE, 'src', 'theme', 'tokens.js');
const CSS_OUT = path.join(MOBILE, 'global.css');

// ---------------------------------------------------------------------------
// Parsing — the first `:root {` block is the light theme, the first
// `[data-theme="dark"] {` block is the dark one. Both are flat lists of
// `--name: value; /* note */` lines.
// ---------------------------------------------------------------------------
function blockAfter(css, opener) {
  const start = css.indexOf(opener);
  if (start < 0) throw new Error(`check-tokens: "${opener}" not found in ${SOURCE}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`check-tokens: unterminated block after "${opener}"`);
}

function parseTokens(block) {
  const out = new Map();
  // Strip comments first: a `/* … */` can span lines and can contain `;`.
  const bare = block.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(bare))) out.set(m[1], m[2].trim());
  return out;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------
function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function gamma(c) {
  const v = clamp01(c);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, bl].map((x) => Math.round(gamma(x) * 255));
}

function hex(rgb) {
  return '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('');
}

function parseOklch(text) {
  const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(text);
  if (!m) return null;
  return oklchToRgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
}

function expandHex(text) {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(text);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

function convert(name, value) {
  const asHex = expandHex(value);
  if (asHex) return asHex;

  const rgb = parseOklch(value);
  if (rgb) return hex(rgb);

  // color-mix(in oklab, <color> N%, transparent)  ->  rgba(<color>, N/100)
  let m = /^color-mix\(in oklab,\s*(.+?)\s+([\d.]+)%,\s*transparent\)$/.exec(value);
  if (m) {
    const base = parseOklch(m[1]) || (expandHex(m[1]) && hexToRgb(expandHex(m[1])));
    if (!base) throw new Error(`check-tokens: --${name}: cannot convert the colour inside color-mix: ${m[1]}`);
    return `rgba(${base.join(',')},${Number(m[2]) / 100})`;
  }

  // rgb(R G B / A)  ->  rgba(R,G,B,A)
  m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/.exec(value);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${m[4]})`;

  throw new Error(`check-tokens: --${name}: unknown value shape "${value}" — teach this script, do not guess a hex`);
}

function hexToRgb(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
function generate() {
  const css = fs.readFileSync(SOURCE, 'utf8');
  const light = parseTokens(blockAfter(css, ':root'));
  const dark = parseTokens(blockAfter(css, '[data-theme="dark"]'));
  const themeMap = parseTokens(blockAfter(css, '@theme inline'));

  // The dark block also carries `color-scheme: dark`, which is not a token
  // and is not a `--` property, so parseTokens never sees it. Every name must
  // exist in all three places, or the web itself is inconsistent.
  const names = [...light.keys()];
  const mapped = new Set([...themeMap.keys()].map((k) => k.replace(/^color-/, '')));
  const problems = [];
  for (const n of names) {
    if (!dark.has(n)) problems.push(`--${n} is in :root but not in [data-theme="dark"]`);
    if (!mapped.has(n)) problems.push(`--${n} is in :root but not in @theme inline`);
  }
  for (const n of dark.keys()) if (!light.has(n)) problems.push(`--${n} is in [data-theme="dark"] but not in :root`);
  for (const n of mapped) if (!light.has(n)) problems.push(`--color-${n} is in @theme inline but not in :root`);
  if (problems.length) throw new Error(`check-tokens: ${SOURCE} is inconsistent:\n  ${problems.join('\n  ')}`);

  const lightOut = {};
  const darkOut = {};
  for (const n of names) {
    lightOut[n] = convert(n, light.get(n));
    darkOut[n] = convert(n, dark.get(n));
  }

  const headerLines = [
    'GENERATED by scripts/check-tokens.mjs from client/src/index.css — do not edit.',
    `${names.length} tokens × 2 themes. Regenerate with \`node scripts/check-tokens.mjs --write\`;`,
    'the plain run fails the mobile lint when this file and the web disagree.',
  ];
  const header = (comment) =>
    comment === '/*'
      ? `/* ${headerLines[0]}\n * ${headerLines[1]}\n * ${headerLines[2]} */\n`
      : headerLines.map((l) => `${comment} ${l}`).join('\n') + '\n';

  const entries = (obj) => names.map((n) => `  '${n}': '${obj[n]}',`).join('\n');
  const tokensJs =
    header('//') +
    '// CommonJS on purpose: tailwind.config.js (Node, CJS) requires it, and Metro\n' +
    '// resolves it for `import { light, dark, names } from "./tokens"` all the same.\n' +
    `const light = {\n${entries(lightOut)}\n};\n\n` +
    `const dark = {\n${entries(darkOut)}\n};\n\n` +
    `const names = Object.freeze(${JSON.stringify(names)});\n\n` +
    'module.exports = { light, dark, names };\n';

  const vars = (obj, indent) => names.map((n) => `${indent}--${n}: ${obj[n]};`).join('\n');
  const globalCss =
    header('/*') +
    '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n' +
    '@layer base {\n' +
    `  :root {\n${vars(lightOut, '    ')}\n  }\n\n` +
    '  @media (prefers-color-scheme: dark) {\n' +
    `    :root {\n${vars(darkOut, '      ')}\n    }\n` +
    '  }\n' +
    '}\n';

  return { names, tokensJs, globalCss };
}

function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

const { names, tokensJs, globalCss } = generate();

if (process.argv.includes('--write')) {
  fs.writeFileSync(TOKENS_OUT, tokensJs);
  fs.writeFileSync(CSS_OUT, globalCss);
  console.log(`check-tokens: wrote ${names.length} tokens × 2 themes to src/theme/tokens.js and global.css`);
} else {
  const drift = [];
  for (const [file, expected] of [
    [TOKENS_OUT, tokensJs],
    [CSS_OUT, globalCss],
  ]) {
    const actual = fs.existsSync(file) ? normalize(fs.readFileSync(file, 'utf8')) : null;
    if (actual !== normalize(expected)) drift.push(path.relative(MOBILE, file));
  }
  if (drift.length) {
    console.error(`check-tokens: ${drift.join(' and ')} no longer match client/src/index.css — run \`node scripts/check-tokens.mjs --write\` and review the diff`);
    process.exit(1);
  }
  console.log(`check-tokens: ${names.length} tokens × 2 themes — src/theme/tokens.js and global.css match client/src/index.css`);
}
