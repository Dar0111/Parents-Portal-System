import { useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import Modal from '../../components/Modal';
import PasswordField from '../../components/PasswordField';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher account settings. Copied from Parent Settings, not a new page.
// Identity is locked. The only writes are PUT /auth/change-password and
// PUT /auth/contact.
//
// NEVER GET /api/settings — that is the school's key-value store
// (academic_year, school_name), admin-writable. NEVER PUT /api/users/:id
// — authorize('admin'), 403 "Access denied."
//
// Three sections, not two cards: locked identity + contact + password.
// Do not merge name / Teacher ID / email into the contact form.
// LOCKED: name, Teacher ID (user.login_id — this is TCH-001, not an LRN),
// email. Editable: contact. Password fields are never shown as stored.
//
// §5c: a teacher's login_id is a Teacher ID, not a child's LRN. Showing
// it here is not the parent Settings exception. Do not render student
// LRNs on this page. This route has no :id.
//
// Stay logged in after a successful password PUT. PUT /auth/change-password
// does not invalidate JWTs. Parent Settings does not call logout() either.
//
// §5b: the "current number" line renders user.contact_number from the last
// /auth/me (AuthContext). The input writes `draft` only. refresh() is the
// only writer of the stored value after a successful PUT.
// §5e: contact stays no-confirm — the stored number is on screen, so a
// wrong save is a visible one-click fix. Password gets an explicit
// confirmation that names the action. A warning sentence is not a
// confirmation step (convention 5e). The stored password is never shown,
// so a misclick while typing a test value is how the demo credential
// changes with nothing on screen to put it back. Parent Settings now
// matches this password UX (confirm modal, per-field show/hide, grey
// until Confirm). PasswordField lives in components/PasswordField.jsx
// (extracted when Teacher → Students became the third copy).
//
// Show/hide is per field, not one toggle for all three. Change password
// stays uncolored until Confirm new password has a value — the last
// field in the fill order. Current/New empty still fail validation if
// someone fills Confirm first.

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

export default function TeacherSettingsPage() {
  usePageTitle('Settings');
  const { user, refresh } = useAuth();

  const storedContact = user?.contact_number ?? '';
  // null = follow the last /auth/me value. A string means the teacher is
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
        <h2 className="text-sm font-semibold text-slate-900">Identity</h2>
        <p className="text-sm text-slate-500">
          Your name, Teacher ID, and email are school records. Ask the office if something is
          wrong. You can update your contact number and password below.
        </p>
        <dl className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 sm:grid-cols-2">
          <Field label="Name" value={user?.name} />
          <Field label="Teacher ID" value={user?.login_id} empty="—" />
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
