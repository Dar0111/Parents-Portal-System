// SSR proof — the first sign-in on the web (feat/first-signin, 2026-10-18;
// FRONTEND §29). Run from client/:
//   npx vite build --ssr scripts/ssr-first-signin.jsx --outDir .ssr-tmp --logLevel error && node .ssr-tmp/ssr-first-signin.js
//
// RENDERED: the contact step's card (ContactStep) — "add" with nothing on
// file, "add" with an address on file (read-only, Change), a number-only
// account (Mobile number first), and "reconfirm" (Confirm it's you); the new
// password card (NewPasswordBody) — no temporary-password field; the shared
// code form (ContactCodeForm) counting down and ready. PLAIN DATA: the
// mirrored accountSteps — the countdown words, the default channel, the
// sent-to line. SOURCE: App routes /confirm-contact top-level, and the
// password page writes PUT /auth/first-password, never change-password.
// Each check carries a negative control.
//
// What it cannot prove: a real send, a real code, the clock ticking, the
// redirect between the steps — that is the browser check (§5h).
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CONTACT_COPY,
  defaultChannel,
  formatCountdown,
  resendLabel,
  sentToLine,
  spacedNumber,
} from '../src/auth/accountSteps.js';
import { entryPath, STEP_PATH } from '../src/auth/stepPath.js';
import ContactCodeForm from '../src/components/ContactCodeForm.jsx';
import { ContactStep } from '../src/pages/ConfirmContact.jsx';
import { NewPasswordBody } from '../src/pages/ForcedPasswordChange.jsx';

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
const render = (el) => renderToStaticMarkup(el).replace(/<!-- -->/g, '');
const src = (p) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const noop = () => {};
const asyncNoop = async () => {};
// Tag-level reads: React orders an input's attributes its own way and wraps a
// Button's label in spans, so a check reads tags and their text, not one regex.
const inputs = (html) => html.match(/<input\b[^>]*>/g) || [];
const radio = (html, value) => inputs(html).find((t) => /type="radio"/.test(t) && t.includes(`value="${value}"`));
const buttons = (html) =>
  [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    attrs: m[1],
    text: m[2].replace(/<[^>]+>/g, '').trim(),
  }));
const button = (html, text) => buttons(html).find((b) => b.text === text);
const isDisabled = (b) => Boolean(b) && /\bdisabled=""/.test(b.attrs);

// Fictional accounts: no login id, no LRN, a reserved-domain address.
const FRESH = { id: 1, role: 'teacher', name: 'Fixture Teacher', email: null, contact_number: null, contact_step: 'add' };
const WITH_EMAIL = { ...FRESH, email: 'fixture@example.invalid' };
const NUMBER_ONLY = { ...FRESH, contact_number: '09170000000' };
const RECONFIRM = {
  ...FRESH,
  email: 'fixture@example.invalid',
  email_verified_at: '2026-10-01T00:00:00.000Z',
  must_change_password: 1,
  contact_step: 'reconfirm',
};
const step = (user) => render(<ContactStep user={user} refresh={asyncNoop} onConfirmed={asyncNoop} />);

console.log('\nThe mirrored step words (plain data)');
{
  assert(formatCountdown(59) === '0:59' && formatCountdown(60) === '1:00' && formatCountdown(0) === '0:00', 'the clock reads 0:59, 1:00, 0:00');
  assert(formatCountdown(0.2) === '0:01', 'a part second still shows as a second (it rounds up, never shows 0:00 early)');
  assert(resendLabel(59) === 'Resend code in 0:59' && resendLabel(0) === 'Resend code', 'Resend code in 0:59, then Resend code');
  assert(resendLabel(1) !== resendLabel(0), 'control: a second left is not the ready label');
  assert(defaultChannel(FRESH) === 'email' && defaultChannel(NUMBER_ONLY) === 'mobile', 'the step opens on the email, or on the number when that is all there is');
  assert(
    defaultChannel({ ...RECONFIRM, email_verified_at: null, contact_number: '09170000000', contact_verified_at: '2026-10-01T00:00:00.000Z' }) === 'mobile',
    'a reconfirm opens on the CONFIRMED channel (here the number, though an email is on file)'
  );
  assert(sentToLine('mobile', '09170000000') === 'We sent a 6-digit code to 0917 000 0000.', 'the sent-to line spaces a number for reading');
  assert(spacedNumber('not-a-number') === 'not-a-number', 'control: anything not 09XXXXXXXXX is shown as it is');
  assert(
    STEP_PATH.consent === '/consent' && STEP_PATH.contact === '/confirm-contact' && STEP_PATH.password === '/change-password',
    'the three step pages'
  );
  assert(
    entryPath({ role: 'parent', policy_pending: true, contact_pending: true }) === '/consent' &&
      entryPath({ role: 'parent', contact_pending: true, must_change_password: 1 }) === '/confirm-contact' &&
      entryPath({ role: 'parent', must_change_password: 1 }) === '/change-password' &&
      entryPath({ role: 'parent' }) === '/parent',
    'entryPath: the next step page, or home'
  );
}

