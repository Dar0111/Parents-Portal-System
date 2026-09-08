import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher contributions — list, compose, edit, delete, and a payment roster.
// Not Memos: seven of eight endpoints are teacher-reachable. GET /my-records
// is the one that is not (parent only).
//
// Scope is GRADE LEVEL alone (no section column). teacherHasGradeAssignment
// in routes/contributions.js is teacher_assignments only — advisers are
// not included. content.js writes WERE widened; this file was not. TCH-002
// can announce to Masigasig and cannot POST a Grade 5 fee. Whether that
// SHOULD change is a school question (a fee is money; DepEd Order 19 s. 2008
// is the No Collection Policy), not a consistency patch. Do not widen it.
//
// DO NOT REUSE useTeacherTargets. That hook is assigned-OR-adviser. The
// compose grade list comes from distinct grade_level on GET /students, which
// is also too wide (TCH-002 sees Jea), and the copy says so: the server
// checks assignment when you click Post, not when you pick the grade.
// Inventing a "you cannot post" empty state from GET /students would
// misread TCH-001 on the day they have posted nothing — same [] as TCH-002.
//
// Tracking only, no collection. No amount override (handler default keeps a
// stored discount). No CSV / Download Statement. No list filter.
//
// Roster is a modal, not a :id route — one fewer file if this module is
// removed (DO 19; adviser has not decided). GET /:id/records already returns
// contribution + records; do not also call GET /:id.
//
// §5b: `recorded` (status from last GET /:id/records) is stored state.
// Mark Paid/Pending never writes it; loadRoster is the only writer.
// GET /:id/records LEFT JOINs and COALESCE(cr.status, 'Pending'), so a
// never-recorded student and one explicitly marked Pending look identical
// here — badge Pending, button "Mark paid." Acceptable: the API treats
// them the same and so does the teacher's task. The badge is showing a
// default, not a record; the distinction is invisible by design.
// §5e: PATCH is ON DUPLICATE KEY UPDATE — no confirm. DELETE is hard and
// only works with zero records — confirm, name the title. First PATCH
// inserts a row, after which DELETE is 409; there is no record-delete
// endpoint, so Pending-again does not unlock delete.
// §5c: LRN on the roster (teacher acting on that student). No LRN in a URL.
// §5i: copy names Post as the assignment check, not picking the grade.
//
// Roster modal is size="lg" (max-w-2xl) — already Modal's maximum. Section
// was dropped and the action column is one control so the table fits
// rather than adding xl for this page. First Stage 4 content to hit that
// ceiling; a second page is the trigger to reconsider the size scale.

const EMPTY_FORM = { title: '', amount: '', grade_level: '', due_date: '' };

function formatAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

function gradesFromStudents(students) {
  return [...new Set(students.map((s) => Number(s.grade_level)).filter((g) => g >= 1 && g <= 6))].sort(
    (a, b) => a - b
  );
}

