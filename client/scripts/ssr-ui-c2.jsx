// UI-C2 render proof.
//
// RUN FROM `client/`: `npx vite build --ssr scripts/ssr-ui-c2.jsx --outDir
// .ssr-tmp && node .ssr-tmp/ssr-ui-c2.js`. No NODE_ENV needed — nothing here
// is behind `import.meta.env.DEV` (§17f is `ssr-cards.jsx`'s problem).
//
// No readFileSync, no regex over source. The audience label goes through the
// REAL card modules and the real `DataTable`, and the report card is rendered
// twice with different data rather than inspected.
//
// H (the Remarks hint) is NOT here and that is deliberate: it lives inside a
// Modal driven by `decision`, which is set by clicking one of two buttons,
// and `renderToStaticMarkup` cannot click. Extracting a whole review form to
// assert one ternary would be more moving parts than the change. Darryl's
// browser check covers it — stated so a green run is not read as covering it.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import DataTable from '../src/components/DataTable.jsx';
import { staffAudienceLabel } from '../src/format/audience.js';
import teacherAnnouncementCard from '../src/pages/teacher/announcements/card.jsx';
import teacherEventCard from '../src/pages/teacher/events/card.jsx';
import { sectionOptions, showSectionFilter } from '../src/pages/teacher/students/sectionOptions.js';
import ReportCard from '../src/pages/parent/ReportCard.jsx';

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
const cards = (cardFn, rows) => {
  const html = render(
    <DataTable columns={[{ key: 'id', header: 'Id' }]} rows={rows} keyField="id" renderCard={cardFn} />
  );
  const i = html.indexOf('sm:hidden');
  const j = html.indexOf('hidden sm:block');
  return i === -1 ? '' : html.slice(i, j === -1 ? undefined : j);
};

console.log('UI-C2 — one audience wording, one page heading, honest copy:\n');

// ------------------------------------------------- B. the audience label
console.log('B. the staff audience label:');

const SCHOOL = { id: 1, target_grade: null, target_section: null };
const WHOLE = { id: 2, target_grade: 6, target_section: null };
const CLASS = { id: 3, target_grade: 6, target_section: 'Malikhain' };

assert(staffAudienceLabel(SCHOOL) === 'School-wide', 'school-wide');
assert(staffAudienceLabel(WHOLE) === 'Grade 6 (whole grade)', 'a whole grade');
assert(staffAudienceLabel(CLASS) === 'Grade 6 - Malikhain', 'one class');
assert(
  staffAudienceLabel({ target_grade: undefined }) === 'School-wide',
  'undefined is treated as school-wide, not "Grade undefined"'
);

// THE SECTION MUST SURVIVE ON BOTH CARDS. The events card used to drop it,
// so a whole-grade event and a single-class one read identically.
const annHtml = cards(
  (row) => teacherAnnouncementCard(row, { actions: null }),
  [
    { ...SCHOOL, title: 'A', content: 'x', created_at: '2026-09-24T01:00:00Z' },
    { ...WHOLE, title: 'B', content: 'x', created_at: '2026-09-24T01:00:00Z' },
    { ...CLASS, title: 'C', content: 'x', created_at: '2026-09-24T01:00:00Z' },
  ]
);
// REAL SHAPES ONLY. An event row has `target_grade` and nothing else —
// posting one with `target_section` returns it null, which is how the false
// claim in this dispatch's first commit was caught.
const evtHtml = cards(
  (row) => teacherEventCard(row, { actions: null }),
  [
    { id: 1, target_grade: null, title: 'A', event_date: '2026-09-28' },
    { id: 2, target_grade: 6, title: 'B', event_date: '2026-09-28' },
  ]
);

// ANNOUNCEMENTS HAVE THREE AUDIENCES. The section is real here, and a
// whole-grade post and a one-class post must read differently.
assert(annHtml.includes('School-wide'), 'announcement card: school-wide');
assert(annHtml.includes('Grade 6 (whole grade)'), 'announcement card: whole grade');
assert(annHtml.includes('Grade 6 - Malikhain'), 'announcement card: one class, section shown');
assert(
  staffAudienceLabel(WHOLE) !== staffAudienceLabel(CLASS),
  'announcement: whole-grade and one-class are DISTINGUISHABLE'
);

