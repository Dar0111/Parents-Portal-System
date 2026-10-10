import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import { useFocusTrap } from '../components/focusTrap';
import RailTooltip from '../components/RailTooltip';
import { DURATION, EASE, MOTION_OK, gsap, useGSAP } from '../motion/motion';
import { requestLeave } from './leaveGuard';
import { navForRole, navTitleForPath } from './nav';
import { groupNav } from './navGroups';
import { gridHeight, revealActive, rowPitch } from './navScroll';
import { shouldScrollToTop } from './scrollOnNavigate';
import { readSidebarCollapsed, saveSidebarCollapsed } from './sidebarPref';
import { settingsTabsForRole } from '../pages/settings/tabs';
import { PageTitleContext } from './usePageTitle';
import { PageBackContext } from './usePageBack';
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

// A NAV ROW'S OUTLINE IS DRAWN INSIDE IT (fix round F7, 2026-10-08). With
// FOCUS's 2px offset the ring sat 4px OUTSIDE the row, and the nav box is a
// scroller (`overflow-y-auto`) with no bottom padding since the slot grid
// (F3) — so the pinned Messages row, stuck at the box's bottom edge, had the
// bottom of its ring cut off, expanded and in the rail; so would any row at
// the very end of the list. Inside the row (-2px, as DataTable's cards draw
// theirs) the whole ring shows wherever the row sits, and the grid is
// untouched. Same colour, same width; only the nav rows take it — the user
// card's links are outside the box and keep FOCUS.
const NAV_FOCUS =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-accent';

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
// and the block grows instead of clipping. `children` is the control at the
// row's end — the drawer's Close button. (The sidebar's collapse toggle has
// its own row under the block since the 2026-10-06 fix round.)
//
// `collapsed` is the 64px rail: the seal alone, centred, in the same 4rem
// block, so the hairline still meets the top bar's.
function Brand({ collapsed = false, children = null }) {
  return (
    <div
      className={`flex min-h-16 shrink-0 items-center gap-3 border-b border-edge py-2 ${
        collapsed ? 'justify-center px-2' : 'px-4'
      }`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-seal-bg">
        <img
          src={seal}
          alt="Captain H. Francisco Elementary School seal"
          width="40"
          height="40"
          className="h-10 w-10 rounded-full"
        />
      </div>
      {collapsed ? null : (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="font-serif text-base font-bold text-fg">Parent&rsquo;s Portal</div>
          <div className="text-xs text-fg-muted">Capt. H. Francisco ES</div>
        </div>
      )}
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
//
// IN THE RAIL (`collapsed`) the tile narrows to the avatar over the Logout
// icon, each labelled by RailTooltip on hover and keyboard focus, exactly
// the two controls of the wide card — main's rail card, in the new tile.
function UserCard({ user, collapsed = false, onLogout, onNavigate }) {
  const role = ROLE_LABEL[user?.role] || user?.role || '';
  const detail = user?.role === 'parent' ? role : [role, user?.login_id].filter(Boolean).join(' · ');
  const name = user?.name || (user?.role === 'parent' ? '' : user?.login_id) || '';
  const account = accountInfoPath(user?.role);

  if (collapsed) {
    return (
      <div className="m-2 flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-edge bg-surface-subtle p-1">
        {account ? (
          <RailTooltip label="Account information">
            <Link
              to={account}
              onClick={onNavigate}
              className={`flex rounded-full transition hover:opacity-90 ${FOCUS}`}
            >
              <Avatar name={name} photo={user?.profile_pic} />
              <span className="sr-only">Account information</span>
            </Link>
          </RailTooltip>
        ) : (
          <Avatar name={name} photo={user?.profile_pic} />
        )}
        <RailTooltip label="Logout">
          <Button variant="ghost" size="icon-sm" icon="fa-right-from-bracket" onClick={onLogout}>
            <span className="sr-only">Logout</span>
          </Button>
        </RailTooltip>
      </div>
    );
  }

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

// One icon of the rail: 44px tall, the icon centred in the rail's width.
const RAIL_ITEM = 'relative flex h-11 items-center justify-center rounded-xl transition';

// The active item's 3px brand bar on its left edge (see NavItem).
const ACTIVE_BAR = 'absolute left-0 top-1/2 h-5 w-[0.1875rem] -translate-y-1/2 rounded-full bg-brand';

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
// drives it).
//
// `collapsed` (feat/ui-polish; restored 2026-10-04): the 64px rail. The icon
// alone, its label kept for screen readers (`sr-only`) and shown beside it by
// RailTooltip on hover and on keyboard focus, the brand bar still marking the
// active item, and a badge becomes a small count on the icon's corner.
export function NavItem({ item, onNavigate, badge = 0, collapsed = false }) {
  if (collapsed && item.built && !item.blocked) {
    return (
      <RailTooltip label={item.label}>
        <NavLink
          to={item.to}
          end={item.to.split('/').length === 2}
          onClick={onNavigate}
          className={({ isActive }) =>
            `${RAIL_ITEM} ${NAV_FOCUS} ${
              isActive ? 'bg-brand-soft text-brand' : 'text-fg-body hover:bg-surface-muted hover:text-fg'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive ? <span aria-hidden="true" className={ACTIVE_BAR} /> : null}
              <NavIcon icon={item.icon} />
              <span className="sr-only">
                {item.label}
                {badge > 0 ? ` (${badge})` : ''}
              </span>
              {badge > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] font-semibold leading-4 tabular-nums text-primary-fg"
                >
                  {badge > 9 ? '9+' : badge}
                </span>
              ) : null}
            </>
          )}
        </NavLink>
      </RailTooltip>
    );
  }

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
  // cannot go and read. Every role's Messages is built — the admin's since
  // 2026-10-05 (teacher <-> admin only) — so every role carries a live count.
  // A future role/page that lands built: false inherits this untouched. See
  // the unread note in Shell below.
  return (
    <NavLink
      to={item.to}
      end={item.to.split('/').length === 2}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${NAV_ITEM} ${NAV_FOCUS} ${
          isActive
            ? 'bg-brand-soft font-semibold text-brand'
            : 'text-fg-body hover:bg-surface-muted hover:text-fg'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span aria-hidden="true" className={ACTIVE_BAR} /> : null}
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
// A MODAL DIALOG SINCE BUILD 2 (feat/dashboards-look, 2026-10-07, the owner's
// decision 2): the panel is `<div role="dialog" aria-modal="true"
// aria-label="Menu">`, because that is what it is — it sits over the page,
// holds the focus and closes on Escape — and a screen reader now hears that
// the page behind it is out of reach. It was a bare <aside>, which the print
// rules hide by element name; `role="dialog"` is not allowed on an <aside>,
// so the div carries `print:hidden` instead (the wrapper too, so the backdrop
// cannot print either). The menu button says `aria-haspopup="dialog"` and
// `aria-expanded` (Header.jsx).
//
// FOCUS STAYS INSIDE (feat/look-fixes, 2026-10-05): the panel takes focus once
// per opening — the drawer mounts when it opens, so `active` is simply true
// for its life — Tab wraps inside it, Escape closes it as its close button
// does, and focus goes back to the menu button when it closes
// (components/focusTrap.js).
//
// IT CLOSES WHEN THE WINDOW REACHES `md` (build 2, the second drawer defect).
// From 768px up the drawer is `md:hidden` — gone from the screen — but it was
// still mounted, so its focus trap kept every Tab inside a panel nobody could
// see, and focus fell out of the page. The media query is the same 48rem as
// Tailwind's `md` (a media query's rem is the browser's 16px, not the root's,
// so Large text does not move it). Only a CHANGE is listened for: the menu
// button that opens the drawer is itself `md:hidden`, so it opens below `md`.
const DRAWER_GONE = '(min-width: 48rem)';

function Drawer({ onClose, children }) {
  const backdropRef = useRef(null);
  const panelRef = useRef(null);
  useFocusTrap(panelRef, true, { onEscape: onClose });

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const wide = window.matchMedia(DRAWER_GONE);
    const onChange = () => {
      if (wide.matches) closeRef.current();
    };
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, []);

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
    <div className="fixed inset-0 z-40 md:hidden print:hidden">
      <div ref={backdropRef} className="absolute inset-0 bg-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl outline-none print:hidden"
      >
        {children}
      </div>
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
              Messages is built — every role since 2026-10-05, the admin
              included — because a toast must be openable (§10). Never in
              the bell. */}
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
  // The top bar's ← (fix round W1, 2026-10-11): { to, label } from a page
  // that calls usePageBack — the Messages thread alone — else null and the
  // bar has none. Owned here like the title, for the same reason.
  const [back, setBack] = useState(null);
  const backContext = useMemo(() => ({ setBack }), []);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeDrawer = () => setMobileNavOpen(false);
  // THE DESKTOP SIDEBAR'S WIDTH, remembered per browser (`pp.sidebar`,
  // layout/sidebarPref.js) — the collapse-to-rail toggle of feat/ui-polish,
  // removed with the first refresh build and RESTORED by the owner on
  // 2026-10-04, same behaviour, the new look. Read in the initializer, so
  // the first paint already has the right width. The drawer below `md` is
  // never collapsed — it is opened for the words.
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  function toggleCollapsed() {
    setCollapsed((c) => {
      saveSidebarCollapsed(!c);
      return !c;
    });
  }

  // THE ACTIVE ITEM IS SCROLLED INTO VIEW (UI-10) — on load, on every route
  // change, when the sidebar collapses or expands, and when the drawer opens;
  // nearest, no animation (`navScroll.js`). A layout effect, so the nav never
  // paints at the wrong scroll first.
  const sidebarNavRef = useRef(null);
  const drawerNavRef = useRef(null);

  // THE SIDEBAR'S NAV BOX SHOWS WHOLE SLOTS (fix round follow-up F3): its
  // height is the largest whole number of 3rem slots that fits the space
  // between the toggle row and Settings (navScroll.js `gridHeight`), so no
  // resting place cuts a row; the leftover sits blank below it. Measured from
  // the slot that holds it and from the <nav> itself, again whenever either
  // changes size (the window, collapse/expand, the text size). Null — the
  // whole slot — when the list fits. The drawer below `md` is not gridded.
  const sidebarSlotRef = useRef(null);
  const [navHeight, setNavHeight] = useState(null);
  useLayoutEffect(() => {
    const slot = sidebarSlotRef.current;
    const box = sidebarNavRef.current;
    const nav = box?.firstElementChild;
    if (!slot || !nav) return undefined;
    const fit = () => setNavHeight(gridHeight(slot.clientHeight, nav.offsetHeight, rowPitch()));
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(fit);
    observer.observe(slot);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [collapsed]);

  useLayoutEffect(() => {
    // Gridded, the sidebar's box rests at slot starts (`snapToSlot`); the
    // drawer's keeps the item-top rounding.
    revealActive(sidebarNavRef.current, navHeight ? rowPitch() : 0);
    revealActive(drawerNavRef.current);
  }, [location.pathname, collapsed, mobileNavOpen, navHeight]);

  // A NEW PAGE STARTS AT THE TOP (fix round F5, 2026-10-08): on a PUSH or
  // REPLACE to another pathname the window goes to the top; Back / Forward
  // keep the browser's restore, and a query-only change never moves the page
  // (layout/scrollOnNavigate.js has the rule). A layout effect, so the new
  // page never paints at the old page's scroll first; `instant`, so a smooth
  // scroll setting never animates it. The pathname a page was last seen at is
  // a ref, written here only.
  const navigationType = useNavigationType();
  const lastPathRef = useRef(location.pathname);
  useLayoutEffect(() => {
    const previousPath = lastPathRef.current;
    lastPathRef.current = location.pathname;
    if (shouldScrollToTop({ previousPath, nextPath: location.pathname, navigationType })) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [location.pathname, navigationType]);

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

  // LOG OUT FROM THE OPEN DRAWER CLOSES THE DRAWER FIRST (build 2, the first
  // drawer defect). With unsaved work, requestLeave opens the page's "Leave
  // without saving?" dialog — and with the drawer still open that put TWO
  // focus traps on the page at once, the drawer's and the dialog's, each
  // wrapping Tab inside its own panel, and Escape closed both. The drawer is
  // closed in the same click, so only the dialog is left; React runs the
  // drawer's cleanup (focus back to the menu button) before the dialog's
  // trap starts, so Stay returns focus to the menu button.
  function handleDrawerLogout() {
    closeDrawer();
    handleLogout();
  }

  // GROUPED (feat/ui-polish, 2026-09-30): Dashboard on top, the role's groups
  // with a small label each (a thin divider in the rail), and Settings /
  // About pinned at the bottom above the user card. Which item sits where is
  // layout/navGroups.js; which items EXIST is still nav.js alone. The groups
  // do not fold on the web. The sidebar and the drawer render the same two
  // blocks; `rail` is true only for the collapsed desktop sidebar.
  const sections = groupNav(user?.role, items);
  // MESSAGES STAYS ON SCREEN (fix round, 2026-10-06). On a laptop's short
  // window (1366×600) the group holding Messages sat below the nav's fold,
  // so a new message's badge could not be seen until the sidebar was
  // scrolled — and no list of 10–13 rows at 44px fits that height. So the
  // Messages row is `sticky bottom-0`: while its own place is below the
  // fold it holds the bottom edge of the nav box, badge and all; scrolled
  // to, it is back in its own place. Same item, same group, same order —
  // nothing is duplicated. Opaque `surface`, so the rows passing under it
  // never show through. `data-nav-pinned` is how navScroll.js keeps the
  // active item clear of it, and the box's `scroll-pb-12` (below) does the
  // same for an item reached by Tab.
  const renderItems = (list, rail) =>
    list.map((item) => {
      const navItem = (
        <NavItem
          key={item.to}
          item={item}
          collapsed={rail}
          onNavigate={closeDrawer}
          badge={badgeFor(item, user?.role, counts, unread)}
        />
      );
      if (!item.to.endsWith('/messages')) return navItem;
      return (
        <div key={item.to} data-nav-pinned="" className="sticky bottom-0 z-10 bg-surface">
          {navItem}
        </div>
      );
    });
  // THE GROUPS ARE FLAT (fix round, 2026-10-06): each group's label (or the
  // rail's divider) and its items are siblings in the <nav>, never inside a
  // per-group box. A sticky row cannot leave its parent, and inside its
  // group's box Messages could not rise above the group's own top — which on
  // the teacher's list is itself below the fold. The <nav>'s `space-y-1` is
  // the 4px between rows.
  //
  // EVERY BLOCK IS ONE SLOT (fix round follow-up F3): a group's label, or
  // the rail's divider, takes a whole 44px row (`h-11`) — the label sitting
  // at its foot, over its items; the divider across its middle — so the list
  // is a grid of 3rem slots and the sidebar's box can show whole rows only
  // (`gridHeight`, navScroll.js). The sidebar's <nav> has 4px on top — the
  // first slot's gap — and nothing below, so the list is a whole number of
  // slots; the drawer, which is not gridded, keeps its 12px / 16px.
  const navBody = (rail, inDrawer = false) => (
    <nav
      aria-label="Main"
      className={`space-y-1 ${inDrawer ? 'pb-4 pt-3' : 'pt-1'} ${rail ? 'px-2' : 'px-3'}`}
    >
      {renderItems(sections.top, rail)}
      {sections.groups.map((group, i) => (
        <Fragment key={group.label || `rest-${i}`}>
          <div className={`flex h-11 ${rail ? 'items-center px-2' : 'items-end px-3 pb-1.5'}`}>
            {rail ? (
              <div aria-hidden="true" className="w-full border-t border-edge" />
            ) : group.label ? (
              <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fg-muted">
                {group.label}
              </div>
            ) : null}
          </div>
          {renderItems(group.items, rail)}
        </Fragment>
      ))}
    </nav>
  );
  const pinned = (rail) => (
    <div className={`shrink-0 space-y-1 border-t border-edge py-2 ${rail ? 'px-2' : 'px-3'}`}>
      {renderItems(sections.bottom, rail)}
    </div>
  );

  // THE COLLAPSE TOGGLE HAS ONE PLACE (fix round, 2026-10-06): a row of its
  // own directly under the brand block, its 36px box 14px from the sidebar's
  // left edge, in BOTH states — so it is the same spot on the screen whether
  // the sidebar is 256px or the 64px rail (centred under the seal there, in
  // line with the rail's icons). It used to sit at the end of the brand row
  // while wide and drop under the seal in the rail. The rail's layout is the
  // one it already had, so the rail's snap (build 1 fix round) is untouched.
  // Its label shows by RailTooltip only in the rail, where it is "Expand
  // sidebar"; wide, its name is enough. 36px from `sm` up — the sidebar is a
  // pointer's, from `md`. `pb-2` under it since the F3 follow-up: the nav
  // below starts with only its 4px grid padding, so the row keeps the 12px
  // between the toggle and Dashboard.
  const collapseToggle = (
    <div className="flex shrink-0 px-3.5 pb-2 pt-2">
      <RailTooltip label="Expand sidebar" enabled={collapsed}>
        <Button
          variant="ghost"
          size="icon-sm"
          icon={collapsed ? 'fa-angles-right' : 'fa-angles-left'}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={toggleCollapsed}
        />
      </RailTooltip>
    </div>
  );
  // NO VISIBLE SCROLLBAR (UI-1): the box still scrolls by wheel, trackpad and
  // touch, and Tab scrolls a focused link into view; only the bar is hidden —
  // Firefox by scrollbar-width, Chromium and Safari by the
  // ::-webkit-scrollbar pseudo-element. `scroll-pb-12` (48px — the pinned
  // Messages row, 44px, and its 4px gap) keeps a link reached by Tab clear of
  // that row instead of scrolled under it.
  const navScrolls = 'overflow-y-auto scroll-pb-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
  const navBox = `min-h-0 flex-1 ${navScrolls}`;

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
          menu button opens the drawer instead. Wide it is 16rem (w-64) since
          feat/ui-refresh, the rail 4rem (w-16); <main> is flex-1 min-w-0, so
          every page simply gets the rest of the window — nothing below this
          sets a width for it. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col self-start border-r border-edge bg-surface md:flex ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <Brand collapsed={collapsed} />
        {collapseToggle}
        {/* The SLOT takes the space; the box inside it is a whole number of
            rows tall (`navHeight`, F3) and the rest of the slot stays blank. */}
        <div ref={sidebarSlotRef} className="min-h-0 flex-1">
          <div
            ref={sidebarNavRef}
            className={`h-full ${navScrolls}`}
            style={navHeight ? { height: navHeight } : undefined}
          >
            {navBody(collapsed)}
          </div>
        </div>
        {pinned(collapsed)}
        <UserCard user={user} collapsed={collapsed} onLogout={handleLogout} />
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
            {navBody(false, true)}
          </div>
          {pinned(false)}
          <UserCard user={user} onLogout={handleDrawerLogout} onNavigate={closeDrawer} />
        </Drawer>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={title}
          back={back}
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
            <PageBackContext.Provider value={backContext}>
              <Outlet />
            </PageBackContext.Provider>
          </PageTitleContext.Provider>
        </main>
      </div>
    </div>
  );
}
