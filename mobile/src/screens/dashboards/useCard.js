import { useCallback, useEffect, useRef, useState } from 'react';
import extractError from '../../api/extractError';

// ONE CARD, ONE REQUEST, ONE RETRY — the hook every dashboard card uses.
//
// WHY ITS OWN FILE. It started inside Card.jsx, beside the component it
// feeds, which cost one `react(only-export-components)` warning: a file that
// exports both components and a non-component breaks Fast Refresh. The
// codebase accepts that warning five times already (FormStatus twice,
// AuthContext, SocketProvider, UnreadProvider), each for a reason that had
// no cheaper alternative. This one did — a hook in its own module is the
// conventional layout and `hooks/useTeacherTargets.js` is the precedent — so
// the warning was not worth adding a sixth time. oxlint stays at 44.
//
// WHY THE HOOK EXISTS AT ALL. A dashboard is the one screen where several
// independent failures are normal: seven requests, seven things that can
// time out, 403, or come back malformed. If a page owned one `loading` and
// one `error`, a single failed request would blank every card that worked —
// and `Promise.all` would do exactly that, because it rejects as a unit. So
// each card gets its own three states from its own call to this.
//
// `reload` refetches THAT CARD ALONE. A page-level reload to recover one
// failed card would re-request every card that already succeeded, which on a
// dashboard is most of them.
//
// `skip` is for a request that must not be made at all — an unlinked parent
// has no student_id, and asking anyway would turn an empty state into an
// error message about a 404.
//
// ---------------------------------------------------------------------------
// THE SAME QUERY KEEPS ITS DATA; A NEW QUERY STARTS FROM NOTHING (build 2,
// feat/dashboards-look, 2026-10-07 — the owner's decision 1)
// ---------------------------------------------------------------------------
// The QUERY is `deps` — the values that make this a different request. Two
// ways to read again, and they are not the same thing:
//
//   THE SAME QUERY, read again — `reload` (Retry, a focus re-read, a pull),
//   or a change of `refresh`, a counter a parent bumps to re-read a card it
//   cannot reach (the teacher's attendance banners): the answer already on
//   screen STAYS while the new one is fetched. `refreshing` is true then, and
//   the card marks its kept content `aria-busy` and inert. `loading` stays
//   false — nothing is replaced by a placeholder.
//
//   A NEW QUERY — any value in `deps` changed: the old answer is about
//   something else, so it is NEVER shown for the new one, not even for the
//   one render before the effect runs (`current` below). `loading` is true
//   and the card shows its skeleton.
//
// So `loading` means "nothing of THIS query is on screen" and `refreshing`
// means "this query's answer is on screen and being read again". A query
// that answered with null (no letter yet, no backup) has answered: a re-read
// keeps that null as calmly as it keeps a number. A FAILED read has nothing
// on screen, so Retry after an error is `loading`, never `refreshing`.
//
// THE NEWEST REQUEST WINS. Every read takes a ticket; an answer whose ticket
// is not the latest is dropped, so a slow focus re-read cannot land on top of
// the pull that followed it, and a card whose deps change mid-flight never
// has the first response overwrite the second.
//
// The two rules are PURE FUNCTIONS below, exported so a proof can drive them
// with no renderer (client/scripts/ssr-skeletons.jsx,
// mobile/scripts/proof-skeletons.mjs).

// PURE — the state a read starts from: the same query keeps what it has, a
// new one starts from nothing.
export function startRead(state, key) {
  return state.key === key
    ? { ...state, error: null, loading: true }
    : { key, data: null, error: null, loading: true, answered: false };
}

// PURE — what the card is shown, from the stored state and the CURRENT query.
// Stored state for another query is never shown, even for the one render
// before the effect has started the new read.
export function cardView(state, key) {
  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !current || (state.loading && !state.answered),
    refreshing: current && state.loading && state.answered,
  };
}

export function useCard(loader, deps, { skip = false, refresh = 0 } = {}) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState({ key: null, data: null, error: null, loading: !skip, answered: false });
  const ticket = useRef(0);

  const load = useCallback(() => {
    ticket.current += 1;
    const mine = ticket.current;
    if (skip) {
      setState({ key, data: null, error: null, loading: false, answered: false });
      return undefined;
    }
    let live = true;
    setState((s) => startRead(s, key));
    loader()
      .then((data) => {
        if (live && ticket.current === mine) setState({ key, data, error: null, loading: false, answered: true });
      })
      .catch((err) => {
        if (live && ticket.current === mine) {
          setState({ key, data: null, error: extractError(err), loading: false, answered: false });
        }
      });
    // Returned as the effect's cleanup: a card that unmounts, or whose deps
    // change, drops whatever was still in flight.
    return () => {
      live = false;
    };
    // `loader` is a new function on every render, so it cannot be a
    // dependency — the caller passes the values that really decide when this
    // is a different request. `refresh` re-runs the effect without changing
    // `key`, which is exactly what makes it a re-read of the same query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, skip, refresh]);

  useEffect(load, [load]);

  if (skip) return { data: null, error: null, loading: false, refreshing: false, reload: load };
  return { ...cardView(state, key), reload: load };
}

export default useCard;
