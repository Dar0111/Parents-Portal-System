import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import RailTooltip from '../components/RailTooltip';
import { DURATION, EASE, MOTION_OK, gsap, useGSAP } from '../motion/motion';
import { requestLeave } from './leaveGuard';
import { navForRole, navTitleForPath } from './nav';
import { groupNav } from './navGroups';
import { revealActive } from './navScroll';
import { settingsTabsForRole } from '../pages/settings/tabs';
import { PageTitleContext } from './usePageTitle';
import SocketProvider from '../realtime/SocketProvider';
import UnreadProvider, { useUnread } from '../realtime/UnreadProvider';
import LiveStatus from '../realtime/LiveStatus';
import NotificationProvider, { useNotifications } from '../realtime/NotificationProvider';
// WITH ITS EXTENSION, on purpose: MessageToast.jsx and the pure
// messageToast.js differ only by case, and on a case-insensitive disk
// (Windows, a default macOS volume) an extensionless import tries `.js` first
// and gets the pure module, which has no default export — the build failed.
import MessageToast from '../realtime/MessageToast.jsx';
import Header from './Header';
import seal from '../assets/school-seal.png';

// The focus outline every link in the sidebar carries — the same one
// buttonClass.js gives a button (`focus-accent` on `surface` is a checked
// pair). Keyboard only.
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent';

// The school's seal beside the product name, at the top of the sidebar and of
// the mobile drawer (D3, 2026-09-19). The seal always sits on its own white
// disc — seal-bg is white in BOTH themes, because the JPG's white field and
// its blue ring vanish on a dark surface otherwise; rounded-full clips the
// square image to the disc. 40px inside a 44px disc; the 192px asset is 2x
// the largest render (Login's 96px).
//
// THE BLOCK IS AS TALL AS THE HEADER (min-h-16) and ends in the same
// hairline, so the sidebar's rule and the top bar's read as one line across
// the window (feat/ui-refresh). A minimum, not a fixed height, and neither
// line truncates: in a narrow drawer at the Large text size the name wraps
// and the block grows instead of clipping. `children` is the drawer's Close
// button, inside the same row.
function Brand({ children = null }) {
  return (
    <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-edge px-4 py-2">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-seal-bg">
        <img
          src={seal}
          alt="Captain H. Francisco Elementary School seal"
          width="40"
          height="40"
          className="h-10 w-10 rounded-full"
        />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="font-serif text-base font-bold text-fg">Parent&rsquo;s Portal</div>
        <div className="text-xs text-fg-muted">Capt. H. Francisco ES</div>
      </div>
      {children}
    </div>
  );
}

const ROLE_LABEL = { admin: 'Admin', teacher: 'Teacher', parent: 'Parent' };

// THE USER CARD, pinned at the bottom of the sidebar and the drawer
// (feat/ui-polish, 2026-09-30). It replaced the header's name block and
// Logout, so there is exactly ONE Logout on screen.
//
// A PARENT'S CARD NEVER SHOWS THE LOGIN ID. A parent's login_id IS the
// child's LRN (§5c), and this card is on every page — Settings is the one
// screen allowed to show it. Staff login ids (TCH-001, ADMIN001) are not
// credentials of anyone else and are shown. That includes the NAME
// FALLBACK: a parent with no name shows none, never the login id.
//
// THE AVATAR AND NAME OPEN SETTINGS → ACCOUNT INFORMATION
// (feat/nav-drawer-groups, 2026-09-30), on the phone's drawer card too. A
// Link beside the Logout button, never around it — two controls side by
// side, one action each. The path is built from nav.js's Settings item and
// settings/tabs.js's Account information tab (admin's is `account`, the
// other roles' is the index), so it cannot drift from either.
function accountInfoPath(role) {
  const settings = navForRole(role).find((i) => i.to.endsWith('/settings'));
  const tab = settingsTabsForRole(role).find((t) => t.label === 'Account information');
  if (!settings || !tab) return null;
  return tab.to ? `${settings.to}/${tab.to}` : settings.to;
}

