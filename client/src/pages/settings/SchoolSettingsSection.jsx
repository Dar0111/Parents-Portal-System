import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import SectionHeader from '../../components/SectionHeader';
import { longDate, todayLocalDateString } from '../../format/date';
import { currentTerm, termDates } from '../../format/schoolCalendar';

// Admin → Settings → School settings — Figure 5 process 1.25 (School
// Information Management). The body of the former admin/SettingsPage.jsx,
// moved under SettingsLayout as the admin's index tab on 2026-09-18 with its
// behaviour unchanged. SCHOOL settings, not account settings: the admin's own
// account lives on the Account information tab beside this one.
//
// TWO SECTIONS, ONE SAVE. The school year and the term are read-only here;
// the school details are the only form.
//
// academic_year is LOCKED ON THIS PAGE ONLY. It is still in the server's
// ALLOWED_KEYS and PUT/PATCH still accept it. Sections, grading_mode_configs,
// grade_weight_configs and transmutation_table are all keyed on school_year,
// and changing the setting moves none of them (POST /students and
// GET /grading-modes would 409; existing grades would drop off report
// cards). Starting a new school year is a process, not a field. Do not
// "fix" this into an editable input.
//
// THE TERM IS NOT A SETTING (pre-Stage-5 #7, 2026-09-26). It used to be a
// picker here writing `current_term`; now every screen derives it from
// today's date through format/schoolCalendar.js (the server's own copy
// decides), so the picker, its save and the key are gone. This page shows
// the derived term and its dates so an admin can see what the app will say,
// and says where it comes from (§5i).
//
// WHO READS WHAT (pre-Stage-5 #5a, 2026-09-26). school_name prints on the
// Class summary masthead, the learner summary and the parent report card,
// and heads the About page — "– Main" is part of the official name, so it
// prints there too. school_address, school_id, school_email, school_phone
// and facebook_page are read by the About page only (signed in through
// GET /settings, signed out through GET /settings/public). logo_url is read
// by nothing; the seal the app shows is the bundled image.
//
// The details form writes through PATCH /settings, sending only changed
// keys: validated before any write, one transaction, and the activity log
// names the keys. §5b: `stored` comes from load() only; the draft is separate
// and null until the admin types. After a successful save, load() re-reads.
//
// §5e: no confirmation. Every value is reversible by saving again and is on
// screen.

// A sub-section's title: the icon chip and the title face — the same markup
// Account information's sub-sections use, so the two tabs read alike. The
// chip is decoration (aria-hidden), and the flex sits on the span, never on
// the `fa-solid` element.
function SubHeading({ icon, children }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"
      >
        <i className={`fa-solid ${icon}`} />
      </span>
      <h3 className="min-w-0 font-serif text-base font-bold text-fg">{children}</h3>
    </div>
  );
}

