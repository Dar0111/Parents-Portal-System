import { resendLabel } from '../auth/accountSteps';
import Button from './Button';
import FormField from './FormField';

// THE CODE HALF OF A CONFIRMATION (feat/first-signin, 2026-10-18): the 6-digit
// field, its Confirm button, and "Resend code" counting down the server's
// 60-second cooldown (hooks/useCooldown.js). Shared by the first-sign-in step
// (pages/ConfirmContact.jsx) and Settings → Account information, so the two
// say the same words and count the same clock.
//
// Presentational: the caller owns the code, the error, the busy flag and both
// requests. The error sits under the field — one flat message for a wrong,
// expired or used code, as the server sends it. Resend stays disabled while
// the clock runs, and the label says how long.
export default function ContactCodeForm({
  code,
  onCodeChange,
  error,
  hint,
  busy = false,
  onSubmit,
  onResend,
  remaining = 0,
  confirmLabel = 'Confirm',
  size = 'md',
  full = false,
}) {
  const ready = /^\d{6}$/.test(code);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormField
        label="6-digit code"
        value={code}
        onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        hint={hint}
        error={error}
      />
      <div className={full ? 'space-y-2' : 'flex flex-wrap items-center gap-2'}>
        <Button type="submit" variant="primary" size={size} full={full} loading={busy} disabled={busy || !ready}>
          {busy ? 'Confirming…' : confirmLabel}
        </Button>
        <Button size={size} full={full} onClick={onResend} disabled={busy || remaining > 0}>
          {resendLabel(remaining)}
        </Button>
      </div>
    </form>
  );
}