// EVENTS HAVE TWO. The `events` table has no `target_section` column, so a
// one-class event cannot exist and "(whole grade)" would contrast with
// nothing. A row carrying a section is not a case to assert — the API can
// never produce one — so the only shapes tested are the ones it can.
assert(evtHtml.includes('School-wide'), 'event card: school-wide');
assert(evtHtml.includes('Grade 6'), 'event card: a targeted event names its grade');
assert(
  !evtHtml.includes('(whole grade)'),
  'event card: NO "(whole grade)" — there is no section for it to contrast with',
  evtHtml
);
assert(
  staffAudienceLabel({ target_grade: 6 }, { hasSections: false }) === 'Grade 6',
  'hasSections: false gives two cases, not three'
);
assert(
  staffAudienceLabel({ target_grade: null }, { hasSections: false }) === 'School-wide',
  'and school-wide is unchanged by the flag'
);

for (const [name, html] of [['announcement', annHtml], ['event', evtHtml]]) {
  assert(!html.includes('Everyone at the school'), `${name} card: no admin-only wording`);
  assert(!html.includes('All of Grade 6'), `${name} card: nor the other admin wording`);
}

// The card's DATE is no longer asserted here. UI-C2 deliberately left it
// slicing so it would not disagree with the table beside it, and asserted
// that; UI-C1a converted both, so the assertion had become a claim that the
// bug was still present. `scripts/ssr-dates.jsx` owns it now, and makes the
// stronger claim — that the card shows the school day the post was made and
// never the UTC day before.

// ------------------------------------------------- E. the Section filter
console.log('\nE. the Section filter options:');

const asg = (section, grade_level = 6) => ({ grade_level, section });
const stu = (section, grade_level = 6) => ({ id: 1, section, grade_level });

// A teacher with ONE section: nothing to choose between, so no control.
const one = sectionOptions([asg('Malikhain')], [stu('Malikhain')]);
assert(one.length === 1 && one[0].value === 'Malikhain', 'one section is found once, not twice');
assert(!showSectionFilter(one), 'and the filter is HIDDEN — a one-option select cannot change anything');

// TWO sections: the control appears.
const two = sectionOptions([asg('Malikhain'), asg('Masigasig')], [stu('Malikhain')]);
assert(two.length === 2, 'two sections');
assert(showSectionFilter(two), 'and the filter is shown');
assert(
  two[0].value === 'Malikhain' && two[1].value === 'Masigasig',
  'sorted, so the order does not depend on fetch order'
);

// THE ADVISER WITH NO ASSIGNMENTS — the case assignments alone would miss.
// That account is in the seed: the teacher who advises Grade 5 - Masigasig
// teaches no subject. Their students are on screen; their assignments are [].
const adviser = sectionOptions([], [stu('Masigasig', 5), stu('Masigasig', 5)]);
assert(
  adviser.length === 1 && adviser[0].value === 'Masigasig',
  'an adviser with NO assignments still gets their section'
);
assert(
  sectionOptions([], []).length === 0,
  'and no data at all yields nothing rather than throwing'
);

