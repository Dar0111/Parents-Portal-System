// SSR proof: Admin → Assignments & advisers (Module 11; FRONTEND §37).
// Every check passes only if its negative control FAILS.
//
// Run from client/:
//   npx vite build --ssr scripts/ssr-assignments.jsx --outDir .ssr-tmp
//   node .ssr-tmp/ssr-assignments.js
//
// DRIVEN (pure): pages/admin/assignments.js — the cross product of the Add
// form, what is skipped as held, the sequential run, the two 409s told apart,
// the result line, "Also taught by", "Also advises", the waiting-letter count
// and every warning sentence, the remove sentence.
// RENDERED: the page on its first render — both sections, the teacher select,
// Add disabled before a teacher is chosen, one <h2> each and no <h1>.
// SOURCE: the page — every request is an existing endpoint, the unwrap keys,
// no bulk endpoint, the double-submit ref, Save held until the count is read;
// the nav — the item, its group, the route, WEB_ONLY, both mirrors; the words
// — no screen still says "the Sections page".
// CANNOT PROVE: a real add, a real removal, a warning on screen, 390px — the
// suites and the owner's check.

import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AdminAssignmentsPage from '../src/pages/admin/AssignmentsPage.jsx';
import {
  addButtonLabel,
  adviserWarning,
  alsoAdvisesSentence,
  alsoTaughtBy,
  assignmentsOf,
  classLabel,
  isDuplicateRefusal,
  pendingLettersIn,
  removeSentence,
  resultLine,
  resultText,
  runPairs,
  splitPairs,
  teacherLabel,
} from '../src/pages/admin/assignments.js';

