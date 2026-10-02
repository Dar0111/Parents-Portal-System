import { useRef, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import Modal from '../../components/Modal';
import SectionHeader from '../../components/SectionHeader';
import PasswordField from '../../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../../components/PasswordChecklist';
import { useAuth } from '../../auth/AuthContext';

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
// it back.
//
// STAYING LOGGED IN IS NOW SOMETHING THIS PAGE DOES, not something the API
// leaves alone (R2, 2026-09-19). The comment here used to read "PUT
// /auth/change-password does not invalidate JWTs", and R1 made that false:
// the write bumps users.token_version and middleware/auth.js rejects every
// token carrying an older value — which is the point, because a password
// change has to kill the sessions the old password left open. The endpoint
// therefore returns a REPLACEMENT token at the new version, and the unwrap
// below takes it. Drop it and this page signs the user out of the tab they
// changed their password in.
//
// Multi-key unwrap, not raw: if the server ever stopped returning `token`,
// that must fail loudly here rather than leave a dead token in storage and
// 401 on the next request (§1).
//
// Show/hide is per field. Fields are never pre-filled and never shown as
// stored.
//
// NO RELOAD HERE (feat/ui-refresh): a write-only form shows no server data.
// One primary button on the screen — Change password — and one in its
// dialog; FormStatus stays directly under the button that caused it (§7c).

export default function ChangePasswordSection() {
  const { applyToken } = useAuth();
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
      const { message, token } = await api.put(
        '/auth/change-password',
        { current_password: currentPassword, new_password: newPassword },
        { unwrap: ['message', 'token'] }
      );
      // Before anything else that touches the API: the old token is already
      // dead server-side, so the next request on it would 401 and log the
      // user out on the success path.
      await applyToken(token);
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
      <SectionHeader
        title="Change password"
        description="You will stay logged in on this device. Use the new password the next time you log in."
      />

      <form onSubmit={requestChange} className="max-w-md space-y-4">
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
        <Button type="submit" variant="primary" disabled={saving || !ready}>
          Change password
        </Button>
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
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={saving}>
              Go back
            </Button>
            {/* `loading` is the old pair in one prop: disabled while saving,
                with the spinner in front of the unchanged label. */}
            <Button variant="primary" onClick={save} loading={saving}>
              Yes, change password
            </Button>
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
