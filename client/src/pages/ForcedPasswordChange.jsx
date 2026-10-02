import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import extractError from '../api/extractError';
import { useAuth } from '../auth/AuthContext';
import { roleHome } from '../auth/roles';
import Button from '../components/Button';
import { cardClass, linkClass } from '../components/buttonClass';
import FormStatus, { fail } from '../components/FormStatus';
import PasswordField from '../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../components/PasswordChecklist';
import Reveal from '../motion/Reveal';
import seal from '../assets/school-seal.png';

// The forced password change (R2, 2026-09-19). An admin who issues a
// temporary password sets users.must_change_password, and this is the only
// screen that account can reach until it picks its own.
//
// OUTSIDE Shell, AND OUTSIDE ProtectedRoute, deliberately. Shell would draw
// the sidebar — a nav full of links to pages the server will refuse with
// `code: 'MUST_CHANGE_PASSWORD'`, which is an interface that lies. And
// ProtectedRoute is what sends people HERE, so wrapping this route in it is
// the redirect loop. The three guards ProtectedRoute would have applied are
// spelled out below instead, which is four lines and no cycle.
//
// IT STILL SENDS current_password, because the endpoint still requires it
// and should: the temporary password is a credential the account holder was
// given out of band, and typing it back is what proves the person at the
// keyboard is the one the office handed it to, not someone who found a
// logged-in phone. The label says "Temporary password" rather than "Current
// password" because that is the one they were given.
//
// THE REPLACEMENT TOKEN IS THE WHOLE EXIT. R1 bumps token_version on this
// write, which kills the token this page is holding; applyToken stores the
// replacement and re-reads /auth/me, and the flag coming back as 0 from the
// SERVER — never assumed locally — is what lets the redirect below fire.
// /me and /change-password are the two routes middleware/auth.js allows
// while the flag is set, so both calls in that sequence are permitted.
//
// THE FRAME IS THE SIGNED-OUT FAMILY'S (feat/ui-refresh, 2026-10-02), the
// same as ForgotPassword: the seal and the wordmark in a small row above one
// centred card on the dot grid, the page's single <h1> and its sentence at
// the top of the card, 48px controls (set from the <form>, `[&_input]:…`,
// because PasswordField takes no class) and the same submit as Login.
export default function ForcedPasswordChange() {
  const { user, loading, logout, applyToken } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revealed, setRevealed] = useState({ current: false, next: false, confirm: false });
  const [currentError, setCurrentError] = useState(null);
  const [newError, setNewError] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const currentRef = useRef(null);

  const mismatch = confirmError(newPassword, confirmPassword);
  const ready = Boolean(currentPassword) && passwordFormReady(newPassword, confirmPassword);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl text-fg-faint" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // Nobody reaches this screen without the flag, and nobody stays on it once
  // the flag clears — including the person who just cleared it.
  if (!user.must_change_password) return <Navigate to={roleHome(user.role)} replace />;

  function toggleRevealed(key) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!ready) return;
    setStatus(null);
    setCurrentError(null);
    setNewError(null);
    setSaving(true);
    try {
      // Multi-key unwrap: the token is not optional here. If the server ever
      // stopped returning it, this must fail loudly at the call site rather
      // than silently leave a dead token in storage and 401 on the next
      // request (§1).
      const { token } = await api.put(
        '/auth/change-password',
        { current_password: currentPassword, new_password: newPassword },
        { unwrap: ['message', 'token'] }
      );
      const me = await applyToken(token);
      navigate(roleHome(me.role), { replace: true });
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'current_password') {
        setCurrentError(extractError(err));
        currentRef.current?.focus();
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
    <div className="page-dots flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-sm">
        {/* The seal always sits on its `seal-bg` disc with `rounded-full` on
            the image (§9). No halo here: the halo's ring colour is the brand
            panel's and this row is on the page background. */}
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

        {/* `rounded-3xl` after cardClass's `rounded-2xl`: Tailwind emits the
            two in name order, so the larger radius is the later rule. */}
        <Reveal className={`${cardClass} rounded-3xl p-6`}>
          <div className="mb-5">
            <h1 className="font-serif text-2xl font-bold text-fg">Choose a new password</h1>
            {/* A name can be one long unbroken word; it wraps rather than
                widening the card. */}
            <p className="mt-2 text-sm text-fg-muted [overflow-wrap:anywhere]">
              {user.name}, the school gave this account a temporary password. Pick your own before
              you continue.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4 [&_input]:min-h-12 [&_input]:text-base">
            <PasswordField
              label="Temporary password"
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
            {/* No confirmation step (§5e): the account cannot do anything
                else until this is done, so there is nothing to protect the
                user from changing their mind about. */}
            <Button variant="primary" size="lg" full type="submit" loading={saving} disabled={!ready}>
              {saving ? 'Saving…' : 'Save and continue'}
            </Button>
            <FormStatus status={status} />
          </form>
        </Reveal>

        {/* The one way off this screen, and it changes nothing: logout is
            client-side only, so the flag is still set at the next sign-in.
            A text button, 44px tall. */}
        <p className="mt-4 text-center text-sm">
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
            className={`${linkClass} inline-flex min-h-11 items-center`}
          >
            Sign out instead
          </button>
        </p>
      </div>
    </div>
  );
}
