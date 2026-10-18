// THE THREE STEPS BEFORE THE APP (feat/first-signin, 2026-10-18; FRONTEND §29,
// MOBILE M26). The server's order — server/utils/accountGates.js — is:
//
//   1. consent    the current Data Privacy Notice and Terms of Use
//   2. contact    a confirmed Gmail or mobile number
//   3. password   the forced change: a new account, or an admin temporary
//                 password, sets its own password
//
// Routed on /auth/me's three fields, NEVER on the 403s they back up (§2): the
// web's ProtectedRoute and the phone's RootNavigator both ask nextStep(), so
// the two clients cannot order the steps differently from each other or from
// the server.
//
// MIRRORED BYTE FOR BYTE to mobile/src/auth/accountSteps.js (lint:mirrors):
// the copy of the contact step lives here too, so the two screens say the same
// words.

export const STEPS = ['consent', 'contact', 'password'];

// 'consent' | 'contact' | 'password' | null (nothing left: the app).
export function nextStep(user) {
  if (!user) return null;
  if (user.policy_pending) return 'consent';
  if (user.contact_pending) return 'contact';
  if (user.must_change_password) return 'password';
  return null;
}

// The server's resend cooldown (server/utils/authCodes.js RESEND_COOLDOWN_SECONDS):
// a new code only a minute after the last. The server enforces it; the clients
// count it down so the button says so before anyone presses it.
export const RESEND_COOLDOWN_SECONDS = 60;

// "0:59", "1:00" — the clock on a Resend button.
export function formatCountdown(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function resendLabel(remaining) {
  return remaining > 0 ? `Resend code in ${formatCountdown(remaining)}` : 'Resend code';
}

// The contact step's two faces: 'add' for an account with nothing confirmed,
// 'reconfirm' for a forced change on an account that already has a confirmed
// contact (decision D2 — the temporary password, then a code).
export const CONTACT_COPY = {
  add: {
    title: 'Confirm your contact',
    intro:
      'Choose your Gmail or your mobile number. We’ll send a 6-digit code to it. One is enough — you can add the other later in Settings.',
  },
  reconfirm: {
    title: 'Confirm it’s you',
    intro: 'Before you set a new password, we’ll send a 6-digit code to your confirmed Gmail or mobile number.',
  },
};

export function contactCopy(user) {
  return CONTACT_COPY[user?.contact_step === 'reconfirm' ? 'reconfirm' : 'add'];
}

// The stored number (always 09XXXXXXXXX) read as 0917 123 4567. Display only
// (§5d) — what is sent, stored and compared is never the spaced form.
export function spacedNumber(value) {
  return /^09\d{9}$/.test(value || '') ? `${value.slice(0, 4)} ${value.slice(4, 7)} ${value.slice(7)}` : value || '';
}

export function sentToLine(channel, value) {
  return `We sent a 6-digit code to ${channel === 'mobile' ? spacedNumber(value) : value}.`;
}

// Which channel the step opens on: for a reconfirm, the one that is confirmed
// (the email first); otherwise the email if the account has one, then the
// number, then the email for a fresh account.
export function defaultChannel(user) {
  const emailConfirmed = Boolean(user?.email && user?.email_verified_at);
  const numberConfirmed = Boolean(user?.contact_number && user?.contact_verified_at);
  if (user?.contact_step === 'reconfirm') {
    if (emailConfirmed) return 'email';
    if (numberConfirmed) return 'mobile';
  }
  if (user?.email) return 'email';
  if (user?.contact_number) return 'mobile';
  return 'email';
}
