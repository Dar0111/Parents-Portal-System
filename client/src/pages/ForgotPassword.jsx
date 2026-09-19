import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import extractError from '../api/extractError';
import FormStatus, { ok, fail } from '../components/FormStatus';
import FormField from '../components/FormField';
import PasswordField from '../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../components/PasswordChecklist';
import seal from '../assets/school-seal.png';

// Self-service password reset (R2, 2026-09-19). Two steps, ONE CARD, one
// route — POST /auth/forgot-password then POST /auth/reset-password.
//
// WHY ONE ROUTE AND NOT TWO. The login id typed in step one is the same one
// step two must send, and the only places to carry it between two routes are
// a URL, a query string or storage. A parent's login_id IS their child's LRN
// (§5c): it may not go in a URL or a query string, full stop. Component
// state is the only honest carrier, so the step is state, not a route. A
// refresh returns to step one, which is correct — a refreshed page has no
// code either, and the emailed one stays valid.
//
// THE RESPONSE TO STEP ONE IS THE SAME WHATEVER HAPPENS, and this page must
// not undo that. The server answers 202 with one sentence for a verified
// account, an unverified one, an unknown login id, a rate-limited account
// and its own internal failure alike, because a parent's login id is their
// child's LRN and an endpoint that said "no such account" would be an LRN
// oracle. So: no branch here on whether a code was really sent, no "check
// your inbox for <address>", and the step advances on 202 regardless. The
// only 400 step one can return describes the REQUEST (a blank field), never
// the account.
//
// STEP TWO'S FAILURE MESSAGE IS EQUALLY FLAT — "That code is not valid.
// Request a new one." covers wrong, expired, already used, too many
// attempts and an ineligible account, and there is deliberately no count of
// tries remaining. Do not add one, and do not translate the message into a
// friendlier guess about which cause it was.
//
// The password rule is checked before the code server-side, so a weak
// password does not burn an attempt; that 400 carries field "new_password"
// and lands under the field. Everything else goes to FormStatus under the
// button (§7c).
export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState('request');
  const [loginId, setLoginId] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revealed, setRevealed] = useState({ next: false, confirm: false });
  const [newError, setNewError] = useState(null);
  const [sentNotice, setSentNotice] = useState('');
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirmError(newPassword, confirmPassword);
  const resetReady = /^\d{6}$/.test(code) && passwordFormReady(newPassword, confirmPassword);

  function toggleRevealed(key) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function requestCode(event) {
    event.preventDefault();
    if (!loginId.trim()) return;
    setStatus(null);
    setSubmitting(true);
    try {
      const message = await api.post(
        '/auth/forgot-password',
        { login_id: loginId.trim() },
        { unwrap: 'message' }
      );
      // The server's own sentence, verbatim — it is written to be true
      // whether or not an email went out.
      setSentNotice(message);
      setStep('reset');
    } catch (err) {
      setStatus(fail(extractError(err)));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReset(event) {
    event.preventDefault();
    if (!resetReady) return;
    setStatus(null);
    setNewError(null);
    setSubmitting(true);
    try {
      await api.post(
        '/auth/reset-password',
        { login_id: loginId.trim(), code: code.trim(), new_password: newPassword },
        { unwrap: 'message' }
      );
      // Straight to sign-in rather than a success screen with a link: there
      // is nothing else to do here, and the new password is fresh in mind.
      navigate('/login', { replace: true });
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'new_password') setNewError(extractError(err));
      else setStatus(fail(extractError(err)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-dots flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-seal-bg">
            <img
              src={seal}
              alt="Captain H. Francisco Elementary School seal"
              width="168"
              height="168"
              className="h-18 w-18 rounded-full"
            />
          </div>
          <h1 className="text-lg font-semibold text-fg">Reset your password</h1>
        </div>

        <div className="rounded-2xl border border-edge bg-surface p-8 shadow-xl">
          {step === 'request' ? (
            <form onSubmit={requestCode} className="space-y-4">
              <p className="text-sm text-fg-muted">
                Enter your Login ID. If the account has a confirmed email address, we will send a
                six-digit code to it.
              </p>
              <FormField
                label="Login ID"
                hint="Parents: use your child's LRN. Teachers and staff: your assigned ID."
                required
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
              />
              <button
                type="submit"
                disabled={submitting || !loginId.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <i className="fa-solid fa-circle-notch fa-spin" />}
                {submitting ? 'Sending…' : 'Send code'}
              </button>
              <FormStatus status={status} />
            </form>
          ) : (
            <form onSubmit={submitReset} className="space-y-4">
              {/* The server's uniform sentence, not a claim that a code is in
                  a particular inbox. */}
              <FormStatus status={ok(sentNotice)} />
              <p className="text-sm text-fg-muted">
                The code is good for a short time and can be used once. Enter it with your new
                password.
              </p>
              <FormField
                label="Six-digit code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
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
                disabled={submitting}
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
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={submitting || !resetReady}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <i className="fa-solid fa-circle-notch fa-spin" />}
                {submitting ? 'Saving…' : 'Set new password'}
              </button>
              <FormStatus status={status} />
              <button
                type="button"
                onClick={() => {
                  setStep('request');
                  setCode('');
                  setStatus(null);
                  setNewError(null);
                }}
                className="text-sm font-medium text-brand underline-offset-2 hover:underline"
              >
                Use a different Login ID
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-fg-muted">
          <Link to="/login" className="font-medium text-brand underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>

        {/* The fallback, and it is the whole reason the admin temporary
            password exists: an account with no confirmed email cannot be
            reset from this page, and gets no hint here that it is the
            reason — that would be the oracle again. The office is the
            answer either way. */}
        <p className="mt-2 text-center text-sm text-fg-muted">
          No email on your account? Ask your child&rsquo;s adviser or the school office.
        </p>
      </div>
    </div>
  );
}
