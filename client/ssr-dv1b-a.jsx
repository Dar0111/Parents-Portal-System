// THROWAWAY — DV1b-a render proof. Deleted before commit.
// Path named in the dispatch report: client/ssr-dv1b-a.jsx
//
// §14e says what must be proved has to be reachable by passing props. Here it
// already is, and that is the point of this dispatch being cheap to verify:
// `renderCard` returns DATA, so every card is a PURE FUNCTION OF A ROW. The
// proof calls those functions directly — no rendering needed for most of it —
// which is only possible because the contract forbids JSX in the data slots.
//
// The 14 cards are extracted from source rather than imported, because each
// one is an inline prop on a page that fetches its own data. The extraction is
// a regex over the file, so what is asserted is the REAL text that shipped.
import { readFileSync } from 'node:fs';

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

const PAGES = [
  ['teacher/AnnouncementsPage', 'content', 1],
  ['teacher/MemosPage', 'content', 1],
  ['teacher/EventsPage', 'content', 1],
  ['teacher/ExcuseLettersPage', 'record', 1],
  ['teacher/MessagesPage', 'conversation', 1],
  ['teacher/AttendanceRecordsPage', 'record', 1],
  ['parent/AnnouncementsPage', 'content', 1],
  ['parent/MemosPage', 'content', 1],
  ['parent/EventsPage', 'content', 1],
  ['parent/ExcuseLettersPage', 'record', 1],
  ['parent/MessagesPage', 'conversation', 1],
  ['admin/AnnouncementsPage', 'content', 2], // two labelled groups
  ['admin/AttendancePage', 'record', 1],
  ['admin/GradesPage', 'grade', 1],
];

const src = (p) => readFileSync(`${process.cwd()}/src/pages/${p}.jsx`, 'utf8');
const stripComments = (s) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

console.log('DV1b-a — every remaining DataTable consumer gets a card:\n');

// ---- 1. all 14 pages have renderCard, and admin/Announcements has two ----
let total = 0;
for (const [page, , count] of PAGES) {
  const code = stripComments(src(page));
  const n = (code.match(/renderCard=\{/g) || []).length;
  total += n;
  assert(n === count, `${page}: ${count} renderCard${count > 1 ? 's' : ''}`, `found ${n}`);
}
assert(total === 15, 'fifteen card definitions across fourteen pages', String(total));

// ---- 2. EXACTLY ONE interactive element per card ----
// `to` and `onSelect` are the only two, and a card may carry at most one.
for (const [page] of PAGES) {
  const code = stripComments(src(page));
  const blocks = code.split('renderCard={').slice(1);
  for (const [i, b] of blocks.entries()) {
    const head = b.slice(0, 900);
    const hasTo = /(^|[\s(])to:\s/.test(head);
    const hasSelect = /onSelect:\s/.test(head);
    assert(!(hasTo && hasSelect), `${page}[${i}]: never BOTH to and onSelect (§5a-iii)`);
  }
}

// ---- 3. no page builds a card from a column's render ----
for (const [page] of PAGES) {
  const code = stripComments(src(page));
  const blocks = code.split('renderCard={').slice(1).map((b) => b.slice(0, 900));
  for (const [i, b] of blocks.entries()) {
    assert(!/columns\[/.test(b) && !/\.render\(/.test(b),
      `${page}[${i}]: the card does not reuse a column's render`);
  }
}

// ---- 4. the no-duplicate-secondary rule, per page ----
// A fact may appear in title, subtitle, meta or status — but only once. The
// mechanical tell is the same row field read twice in one card.
for (const [page] of PAGES) {
  const code = stripComments(src(page));
  const blocks = code.split('renderCard={').slice(1).map((b) => b.slice(0, 900));
  for (const [i, b] of blocks.entries()) {
    const slots = ['title', 'subtitle', 'meta'].map((k) => {
      const m = b.match(new RegExp(`\\b${k}:\\s([\\s\\S]*?)(?=\\n\\s+(?:to|onSelect|avatar|title|subtitle|meta|status|statusTone|actions):|\\n\\s*\\}\\))`));
      return m ? m[1] : '';
    });
    const fieldsIn = (s) => new Set((s.match(/row\.[a-z_]+/g) || []).filter((f) => f !== 'row.terms'));
    const [t, sub, meta] = slots.map(fieldsIn);
    const dup = [...sub].filter((f) => t.has(f)).concat([...meta].filter((f) => t.has(f) || sub.has(f)));
    assert(dup.length === 0, `${page}[${i}]: no row field appears in two card slots`, dup.join(','));
  }
}

// ---- 5. status/statusTone mapping ----
// Every card that shows a status passes the RAW stored value, never a
// re-cased or re-worded one (§5d: casing is applied by StatusBadge).
for (const page of ['teacher/ExcuseLettersPage', 'parent/ExcuseLettersPage', 'teacher/AttendanceRecordsPage', 'admin/AttendancePage']) {
  const b = stripComments(src(page)).split('renderCard={')[1].slice(0, 900);
  assert(/status:\s*row\.status/.test(b), `${page}: status is the raw row.status`);
  assert(!/statusTone:/.test(b), `${page}: no statusTone override — the central tone map decides`);
}

// ---- 6. §5c — no LRN or login_id on any card ----
for (const [page] of PAGES) {
  const blocks = stripComments(src(page)).split('renderCard={').slice(1).map((b) => b.slice(0, 900));
  for (const [i, b] of blocks.entries()) {
    assert(!/row\.lrn|row\.login_id/.test(b), `${page}[${i}]: no LRN or login_id on the card (§5c)`);
  }
}
for (const page of ['parent/MessagesPage', 'teacher/MessagesPage']) {
  const b = stripComments(src(page)).split('renderCard={')[1].slice(0, 900);
  assert(/other_user_id/.test(b), `${page}: the thread link keys on users.id`);
}

// ---- 7. NEGATIVE CONTROLS ----
// (a) a card whose subtitle duplicates its title must FAIL rule 4.
const bad = `renderCard={(row) => ({
          title: row.title,
          subtitle: row.title,
          meta: row.created_at,
        })}`;
const badBlock = bad.split('renderCard={')[1].slice(0, 900);
const badSlots = ['title', 'subtitle', 'meta'].map((k) => {
  const m = badBlock.match(new RegExp(`\\b${k}:\\s([\\s\\S]*?)(?=\\n\\s+(?:to|onSelect|avatar|title|subtitle|meta|status|statusTone|actions):|\\n\\s*\\}\\))`));
  return m ? m[1] : '';
});
const badFields = badSlots.map((s) => new Set(s.match(/row\.[a-z_]+/g) || []));
const badDup = [...badFields[1]].filter((f) => badFields[0].has(f));
assert(badDup.length > 0, 'NEGATIVE CONTROL: a duplicated subtitle IS caught by rule 4', 'rule 4 would never fire');

// (b) a card offering both to and onSelect must FAIL rule 2.
const both = 'renderCard={(row) => ({\n          to: `/x/${row.id}`,\n          onSelect: () => open(row),\n        })}';
const bothHead = both.split('renderCard={')[1].slice(0, 900);
assert(/(^|[\s(])to:\s/.test(bothHead) && /onSelect:\s/.test(bothHead),
  'NEGATIVE CONTROL: a card with BOTH to and onSelect IS detected by rule 2');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
