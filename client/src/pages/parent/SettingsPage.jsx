import { useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import FormField, { controlClass } from '../../components/FormField';
import Modal from '../../components/Modal';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent account settings. Identity is locked. The only writes are
// PUT /auth/change-password and PUT /auth/contact.
//
// NEVER GET /api/settings — that is the school's key-value store
// (academic_year, school_name), admin-writable. NEVER PUT /api/users/:id
// — authorize('admin'), 403 "Access denied."
//
// LOCKED: child name, LRN / login_id, grade, section, guardian name, email.
// §5c exception: this is the one parent screen that shows the LRN, because
// it IS the parent's login and the point of the page is to show what cannot
// be changed. It is their own credential on their own account, not a roster
// leak. Do not put it in the URL (this route has no :id). Do not copy this
// onto Grades / Attendance / Excuse Letters.
//
// Unlinked accounts still change password and contact. Child fields read
// "Not linked" — there is no student row to display.
//
// §5b: the "current number" line renders user.contact_number from the last
// /auth/me (AuthContext). The input writes `draft` only. refresh() is the
// only writer of the stored value after a successful PUT.
// Stay logged in after a successful password PUT. PUT /auth/change-password
// does not invalidate JWTs.
//
// §5e: contact stays no-confirm — the stored number is on screen, so a
// wrong save is a visible one-click fix. Password gets an explicit
// confirmation that names the action, matching Teacher Settings
// (2026-09-10). A warning sentence is not a confirmation step.
// Show/hide is per field. Change password stays uncolored until Confirm
// new password has a value.
//
// PasswordField is copied from Teacher Settings — extract at three.

function Field({ label, value, empty = 'Not recorded' }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">
        {value ? value : <span className="text-slate-400">{empty}</span>}
      </dd>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  revealed,
  onToggleReveal,
}) {
  return (
    <FormField
      label={label}
      hint={hint}
      render={({ id, describedBy }) => (
        <div className="relative">
          <input
            id={id}
            type={revealed ? 'text' : 'password'}
            value={value}
            onChange={onChange}
            autoComplete={autoComplete}
            aria-describedby={describedBy}
            className={`${controlClass} pr-10`}
          />
          <button
            type="button"
            onClick={onToggleReveal}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-600"
          >
            <i className={`fa-solid ${revealed ? 'fa-eye-slash' : 'fa-eye'}`} />
          </button>
        </div>
      )}
    />
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

export default function ParentSettingsPage() {
  usePageTitle('Settings');
  const { user, refresh } = useAuth();

  const storedContact = user?.contact_number ?? '';
  // null = follow the last /auth/me value. A string means the parent is
  // typing. refresh() is the only writer of storedContact; this never
  // writes it. (§5b)
  const [draft, setDraft] = useState(null);
  const contactValue = draft === null ? storedContact : draft;
  const [contactSaving, setContactSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [confirmingPassword, setConfirmingPassword] = useState(false);
  const [revealed, setRevealed] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);

  function toggleRevealed(key) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const contactDirty = contactValue.trim() !== storedContact.trim();
  const linked = user?.student_id != null;

  async function saveContact(e) {
    e.preventDefault();
    setSaveError(null);
    setSaveMessage(null);

    const next = contactValue.trim();
    if (!next) {
      setSaveError('Contact number must not be empty.');
      return;
    }

    setContactSaving(true);
    try {
      await api.put('/auth/contact', { contact_number: next }, { unwrap: 'user' });
      await refresh();
      setDraft(null);
      setSaveMessage('Contact number updated.');
    } catch (err) {
      setSaveError(extractError(err));
    } finally {
      setContactSaving(false);
    }
  }

  function requestPasswordChange(e) {
    e.preventDefault();
    setSaveError(null);
    setSaveMessage(null);

    if (!currentPassword || !newPassword) {
      setSaveError('Current password and new password are required.');
      return;
    }
    if (newPassword.length < 6) {
      setSaveError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setSaveError('New password and confirmation do not match.');
      return;
    }

    setConfirmingPassword(true);
  }

  async function savePassword() {
    setSaveError(null);
    setSaveMessage(null);
    setPasswordSaving(true);
    try {
      const message = await api.put(
        '/auth/change-password',
        { current_password: currentPassword, new_password: newPassword },
        { unwrap: 'message' }
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setConfirmingPassword(false);
      setRevealed({ current: false, next: false, confirm: false });
      setSaveMessage(message);
    } catch (err) {
      setConfirmingPassword(false);
      setSaveError(extractError(err));
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {saveError ? (
        <ErrorAlert message={saveError} />
      ) : saveMessage ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <i className="fa-solid fa-circle-check text-emerald-600" />
          <p className="text-sm text-emerald-800">{saveMessage}</p>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">School record</h2>
        <p className="text-sm text-slate-500">
          Your child&apos;s name, LRN, grade, and section are school records. Ask the office if
          something is wrong. You can update your contact number and password below.
        </p>
        <dl className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 sm:grid-cols-2">
          <Field
            label="Child's name"
            value={childName(user)}
            empty={linked ? 'Not recorded' : 'Not linked to a student record'}
          />
          <Field
            label="Login ID (child's LRN)"
            value={user?.login_id}
            empty="—"
          />
          <Field
            label="Grade and section"
            value={childClass(user)}
            empty={linked ? 'Not recorded' : 'Not linked'}
          />
          <Field label="Guardian name" value={user?.name} />
          <Field label="Email" value={user?.email} />
        </dl>
      </section>

      <section className="max-w-md space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Contact number</h2>
        <p className="text-sm text-slate-500">
          If you change phones, update this so the school can still reach you.
        </p>
        <p className="text-sm text-slate-600">
          Current number:{' '}
          {storedContact ? (
            <span className="font-medium text-slate-900">{storedContact}</span>
          ) : (
            <span className="text-slate-400">Not recorded</span>
          )}
        </p>
        <form onSubmit={saveContact} className="space-y-3">
          <FormField
            label="New contact number"
            value={contactValue}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={20}
            autoComplete="tel"
            hint="Up to 20 characters."
          />
          <button
            type="submit"
            disabled={contactSaving || !contactDirty}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {contactSaving ? 'Saving…' : 'Save contact number'}
          </button>
        </form>
      </section>

      <section className="max-w-md space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Password</h2>
        <form onSubmit={requestPasswordChange} className="space-y-3">
          <PasswordField
            label="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            revealed={revealed.current}
            onToggleReveal={() => toggleRevealed('current')}
          />
          <PasswordField
            label="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            hint="At least 6 characters."
            revealed={revealed.next}
            onToggleReveal={() => toggleRevealed('next')}
          />
          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            revealed={revealed.confirm}
            onToggleReveal={() => toggleRevealed('confirm')}
          />
          <button
            type="submit"
            disabled={passwordSaving || !confirmPassword.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Change password
          </button>
        </form>
      </section>

      <Modal
        open={confirmingPassword}
        onClose={() => {
          if (!passwordSaving) setConfirmingPassword(false);
        }}
        title="Change your password?"
        size="sm"
        closeOnBackdrop={!passwordSaving}
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmingPassword(false)}
              disabled={passwordSaving}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Go back
            </button>
            <button
              type="button"
              onClick={savePassword}
              disabled={passwordSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {passwordSaving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              Yes, change password
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          You will stay logged in on this device. Use the new password the next time you log in.
        </p>
      </Modal>
    </div>
  );
}
