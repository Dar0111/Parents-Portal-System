import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';

// Admin → Settings → School settings — Figure 5 process 1.25 (School
// Information Management). The body of the former admin/SettingsPage.jsx,
// moved under SettingsLayout as the admin's index tab on 2026-09-18 with its
// behaviour unchanged. SCHOOL settings, not account settings: the admin's own
// account lives on the Account information tab beside this one.
//
// TWO SECTIONS, TWO SAVES. The term is the one value that changes what
// someone else sees; separate saves mean fixing an address typo can never
// also change the term.
//
// academic_year is LOCKED ON THIS PAGE ONLY. It is still in the server's
// ALLOWED_KEYS and PUT/PATCH still accept it. Sections, grading_mode_configs,
// grade_weight_configs and transmutation_table are all keyed on school_year,
// and changing the setting moves none of them (POST /students and
// GET /grading-modes would 409; existing grades would drop off report
// cards). Starting a new school year is a process, not a field. Do not
// "fix" this into an editable input.
//
// current_term does ONE thing: Teacher → Grades pre-selects it on load
// (teacher/GradesPage.jsx loadStudents). The teacher can pick another term
// there, and grade writes take the term from the request. No server route
// reads current_term. Copy says exactly that and no more (§5i).
//
// WHO READS WHAT (pre-Stage-5 #5a, 2026-09-26). school_name prints on the
// Class summary masthead, the learner summary and the parent report card,
// and heads the About page — "– Main" is part of the official name, so it
// prints there too. school_address, school_id, school_email, school_phone
// and facebook_page are read by the About page only (signed in through
// GET /settings, signed out through GET /settings/public). logo_url is read
// by nothing; the seal the app shows is the bundled image.
//
// Both sections write through PATCH /settings, sending only changed keys:
// validated before any write, one transaction, and the activity log names
// the keys. §5b: `stored` comes from load() only; drafts are separate and
// null until the admin types. After a successful save, load() re-reads.
//
// §5e: no confirmation. Every value is reversible by saving again and is on
// screen; the term only sets a starting selection teachers can override.

const TERMS = ['1', '2', '3'];

function Field({ label, value, empty = 'Not recorded' }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-1 text-sm text-fg">
        {value ? value : <span className="text-fg-muted">{empty}</span>}
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
  const [termDraft, setTermDraft] = useState(null);
  const [detailsDraft, setDetailsDraft] = useState(null);
  const [saving, setSaving] = useState(null); // 'term' | 'details' | null

  // One status object keyed by form. Two sections, two saves: each reports
  // under its own button. See FormStatus.
  const [status, setStatus] = useState({});

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

  const storedTerm = stored?.current_term ?? '';
  const termValue = termDraft === null ? storedTerm : termDraft;
  const termDirty = termValue !== storedTerm;

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

  async function saveTerm(event) {
    event.preventDefault();
    setStatus({});
    if (!TERMS.includes(termValue)) {
      setStatus({ term: fail('Pick Term 1, 2, or 3.') });
      return;
    }
    setSaving('term');
    try {
      await api.patch('/settings', { settings: { current_term: termValue } }, { unwrap: 'message' });
      setTermDraft(null);
      setStatus({ term: ok(`Current term set to Term ${termValue}.`) });
      await load();
    } catch (err) {
      setStatus({ term: fail(extractError(err)) });
    } finally {
      setSaving(null);
    }
  }

  async function saveDetails(event) {
    event.preventDefault();
    setStatus({});
    if (!details.school_name.trim() || !details.school_address.trim()) {
      setStatus({ details: fail('School name and school address must not be empty.') });
      return;
    }
    setSaving('details');
    try {
      await api.patch('/settings', { settings: changedDetails }, { unwrap: 'message' });
      setDetailsDraft(null);
      setStatus({ details: ok('School details updated.') });
      await load();
    } catch (err) {
      setStatus({ details: fail(extractError(err)) });
    } finally {
      setSaving(null);
    }
  }

  if (loading && !stored) return <LoadingSpinner className="py-16" label="Loading school settings…" />;

  if (!stored) {
    return <ErrorAlert message={error || 'School settings could not be loaded.'} onRetry={load} />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-fg">School settings</h2>
        <p className="mt-1 text-sm text-fg-muted">
          These settings belong to the school, not to your account. Your own account is under
          Account information.
        </p>
      </div>

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      <section className="max-w-md space-y-3">
        <h3 className="text-sm font-semibold text-fg">School year and term</h3>
        <dl className="grid gap-4 rounded-lg border border-edge bg-surface-subtle px-4 py-4">
          <Field label="School year" value={stored.academic_year} />
        </dl>
        {/* §5i: says it cannot be changed here and why; does not promise
            where it can be — no such screen or process exists. */}
        <p className="text-sm text-fg-muted">
          The school year cannot be changed here. Sections, grading setup and existing grades are
          all tied to the school year, and changing this value would not move any of them.
        </p>
        <form onSubmit={saveTerm} className="space-y-3">
          <FormField
            label="Current term"
            as="select"
            value={termValue}
            onChange={(e) => setTermDraft(e.target.value)}
            hint="Teacher → Grades opens on this term. Teachers can still pick another term there; nothing is locked to it."
          >
            {TERMS.includes(storedTerm) ? null : <option value="">Not set</option>}
            {TERMS.map((t) => (
              <option key={t} value={t}>
                Term {t}
              </option>
            ))}
          </FormField>
          <button
            type="submit"
            disabled={saving !== null || !termDirty}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === 'term' ? 'Saving…' : 'Save term'}
          </button>
          <FormStatus status={status.term} />
        </form>
      </section>

      <section className="max-w-md space-y-3">
        <h3 className="text-sm font-semibold text-fg">School details</h3>
        <form onSubmit={saveDetails} className="space-y-3">
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
          <FormField
            label="DepEd School ID"
            inputMode="numeric"
            maxLength={6}
            value={details.school_id}
            onChange={(e) => editDetail('school_id', e.target.value)}
            hint="Six digits. Shown on the About page."
          />
          <FormField
            label="School email"
            type="email"
            value={details.school_email}
            onChange={(e) => editDetail('school_email', e.target.value)}
            hint="Shown on the About page. This is the school's address, not yours."
          />
          <FormField
            label="School phone"
            inputMode="tel"
            value={details.school_phone}
            onChange={(e) => editDetail('school_phone', e.target.value)}
            hint="A landline or a mobile number, 7 to 15 digits. Shown on the About page."
          />
          <FormField
            label="Facebook page"
            value={details.facebook_page}
            onChange={(e) => editDetail('facebook_page', e.target.value)}
            hint="The page's name or address. Leave blank until the school gives one — the About page then says so."
          />
          <FormField
            label="Logo URL"
            type="url"
            value={details.logo_url}
            onChange={(e) => editDetail('logo_url', e.target.value)}
            hint="A web address to an image. Leave blank for no logo. This page does not upload files."
          />
          <button
            type="submit"
            disabled={saving !== null || !detailsDirty}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === 'details' ? 'Saving…' : 'Save school details'}
          </button>
          <FormStatus status={status.details} />
        </form>
      </section>
    </div>
  );
}
