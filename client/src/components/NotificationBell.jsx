import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import extractError from '../api/extractError';
import ErrorAlert from './ErrorAlert';
import LoadingSpinner from './LoadingSpinner';
import { useNotifications } from '../realtime/NotificationProvider';
import { requestLeave } from '../layout/leaveGuard';

// The bell and its dropdown. N2, 2026-09-19.
//
// NO FULL NOTIFICATIONS PAGE, deliberately. A /notifications route would be a
// new nav item for three roles — a convention 6 decision — plus three route
// registrations, to show the same rows this panel already shows. Instead the
// panel pages in place against the already-paginated endpoint. Revisit trigger,
// written down so it is a decision and not an omission: if the panel regularly
// runs past two pages in real use, or the school asks to filter by type.
//
// THE COUNT IS NEVER COMPUTED HERE. It comes from NotificationProvider, which
// re-reads /unread-counts whenever the server says something changed. Marking
// a row read calls refresh() rather than subtracting one — same rule as the
// Messages badge, same reason (convention 5b).
//
// ACCESSIBILITY, the parts that are easy to get wrong:
//   - a real <button> with aria-expanded / aria-controls / aria-haspopup,
//     never a div with a click handler;
//   - the count is also words for a screen reader, because a bare number
//     beside a bell icon says nothing;
//   - Escape closes AND returns focus to the bell, so keyboard focus is not
//     stranded on a panel that no longer exists;
//   - an outside click closes, via one document listener attached only while
//     open;
//   - the panel is a menu, not a dialog, so focus is not trapped — you can
//     Tab straight out of it, which is what a menu should do.

const PAGE_SIZE = 8;

// Relative time, kept local rather than added to format/date.js: that module
// is about DATES the API sends as YYYY-MM-DD strings and about never calling
// toISOString(); this is about a TIMESTAMP, and it is the only caller. Extract
// it at the second.
function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// `closeWhen` is Shell's mobile-drawer flag. The panel is z-40 and so is the
// drawer; two siblings at the same level are decided by DOM order, which is
// not a thing to rely on. It is applied as a render gate at the panel below,
// so the rule is stated declaratively rather than kept in sync by an effect.
export default function NotificationBell({ closeWhen = false }) {
  const { counts, refresh } = useNotifications();
  const navigate = useNavigate();
  const panelId = useId();

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const bellRef = useRef(null);
  const panelRef = useRef(null);

  const unread = counts.total;

  const load = useCallback(async (nextOffset) => {
    setLoading(true);
    setError('');
    try {
      const { notifications, page } = await api.get(
        `/notifications?limit=${PAGE_SIZE}&offset=${nextOffset}`,
        { unwrap: ['notifications', 'page'] }
      );
      setRows((prev) => (nextOffset === 0 ? notifications : [...prev, ...notifications]));
      setOffset(nextOffset);
      setHasMore(Boolean(page?.has_more));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Opening always re-reads from the first page: the panel must show what the
  // server holds now, not what it held when the bell was last opened. The
  // fetch is fired from the CLICK, not from an effect on `open` — "update it
  // from the event that caused the change", which is both what
  // react(set-state-in-effect) asks for and the more honest description of
  // what is happening.
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load(0);
  }

  // Escape closes and puts focus back on the bell. Registered only while open.
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        bellRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Outside click closes. `mousedown` rather than `click` so a press that
  // starts outside cannot land on a row that is about to disappear.
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (panelRef.current?.contains(e.target) || bellRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // A ROW IS A BUTTON THAT NAVIGATES, so on a page with unsaved bulk work it
  // asks first (fix/leave-guard, 2026-10-01) — before the mark-read, so Stay
  // changes nothing at all. A row whose link is THIS page leaves nothing
  // behind and does not ask.
  function openRow(row) {
    setOpen(false);
    const target = new URL(row.link, window.location.origin).pathname;
    if (target === window.location.pathname) {
      followRow(row);
      return;
    }
    requestLeave(() => {
      followRow(row);
    });
  }

  async function followRow(row) {
    try {
      if (!row.read_at) {
        await api.patch(`/notifications/${row.id}/read`, {}, { unwrap: 'notification' });
        refresh();
      }
    } catch {
      // Navigating is the point of the click; a failed mark-read must not
      // strand the user on the page they were trying to leave. The dot stays,
      // which is the honest outcome — the server still holds it unread.
    }
    navigate(row.link);
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all', {}, { unwrap: 'updated' });
      refresh();
      load(0);
    } catch (err) {
      setError(extractError(err));
    }
  }

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-edge-strong text-fg-body transition hover:bg-surface-muted"
      >
        <i aria-hidden="true" className="fa-solid fa-bell" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-medium leading-5 text-primary-fg"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
        {/* The number alone says nothing out loud. */}
        <span className="sr-only">
          {unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'}
        </span>
      </button>

      {/* `closeWhen` is a RENDER gate, not an effect: the panel is simply not
          shown while the drawer is open. In practice the outside-mousedown
          listener above already closes it — opening the drawer means clicking
          the hamburger, which is outside the panel — so this is the explicit
          statement of the rule rather than the mechanism that enforces it. */}
      {open && !closeWhen ? (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          aria-label="Notifications"
          /* z-40 puts the panel over the sticky header (z-30). Shell closes it
             when the mobile drawer (also z-40) opens, because two siblings at
             the same level would otherwise be decided by DOM order. Below sm
             the panel is full-bleed: w-80 overflows a 360px phone. */
          className="fixed inset-x-2 top-16 z-40 max-h-[26rem] overflow-y-auto rounded-xl border border-edge bg-surface shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80"
        >
          <div className="flex items-center justify-between border-b border-edge px-4 py-3">
            <p className="text-sm font-semibold text-fg">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-sm font-medium text-brand underline-offset-2 hover:underline"
              >
                Mark all as read
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="p-3">
              <ErrorAlert message={error} onRetry={() => load(0)} />
            </div>
          ) : null}

          {loading && rows.length === 0 ? <LoadingSpinner className="py-8" label="Loading…" /> : null}

          {!loading && !error && rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">No notifications yet.</p>
          ) : null}

          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openRow(row)}
                  className="flex w-full items-start gap-3 border-b border-edge px-4 py-3 text-left transition hover:bg-surface-muted"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${row.read_at ? 'bg-transparent' : 'bg-primary'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${row.read_at ? 'text-fg-muted' : 'font-medium text-fg'}`}>
                      {row.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-fg-muted">{row.body}</span>
                    <span className="mt-1 block text-xs text-fg-muted">{relativeTime(row.created_at)}</span>
                  </span>
                  {row.read_at ? null : <span className="sr-only">Unread</span>}
                </button>
              </li>
            ))}
          </ul>

          {hasMore ? (
            <div className="p-3">
              <button
                type="button"
                onClick={() => load(offset + PAGE_SIZE)}
                disabled={loading}
                className="w-full rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-60"
              >
                {loading ? 'Loading…' : 'Show older'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