// A read-only fact in the band: the label in the eyebrow style, the value
// under it. `figure` prints the value as a figure (the school year); `locked`
// puts a small lock beside it — decoration only (aria-hidden), the sentence
// under the band is what says the value cannot be changed here.
function Field({ label, value, empty = 'Not recorded', figure = false, locked = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</dt>
      <dd
        className={`mt-1 flex items-center gap-2 text-fg ${figure ? 'text-xl font-bold tabular-nums' : 'text-sm'}`}
      >
        {value ? <span className="min-w-0">{value}</span> : <span className="text-sm font-normal text-fg-muted">{empty}</span>}
        {locked ? (
          <span aria-hidden="true" className="flex shrink-0 items-center justify-center text-sm text-fg-faint">
            <i className="fa-solid fa-lock" />
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function detailsFrom(stored) {
  return {
    school_name: stored?.school_name ?? '',
    school_address: stored?.school_address ?? '',
    logo_url: stored?.logo_url ?? '',
    school_id: stored?.school_id ?? '',
    school_email: stored?.school_email ?? '',
    school_phone: stored?.school_phone ?? '',
    facebook_page: stored?.facebook_page ?? '',
  };
}

export default function SchoolSettingsSection() {
  const [stored, setStored] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // null = follow the stored value. A value means the admin is editing.
  const [detailsDraft, setDetailsDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  // One status object keyed by form (FormStatus). One form is left, but the
  // shape stays so a second form can never share its slot.
  const [status, setStatus] = useState({});

  // The term the app is showing everyone today, and its dates. Derived once
  // per mount — a settings page open across midnight on a boundary shows the
  // day it was opened, and a reload shows the new term; nothing here writes.
  const [term] = useState(() => currentTerm(todayLocalDateString()));
  const { start: termStart, end: termEnd } = termDates(term);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await api.get('/settings', { unwrap: 'settings' });
      setStored(settings);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const storedDetails = detailsFrom(stored);
  const details = detailsDraft === null ? storedDetails : detailsDraft;
  const changedDetails = {};
  for (const key of Object.keys(storedDetails)) {
    const next = details[key].trim();
    if (next !== storedDetails[key]) changedDetails[key] = next;
  }
  const detailsDirty = Object.keys(changedDetails).length > 0;

  function editDetail(key, value) {
    setDetailsDraft((prev) => ({ ...(prev ?? storedDetails), [key]: value }));
  }

  async function saveDetails(event) {
    event.preventDefault();
    setStatus({});
    if (!details.school_name.trim() || !details.school_address.trim()) {
      setStatus({ details: fail('School name and school address must not be empty.') });
      return;
    }
    setSaving(true);
    try {
      await api.patch('/settings', { settings: changedDetails }, { unwrap: 'message' });
      setDetailsDraft(null);
      setStatus({ details: ok('School details updated.') });
      await load();
    } catch (err) {
      setStatus({ details: fail(extractError(err)) });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !stored) return <LoadingSpinner className="py-16" label="Loading school settings…" />;

  if (!stored) {
    return <ErrorAlert message={error || 'School settings could not be loaded.'} onRetry={load} />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="School settings"
        description="These settings belong to the school, not to your account. Your own account is under Account information."
      />

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      {/* `max-w-2xl`, not `max-w-md` (fix/polish, 2026-09-26): the panel
          SettingsLayout gives this tab is 42.5rem wide, and a 28rem cap
          inside it left the right third of the screen empty on a desktop.
          The short pairs below sit side by side from `sm`; below it every
          field stacks as before. */}
      <section className="max-w-2xl space-y-3 border-t border-edge-soft pt-6">
        <SubHeading icon="fa-calendar-days">School year and term</SubHeading>
        <dl className="grid gap-4 rounded-xl border border-edge bg-surface-subtle p-4">
          <Field label="School year" value={stored.academic_year} figure locked />
          <Field
            label="Current term"
            value={`Term ${term} — from the school calendar, ${longDate(termStart)} – ${longDate(termEnd)}`}
          />
        </dl>
        {/* §5i: says it cannot be changed here and why; does not promise
            where it can be — no such screen or process exists.

            THE TERM SENTENCE NAMES ITS SCREENS (fix/smoke-gate). It said
            "every screen that opens on a term uses the same rule", and the
            report card does not: on a phone it opens on the latest term that
            has a grade in it (ReportCard.jsx), which is kept by decision. The
            dashboards, the class record and the class summary do follow the
            calendar; the report card's desktop view shows all three terms, so
            only the phone view "opens on" one.

            `max-w-prose`: five sentences of reading text, kept to a
            readable line instead of the section's full 42rem. */}
        <p className="max-w-prose text-sm text-fg-muted">
          The school year cannot be changed here. Sections, grading setup and existing grades are
          all tied to the school year, and changing this value would not move any of them. The
          current term is not a setting either: it follows today&rsquo;s date on the school
          calendar. The dashboards, Grades and the class summary open on it; on a phone, a report
          card opens on the latest term that has a grade in it.
        </p>
      </section>

      <section className="max-w-2xl space-y-3 border-t border-edge-soft pt-6">
        <SubHeading icon="fa-building-columns">School details</SubHeading>
        <form onSubmit={saveDetails} className="space-y-4">
          <FormField
            label="School name"
            value={details.school_name}
            onChange={(e) => editDetail('school_name', e.target.value)}
            required
          />
          <FormField
            label="School address"
            as="textarea"
            rows={2}
            value={details.school_address}
            onChange={(e) => editDetail('school_address', e.target.value)}
            required
          />
          {/* Two short pairs share a row from `sm` — the ID beside the
              phone, the email beside the Facebook page — so the widened
              section does not read as one long column of narrow facts. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="DepEd School ID"
              inputMode="numeric"
              maxLength={6}
              value={details.school_id}
              onChange={(e) => editDetail('school_id', e.target.value)}
              hint="Six digits. Shown on the About page."
            />
            <FormField
              label="School phone"
              inputMode="tel"
              value={details.school_phone}
              onChange={(e) => editDetail('school_phone', e.target.value)}
              hint="A landline or a mobile number, 7 to 15 digits. Shown on the About page."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="School email"
              type="email"
              value={details.school_email}
              onChange={(e) => editDetail('school_email', e.target.value)}
              hint="Shown on the About page. This is the school's address, not yours."
            />
            <FormField
              label="Facebook page"
              value={details.facebook_page}
              onChange={(e) => editDetail('facebook_page', e.target.value)}
              hint="The page's name or address. Leave blank until the school gives one — the About page then says so."
            />
          </div>
          <FormField
            label="Logo URL"
            type="url"
            value={details.logo_url}
            onChange={(e) => editDetail('logo_url', e.target.value)}
            hint="A web address to an image. Leave blank for no logo. This page does not upload files."
          />
          <Button type="submit" variant="primary" disabled={saving || !detailsDirty}>
            {saving ? 'Saving…' : 'Save school details'}
          </Button>
          <FormStatus status={status.details} />
        </form>
      </section>
    </div>
  );
}
