import { useState } from 'react';
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

function Field({ label, value, empty = 'Not recorded', children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-faint">{label}</dt>
      <dd className="mt-1 text-sm text-fg">
        {children ?? (value ? value : <span className="text-fg-faint">{empty}</span>)}
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
  return `Grade ${user.grade_level} — ${user.section || ''}`.replace(/ — $/, '');
}

function MaskedLoginId({ value }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="text-fg-faint">—</span>;
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
        className="text-xs font-medium text-fg-body underline-offset-2 hover:underline"
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </span>
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
  const [status, setStatus] = useState(null);
  // A refused number — the client rule's or the server's 400 with field
  // "contact_number" — renders under the input with a red border (§7c);
  // everything else stays in FormStatus under the button.
  const [contactFieldError, setContactFieldError] = useState(null);

  async function saveContact(event) {
    event.preventDefault();
    setStatus(null);
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
    try {
      await api.put('/auth/contact', { contact_number: next }, { unwrap: 'user' });
      await refresh();
      setDraft(null);
      setStatus(ok('Contact number updated.'));
    } catch (err) {
      if (err?.response?.data?.field === 'contact_number') setContactFieldError(extractError(err));
      else setStatus(fail(extractError(err)));
    } finally {
      setSaving(false);
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
            <Field label="Email" value={user?.email} />
            <Field label="Contact number" value={storedContact} />
            <Field label="Login ID (child's LRN)">
              <MaskedLoginId value={user?.login_id} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Name" value={user?.name} />
            <Field label={role === 'admin' ? 'Admin ID' : 'Teacher ID'} value={user?.login_id} empty="—" />
            <Field label="Email" value={user?.email} />
            <Field label="Contact number" value={storedContact} />
          </>
        )}
      </dl>

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
          <FormStatus status={status} />
        </form>
      </section>
    </div>
  );
}
