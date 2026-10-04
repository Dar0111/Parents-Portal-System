// IS THE DRAWER OPEN? (feat/look-fixes, 2026-10-05) — PURE, so a proof can
// drive it with the nested state React Navigation really builds.
//
// The new-message toast floats over AppShell's whole stack, and the drawer
// lives INSIDE that stack (Main), so an open drawer had the toast sitting on
// its top — where Dashboard is (the owner's phone, 2026-10-04 20:27). While
// the drawer is open the toast renders nothing (realtime/MessageToast.jsx).
//
// Walks the FOCUSED path (root → Home → AppShell's stack → Main → the drawer)
// and applies the drawer router's own rule — `getDrawerStatusFromState` in
// @react-navigation/drawer: the NEWEST `drawer` entry in the navigator's
// `history` says open or closed; without one, the navigator's `default`;
// without that, closed. Re-implemented rather than imported so this file
// imports nothing native. No drawer on the path (a pushed screen is focused,
// or no state yet) reads as closed.
export function drawerOpenInState(state) {
  let node = state;
  while (node && Array.isArray(node.routes) && node.routes.length) {
    if (node.type === 'drawer') {
      const history = Array.isArray(node.history) ? node.history : [];
      let status = null;
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i]?.type === 'drawer') {
          status = history[i].status;
          break;
        }
      }
      return (status ?? node.default ?? 'closed') === 'open';
    }
    const index = Number.isInteger(node.index) ? node.index : node.routes.length - 1;
    node = node.routes[index]?.state;
  }
  return false;
}
