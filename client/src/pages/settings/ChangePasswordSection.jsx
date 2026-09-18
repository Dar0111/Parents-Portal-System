import { useRef, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import Modal from '../../components/Modal';
import PasswordField from '../../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../../components/PasswordChecklist';

// Settings → Change password, all three roles. The one write is
// PUT /auth/change-password; the rule it enforces (at least 8 characters and
// at least one number, server/utils/passwordRule.js) is mirrored by the live
// checklist under New password (format/passwordRule.js), and Change password
// stays disabled until every rule passes and Confirm matches.
//
// A refused CURRENT password renders under the Current password field with a
// red border, and focus moves there — the server's 403 carries
// field "current_password" (Branch A), so this is a key check, not a string
// match. NO live or on-blur check of the current password: it is sent once,
// on submit (Darryl, 2026-09-18). A rule refusal the client somehow let
// through (field "new_password") lands under New password the same way;
// anything else — offline, 500 — goes to FormStatus under the button (§7c).
//
// §5e: the confirmation Modal stays (matched Teacher and Parent Settings,
// 2026-09-10) — the stored password is never on screen, so a misclick while
// typing a test value is how a demo credential changes with nothing to put
// it back. Stay logged in after success: PUT /auth/change-password does not
// invalidate JWTs.
//
// Show/hide is per field. Fields are never pre-filled and never shown as
// stored.

export default function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revealed, setRevealed] = useState({ current: false, next: false, confirm: false });
  const [currentError, setCurrentError] = useState(null);
  const [newError, setNewError] = useState(null);
  const [status, setStatus] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentRef = useRef(null);

  const mismatch = confirmError(newPassword, confirmPassword);
  const ready = Boolean(currentPassword) && passwordFormReady(newPassword, confirmPassword);

  function toggleRevealed(key) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function requestChange(event) {
    event.preventDefault();
    if (!ready) return;
    setStatus(null);
    setCurrentError(null);
    setNewError(null);
    setConfirming(true);
  }

  async function save() {
    setSaving(true);
    try {
      const message = await api.put(
        '/auth/change-password',
        { current_password: currentPassword, new_password: newPassword },
        { unwrap: 'message' }
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setRevealed({ current: false, next: false, confirm: false });
      setConfirming(false);
      setStatus(ok(message));
    } catch (err) {
      setConfirming(false);
      const field = err?.response?.data?.field;
      if (field === 'current_password') {
        setCurrentError(extractError(err));
        // Focus after the modal has closed and the field is enabled again.
        setTimeout(() => currentRef.current?.focus(), 0);
      } else if (field === 'new_password') {
        setNewError(extractError(err));
      } else {
        setStatus(fail(extractError(err)));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-fg">Change password</h2>
        <p className="mt-1 text-sm text-fg-muted">
          You will stay logged in on this device. Use the new password the next time you log in.
        </p>
      </div>

      <form onSubmit={requestChange} className="max-w-md space-y-3">
        <PasswordField
          label="Current password"
          value={currentPassword}
          onChange={(e) => {
            setCurrentError(null);
            setCurrentPassword(e.target.value);
          }}
          autoComplete="current-password"
          revealed={revealed.current}
          onToggleReveal={() => toggleRevealed('current')}
          error={currentError}
          inputRef={currentRef}
          disabled={saving}
        />
        <PasswordField
          label="New password"
          value={newPassword}
          onChange={(e) => {
            setNewError(null);
            setNewPassword(e.target.value);
          }}
          autoComplete="new-password"
          revealed={revealed.next}
          onToggleReveal={() => toggleRevealed('next')}
          error={newError}
          disabled={saving}
          below={<PasswordChecklist value={newPassword} />}
        />
        <PasswordField
          label="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          revealed={revealed.confirm}
          onToggleReveal={() => toggleRevealed('confirm')}
          error={mismatch}
          disabled={saving}
        />
        <button
          type="submit"
          disabled={saving || !ready}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Change password
        </button>
        <FormStatus status={status} />
      </form>

      <Modal
        open={confirming}
        onClose={() => {
          if (!saving) setConfirming(false);
        }}
        title="Change your password?"
        size="sm"
        closeOnBackdrop={!saving}
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={saving}
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
            >
              Go back
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:opacity-60"
            >
              {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              Yes, change password
            </button>
          </>
        }
      >
        <p className="text-sm text-fg-body">
          You will stay logged in on this device. Use the new password the next time you log in.
        </p>
      </Modal>
    </div>
  );
}