export default function ContributionsPage() {
  usePageTitle('Contributions');
  const { user } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [students, setStudents] = useState([]);
  const composeGrades = useMemo(() => gradesFromStudents(students), [students]);

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterContribution, setRosterContribution] = useState(null);
  const [rosterRows, setRosterRows] = useState([]);
  const [recorded, setRecorded] = useState(() => new Map());
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterNotInScope, setRosterNotInScope] = useState(false);
  const [rosterError, setRosterError] = useState(null);
  const [rosterMessage, setRosterMessage] = useState(null);
  const [markingId, setMarkingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, studentRows] = await Promise.all([
        api.get('/contributions', { unwrap: 'contributions' }),
        api.get('/students', { unwrap: 'students', params: { status: 'active' } }),
      ]);
      setRows(list);
      setStudents(studentRows);
    } catch (err) {
      setError(extractError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function closeCompose() {
    if (saving) return;
    setComposing(false);
    setEditing(null);
    setFormError(null);
  }

  function openCompose() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      grade_level: composeGrades.length === 1 ? String(composeGrades[0]) : '',
    });
    setFormError(null);
    setComposing(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      title: row.title || '',
      amount: row.amount != null ? String(row.amount) : '',
      grade_level: row.grade_level != null ? String(row.grade_level) : '',
      due_date: row.due_date || '',
    });
    setFormError(null);
    setComposing(true);
  }

  async function submitForm(event) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        title: form.title.trim(),
        amount: Number(form.amount),
        grade_level: Number(form.grade_level),
        due_date: form.due_date || null,
      };
      if (editing) {
        await api.put(`/contributions/${editing.id}`, body, { unwrap: 'contribution' });
      } else {
        await api.post('/contributions', body, { unwrap: 'contribution' });
      }
      setComposing(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setSaving(true);
    setDeleteError(null);
    try {
      await api.delete(`/contributions/${deleting.id}`, { raw: true });
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleteError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  const loadRoster = useCallback(async (id) => {
    setRosterLoading(true);
    setRosterNotInScope(false);
    setRosterError(null);
    setRosterMessage(null);
    try {
      const payload = await api.get(`/contributions/${id}/records`, {
        unwrap: ['contribution', 'records'],
      });
      setRosterContribution(payload.contribution);
      setRosterRows(payload.records);
      const next = new Map();
      for (const row of payload.records) {
        next.set(row.student_id, row.status);
      }
      setRecorded(next);
      return true;
    } catch (err) {
      // 404 collapses nonexistent and out-of-scope. Copy must not undo that
      // — neither "access denied" (confirms it exists) nor a bare "not found".
      if (err?.response?.status === 404) {
        setRosterNotInScope(true);
        setRosterRows([]);
        setRecorded(new Map());
      } else {
        setRosterError(extractError(err));
        setRosterRows([]);
        setRecorded(new Map());
      }
      return false;
    } finally {
      setRosterLoading(false);
    }
  }, []);

  function openRoster(row) {
    setRosterContribution(row);
    setRosterOpen(true);
    loadRoster(row.id);
  }

  function closeRoster() {
    if (markingId != null) return;
    setRosterOpen(false);
    setRosterContribution(null);
    setRosterRows([]);
    setRecorded(new Map());
    setRosterNotInScope(false);
    setRosterError(null);
    setRosterMessage(null);
  }

  async function markRecord(studentId, status) {
    if (!rosterContribution?.id) return;
    setMarkingId(studentId);
    setRosterMessage(null);
    setRosterError(null);
    try {
      await api.patch(
        `/contributions/${rosterContribution.id}/records/${studentId}`,
        { status },
        { unwrap: 'record' }
      );
      const ok = await loadRoster(rosterContribution.id);
      if (ok) {
        setRosterMessage(status === 'Paid' ? 'Marked paid.' : 'Marked pending.');
      }
    } catch (err) {
      setRosterError(extractError(err));
    } finally {
      setMarkingId(null);
    }
  }

  const canCompose = composeGrades.length > 0;
  const rosterGrade = rosterContribution?.grade_level;

  const columns = [
      {
        key: 'title',
        header: 'Contribution',
        sortable: true,
        render: (row) => (
          <button
            type="button"
            onClick={() => openRoster(row)}
            className="text-left font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            {row.title}
          </button>
        ),
      },
      {
        key: 'amount',
        header: 'Amount',
        sortable: true,
        sortValue: (row) => Number(row.amount),
        render: (row) => <span className="tabular-nums">₱{formatAmount(row.amount)}</span>,
      },
      {
        key: 'grade_level',
        header: 'Grade',
        sortable: true,
        render: (row) => `Grade ${row.grade_level}`,
      },
      {
        key: 'due_date',
        header: 'Due',
        sortable: true,
        render: (row) => row.due_date || <span className="text-slate-400">No due date</span>,
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) =>
          row.posted_by === user?.id ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => openEdit(row)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleting(row);
                  setDeleteError(null);
                }}
                className="rounded-lg border border-rose-200 px-2.5 py-1 text-sm text-rose-600 transition hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          ) : null,
      },
  ];

  const rosterColumns = [
      {
        key: 'name',
        header: 'Student',
        sortable: true,
        sortValue: (row) => `${row.last_name} ${row.first_name}`,
        render: (row) => `${row.last_name}, ${row.first_name}`,
      },
      { key: 'lrn', header: 'LRN', sortable: true },
      {
        key: 'amount',
        header: 'Amount',
        sortable: true,
        sortValue: (row) => Number(row.amount),
        render: (row) => <span className="tabular-nums">₱{formatAmount(row.amount)}</span>,
      },
      {
        key: 'status',
        header: 'Recorded',
        // Last GET only — never from the button that is about to fire.
        // loadRoster is the only writer of `recorded`. COALESCE Pending
        // (no row) and stored Pending look the same; that is the API.
        render: (row) => <StatusBadge status={recorded.get(row.student_id) || row.status} />,
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => {
          const stored = recorded.get(row.student_id) || row.status;
          const nextStatus = stored === 'Paid' ? 'Pending' : 'Paid';
          const busy = markingId != null;
          // One control: the action that would change something. Recorded
          // already shows stored state, so a second button would offer to
          // do what the badge says is already done. In-flight: stored has
          // not updated yet (§5b), so this is still the clicked button —
          // keep it visible and disabled. A disappearing control would
          // leave the teacher unsure the click landed.
          return (
            <button
              type="button"
              disabled={busy}
              onClick={() => markRecord(row.student_id, nextStatus)}
              className={
                nextStatus === 'Paid'
                  ? 'rounded-lg border border-emerald-200 px-2.5 py-1 text-sm text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50'
                  : 'rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50'
              }
            >
              {nextStatus === 'Paid' ? 'Mark paid' : 'Mark pending'}
            </button>
          );
        },
      },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="max-w-2xl text-sm text-slate-600">
          <i className="fa-solid fa-circle-info mr-2 text-slate-400" />
          This tracks who has paid a class contribution. It does not collect
          payment. You can post for a grade you teach — advising a section is
          not enough. The server checks that when you click Post, not when you
          pick the grade.
        </p>
        {loading ? null : canCompose ? (
          <button
            type="button"
            onClick={openCompose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            New contribution
          </button>
        ) : (
          <p className="max-w-sm text-sm text-slate-500">
            A grade to post to appears here once you have students in a class
            you can see.
          </p>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon="fa-peso-sign"
        emptyTitle="No contributions yet"
        emptyMessage="No contributions posted for your grades yet."
      />

      <Modal
        open={composing}
        onClose={closeCompose}
        closeOnBackdrop={!saving}
        title={editing ? 'Edit contribution' : 'New contribution'}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={closeCompose}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="contribution-form"
              disabled={
                saving ||
                !form.title.trim() ||
                !form.grade_level ||
                !Number.isFinite(Number(form.amount)) ||
                Number(form.amount) <= 0
              }
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              {editing ? 'Save changes' : 'Post'}
            </button>
          </>
        }
      >
        <form id="contribution-form" onSubmit={submitForm} className="space-y-4">
          {formError ? <ErrorAlert message={formError} /> : null}

          <FormField
            label="Grade"
            as="select"
            required
            value={form.grade_level}
            onChange={(e) => setForm((f) => ({ ...f, grade_level: e.target.value }))}
            hint="Assignment, not advisory. Post is what the server checks."
          >
            <option value="">Select a grade…</option>
            {composeGrades.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </FormField>

          <FormField
            label="Title"
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />

          <FormField
            label="Amount"
            required
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />

          <FormField
            label="Due date"
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            hint="Optional. Left blank, there is no due date."
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => (saving ? null : setDeleting(null))}
        closeOnBackdrop={!saving}
        title="Delete contribution"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              Delete
            </button>
          </>
        }
      >
        {deleteError ? <ErrorAlert message={deleteError} className="mb-3" /> : null}
        <p className="text-sm text-slate-700">
          Delete <strong>&ldquo;{deleting?.title}&rdquo;</strong>? This cannot be
          undone. If anyone has already been marked paid or pending, the server
          will refuse.
        </p>
      </Modal>

      <Modal
        open={rosterOpen}
        onClose={closeRoster}
        closeOnBackdrop={markingId == null}
        title={rosterContribution?.title || 'Contribution'}
        // Already Modal's maximum. Do not add xl for this table — see 7b.
        size="lg"
      >
        <div className="max-h-[70vh] overflow-y-auto">
          {rosterNotInScope ? (
            <EmptyState
              icon="fa-peso-sign"
              title="This contribution is not in your grades"
              message="You can only open a roster for a grade you are assigned to teach."
            />
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">
                Every active student in Grade {rosterGrade}, not only your
                section. This tracks who has paid — it does not collect payment.
              </p>
              {rosterError ? (
                <ErrorAlert message={rosterError} className="mb-3" />
              ) : rosterMessage ? (
                <div className="mb-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <i className="fa-solid fa-circle-check text-emerald-500" />
                  <p className="text-sm text-emerald-800">{rosterMessage}</p>
                </div>
              ) : null}
              <DataTable
                columns={rosterColumns}
                rows={rosterRows}
                keyField="student_id"
                loading={rosterLoading}
                emptyIcon="fa-user-graduate"
                emptyTitle="No active students"
                emptyMessage={
                  rosterGrade
                    ? `No active students in Grade ${rosterGrade}.`
                    : 'No active students in this grade.'
                }
              />
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
