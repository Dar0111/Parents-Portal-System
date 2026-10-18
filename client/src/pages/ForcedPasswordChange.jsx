import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import extractError from '../api/extractError';
import { useAuth } from '../auth/AuthContext';
import { nextStep } from '../auth/accountSteps';
import { entryPath } from '../auth/stepPath';
import Button from '../components/Button';
import { cardClass, linkClass } from '../components/buttonClass';
import FormStatus, { fail } from '../components/FormStatus';
import PasswordField from '../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../components/PasswordChecklist';
import Reveal from '../motion/Reveal';
import seal from '../assets/school-seal.png';

// THE NEW PASSWORD — the last of the three steps before the app (R2,
// 2026-09-19; rebuilt for feat/first-signin, 2026-10-18). A new account, or
// one an admin gave a temporary password, chooses its own here.
//
// OUTSIDE Shell, AND OUTSIDE ProtectedRoute, deliberately. Shell would draw a
// nav full of pages the server refuses with `code: 'MUST_CHANGE_PASSWORD'`,
// and ProtectedRoute is what sends people HERE, so wrapping this route in it
// is the redirect loop. The page's own guard is nextStep(): only an account
// whose next step is the password stays.
//
// NO "TEMPORARY PASSWORD" FIELD ANY MORE (the owner's scope item 2). The
// temporary password was typed at sign-in, and the step before this one
// confirmed a Gmail or mobile number in THIS session — that code is the
// second proof. PUT /auth/first-password takes the new password alone and
// refuses it unless both are true (routes/auth.js has the guard).
//
// THE REPLACEMENT TOKEN IS THE WHOLE EXIT. The write bumps token_version,
// which kills the token this page is holding; applyToken stores the
// replacement and re-reads /auth/me, and the flag coming back as 0 from the
// SERVER — never assumed locally — is what lets the redirect below fire.
//
// THE FRAME IS THE SIGNED-OUT FAMILY'S (feat/ui-refresh, 2026-10-02): the seal
// and the wordmark above one centred card on the dot grid, 48px controls and
// the same submit as Login.
export default function ForcedPasswordChange() {
  const { user, loading, logout, applyToken } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revealed, setRevealed] = useState({ next: false, confirm: false });
  const [newError, setNewError] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const mismatch = confirmError(newPassword, confirmPassword);
  const ready = passwordFormReady(newPassword, confirmPassword);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl text-fg-faint" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // Nobody reaches this screen unless the password is the next step — an
  // account that still owes consent or the contact goes there first — and
  // nobody stays on it once the flag clears.
  if (nextStep(user) !== 'password') return <Navigate to={entryPath(user)} replace />;

  function toggleRevealed(key) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!ready || saving) return;
    setStatus(null);
    setNewError(null);
    setSaving(true);
    try {
      // Multi-key unwrap: the token is not optional here. If the server ever
      // stopped returning it, this must fail loudly at the call site rather
      // than silently leave a dead token in storage and 401 on the next
      // request (§1).
      const { token } = await api.put('/auth/first-password', { new_password: newPassword }, { unwrap: ['message', 'token'] });
      const me = await applyToken(token);
      navigate(entryPath(me), { replace: true });
    } catch (err) {
      if (err?.response?.data?.field === 'new_password') setNewError(extractError(err));
      else setStatus(fail(extractError(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-dots flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-sm">
        {/* The seal always sits on its `seal-bg` disc with `rounded-full` on
            the image (§9). */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-seal-bg">
            <img
              src={seal}
              alt="Captain H. Francisco Elementary School seal"
              width="168"
              height="168"
              className="h-11 w-11 rounded-full"
            />
          </div>
          <p className="font-serif text-lg font-bold text-fg">Parent&rsquo;s Portal</p>
        </div>

        <Reveal className={`${cardClass} rounded-3xl p-6`}>
          <NewPasswordBody
            userName={user.name}
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            onNewPassword={(value) => {
              setNewError(null);
              setNewPassword(value);
            }}
            onConfirmPassword={setConfirmPassword}
            revealed={revealed}
            onToggleReveal={toggleRevealed}
            newError={newError}
            mismatch={mismatch}
            ready={ready}
            saving={saving}
            status={status}
            onSubmit={submit}
          />
        </Reveal>

        {/* The one way off this screen, and it changes nothing: logout is
            client-side only, so the step is still due at the next sign-in. */}
        <p className="mt-4 text-center text-sm">
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
            className={`${linkClass} inline-flex min-h-11 items-center`}
          >
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}

// The card's content, with no data and no router — exported so
// scripts/ssr-first-signin.jsx can render it.
export function NewPasswordBody({
  userName,
  newPassword,
  confirmPassword,
  onNewPassword,
  onConfirmPassword,
  revealed,
  onToggleReveal,
  newError,
  mismatch,
  ready,
  saving,
  status,
  onSubmit,
}) {
  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-bold text-fg">Set a new password</h1>
        {/* A name can be one long unbroken word; it wraps rather than
            widening the card. */}
        <p className="mt-2 text-sm text-fg-muted [overflow-wrap:anywhere]">
          {userName}, choose your own password to finish signing in. The one you signed in with stops working.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 [&_input]:min-h-12 [&_input]:text-base">
        <PasswordField
          label="New password"
          value={newPassword}
          onChange={(e) => onNewPassword(e.target.value)}
          autoComplete="new-password"
          revealed={revealed.next}
          onToggleReveal={() => onToggleReveal('next')}
          error={newError}
          disabled={saving}
          below={<PasswordChecklist value={newPassword} />}
        />
        <PasswordField
          label="Confirm new password"
          value={confirmPassword}
          onChange={(e) => onConfirmPassword(e.target.value)}
          autoComplete="new-password"
          revealed={revealed.confirm}
          onToggleReveal={() => onToggleReveal('confirm')}
          error={mismatch}
          disabled={saving}
        />
        {/* No confirmation step (§5e): the account cannot do anything else
            until this is done, so there is nothing to protect the user from
            changing their mind about. */}
        <Button variant="primary" size="lg" full type="submit" loading={saving} disabled={!ready}>
          {saving ? 'Saving…' : 'Save password'}
        </Button>
        <FormStatus status={status} />
      </form>
    </>
  );
}
