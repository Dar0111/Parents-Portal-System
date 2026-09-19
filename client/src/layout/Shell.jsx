import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { navForRole, navTitleForPath } from './nav';
import { PageTitleContext } from './usePageTitle';
import SocketProvider from '../realtime/SocketProvider';
import UnreadProvider, { useUnread } from '../realtime/UnreadProvider';
import LiveStatus from '../realtime/LiveStatus';
import NotificationProvider, { useNotifications } from '../realtime/NotificationProvider';
import Header from './Header';
import seal from '../assets/school-seal.png';

// The school's seal beside the product name, at the top of the sidebar and of
// the mobile drawer (D3, 2026-09-19). The seal always sits on its own white
// disc — seal-bg is white in BOTH themes, because the JPG's white field and
// its blue ring vanish on a dark surface otherwise; rounded-full clips the
// square image to the disc. 40px inside a 44px disc; the 192px asset is 2x
// the largest render (Login's 96px).
function Brand() {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-seal-bg">
        <img
          src={seal}
          alt="Captain H. Francisco Elementary School seal"
          width="40"
          height="40"
          className="h-10 w-10 rounded-full"
        />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold text-fg">Parent&rsquo;s Portal</div>
        <div className="truncate text-xs text-fg-muted">Capt. H. Francisco ES</div>
      </div>
    </div>
  );
}

