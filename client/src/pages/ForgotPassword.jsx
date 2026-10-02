import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import extractError from '../api/extractError';
import Button from '../components/Button';
import { cardClass, linkClass } from '../components/buttonClass';
import FormStatus, { ok, fail } from '../components/FormStatus';
import FormField from '../components/FormField';
import PasswordField from '../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../components/PasswordChecklist';
import Reveal from '../motion/Reveal';
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
//
// THE FRAME IS THE SIGNED-OUT FAMILY'S (feat/ui-refresh, 2026-10-02): the
// seal and the wordmark in a small row above one centred card on the dot
// grid, the page's single <h1> as the card's title, and the same 48px
// controls and submit as Login — the control height is set from each <form>
// (`[&_input]:…`) because PasswordField takes no class. The wordmark is a
// <p>, not a heading: this page's h1 is "Reset your password".
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
          <h1 className="mb-4 font-serif text-2xl font-bold text-fg">Reset your password</h1>
          {step === 'request' ? (
            <form onSubmit={requestCode} className="space-y-4 [&_input]:min-h-12 [&_input]:text-base">
              <p className="text-sm text-fg-muted">
                Enter your Login ID. If the account has a confirmed email address or mobile
                number, we will send a six-digit code to it.
              </p>
              <FormField
                label="Login ID"
                hint="Parents: use your child's LRN. Teachers and staff: your assigned ID."
                required
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
              />
              <Button
                variant="primary"
                size="lg"
                full
                type="submit"
                loading={submitting}
                disabled={!loginId.trim()}
              >
                {submitting ? 'Sending…' : 'Send code'}
              </Button>
              <FormStatus status={status} />
            </form>
          ) : (
            <form onSubmit={submitReset} className="space-y-4 [&_input]:min-h-12 [&_input]:text-base">
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
              <Button
                variant="primary"
                size="lg"
                full
                type="submit"
                loading={submitting}
                disabled={!resetReady}
              >
                {submitting ? 'Saving…' : 'Set new password'}
              </Button>
              <FormStatus status={status} />
              {/* A text button, centred under the submit and 44px tall — the
                  quiet way back to step one, never a second filled button. */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep('request');
                    setCode('');
                    setStatus(null);
                    setNewError(null);
                  }}
                  className={`${linkClass} inline-flex min-h-11 items-center text-sm`}
                >
                  Use a different Login ID
                </button>
              </div>
            </form>
          )}
        </Reveal>

        <p className="mt-4 text-center text-sm">
          <Link to="/login" className={`${linkClass} inline-flex min-h-11 items-center gap-2`}>
            <i aria-hidden="true" className="fa-solid fa-arrow-left text-xs" />
            Back to sign in
          </Link>
        </p>

        {/* The fallback, and it is the whole reason the admin temporary
            password exists: an account with no confirmed email or mobile
            number cannot be reset from this page, and gets no hint here
            that it is the reason — that would be the oracle again. The
            office is the answer either way. */}
        <p className="text-center text-sm text-fg-muted">
          No confirmed email or mobile number on your account? Ask your child&rsquo;s adviser or the
          school office.
        </p>
      </div>
    </div>
  );
}
