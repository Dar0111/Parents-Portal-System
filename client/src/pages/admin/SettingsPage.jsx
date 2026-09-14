import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import { usePageTitle } from '../../layout/usePageTitle';

// Admin school settings — Figure 5 process 1.25 (School Information
// Management). SCHOOL settings, not account settings: Teacher and Parent
// Settings change the logged-in user's contact number and password; this
// page changes the five system_settings rows every role reads. The header
// says "School settings" and the first line says so, because the sidebar
// word is the same on all three roles.
//
// SIBLING SHAPE: stacked sections, each with its own form and its own Save,
// one page-level success/error strip, locked values in the same grey Field
// box Teacher and Parent Settings use.
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
// Nothing in the client displays school_name, school_address or logo_url.
// Saving them changes no other screen. Copy does not claim otherwise.
//
// Both sections write through PATCH /settings, sending only changed keys:
// validated before any write, one transaction, and the activity log names
// the keys. The PATCH response is NOT rendered — it reads system_settings
// without the allow-list filter GET / has (flagged server-side). §5b:
// `stored` comes from load() only; drafts are separate and null until the
// admin types. After a successful save, load() re-reads the database.
//
// §5e: no confirmation. Every value is reversible by saving again and is on
// screen; the term only sets a starting selection teachers can override.

const TERMS = ['1', '2', '3'];

function Field({ label, value, empty = 'Not recorded' }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">
        {value ? value : <span className="text-slate-400">{empty}</span>}
      </dd>
    </div>
  );
}

function detailsFrom(stored) {
  return {
    school_name: stored?.school_name ?? '',
    school_address: stored?.school_address ?? '',
    logo_url: stored?.logo_url ?? '',
  };
}

export default function AdminSettingsPage() {
  usePageTitle('School settings');

  const [stored, setStored] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // null = follow the stored value. A value means the admin is editing.
  const [termDraft, setTermDraft] = useState(null);
  const [detailsDraft, setDetailsDraft] = useState(null);
  const [saving, setSaving] = useState(null); // 'term' | 'details' | null

  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);

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
    setSaveError(null);
    setSaveMessage(null);
    if (!TERMS.includes(termValue)) {
      setSaveError('Pick Term 1, 2, or 3.');
      return;
    }
    setSaving('term');
    try {
      await api.patch('/settings', { settings: { current_term: termValue } }, { unwrap: 'message' });
      setTermDraft(null);
      setSaveMessage(`Current term set to Term ${termValue}.`);
      await load();
    } catch (err) {
      setSaveError(extractError(err));
    } finally {
      setSaving(null);
    }
  }

  async function saveDetails(event) {
    event.preventDefault();
    setSaveError(null);
    setSaveMessage(null);
    if (!details.school_name.trim() || !details.school_address.trim()) {
      setSaveError('School name and school address must not be empty.');
      return;
    }
    setSaving('details');
    try {
      await api.patch('/settings', { settings: changedDetails }, { unwrap: 'message' });
      setDetailsDraft(null);
      setSaveMessage('School details updated.');
      await load();
    } catch (err) {
      setSaveError(extractError(err));
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
      <p className="text-sm text-slate-500">
        These settings belong to the school, not to your account.
      </p>

      {saveError ? (
        <ErrorAlert message={saveError} />
      ) : saveMessage ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <i className="fa-solid fa-circle-check text-emerald-600" />
          <p className="text-sm text-emerald-800">{saveMessage}</p>
        </div>
      ) : null}

      {error ? <ErrorAlert message={error} onRetry={load} /> : null}

      <section className="max-w-md space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">School year and term</h2>
        <dl className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
          <Field label="School year" value={stored.academic_year} />
        </dl>
        {/* §5i: says it cannot be changed here and why; does not promise
            where it can be — no such screen or process exists. */}
        <p className="text-sm text-slate-500">
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
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === 'term' ? 'Saving…' : 'Save term'}
          </button>
        </form>
      </section>

      <section className="max-w-md space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">School details</h2>
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
            label="Logo URL"
            type="url"
            value={details.logo_url}
            onChange={(e) => editDetail('logo_url', e.target.value)}
            hint="A web address to an image. Leave blank for no logo. This page does not upload files."
          />
          <button
            type="submit"
            disabled={saving !== null || !detailsDirty}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === 'details' ? 'Saving…' : 'Save school details'}
          </button>
        </form>
      </section>
    </div>
  );
}
