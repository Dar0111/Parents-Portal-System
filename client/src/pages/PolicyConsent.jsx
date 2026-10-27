import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import extractError from '../api/extractError';
import { useAuth } from '../auth/AuthContext';
import { nextStep } from '../auth/accountSteps';
import { entryPath } from '../auth/stepPath';
import Button from '../components/Button';
import { cardClass, linkClass } from '../components/buttonClass';
import ErrorAlert from '../components/ErrorAlert';
import FormStatus, { fail } from '../components/FormStatus';
import Skeleton, { SkeletonBar } from '../components/Skeleton';
import useSkeleton from '../hooks/useSkeleton';
import Reveal from '../motion/Reveal';
import seal from '../assets/school-seal.png';

// THE CONSENT SCREEN (feat/privacy, 2026-10-10; FRONTEND §29). A parent reads
// the Data Privacy Notice and the Terms of Use and accepts them — for
// themselves and on behalf of their child — before using the portal. It asks
// again whenever either document's version changes.
//
// THE SAME SHAPE AS THE FORCED PASSWORD CHANGE, on purpose: top-level, OUTSIDE
// Shell (a sidebar full of pages the server refuses with
// `code: 'POLICY_ACCEPTANCE_REQUIRED'` would lie) and OUTSIDE ProtectedRoute
// (which is what sends people here — wrapping it would loop). ProtectedRoute
// routes here on `user.policy_pending` from /auth/me, never on the 403 (§2).
// SINCE feat/first-signin (2026-10-18) THIS IS THE FIRST STEP, before the
// contact step and the new password — the server's order (accountGates.js),
// read through the mirrored nextStep(); its exit goes to whichever step is
// next.
//
// THREE TICKS, ALL REQUIRED, and the server checks them again: the notice, the
// terms, and the parent's consent for their child — "As the parent or legal
// guardian of <first name>, …" — the child's FIRST NAME from /auth/me, never
// the LRN (§5c). The wording is the draft the principal will approve (fix
// round PF4). The accept sends the versions returned with the documents; a
// version that changed meanwhile is a 409, the page reloads the documents and
// the parent reads them again. Sign out is always there and changes nothing — the flag
// is still set at the next sign-in, and the line above it says declining
// leaves the child's school records as they are.
//
// STAFF TOO (feat/staff-acceptance, 2026-10-11; the owner's decisions):
// teachers and the admin meet the same screen with TWO ticks — the parent's
// first two, word for word — and no child tick; the accept sends no
// `on_behalf_of_child`, and the line above Sign out is the owner's sentence
// for staff (DeclineLine below). A parent's screen, ticks and words are
// unchanged.
//
// LOADING is Build 2's skeleton (components/Skeleton + hooks/useSkeleton,
// unchanged): nothing for 300 ms, then the shapes of the two documents.

function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

const NO_TICKS = { privacy_notice: false, terms_of_use: false, child: false };

export default function PolicyConsent() {
  const { user, loading, logout, refresh } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloads, setReloads] = useState(0);
  const [ticked, setTicked] = useState(NO_TICKS);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  // Only a session that belongs on this screen reads the documents.
  const onThisScreen = nextStep(user) === 'consent';

  useEffect(() => {
    if (!onThisScreen) return undefined;
    let live = true;
    api
      .get('/policy', { unwrap: 'documents' })
      .then((docs) => {
        if (live) setDocuments(docs);
      })
      .catch((err) => {
        if (live) setLoadError(extractError(err));
      });
    return () => {
      live = false;
    };
  }, [onThisScreen, reloads]);

  const docsLoading = onThisScreen && !documents && !loadError;
  const phase = useSkeleton(docsLoading);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl text-fg-faint" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // Nobody reaches this screen unless consent is the next step, and nobody
  // stays on it once the server says it is done.
  if (!onThisScreen) return <Navigate to={entryPath(user)} replace />;

  const isParent = user.role === 'parent';
  const childName = user.student_first_name ? String(user.student_first_name) : null;
  const ready = allTicked(documents, ticked, isParent);

  function reload() {
    setDocuments(null);
    setLoadError(null);
    setTicked(NO_TICKS);
    setReloads((n) => n + 1);
  }

  async function accept(event) {
    event.preventDefault();
    if (!ready || saving) return;
    setStatus(null);
    setSaving(true);
    try {
      const versions = Object.fromEntries(documents.map((d) => [d.document, d.version]));
      // The third tick is a parent's alone; staff send the versions only.
      const body = isParent ? { versions, on_behalf_of_child: true } : { versions };
      await api.post('/policy/accept', body, { unwrap: 'policy_pending' });
      // The flag comes back cleared from the SERVER, never assumed here; the
      // next step (the contact, the password) or home, by the same rule.
      const me = await refresh();
      navigate(entryPath(me), { replace: true });
    } catch (err) {
      setStatus(fail(extractError(err)));
      // A document changed while this page was open: show the new words and
      // ask again from an empty set of ticks.
      if (err?.response?.status === 409) reload();
    } finally {
      setSaving(false);
    }
  }

  function tick(key) {
    return (e) => setTicked((prev) => ({ ...prev, [key]: e.target.checked }));
  }

  return (
    <div className="page-dots flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* The seal on its `seal-bg` disc, `rounded-full` on the image (§9). */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-seal-bg">
            <img
              src={seal}
              alt="Captain H. Francisco Elementary School seal"
              width="168"
              height="168"
              className="h-11 w-11 rounded-full"
            />
          </div>
          <p className="font-serif text-lg font-bold text-fg">Parent&rsquo;s Portal</p>
        </div>

        <Reveal className={`${cardClass} rounded-3xl p-6`}>
          <ConsentBody
            userName={user.name}
            isParent={isParent}
            childName={childName}
            documents={documents}
            loadError={loadError}
            phase={docsLoading ? phase : 'off'}
            ticked={ticked}
            onTick={tick}
            saving={saving}
            status={status}
            onSubmit={accept}
            onRetry={reload}
          />
        </Reveal>

        <DeclineLine
          isParent={isParent}
          onSignOut={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        />
      </div>
    </div>
  );
}

