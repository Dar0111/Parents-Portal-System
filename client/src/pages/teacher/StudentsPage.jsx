import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import { PersonCell } from '../../components/Avatar';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok } from '../../components/FormStatus';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
// NOTE: no `filterFieldClass` here. This page's Search keeps `min-w-56
// flex-1` — it is the primary control and was sized that way deliberately
// (item 5).
import FormField, { filterSelectClass } from '../../components/FormField';
import Modal from '../../components/Modal';
import { sectionOptions, showSectionFilter } from './students/sectionOptions';
import { useAuth } from '../../auth/AuthContext';
import PasswordField from '../../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../../components/PasswordChecklist';
import { passwordIsValid, passwordRuleHint } from '../../format/passwordRule';
import { lrnError, lrnRuleHint } from '../../format/lrnRule';
import { contactError, contactRuleHint } from '../../format/contactRule';
import StatusBadge from '../../components/StatusBadge';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher student list. Enroll (POST /students) plus a wizard step to create
// the pending parent. No Edit, no attendance history.
//
// WHO ENROLS — THE ADVISER (the school, 2026-09-23; built pre-Stage-5 #4,
// 2026-09-25). POST /students is gated on sections.adviser_id of the TARGET
// section, so the class picker is the sections this teacher ADVISES: GET
// /sections (adviser_id is on every row) filtered on the signed-in user's
// id. NOT GET /assignments — a subject teacher assigned to a class does not
// enrol into it, and an adviser with no subject rows (TCH-002 in the seed)
// does. `canEnroll` follows the same list; a teacher who advises nothing
// sees muted copy rather than a button that 403s.
//
// Read scope is still assigned OR adviser (utils/teacherScope.js), so the
// list and the Section FILTER are wider than Enroll: the filter's union in
// students/sectionOptions.js keeps taking the assignments list plus the
// loaded rows, because a filter narrows what is visible and is not a write
// scope. Do not reuse useTeacherTargets for either.
//
// POST /users/parents is gated the same way (the adviser of the learner's
// section), else 403 — and an unknown LRN is that same 403, never a 404.
// Wizard step 2 runs only after a successful enrol, so the LRN it sends is
// one this adviser just created in their own section; LRN is locked from
// the student row.

const EMPTY_ENROLL = {
  lrn: '',
  first_name: '',
  last_name: '',
  classKey: '',
  birthday: '',
  gender: '',
  address: '',
  contact_number: '',
};

const EMPTY_PARENT = {
  name: '',
  password: '',
  confirmPassword: '',
  email: '',
  contact_number: '',
};

function parseClassKey(classKey) {
  const i = String(classKey).indexOf('|');
  if (i < 0) return null;
  const grade_level = Number(classKey.slice(0, i));
  const section = classKey.slice(i + 1);
  if (!Number.isInteger(grade_level) || !section) return null;
  return { grade_level, section };
}

