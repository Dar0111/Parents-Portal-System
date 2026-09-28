// PROOF — Admin → Announcements & memos' pure half (Stage 5 branch 4, M18).
// Drives `admin/posts/logic.js`: the three audiences and BOTH target keys on
// every write (null when absent), the refusals in the web's order, a row back
// into a form, who may edit, the delete sentence by kind and poster, and the
// filter params. What it cannot: the Alert and the lists — the phone (M7).
// Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-admin-posts.mjs
import { register } from 'node:module';

const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(s) && !/\\.[a-z]+$/.test(s)) return n(s + '.js', c); throw e; } }`;
register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);

const L = await import('../src/screens/admin/posts/logic.js');

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

const base = { ...L.EMPTY_ANN, title: ' Test ', content: ' Body ' };
const keys = (b) => 'target_grade' in b && 'target_section' in b;

console.log('announcement bodies — both target keys, always');
const school = L.announcementBody(base).body;
assert(keys(school) && school.target_grade === null && school.target_section === null && school.title === 'Test' && school.category === null, 'school-wide: both keys null; trimmed; an empty category is null');
const grade = L.announcementBody({ ...base, audience: 'grade', grade: '4' }).body;
assert(keys(grade) && grade.target_grade === 4 && grade.target_section === null, 'one grade: grade as a number, section null');
const cls = L.announcementBody({ ...base, audience: 'class', grade: '6', section: 'Malikhain' }).body;
assert(keys(cls) && cls.target_grade === 6 && cls.target_section === 'Malikhain', 'one class: both set');
assert(L.announcementBody({ ...base, audience: 'grade', grade: '4', section: 'Stale' }).body.target_section === null, 'a leftover section is NOT sent for a whole-grade post (the PUT-keeps-old-value trap)');

console.log('refusals, in the web\'s order');
assert(L.announcementBody({ ...base, title: '' }).problem === 'Title and message are required.', 'title and message first');
assert(L.announcementBody({ ...base, audience: 'grade' }).problem === 'Pick a grade.' && L.announcementBody({ ...base, audience: 'class', grade: '6' }).problem === 'Pick a class.', 'then the grade, then the class');
assert(L.memoBody({ title: 'M', content: '' }).problem === 'Title and message are required.' && JSON.stringify(L.memoBody({ title: ' M ', content: ' C ' }).body) === '{"title":"M","content":"C"}', 'a memo has no audience keys at all');

console.log('edit and delete');
const teacherPost = { id: 5, title: 'Field trip', posted_by: 2, posted_by_name: 'Maria Santos', target_grade: 6, target_section: 'Malikhain' };
assert(L.canEditAnnouncement({ posted_by: 1 }, 1) && !L.canEditAnnouncement(teacherPost, 1), 'edit only your own announcement');
assert(L.deleteSentence('announcement', teacherPost, 1).endsWith('and Maria Santos is not told.') && L.deleteSentence('announcement', teacherPost, 1).includes('posted by Maria Santos to Grade 6 - Malikhain'), "a teacher's post: the poster named, and that they are not told");
assert(L.deleteSentence('memo', { title: 'M' }, 1) === 'Delete “M”? This cannot be undone. Every teacher and parent loses it.', 'a memo: every teacher and parent loses it');
assert(L.formFromRow({ ...teacherPost, content: 'x', category: null }).audience === 'class' && L.formFromRow({ target_grade: null, target_section: null, title: 't', content: 'c' }).audience === 'school', 'a row reads back into the right audience');
assert(JSON.stringify(L.announcementFilterParams({ grade: '6', section: '' })) === '{"grade_level":"6"}', 'an empty filter value is not sent');

console.log(`\nproof-admin-posts: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
