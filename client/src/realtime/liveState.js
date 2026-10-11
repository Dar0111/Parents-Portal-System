// WHEN THE "LIVE UPDATES PAUSED" STRIP SHOWS (fix/socket-handshake fix round,
// R4, 2026-10-11).
//
// Pure — no React, no DOM, no React Native — and mirrored byte for byte to
// mobile/src/realtime/liveState.js (lint:mirrors). Each SocketProvider feeds
// it the socket's events; each LiveStatus shows the strip only when it says
// `paused`.
//
// THE CHANNEL STARTS CONNECTING, NOT PAUSED. Both providers began with
// `connected` false, so the strip showed from the moment the frame mounted
// until the first `connect` — on every reload, on the web and the phone,
// though nothing had failed (the owner's device check: captured on the
// admin's dashboard; the handshake itself admitted every attempt). It is
// PAUSED only after a real failure — a failed attempt (`connect_error`) or a
// lost connection (`disconnect`) — or when the FIRST connect has not arrived
// within FIRST_CONNECT_GRACE_MS. The grace is what keeps an unreachable
// server honest: a refused port fails at once, but a host that does not
// answer would otherwise wait for socket.io's own 20 s connect timeout.
//
// §5g is unchanged: the strip's words and its Refresh are the same, and it
// still says so whenever the channel has failed. Only "not yet" stopped
// reading as "failed".

export const FIRST_CONNECT_GRACE_MS = 3000;

// 'connecting' — the first attempt is under way; no strip.
// 'live'       — connected.
// 'paused'     — a failed attempt, a lost connection, or the grace ran out.
export const INITIAL_LIVE_STATE = 'connecting';

export function nextLiveState(state, event) {
  switch (event) {
    case 'connect':
      return 'live';
    case 'connect_error':
    case 'disconnect':
      return 'paused';
    case 'grace':
      return state === 'connecting' ? 'paused' : state;
    case 'reset':
      return INITIAL_LIVE_STATE;
    default:
      return state;
  }
}
