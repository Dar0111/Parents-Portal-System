import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { roleHome } from '../auth/roles';
import extractError from '../api/extractError';
import { takeLogoutReason } from '../api/axios';
import FormField, { controlClassFor } from '../components/FormField';
import PasswordField from '../components/PasswordField';
import seal from '../assets/school-seal.png';

// The sign-in screen. Redesigned 2026-09-19 against Darryl's mockup.
//
// LAYOUT — one element tree, two shapes, no duplicated markup. At lg (1024px)
// the page is a two-column grid: a solid brand panel on the left, the form
// card centred on the right. Below lg the same panel becomes a band across the
// top and the card overlaps its bottom edge.
//
// THE OVERLAP IS `-mt-12` ON THE CARD AGAINST `pb-16` ON THE BAND, not
// absolute positioning. The card's height changes — the error box appears and
// disappears — and anything absolutely positioned would either clip it or
// leave a gap under it. Subtracting less than the band's bottom padding leaves
// a strip of brand still showing beside the card, which is what makes the
// overlap read as deliberate rather than as a collision.
//
// The district line and "Est. 1961" are `hidden lg:block`: they are the
// desktop panel's furniture, and a 390px band with five stacked lines is a
// wall. "Est. 1961" is the year on the school's own seal.
//
// THE CARD MUST STAY `bg-surface`. That is not a styling preference: the D2
// autofill rule in index.css is
//   [data-theme="dark"] input:-webkit-autofill { box-shadow: 0 0 0 1000px var(--surface) inset }
// and Chrome honours nothing else for an autofilled field's fill. Move this
// card to another surface token and autofilled inputs stop matching it in
// dark.
//
// FIELDS COME FROM THE PRIMITIVES NOW. Login used two hand-rolled inputs with
// no reveal toggle; it is the only form in the app that did. Login ID is a
// FormField (its `hint` slot carries the parent/staff helper) and Password is
// PasswordField, whose header no longer claims this page is not its consumer.
// Visible consequence, accepted: the shared control is `focus:ring-2` with a
// shadow where the old hand-rolled input was `focus:ring-1` with none, so the
// focus ring here is now the same one every other form has.
export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  // B3 (2026-09-19): when the 401 interceptor sent the user here, the reason
  // it stored ("Account is not active." / "Your session has ended…") is the
  // first thing this page shows. Read once, in the state initialiser, and
  // cleared by takeLogoutReason, so a refresh or a manual Logout shows
  // nothing. Same slot as a failed sign-in: the next submit replaces it.
  const [error, setError] = useState(() => takeLogoutReason());
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const loggedInUser = await login(loginId.trim(), password);
      navigate(roleHome(loggedInUser.role), { replace: true });
    } catch (err) {
      // Backend sends the exact message to show: wrong credentials (401),
      // or pending/rejected account (403, routes/auth.js). extractError
      // returns it verbatim — and, when there is no response at all, the
      // distinct offline message, so a dead API is never mistaken for a
      // wrong password (this file predated extractError; KNOWN ISSUES row
      // closed 2026-09-18).
      setError(extractError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-page lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="brand-panel-art flex flex-col items-center bg-brand-panel px-6 pb-16 pt-8 text-center text-brand-panel-fg lg:min-h-screen lg:justify-between lg:px-12 lg:py-16">
        {/* Decoration only. `.brand-panel-art` supplies the corner glow and the
            dot pattern as its own two pseudo-elements; this node is the two
            large rings, which need a third layer. Everything is defined in
            index.css so the colors stay tokens — see the comment there. */}
        <div className="brand-panel-rings" aria-hidden="true" />

        <p className="hidden text-xs font-medium uppercase tracking-[0.18em] text-brand-panel-muted lg:block">
          Pateros District · Metro Manila
        </p>

        <div className="flex flex-col items-center">
          {/* The seal always sits on its own white disc (seal-bg is white in
              both themes): the source is a JPG with a solid white field and a
              blue ring, which needs the disc on a brand background.
              rounded-full clips the square image to it. */}
          <div className="seal-halo mb-5 flex h-26 w-26 items-center justify-center rounded-full bg-seal-bg lg:mb-8 lg:h-46 lg:w-46">
            <img
              src={seal}
              alt="Captain H. Francisco Elementary School seal"
              width="168"
              height="168"
              className="h-24 w-24 rounded-full lg:h-42 lg:w-42"
            />
          </div>
          <h1 className="text-2xl font-semibold lg:text-4xl">Parent&rsquo;s Portal</h1>
          <p className="mt-2 text-sm text-brand-panel-muted lg:mt-3 lg:text-base">
            Captain H. Francisco Elementary School
          </p>
        </div>

        <p className="hidden text-xs uppercase tracking-[0.18em] text-brand-panel-muted lg:block">Est. 1961</p>
      </aside>

      {/* `relative z-10` is what keeps the card ABOVE the band below lg, and it
          is not decoration. The addendum gave `.brand-panel-art` a
          `position: relative` (it has to, for the glow and rings to be inset
          against it), and a positioned element paints over a static one
          whatever the DOM order — so the <aside> started covering this <main>
          even though it comes first, and "Welcome back" ended up half under
          the band at 440px. Found in browser review 2026-09-19. At lg the two
          are grid columns side by side and this does nothing. */}
      <main className="page-dots relative z-10 flex items-center justify-center px-4 pb-10 lg:min-h-screen lg:px-8 lg:py-16">
        <div className="-mt-12 w-full max-w-sm rounded-2xl border border-edge bg-surface p-8 shadow-xl lg:mt-0">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-fg">Welcome back</h2>
            <p className="mt-1 text-sm text-fg-muted">Sign in to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* FormField shape 4 rather than a new leading-icon prop on
                FormField itself: shape 4 exists exactly so a caller can own
                the control's markup, and `controlClassFor` gives it the same
                border every other field gets, error state included. The icon
                is aria-hidden and pointer-events-none — the label is what
                names the field. */}
            <FormField
              label="Login ID"
              hint="Parents: use your child's LRN. Teachers and staff: your assigned ID."
              required
              render={({ id, describedBy, invalid }) => (
                <div className="relative">
                  {/* Same mechanism as PasswordField's leadingIcon, and for the
                      same reason: the flex must sit on the wrapper, not on the
                      element carrying `fa-solid`. See the comment there. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-fg-faint"
                  >
                    <i className="fa-solid fa-user" />
                  </span>
                  <input
                    id={id}
                    type="text"
                    autoComplete="username"
                    required
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    className={`${controlClassFor(invalid)} pl-10`}
                  />
                </div>
              )}
            />

            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              leadingIcon="fa-lock"
              revealed={revealed}
              onToggleReveal={() => setRevealed((r) => !r)}
            />

            {/* role="alert" so a refused sign-in is announced. This is the one
                failure a screen-reader user is most likely to meet alone, and
                it was silent before. NOT ErrorAlert: that carries an icon and
                a retry affordance that do not belong on a login card, and
                danger-strong/danger-soft is already a checked contrast pair.
                Stays directly above the button that caused it (§7c). */}
            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <i className="fa-solid fa-circle-notch fa-spin" />}
              {submitting ? 'Signing in…' : 'Sign in'}
              {/* The arrow is decoration on the label, not a second message:
                  aria-hidden, so the button still announces just "Sign in".
                  It is dropped while submitting — the spinner is the state. */}
              {submitting ? null : <i aria-hidden="true" className="fa-solid fa-arrow-right text-xs" />}
            </button>
          </form>

          {/* TEXT, not a link, and deliberately so: there is no password-reset
              endpoint and no self-service route to one. A link would be a
              claim about behaviour the code does not have (§5i). */}
          <p className="mt-5 text-sm text-fg-muted">
            Forgot your password? Ask your child&rsquo;s adviser or the school office.
          </p>
        </div>
      </main>
    </div>
  );
}
