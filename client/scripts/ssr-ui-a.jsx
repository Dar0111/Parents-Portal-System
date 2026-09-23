// UI-A render proof. KEPT, like DV1b-a's and DV1b-b's.
//
// RUN FROM `client/`: `npx vite build --ssr scripts/ssr-ui-a.jsx --outDir
// .ssr-tmp && node .ssr-tmp/ssr-ui-a.js`. It lives in `scripts/` because
// `.oxlintrc.json` gives `env.node` only here (§17a).
//
// EVERY ASSERTION BELOW RENDERS A REAL COMPONENT OR CALLS A REAL FUNCTION.
// There is not one readFileSync and not one regex over source, and that is
// the point: DV1b-a proved 87 things about the TEXT of fourteen files, and
// the one defect it should have caught — a prop that is written and never
// rendered — walked straight past it (§17d). A source-text assertion proves
// authorship. This file proves output.
//
// What that cost is stated honestly: three things had to be EXTRACTED to be
// renderable at all — `rosterColumns`, `AbsenceLine`, `EventLine` — and two
// of them then had to move into modules of their own, because a function
// exported beside components trips `react(only-export-components)` and moved
// the oxlint baseline 43 → 45 in this dispatch's first commit. That is §17b's
// rule learned twice in one branch, and the extraction is the improvement,
// not a workaround for the test.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import DataTable from '../src/components/DataTable.jsx';
import GradeValue from '../src/format/grade.jsx';
import { SCORE_PENDING, formatScorePair } from '../src/format/scorePair.js';
import { ScorePair } from '../src/pages/parent/GradesPage.jsx';
import { rosterColumns } from '../src/pages/teacher/attendance/columns.jsx';
import { AbsenceLine } from '../src/pages/dashboards/ParentDashboard.jsx';
import { EventLine } from '../src/pages/dashboards/TeacherDashboard.jsx';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS — ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL — ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}
const render = (node) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

console.log('UI-A — the renderers:\n');

// ---------------------------------------------------------------- item 7
// GradeValue's colour is a DEFAULT, not a hardcode.
console.log('item 7 — GradeValue colour:');

const plain = render(<GradeValue value="88.05" mode="numerical" />);
assert(/text-fg\b/.test(plain), 'with no className, the value keeps text-fg — nothing regressed');
assert(plain.includes('88.05'), 'and still renders the value');