export default function StudentsPage() {
  usePageTitle('Students');

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Own assignment rows — feeds the Section FILTER's union only (see the
  // header). Enroll reads `advised` below.
  const [assignments, setAssignments] = useState([]);
  // The sections this teacher advises, from GET /sections' adviser_id: the
  // Enroll picker and the gate. [] for a teacher who advises nothing.
  const [advised, setAdvised] = useState([]);
  const { user } = useAuth();

  // Committed filter values — what has actually been sent to the API. Kept
  // separate from the input's own value so typing does not fire a request per
  // keystroke, and so the empty state can tell "no students at all" from "no
  // students matching a filter".
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [applied, setApplied] = useState({ search: '', section: '' });

  // Assembled once and TRIMMED, exactly as the commit below trims it (item 5)
  // — otherwise a trailing space would claim there were changes to apply and
  // then apply nothing. `isDirty` trims `search` again on both sides, so the
  // two agree even if this line is ever edited.
  const draftFilters = { search: search.trim(), section: section.trim() };
  const dirty = isDirty(draftFilters, applied);

  // Keyed status, one key. The wizard reports its own failures through
  // formError INSIDE the modal (already the right place); what survives the
  // modal closing is the success, and it belongs above the list it changed.
  //
  // The old `saveError` was dead state: it was only ever set to null, never
  // to a message, because every error path here writes formError instead.
  // It is gone rather than carried forward as an empty slot.
  const [status, setStatus] = useState({});

  const [wizardOpen, setWizardOpen] = useState(false);
  // enroll → confirm-enroll → parent → confirm-parent.
  // After enroll 201 there is no path back to enroll (that would POST again).
  const [phase, setPhase] = useState('enroll');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  // Field-level refusals — the client rule's (LRN, contact) or the server's
  // 400 with a `field` key (lrn, contact_number, birthday, gender) — render
  // under their input with a red border (§7c); everything else stays in the
  // form-level strip above. Cleared per field as it changes.
  const [fieldErrors, setFieldErrors] = useState({});
  const [enroll, setEnroll] = useState(EMPTY_ENROLL);
  const [parent, setParent] = useState(EMPTY_PARENT);
  const [enrolled, setEnrolled] = useState(null);
  const [revealed, setRevealed] = useState({ password: false, confirm: false });

  // Paged table (2026-09-19): one page of a server-sorted list (C1); a
  // filter or sort change resets to the first page (C6).
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // NOTE: ?status is deliberately NOT sent. The endpoint matches only
      // 'inactive' and 'all' as literals; everything else — including 'active'
      // — falls through to an active-only default, which is the one branch
      // that is actually verified. '?status=all' is recorded as UNVERIFIED
      // (the seed has zero inactive students, so its live check could not have
      // failed), and this page will not build on that. Consequence, recorded
      // as a known gap rather than hidden: a transferred-out student simply
      // disappears from this list with no explanation.
      const params = { ...listParams({ offset, sort }) };
      if (applied.search) params.search = applied.search;
      if (applied.section) params.section = applied.section;

      const result = await api.get('/students', { unwrap: ['students', 'page'], params });
      setStudents(result.students);
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
      setStudents([]);
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [applied, offset, sort]);

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/assignments', { unwrap: 'assignments' })
      .then((rows) => {
        if (!cancelled) setAssignments(rows);
      })
      .catch(() => {
        if (!cancelled) setAssignments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (!cancelled) setAdvised(rows.filter((sec) => Number(sec.adviser_id) === Number(user.id)));
      })
      .catch(() => {
        if (!cancelled) setAdvised([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // The classes this teacher is ASSIGNED to — the Section filter's first
  // source. Not the Enroll list.
  const assignedClasses = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const row of assignments) {
      const key = `${row.grade_level}|${row.section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        grade_level: row.grade_level,
        section: row.section,
        label: `Grade ${row.grade_level} - ${row.section}`,
      });
    }
    return out;
  }, [assignments]);

  // The Enroll picker: sections this teacher ADVISES (pre-Stage-5 #4). Same
  // shape as before so parseClassKey and the wizard are untouched.
  const classOptions = useMemo(
    () =>
      advised.map((sec) => ({
        key: `${sec.grade_level}|${sec.name}`,
        grade_level: sec.grade_level,
        section: sec.name,
        label: `Grade ${sec.grade_level} - ${sec.name}`,
      })),
    [advised]
  );

  const canEnroll = classOptions.length > 0;

  // The Section filter's options live in `students/sectionOptions.js` — a
  // pure module, so the three cases that matter (one section, two sections,
  // an adviser with no assignments) can be driven by a proof instead of
  // reasoned about. Its header carries why the union exists and why Enroll
  // must NOT use it.
  const filterSections = useMemo(() => sectionOptions(assignedClasses, students), [assignedClasses, students]);

  function applyFilters(event) {
    event.preventDefault();
    setOffset(0);
    setApplied(draftFilters);
  }

  function clearFilters() {
    setSearch('');
    setSection('');
    setOffset(0);
    setApplied({ search: '', section: '' });
  }

  function openWizard() {
    const first = classOptions[0];
    setEnroll({
      ...EMPTY_ENROLL,
      classKey: classOptions.length === 1 ? first.key : '',
    });
    setParent(EMPTY_PARENT);
    setEnrolled(null);
    setPhase('enroll');
    setFormError(null);
    setRevealed({ password: false, confirm: false });
    setWizardOpen(true);
  }

  function closeWizard() {
    if (saving) return;
    setWizardOpen(false);
    setPhase('enroll');
    setFormError(null);
    setFieldErrors({});
    setEnroll(EMPTY_ENROLL);
    setParent(EMPTY_PARENT);
    setEnrolled(null);
    setRevealed({ password: false, confirm: false });
  }

  function requestEnroll(event) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseClassKey(enroll.classKey);
    if (!enroll.lrn.trim() || !enroll.first_name.trim() || !enroll.last_name.trim() || !parsed) {
      setFormError('LRN, first name, last name, and class are required.');
      return;
    }
    // The client's copies of the LRN and contact rules (format/lrnRule.js,
    // format/contactRule.js); the server enforces the same on POST /students
    // and answers 400 with a `field` key.
    const clientErrors = {
      lrn: lrnError(enroll.lrn),
      contact_number: contactError(enroll.contact_number),
    };
    if (clientErrors.lrn || clientErrors.contact_number) {
      setFieldErrors(clientErrors);
      return;
    }
    setPhase('confirm-enroll');
  }

  async function submitEnroll() {
    const parsed = parseClassKey(enroll.classKey);
    if (!parsed) return;
    setSaving(true);
    setFormError(null);
    setStatus({});
    try {
      const body = {
        lrn: enroll.lrn.trim(),
        first_name: enroll.first_name.trim(),
        last_name: enroll.last_name.trim(),
        grade_level: parsed.grade_level,
        section: parsed.section,
      };
      if (enroll.birthday) body.birthday = enroll.birthday;
      if (enroll.gender) body.gender = enroll.gender;
      if (enroll.address.trim()) body.address = enroll.address.trim();
      if (enroll.contact_number.trim()) body.contact_number = enroll.contact_number.trim();

      const student = await api.post('/students', body, { unwrap: 'student' });
      setEnrolled(student);
      setPhase('parent');
      await load();
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field) setFieldErrors({ [field]: extractError(err) });
      else setFormError(extractError(err));
      setPhase('enroll');
    } finally {
      setSaving(false);
    }
  }

  function requestParent(event) {
    event.preventDefault();
    setFormError(null);
    if (!parent.name.trim() || !parent.password) {
      setFormError('Guardian name and password are required.');
      return;
    }
    // One rule, one module (format/passwordRule.js); the server enforces it
    // on POST /users/parents and answers 400 with field "password".
    if (!passwordIsValid(parent.password)) {
      setFormError(`Password: ${passwordRuleHint()}`);
      return;
    }
    if (parent.password !== parent.confirmPassword) {
      setFormError('New password and confirmation do not match.');
      return;
    }
    const contactProblem = contactError(parent.contact_number);
    if (contactProblem) {
      setFieldErrors({ contact_number: contactProblem });
      return;
    }
    setPhase('confirm-parent');
  }

  async function submitParent() {
    if (!enrolled?.lrn) return;
    setSaving(true);
    setFormError(null);
    setStatus({});
    try {
      const body = {
        lrn: enrolled.lrn,
        password: parent.password,
        name: parent.name.trim(),
      };
      if (parent.email.trim()) body.email = parent.email.trim();
      if (parent.contact_number.trim()) body.contact_number = parent.contact_number.trim();

      const { message } = await api.post('/users/parents', body, { unwrap: ['user', 'message'] });
      setStatus({ list: ok(message) });
      setWizardOpen(false);
      setPhase('enroll');
      setEnroll(EMPTY_ENROLL);
      setParent(EMPTY_PARENT);
      setEnrolled(null);
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field) setFieldErrors({ [field]: extractError(err) });
      else setFormError(extractError(err));
      setPhase('parent');
    } finally {
      setSaving(false);
    }
  }

  const filtered = Boolean(applied.search || applied.section);
  const parsedConfirm = parseClassKey(enroll.classKey);
  const classLabel = parsedConfirm
    ? `Grade ${parsedConfirm.grade_level} - ${parsedConfirm.section}`
    : '';

  const columns = [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      sortValue: (row) => `${row.last_name}, ${row.first_name}`,
      // A <Link> in the cell rather than a clickable row: DataTable has no
      // onRowClick, and adding one for the first page that wants it would
      // shape a shared primitive around a single caller. If a second page
      // needs whole-row clicking, that is the trigger to add it.
      render: (row) => (
        <Link to={`/teacher/students/${row.id}`} className="inline-flex min-w-0 underline-offset-2 hover:underline">
          {/* NO `secondary` (UI-B item 2) — the Grade & section column below
              already says this, and on a card, where there are no columns,
              the subtitle carries it instead. */}
          <PersonCell name={`${row.last_name}, ${row.first_name}`} nameClass="text-brand" />
        </Link>
      ),
    },
    // nowrap: an LRN is an identifier, never text to reflow (§5c).
    { key: 'lrn', header: 'LRN', nowrap: true },
    {
      key: 'class',
      header: 'Grade & section',
      sortable: true,
      sortValue: (row) => `${row.grade_level}-${row.section}`,
      render: (row) => `Grade ${row.grade_level} - ${row.section}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  const wizardTitle =
    phase === 'enroll'
      ? 'Enroll a student'
      : phase === 'confirm-enroll'
        ? 'Enroll this student?'
        : phase === 'parent'
          ? 'Create parent account'
          : 'Create this parent account?';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-edge bg-surface p-4">
        <form onSubmit={applyFilters} className="flex flex-1 flex-wrap items-end gap-3">
          <FormField
            label="Search"
            placeholder="Name or LRN"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-56 flex-1"
          />
          {/* A SELECT, and only when there is something to choose between.
              It was a free-text box placeholdered "e.g. Malikhain" — a
              Grade 6 section, shown to whoever was looking, including the
              Grade 1 adviser. A typo also returned an empty list with no
              "no such section" to explain it.

              Safe as a select because section NAMES are unique across the
              school: all 23 are distinct, checked against the database
              before building this rather than assumed. If that ever stops
              being true this must KEY on the grade too, or two classes
              collapse into one option.

              THE LABEL CARRIES THE GRADE, THE VALUE DOES NOT (UI-C1b).
              Uniqueness makes the bare name a correct key; it never made it
              a readable label, and a teacher across two grades read
              "Malikhain" and "Masigasig" beside a Grade & section column
              that named both in full.

              HIDDEN AT ONE OPTION: a teacher with a single section has
              nothing to filter, and on the seeded data that is every
              teacher — so this control is invisible until someone teaches
              across two sections, which is the only time it means anything. */}
          {showSectionFilter(filterSections) ? (
            <FormField
              label="Section"
              as="select"
              className={`min-w-44 ${filterSelectClass}`}
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="">All my sections</option>
              {/* value = the bare section name, which is what the filter
                  compares and what ?section= takes; label = the full
                  "Grade 6 - Malikhain" (UI-C1b). */}
              {filterSections.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </FormField>
          ) : null}
          {/* "Clear", not "Reset" — this page's word, kept. */}
          <FilterActions
            dirty={dirty}
            canReset={filtered}
            onReset={clearFilters}
            resetLabel="Clear"
          />
        </form>
        {canEnroll ? (
          <button
            type="button"
            onClick={openWizard}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
          >
            Enroll student
          </button>
        ) : (
          <p className="max-w-sm text-sm text-fg-muted">
            Enrolling a learner is limited to the section you advise. Teaching a
            subject in a class is not enough.
          </p>
        )}
      </div>

      <FormStatus status={status.list} />

      <DataTable
        // A real primary action: the detail page. The card is one <Link>,
        // which is why the LRN column does not come along — a card shows
        // what identifies the learner, and the name plus the class does
        // that without putting an LRN on a phone screen (§5c).
        renderCard={(row) => ({
          to: `/teacher/students/${row.id}`,
          avatar: `${row.first_name} ${row.last_name}`,
          title: `${row.last_name}, ${row.first_name}`,
          subtitle: `Grade ${row.grade_level} - ${row.section}`,
          status: row.status,
        })}
        columns={columns}
        rows={students}
        loading={loading}
        error={error}
        onRetry={load}
        page={page}
        onPageChange={setOffset}
        sort={sort}
        onSortChange={changeSort}
        emptyIcon={filtered ? 'fa-magnifying-glass' : 'fa-user-graduate'}
        // Two genuinely different situations, deliberately not one message:
        // an empty scope is not the same as a filter that matched nothing.
        emptyTitle={filtered ? 'No students match that search' : 'No students assigned to you yet'}
        emptyMessage={
          filtered
            ? 'Try a different name, LRN, or section.'
            : 'You see students in the sections you teach or advise. An admin can assign you to a section.'
        }
        emptyAction={
          filtered ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
            >
              Clear filters
            </button>
          ) : null
        }
      />

      <Modal
        open={wizardOpen}
        onClose={closeWizard}
        closeOnBackdrop={!saving}
        title={wizardTitle}
        size="lg"
        footer={
          phase === 'enroll' ? (
            <>
              <button
                type="button"
                onClick={closeWizard}
                disabled={saving}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="enroll-form"
                disabled={saving}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:opacity-60"
              >
                Continue
              </button>
            </>
          ) : phase === 'confirm-enroll' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (saving) return;
                  setPhase('enroll');
                }}
                disabled={saving}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={submitEnroll}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:opacity-60"
              >
                {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
                Yes, enroll this student
              </button>
            </>
          ) : phase === 'parent' ? (
            <>
              <button
                type="button"
                onClick={closeWizard}
                disabled={saving}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
              >
                Skip
              </button>
              <button
                type="submit"
                form="parent-form"
                disabled={saving || !passwordFormReady(parent.password, parent.confirmPassword)}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:opacity-60"
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (saving) return;
                  setPhase('parent');
                }}
                disabled={saving}
                className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={submitParent}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:opacity-60"
              >
                {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
                Yes, create parent account
              </button>
            </>
          )
        }
      >
        {formError ? <ErrorAlert message={formError} /> : null}

        {phase === 'enroll' ? (
          <form id="enroll-form" onSubmit={requestEnroll} className="space-y-3">
            <FormField
              label="LRN"
              value={enroll.lrn}
              onChange={(e) => {
                setFieldErrors((prev) => ({ ...prev, lrn: null }));
                setEnroll((prev) => ({ ...prev, lrn: e.target.value }));
              }}
              maxLength={12}
              inputMode="numeric"
              required
              hint={lrnRuleHint()}
              error={fieldErrors.lrn}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="First name"
                value={enroll.first_name}
                onChange={(e) => setEnroll((prev) => ({ ...prev, first_name: e.target.value }))}
                required
              />
              <FormField
                label="Last name"
                value={enroll.last_name}
                onChange={(e) => setEnroll((prev) => ({ ...prev, last_name: e.target.value }))}
                required
              />
            </div>
            <FormField
              label="Class"
              as="select"
              value={enroll.classKey}
              onChange={(e) => setEnroll((prev) => ({ ...prev, classKey: e.target.value }))}
              required
            >
              <option value="">Select a class</option>
              {classOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Birthday"
                type="date"
                value={enroll.birthday}
                onChange={(e) => {
                  setFieldErrors((prev) => ({ ...prev, birthday: null }));
                  setEnroll((prev) => ({ ...prev, birthday: e.target.value }));
                }}
                error={fieldErrors.birthday}
              />
              <FormField
                label="Gender"
                as="select"
                value={enroll.gender}
                onChange={(e) => {
                  setFieldErrors((prev) => ({ ...prev, gender: null }));
                  setEnroll((prev) => ({ ...prev, gender: e.target.value }));
                }}
                error={fieldErrors.gender}
              >
                <option value="">Not recorded</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </FormField>
            </div>
            <FormField
              label="Address"
              as="textarea"
              rows={2}
              value={enroll.address}
              onChange={(e) => setEnroll((prev) => ({ ...prev, address: e.target.value }))}
            />
            <FormField
              label="Contact number"
              value={enroll.contact_number}
              onChange={(e) => {
                setFieldErrors((prev) => ({ ...prev, contact_number: null }));
                setEnroll((prev) => ({ ...prev, contact_number: e.target.value }));
              }}
              maxLength={20}
              inputMode="tel"
              hint={contactRuleHint()}
              error={fieldErrors.contact_number}
            />
          </form>
        ) : null}

        {phase === 'confirm-enroll' ? (
          <p className="text-sm text-fg-body">
            Enroll {enroll.first_name.trim()} {enroll.last_name.trim()} (LRN {enroll.lrn.trim()})
            in {classLabel}? This cannot be undone from here — there is no delete for a
            student record.
          </p>
        ) : null}

        {phase === 'parent' ? (
          <form id="parent-form" onSubmit={requestParent} className="space-y-3">
            <p className="text-sm text-fg-body">
              {enrolled?.first_name} {enrolled?.last_name} is enrolled. Create the pending parent
              account next, or skip and do it later from the student record.
            </p>
            <FormField label="Login ID (child's LRN)" value={enrolled?.lrn || ''} disabled />
            <FormField
              label="Guardian name"
              value={parent.name}
              onChange={(e) => setParent((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <PasswordField
              label="Password"
              value={parent.password}
              onChange={(e) => setParent((prev) => ({ ...prev, password: e.target.value }))}
              autoComplete="new-password"
              revealed={revealed.password}
              onToggleReveal={() => setRevealed((prev) => ({ ...prev, password: !prev.password }))}
              error={fieldErrors.password}
              below={<PasswordChecklist value={parent.password} />}
            />
            <PasswordField
              label="Confirm password"
              value={parent.confirmPassword}
              onChange={(e) => setParent((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              autoComplete="new-password"
              revealed={revealed.confirm}
              onToggleReveal={() => setRevealed((prev) => ({ ...prev, confirm: !prev.confirm }))}
              error={confirmError(parent.password, parent.confirmPassword)}
            />
            <FormField
              label="Email"
              type="email"
              value={parent.email}
              onChange={(e) => setParent((prev) => ({ ...prev, email: e.target.value }))}
            />
            <FormField
              label="Contact number"
              value={parent.contact_number}
              onChange={(e) => {
                setFieldErrors((prev) => ({ ...prev, contact_number: null }));
                setParent((prev) => ({ ...prev, contact_number: e.target.value }));
              }}
              maxLength={20}
              inputMode="tel"
              hint={contactRuleHint()}
              error={fieldErrors.contact_number}
            />
          </form>
        ) : null}

        {phase === 'confirm-parent' ? (
          <p className="text-sm text-fg-body">
            Create a pending parent account for {parent.name.trim()} (login ID {enrolled?.lrn})?
            An admin must approve it before they can log in. You cannot un-create it.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
