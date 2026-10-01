// THE NEW-MESSAGE TOAST'S DECISIONS (feat/message-toast, 2026-10-02).
//
// Pure — no React, no DOM, no React Native — and mirrored byte for byte to
// mobile/src/realtime/messageToast.js (lint:mirrors). The two hosts (web
// MessageToast.jsx, phone MessageToast.jsx) only render what this decides.
//
// THE OWNER'S RULES, and where each one is enforced here:
//   1. "New message from <name>", NEVER any part of the body. Nothing in this
//      file takes a message body — the host passes the sender's id only.
//   3. Several from the same person: one toast, "<n> new messages from <name>".
//      THE COUNT IS THE SERVER'S (§10: a count is never client arithmetic):
//      `unread_count` from GET /messages/conversations, the row the Unread
//      provider already re-reads on every `new_message`. So n is "unread from
//      this person", which can include one that arrived before the toast.
//   4. Different people: the newest replaces — one toast, never a stack.
//   5. Never for my own message, never while I am in that conversation.
// The name also comes from that row (`other_user_name`): the live
// `new_message` event is a bare messages row and carries no name.

// How long a toast stays up (owner rule 2). The web pauses it while hovered
// or focused; a new message (same sender or another) starts it again.
export const TOAST_MS = 5000;

// THE MESSAGE TONE — ONE DEFINITION FOR BOTH PLATFORMS (fix round,
// 2026-10-02; the owner's final values). The web plays it through the Web
// Audio API (realtime/messageTone.js); the phone plays a WAV generated from
// these same numbers (mobile/scripts/make-message-tone.mjs reads this mirror).
// It sounds on a toast SHOW or UPDATE only — `nextToast(...).changed`.
export const TONE = Object.freeze({ freqHz: 880, durationMs: 150, fadeMs: 10, gain: 0.3 });

// The words, and only these words.
export function toastLabel(name, count) {
  const n = Number(count);
  return n > 1 ? `${n} new messages from ${name}` : `New message from ${name}`;
}

// The conversation row for one person, from GET /messages/conversations.
export function rowFor(conversations, senderId) {
  const id = Number(senderId);
  if (!Array.isArray(conversations) || !id) return null;
  return conversations.find((row) => Number(row?.other_user_id) === id) || null;
}

// WEB: whose conversation is open? A Messages URL's :userId is the OTHER
// person's user id, not a conversation id (App.jsx: messages/:userId).
// The list page and every other page are null.
export function otherIdFromPath(pathname) {
  const match = /^\/(teacher|parent)\/messages\/(\d+)\/?$/.exec(String(pathname || ''));
  return match ? Number(match[2]) : null;
}

// PHONE: the same question from React Navigation's state — walk to the
// FOCUSED leaf route; the thread is the `MessageThread` stack screen with
// `params.otherId` (the other person's user id) for both roles.
export function otherIdFromRoute(state) {
  let route = null;
  let node = state;
  while (node && Array.isArray(node.routes) && node.routes.length) {
    const index = Number.isInteger(node.index) ? node.index : node.routes.length - 1;
    route = node.routes[index];
    node = route?.state;
  }
  if (!route || route.name !== 'MessageThread') return null;
  const id = Number(route.params?.otherId);
  return id > 0 ? id : null;
}

// The decision. `current` is the toast on screen (or null). Returns the next
// toast and whether anything changed (a change restarts the timer). A
// skipped event leaves the current toast exactly as it is.
//   senderId        the new message's sender_id — never its body
//   selfId          the signed-in user's id
//   viewingOtherId  whose conversation is open (otherIdFromPath / FromRoute)
//   row             that sender's conversations row (rowFor), or null
export function nextToast(current, { senderId, selfId, viewingOtherId, row }) {
  const unchanged = { toast: current, changed: false };
  const id = Number(senderId);
  if (!id) return unchanged;
  if (id === Number(selfId)) return unchanged;
  if (viewingOtherId != null && id === Number(viewingOtherId)) return unchanged;
  const name = typeof row?.other_user_name === 'string' ? row.other_user_name.trim() : '';
  const count = Number(row?.unread_count);
  if (!name || !(count >= 1)) return unchanged;
  return {
    toast: {
      senderId: id,
      name,
      photo: row.other_user_profile_pic || null,
      count,
      label: toastLabel(name, count),
    },
    changed: true,
  };
}

// THE TOAST ON SCREEN, HELD IN ONE PLACE (fix round, 2026-10-02). Both hosts
// keep their toast here rather than in a ref they update by hand, so the
// value every decision reads is updated on EVERY change — a show, a
// same-sender update, a replace, the close button, the 5 s expiry and View —
// and can never be stale. `onChange(toast | null)` is the host's setState.
// `receive` returns `changed`: true is exactly a show or an update, which is
// when the alert (tone, and on the phone vibration) fires — once.
export function createToastStore(onChange) {
  let current = null;
  const set = (value) => {
    current = value;
    if (typeof onChange === 'function') onChange(value);
  };
  return {
    get: () => current,
    receive(ctx) {
      const next = nextToast(current, ctx);
      if (next.changed) set(next.toast);
      return next.changed;
    },
    clear() {
      if (current !== null) set(null);
    },
  };
}
