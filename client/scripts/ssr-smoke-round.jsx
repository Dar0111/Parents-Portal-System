// PROOF — the smoke-gate fix round on the web (fix/smoke-round, 2026-10-13;
// the owner's findings F4–F7). Run from client/:
//   npx vite build --ssr scripts/ssr-smoke-round.jsx --outDir .ssr-tmp && node .ssr-tmp/ssr-smoke-round.js
//
// What it proves, each check with a NEGATIVE CONTROL that must fail:
//   - F4, as SOURCE (the class record needs a live API to render): no
//     "ST Total" column, the Summative group spans its fields + 2, neither the
//     header row nor a learner's row prints a Summative raw total, ST PS
//     carries the 30/30/40 title, and the note under the grid is the approved
//     copy — the DO 015 citation for Grades 2–6 only;
//   - F5, DRIVEN and RENDERED: format/componentLabel.js on every row shape,
//     and the parent's breakdown rendered from GET /api/grades/:id's shape —
//     "WW1", "PT1 · Group project", a legacy row's own label, and the
//     Examinations rows unchanged;
//   - F6, RENDERED: Login shows the reset's sentence (role="status") when the
//     router's state carries it and nothing without it; ForgotPassword sends
//     the server's message in that state, never in the URL; and the history
//     entry is replaced so a reload shows nothing;
//   - F7, as SOURCE: a successful lock or unlock closes the dialog with
//     setSelected(null) — never closeCell, which clears the line — and sets
//     the line above the report card.
// Cannot prove a real save, a real reset, a real lock or the dialog closing
// on screen — the owner's device check.

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import { componentLabel } from '../src/format/componentLabel.js';
import { BreakdownBody } from '../src/pages/parent/GradesPage.jsx';
import Login from '../src/pages/Login.jsx';
import { AuthProvider } from '../src/auth/AuthContext.jsx';

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
// A check that holds on the real input and FAILS on every control.
function proved(label, check, good, ...controls) {
  const ok = check(good);
  const bad = controls.filter((c) => check(c));
  assert(ok && bad.length === 0, label, ok ? `${bad.length} control(s) passed too` : 'the real input failed');
}

