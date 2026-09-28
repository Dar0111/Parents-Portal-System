import { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField from '../../components/FormField';
import { useAuth } from '../../auth/AuthContext';
import { contactError, contactRuleHint } from '../../format/contactRule';

// Settings → Account information, all three roles. Locked identity fields
// (school records — "ask the office") and the one editable one, the contact
// number (PUT /auth/contact). Only the locked fields differ by role:
//
//   teacher  Name · Teacher ID (login_id — TCH-001, not an LRN) · Email
//   admin    Name · Admin ID (login_id) · Email — the admin's first account
//            screen; PUT /auth/contact and change-password were always
//            authenticate-only and worked for any role, only no page called
//            them for admin (KNOWN ISSUES row closed 2026-09-18)
//   parent   Guardian name · Learner · Class · Email · Contact · Login ID
//            (the child's LRN) MASKED by default with a Show control
//
// §5c: a parent's login_id IS the child's LRN. This is still the one parent
// screen that shows it — their own credential on their own account — but
// masked until they ask (Darryl, 2026-09-18), never in a URL (the route has
// no :id), never copied onto Grades / Attendance / Excuse Letters / Messages.
//
// NEVER GET /api/settings (the school's key-value store) and NEVER
// PUT /api/users/:id (admin-only, 403) from here.
//
// §5b: the "current number" line renders user.contact_number from the last
// /auth/me (AuthContext). The input writes `draft` only; refresh() is the
// only writer of the stored value after a successful PUT. §5e: no
// confirmation on contact — the stored number is on screen, so a wrong save
// is a visible one-click fix. Unlinked parent accounts still change contact;
// child fields read "Not linked".
//
// EMAIL CONFIRMATION (R2, 2026-09-19). Two writes, both authenticated, so
// neither is the uniform-reply shape /auth/forgot-password has: this caller
// already knows their own address, and honesty here leaks nothing.
//   POST /auth/verify-email/request  -> 202, a code goes to the address
//   POST /auth/verify-email/confirm  -> the code, then email_verified_at
//
// THE ADDRESS ITSELF IS NOT EDITABLE HERE and must not become so. It is a
// school record like the name and the login id — PUT /auth/contact rejects
// `email` with a 400, and only an admin can change it through
// PUT /api/users/:id, which clears email_verified_at when it does. So a
// wrong address is an office trip, and the copy says that rather than
// offering a field that would 400.
//
// WHY IT MATTERS ON THIS SCREEN AT ALL: a confirmed address is the only
// thing that makes /forgot-password work for this account. Unconfirmed, the
// reset page answers exactly as it does for an account that does not exist,
// and the only way back in is an admin temporary password. The button's
// supporting line says that plainly (§5i) — it is a true statement about
// what the reset endpoint will do.
//
// §5b again: "Verified" renders from user.email_verified_at on the last
// /auth/me, and refresh() after a successful confirm is the only thing that
// changes it. The code input never writes it.

function Field({ label, value, empty = 'Not recorded', children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-1 text-sm text-fg">
        {children ?? (value ? value : <span className="text-fg-muted">{empty}</span>)}
      </dd>
    </div>
  );
}

function childName(user) {
  if (!user?.student_id) return null;
  const name = `${user.student_first_name || ''} ${user.student_last_name || ''}`.trim();
  return name || null;
}

function childClass(user) {
  if (!user?.student_id) return null;
  if (user.grade_level == null && !user.section) return null;
  // HYPHEN, not an em dash. This was the ONLY place in the app rendering a
  // class with an em dash — every other surface, staff and parent, writes
  // "Grade 6 - Malikhain" — so a parent saw one separator here and another
  // everywhere else for the same fact. Grepped, not assumed.
  return `Grade ${user.grade_level} - ${user.section || ''}`.replace(/ - $/, '');
}

function MaskedLoginId({ value }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="text-fg-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-3">
      <span className="font-mono tracking-wider" aria-live="polite">
        {shown ? value : '•'.repeat(Math.max(8, value.length))}
        <span className="sr-only">{shown ? '' : 'Login ID hidden'}</span>
      </span>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        className="text-xs font-medium text-brand underline-offset-2 hover:underline"
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}

// Exported so /dev/ui renders the REAL one in both states rather than a
// copy of its markup — the confirmed state is otherwise only reachable by
// actually confirming an address.
export function VerifiedMark({ at }) {
  if (!at) {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-warning-strong">
        <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
        Not confirmed
      </span>
    );
  }
  return (
    <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-success-strong">
      <i className="fa-solid fa-circle-check" aria-hidden="true" />
      Verified · {new Date(at).toLocaleDateString()}
    </span>
  );
}

