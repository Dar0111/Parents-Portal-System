import { useCallback, useEffect, useState } from 'react';
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
export function useCard(loader, deps, { skip = false } = {}) {
  const [state, setState] = useState({ data: null, loading: !skip, error: null });

  const load = useCallback(() => {
    if (skip) {
      setState({ data: null, loading: false, error: null });
      return undefined;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => live && setState({ data, loading: false, error: null }))
      .catch((err) => live && setState({ data: null, loading: false, error: extractError(err) }));
    // Returned as the effect's cleanup: a card whose deps change mid-flight
    // must not have the first response overwrite the second.
    return () => {
      live = false;
    };
    // `loader` is a new function on every render, so it cannot be a
    // dependency — the caller passes the values that really decide when this
    // is a different request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, skip]);

  useEffect(load, [load]);

  return { ...state, reload: load };
}

export default useCard;