const read = (rel) => fs.readFileSync(path.resolve(rel), 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------- F4
console.log('F4 — the class record\'s Summative block has no raw total');
const record = read('src/pages/teacher/ClassRecordPage.jsx');
const NOTE_NUMERICAL =
  'ST PS = ST1 30% + ST2 30% + TE 40%, each part out of its own highest possible score (DO 015 s. 2026) — not the three scores added together.';
const NOTE_DESCRIPTIVE =
  'ST PS = ST1 30% + ST2 30% + TE 40%, each part out of its own highest possible score — not the three scores added together.';

proved(
  'no "ST Total" column header',
  (s) => !/>\s*ST Total\s*</.test(s) && /title="ST1 30% \+ ST2 30% \+ TE 40%">\s*ST PS\s*<\/th>/.test(s),
  record,
  record.replace('<th scope="col" className={totalTh} title=', '<th scope="col" className={totalTh}>ST Total</th>\n<th scope="col" className={totalTh} title='),
  record.replace('title="ST1 30% + ST2 30% + TE 40%"', '')
);
proved(
  'the Summative group header spans its three fields + 2 (ST PS, ST WS)',
  (s) => s.includes('colSpan={EXAM_FIELDS.length + 2}') && !s.includes('colSpan={EXAM_FIELDS.length + 3}'),
  record,
  record.replace('colSpan={EXAM_FIELDS.length + 2}', 'colSpan={EXAM_FIELDS.length + 3}')
);
proved(
  'neither the Highest possible row nor a learner\'s row prints a Summative total (two guards)',
  (s) => (s.match(/\{group === 'ex' \? null : \(/g) || []).length === 2,
  record,
  record.replace("{group === 'ex' ? null : (", '{(')
);
proved(
  'the note under the grid: the approved copy, cited for Grades 2–6, uncited for Grade 1',
  (s) => s.includes(`? '${NOTE_DESCRIPTIVE}'`) && s.includes(`: '${NOTE_NUMERICAL}'`),
  record,
  record.replace(NOTE_NUMERICAL, NOTE_NUMERICAL.replace(' (DO 015 s. 2026)', '')),
  record.replace(`? '${NOTE_DESCRIPTIVE}'`, `? '${NOTE_NUMERICAL}'`),
  record.replace('not the three scores added together.', 'the three scores added up.')
);
proved(
  'the note sits after the grid\'s ScrollCue and before the empty-class card',
  (s) => {
    const cue = s.indexOf('</ScrollCue>');
    const note = s.indexOf(NOTE_NUMERICAL);
    const empty = s.indexOf('{server.learners.length === 0 ? (', cue);
    return cue > 0 && note > cue && empty > note;
  },
  record,
  // The note moved above the grid instead.
  record.replace(`: '${NOTE_NUMERICAL}'`, ": ''").replace('<ScrollCue', `{'${NOTE_NUMERICAL}'}<ScrollCue`)
);

// ---------------------------------------------------------------- F5
console.log('F5 — a breakdown row is named the way the class record names it');
const ww1 = { slot_id: 11, slot_type: 'WW', slot_no: 1, slot_name: null, label: null, display_label: 'Written Work 1' };
assert(componentLabel(ww1) === 'WW1', 'an unnamed grid column is its code: WW1');
assert(componentLabel({ ...ww1, slot_type: 'PT', slot_no: 2, display_label: 'Performance Task 2' }) === 'PT2', 'PT2');
assert(
  componentLabel({ ...ww1, slot_name: '  Long quiz ', display_label: 'Long quiz' }) === 'WW1 · Long quiz',
  'a named column: the code, then the trimmed name'
);
assert(componentLabel({ ...ww1, slot_name: '   ' }) === 'WW1', 'a blank name is no name');
assert(
  componentLabel({ slot_id: null, slot_type: null, slot_no: null, slot_name: null, label: 'Quiz 3', display_label: 'Quiz 3' }) === 'Quiz 3',
  'a legacy row (no slot) keeps the label it was written with'
);
assert(
  componentLabel({ slot_id: null, label: null, display_label: 'Written Work' }) === 'Written Work',
  "a legacy row with no label falls back to the server's display_label"
);
assert(componentLabel(null) === '' && componentLabel({}) === '', 'nothing → an empty string, never "undefined"');
assert(
  componentLabel({ ...ww1, label: 'stale' }) === 'WW1',
  "a grid row's code wins over any stored label"
);

// GET /api/grades/:id — { grade, grade_components, descriptor }, mysql2's
// DECIMAL strings as the server sends them.
const detail = {
  grade: {
    term_grade: '88.00',
    ex_st1: '8.00',
    ex_st1_max: '10.00',
    ex_st2: '9.00',
    ex_st2_max: '10.00',
    ex_te: '18.00',
    ex_te_max: '20.00',
  },
  grade_components: [
    { id: 1, type: 'WW', slot_id: 11, slot_type: 'WW', slot_no: 1, slot_name: null, label: null, display_label: 'Written Work 1', score: '8.00', max_score: '10.00', date_recorded: null },
    { id: 2, type: 'WW', slot_id: null, slot_type: null, slot_no: null, slot_name: null, label: 'Quiz 3', display_label: 'Quiz 3', score: '7.00', max_score: '10.00', date_recorded: null },
    { id: 3, type: 'PT', slot_id: 12, slot_type: 'PT', slot_no: 1, slot_name: 'Group project', label: null, display_label: 'Group project', score: '9.00', max_score: '10.00', date_recorded: null },
  ],
  descriptor: { descriptor: 'Very Satisfactory' },
};
const breakdown = renderToStaticMarkup(<BreakdownBody mode="numerical" detail={detail} />);
proved(
  'the breakdown RENDERS "WW1", "PT1 · Group project" and the legacy "Quiz 3" beside their scores',
  (h) => h.includes('>WW1<') && h.includes('>PT1 · Group project<') && h.includes('>Quiz 3<') && h.includes('8/10') && h.includes('9/10'),
  breakdown,
  // What the parent saw before: the name cell empty.
  breakdown.replace('>WW1<', '><'),
  breakdown.replace('>PT1 · Group project<', '><')
);
proved(
  'the Examinations rows are unchanged: ST1, ST2, TE',
  (h) => h.includes('>ST1<') && h.includes('>ST2<') && h.includes('>TE<') && h.includes('18/20'),
  breakdown,
  breakdown.replace('>ST2<', '><')
);
const parentGrades = read('src/pages/parent/GradesPage.jsx');
proved(
  'the breakdown reads componentLabel(row), never the bare row.label',
  (s) => s.includes('{componentLabel(row)}') && !s.includes('{row.label}'),
  parentGrades,
  parentGrades.replace('{componentLabel(row)}', '{row.label}')
);

// ---------------------------------------------------------------- F6
console.log('F6 — the sign-in page confirms a password reset');
const SENTENCE = 'Password updated. You can sign in now.';
const loginAt = (entry) =>
  renderToStaticMarkup(
    <AuthProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
const withNotice = loginAt({ pathname: '/login', state: { notice: SENTENCE } });
const plain = loginAt({ pathname: '/login' });
proved(
  "with the reset's state: the sentence renders in a role=\"status\" box, inside the sign-in card",
  (h) => /role="status"[^>]*>[\s\S]*?Password updated\. You can sign in now\./.test(h) && h.indexOf(SENTENCE) > h.indexOf('Sign in to continue.'),
  withNotice,
  plain
);
assert(!plain.includes('role="status"') && !plain.includes(SENTENCE), 'without it: no status box, no sentence');
assert(
  !loginAt({ pathname: '/login', state: { notice: 42 } }).includes('role="status"'),
  'a non-string notice in the state is ignored'
);
const login = read('src/pages/Login.jsx');
proved(
  'the history entry is replaced without the notice, so a reload or Back shows nothing',
  (s) => /if \(location\.state\?\.notice\) navigate\(location\.pathname, \{ replace: true, state: null \}\);/.test(s),
  login,
  login.replace('state: null', 'state: location.state')
);
proved(
  'a sign-in attempt clears the notice (never beside a refusal)',
  (s) => /setError\(''\);\s*setNotice\(''\);\s*setSubmitting\(true\);/.test(s),
  login,
  login.replace("setNotice('');\n", '')
);
const forgot = read('src/pages/ForgotPassword.jsx');
proved(
  "ForgotPassword sends the server's own message in the router's state — not in the URL",
  (s) =>
    /const message = await api\.post\(\s*'\/auth\/reset-password'/.test(s) &&
    s.includes("navigate('/login', { replace: true, state: { notice: message } });") &&
    !/navigate\(`\/login\?/.test(s),
  forgot,
  forgot.replace("navigate('/login', { replace: true, state: { notice: message } });", "navigate('/login', { replace: true });"),
  forgot.replace("navigate('/login', { replace: true, state: { notice: message } });", 'navigate(`/login?notice=${message}`, { replace: true });')
);

// ---------------------------------------------------------------- F7
console.log('F7 — Admin → Grades: lock and unlock close the dialog the same way and keep the line');
const admin = read('src/pages/admin/GradesPage.jsx');
const toggleOf = (s) => s.slice(s.indexOf('async function toggleLock()'), s.indexOf('function termColumn('));
proved(
  'on success: setSelected(null), then the line above the report card — both directions',
  (s) => {
    const body = toggleOf(s);
    return (
      /const line = `\$\{selected\.subjectName\}, Term \$\{selected\.term\} \$\{next \? 'locked' : 'unlocked'\}\.`;\s*setSelected\(null\);\s*setStatus\(\{ card: ok\(line\) \}\);\s*await loadReport\(\);/.test(body) &&
      !body.includes('closeCell(')
    );
  },
  admin,
  admin.replace('      setSelected(null);\n      setStatus({ card: ok(line) });', '      setStatus({ card: ok(line) });'),
  admin.replace('      setSelected(null);\n      setStatus({ card: ok(line) });', '      closeCell();\n      setStatus({ card: ok(line) });')
);
proved(
  'the line renders on the page (status.card), outside the dialog; a failure stays inside it (status.lock)',
  (s) => s.includes('<FormStatus status={status.card} />') && s.includes('<FormStatus status={status.lock} className="mb-4" />') && /catch \(err\) \{\s*setStatus\(\{ lock: fail\(extractError\(err\)\) \}\);/.test(toggleOf(s)),
  admin,
  admin.replace('<FormStatus status={status.card} />', '')
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
