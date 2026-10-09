// SSR proof — the privacy build on the web (feat/privacy, 2026-10-10;
// FRONTEND §29). Run from client/:
//   npx vite build --ssr scripts/ssr-privacy.jsx --outDir .ssr-tmp --logLevel error && node .ssr-tmp/ssr-privacy.js
//
// RENDERED: the consent screen's body (ConsentBody) in every state — the
// skeleton, a failed read, the three ticks and when Accept is allowed, the
// child's first name — and Settings → Security & policy (PolicyDocumentsView)
// for a parent and for staff, with the accepted date as the MANILA day. The
// documents rendered are the real server/policy files.
// PLAIN DATA: the Settings tab lists.
// SOURCE (and only where a render cannot reach — ProtectedRoute and App need a
// signed-in AuthProvider, whose context is private): the gate's ORDER (forced
// change first, then consent), the routes, and the four retired learner
// fields gone from the three pages. Each source check carries a control.
//
// What it cannot prove: a real redirect, a real accept, the 300 ms clock —
// that is the browser check.
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConsentBody } from '../src/pages/PolicyConsent.jsx';
import { PolicyDocumentsView } from '../src/pages/settings/SecurityPolicySection.jsx';
import { settingsTabsForRole } from '../src/pages/settings/tabs.js';

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
const render = (el) => renderToStaticMarkup(el);
const src = (p) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

// The real documents, as GET /api/policy builds them.
const POLICY = path.resolve(process.cwd(), '../server/policy');
const versions = JSON.parse(fs.readFileSync(path.join(POLICY, 'versions.json'), 'utf8'));
const DOCUMENTS = ['privacy_notice', 'terms_of_use'].map((document) => ({
  document,
  title: versions[document].title,
  version: versions[document].version,
  text: fs.readFileSync(path.join(POLICY, versions[document].file), 'utf8').replace(/\r\n/g, '\n').trim(),
}));

const NONE = { privacy_notice: false, terms_of_use: false, child: false };
const ALL = { privacy_notice: true, terms_of_use: true, child: true };
const noop = () => () => {};
function consent(props) {
  return render(
    <ConsentBody
      userName="Ligaya Halimbawa"
      childName="Tala"
      documents={DOCUMENTS}
      loadError={null}
      phase="off"
      ticked={NONE}
      onTick={noop}
      saving={false}
      status={null}
      onSubmit={() => {}}
      onRetry={() => {}}
      {...props}
    />
  );
}
const submitDisabled = (html) => /<button[^>]*type="submit"[^>]*disabled=""/.test(html);

console.log('\nThe Settings tab, every role (plain data)');
{
  for (const role of ['parent', 'teacher', 'admin']) {
    const tabs = settingsTabsForRole(role);
    const i = tabs.findIndex((t) => t.to === 'security');
    assert(
      i > 0 && tabs[i].label === 'Security & policy' && tabs[i].icon === 'fa-shield-halved' && tabs[i - 1].to === 'password',
      `${role}: "Security & policy" (fa-shield-halved), right after Change password`
    );
  }
  assert(settingsTabsForRole('nobody').length === 0, 'control: an unknown role has no tabs at all');
}

