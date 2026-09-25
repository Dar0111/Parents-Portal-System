import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import extractError from '../api/extractError';
import ErrorAlert from '../components/ErrorAlert';
import LoadingSpinner from '../components/LoadingSpinner';
import seal from '../assets/school-seal.png';

// ABOUT THE SCHOOL (pre-Stage-5 #5a, 2026-09-26). One component, four
// mounts: /admin/about, /teacher/about and /parent/about inside Shell (the
// last sidebar item of every role), and /about outside it, reachable from
// the login screen for a parent who wants the office phone without an
// account.
//
// EVERY SCHOOL VALUE COMES FROM SETTINGS, NOTHING IS HARDCODED: the name,
// address, DepEd School ID, email, phone and Facebook page are what
// Admin → Settings holds, read through GET /settings when signed in and
// GET /settings/public when not — the one unauthenticated settings read, and
// it carries exactly these six keys. A blank Facebook page says "Not yet
// recorded"; the school has not given the page's name and nothing is guessed.
//
// THE VISION, MISSION AND CORE VALUES ARE DEPED'S, NOT THE SCHOOL'S, so they
// are a constant here rather than a setting: the school adopts them as
// written, per DepEd Order No. 36, s. 2013 ("Our Department of Education
// Vision, Mission and Core Values (DepEd VMV)"), which makes them the only
// VMV every DepEd office and school uses. The wording below was checked
// against the Department's official page,
// https://www.deped.gov.ph/about-deped/vision-mission-core-values-and-mandate/,
// on 2026-09-26 — the 2013 enclosure PDF itself is a scan with no text layer.
// Line breaks follow the page.
//
// The seal is the bundled image on its white disc (§9): logo_url is not read.
const DEPED_VISION = [
  'We dream of Filipinos who passionately love their country and whose values and competencies enable them to realize their full potential and contribute meaningfully to building the nation.',
  'As a learner-centered public institution, the Department of Education continuously improves itself to better serve its stakeholders.',
];
const DEPED_MISSION_LEAD =
  'To protect and promote the right of every Filipino to quality, equitable, culture-based, and complete basic education where:';
const DEPED_MISSION_LINES = [
  ['Students', 'learn in a child-friendly, gender-sensitive, safe, and motivating environment.'],
  ['Teachers', 'facilitate learning and constantly nurture every learner.'],
  ['Administrators and staff', ', as stewards of the institution, ensure an enabling and supportive environment for effective learning to happen.'],
  ['Family, community, and other stakeholders', 'are actively engaged and share responsibility for developing life-long learners.'],
];
const DEPED_CORE_VALUES = ['Maka-Diyos', 'Maka-tao', 'Makakalikasan', 'Makabansa'];

function Detail({ label, value, href, empty = 'Not yet recorded' }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-1 text-sm text-fg">
        {value ? (
          href ? (
            <a href={href} className="text-brand underline-offset-2 hover:underline">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-fg-muted">{empty}</span>
        )}
      </dd>
    </div>
  );
}

// The page body, shared by the four mounts. Exported so a proof can render it
// with a fixture instead of a request (§14e).
export function AboutBody({ settings }) {
  const name = settings?.school_name || '';
  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        {/* The seal always sits on its own white disc — the source has a
            white field and no alpha, and the disc is white in both themes on
            purpose (§9). */}
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-seal-bg">
          <img src={seal} alt="Captain H. Francisco Elementary School seal" className="h-22 w-22 rounded-full" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-fg">{name || <span className="text-fg-muted">School name not recorded</span>}</h2>
          <p className="mt-1 text-sm text-fg-muted">A public elementary school of the Department of Education, Pateros, Metro Manila.</p>
        </div>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-fg">School details</h3>
        <dl className="mt-3 grid gap-4 rounded-lg border border-edge bg-surface-subtle px-4 py-4 sm:grid-cols-2">
          <Detail label="Address" value={settings?.school_address} empty="Not recorded" />
          <Detail label="DepEd School ID" value={settings?.school_id} empty="Not recorded" />
          <Detail label="Email" value={settings?.school_email} href={settings?.school_email ? `mailto:${settings.school_email}` : null} empty="Not recorded" />
          <Detail label="Phone" value={settings?.school_phone} href={settings?.school_phone ? `tel:${settings.school_phone.replace(/[\s\-().]/g, '')}` : null} empty="Not recorded" />
          <Detail label="Facebook page" value={settings?.facebook_page} />
        </dl>
      </section>

      <section className="space-y-6">
        <p className="text-sm text-fg-muted">
          The school adopts the Department of Education's Vision, Mission and Core Values — DepEd Order No. 36,
          s. 2013.
        </p>
        <div>
          <h3 className="text-sm font-semibold text-fg">The DepEd Vision</h3>
          {DEPED_VISION.map((paragraph) => (
            <p key={paragraph.slice(0, 24)} className="mt-2 text-sm leading-relaxed text-fg-body">
              {paragraph}
            </p>
          ))}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-fg">The DepEd Mission</h3>
          <p className="mt-2 text-sm leading-relaxed text-fg-body">{DEPED_MISSION_LEAD}</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-fg-body">
            {DEPED_MISSION_LINES.map(([subject, rest]) => (
              <li key={subject}>
                <strong className="font-semibold text-fg">{subject}</strong>
                {rest.startsWith(',') ? rest : ` ${rest}`}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-fg">Our Core Values</h3>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm italic text-fg-body">
            {DEPED_CORE_VALUES.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

export default function AboutPage({ publicView = false }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Retry re-runs the effect below by bumping this; the effect itself sets
  // no state synchronously (only in the request's callbacks), which is what
  // oxlint's set-state-in-effect rule is about.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get(publicView ? '/settings/public' : '/settings', { unwrap: 'settings' })
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err) => {
        if (!cancelled) setError(extractError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicView, attempt]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  const body = loading && !settings ? (
    <LoadingSpinner className="py-16" label="Loading school details…" />
  ) : !settings ? (
    <ErrorAlert message={error || 'School details could not be loaded.'} onRetry={load} />
  ) : (
    <AboutBody settings={settings} />
  );

  if (!publicView) return body;

  // Signed-out frame: the same page inside a plain card on the page
  // background, with a way back to the login screen. No Shell, no sidebar.
  return (
    <div className="min-h-screen bg-page px-4 py-8">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-edge bg-surface p-6 shadow-sm sm:p-8">
        {body}
        <p className="mt-8 text-sm">
          <Link to="/login" className="font-medium text-brand underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