// Three states, not two — see nav.js. `blocked` is a stronger claim than
// `built: false` and takes precedence: an unbuilt page is merely unwritten, a
// blocked one cannot be designed until a school question is answered, and its
// tooltip carries that reason. Exported so the dev gallery can show all three
// side by side without logging in as three different roles.
export function NavItem({ item, onNavigate, badge = 0 }) {
  const base = 'flex items-center gap-3 rounded-lg px-3 py-2 transition';

  // The badge renders ONLY on a built item. A count on a dimmed, unclickable
  // nav entry would be worse than no count: it announces something the user
  // cannot go and read. Teacher and Parent Messages are both built, so both
  // carry a live count; admin has no Messages item at all since 2026-09-18,
  // so there is nothing to badge and `UnreadProvider` never fetches for that
  // role. A future role/page that lands built: false inherits this untouched.
  // See the unread note in Shell below.
  const withBadge = (label) =>
    badge > 0 ? (
      <>
        <span className="flex-1">{label}</span>
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-fg">
          {badge > 99 ? '99+' : badge}
        </span>
      </>
    ) : (
      label
    );

  if (item.blocked) {
    return (
      <span
        title={item.blocked}
        aria-disabled="true"
        className={`${base} cursor-not-allowed text-fg-ghost`}
      >
        <i className={`fa-solid ${item.icon} w-4 text-center`} />
        <span className="flex-1">{item.label}</span>
        <i className="fa-solid fa-circle-exclamation text-xs text-warning-icon" />
      </span>
    );
  }

  if (!item.built) {
    return (
      <span
        title="Not built yet"
        aria-disabled="true"
        className={`${base} cursor-not-allowed text-fg-ghost`}
      >
        <i className={`fa-solid ${item.icon} w-4 text-center`} />
        {item.label}
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.to.split('/').length === 2}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${base} ${
          isActive
            ? 'bg-brand-soft font-medium text-brand'
            : 'text-fg-body hover:bg-surface-subtle hover:text-fg'
        }`
      }
    >
      <i className={`fa-solid ${item.icon} w-4 text-center`} />
      {withBadge(item.label)}
    </NavLink>
  );
}

// The socket lives here, not in a page: a teacher reading Students should still
// have their unread badge update, and a per-page hook would open one connection
// per mounting page. Shell renders exactly while a user is logged in, which is
// exactly the socket's lifetime.
export default function Shell() {
  const { user } = useAuth();
  // The badge is only fetched for a role whose Messages page actually exists.
  const messagesBuilt = Boolean(navForRole(user?.role).find((i) => i.to.endsWith('/messages'))?.built);

  return (
    <SocketProvider>
      <UnreadProvider enabled={messagesBuilt}>
        {/* A SIBLING of UnreadProvider, not a replacement. Messages keep
            their own count and their own badge; the bell counts everything
            else. Nothing adds the two together — see the header of
            NotificationProvider for why one fact must not have two stores. */}
        <NotificationProvider>
          <ShellChrome />
        </NotificationProvider>
      </UnreadProvider>
    </SocketProvider>
  );
}

// Which nav item each unread count badges. Two counts, two sources, joined
// only at the point of rendering a number — never summed:
//
//   Messages          UnreadProvider, from GET /messages/conversations
//   everything else   NotificationProvider, from GET /notifications/unread-counts
//
// GRADES IS ABSENT ON PURPOSE (Darryl, 2026-09-19): a new grade rings the
// bell and is never badged in the sidebar. The consequence is that the bell
// total is larger than the sum of the badges for a parent, which is correct
// and is the kind of thing that reads as a bug if nobody writes it down.
//
// Keyed by the nav path suffix rather than by label, because the label is
// display text and the path is the identity — the same reason the Messages
// badge has always tested `to.endsWith`.
const BADGE_BY_PATH = {
  '/excuse-letters': 'excuse_letters',
  '/announcements': 'announcements',
  '/memos': 'memos',
  '/events': 'events',
  '/users': 'users',
};

// Admin has no Memos page — memos live on Admin -> Announcements, and that
// page is the only place one can be written (2026-09-14). So the admin
// Announcements badge carries BOTH counts, or a posted memo would ring the
// bell with no badge anywhere to lead the admin to it.
function badgeFor(item, role, counts, unread) {
  if (item.to.endsWith('/messages')) return unread;
  if (role === 'admin' && item.to.endsWith('/announcements')) {
    return counts.announcements + counts.memos;
  }
  const key = BADGE_BY_PATH[Object.keys(BADGE_BY_PATH).find((p) => item.to.endsWith(p)) || ""];
  return key ? counts[key] : 0;
}

function ShellChrome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Shell owns the page-title state and provides it to the routed page below,
  // so it can read the current value directly instead of consuming a context
  // it is itself providing.
  const [customTitle, setCustomTitle] = useState(null);
  const titleContext = useMemo(() => ({ setTitle: setCustomTitle }), []);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const items = navForRole(user?.role);
  // ShellChrome no longer derives `messagesBuilt`. It existed only to gate the
  // LiveStatus strip, and that gate is gone (see the note at its render).
  // Shell() above still computes its own, for UnreadProvider's `enabled`.
  const { unread } = useUnread();
  const { counts } = useNotifications();
  const title =
    customTitle || navTitleForPath(user?.role, location.pathname) || "Parent's Portal";

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const nav = (
    <nav className="space-y-0.5 px-2 pb-4 text-sm">
      {items.map((item) => (
        <NavItem
          key={item.to}
          item={item}
          onNavigate={() => setMobileNavOpen(false)}
          badge={badgeFor(item, user?.role, counts, unread)}
        />
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-page">
      {/* STICKY (D3, 2026-09-19): the sidebar pins to the viewport (sticky
          top-0, h-screen, self-start so it keeps its own height in the flex
          row) and its nav scrolls INSIDE itself only when taller than the
          viewport (min-h-0 + overflow-y-auto on the nav box). The document
          stays the only scroller: one scrollbar, no layout shift. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col self-start border-r border-edge bg-surface sm:flex">
        <Brand />
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div
            className="absolute inset-0 bg-backdrop"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-1 text-fg-faint hover:bg-surface-muted"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={title}
          user={user}
          onOpenMenu={() => setMobileNavOpen(true)}
          onLogout={handleLogout}
          drawerOpen={mobileNavOpen}
        />

        <main className="min-w-0 flex-1 space-y-4 p-4 sm:p-6">
          {/* CONVENTION 5g, and specifically WHERE the notice belongs: the
              unread badge in the sidebar depends on the live channel and is
              visible on EVERY page, so the notice that the channel is down has
              to be visible on every page too. Confining it to the Messages
              pages — where it started — left a teacher on Students or Grades
              with a badge that had silently stopped updating and nothing to
              say so, which is 5g's own failure mode one level out.

              GATED ON `messagesBuilt` FROM 2026-09-18 TO 2026-09-19, AND THAT
              GATE IS NOW GONE. The 2026-09-18 reasoning was sound at the time:
              5g says "say so wherever something channel-fed is shown", and for
              a role with no Messages item nothing on screen was channel-fed, so
              the strip announced a failure the viewer could do nothing about.
              N1 changed the fact it rested on. Every role now has a bell and
              sidebar badges fed by the SAME socket, and admin in particular
              receives `parent_pending` live — so an admin whose channel dies
              now has a silently frozen bell, which is exactly the thing 5g
              exists to prevent. The strip is unconditional again.

              `messagesBuilt` still gates UnreadProvider, above: that is about
              not FETCHING a count nobody can see, which is a different
              question from whether to admit the channel is down. */}
          <LiveStatus
              // A full reload rather than a per-page refetch: Shell cannot know
              // what the routed page fetches, and a Refresh that silently
              // refreshed only the badge would be its own small lie. Reloading
              // re-runs every fetch on the page and re-attempts the socket.
              onRefresh={() => window.location.reload()}
          />
          <PageTitleContext.Provider value={titleContext}>
            <Outlet />
          </PageTitleContext.Provider>
        </main>
      </div>
    </div>
  );
}