// ---- UI-C1b: the LABEL carries the grade, the VALUE never does.
//
// The bug this fixes is a teacher across two GRADES: "Malikhain" and
// "Masigasig" side by side said nothing about which class either was, while
// the Grade & section column beside them named both in full.
const twoGrades = sectionOptions([asg('Malikhain', 6), asg('Masigasig', 5)], []);
assert(
  twoGrades[0].label === 'Grade 5 - Masigasig' && twoGrades[1].label === 'Grade 6 - Malikhain',
  'each option is labelled "Grade N - Name", and they order BY GRADE — not alphabetically by name'
);
assert(
  twoGrades[0].value === 'Masigasig' && twoGrades[1].value === 'Malikhain',
  'THE VALUES STAY BARE: the filter compares row.section and ?section= takes the name alone'
);
assert(
  twoGrades.every((o) => o.label !== o.value),
  'label and value are genuinely different strings, so a value could not be rendered by accident'
);
// NEGATIVE CONTROL for the ordering claim: alphabetical by NAME would put
// Malikhain first. It does not, so the sort really is by grade.
assert(
  ['Malikhain', 'Masigasig'].sort((a, b) => a.localeCompare(b))[0] === 'Malikhain' &&
    twoGrades[0].value === 'Masigasig',
  'NEGATIVE CONTROL: name-alphabetical would have put Malikhain first'
);
// The grade can arrive from EITHER source. An adviser's section reaches the
// list through the loaded students, not through assignments.
assert(
  sectionOptions([], [stu('Masigasig', 5)])[0].label === 'Grade 5 - Masigasig',
  'the grade is read off the student rows too, not only off assignments'
);
// One source knows the grade and the other does not — the same class seen
// twice must still come out labelled.
assert(
  sectionOptions([{ section: 'Masigasig' }], [stu('Masigasig', 5)])[0].label === 'Grade 5 - Masigasig',
  'a row missing the grade does not erase a grade another row supplied'
);
// And a section nobody supplies a grade for degrades to the bare name
// rather than rendering "Grade null - Masigasig".
assert(
  sectionOptions([{ section: 'Masigasig' }], [])[0].label === 'Masigasig',
  'no grade anywhere falls back to the bare name, never to "Grade null - …"'
);

// NEGATIVE CONTROL: drop the students leg and the adviser's section vanishes
// — which is exactly what `classOptions` alone would have done.
assert(
  sectionOptions([], []).length === 0 && adviser.length === 1,
  'NEGATIVE CONTROL: assignments alone would leave that adviser with no options'
);

// ------------------------------------------------- G. the report card copy
console.log('\nG. the transmutation sentence:');

const SENTENCE = 'transmutation table';
const numericalReport = (termGrade) => ({
  student: { first_name: 'Marwin', last_name: 'Conde', grade_level: 6, section: 'Malikhain' },
  school_year: '2026-2027',
  grading_mode: 'numerical',
  subjects: [
    {
      subject_id: 1,
      subject_name: 'English',
      terms: { 1: termGrade === null ? null : { grade_id: 9, term_grade: termGrade }, 2: null, 3: null },
      final_grade: null,
    },
  ],
  term_averages: { 1: null, 2: null, 3: null },
  general_average: null,
  general_average_descriptor: null,
});

const empty = render(<ReportCard report={numericalReport(null)} schoolName="X" adviser="Y" />);
const withGrade = render(<ReportCard report={numericalReport(88)} schoolName="X" adviser="Y" />);

assert(!empty.includes(SENTENCE), 'NOT shown when no term grade exists — nothing to be unlike');
assert(withGrade.includes(SENTENCE), 'shown once a term grade exists');
assert(
  empty.includes('A term shows &quot;Pending&quot;') || empty.includes('A term shows "Pending"'),
  'the other lines still render on an empty card — only ONE line is gated'
);
assert(
  empty.includes('The final grade for a learning area appears once all three terms are recorded.'),
  'and so does the final-grade line'
);

// A grade ROW with no grade must NOT count — that is the seeded legacy case
// and the class-record shell row.
const shellOnly = render(
  <ReportCard
    report={{
      ...numericalReport(null),
      subjects: [
        {
          subject_id: 1,
          subject_name: 'English',
          terms: { 1: { grade_id: 9, term_grade: null }, 2: null, 3: null },
          final_grade: null,
        },
      ],
    }}
    schoolName="X"
    adviser="Y"
  />
);
assert(
  !shellOnly.includes(SENTENCE),
  'a grade ROW with a null term_grade does not count — shells and legacy rows render Pending'
);

// Descriptive cards never had the sentence and still do not.
const descriptive = render(
  <ReportCard
    report={{ ...numericalReport(null), grading_mode: 'descriptive' }}
    schoolName="X"
    adviser="Y"
  />
);
assert(!descriptive.includes(SENTENCE), 'Key Stage 1 never sees it — it does not transmute');
assert(
  descriptive.includes('There is no general average for this grade level.'),
  'and its own lines are untouched'
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
