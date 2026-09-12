import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import Modal from '../../components/Modal';
import PasswordField from '../../components/PasswordField';
import StatusBadge from '../../components/StatusBadge';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher student list. Enroll (POST /students, assignments-only) plus a
// wizard step to create the pending parent. No Edit, no attendance history.
// Detail Edit is assignments-only — PUT is teacher_assignments-only, and an
// adviser-only teacher sees muted copy rather than a button that 403s.
//
// Read scope is assigned OR section adviser (utils/teacherScope.js), so an
// adviser holding no subject assignments still sees their advisory section —
// TCH-002 is the account that proves it. WRITE is assignments-only: do not
// reuse useTeacherTargets (assigned-OR-adviser). Class picker is
// GET /assignments, no teacher_id. TCH-002's [] is the Enroll-vs-muted-copy
// signal, not a third empty state on GET /students.
//
// POST /users/parents has no assignment check — any teacher who knows an
// LRN can call it. This page does not widen that hole: wizard step 2 only
// after a successful enroll; LRN is locked from the student row. Do not
// hide Create parent behind assignments on the detail page either — that
// would invent a narrower UI than the API.

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

  // Own assignment rows only. [] for TCH-002 is correct — advising is not
  // enough to enroll. Do not reconstruct from GET /students ∪ GET /sections.
  const [assignments, setAssignments] = useState([]);

  // Committed filter values — what has actually been sent to the API. Kept
  // separate from the input's own value so typing does not fire a request per
  // keystroke, and so the empty state can tell "no students at all" from "no
  // students matching a filter".
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [applied, setApplied] = useState({ search: '', section: '' });

  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  // enroll → confirm-enroll → parent → confirm-parent.
  // After enroll 201 there is no path back to enroll (that would POST again).
  const [phase, setPhase] = useState('enroll');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [enroll, setEnroll] = useState(EMPTY_ENROLL);
  const [parent, setParent] = useState(EMPTY_PARENT);
  const [enrolled, setEnrolled] = useState(null);
  const [revealed, setRevealed] = useState({ password: false, confirm: false });

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
      const params = {};
      if (applied.search) params.search = applied.search;
      if (applied.section) params.section = applied.section;

      const rows = await api.get('/students', { unwrap: 'students', params });
      setStudents(rows);
    } catch (err) {
      setError(extractError(err));
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [applied]);

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

  const classOptions = useMemo(() => {
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

  const canEnroll = classOptions.length > 0;

  function applyFilters(event) {
    event.preventDefault();
    setApplied({ search: search.trim(), section: section.trim() });
  }

  function clearFilters() {
    setSearch('');
    setSection('');
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
    setPhase('confirm-enroll');
  }

  async function submitEnroll() {
    const parsed = parseClassKey(enroll.classKey);
    if (!parsed) return;
    setSaving(true);
    setFormError(null);
    setSaveError(null);
    setSaveMessage(null);
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
      setFormError(extractError(err));
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
    if (parent.password.length < 6) {
      setFormError('New password must be at least 6 characters.');
      return;
    }
    if (parent.password !== parent.confirmPassword) {
      setFormError('New password and confirmation do not match.');
      return;
    }
    setPhase('confirm-parent');
  }

  async function submitParent() {
    if (!enrolled?.lrn) return;
    setSaving(true);
    setFormError(null);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const body = {
        lrn: enrolled.lrn,
        password: parent.password,
        name: parent.name.trim(),
      };
      if (parent.email.trim()) body.email = parent.email.trim();
      if (parent.contact_number.trim()) body.contact_number = parent.contact_number.trim();

      const { message } = await api.post('/users/parents', body, { unwrap: ['user', 'message'] });
      setSaveMessage(message);
      setWizardOpen(false);
      setPhase('enroll');
      setEnroll(EMPTY_ENROLL);
      setParent(EMPTY_PARENT);
      setEnrolled(null);
    } catch (err) {
      setFormError(extractError(err));
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
        <Link
          to={`/teacher/students/${row.id}`}
          className="font-medium text-slate-900 underline-offset-2 hover:underline"
        >
          {row.last_name}, {row.first_name}
        </Link>
      ),
    },
    { key: 'lrn', header: 'LRN' },
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
      {saveError ? (
        <ErrorAlert message={saveError} />
      ) : saveMessage ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <i className="fa-solid fa-circle-check text-emerald-600" />
          <p className="text-sm text-emerald-800">{saveMessage}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <form onSubmit={applyFilters} className="flex flex-1 flex-wrap items-end gap-3">
          <FormField
            label="Search"
            placeholder="Name or LRN"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-56 flex-1"
          />
          <FormField
            label="Section"
            placeholder="e.g. Malikhain"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="min-w-44"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Apply
          </button>
          {filtered ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Clear
            </button>
          ) : null}
        </form>
        {canEnroll ? (
          <button
            type="button"
            onClick={openWizard}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Enroll student
          </button>
        ) : (
          <p className="max-w-sm text-sm text-slate-500">
            Enrolling a student is limited to classes you are assigned to teach.
            Advising a section is not enough.
          </p>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={students}
        loading={loading}
        error={error}
        onRetry={load}
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
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Clear filters
            </button>
          ) : null
        }
      />

      {students.length ? (
        <p className="text-sm text-slate-500">
          {students.length} student{students.length === 1 ? '' : 's'}
        </p>
      ) : null}

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
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="enroll-form"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
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
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={submitEnroll}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
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
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Skip
              </button>
              <button
                type="submit"
                form="parent-form"
                disabled={saving || !parent.confirmPassword.trim()}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
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
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={submitParent}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
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
              onChange={(e) => setEnroll((prev) => ({ ...prev, lrn: e.target.value }))}
              maxLength={12}
              required
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
                onChange={(e) => setEnroll((prev) => ({ ...prev, birthday: e.target.value }))}
              />
              <FormField
                label="Gender"
                as="select"
                value={enroll.gender}
                onChange={(e) => setEnroll((prev) => ({ ...prev, gender: e.target.value }))}
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
              onChange={(e) => setEnroll((prev) => ({ ...prev, contact_number: e.target.value }))}
              maxLength={20}
              hint="Up to 20 characters."
            />
          </form>
        ) : null}

        {phase === 'confirm-enroll' ? (
          <p className="text-sm text-slate-600">
            Enroll {enroll.first_name.trim()} {enroll.last_name.trim()} (LRN {enroll.lrn.trim()})
            in {classLabel}? This cannot be undone from here — there is no delete for a
            student record.
          </p>
        ) : null}

        {phase === 'parent' ? (
          <form id="parent-form" onSubmit={requestParent} className="space-y-3">
            <p className="text-sm text-slate-600">
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
              hint="At least 6 characters."
              revealed={revealed.password}
              onToggleReveal={() => setRevealed((prev) => ({ ...prev, password: !prev.password }))}
            />
            <PasswordField
              label="Confirm password"
              value={parent.confirmPassword}
              onChange={(e) => setParent((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              autoComplete="new-password"
              revealed={revealed.confirm}
              onToggleReveal={() => setRevealed((prev) => ({ ...prev, confirm: !prev.confirm }))}
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
              onChange={(e) => setParent((prev) => ({ ...prev, contact_number: e.target.value }))}
              maxLength={20}
              hint="Up to 20 characters."
            />
          </form>
        ) : null}

        {phase === 'confirm-parent' ? (
          <p className="text-sm text-slate-600">
            Create a pending parent account for {parent.name.trim()} (login ID {enrolled?.lrn})?
            An admin must approve it before they can log in. You cannot un-create it.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