// The stored number (always 09XXXXXXXXX) read as 0917 123 4567. Display only
// (§5d) — the value sent, stored and compared is never the spaced one.
function spacedNumber(value) {
  return /^09\d{9}$/.test(value || '') ? `${value.slice(0, 4)} ${value.slice(4, 7)} ${value.slice(7)}` : value;
}

function ContactValue({ value, at }) {
  if (!value) return <span className="text-fg-muted">Not recorded</span>;
  return (
    <>
      {spacedNumber(value)}
      <VerifiedMark at={at} />
    </>
  );
}

const ROLE_COPY = {
  teacher: 'Your name, Teacher ID and email are school records. Ask the office if something is wrong. You can update your contact number here and your password under Change password.',
  admin: 'Your name, Admin ID and email are school records. You can update your contact number here and your password under Change password.',
  parent: "Your name, your child's name, LRN, grade and section are school records. Ask the office if something is wrong. You can update your contact number here and your password under Change password.",
};

export default function AccountInfoSection() {
  const { user, refresh } = useAuth();
  const role = user?.role;
  const linked = Boolean(user?.student_id);

  const storedContact = user?.contact_number ?? '';
  // null = follow the last /auth/me value; a string = typing. (§5b)
  const [draft, setDraft] = useState(null);
  const contactValue = draft === null ? storedContact : draft;
  const contactDirty = contactValue.trim() !== storedContact.trim();
  const [saving, setSaving] = useState(false);
  // §7c: ONE object, keyed by form, because this page now has two writes.
  // Writing a key replaces the object, so a stale "Contact number updated."
  // cannot sit under a fresh email message or the other way round.
  const [status, setStatus] = useState({});
  // A refused number — the client rule's or the server's 400 with field
  // "contact_number" — renders under the input with a red border (§7c);
  // everything else stays in FormStatus under the button.
  const [contactFieldError, setContactFieldError] = useState(null);

  const emailVerifiedAt = user?.email_verified_at || null;
  const hasEmail = Boolean(user?.email);
  // Every "ask the school office" sentence on this page is a dead end for
  // the admin, who IS the office — and is also the only role that can reach
  // PUT /api/users/:id. All three email branches name the page instead
  // (browser check, 2026-09-19).
  const isAdmin = role === 'admin';
  // 'idle' until a code has been asked for; 'code' once one is on its way.
  // Not derived from anything stored — a code in an inbox outlives a page
  // refresh, so "Enter the code" stays available through the button below.
  const [emailStep, setEmailStep] = useState('idle');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeError, setEmailCodeError] = useState(null);
  const [emailBusy, setEmailBusy] = useState(false);

  // MOBILE NUMBER CONFIRMATION (feat/sms-transport, 2026-09-29) — the email
  // flow's twin. POST /auth/verify-contact/request texts a code to the stored
  // number; /confirm sets contact_verified_at. Unlike the email, the number
  // IS editable here, and saving a different one removes the confirmation
  // (the server clears it; the success line below says so). §5b: "Confirmed"
  // renders from user.contact_verified_at on the last /auth/me only.
  const contactVerifiedAt = user?.contact_verified_at || null;
  const [contactStep, setContactStep] = useState('idle');
  const [contactCode, setContactCode] = useState('');
  const [contactCodeError, setContactCodeError] = useState(null);
  const [contactBusy, setContactBusy] = useState(false);

  // RE-READ /auth/me ON MOUNT (browser check, 2026-09-19). AuthContext holds
  // the row fetched at sign-in and only rewrites it when this page or the
  // forced-change screen asks it to — so anything that changes YOUR row from
  // somewhere else leaves this page showing the old value until a manual
  // reload. Found with an admin: ADMIN001 edited its own email in
  // Admin → Users and this screen still showed the previous address, which
  // matters more than a cosmetic staleness because the Verify email button
  // would then have sent a code about an address that is no longer on the
  // account.
  //
  // §5b, one level out: what a screen claims is stored comes from a read,
  // not from whatever happened to be in memory. Admin → Users now refreshes
  // the auth user itself after you edit your own row, and this mount read is
  // the backstop for every other route to the same state (a second tab, a
  // direct API call, a future page).
  //
  // The ref keeps `refresh` current without making it a reason to re-run:
  // it is redeclared on every AuthProvider render, so listing it as a
  // dependency would refetch in a loop. Same shape as Modal's onClose (§7b).
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useEffect(() => {
    // Swallowed on purpose: the page still renders the last known row, and a
    // dead session is already handled by the 401 interceptor.
    refreshRef.current().catch(() => {});
  }, []);

  async function saveContact(event) {
    event.preventDefault();
    setStatus({});
    setContactFieldError(null);
    const next = contactValue.trim();
    if (!next) {
      setContactFieldError('Contact number must not be empty.');
      return;
    }
    const problem = contactError(next);
    if (problem) {
      setContactFieldError(problem);
      return;
    }
    setSaving(true);
    const wasConfirmed = Boolean(contactVerifiedAt);
    try {
      const saved = await api.put('/auth/contact', { contact_number: next }, { unwrap: 'user' });
      await refresh();
      setDraft(null);
      setContactStep('idle');
      setContactCode('');
      // The server decides whether this was a CHANGE (it compares the one
      // stored form, so +63… of the same number is not); its row says whether
      // the confirmation survived.
      setStatus({
        contact: ok(
          wasConfirmed && !saved?.contact_verified_at
            ? 'Contact number updated. The new number is not confirmed yet — text yourself a code above to confirm it.'
            : 'Contact number updated.'
        ),
      });
    } catch (err) {
      if (err?.response?.data?.field === 'contact_number') setContactFieldError(extractError(err));
      else setStatus({ contact: fail(extractError(err)) });
    } finally {
      setSaving(false);
    }
  }

  async function requestEmailCode() {
    setStatus({});
    setEmailCodeError(null);
    setEmailBusy(true);
    try {
      const message = await api.post('/auth/verify-email/request', {}, { unwrap: 'message' });
      // The already-confirmed reply is a 200, not a 202, and is the one case
      // where no code was sent — re-read rather than open a code box the
      // user can never fill.
      const alreadyDone = /already confirmed/i.test(message);
      if (alreadyDone) {
        await refresh();
        setEmailStep('idle');
      } else {
        setEmailStep('code');
      }
      setStatus({ email: ok(message) });
    } catch (err) {
      // 429 (rate limit) and 503 (mail would not send) both land here with
      // the server's own sentence, which already tells the user what to do.
      setStatus({ email: fail(extractError(err)) });
    } finally {
      setEmailBusy(false);
    }
  }

  async function confirmEmailCode(event) {
    event.preventDefault();
    setStatus({});
    setEmailCodeError(null);
    setEmailBusy(true);
    try {
      const message = await api.post(
        '/auth/verify-email/confirm',
        { code: emailCode.trim() },
        { unwrap: 'message' }
      );
      await refresh();
      setEmailCode('');
      setEmailStep('idle');
      setStatus({ email: ok(message) });
    } catch (err) {
      // One flat message for wrong / expired / used / too many tries, same
      // as the reset page. It belongs under the code field.
      setEmailCodeError(extractError(err));
    } finally {
      setEmailBusy(false);
    }
  }

  async function requestContactCode() {
    setStatus({});
    setContactCodeError(null);
    setContactBusy(true);
    try {
      const message = await api.post('/auth/verify-contact/request', {}, { unwrap: 'message' });
      // As email: the already-confirmed 200 sent nothing, so re-read rather
      // than open a code box that can never be filled.
      if (/already confirmed/i.test(message)) {
        await refresh();
        setContactStep('idle');
      } else {
        setContactStep('code');
      }
      setStatus({ mobile: ok(message) });
    } catch (err) {
      // 400 (no number), 429 (rate limit) and 503 (the text would not send)
      // all carry the server's own sentence.
      setStatus({ mobile: fail(extractError(err)) });
    } finally {
      setContactBusy(false);
    }
  }

  async function confirmContactCode(event) {
    event.preventDefault();
    setStatus({});
    setContactCodeError(null);
    setContactBusy(true);
    try {
      const message = await api.post('/auth/verify-contact/confirm', { code: contactCode.trim() }, { unwrap: 'message' });
      await refresh();
      setContactCode('');
      setContactStep('idle');
      setStatus({ mobile: ok(message) });
    } catch (err) {
      setContactCodeError(extractError(err));
    } finally {
      setContactBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-fg">Account information</h2>
        <p className="mt-1 text-sm text-fg-muted">{ROLE_COPY[role] || ''}</p>
      </div>

      <dl className="grid gap-4 rounded-lg border border-edge bg-surface-subtle px-4 py-4 sm:grid-cols-2">
        {role === 'parent' ? (
          <>
            <Field label="Parent name" value={user?.name} />
            <Field
              label="Learner"
              value={childName(user)}
              empty={linked ? 'Not recorded' : 'Not linked to a student record'}
            />
            <Field label="Class" value={childClass(user)} empty={linked ? 'Not recorded' : 'Not linked'} />
            <Field label="Email">
              {hasEmail ? (
                <>
                  {user.email}
                  <VerifiedMark at={emailVerifiedAt} />
                </>
              ) : (
                <span className="text-fg-muted">Not recorded</span>
              )}
            </Field>
            <Field label="Contact number">
              <ContactValue value={storedContact} at={contactVerifiedAt} />
            </Field>
            <Field label="Login ID (child's LRN)">
              <MaskedLoginId value={user?.login_id} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Name" value={user?.name} />
            <Field label={role === 'admin' ? 'Admin ID' : 'Teacher ID'} value={user?.login_id} empty="—" />
            <Field label="Email">
              {hasEmail ? (
                <>
                  {user.email}
                  <VerifiedMark at={emailVerifiedAt} />
                </>
              ) : (
                <span className="text-fg-muted">Not recorded</span>
              )}
            </Field>
            <Field label="Contact number">
              <ContactValue value={storedContact} at={contactVerifiedAt} />
            </Field>
          </>
        )}
      </dl>

      <section className="max-w-md space-y-3">
        <h3 className="text-sm font-semibold text-fg">Email address</h3>
        {!hasEmail ? (
          <p className="text-sm text-fg-muted">
            {/* F1 (feat/sms-transport, 2026-09-29): "without it you cannot
                reset your own password" stopped being true once a confirmed
                mobile number is also a reset channel (§5i). Keyed on the
                stored confirmation, so it switches the moment refresh()
                lands after a confirm or a number change. The admin keeps
                its own wording — an admin IS the office (§11). */}
            {contactVerifiedAt
              ? isAdmin
                ? 'There is no email address on this account. Reset codes can still come to your confirmed mobile number. Add an email by editing your account in Admin → Users if you also want one.'
                : 'There is no email address on this account. Reset codes can still come to your confirmed mobile number. Ask the school office if you also want an email added.'
              : isAdmin
                ? 'There is no email address on this account. Add one by editing your account in Admin → Users, or confirm a mobile number below — without either, you cannot reset your own password and only another admin can get you back in.'
                : 'There is no email address on this account. Ask the school office to add one, or confirm a mobile number below — without either, you cannot reset your own password and the office has to do it for you.'}
          </p>
        ) : emailVerifiedAt ? (
          <p className="text-sm text-fg-muted">
            This address is confirmed, so you can reset your own password from the sign-in page.{' '}
            {isAdmin
              ? 'To change it, edit your account in Admin → Users.'
              : 'To change the address itself, ask the school office.'}
          </p>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              This address is not confirmed yet. Confirming it is what lets you reset your own
              password from the sign-in page. Until then,{' '}
              {/* True for both, and worth the distinction: the temporary-password
                  fallback is admin-only AND refuses your own id, so an admin's
                  way back in is a DIFFERENT admin — not themselves, and not a
                  queue they can join (§5i). */}
              {isAdmin
                ? 'only another admin can get you back in.'
                : 'only the school office can get you back in.'}
            </p>
            {emailStep === 'code' ? (
              <form onSubmit={confirmEmailCode} className="space-y-3">
                <FormField
                  label="Six-digit code"
                  value={emailCode}
                  onChange={(e) => {
                    setEmailCodeError(null);
                    setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  hint={`Sent to ${user.email}. It expires shortly and can be used once.`}
                  error={emailCodeError}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={emailBusy || !/^\d{6}$/.test(emailCode)}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {emailBusy ? 'Confirming…' : 'Confirm email'}
                  </button>
                  <button
                    type="button"
                    onClick={requestEmailCode}
                    disabled={emailBusy}
                    className="rounded-lg border border-edge-strong px-4 py-2 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
                  >
                    Send a new code
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={requestEmailCode}
                disabled={emailBusy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {emailBusy ? 'Sending…' : 'Verify email'}
              </button>
            )}
          </>
        )}
        <FormStatus status={status.email} />
      </section>

      <section className="max-w-md space-y-3">
        <h3 className="text-sm font-semibold text-fg">Mobile number</h3>
        {!storedContact ? (
          <p className="text-sm text-fg-muted">
            There is no mobile number on this account. Add one below — once it is confirmed, reset
            codes can also come by text message.
          </p>
        ) : contactVerifiedAt ? (
          <p className="text-sm text-fg-muted">
            This number is confirmed, so reset codes can also come to it by text message. Changing
            the number below removes the confirmation.
          </p>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              This number is not confirmed yet. Confirming it lets you get password reset codes by
              text message.
            </p>
            {contactStep === 'code' ? (
              <form onSubmit={confirmContactCode} className="space-y-3">
                <FormField
                  label="Six-digit code"
                  value={contactCode}
                  onChange={(e) => {
                    setContactCodeError(null);
                    setContactCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  hint={`Sent to ${spacedNumber(storedContact)} by text message. It expires shortly and can be used once.`}
                  error={contactCodeError}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={contactBusy || !/^\d{6}$/.test(contactCode)}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {contactBusy ? 'Confirming…' : 'Confirm number'}
                  </button>
                  <button
                    type="button"
                    onClick={requestContactCode}
                    disabled={contactBusy}
                    className="rounded-lg border border-edge-strong px-4 py-2 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
                  >
                    Send a new code
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={requestContactCode}
                disabled={contactBusy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {contactBusy ? 'Sending…' : 'Text me a code'}
              </button>
            )}
          </>
        )}
        <FormStatus status={status.mobile} />
      </section>

      <section className="max-w-md space-y-3">
        <h3 className="text-sm font-semibold text-fg">Update contact number</h3>
        <p className="text-sm text-fg-muted">
          If you change phones, update this so the school can still reach you.
        </p>
        <form onSubmit={saveContact} className="space-y-3">
          <FormField
            label="New contact number"
            value={contactValue}
            onChange={(e) => {
              setContactFieldError(null);
              setDraft(e.target.value);
            }}
            maxLength={20}
            inputMode="tel"
            autoComplete="tel"
            hint={contactRuleHint()}
            error={contactFieldError}
          />
          <button
            type="submit"
            disabled={saving || !contactDirty}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save contact number'}
          </button>
          <FormStatus status={status.contact} />
        </form>
      </section>
    </div>
  );
}
