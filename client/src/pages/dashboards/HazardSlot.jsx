import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { buttonClass } from '../../components/buttonClass';

// THE LOCKOUT HAZARD NOTICE ON THE ADMIN DASHBOARD — compact, and it never
// pushes the cards down (build 2 fix round F1, 2026-10-08).
//
// WHEN IT SHOWS is unchanged: only when GET /api/dashboard says
// `hazard.single_unverified_admin` (one active admin, email unconfirmed). It
// is deliberately not dismissible — a warning about being locked out of your
// own system is exactly the warning someone dismisses and then needs — it
// clears itself the moment either condition stops being true, and it names no
// account: there is only one it could be about, and a login id must never
// appear on screen (§5c).
//
// THE SPACE IS HELD FROM THE FIRST FRAME. It used to appear only when the
// dashboard answered, above the grid, and push every card down. The session
// already knows whether THIS admin's email is confirmed (`/auth/me`'s
// `email_verified_at`), and the warning can only be true when it is not. So
// while the dashboard loads and the email is unconfirmed, the same notice is
// laid out INVISIBLE (`invisible`, `aria-hidden`, `inert`) — the exact height
// at every width, because it is the same markup — and the server's flag then
// shows it in place, or removes it. Removal is a jump only in the one case the
// session cannot see coming: a second active admin added straight into the
// database (no endpoint creates one). A confirmed email holds nothing.
//
// COMPACT, as the teacher's attendance banner is: the warning on one line and
// the action on the right. The long explanation is behind "Why this matters"
// (a button with `aria-expanded`), word for word as it was, so the copy still
// says exactly what the code does (§5i).
//
// ONE LINK, NOT TWO. This card shipped with a "Create a second admin →" link
// to Admin → Users, and that page cannot do it: POST /api/users/teachers
// hardcodes role 'teacher' and /parents hardcodes 'parent'. NO endpoint in the
// API creates an admin — 'admin' appears only as a filter value on GET /users
// — so the only admin is the seeded one. A link offering an action the code
// does not have is the §5i failure exactly. Removed on review, 2026-09-19. Do
// not re-add it until an endpoint exists.
//
// NOTHING HERE IS RED: a state that could strand you later is a warning (§12).
const HAZARD_TITLE = 'This is the only admin account, and its email is not confirmed';
const HAZARD_EXPLANATION =
  'If this password is lost there is no way back in through the app: resetting your own password needs a confirmed email, and a temporary password can only be issued by a different admin — and a second admin account cannot be created from inside the app. Confirming your email is the fix available here.';

export default function HazardSlot({ hazard = false, loading = false, emailConfirmed = false }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const reserved = !hazard && loading && !emailConfirmed;
  if (!hazard && !reserved) return null;

  return (
    <div
      data-hazard={reserved ? 'reserved' : 'notice'}
      aria-hidden={reserved || undefined}
      inert={reserved || undefined}
      className={`rounded-xl border border-warning-edge bg-warning-soft px-4 py-3 sm:px-5 ${reserved ? 'invisible' : ''}`}
    >
      {/* THE TEXT BLOCK HAS A BASIS, so on a phone the actions drop to their
          own row under it instead of squeezing the sentence. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 grow basis-64 items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-warning-strong">
            <i className="fa-solid fa-triangle-exclamation" />
          </span>
          <p className="min-w-0 text-sm font-semibold text-warning-strong">{HAZARD_TITLE}</p>
        </div>
        {/* The neutral button, not the filled one: this page has no primary
            action, and a warning is not made louder by its link. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className={buttonClass({ variant: 'ghost', size: 'sm' })}
          >
            Why this matters
            <i aria-hidden="true" className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'} text-[0.625rem]`} />
          </button>
          <Link to="/admin/settings/account" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Confirm your email
          </Link>
        </div>
      </div>
      {/* Always in the document, `hidden` while closed, so the button's
          `aria-controls` always names an element that exists. */}
      <p id={panelId} hidden={!open} className="mt-2 max-w-prose text-sm text-fg-body">
        {HAZARD_EXPLANATION}
      </p>
    </div>
  );
}
