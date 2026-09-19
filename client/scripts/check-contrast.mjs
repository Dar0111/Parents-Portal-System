// WCAG contrast of every text / background token pair that occurs in the
// client, in BOTH themes, read from src/index.css (the :root light block and
// the [data-theme="dark"] block). Text must reach 4.5, icons and UI parts 3.0.
// Exit 1 on any failing pair that is not in ALLOW below — and every ALLOW
// entry must be recorded in docs/KNOWN_ISSUES.md by its marker, so a pair can
// only be waived by writing it down. `npm run lint:contrast`.
//
// PAIRS is maintained by hand: add a row when a page puts a token on a
// background it was not on before. Boundaries (a card edge on the page, a
// bubble on the card) are reported but never fail — WCAG scores text and
// meaningful UI parts, not decorative borders.
import fs from 'node:fs';
import path from 'node:path';

const CSS = path.resolve(process.argv[2] || 'src/index.css');
const KNOWN_ISSUES = path.resolve(process.argv[3] || '../docs/KNOWN_ISSUES.md');
const css = fs.readFileSync(CSS, 'utf8');

function block(selector) {
  const re = new RegExp(selector.replace(/[[\]"]/g, (c) => '\\' + c) + '\\s*\\{([\\s\\S]*?)\\n\\}', 'g');
  let out = '';
  for (const m of css.matchAll(re)) out += m[1] + '\n';
  return out;
}
function tokens(text) {
  const t = {};
  for (const m of text.matchAll(/--([a-z-]+):\s*([^;]+);/g)) t[m[1]] = m[2].trim();
  return t;
}
const LIGHT = tokens(block(':root'));
const DARK = { ...LIGHT, ...tokens(block('[data-theme="dark"]')) };

function oklchToLinear(L, C, H) {
  const h = (H * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => Math.min(1, Math.max(0, v)));
}
function luminance(value) {
  let m = value.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/);
  if (m) { const [r, g, b] = oklchToLinear(Number(m[1]) / 100, Number(m[2]), Number(m[3])); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  m = value.match(/^#([0-9a-f]{3,6})$/i);
  if (m) { const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]; const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  throw new Error('cannot read color value: ' + value);
}
function contrast(theme, fg, bg) {
  if (!(fg in theme)) throw new Error('unknown token ' + fg);
  if (!(bg in theme)) throw new Error('unknown token ' + bg);
  const a = luminance(theme[fg]), b = luminance(theme[bg]);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// [fg, bg, kind, where]  kind: text (4.5) | ui (3.0) | disabled | boundary (reported only)
const PAIRS = [
  ['fg', 'surface', 'text', 'body text on cards'], ['fg', 'page', 'text', 'headings on the page'], ['fg', 'surface-muted', 'text', 'active nav / settings tab'], ['fg', 'surface-subtle', 'text', 'dl values in bands'],
  ['fg-secondary', 'surface', 'text', 'form labels'], ['fg-secondary', 'surface-subtle', 'text', 'labels in bands'],
  ['fg-body', 'surface', 'text', 'secondary buttons, copy'], ['fg-body', 'page', 'text', 'nav inactive'], ['fg-body', 'surface-subtle', 'text', 'DataTable header and pager'], ['fg-body', 'surface-muted', 'text', 'secondary button hover'],
  ['fg-muted', 'surface', 'text', 'muted copy, placeholders, dt labels'], ['fg-muted', 'page', 'text', 'muted copy on the page'], ['fg-muted', 'surface-subtle', 'text', 'muted copy in bands'], ['fg-muted', 'surface-muted', 'text', 'count chip on the parent announcement row'],
  ['fg-faint', 'surface', 'ui', 'spinner, modal close, password eye'], ['fg-ghost', 'surface', 'ui', 'inactive sort icon, empty-state icon, checklist dot'],
  ['primary-fg', 'primary', 'text', 'primary buttons, badges'], ['primary-fg', 'primary-hover', 'text', 'primary button hover'], ['primary-fg', 'primary-disabled', 'disabled', 'disabled primary button'],
  ['solid-fg', 'danger-solid', 'text', 'danger buttons'], ['solid-fg', 'danger-solid-hover', 'text', 'danger hover'], ['solid-fg', 'success-solid', 'text', 'Approve buttons'], ['solid-fg', 'success-solid-hover', 'text', 'Approve hover'],
  ['danger-text', 'surface', 'text', 'FormField error, ghost danger buttons'], ['danger-text', 'danger-soft', 'text', 'ghost danger button hover'], ['danger-icon', 'surface', 'ui', 'required asterisk'],
  ['neutral-fg', 'neutral-soft', 'text', 'pill neutral'], ['success-fg', 'success-soft', 'text', 'pill success'], ['warning-fg', 'warning-soft', 'text', 'pill warning'], ['danger-fg', 'danger-soft', 'text', 'pill danger'], ['info-fg', 'info-soft', 'text', 'pill info'],
  ['success-strong', 'success-soft', 'text', 'FormStatus success'], ['success-icon', 'success-soft', 'ui', 'FormStatus icon'], ['danger-strong', 'danger-soft', 'text', 'ErrorAlert'], ['danger-icon', 'danger-soft', 'ui', 'ErrorAlert icon'], ['danger-fg', 'danger-soft', 'text', 'ErrorAlert retry link'],
  ['warning-strong', 'warning-soft', 'text', 'LiveStatus'], ['warning-strong', 'surface', 'text', 'LiveStatus Refresh'], ['warning-strong', 'warning-soft-hover', 'text', 'Refresh hover'], ['info-strong', 'info-soft', 'text', 'info notes'],
  ['success-fg', 'surface', 'text', 'checklist passed'], ['success-icon', 'surface', 'ui', 'checklist icon'], ['warning-icon', 'surface', 'ui', 'blocked-nav icon'],
  ['bubble-mine-fg', 'bubble-mine', 'text', 'own message'], ['bubble-mine-meta', 'bubble-mine', 'text', 'own timestamp'], ['bubble-theirs-fg', 'bubble-theirs', 'text', 'their message'], ['bubble-theirs-meta', 'bubble-theirs', 'text', 'their timestamp'],
  ['focus-accent', 'surface', 'ui', 'grade-cell focus ring'], ['edge-strong', 'surface', 'ui', 'control border'],
  // brand (D3): content links, the active nav item, the seal disc
  ['brand', 'surface', 'text', 'content links on cards'], ['brand', 'page', 'text', 'content links on the page'], ['brand', 'surface-subtle', 'text', 'content links in bands'], ['brand', 'surface-muted', 'text', 'content links on a hovered row'], ['brand', 'brand-soft', 'text', 'active nav / settings tab'],
  ['brand-soft', 'surface', 'boundary', 'active-nav tint vs sidebar'], ['seal-bg', 'surface', 'boundary', 'seal disc vs sidebar'],
  // brand panel — the Login split panel / mobile band
  ['brand-panel-fg', 'brand-panel', 'text', 'Login panel headings and name lines'], ['brand-panel-muted', 'brand-panel', 'text', 'Login panel district and Est. lines'],
  // …and the same two over `brand-panel-lit`, the panel composited with the
  // decorative glow at its strongest point. The glow LIGHTENS the panel, so
  // the flat token is not the worst case for the text on it — this is. See the
  // --brand-panel-lit comment in index.css; recompute it if the glow's alpha
  // ever changes.
  ['brand-panel-fg', 'brand-panel-lit', 'text', 'Login panel text over the glow'], ['brand-panel-muted', 'brand-panel-lit', 'text', 'Login panel muted lines over the glow'],
  ['seal-bg', 'brand-panel', 'boundary', 'seal disc vs the Login panel'],
  ['bubble-mine', 'surface', 'boundary', 'own bubble vs card'], ['bubble-theirs', 'surface', 'boundary', 'their bubble vs card'], ['edge', 'surface', 'boundary', 'card border'], ['surface', 'page', 'boundary', 'card vs page'], ['surface-subtle', 'surface', 'boundary', 'band vs card'], ['surface-muted', 'surface-subtle', 'boundary', 'active nav vs hovered'],
];
const NEED = { text: 4.5, ui: 3, disabled: 0, boundary: 0 };

// Waived pairs — each marker MUST appear in docs/KNOWN_ISSUES.md.
const ALLOW = {
  'light fg-muted/surface-muted': '[contrast: light fg-muted/surface-muted]',
  'light fg-faint/surface': '[contrast: light fg-faint/surface]',
  'light fg-ghost/surface': '[contrast: light fg-ghost/surface]',
  'light danger-text/danger-soft': '[contrast: light danger-text/danger-soft]',
  'light warning-icon/surface': '[contrast: light warning-icon/surface]',
  'light bubble-theirs-meta/bubble-theirs': '[contrast: light bubble-theirs-meta/bubble-theirs]',
  'light focus-accent/surface': '[contrast: light focus-accent/surface]',
  'light edge-strong/surface': '[contrast: light edge-strong/surface]',
  'dark edge-strong/surface': '[contrast: dark edge-strong/surface]',
};

const known = fs.existsSync(KNOWN_ISSUES) ? fs.readFileSync(KNOWN_ISSUES, 'utf8') : '';
let failures = 0;
const unrecorded = Object.entries(ALLOW).filter(([, marker]) => !known.includes(marker)).map(([k]) => k);
for (const [name, theme] of [['light', LIGHT], ['dark', DARK]]) {
  console.log(`\n${name.toUpperCase()}`);
  for (const [fg, bg, kind, where] of PAIRS) {
    const c = contrast(theme, fg, bg);
    const ok = c >= NEED[kind];
    const key = `${name} ${fg}/${bg}`;
    const waived = !ok && key in ALLOW;
    if (!ok && !waived) failures++;
    const tag = ok ? 'ok      ' : waived ? 'waived  ' : 'FAIL    ';
    console.log(`  ${c.toFixed(2).padStart(5)} ${tag}${kind.padEnd(9)}${fg.padEnd(19)} on ${bg.padEnd(19)} ${where}`);
  }
}
if (unrecorded.length) { console.error(`\nALLOW entries with no docs/KNOWN_ISSUES.md marker: ${unrecorded.join(', ')}`); failures += unrecorded.length; }
console.log(`\ncheck-contrast: ${failures} unwaived failure${failures === 1 ? '' : 's'} (${PAIRS.length} pairs × 2 themes, ${Object.keys(ALLOW).length} waived and recorded)`);
process.exit(failures ? 1 : 0);
