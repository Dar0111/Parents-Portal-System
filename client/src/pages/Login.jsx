import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { roleHome } from '../auth/roles';
import extractError from '../api/extractError';
import api, { takeLogoutReason } from '../api/axios';
import Button from '../components/Button';
import { cardClass, linkClass } from '../components/buttonClass';
import FormField, { controlClassFor } from '../components/FormField';
import PasswordField from '../components/PasswordField';
import Reveal from '../motion/Reveal';
import seal from '../assets/school-seal.png';

// The sign-in screen. Redesigned 2026-09-19 against Darryl's mockup, and again
// on 2026-10-02 (feat/ui-refresh) as an "editorial split".
//
// LAYOUT — one element tree, two shapes, no duplicated markup. At lg (1024px)
// the page is a two-column grid on `surface`: the form on the LEFT, a plain
// full-height column with its content in a `max-w-sm` block centred
// vertically, and the brand panel on the RIGHT as an inset rounded card.
// Below lg the same panel becomes a band across the top and the form sits in
// a card that overlaps the band's bottom edge.
//
// THE <aside> STAYS FIRST IN THE DOM AND MOVES RIGHT BY `lg:order-2`. The
// phone layout needs the band above the form, and the panel holds nothing
// focusable, so the visual swap at lg cannot put the tab order out of step
// with what is on screen.
//
// THE OVERLAP IS `-mt-12` ON THE FORM COLUMN AGAINST `pb-16` ON THE BAND, not
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
// THE FORM'S SURFACE MUST STAY `bg-surface` — the card below lg, the whole
// column at lg. That is not a styling preference: the D2 autofill rule in
// index.css is
//   [data-theme="dark"] input:-webkit-autofill { box-shadow: 0 0 0 1000px var(--surface) inset }
// and Chrome honours nothing else for an autofilled field's fill. Move the
// form to another surface token and autofilled inputs stop matching it in
// the dark theme.
//
// FIELDS COME FROM THE PRIMITIVES. Login ID is a FormField (its `hint` slot
// carries the parent/staff helper) and Password is PasswordField, so the
// focus ring here is the same one every other form has. THE TWO CONTROLS ARE
// 48px TALL HERE and only here and on the two recovery screens: the height
// and the text size are set from the <form> (`[&_input]:…`), because
// PasswordField takes no class and a descendant selector outranks the
// control's own `text-sm` whatever order the stylesheet emits them in.
//
// THE SMOKE RUN SIGNS IN THROUGH THIS FORM (e2e/auth.js) and finds it by
// exactly one control labelled "Login ID", exactly one `input[type=password]`
// and exactly one button named "Sign in". Do not add a second of any.
//
// MOTION: one staged entrance — the panel's content block, then the form a
// beat later. Nothing else moves.
//
// THE PANEL'S SCHOOL NAME IS THE SETTING, WITH THE FALLBACK CARRYING
// "– Main" (fix/polish, 2026-09-26). The line was a static string without
// "– Main", and mastheads carry it (LOCKED). `GET /settings/public` is the
// one unauthenticated settings read, so this page can ask for the real
// value; until it answers — or if it never does — the fallback is the copy,
// so there is no error state and nothing to retry.
const SCHOOL_NAME_FALLBACK = 'Captain H. Francisco Elementary School – Main';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [schoolName, setSchoolName] = useState(SCHOOL_NAME_FALLBACK);
  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings/public', { unwrap: 'settings' })
      .then((settings) => {
        if (!cancelled && settings?.school_name) setSchoolName(settings.school_name);
      })
      .catch(() => {
        // The fallback is already on screen; a failed read changes nothing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    // A flex column below lg, so <main> (`flex-1`) takes whatever height the
    // band leaves and its dot grid reaches the bottom of a tall phone instead
    // of stopping under the About link. At lg the grid replaces it and
    // `flex-1` means nothing to a grid item.
    <div className="flex min-h-screen flex-col bg-page lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:bg-surface">
      {/* The band below lg (its bottom corners rounded, the card overlapping
          them); at lg an inset card in the right-hand column — `lg:m-4`, so
          the grid's `surface` shows around it. No `min-h-screen` of its own:
          the grid row is already the form column's full height, and a margin
          on top of a full-height box would scroll the page. */}
      <aside className="brand-panel-art flex shrink-0 flex-col items-center rounded-b-3xl bg-brand-panel px-6 pb-16 pt-10 text-center text-brand-panel-fg lg:order-2 lg:m-4 lg:justify-between lg:rounded-3xl lg:px-12 lg:py-14">
        {/* Decoration only. `.brand-panel-art` supplies the corner glow and the
            dot pattern as its own two pseudo-elements; this node is the two
            large rings, which need a third layer. Everything is defined in
            index.css so the colors stay tokens — see the comment there. */}
        <div className="brand-panel-rings" aria-hidden="true" />

        <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-brand-panel-muted lg:block">
          Pateros District · Metro Manila
        </p>

        <Reveal className="flex flex-col items-center">
          {/* The seal always sits on its own white disc (seal-bg is white in
              both themes): the source is a JPG with a solid white field and a
              blue ring, which needs the disc on a brand background.
              rounded-full clips the square image to it. The halo is a
              box-shadow reaching 1.125rem past the disc and takes no space,
              so the margin under the disc has to clear it. */}
          <div className="seal-halo mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-seal-bg lg:mb-12 lg:h-46 lg:w-46">
            <img
              src={seal}
              alt="Captain H. Francisco Elementary School seal"
              width="168"
              height="168"
              className="h-18 w-18 rounded-full lg:h-42 lg:w-42"
            />
          </div>
          <h1 className="font-serif text-2xl font-bold lg:text-4xl">Parent&rsquo;s Portal</h1>
          <p className="mt-2 max-w-xs text-sm text-brand-panel-muted lg:mt-3 lg:max-w-sm lg:text-base">{schoolName}</p>
        </Reveal>

        <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-brand-panel-muted lg:block">Est. 1961</p>
      </aside>

      {/* `relative z-10` is what keeps the card ABOVE the band below lg, and it
          is not decoration. The addendum gave `.brand-panel-art` a
          `position: relative` (it has to, for the glow and rings to be inset
          against it), and a positioned element paints over a static one
          whatever the DOM order — so the <aside> started covering this <main>
          even though it comes first, and "Welcome back" ended up half under
          the band at 440px. Found in browser review 2026-09-19. At lg the two
          are grid columns side by side and this does nothing. */}
      <main className="relative z-10 flex flex-1 flex-col items-center px-4 pb-10 lg:order-1 lg:min-h-screen lg:px-8 lg:py-10">
        {/* The dot grid is the phone layout's page background only — the lg
            form column is plain `surface`. Its own layer, because
            `.page-dots` is unlayered CSS and no utility can switch its
            background-image off at a breakpoint; `lg:hidden` on a node can.
            `-z-10` keeps it under the card, inside <main>'s stacking context. */}
        <div aria-hidden="true" className="page-dots pointer-events-none absolute inset-0 -z-10 lg:hidden" />

        {/* The -mt-12 that pulls the card up over the band sits on this
            column. At lg the column takes the height the About link leaves
            and centres the form block in it. */}
        <div className="-mt-12 flex w-full max-w-sm flex-col lg:mt-0 lg:flex-1 lg:justify-center">
          {/* A card below lg; at lg the frame is dropped and the block simply
              sits in the column. `bg-surface` stays at every width (the
              autofill rule above). `rounded-3xl` after cardClass's
              `rounded-2xl`: Tailwind emits the two in name order, so the
              larger radius is the later rule. */}
          <Reveal
            delay={0.1}
            className={`${cardClass} rounded-3xl p-6 lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none`}
          >
            <div className="mb-6">
              <h2 className="font-serif text-2xl font-bold text-fg lg:text-3xl">Welcome back</h2>
              <p className="mt-2 text-sm text-fg-muted lg:text-base">Sign in to continue.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 [&_input]:min-h-12 [&_input]:text-base">
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
                <p
                  role="alert"
                  className="rounded-xl border border-danger-edge bg-danger-soft px-4 py-3 text-sm text-danger-strong"
                >
                  {error}
                </p>
              )}

              {/* `loading` disables the button and shows the spinner; the
                  label still changes while busy, as it always has. */}
              <Button variant="primary" size="lg" full type="submit" loading={submitting}>
                {/* The label alone — no trailing arrow (owner, 2026-10-04),
                    the same button as the phone's. */}
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            {/* A LINK SINCE R2 (2026-09-19). It was plain text for as long as
                there was no reset endpoint — a link then would have been a
                claim about behaviour the code did not have (§5i) — and
                /forgot-password now exists, so the claim is true.
                The office line gave way to the channels (f4, 2026-09-30): since
                SMS a code goes to a confirmed email OR mobile number, so "no
                email" no longer meant "ask the office". The sentence names no
                account's state (§11).
                The link is its own 44px line with the sentence under it: an
                inline link inside the paragraph was a 20px-tall touch target. */}
            <div className="mt-4 text-sm text-fg-muted">
              <Link to="/forgot-password" className={`${linkClass} inline-flex min-h-11 items-center`}>
                Forgot your password?
              </Link>
              <p>{"We'll send a code to your confirmed email or mobile number."}</p>
            </div>
          </Reveal>
        </div>

        {/* The school's details and the DepEd VMV, signed out (pre-Stage-5
            #5a). A parent looking for the office phone should not need an
            account to find it. OUTSIDE the form block, not in it — that block
            is the sign-in and this is not part of signing in: under the card
            below lg, at the foot of the column at lg. Muted on the page
            background and on `surface` (both checked pairs), the info glyph
            before the text, centred at every width. */}
        <p className="mt-4 text-center text-sm lg:mt-8">
          <Link
            to="/about"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-fg-muted transition hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"
          >
            <i aria-hidden="true" className="fa-solid fa-circle-info" />
            About the school
          </Link>
        </p>
      </main>
    </div>
  );
}
