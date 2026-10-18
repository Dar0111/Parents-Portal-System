import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import extractError from '../api/extractError';
import { useAuth } from '../auth/AuthContext';
import {
  RESEND_COOLDOWN_SECONDS,
  contactCopy,
  defaultChannel,
  formatCountdown,
  nextStep,
  sentToLine,
  spacedNumber,
} from '../auth/accountSteps';
import { entryPath } from '../auth/stepPath';
import Button from '../components/Button';
import { cardClass, linkClass } from '../components/buttonClass';
import ContactCodeForm from '../components/ContactCodeForm';
import FormField from '../components/FormField';
import FormStatus, { fail } from '../components/FormStatus';
import { contactError, normalizeContact } from '../format/contactRule';
import useCooldown from '../hooks/useCooldown';
import Reveal from '../motion/Reveal';
import seal from '../assets/school-seal.png';

// THE CONTACT STEP (feat/first-signin, 2026-10-18; the owner's scope item 2;
// FRONTEND §29). The second of the three steps before the app: every account
// with no confirmed Gmail and no confirmed mobile number, and a forced change
// on an account that has one but has not used it since this sign-in (D2 —
// "Confirm it's you"). The account picks Gmail OR a mobile number — one is
// enough — and types the 6-digit code sent to it.
//
// THE SAME SHAPE AS THE OTHER TWO STEPS: top-level, outside Shell and outside
// ProtectedRoute (which sends people here on `contact_pending` from /auth/me,
// never on the CONTACT_VERIFICATION_REQUIRED 403 — §2). No Back and no Skip:
// the only way off is Sign out, which changes nothing — the step is still due
// at the next sign-in. Browser Back lands on a route ProtectedRoute sends
// straight back here.
//
// THE VALUE IS THE ACCOUNT'S OWN TO SET. A different address goes through
// PUT /auth/email, a different number through PUT /auth/contact — each
// unconfirms what it changed — and then the verify request sends the code.
// A value already on the account is shown with "Change", so nobody sends a
// code to an address they cannot open (a seeded one, an old one).
//
// THE RESEND COOLDOWN is the server's (60 s, a 429 with `retry_after`); this
// page counts it down per channel and never decides it. A 429 for the HOUR
// carries no `retry_after` and its sentence names the other channel.
//
// §5b: what the step says is stored — the value on file, "already confirmed" —
// comes from the last /auth/me; the inputs write drafts only.
export default function ConfirmContact() {
  const { user, loading, logout, refresh } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl text-fg-faint" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // Nobody reaches this screen unless the contact is the next step, and
  // nobody stays on it once the server says it is done.
  if (nextStep(user) !== 'contact') return <Navigate to={entryPath(user)} replace />;

  async function onConfirmed() {
    const me = await refresh();
    navigate(entryPath(me), { replace: true });
  }

  return (
    <div className="page-dots flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-sm">
        {/* The seal on its `seal-bg` disc, `rounded-full` on the image (§9). */}
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
          <ContactStep user={user} refresh={refresh} onConfirmed={onConfirmed} />
        </Reveal>

        {/* The one way off this step, and it changes nothing. 44px tall. */}
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

const CHANNELS = [
  { key: 'email', label: 'Gmail' },
  { key: 'mobile', label: 'Mobile number' },
];

function storedValue(user, channel) {
  return (channel === 'email' ? user?.email : user?.contact_number) || '';
}

// Two native radios drawn as the control-radius segments (§27f): the arrow
// keys move between them, and the choice is the filled one AND the heavier
// face — never colour alone.
function ChannelChoice({ value, onChange, disabled }) {
  return (
    <fieldset className="grid grid-cols-2 gap-2" disabled={disabled}>
      <legend className="sr-only">Where to send the code</legend>
      {CHANNELS.map((c) => (
        <label key={c.key} className="relative cursor-pointer">
          <input
            type="radio"
            name="contact-channel"
            value={c.key}
            checked={value === c.key}
            onChange={() => onChange(c.key)}
            className="peer sr-only"
          />
          <span className="flex min-h-11 items-center justify-center rounded-lg border border-edge-strong bg-surface px-3 text-sm text-fg-body peer-checked:border-primary peer-checked:bg-primary peer-checked:font-semibold peer-checked:text-primary-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-accent">
            {c.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

// The step's card. Exported so scripts/ssr-first-signin.jsx can render its
// states; `refresh` and `onConfirmed` are AuthContext's re-read and the page's
// exit.
export function ContactStep({ user, refresh, onConfirmed }) {
  const copy = contactCopy(user);
  const [channel, setChannel] = useState(() => defaultChannel(user));
  const [drafts, setDrafts] = useState(() => ({ email: user?.email || '', mobile: user?.contact_number || '' }));
  // A value already on the account shows read-only with "Change"; an empty
  // one opens as an input.
  const [editing, setEditing] = useState(() => ({ email: !user?.email, mobile: !user?.contact_number }));
  const [phase, setPhase] = useState('enter');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [fieldError, setFieldError] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const emailClock = useCooldown();
  const mobileClock = useCooldown();
  const clock = channel === 'email' ? emailClock : mobileClock;

  const stored = storedValue(user, channel);
  const draft = drafts[channel];
  const showInput = editing[channel] || !stored;

  function pick(next) {
    setChannel(next);
    setFieldError(null);
    setStatus(null);
  }

  function change() {
    setPhase('enter');
    setEditing((prev) => ({ ...prev, [channel]: true }));
    setCode('');
    setCodeError(null);
    setStatus(null);
  }

  async function sendCode() {
    setStatus(null);
    setFieldError(null);
    setCodeError(null);
    const value = (showInput ? draft : stored).trim();
    if (!value) {
      setFieldError(channel === 'email' ? 'Enter your email address.' : 'Enter your mobile number.');
      return;
    }
    if (channel === 'mobile') {
      const problem = contactError(value);
      if (problem) {
        setFieldError(problem);
        return;
      }
    }
    const target = channel === 'mobile' ? normalizeContact(value) : value;
    setBusy(true);
    try {
      // A new value is SAVED first (and so unconfirmed); then the code goes to
      // it. The re-read keeps "on file" the server's, not the draft (§5b).
      if (target !== stored) {
        if (channel === 'email') await api.put('/auth/email', { email: value }, { unwrap: 'user' });
        else await api.put('/auth/contact', { contact_number: value }, { unwrap: 'user' });
        await refresh();
        setEditing((prev) => ({ ...prev, [channel]: false }));
      }
      const path = channel === 'email' ? '/auth/verify-email/request' : '/auth/verify-contact/request';
      const message = await api.post(path, {}, { unwrap: 'message' });
      // The already-confirmed 200 sent nothing — the step may simply be done.
      if (/already confirmed/i.test(message)) {
        await onConfirmed();
        return;
      }
      setSentTo(target);
      setCode('');
      setPhase('code');
      clock.start(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const data = err?.response?.data;
      if (data?.field === 'email' || data?.field === 'contact_number') {
        setFieldError(extractError(err));
      } else {
        // The cooldown's 429 carries the seconds left; the hour's does not.
        if (err?.response?.status === 429 && Number(data?.retry_after) > 0) clock.start(Number(data.retry_after));
        setStatus(fail(extractError(err)));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code) || busy) return;
    setStatus(null);
    setCodeError(null);
    setBusy(true);
    try {
      const path = channel === 'email' ? '/auth/verify-email/confirm' : '/auth/verify-contact/confirm';
      await api.post(path, { code }, { unwrap: 'message' });
      await onConfirmed();
    } catch (err) {
      // One flat message for a wrong, expired or used code — under the field.
      setCodeError(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  const label = channel === 'email' ? 'Gmail' : 'Mobile number';

  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-bold text-fg">{copy.title}</h1>
        <p className="mt-2 text-sm text-fg-muted">{copy.intro}</p>
      </div>

      {phase === 'enter' ? (
        <form
          className="space-y-4 [&_input]:min-h-12 [&_input]:text-base"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && clock.remaining === 0) sendCode();
          }}
        >
          <ChannelChoice value={channel} onChange={pick} disabled={busy} />
          {showInput ? (
            <FormField
              key={channel}
              label={label}
              type={channel === 'email' ? 'email' : 'tel'}
              inputMode={channel === 'email' ? 'email' : 'tel'}
              autoComplete={channel === 'email' ? 'email' : 'tel'}
              value={draft}
              onChange={(e) => {
                setFieldError(null);
                const next = e.target.value;
                setDrafts((prev) => ({ ...prev, [channel]: next }));
              }}
              hint={
                channel === 'email'
                  ? 'Use an address you can open now — a Gmail works.'
                  : 'A Philippine mobile number, for example 0917 123 4567.'
              }
              error={fieldError}
              disabled={busy}
            />
          ) : (
            <div className="rounded-lg border border-edge bg-surface-subtle px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-sm text-fg [overflow-wrap:anywhere]">
                  {channel === 'mobile' ? spacedNumber(stored) : stored}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing((prev) => ({ ...prev, [channel]: true }))}
                  className={`${linkClass} inline-flex min-h-11 items-center text-sm`}
                  disabled={busy}
                >
                  Change
                </button>
              </div>
            </div>
          )}
          <Button variant="primary" size="lg" full type="submit" loading={busy} disabled={busy || clock.remaining > 0}>
            {busy ? 'Sending…' : clock.remaining > 0 ? `Send code in ${formatCountdown(clock.remaining)}` : 'Send code'}
          </Button>
          <FormStatus status={status} />
        </form>
      ) : (
        <div className="space-y-4 [&_input]:min-h-12 [&_input]:text-base">
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-fg-body">
            <p className="min-w-0 [overflow-wrap:anywhere]">{sentToLine(channel, sentTo)}</p>
            <button type="button" onClick={change} className={`${linkClass} inline-flex min-h-11 items-center`} disabled={busy}>
              Change
            </button>
          </div>
          <ContactCodeForm
            code={code}
            onCodeChange={(next) => {
              setCodeError(null);
              setCode(next);
            }}
            error={codeError}
            hint="It expires in 10 minutes and can be used once."
            busy={busy}
            onSubmit={confirm}
            onResend={sendCode}
            remaining={clock.remaining}
            size="lg"
            full
          />
          <FormStatus status={status} />
        </div>
      )}
    </>
  );
}