const CLIENT = process.cwd();
const read = (rel) => fs.readFileSync(path.resolve(CLIENT, rel), 'utf8').replace(/\r\n/g, '\n');
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let passed = 0;
let failed = 0;
function check(label, ok, control) {
  // `control` is the same test on a broken input; it must come back false.
  const good = Boolean(ok);
  const refused = control === undefined ? true : !control;
  if (good && refused) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}${good ? ' (its control passed too)' : ''}`);
  }
}

// ---- driven ---------------------------------------------------------------
console.log('-- driven: pages/admin/assignments.js --');
const ROWS = [
  { id: 1, teacher_id: 2, teacher_name: 'Teacher A', subject_id: 10, subject_name: 'Mathematics', grade_level: 6, section: 'Malikhain' },
  { id: 2, teacher_id: 2, teacher_name: 'Teacher A', subject_id: 11, subject_name: 'English', grade_level: 6, section: 'Malikhain' },
  { id: 3, teacher_id: 3, teacher_name: 'Teacher S', subject_id: 10, subject_name: 'Mathematics', grade_level: 6, section: 'MALIKHAIN' },
];
const SUBJECTS = [
  { id: 10, name: 'Mathematics', grade_level: 6 },
  { id: 12, name: 'Science', grade_level: 6 },
];

check("assignmentsOf keeps one teacher's rows, in order", same(assignmentsOf(ROWS, '2').map((r) => r.id), [1, 2]), same(assignmentsOf(ROWS, 3).map((r) => r.id), [1, 2]));
check('classLabel', classLabel(6, 'Malikhain') === 'Grade 6 - Malikhain');
check('teacherLabel marks an inactive account', teacherLabel({ name: 'A', status: 'inactive' }) === 'A (inactive)' && teacherLabel({ name: 'A', status: 'active' }) === 'A', teacherLabel({ name: 'A', status: 'active' }) === 'A (inactive)');

check('Also taught by names the other teacher, not this one', same(alsoTaughtBy(ROWS, ROWS[0]), ['Teacher S']), same(alsoTaughtBy(ROWS, ROWS[0]), ['Teacher A', 'Teacher S']));
check('… matching a section in any case, as the database does', same(alsoTaughtBy(ROWS, ROWS[2]), ['Teacher A']));
check('… and nobody on a subject held alone', alsoTaughtBy(ROWS, ROWS[1]).length === 0);

const one = splitPairs({ rows: ROWS, teacherId: 3, subjects: [SUBJECTS[1]], sections: ['Malikhain'] });
check('one subject, one section: one pair', one.toAdd.length === 1 && one.alreadyHeld.length === 0 && one.toAdd[0].subject_id === 12);
const across = splitPairs({ rows: ROWS, teacherId: 9, subjects: [SUBJECTS[0]], sections: ['Malikhain', 'Masigasig', 'Mabait'] });
check('one subject across three sections: three pairs', across.toAdd.length === 3);
const every = splitPairs({ rows: ROWS, teacherId: 9, subjects: SUBJECTS, sections: ['Malikhain'] });
check('every subject of a class: one pair per subject', every.toAdd.length === 2);
const both = splitPairs({ rows: ROWS, teacherId: 9, subjects: SUBJECTS, sections: ['Malikhain', 'Masigasig'] });
check('several subjects across sections: the cross product', both.toAdd.length === 4);
const held = splitPairs({ rows: ROWS, teacherId: 2, subjects: SUBJECTS, sections: ['Malikhain'] });
check('a pair the teacher holds is skipped, the rest stay', held.toAdd.length === 1 && held.toAdd[0].subject_id === 12 && held.alreadyHeld[0].subject_id === 10);
check("… and another teacher's row is not held by this one", splitPairs({ rows: ROWS, teacherId: 9, subjects: [SUBJECTS[0]], sections: ['Malikhain'] }).alreadyHeld.length === 0);
check('… in any case', splitPairs({ rows: ROWS, teacherId: 3, subjects: [SUBJECTS[0]], sections: ['Malikhain'] }).alreadyHeld.length === 1);

const DUP = 'This teacher is already assigned to that subject in that section.';
const YEAR = 'academic_year is not configured. An admin must set it before assignments can be created.';
check('the duplicate 409 is "already assigned"', isDuplicateRefusal(409, DUP), isDuplicateRefusal(409, YEAR));
check('another status is not', !isDuplicateRefusal(400, DUP));

const refusal = (status, message) => Object.assign(new Error(message), { response: { status, data: { message } } });
const PAIRS = [
  { subject_id: 1, subject_name: 'A', grade_level: 6, section: 'X' },
  { subject_id: 2, subject_name: 'B', grade_level: 6, section: 'X' },
  { subject_id: 3, subject_name: 'C', grade_level: 6, section: 'X' },
];
const messageOf = (err) => err.message;
let inFlight = 0;
let widest = 0;
const seen = [];
const outcome = await runPairs(
  PAIRS,
  async (pair) => {
    inFlight += 1;
    widest = Math.max(widest, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    seen.push(pair.subject_id);
    inFlight -= 1;
    if (pair.subject_id === 2) throw refusal(409, DUP);
    if (pair.subject_id === 3) throw refusal(409, YEAR);
  },
  messageOf
);
check('the run is one request at a time, in order', widest === 1 && same(seen, [1, 2, 3]));
check('every pair is tried: a refusal does not stop the run', outcome.added === 1 && outcome.already === 1 && outcome.failures.length === 1);
check('the academic-year 409 is a failure, never "already assigned"', outcome.failures[0]?.message === YEAR, outcome.already === 2);
check('the result line', resultLine(outcome) === 'Added 1. Already assigned: 1. Failed: 1.');
check('a failure carries the API\'s own words and names the pair', resultText(outcome) === `Added 1. Already assigned: 1. Failed: 1. C, Grade 6 - X: ${YEAR}`);
check('a clean run is the line alone', resultText({ added: 2, already: 0, failures: [] }) === 'Added 2. Already assigned: 0. Failed: 0.');

check('the Add button counts', addButtonLabel(0) === 'Add assignments' && addButtonLabel(1) === 'Add 1 assignment' && addButtonLabel(8) === 'Add 8 assignments');

check(
  'the remove sentence names the decision and keeps the grades',
  removeSentence(ROWS[0]) === 'Teacher A will no longer be able to record Mathematics grades for Grade 6 - Malikhain. Grades already recorded are kept.',
  removeSentence(ROWS[2]).startsWith('Teacher A')
);

const SECTIONS = [
  { id: 1, name: 'Masigasig', grade_level: 5, adviser_id: 3 },
  { id: 2, name: 'Malikhain', grade_level: 6, adviser_id: 2 },
  { id: 3, name: 'Mabait', grade_level: 1, adviser_id: null },
];
check('Also advises names the other section', alsoAdvisesSentence(SECTIONS, 3, 3) === 'Also advises Grade 5 - Masigasig.');
check('… never the section being changed', alsoAdvisesSentence(SECTIONS, 3, 1) === null, alsoAdvisesSentence(SECTIONS, 3, 3) === null);
check('… and nothing for a teacher who advises nothing', alsoAdvisesSentence(SECTIONS, 9, 3) === null);

const LETTERS = [
  { grade_level: 6, section: 'Malikhain' },
  { grade_level: 6, section: 'malikhain' },
  { grade_level: 5, section: 'Malikhain' },
];
check('pending letters count one class, grade included', pendingLettersIn(LETTERS, SECTIONS[1]) === 2, pendingLettersIn(LETTERS, SECTIONS[1]) === 3);

check('no waiting letter, no warning', adviserWarning(0, null) === null && adviserWarning(0, 'Teacher S') === null);
check('clearing, one letter', adviserWarning(1, null) === '1 excuse letter from this class is waiting for review. Nobody can review it until this class has an adviser.');
check('clearing, many letters', adviserWarning(3, null) === '3 excuse letters from this class are waiting for review. Nobody can review them until this class has an adviser.');
check('replacing, one letter', adviserWarning(1, 'Teacher S') === "1 excuse letter from this class is waiting for review. It will be in Teacher S's Excuse Letters list, but Teacher S will not be notified.");
check('replacing, many letters', adviserWarning(2, 'Teacher S') === "2 excuse letters from this class are waiting for review. They will be in Teacher S's Excuse Letters list, but Teacher S will not be notified.");

// ---- rendered -------------------------------------------------------------
console.log('-- rendered: the page on its first render --');
const html = renderToStaticMarkup(
  <MemoryRouter initialEntries={['/admin/assignments']}>
    <AdminAssignmentsPage />
  </MemoryRouter>
);
check('both sections render, each an <h2>, with no <h1>', /<h2[^>]*>Teaching assignments<\/h2>/.test(html) && /<h2[^>]*>Section advisers<\/h2>/.test(html) && !/<h1/.test(html));
check('the teacher select starts on Choose a teacher', />Choose a teacher<\/option>/.test(html));
const addBtn = /<button[^>]*>(?:(?!<\/button>).)*Add assignment<\/button>/s.exec(html)?.[0] || '';
check('Add assignment is disabled until a teacher is chosen', /disabled=""/.test(addBtn), /disabled=""/.test(addBtn.replace('disabled=""', '')));
check('the grade filter offers every grade', [1, 2, 3, 4, 5, 6].every((g) => html.includes(`>Grade ${g}</option>`)));
check('no dialog is open on arrival', !/role="dialog"/.test(html));
const LEAK = /login_id|lrn/i;
check('no login id or LRN in the markup', !LEAK.test(html), !LEAK.test(`${html}<td>login_id</td>`));

// ---- source ---------------------------------------------------------------
console.log('-- source: the page, the nav, the words --');
const page = noComments(read('src/pages/admin/AssignmentsPage.jsx'));
const helper = noComments(read('src/pages/admin/assignments.js'));

const KNOWN = ['/assignments', '/users', '/subjects', '/settings', '/sections', '/excuse-letters'];
const called = (src) => [...src.matchAll(/(?:api\.(?:get|post|patch|delete)|fetchAll)\(\s*[`']([^`']+)[`']/g)].map((m) => m[1]);
const allKnown = (src) => called(src).every((p) => KNOWN.some((k) => p === k || p.startsWith(`${k}/`)));
check('every request is an existing endpoint', called(page).length >= 8 && allKnown(page), allKnown(`${page}\napi.post('/bulk-assign', {}, { unwrap: 'x' })`));
check('the two writes and the delete, with their keys', /api\.post\('\/assignments', \{ teacher_id: teacher\.id, subject_id, section \}, \{ unwrap: 'assignment' \}\)/.test(page) && /api\.delete\(`\/assignments\/\$\{removing\.id\}`, \{ unwrap: 'message' \}\)/.test(page) && /api\.patch\(\s*`\/sections\/\$\{advising\.id\}\/adviser`[\s\S]*?\{ unwrap: 'section' \}/.test(page));
check('clearing sends null, never an empty string', /adviser_id: adviserChoice === '' \? null : Number\(adviserChoice\)/.test(page));
check('sections are this school year\'s', /params: \{ school_year: settings\.academic_year \}/.test(page));
check('the picker keeps inactive teachers: no status filter on /users', /params: \{ role: 'teacher', sort: 'name' \}/.test(page), /status: 'active' \}/.test(page.split('readTeachers')[1].split('readSubjects')[0]));
const adviserOptions = /activeTeachers\.map\(\(row\) =>/.test(page);
check('only an active teacher can be chosen as adviser', adviserOptions && /teachers\.rows\.filter\(\(row\) => row\.status === 'active'\)/.test(page));
check('Add waits for an active teacher', /disabled=\{teacher\?\.status !== 'active'\}/.test(page), /disabled=\{!teacher\}/.test(page));
const guarded = (src) => /if \(addingRef\.current \|\| !pairs\.toAdd\.length\) return;\s*addingRef\.current = true;/.test(src);
check('one run at a time is a ref', guarded(page), guarded(page.replace('addingRef.current = true;', '')));
const held2 = (src) => /disabled=\{!adviserChanged \|\| pending === null\}/.test(src);
check('Save waits for the letter count, and for a change', held2(page), held2(page.replace('disabled={!adviserChanged || pending === null}', 'disabled={!adviserChanged}')));
const rereads = /await assignments\.reload\(\);/.test(page) && /await sections\.reload\(\);/.test(page);
check('every write re-reads its list (§5b)', rereads);
check('no write path to attendance, grades or activity logs', !/\/attendance|\/grades|activity/.test(page + helper));
check('no local copy of the helpers', !/function (splitPairs|runPairs|adviserWarning)/.test(page));

const nav = read('src/layout/nav.js');
const attendance = nav.indexOf("to: '/admin/attendance'");
const item = nav.indexOf("{ to: '/admin/assignments', label: 'Assignments', icon: 'fa-chalkboard-user', built: true }");
const announcements = nav.indexOf("to: '/admin/announcements'");
check('the nav item sits after Attendance', attendance !== -1 && item > attendance && announcements > item);
check("in the admin's Manage group", /label: 'Manage', paths: \['\/users', '\/students', '\/grades', '\/attendance', '\/assignments'\]/.test(read('src/layout/navGroups.js')));
check('the route is registered', /<Route path="assignments" element=\{<AdminAssignments \/>\} \/>/.test(read('src/App.jsx')));
const routes = read('../mobile/src/navigation/routes.js');
check('the phone hides it (WEB_ONLY)', /WEB_ONLY = Object\.freeze\(\[[^\]]*'\/admin\/assignments'[^\]]*\]\)/.test(routes));
check('no phone route opens it', !/'\/admin\/assignments':/.test(routes));
check('both nav mirrors equal their phone copies', read('src/layout/nav.js') === read('../mobile/src/navigation/nav.js') && read('src/layout/navGroups.js') === read('../mobile/src/navigation/navGroups.js'));

const WORDS = [
  ['src/pages/admin/AttendancePage.jsx', "so none has been recorded here. Set one under Assignments."],
  ['../mobile/src/screens/admin/AttendanceScreen.jsx', 'so none has been recorded here. Set one on the web under Assignments.'],
  ['src/pages/teacher/AttendancePage.jsx', "Ask an admin to set you as a section's adviser under Assignments on the web."],
  ['../mobile/src/screens/teacher/AttendanceScreen.jsx', "Ask an admin to set you as a section's adviser under Assignments on the web."],
];
for (const [file, sentence] of WORDS) {
  const text = read(file);
  check(`${file} says where to go`, text.includes(sentence), `${text}`.replace(sentence, '').includes(sentence));
  check(`${file} names no Sections page`, !/Sections page/.test(text));
}

console.log(`\n${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
process.exitCode = failed ? 1 : 0;
