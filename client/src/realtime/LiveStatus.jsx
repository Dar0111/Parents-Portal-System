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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
      <p className="text-sm text-amber-900">
        <i className="fa-solid fa-plug-circle-xmark mr-2" />
        Live updates paused — new messages will not appear on their own.
      </p>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
        >
          Refresh
        </button>
      ) : null}
    </div>
  );
}
