// SSR proof: a subject name that repeats carries its grade (F2, D-196;
// FRONTEND §13). Every check that could pass by accident has a control.
//
// Run from client/:
//   npx vite build --ssr scripts/ssr-subject-options.jsx --outDir .ssr-tmp --logLevel error && node .ssr-tmp/ssr-subject-options.js
//
// DRIVEN (pure): format/subjectOptions.js — when the label shows, its words, one
// entry per subject, and the order the rows came in.
// RENDERED: the Subject options through the real FormField.
// SOURCE: Teacher → Grades builds its list from the helper and prints the label.
// CANNOT PROVE: the page with real rows (its list loads in an effect, which a
// static render never runs) — that is the browser check. The phone's copy is
// proved equal by lint:mirrors, and its chips by proof-one-slot.

import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import FormField from '../src/components/FormField';
import { subjectOptions } from '../src/format/subjectOptions.js';

let passed = 0;
let failed = 0;
function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const row = (id, subjectId, name, gradeLevel, section) => ({
  id,
  subject_id: subjectId,
  subject_name: name,
  grade_level: gradeLevel,
  section,
});

// GET /assignments' own order: grade, then section, then the printed order.
const TWO_GRADES = [
  row(1, 50, 'MAPEH', 5, 'Alpha'),
  row(2, 50, 'MAPEH', 5, 'Beta'),
  row(3, 60, 'MAPEH', 6, 'Alpha'),
  row(4, 60, 'MAPEH', 6, 'Beta'),
];
const labels = (rows) => subjectOptions(rows).map((s) => s.label);

console.log('\nWhen the label shows (pure)');
{
  const two = subjectOptions(TWO_GRADES);
  assert(two.length === 2, 'one entry per subject, never one per section', `found ${two.length}`);
  assert(
    JSON.stringify(labels(TWO_GRADES)) === JSON.stringify(['MAPEH · Grade 5', 'MAPEH · Grade 6']),
    'one name in two grades: both entries carry their grade, in the words the owner chose',
    JSON.stringify(labels(TWO_GRADES))
  );
  assert(two[0].id === 50 && two[0].name === 'MAPEH' && two[1].id === 60, "the id and the plain name stay as they were: only the label is new");

  const mixed = [...TWO_GRADES, row(5, 61, 'Science', 6, 'Alpha')];
  assert(
    JSON.stringify(labels(mixed)) === JSON.stringify(['MAPEH · Grade 5', 'MAPEH · Grade 6', 'Science']),
    'a mixed list: only the name that repeats carries a grade',
    JSON.stringify(labels(mixed))
  );

  const oneGrade = [row(1, 11, 'Mathematics', 1, 'Alpha'), row(2, 12, 'GMRC', 1, 'Alpha'), row(3, 13, 'Makabansa', 1, 'Alpha')];
  assert(
    JSON.stringify(labels(oneGrade)) === JSON.stringify(['Mathematics', 'GMRC', 'Makabansa']),
    'a teacher with nothing repeated: every name stays bare and in the order it came'
  );

  const twoSections = [row(1, 50, 'MAPEH', 5, 'Alpha'), row(2, 50, 'MAPEH', 5, 'Beta')];
  assert(
    JSON.stringify(labels(twoSections)) === JSON.stringify(['MAPEH']),
    'one subject in two sections of ONE grade is one bare entry: a repeated subject is not a repeated name'
  );

  const twoSpellings = [row(1, 50, 'MAPEH', 5, 'Alpha'), row(2, 60, 'Mapeh ', 6, 'Alpha')];
  assert(
    labels(twoSpellings).every((label) => /· Grade \d$/.test(label)),
    'names are compared as the database compares them, ignoring case, and with spaces trimmed',
    JSON.stringify(labels(twoSpellings))
  );

  const backwards = [row(3, 60, 'MAPEH', 6, 'Alpha'), row(1, 50, 'MAPEH', 5, 'Alpha')];
  assert(
    JSON.stringify(labels(backwards)) === JSON.stringify(['MAPEH · Grade 6', 'MAPEH · Grade 5']),
    'the helper never re-sorts: the order is the rows\' own'
  );

  assert(subjectOptions([]).length === 0, 'no rows: no entries');
}

console.log('\nThe Subject options (rendered through the real FormField)');
{
  const select = (text) =>
    renderToStaticMarkup(
      <FormField label="Subject" as="select" defaultValue={50}>
        {subjectOptions(TWO_GRADES).map((s) => (
          <option key={s.id} value={s.id}>
            {text(s)}
          </option>
        ))}
      </FormField>
    );
  const shown = (html) => [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);

  const fixed = shown(select((s) => s.label));
  assert(new Set(fixed).size === 2, 'two options a teacher can tell apart', JSON.stringify(fixed));
  assert(fixed[0] === 'MAPEH · Grade 5' && fixed[1] === 'MAPEH · Grade 6', 'each option reads its grade', JSON.stringify(fixed));

  const defect = shown(select((s) => s.name));
  assert(defect.length === 2 && new Set(defect).size === 1, 'control: printing the plain name shows the defect, two identical entries', JSON.stringify(defect));
}

console.log('\nTeacher → Grades (source: its list loads in an effect, which a static render never runs)');
{
  const page = fs
    .readFileSync(path.resolve(process.cwd(), 'src/pages/teacher/ClassRecordPage.jsx'), 'utf8')
    .replace(/\r\n/g, '\n');
  const printsLabel = (text) =>
    /subjectOptions\(rows\)/.test(text) &&
    /\{subjects\.map\(\(s\) => \(\s*<option key=\{s\.id\} value=\{s\.id\}>\s*\{s\.label\}\s*<\/option>/.test(text);

  assert(printsLabel(page), 'the page builds its list from the helper and prints each label');
  assert(!/byId/.test(page), 'the page keeps no second copy of the rule');
  assert(!printsLabel(page.replace('{s.label}', '{s.name}')), 'control: the same check fails on a page that prints the plain name');
}

console.log(`\nssr-subject-options: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