// A CARD IN ITS OWN RIGHT since feat/ui-refresh (2026-10-02): a rounded,
// bordered tile on `surface-subtle`, set in from the sidebar's edges, rather
// than a strip under a rule. THE NAME WRAPS TO TWO LINES BEFORE IT CLIPS
// (`line-clamp-2`): one truncated line cut a full name to "Ashley G…", and
// the name is the one thing this card is for. The link's aria-label always
// carries it whole.
function UserCard({ user, onLogout, onNavigate }) {
  const role = ROLE_LABEL[user?.role] || user?.role || '';
  const detail = user?.role === 'parent' ? role : [role, user?.login_id].filter(Boolean).join(' · ');
  const name = user?.name || (user?.role === 'parent' ? '' : user?.login_id) || '';
  const account = accountInfoPath(user?.role);

  const who = (
    <>
      <Avatar name={name} photo={user?.profile_pic} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="line-clamp-2 break-words text-sm font-semibold text-fg">{name}</div>
        <div className="truncate text-xs text-fg-muted">{detail}</div>
      </div>
    </>
  );

  return (
    // gap-2, never less: the account link and Logout are two touch targets
    // side by side, and 8px is the least that keeps a thumb off the wrong one.
    <div className="m-2 flex shrink-0 items-center gap-2 rounded-2xl border border-edge bg-surface-subtle p-2">
      {account ? (
        <Link
          to={account}
          onClick={onNavigate}
          aria-label={`${name ? `${name}, ` : ''}Account information`}
          className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1 transition hover:bg-surface-muted ${FOCUS}`}
        >
          {who}
        </Link>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-1.5 py-1">{who}</div>
      )}
      {/* AN ICON, NOT A LABELLED BUTTON (UI-2): the word "Logout" took the
          room the name needed ("Ashley G…"). Named for screen readers by its
          sr-only label and shown by RailTooltip on hover and on keyboard
          focus. 44px square: a finger's target in the drawer. */}
      <RailTooltip label="Logout">
        <Button variant="ghost" size="icon" icon="fa-right-from-bracket" onClick={onLogout}>
          <span className="sr-only">Logout</span>
        </Button>
      </RailTooltip>
    </div>
  );
}

// One row of the sidebar. 44px at least (`min-h-11`), so it is a finger's
// target in the drawer and a label that wraps at the Large text size grows
// the row instead of clipping.
const NAV_ITEM = 'relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition';

// The icon's box. The WRAPPER carries the width, never the element with
// `fa-solid` (Font Awesome's unlayered CSS wins over a layered utility —
// found in D3), and it is aria-hidden: the label beside it is the name.
function NavIcon({ icon }) {
  return (
    <span aria-hidden="true" className="w-5 shrink-0 text-center">
      <i className={`fa-solid ${icon}`} />
    </span>
  );
}

// Three states, not two — see nav.js. `blocked` is a stronger claim than
// `built: false` and takes precedence: an unbuilt page is merely unwritten, a
// blocked one cannot be designed until a school question is answered, and its
// tooltip carries that reason. Exported so the dev gallery can show all three
// side by side without logging in as three different roles.
//
// THE ACTIVE ITEM IS SAID THREE WAYS (feat/ui-refresh): the brand tint, the
// heavier label, and a 3px brand bar on its left edge — so it does not rest
// on colour alone — and NavLink's own `aria-current="page"` says it to a
// screen reader (navScroll.js finds the item by that attribute; a proof
// drives it). There is no icon-only form of an item: the rail was removed.
export function NavItem({ item, onNavigate, badge = 0 }) {
  if (item.blocked) {
    return (
      <span
        title={item.blocked}
        aria-disabled="true"
        className={`${NAV_ITEM} cursor-not-allowed text-fg-ghost`}
      >
        <NavIcon icon={item.icon} />
        <span className="min-w-0 flex-1">{item.label}</span>
        <i className="fa-solid fa-circle-exclamation text-xs text-warning-icon" aria-hidden="true" />
      </span>
    );
  }

  if (!item.built) {
    return (
      <span
        title="Not built yet"
        aria-disabled="true"
        className={`${NAV_ITEM} cursor-not-allowed text-fg-ghost`}
      >
        <NavIcon icon={item.icon} />
        <span className="min-w-0 flex-1">{item.label}</span>
      </span>
    );
  }

  // The badge renders ONLY on a built item. A count on a dimmed, unclickable
  // nav entry would be worse than no count: it announces something the user
  // cannot go and read. Teacher and Parent Messages are both built, so both
  // carry a live count; admin has no Messages item at all since 2026-09-18,
  // so there is nothing to badge and `UnreadProvider` never fetches for that
  // role. A future role/page that lands built: false inherits this untouched.
  // See the unread note in Shell below.
  return (
    <NavLink
      to={item.to}
      end={item.to.split('/').length === 2}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${NAV_ITEM} ${FOCUS} ${
          isActive
            ? 'bg-brand-soft font-semibold text-brand'
            : 'text-fg-body hover:bg-surface-muted hover:text-fg'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-5 w-[0.1875rem] -translate-y-1/2 rounded-full bg-brand"
            />
          ) : null}
          <NavIcon icon={item.icon} />
          <span className="min-w-0 flex-1">{item.label}</span>
          {badge > 0 ? (
            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-fg">
              {badge > 99 ? '99+' : badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

// THE DRAWER BELOW `md`: the same sidebar content in a panel over the page.
// Its own component so it MOUNTS when the menu opens — which is what lets
// the entrance run once per opening, with no state and no effect dependency.
//
// MOTION (feat/ui-refresh): the panel slides in from the left edge and the
// backdrop fades in, 0.25 s. Transform and opacity only, created inside
// `gsap.matchMedia().add(MOTION_OK, …)`, so under reduced motion nothing is
// created and the drawer is simply there; `clearProps` leaves no inline style
// behind. The panel and every control in it are live from the first frame —
// nothing waits on the tween. CLOSING IS NOT ANIMATED: the drawer unmounts,
// which is faster than any exit (motion.js).
//
// The panel is a bare <aside>, like the sidebar, on purpose — the print rules
// hide `aside` and `header` by element name.
function Drawer({ onClose, children }) {
  const backdropRef = useRef(null);
  const panelRef = useRef(null);

  useGSAP(() => {
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.from(backdrop, { opacity: 0, duration: DURATION.base, ease: EASE, clearProps: 'opacity' });
      gsap.from(panel, { xPercent: -100, duration: DURATION.base, ease: EASE, clearProps: 'transform' });
    });
  });

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div ref={backdropRef} className="absolute inset-0 bg-backdrop" onClick={onClose} />
      <aside
        ref={panelRef}
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl"
      >
        {children}
      </aside>
    </div>
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
          {/* The new-message toast (feat/message-toast, §26): only where
              Messages is built — admin has no Messages page, and a toast
              must be openable (§10). Never in the bell. */}
          {messagesBuilt ? <MessageToast /> : null}
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

  // NO ICON-ONLY RAIL (the owner's decision, feat/ui-refresh, 2026-10-02):
  // from `md` up the sidebar is always its full width, with its words. The
  // collapse toggle, its `pp.sidebar` preference and layout/sidebarPref.js
  // are gone; a value an older build stored under that key is never read.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeDrawer = () => setMobileNavOpen(false);

  // THE ACTIVE ITEM IS SCROLLED INTO VIEW (UI-10) — on load, on every route
  // change, and when the drawer opens; nearest, no animation
  // (`navScroll.js`). A layout effect, so the nav never paints at the wrong
  // scroll first.
  const sidebarNavRef = useRef(null);
  const drawerNavRef = useRef(null);
  useLayoutEffect(() => {
    revealActive(sidebarNavRef.current);
    revealActive(drawerNavRef.current);
  }, [location.pathname, mobileNavOpen]);

  const items = navForRole(user?.role);
  // ShellChrome no longer derives `messagesBuilt`. It existed only to gate the
  // LiveStatus strip, and that gate is gone (see the note at its render).
  // Shell() above still computes its own, for UnreadProvider's `enabled`.
  const { unread } = useUnread();
  const { counts } = useNotifications();
  const title =
    customTitle || navTitleForPath(user?.role, location.pathname) || "Parent's Portal";

  // LOG OUT ASKS FIRST on a page with unsaved bulk work (fix/leave-guard,
  // 2026-10-01). It is a button, so the bulk pages' link listener never heard
  // it and a teacher's typed scores went with the session. requestLeave runs
  // the logout at once when no page has registered a dialog.
  function handleLogout() {
    requestLeave(() => {
      logout();
      navigate('/login', { replace: true });
    });
  }

  // GROUPED (feat/ui-polish, 2026-09-30): Dashboard on top, the role's groups
  // with a small label each, and Settings / About pinned at the bottom above
  // the user card. Which item sits where is layout/navGroups.js; which items
  // EXIST is still nav.js alone. The groups do not fold on the web. The
  // sidebar and the drawer render the same two blocks.
  const sections = groupNav(user?.role, items);
  const renderItems = (list) =>
    list.map((item) => (
      <NavItem
        key={item.to}
        item={item}
        onNavigate={closeDrawer}
        badge={badgeFor(item, user?.role, counts, unread)}
      />
    ));
  const navBody = (
    <nav aria-label="Main" className="space-y-1 px-3 pb-4 pt-3">
      {renderItems(sections.top)}
      {sections.groups.map((group, i) => (
        <div key={group.label || `rest-${i}`} className="space-y-1 pt-3">
          {group.label ? (
            <div className="px-3 pb-1.5 pt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fg-muted">
              {group.label}
            </div>
          ) : null}
          {renderItems(group.items)}
        </div>
      ))}
    </nav>
  );
  const pinned = (
    <div className="shrink-0 space-y-1 border-t border-edge px-3 py-2">{renderItems(sections.bottom)}</div>
  );
  // NO VISIBLE SCROLLBAR (UI-1): the box still scrolls by wheel, trackpad and
  // touch, and Tab scrolls a focused link into view; only the bar is hidden —
  // Firefox by scrollbar-width, Chromium and Safari by the
  // ::-webkit-scrollbar pseudo-element.
  const navBox = 'min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

  return (
    // `data-app-shell` scopes the stable scrollbar gutter to the app's pages
    // (index.css, UI-6) — the Login page, outside Shell, keeps its edge.
    <div data-app-shell="" className="flex min-h-screen bg-page">
      {/* STICKY (D3, 2026-09-19): the sidebar pins to the viewport (sticky
          top-0, h-screen, self-start so it keeps its own height in the flex
          row) and its nav scrolls INSIDE itself only when taller than the
          viewport (min-h-0 + overflow-y-auto on the nav box). The document
          stays the only scroller: one scrollbar, no layout shift.

          `md`, NOT `sm`, SINCE feat/ui-polish (2026-09-30): at 640–767px the
          sidebar (240px then) left a page about 350px wide, so below 768px the
          menu button opens the drawer instead. ALWAYS 16rem (w-64) since
          feat/ui-refresh — one width, no rail; <main> is flex-1 min-w-0, so
          every page simply gets the rest of the window — nothing below this
          sets a width for it. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col self-start border-r border-edge bg-surface md:flex">
        <Brand />
        <div ref={sidebarNavRef} className={navBox}>
          {navBody}
        </div>
        {pinned}
        <UserCard user={user} onLogout={handleLogout} />
      </aside>

      {mobileNavOpen ? (
        <Drawer onClose={closeDrawer}>
          <Brand>
            <Button
              variant="ghost"
              size="icon"
              icon="fa-xmark"
              aria-label="Close menu"
              onClick={closeDrawer}
              className="-mr-2"
            />
          </Brand>
          <div ref={drawerNavRef} className={navBox}>
            {navBody}
          </div>
          {pinned}
          <UserCard user={user} onLogout={handleLogout} onNavigate={closeDrawer} />
        </Drawer>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={title}
          onOpenMenu={() => setMobileNavOpen(true)}
          drawerOpen={mobileNavOpen}
        />

        {/* NO WIDTH CAP: content fills the window beside the sidebar. f3's
            80rem centred cap was removed on 2026-09-30 by Darryl's decision
            (the parent dashboard returns to its 69bae24 layout). The padding
            steps up with the window (16 / 24 / 32px) and the page's blocks
            sit 24px apart. */}
        <main className="min-w-0 flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
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
