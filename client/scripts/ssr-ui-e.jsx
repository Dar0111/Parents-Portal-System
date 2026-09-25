// UI-E render proof — the teacher's read-only letter view.
//
// RUN FROM `client/`:
//   npx vite build --ssr scripts/ssr-ui-e.jsx --outDir .ssr-tmp
//   node .ssr-tmp/ssr-ui-e.js
//
// EVERY FIXTURE BELOW IS A REAL `GET /api/excuse-letters` ROW, captured from
// the running server during this dispatch's fixture step and pasted in
// unedited apart from the text. That is not caution for its own sake: UI-D-3's
// proof invented a STRING where the API sends an OBJECT, asserted 71 things
// about it, and passed — while `/parent` rendered a blank page in a browser
// (§19f). A proof proves the code against its fixture, so a fixture that is
// wrong about the API proves nothing about the app.
//
// The card is asserted by RENDERING through the real `DataTable`, never by
// reading source text (§17d).
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import DataTable from '../src/components/DataTable.jsx';
import LetterReadingView from '../src/pages/teacher/excuseLetters/readingView.jsx';
import teacherLetterCard from '../src/pages/teacher/excuseLetters/card.jsx';

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

// ---- the real shape, verbatim from the API ------------------------------
const APPROVED = {
  id: 359,
  student_id: 3,
  parent_id: 7,
  absence_date: '2026-09-22',
  reason: 'Fever and medical check-up',
  details: 'Seen at the barangay health centre; certificate attached to the clinic record.',
  attachment_url: null,
  status: 'Approved',
  teacher_remarks: 'Clinic record seen. Please send the medical certificate when it is released.',
  reviewed_by: 6,
  created_at: '2026-09-25T04:46:43.000Z',
  updated_at: '2026-09-25T04:46:43.000Z',
  first_name: 'Nino',
  last_name: 'Alcantara',
  grade_level: 1,
  section: 'Mabait',
};
const DECLINED = {
  ...APPROVED,
  id: 360,
  absence_date: '2026-09-18',
  reason: 'Family errand out of town',
  details: 'We travelled to the province and returned late.',
  status: 'Declined',
  teacher_remarks:
    'A family trip is not an excused absence under the school handbook. The absence stands as recorded.',
};
const PENDING = {
  ...APPROVED,
  id: 361,
  absence_date: '2026-09-16',
  reason: 'Stomach ache',
  details: 'Rested at home for the day.',
  status: 'Pending',
  teacher_remarks: null,
  reviewed_by: null,
};

console.log('UI-E — the teacher can read back a reviewed letter:\n');

// --------------------------------------------- 1. the reading view
console.log('1. the reading view:');

const declined = render(<LetterReadingView letter={DECLINED} />);
assert(
  declined.includes('A family trip is not an excused absence'),
  'THE DEFECT IS FIXED: a DECLINED letter shows the adviser remarks'
);
assert(declined.includes('Adviser remarks'), 'under the heading "Adviser remarks"');
assert(
  !/Your remarks/i.test(declined),
  'and NOT "Your remarks" — read scope is wider than review scope, so the possessive would be false (§5i)'
);
assert(declined.includes('We travelled to the province'), 'the details render too');
assert(declined.includes('Family errand out of town'), 'and the reason');

const approved = render(<LetterReadingView letter={APPROVED} />);
assert(
  approved.includes('Clinic record seen'),
  'an APPROVED letter shows its remarks as well — this is not a decline-only view'
);

// The learner and class, which the parent's view omits because a parent has
// one child and a teacher has a list.
assert(
  approved.includes('Alcantara, Nino') && approved.includes('Grade 1 - Mabait'),
  'the learner and the class are named'
);

// Dates: long form, and string surgery on a DATE column (§5a-iv / §18).
assert(approved.includes('22 September 2026'), 'the absence date is the long form');
assert(!approved.includes('2026-09-22'), 'and no raw DATE string reaches the markup');

// §5c: nothing in this payload is an LRN, and nothing invents one.
assert(
  !approved.includes('student_id') && !/\b\d{7,}\b/.test(approved),
  'no identifier of any kind is rendered (§5c)'
);

// The four deliberate omissions.
// Each omission is checked as a HEADING, not as a word anywhere in the
// markup: the first version matched /attach/i and failed on its own fixture,
// whose details read "certificate attached to the clinic record". A field is
// absent when its <dt> is absent; the learner's prose is not the app's.
const headings = [...approved.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map((m) => m[1]);
assert(
  !headings.some((h) => /review|submitted|attach/i.test(h)),
  'no Reviewed by, no Reviewed on, no Submitted, no Attachment heading',
  headings.join(' | ')
);
assert(
  headings.join('|') === 'Learner|Class|Absence date|Status|Reason|Details|Adviser remarks',
  'the headings are exactly these seven, in this order',
  headings.join('|')
);
assert(!/Edit/i.test(approved), 'NO EDIT CONTROL — a teacher never edits a letter');

// NULL remarks: absent, not an empty heading that would read as a failed
// fetch. Remarks are optional at the API layer by decision.
const noRemarks = render(<LetterReadingView letter={{ ...DECLINED, teacher_remarks: null }} />);
assert(!noRemarks.includes('Adviser remarks'), 'a letter with NULL remarks renders no remarks heading');
assert(noRemarks.includes('Family errand'), 'but still renders everything it does have');
const noDetails = render(<LetterReadingView letter={{ ...APPROVED, details: null }} />);
assert(!noDetails.includes('Details'), 'and the same for NULL details');

assert(render(<LetterReadingView letter={null} />) === '', 'no letter renders nothing at all');

// --------------------------------------------- 2. the card's gate
console.log('\n2. the card, rendered through the real DataTable:');

const asCards = (rows, canReview) =>
  render(
    <DataTable
      columns={[{ key: 'id', header: 'Id' }]}
      keyField="id"
      rows={rows}
      renderCard={(row) => teacherLetterCard(row, { canReview, onOpen: () => {} })}
    />
  );

// Every reviewed letter is tappable, whoever is looking — the reading view
// exists for all of them, and the read scope is wider than the review scope.
const reviewedNotAdviser = asCards([APPROVED, DECLINED], () => false);
assert(
  (reviewedNotAdviser.match(/<button/g) || []).length === 2,
  'both reviewed letters are tappable even for a NON-adviser',
  String((reviewedNotAdviser.match(/<button/g) || []).length)
);
assert(
  (reviewedNotAdviser.match(/fa-chevron-right/g) || []).length === 2,
  'and both show a chevron'
);

// A Pending letter this teacher does NOT advise stays static, and that gate
// is correct and unchanged: there is no reading view for a Pending letter,
// and PATCH /:id/review would 403.
const pendingNotAdviser = asCards([PENDING], () => false);
assert(
  !pendingNotAdviser.includes('<button'),
  'a PENDING letter the teacher does not advise is still NOT tappable'
);

// A Pending letter they do advise opens the review form.
const pendingAdviser = asCards([PENDING], () => true);
assert(pendingAdviser.includes('<button'), 'a PENDING letter they DO advise is tappable');

// NEGATIVE CONTROL: the gate really can refuse, so the assertions above are
// not passing because everything is always tappable.
assert(
  !asCards([PENDING], () => false).includes('<button') &&
    asCards([APPROVED], () => false).includes('<button'),
  'NEGATIVE CONTROL: the same canReview refuses Pending and allows Approved'
);

// The card's own content is unchanged by UI-E.
assert(
  reviewedNotAdviser.includes('22 September 2026') &&
    reviewedNotAdviser.includes('Grade 1 - Mabait'),
  'the card still carries the long date and the class'
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