console.log('\nThe consent screen (rendered)');
{
  const painted = consent({ documents: null, phase: 'skeleton' });
  assert(
    /role="status"/.test(painted) && /aria-busy="true"/.test(painted) && /data-skeleton="painted"/.test(painted) && /Loading the documents…/.test(painted),
    "loading: Build 2's skeleton — role=status, aria-busy, painted, named"
  );
  assert(!/<form/.test(painted) && !/type="checkbox"/.test(painted), 'loading: no form and no tick boxes yet');
  const waiting = consent({ documents: null, phase: 'wait' });
  assert(/data-skeleton="wait"/.test(waiting) && /class="invisible"/.test(waiting), 'inside the first 300 ms: laid out, not painted');

  const failedRead = consent({ documents: null, loadError: 'Network Error' });
  assert(/Network Error/.test(failedRead) && /Retry|Try again/.test(failedRead) && !/<form/.test(failedRead), 'a failed read: the error with its retry, never the form');

  const fresh = consent({});
  const boxes = fresh.match(/type="checkbox"/g) || [];
  assert(boxes.length === 3, 'three tick boxes', `found ${boxes.length}`);
  assert(/I have read and accept the Data Privacy Notice\./.test(fresh), 'tick 1: the Data Privacy Notice');
  assert(/I have read and agree to the Terms of Use\./.test(fresh), 'tick 2: the Terms of Use');
  assert(
    /As the parent or legal guardian of Tala, I consent, on my child’s behalf, to the processing of my child’s personal data for the purposes in the notice\./.test(
      fresh
    ),
    'tick 3: the parent consents for the child, named by FIRST NAME (the principal’s draft wording)'
);
  assert(submitDisabled(fresh), 'nothing ticked: Accept is disabled');
  for (const missing of ['privacy_notice', 'terms_of_use', 'child']) {
    assert(submitDisabled(consent({ ticked: { ...ALL, [missing]: false } })), `without the "${missing}" tick: still disabled`);
  }
  const allTicked = consent({ ticked: ALL });
  assert(!submitDisabled(allTicked) && /I agree and continue/.test(allTicked), 'all three ticked: “I agree and continue” works');

  assert(
    DOCUMENTS.every((d) => fresh.includes(d.title) && fresh.includes(`Version ${d.version}`)),
    'each document is shown with its title and version from server/policy/versions.json'
  );
  assert(
    (fresh.match(/Draft — awaiting the school(’|&#x27;|')s approval\./g) || []).length === 2,
    'both documents are still the placeholder: "Draft — awaiting the school\'s approval."'
  );
  assert(
    (fresh.match(/role="region" aria-label="[^"]+ text" tabindex="0"/g) || []).length === 2,
    'each text sits in a focusable, labelled scroll region (a keyboard can scroll it)'
  );
  assert(!/\d{12}/.test(fresh), 'no LRN-shaped number anywhere on the screen');
  assert(/\d{12}/.test(consent({ childName: '123456789012' })), 'control: the same check catches twelve digits when they are there');
  assert(/As the parent or legal guardian of my child, I consent,/.test(consent({ childName: null })), 'no first name on the session: "guardian of my child" — never a blank');
  // The page around the card, read as SOURCE (the page needs a signed-in
  // session): the line about declining, above a plain "Sign out".
  const page = src('src/pages/PolicyConsent.jsx');
  const DECLINING = 'Declining ends portal use only; your child&rsquo;s school records stay as they are.';
  const signOutBlock = (text) =>
    text.indexOf(DECLINING) > 0 &&
    text.indexOf(DECLINING) < text.search(/>\s*Sign out\s*</) &&
    !/Sign out instead/.test(text);
  assert(signOutBlock(page), 'the page: "Declining ends portal use only; …" above a plain "Sign out"');
  assert(!signOutBlock(page.replace('Declining ends', 'Leaving ends')), 'control: without that line, the same check fails');
  const saving = consent({ ticked: ALL, saving: true });
  assert(/Saving…/.test(saving) && (saving.match(/type="checkbox"[^>]*disabled=""/g) || []).length === 3, 'while saving: the ticks are locked and the button says so');
}

console.log('\nSettings → Security & policy (rendered)');
{
  const loading = render(<PolicyDocumentsView data={null} error={null} phase="skeleton" onRetry={() => {}} />);
  assert(/role="status"/.test(loading) && /data-skeleton="painted"/.test(loading), "loading: Build 2's skeleton");
  const failedRead = render(<PolicyDocumentsView data={null} error="Network Error" phase="off" onRetry={() => {}} />);
  assert(/Network Error/.test(failedRead) && !/Version /.test(failedRead), 'a failed read: the error, no documents');

  // 16:30 UTC on the 9th is 00:30 on the 10th in Manila.
  const at = '2026-10-09T16:30:00.000Z';
  const parent = render(
    <PolicyDocumentsView
      data={{
        documents: DOCUMENTS,
        status: { required: true, acceptances: DOCUMENTS.map((d) => ({ document: d.document, accepted_at: at })) },
      }}
      error={null}
      phase="off"
      onRetry={() => {}}
    />
  );
  assert(/<h2[^>]*>Security &amp; policy<\/h2>/.test(parent), 'an <h2> section title — never a second <h1>');
  assert((parent.match(/Accepted on 10 October 2026/g) || []).length === 2, 'a parent: "Accepted on 10 October 2026" per document — the MANILA day');
  assert(!/9 October 2026/.test(parent), 'control: not the UTC day');
  assert(/when you accepted each/.test(parent), "a parent's sentence names the acceptance dates");

  const notYet = render(
    <PolicyDocumentsView
      data={{ documents: DOCUMENTS, status: { required: true, acceptances: DOCUMENTS.map((d) => ({ document: d.document, accepted_at: null })) } }}
      error={null}
      phase="off"
      onRetry={() => {}}
    />
  );
  assert((notYet.match(/Not accepted yet/g) || []).length === 2, 'a parent with no date: "Not accepted yet"');

  const staff = render(
    <PolicyDocumentsView
      data={{ documents: DOCUMENTS, status: { required: false, acceptances: DOCUMENTS.map((d) => ({ document: d.document, accepted_at: null })) } }}
      error={null}
      phase="off"
      onRetry={() => {}}
    />
  );
  assert(!/Accepted on|Not accepted/.test(staff), 'staff: no acceptance line — nothing that reads as owed (staff acceptance is deferred)');
  assert(/Parents accept them before using the portal\./.test(staff), 'staff: the sentence says parents accept them');
  assert(DOCUMENTS.every((d) => staff.includes(d.title) && staff.includes(`Version ${d.version}`)), 'staff still read both documents and their versions');
}

console.log('\nThe gate and the routes (source — a render cannot reach them)');
{
  const gate = src('src/auth/ProtectedRoute.jsx');
  const order = (text) => {
    const forced = text.indexOf("if (user.must_change_password) {\n    return <Navigate to=\"/change-password\" replace />;");
    const consent = text.indexOf('if (user.policy_pending) {\n    return <Navigate to="/consent" replace />;');
    const role = text.indexOf('if (allowedRoles && !allowedRoles.includes(user.role))');
    return forced > 0 && consent > forced && role > consent;
  };
  const normalised = gate.replace(/\r\n/g, '\n');
  assert(order(normalised), 'ProtectedRoute: the forced change first, then /consent on policy_pending, then the role check');
  const swapped = normalised
    .replace('if (user.must_change_password) {', 'if (user.__A__) {')
    .replace('if (user.policy_pending) {', 'if (user.must_change_password) {')
    .replace('if (user.__A__) {', 'if (user.policy_pending) {');
  assert(!order(swapped), 'control: the same check fails when the two gates are swapped');

  const app = src('src/App.jsx').replace(/\r\n/g, '\n');
  const consentRoute = app.indexOf('<Route path="/consent" element={<PolicyConsent />} />');
  assert(consentRoute > 0 && consentRoute < app.indexOf('path="/admin"'), '/consent is a top-level route, outside every role layout (no Shell, no ProtectedRoute)');
  assert((app.match(/<Route path="security" element={<SecurityPolicySection \/>} \/>/g) || []).length === 3, 'Settings → Security & policy is routed for all three roles');
}

console.log('\nThe four retired learner fields are gone from the three pages (source)');
{
  // Code, not comments: a field read, a field label, or the card's TITLE
  // (`>Contact details<`) — the pages' comments say the card is gone.
  const RETIRED = /\b(enroll|draft|student)\.(birthday|gender|address|contact_number)\b|label="(Birthday|Gender|Address)"|>Contact details</;
  for (const p of ['src/pages/teacher/StudentsPage.jsx', 'src/pages/teacher/StudentDetailPage.jsx', 'src/pages/admin/StudentDetailPage.jsx']) {
    const text = src(p);
    const hit = text.match(RETIRED);
    assert(!hit, `${p}: no learner birthday, gender, address or contact number`, hit ? hit[0] : '');
  }
  assert(
    RETIRED.test('value={student.birthday}') && RETIRED.test('<CardTitle icon="fa-address-book">Contact details</CardTitle>'),
    'control: the pattern catches the old field and the old card'
  );
  const wizard = src('src/pages/teacher/StudentsPage.jsx');
  assert(/parent\.contact_number/.test(wizard), "the PARENT's own contact number stays in the wizard — it is the guardian's, not the learner's");
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
