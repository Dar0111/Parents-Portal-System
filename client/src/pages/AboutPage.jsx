import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import extractError from '../api/extractError';
import ErrorAlert from '../components/ErrorAlert';
import LoadingSpinner from '../components/LoadingSpinner';
import seal from '../assets/school-seal.png';

// ABOUT THE SCHOOL (pre-Stage-5 #5a, 2026-09-26; redesigned the same day per
// the canvas board "About · admin · proposed layout"). One component, four
// mounts: /admin/about, /teacher/about and /parent/about inside Shell (the
// last sidebar item of every role), and /about outside it, reachable from
// the login screen for a parent who wants the office phone without an
// account.
//
// EVERY SCHOOL VALUE COMES FROM SETTINGS, NOTHING IS HARDCODED: the name,
// address, DepEd School ID, email, phone and Facebook page are what
// Admin → Settings holds, read through GET /settings when signed in and
// GET /settings/public when not — the one unauthenticated settings read, and
// it carries exactly those six keys. The hero's two other pills — the school
// year (settings.academic_year) and the section count (GET /sections for
// that year) — need a signed-in read, so the PUBLIC view shows the School ID
// pill alone rather than guessing at the other two. A blank Facebook page
// says "Not yet recorded"; the school has not given the page's name and
// nothing is guessed. The board's "School head" tile is dropped: there is no
// principal_name setting, and a placeholder tile is a claim (§5i).
//
// THE VISION, MISSION, CORE VALUES AND MANDATE ARE DEPED'S, NOT THE
// SCHOOL'S, so they are constants here rather than settings. The school
// adopts the VMV as written, per DepEd Order No. 36, s. 2013 ("Our
// Department of Education Vision, Mission and Core Values (DepEd VMV)"); the
// Mandate is the Department's under Republic Act 9155, as the Department
// publishes it. All four were checked word for word against the official
// page, https://www.deped.gov.ph/about-deped/vision-mission-core-values-and-mandate/,
// on 2026-09-26 — the 2013 enclosure PDF itself is a scan with no text layer.
// Where the design board's transcription differed from that page ("vis-à-vis",
// "present-day", "Governance of Basic Education Act of 2001,") the page's
// wording is used ("vis a vis", "present day", "act of 2001 which"). The
// English glosses under the Core Values are the board's, not DepEd's, and
// are styled as glosses.
//
// The seal is the bundled image on its white disc (§9): logo_url is not read.
// Colours are tokens only; the hero is `brand-panel` with its checked
// foregrounds, the pills sit on `brand-panel-lit` (the pair the login panel
// already checks), and every card pair is one DataTable and Settings use.
const DEPED_VISION = [
  'We dream of Filipinos who passionately love their country and whose values and competencies enable them to realize their full potential and contribute meaningfully to building the nation.',
  'As a learner-centered public institution, the Department of Education continuously improves itself to better serve its stakeholders.',
];
const DEPED_MISSION_LEAD =
  'To protect and promote the right of every Filipino to quality, equitable, culture-based, and complete basic education where:';
const DEPED_MISSION_LINES = [
  ['Students', ' learn in a child-friendly, gender-sensitive, safe, and motivating environment.'],
  ['Teachers', ' facilitate learning and constantly nurture every learner.'],
  ['Administrators and staff', ', as stewards of the institution, ensure an enabling and supportive environment for effective learning to happen.'],
  ['Family, community, and other stakeholders', ' are actively engaged and share responsibility for developing life-long learners.'],
];
const DEPED_CORE_VALUES = [
  ['Maka-Diyos', 'God-loving'],
  ['Maka-tao', 'Humane'],
  ['Makakalikasan', 'Nature-caring'],
  ['Makabansa', 'Nation-loving'],
];
const DEPED_MANDATE = [
  'The Department of Education was established through the Education Decree of 1863 as the Superior Commission of Primary Instruction under a Chairman. The Education agency underwent many reorganization efforts in the 20th century in order to better define its purpose vis a vis the changing administrations and charters. The present day Department of Education was eventually mandated through Republic Act 9155, otherwise known as the Governance of Basic Education act of 2001 which establishes the mandate of this agency.',
  'The Department of Education (DepEd) formulates, implements, and coordinates policies, plans, programs and projects in the areas of formal and non-formal basic education. It supervises all elementary and secondary education institutions, including alternative learning systems, both public and private; and provides for the establishment and maintenance of a complete, adequate, and integrated system of basic education relevant to the goals of national development.',
];

