import { View } from 'react-native';
import { resendLabel } from '../auth/accountSteps';
import Button from './Button';
import FormField from './FormField';

// THE CODE HALF OF A CONFIRMATION — the phone twin of the web's
// components/ContactCodeForm.jsx (feat/first-signin, 2026-10-18): the 6-digit
// field, Confirm, and "Resend code" counting down the server's 60-second
// cooldown (hooks/useCooldown.js, mirrored). Shared by ConfirmContactScreen
// and Settings → Account information. Presentational: the caller owns the
// code, the error, the busy flag and both requests. The words come from the
// mirrored auth/accountSteps.js, so both clients say the same thing.
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
  // Settings keeps its ONE filled button (Save contact number), so it passes
  // the bordered and ghost variants here; the first-sign-in step fills Confirm.
  confirmVariant = 'primary',
  resendVariant = 'secondary',
  size = 'md',
  full = false,
}) {
  const ready = /^\d{6}$/.test(code);
  return (
    <View className="gap-4">
      <FormField
        label="6-digit code"
        value={code}
        onChangeText={(text) => onCodeChange(text.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        hint={hint}
        error={error}
        editable={!busy}
      />
      <View className={full ? 'gap-2' : 'flex-row flex-wrap gap-2'}>
        <Button variant={confirmVariant} size={size} full={full} loading={busy} disabled={busy || !ready} onPress={onSubmit}>
          {busy ? 'Confirming…' : confirmLabel}
        </Button>
        <Button variant={resendVariant} size={size} full={full} disabled={busy || remaining > 0} onPress={onResend}>
          {resendLabel(remaining)}
        </Button>
      </View>
    </View>
  );
}
