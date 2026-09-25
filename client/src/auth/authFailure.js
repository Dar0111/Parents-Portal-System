// WHAT A FAILED /auth/me MEANS (pre-Stage-5 #4, 2026-09-25).
//
// Pure, no React, no imports — so a proof can drive it with the four error
// shapes axios produces, which a render never could (§14e): a proof cannot
// fire a request, but it can ask this function what it would do with the
// answer.
//
// TWO OUTCOMES, AND ONLY ONE OF THEM LOGS OUT.
//
//   'unauthenticated'  the server answered 401 — the session is dead (the
//                      restore cutoff, a bumped token_version, a deactivated
//                      account, an expired token). The axios interceptor has
//                      ALREADY removed the token and redirected by the time
//                      AuthContext sees this; the context only mirrors it.
//   'unavailable'      everything else — no response at all (offline, the
//                      API down, CORS, a hung request), a 5xx, or any other
//                      status the server did not send as 401. The token is
//                      KEPT and the user is offered a retry.
//
// WHY THE SECOND BUCKET IS SO WIDE. Until today AuthContext's catch removed
// the token on ANY failure, so a page refresh during a LAN outage — frequent
// on a school network — silently discarded a valid session and landed the
// user on /login with no reason. The only signal that a session is dead is
// a 401, and the interceptor is the one place that acts on it; a 403 or a
// 404 on /auth/me cannot come from a live session (a forced password change
// is a FLAG on the row, not a status), so treating anything but 401 as
// "keep and retry" can never keep a session the server has ended.
export function classifyAuthFailure(err) {
  return err?.response?.status === 401 ? 'unauthenticated' : 'unavailable';
}