console.log('\nThe contact step (rendered)');
{
  const fresh = step(FRESH);
  assert(/<h1[^>]*>Confirm your contact<\/h1>/.test(fresh), 'title: Confirm your contact');
  assert(fresh.includes(CONTACT_COPY.add.intro), 'the intro: Gmail or mobile number, one is enough, the other later in Settings');
  assert(
    /checked=""/.test(radio(fresh, 'email') || '') && radio(fresh, 'mobile') && !/checked=""/.test(radio(fresh, 'mobile')),
    'two native radios — Gmail checked first'
  );
  assert(/>Gmail</.test(fresh) && />Mobile number</.test(fresh), 'labelled Gmail and Mobile number');
  assert(/type="email"/.test(fresh) && /autoComplete="email"|autocomplete="email"/.test(fresh), 'nothing on file: an email input opens');
  assert(/>Send code</.test(fresh), 'the button says Send code');
  assert(!/>\s*(Back|Skip)\b/.test(fresh), 'no Back and no Skip on the step');
  assert(/>\s*(Back|Skip)\b/.test('<button>Skip</button>'), 'control: the pattern catches a Skip button');

  const onFile = step(WITH_EMAIL);
  assert(onFile.includes('fixture@example.invalid') && />Change</.test(onFile) && !/type="email"/.test(onFile), 'an address on file: shown read-only with Change, no input');
  assert(/type="email"/.test(fresh) && !/>Change</.test(fresh), 'control: the fresh account has the input and no Change');

  const number = step(NUMBER_ONLY);
  assert(
    /checked=""/.test(radio(number, 'mobile') || '') && !/checked=""/.test(radio(number, 'email') || '') && number.includes('0917 000 0000'),
    'a number-only account: Mobile number first, the number spaced'
  );

  const re = step(RECONFIRM);
  assert(/<h1[^>]*>Confirm it’s you<\/h1>/.test(re), 'reconfirm: title Confirm it’s you');
  assert(re.includes('Before you set a new password, we’ll send a 6-digit code to your confirmed Gmail or mobile number.'), 'reconfirm: the sentence names the confirmed contact');
  assert(!/Confirm it’s you/.test(fresh), 'control: the add step never says Confirm it’s you');
}

console.log('\nThe code form (rendered)');
{
  const form = (props) =>
    render(
      <ContactCodeForm code="" onCodeChange={noop} onSubmit={noop} onResend={noop} remaining={0} {...props} />
    );
  const counting = form({ remaining: 59 });
  assert(isDisabled(button(counting, 'Resend code in 0:59')), 'while the clock runs: "Resend code in 0:59", disabled');
  const ready = form({ remaining: 0 });
  const readyResend = button(ready, 'Resend code');
  assert(readyResend && !isDisabled(readyResend), 'at 0:00: "Resend code", enabled');
  assert(!button(counting, 'Resend code'), 'control: the counting form has no plain Resend code button');
  assert(/>6-digit code</.test(ready) && /inputMode="numeric"|inputmode="numeric"/.test(ready) && /maxLength="6"|maxlength="6"/.test(ready), 'the field: 6-digit code, numeric, six long');
  assert(/<button[^>]*type="submit"[^>]*disabled=""/.test(ready), 'Confirm is disabled until six digits are typed');
  assert(!/<button[^>]*type="submit"[^>]*disabled=""/.test(form({ code: '123456' })), 'control: six digits enable Confirm');
  const withError = form({ error: 'That code is not valid. Request a new one.' });
  assert(withError.includes('That code is not valid. Request a new one.'), "the server's one flat message sits under the field");
}

console.log('\nThe new password (rendered)');
{
  const body = (props) =>
    render(
      <NewPasswordBody
        userName="Fixture Teacher"
        newPassword=""
        confirmPassword=""
        onNewPassword={noop}
        onConfirmPassword={noop}
        revealed={{ next: false, confirm: false }}
        onToggleReveal={noop}
        newError={null}
        mismatch={null}
        ready={false}
        saving={false}
        status={null}
        onSubmit={noop}
        {...props}
      />
    );
  const html = body({});
  assert(/<h1[^>]*>Set a new password<\/h1>/.test(html), 'title: Set a new password');
  assert(/>New password</.test(html) && />Confirm new password</.test(html), 'two fields: New password, Confirm new password');
  assert(!/Temporary password|Current password/.test(html), 'NO temporary or current password field');
  assert(/>Save password</.test(html), 'the button says Save password');
  assert((html.match(/type="password"/g) || []).length === 2, 'exactly two password inputs', `got ${(html.match(/type="password"/g) || []).length}`);
  assert(body({ newError: 'Password must be at least 8 characters and include at least one number.' }).includes('at least 8 characters'), "the server's rule message lands under New password");
}

console.log('\nThe routes and the endpoint (source)');
{
  const app = src('src/App.jsx');
  const contactRoute = app.indexOf('<Route path="/confirm-contact" element={<ConfirmContact />} />');
  assert(contactRoute > 0 && contactRoute < app.indexOf('path="/admin"'), '/confirm-contact is a top-level route, outside every role layout');
  const page = src('src/pages/ForcedPasswordChange.jsx');
  assert(page.includes("api.put('/auth/first-password', { new_password: newPassword }"), 'the password page writes PUT /auth/first-password with the new password alone');
  assert(!page.includes('/auth/change-password'), 'and never calls change-password');
  assert(src('src/pages/settings/ChangePasswordSection.jsx').includes('/auth/change-password'), 'control: Settings still changes a password through change-password');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
