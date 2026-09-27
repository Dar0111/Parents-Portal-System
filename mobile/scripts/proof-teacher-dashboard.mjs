// PROOF — the pure halves the teacher's first-half screens stand on (Stage 5
// branch 3). Drives, under Node: `teacher/dashboard/logic.js` (the banner,
// the advisory pick), the verbatim copies `students/sectionOptions.js`,
// `components/filterState.js`, `format/audience.js`, and the three teacher
// card builders — including the `actions` pass-through RecordCard renders
// only on a static card, and the letter card's three tap outcomes (UI-E).
// What it cannot: that a screen renders — that is the phone (M7).
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-teacher-dashboard.mjs
import { register } from 'node:module';

const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const { advisedSections, bannerFor } = await import('../src/screens/teacher/dashboard/logic.js');
const { sectionOptions, showSectionFilter } = await import('../src/screens/teacher/students/sectionOptions.js');
const { isDirty } = await import('../src/components/filterState.js');
const { staffAudienceLabel } = await import('../src/format/audience.js');

// The card builders are .jsx files with no JSX in them; Node will not load
// that extension, so their source is imported as a data: URL module, with
// the one relative import rewritten to the date module's absolute URL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
async function loadCard(rel) {
  const file = path.resolve(here, '..', rel);
  const dir = path.dirname(file);
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(/from '(\.{1,2}\/[^']+)'/g, (m, spec) => `from '${pathToFileURL(path.resolve(dir, spec + (spec.endsWith('.js') ? '' : '.js'))).href}'`);
  return (await import('data:text/javascript,' + encodeURIComponent(src))).default;
}
const teacherLetterCard = await loadCard('src/screens/teacher/excuseLetters/card.jsx');
const teacherAnnouncementCard = await loadCard('src/screens/teacher/announcements/card.jsx');
const teacherEventCard = await loadCard('src/screens/teacher/events/card.jsx');

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}`);
  }
}

const malikhain = { id: 1, grade_level: 6, name: 'Malikhain', adviser_id: 2, student_count: 2 };

console.log('bannerFor — the web function, three states, Late counts present');
const none = bannerFor(malikhain, [], 2);
assert(none.tone === 'warning' && none.label === 'Not recorded', 'no rows → amber "Not recorded"');
const partial = bannerFor(malikhain, [{ status: 'Late' }], 2);
assert(partial.tone === 'warning' && partial.label === '1 of 2 recorded' && partial.detail === '1 present, 0 absent so far.', 'one of two, Late → amber "1 of 2 recorded", counted present');
const full = bannerFor(malikhain, [{ status: 'Present' }, { status: 'Absent' }], 2);
assert(full.tone === 'success' && full.label === 'Recorded' && full.detail === '1 present, 1 absent.', 'full coverage → green "Recorded"');
assert(bannerFor(malikhain, [{ status: 'Excused' }], 0).tone === 'success', 'a roster count of 0 (unknown) never claims partial');

console.log('advisedSections — Number() on both sides');
assert(advisedSections([malikhain, { id: 2, adviser_id: null }], '2').length === 1, "a string user id still matches a numeric adviser_id");
assert(advisedSections(null, 2).length === 0, 'a missing list is empty, never a throw');

console.log('sectionOptions — the Students filter');
const one = sectionOptions([{ grade_level: 6, section: 'Malikhain' }], [{ grade_level: 6, section: 'Malikhain' }]);
assert(one.length === 1 && one[0].value === 'Malikhain' && one[0].label === 'Grade 6 - Malikhain' && !showSectionFilter(one), 'one section → value is the bare name, label carries the grade, filter hidden');
const adviserOnly = sectionOptions([], [{ grade_level: 5, section: 'Masigasig' }]);
assert(adviserOnly.length === 1 && adviserOnly[0].label === 'Grade 5 - Masigasig', 'an adviser with no assignments (TCH-002) still gets the section from the loaded rows');
assert(showSectionFilter(sectionOptions([{ grade_level: 6, section: 'Malikhain' }], [{ grade_level: 1, section: 'Mabait' }])), 'two sections → the filter shows');

console.log('isDirty — the staged-filter cue');
assert(!isDirty({ search: 'tala ' }, { search: 'tala' }), 'a trailing space is not a change');
assert(isDirty({ status: 'Approved', from: '', to: '' }, { status: 'Pending', from: '', to: '' }), 'a changed status is a change');
assert(!isDirty({ grade: 6 }, { grade: '6' }), "6 and '6' are the same value");

console.log('staffAudienceLabel');
assert(staffAudienceLabel({ target_grade: 6, target_section: 'Malikhain' }) === 'Grade 6 - Malikhain', 'a section post names the class');
assert(staffAudienceLabel({ target_grade: 6 }, { hasSections: false }) === 'Grade 6', 'an event is a whole grade, no "(whole grade)"');
assert(staffAudienceLabel({ target_grade: null }) === 'School-wide', 'null target → School-wide');

console.log('the teacher letter card — three tap outcomes');
const letter = { id: 9, first_name: 'Tala', last_name: 'Halimbawa', grade_level: 6, section: 'Malikhain', absence_date: '2026-09-25', reason: 'Fever', status: 'Pending' };
const adviser = () => true;
const outsider = () => false;
let opened = null;
const reviewable = teacherLetterCard(letter, { canReview: adviser, onOpen: (r) => (opened = r) });
reviewable.onSelect?.();
assert(opened === letter && reviewable.title === 'Halimbawa, Tala' && reviewable.meta === '25 September 2026 · Grade 6 - Malikhain', 'Pending + adviser → tappable, opens the row; the date is the long form');
assert(teacherLetterCard(letter, { canReview: outsider, onOpen: () => {} }).onSelect === undefined, 'Pending + not adviser → a static card (the tap would only 403)');
assert(typeof teacherLetterCard({ ...letter, status: 'Declined' }, { canReview: outsider, onOpen: () => {} }).onSelect === 'function', 'Declined → tappable for any reader (the reading view)');

console.log('content cards — `actions` pass through, no onSelect');
const actions = [{ label: 'Edit', onPress: () => {} }];
const ann = teacherAnnouncementCard({ title: 'T', content: 'C', target_grade: 6, target_section: 'Malikhain', created_at: '2026-09-24T23:00:00.000Z' }, { actions });
assert(ann.actions === actions && ann.onSelect === undefined && ann.meta === 'Grade 6 - Malikhain · 25 Sep 2026', 'announcement: actions carried, static card, a 07:00 PH post dated in Manila');
const ev = teacherEventCard({ title: 'E', description: null, event_date: '2026-10-05', target_grade: 6 }, { actions: undefined });
assert(ev.subtitle === undefined && ev.meta === '5 October 2026 · Grade 6' && ev.actions === undefined, 'event: null description → no subtitle, date leads, no actions for a non-author');

console.log(`\nproof-teacher-dashboard: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