const onNavy = render(<GradeValue value="88.05" mode="numerical" className="text-primary-fg" />);
assert(onNavy.includes('text-primary-fg'), "a caller's colour is applied");
assert(
  !/text-fg[\s"]/.test(onNavy),
  'and text-fg is NOT ALSO EMITTED — no two-class race, so stylesheet order cannot decide it',
  onNavy
);

// NEGATIVE CONTROL: the old behaviour would have put both on the element.
assert(
  render(<GradeValue value="1" mode="numerical" className="text-primary-fg" />).match(/text-/g)
    .length === 1,
  'NEGATIVE CONTROL: exactly ONE text- utility on the element, never two'
);

// The null branch is unchanged and still muted.
const pending = render(<GradeValue value={null} mode="numerical" />);
assert(pending.includes('text-fg-muted'), 'the null branch still carries text-fg-muted');
assert(pending.includes('Pending'), 'and still says Pending, not a bare dash');
assert(
  render(<GradeValue value={null} mode="descriptive" />).includes('N/A'),
  'descriptive null still says N/A'
);

// The whole-number path is untouched by the colour change.
assert(render(<GradeValue value="87.00" whole mode="numerical" />).includes('>87<'), '"87.00" → 87');
assert(
  render(<GradeValue value={89.5} whole mode="numerical" />).includes('>89.5<'),
  '89.5 → 89.5, NEVER rounded to 90'
);

// ---------------------------------------------------------------- item 6
console.log('\nitem 6 — raw score pairs:');

assert(formatScorePair('46.00', '50.00') === '46/50', 'whole scores lose their dead decimals');
assert(formatScorePair(46, 50) === '46/50', 'numbers and strings agree');
assert(formatScorePair('42.50', '50.00') === '42.5/50', 'a LEGACY 42.5 keeps its half — never rounded');
assert(formatScorePair(null, '50.00') === SCORE_PENDING, 'used slot, no score → pending');
assert(formatScorePair('46.00', null) === null, 'no highest possible score → nothing to print');
assert(formatScorePair(null, null) === null, 'both null → nothing');

const whole = render(<ScorePair score="46.00" max="50.00" />);
assert(whole.includes('46/50'), 'the rendered pair reads 46/50');
assert(!whole.includes('46.00'), 'and "46.00" is nowhere in the markup', whole);
assert(!whole.includes('.00'), 'no two-decimal spelling survives anywhere in it');

assert(render(<ScorePair score="42.50" max="50.00" />).includes('42.5/50'), 'legacy 42.5 renders');
assert(render(<ScorePair score={null} max="50.00" />).includes('Pending'), 'score-null renders Pending');
assert(
  !render(<ScorePair score={null} max="50.00" />).includes('0/50'),
  'and a missing score NEVER renders as a zero'
);
assert(
  render(<ScorePair score={null} max={null} />).includes('Not yet recorded'),
  'the both-null branch is unchanged'
);
assert(render(<ScorePair score="46.00" max={null} />) === '', 'an unused slot renders NOTHING at all');

// ---------------------------------------------------------------- item 8
console.log('\nitem 8 — dates that are read, not stored:');

const hero = render(<AbsenceLine date="2026-09-21" className="text-xs text-primary-fg" />);
assert(hero.includes('21 September 2026'), 'the absence line reads as words');
assert(!hero.includes('2026-09-21'), 'and the ISO string is GONE from the markup', hero);
assert(hero.includes('text-primary-fg'), 'the hero variant keeps its colour');
assert(
  render(<AbsenceLine date="2026-09-21" className="text-sm text-fg-muted" />).includes('21 September 2026'),
  'the card variant is the SAME renderer — one fact, one implementation'
);

const event = render(<EventLine title="Recognition Day" date="2026-09-25" />);
assert(event.includes('25 September 2026'), 'the teacher event line reads as words');
assert(!event.includes('2026-09-25'), 'and its ISO string is gone too', event);
assert(/whitespace-nowrap/.test(event), 'the date cannot break across lines');

// NEGATIVE CONTROL: a malformed date is passed through, never invented.
assert(render(<EventLine title="x" date="not-a-date" />).includes('not-a-date'),
  'NEGATIVE CONTROL: longDate passes an unparseable value through rather than guessing');

// ---------------------------------------------------------------- item 13
console.log('\nitem 13 — the Attendance header:');

const roster = [
  { id: 1, first_name: 'Marwin', last_name: 'Conde', lrn: '136893000001' },
  { id: 2, first_name: 'Ana', last_name: 'Reyes', lrn: '136893000002' },
];
const recorded = new Map([[1, 'Present']]);
const marks = { 1: 'Present', 2: 'Late' };
const table = render(
  <DataTable
    columns={rosterColumns({ recorded, marks, onPick: () => {} })}
    rows={roster}
    keyField="id"
  />
);

assert(table.includes('Saved as'), 'the stored-status column header reads "Saved as"');
assert(!/>Recorded</.test(table.split('<tbody')[0]), 'no column HEADER says "Recorded"', 'a header still does');
assert(table.includes('>Recorded<'), 'and "Recorded" survives as a ROW VALUE — §5b, both columns stay');
assert(table.includes('Changed'), 'the Row column still tells the draft from the database');
assert(table.includes('>Row<') && table.includes('>Status<'), 'Row and Status columns are untouched');

// NEGATIVE CONTROL: the collision this fixed would be two identical strings,
// one in the header row and one in the body. Prove they are now different.
const head = table.split('<tbody')[0];
const body = table.split('<tbody')[1] || '';
assert(
  head.includes('Saved as') && !head.includes('>Recorded<') && body.includes('>Recorded<'),
  'NEGATIVE CONTROL: the header word and the row word are no longer the same word'
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
