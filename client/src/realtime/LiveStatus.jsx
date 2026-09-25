import { useSocket } from './SocketProvider';

// The visible half of CLAUDE.md convention 5g: when the live channel is down,
// SAY SO and offer explicit refresh. Never fake liveness, and never poll to
// disguise it.
//
// Renders nothing while connected — a permanent "connected" badge is noise, and
// the useful signal is the exception.
export default function LiveStatus({ onRefresh }) {
  const { connected } = useSocket();

  if (connected) return null;

  return (
    // `data-print="hide"` (UI-D-2). UI-D-1 hid the Shell's chrome by
    // landmark and could not reach this: it renders as the first child of
    // <main> with no stable hook, and its file was outside that whitelist —
    // so a printout taken while the socket was down carried "Live updates
    // paused" across the top of the Summary of Grades. The attribute is the
    // escape hatch §18b's global block already looks for.
    <div
      data-print="hide"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-edge bg-warning-soft px-4 py-2.5"
    >
      {/* "new updates", not "new messages" (N2, 2026-09-19). The strip is no
          longer only about Messages: since N1 the same channel carries
          notification_counts, and the strip is now shown to admin, who has no
          Messages page at all. Naming messages there would have been a claim
          about the wrong thing (§5i). */}
      <p className="text-sm text-warning-strong">
        <i className="fa-solid fa-plug-circle-xmark mr-2" />
        Live updates paused — new updates will not appear on their own.
      </p>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-warning-edge-strong bg-surface px-3 py-1 text-sm font-medium text-warning-strong transition hover:bg-warning-soft-hover"
        >
          Refresh
        </button>
      ) : null}
    </div>
  );
}