// Always there, and it changes nothing: the next sign-in asks again. Exported
// so scripts/ssr-privacy.jsx can render both sentences.
export function DeclineLine({ isParent = true, onSignOut }) {
  return (
    <div className="mt-4 text-center text-sm">
      <p className="text-fg-muted">
        {isParent ? (
          <>Declining ends portal use only; your child&rsquo;s school records stay as they are.</>
        ) : (
          <>Declining ends portal use only.</>
        )}
      </p>
      <button type="button" onClick={onSignOut} className={`${linkClass} inline-flex min-h-11 items-center`}>
        Sign out
      </button>
    </div>
  );
}

// Every tick the screen shows: the notice and the terms for everyone, and the
// child's for a parent.
function allTicked(documents, ticked, isParent) {
  return Boolean(documents) && ticked.privacy_notice && ticked.terms_of_use && (!isParent || ticked.child);
}

const BOX_CLASS =
  'mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent';

// The card's content, with no data loading and no router — exported so
// scripts/ssr-privacy.jsx can render every state of it. `phase` is
// useSkeleton's while the documents load ('off' once they are here or failed).
export function ConsentBody({
  userName,
  isParent = true,
  childName,
  documents,
  loadError,
  phase,
  ticked,
  onTick,
  saving,
  status,
  onSubmit,
  onRetry,
}) {
  const ready = allTicked(documents, ticked, isParent);
  const titleOf = (doc) => documents?.find((d) => d.document === doc)?.title;

  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-bold text-fg">Before you continue</h1>
        <p className="mt-2 text-sm text-fg-muted [overflow-wrap:anywhere]">
          {isParent ? (
            <>
              {userName}, please read the school&rsquo;s Data Privacy Notice and Terms of Use, then accept them for
              yourself and for your child.
            </>
          ) : (
            <>{userName}, please read the school&rsquo;s Data Privacy Notice and Terms of Use, then accept them.</>
          )}
        </p>
      </div>

      {loadError ? (
        <ErrorAlert message={loadError} onRetry={onRetry} />
      ) : !documents ? (
        <Skeleton phase={phase} label="Loading the documents…">
          <div className="space-y-6">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2">
                <SkeletonBar className="h-5 w-48" />
                <SkeletonBar className="h-28 w-full" round="rounded-lg" />
              </div>
            ))}
          </div>
        </Skeleton>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          {documents.map((doc) => (
            <section key={doc.document} aria-labelledby={`policy-${doc.document}`}>
              <h2 id={`policy-${doc.document}`} className="font-serif text-lg font-bold text-fg">
                {doc.title}
              </h2>
              {/* A scroll box for the approved text, which will be long. It
                  takes focus so a keyboard can scroll it. */}
              <div
                role="region"
                aria-label={`${doc.title} text`}
                tabIndex={0}
                className="mt-2 max-h-64 space-y-3 overflow-y-auto rounded-lg border border-edge bg-surface-subtle p-4 text-sm text-fg-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"
              >
                {paragraphs(doc.text).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}

          <fieldset className="space-y-2">
            <legend className="sr-only">Your acceptance</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-fg-body">
              <input
                type="checkbox"
                className={BOX_CLASS}
                checked={ticked.privacy_notice}
                onChange={onTick('privacy_notice')}
                disabled={saving}
              />
              <span>I have read and accept the {titleOf('privacy_notice') || 'Data Privacy Notice'}.</span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-fg-body">
              <input
                type="checkbox"
                className={BOX_CLASS}
                checked={ticked.terms_of_use}
                onChange={onTick('terms_of_use')}
                disabled={saving}
              />
              <span>I have read and agree to the {titleOf('terms_of_use') || 'Terms of Use'}.</span>
            </label>
            {isParent ? (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-fg-body [overflow-wrap:anywhere]">
                <input
                  type="checkbox"
                  className={BOX_CLASS}
                  checked={ticked.child}
                  onChange={onTick('child')}
                  disabled={saving}
                />
                <span>
                  As the parent or legal guardian of {childName || 'my child'}, I consent, on my child&rsquo;s behalf, to
                  the processing of my child&rsquo;s personal data for the purposes in the notice.
                </span>
              </label>
            ) : null}
          </fieldset>

          <Button variant="primary" size="lg" full type="submit" loading={saving} disabled={!ready}>
            {saving ? 'Saving…' : 'I agree and continue'}
          </Button>
          <FormStatus status={status} />
        </form>
      )}
    </>
  );
}