// The district line and "Est. 1961" are the login panel's own constants —
// the district is a fact of the address, the year is on the seal.
const EYEBROW = 'Pateros District · Metro Manila · Est. 1961';

function Pill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-panel-lit px-3 py-1 text-xs font-medium text-brand-panel-fg">
      {children}
    </span>
  );
}

// THE TILE MUST SHRINK BELOW ITS LONGEST WORD (pre-Stage-5 #7 follow-up,
// 2026-09-26). The Facebook page is one 66-character URL with no space in
// it. `break-words` is `overflow-wrap: break-word`, which wraps a long word
// only AFTER the box has been sized — it does not reduce the min-content
// width a grid or flex item claims — so the tile grew to 522px inside a
// 390px viewport and the whole page scrolled sideways (smoke, 390px, all
// three /about routes). `overflow-wrap: anywhere` is the value that DOES
// count the break opportunity in min-content, and it goes on the element
// whose text it is: the <a> for a link, the <p> otherwise. Both the outer
// grid item and the text column carry `min-w-0`, or their `min-width: auto`
// would still hold the tile open.
function DetailTile({ icon, label, value, href, empty = 'Not recorded' }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-brand"
      >
        <i className={`fa-solid ${icon}`} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
        <p className="mt-0.5 text-sm text-fg [overflow-wrap:anywhere]">
          {value ? (
            href ? (
              <a href={href} className="text-brand underline-offset-2 [overflow-wrap:anywhere] hover:underline">
                {value}
              </a>
            ) : (
              value
            )
          ) : (
            <span className="text-fg-muted">{empty}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function SectionHeading({ icon, children }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-subtle text-brand">
        <i className={`fa-solid ${icon}`} />
      </span>
      <h3 className="text-sm font-semibold text-fg">{children}</h3>
    </div>
  );
}

function sectionSummary(sections) {
  if (!sections || sections.length === 0) return null;
  const grades = sections.map((s) => Number(s.grade_level)).filter(Number.isInteger);
  const lo = Math.min(...grades);
  const hi = Math.max(...grades);
  const range = lo === hi ? `Grade ${lo}` : `Grades ${lo}–${hi}`;
  return `${sections.length} ${sections.length === 1 ? 'section' : 'sections'} · ${range}`;
}

// The page body, shared by the four mounts. Exported so a proof can render it
// with a fixture instead of a request (§14e). `sections` is null when the
// mount could not read them (the public view) and the pill is simply absent.
export function AboutBody({ settings, sections = null }) {
  const name = settings?.school_name || '';
  const schoolYear = settings?.academic_year || '';
  const sectionsPill = sectionSummary(sections);
  const phoneHref = settings?.school_phone ? `tel:${settings.school_phone.replace(/[\s\-().]/g, '')}` : null;
  const facebook = settings?.facebook_page || '';
  const facebookHref = /^https?:\/\//i.test(facebook) ? facebook : null;

  return (
    <div className="space-y-6">
      {/* THE HERO BAND — brand navy in both themes, like the parent hero. */}
      <section className="rounded-xl bg-brand-panel p-6 text-brand-panel-fg sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
          {/* The seal always sits on its own white disc (§9): the source has
              a white field and no alpha, and the disc is white in both themes
              on purpose. */}
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-seal-bg sm:h-28 sm:w-28">
            <img src={seal} alt="Captain H. Francisco Elementary School seal" className="h-22 w-22 rounded-full sm:h-26 sm:w-26" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-panel-muted">{EYEBROW}</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight">
              {name || <span className="text-brand-panel-muted">School name not recorded</span>}
            </h2>
            <p className="mt-2 text-sm text-brand-panel-muted">
              A public elementary school of the Department of Education, Pateros, Metro Manila.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              {settings?.school_id ? <Pill>DepEd School ID {settings.school_id}</Pill> : null}
              {schoolYear ? <Pill>School Year {schoolYear}</Pill> : null}
              {sectionsPill ? <Pill>{sectionsPill}</Pill> : null}
            </div>
          </div>
        </div>
      </section>

      {/* SCHOOL DETAILS — three columns on desktop, one on a phone. */}
      <section className="rounded-xl border border-edge bg-surface p-5">
        <h3 className="text-sm font-semibold text-fg">School details</h3>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <DetailTile icon="fa-location-dot" label="Address" value={settings?.school_address} />
          <DetailTile
            icon="fa-envelope"
            label="Email"
            value={settings?.school_email}
            href={settings?.school_email ? `mailto:${settings.school_email}` : null}
          />
          <DetailTile icon="fa-phone" label="Phone" value={settings?.school_phone} href={phoneHref} />
          <DetailTile icon="fa-id-card" label="DepEd School ID" value={settings?.school_id} />
          <DetailTile icon="fa-share-nodes" label="Facebook page" value={facebook} href={facebookHref} empty="Not yet recorded" />
        </div>
      </section>

      <p className="text-sm text-fg-muted">
        The school adopts the Department of Education's Vision, Mission and Core Values — DepEd Order No. 36,
        s. 2013. The Mandate is the Department's under Republic Act 9155, as the Department publishes it.
      </p>

      {/* VISION + MISSION side by side at lg, stacked below. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-edge bg-surface p-5">
          <SectionHeading icon="fa-eye">The DepEd Vision</SectionHeading>
          {/* Index keys, deliberately: these are static constants, and the two
              Mandate paragraphs below both begin "The Department of Educat…",
              which is how a prefix key collided (smoke, 2026-09-26). */}
          {DEPED_VISION.map((paragraph, i) => (
            <p key={i} className="mt-3 text-sm leading-relaxed text-fg-body">
              {paragraph}
            </p>
          ))}
        </section>
        <section className="rounded-xl border border-edge bg-surface p-5">
          <SectionHeading icon="fa-bullseye">The DepEd Mission</SectionHeading>
          <p className="mt-3 text-sm leading-relaxed text-fg-body">{DEPED_MISSION_LEAD}</p>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg-body">
            {DEPED_MISSION_LINES.map(([subject, rest]) => (
              <li key={subject} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <span>
                  <strong className="font-semibold text-fg">{subject}</strong>
                  {rest}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* CORE VALUES — four tiles; the gloss is the board's, styled as one. */}
      <section className="rounded-xl border border-edge bg-surface p-5">
        <SectionHeading icon="fa-heart">Our Core Values</SectionHeading>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DEPED_CORE_VALUES.map(([value, gloss]) => (
            <li key={value} className="rounded-lg bg-surface-subtle px-4 py-3 text-center">
              <p className="text-sm font-semibold italic text-fg">{value}</p>
              <p className="mt-0.5 text-xs text-fg-muted">{gloss}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-5">
        <SectionHeading icon="fa-landmark">The DepEd Mandate</SectionHeading>
        {DEPED_MANDATE.map((paragraph, i) => (
          <p key={i} className="mt-3 text-sm leading-relaxed text-fg-body">
            {paragraph}
          </p>
        ))}
      </section>
    </div>
  );
}

export default function AboutPage({ publicView = false }) {
  const [settings, setSettings] = useState(null);
  const [sections, setSections] = useState(null);
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
        if (cancelled) return null;
        setSettings(data);
        // The section count is a signed-in read (GET /sections is
        // authenticated) for the year settings names; a failure here
        // hides the pill and nothing else — the page is the details, not
        // the count.
        if (publicView) return null;
        const params = data?.academic_year ? { school_year: data.academic_year } : {};
        return api
          .get('/sections', { unwrap: 'sections', params })
          .then((rows) => {
            if (!cancelled) setSections(rows);
          })
          .catch(() => {
            if (!cancelled) setSections(null);
          });
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
    <AboutBody settings={settings} sections={sections} />
  );

  if (!publicView) return body;

  // Signed-out frame: the same page on the page background, no Shell, no
  // sidebar, and a way back to the login screen. The hero band is its own
  // surface, so it reads the same with or without the sidebar beside it.
  return (
    <div className="min-h-screen bg-page px-4 py-8">
      <div className="mx-auto w-full max-w-4xl">
        {body}
        <p className="mt-8 text-center text-sm">
          <Link to="/login" className="inline-flex items-center gap-2 font-medium text-fg-muted transition hover:text-fg">
            <i aria-hidden="true" className="fa-solid fa-arrow-left text-xs" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
