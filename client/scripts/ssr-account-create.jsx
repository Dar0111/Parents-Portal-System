// SSR proof — account creation collects no contact (feat/account-create,
// 2026-10-21; the owner's decision of 2026-10-16; FRONTEND §29g). Run from
// client/:
//   npx vite build --ssr scripts/ssr-account-create.jsx --outDir .ssr-tmp --logLevel error && node .ssr-tmp/ssr-account-create.js
//
// SOURCE, said plainly — the three pages need a signed-in AuthProvider and a
// router, whose context is private, so a render cannot reach their forms:
// Create teacher (Admin → Users), the enrol wizard's parent step (Teacher →
// Students) and Create parent account (Teacher → Student detail) carry no
// Email and no Contact number field, hold neither key, so send neither, and
// run no contact rule; the Edit dialog keeps both fields and its contact
// rule (the control — an admin edit is the office's path); the mirrored
// format/contactRule.js is untouched. Each check has a control that the
// pattern still catches the old line.
//
// What it cannot prove: the dialogs on screen, the server's 400 — the device
// check and test:users.
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;
function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const src = (p) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const users = src('src/pages/admin/UsersPage.jsx');
const wizard = src('src/pages/teacher/StudentsPage.jsx');
const detail = src('src/pages/teacher/StudentDetailPage.jsx');

// A dialog's text: from its opening marker to the first </Modal> after it.
function dialog(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) return '';
  const end = text.indexOf('</Modal>', start);
  return end < 0 ? '' : text.slice(start, end);
}

console.log('Create teacher (Admin → Users)');
const createForm = dialog(users, 'title="Create teacher"');
assert(createForm.length > 0, 'the Create teacher dialog is found');
assert(
  !/label="Email"/.test(createForm) && !/label="Contact number"/.test(createForm),
  'no Email and no Contact number field in it'
);
assert(
  /label="Login ID"/.test(createForm) && /label="Password"/.test(createForm) && /label="Name"/.test(createForm),
  'Login ID, Password and Name stay'
);
assert(!/teacherForm\.(email|contact_number)/.test(users), 'the teacher form holds neither key, so neither is sent');
assert(
  /EMPTY_TEACHER = \{\s*login_id: '',\s*password: '',\s*name: '',\s*\}/.test(users),
  'EMPTY_TEACHER is the three fields'
);
assert(
  /contactError\(editForm\.contact_number\)/.test(users) && !/contactError\(teacherForm/.test(users),
  'the contact rule runs on the Edit form only'
);
const editForm = dialog(users, 'id="edit-user-form"');
assert(
  /label="Email"/.test(editForm) && /label="Contact number"/.test(editForm),
  'CONTROL: the Edit dialog still carries Email and Contact number (an admin edit unconfirms a changed value — B4 §7)'
);

console.log('\nCreate parent account — the enrol wizard and the student record');
for (const [name, text] of [
  ['the enrol wizard', wizard],
  ['the student record', detail],
]) {
  assert(!/parent\.(email|contact_number)/.test(text), `${name}: the parent form holds neither key`);
  assert(!/label="Email"/.test(text) && !/label="Contact number"/.test(text), `${name}: no Email and no Contact number field`);
  assert(
    /label="Password"/.test(text) && /label="Confirm password"/.test(text),
    `${name}: Password and Confirm password stay`
  );
  assert(!/contactRule/.test(text), `${name}: the contact rule is not imported`);
}

console.log('\nControls');
assert(
  /parent\.(email|contact_number)/.test('if (parent.email.trim()) body.email = parent.email.trim();'),
  'CONTROL: the key pattern catches the old body line'
);
assert(
  /label="Contact number"/.test('<FormField label="Contact number" value={parent.contact_number} />'),
  'CONTROL: the label pattern catches the old field'
);
assert(/export function contactError/.test(src('src/format/contactRule.js')), 'the mirrored contact rule is untouched (Settings and the Edit dialog use it)');

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
