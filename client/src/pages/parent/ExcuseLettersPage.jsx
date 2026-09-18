import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { fetchAll } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormField, { filterSelectClass } from '../../components/FormField';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import { todayLocalDateString } from '../../format/date';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent excuse letters — submit, list, edit while Pending.
//
// NOT a mirror of Teacher → Excuse Letters. That page is a review queue:
// PATCH /:id/review is irreversible, adviser-only, and there is no parent
// submission on it. This page is the other side of the same table.
//
// WRITES: POST / and PUT /:id while status is Pending. parent_id and
// student_id come from the session, never the form. Skip POST when
// user.student_id is null — the column is NOT NULL and an unlinked POST
// is a 500, not a 400 (flagged, not fixed).
//
// NO DELETE / withdraw. The handler has none. Edit while Pending is the
// correction path, which is why submit has no confirmation (§5e).
//
// NO ATTACHMENT. attachment_url exists; POST/PUT ignore it; nothing uploads.
//
// NO GET /:id. The list (GET /mine) is SELECT * and already carries every
// column a detail view would show, including teacher_remarks. GET /:id is
// the same thinner-than-list oddity the Teacher page recorded.
//
// GET /mine accepts no query filters. Status is filtered client-side.
// Default is All — a parent cares about history, not a review queue.
// Dates are not offered: the endpoint would ignore them.
//
// §5b: the table renders last GET /mine only. Compose draft is created on
// open and discarded on close. Success refetches; the form never writes
// the list. §5c: no LRN, no login_id, route has no :id.

const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Declined'];
const EMPTY_FORM = { absence_date: '', reason: '', details: '' };

export default function ParentExcuseLettersPage() {
  usePageTitle('Excuse Letters');
  const { user } = useAuth();
  const studentId = user?.student_id ?? null;
  const today = todayLocalDateString();

  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The select IS the applied value — one control, no draft/Apply pair.
  const [status, setStatus] = useState('All');

  const [reading, setReading] = useState(null);

  // Compose draft. Null editing = new letter; a letter row = PUT.
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // C2 (2026-09-19): this page filters by status CLIENT-SIDE (`visible`
      // below) and GET /mine has no status filter, so it needs the parent's
      // whole set — one child's letters, bounded — and fetchAll pages through
      // it. The table keeps its client-side sort; no pager here on purpose:
      // a pager over a locally filtered page would show "3 of 40" for a
      // filter the server never saw (C4).
      setLetters(await fetchAll('/excuse-letters/mine', { unwrap: 'excuse_letters' }));
    } catch (err) {
      setError(extractError(err));
      setLetters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => (status === 'All' ? letters : letters.filter((row) => row.status === status)),
    [letters, status]
  );

  const emptyState = (() => {
    if (studentId == null && letters.length === 0) {
      return {
        icon: 'fa-link-slash',
        title: "Your account isn't linked to a student record yet",
        message:
          'Ask the school office to link your account so you can submit an excuse letter for an absence.',
        showReset: false,
      };
    }
    if (status !== 'All') {
      return {
        icon: 'fa-filter',
        title: 'No letters match this filter',
        message: 'Try a different status, or show all letters.',
        showReset: true,
      };
    }
    return {
      icon: 'fa-envelope-open-text',
      title: 'No excuse letters yet',
      message: 'Submit a letter when your child is absent. The adviser reviews it; the attendance record stays Absent.',
      showReset: false,
    };
  })();

  const canReset = status !== 'All';
  const canSubmit = studentId != null;

  function openCompose() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setComposing(true);
  }

  function openEdit(letter) {
    setEditing(letter);
    setForm({
      absence_date: letter.absence_date || '',
      reason: letter.reason || '',
      details: letter.details || '',
    });
    setFormError(null);
    setReading(null);
    setComposing(true);
  }

  function closeCompose() {
    if (saving) return;
    setComposing(false);
    setEditing(null);
    setFormError(null);
  }

  async function submitForm(event) {
    event.preventDefault();
    if (!canSubmit && !editing) return;

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        absence_date: form.absence_date,
        reason: form.reason,
        details: form.details.trim() ? form.details : null,
      };
      if (editing) {
        await api.put(`/excuse-letters/${editing.id}`, body, { unwrap: 'excuse_letter' });
      } else {
        await api.post('/excuse-letters', body, { unwrap: 'excuse_letter' });
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

  const columns = [
    { key: 'absence_date', header: 'Absence date', sortable: true },
    {
      key: 'reason',
      header: 'Reason',
      sortable: true,
      render: (row) => (
        <button
          type="button"
          onClick={() => setReading(row)}
          className="line-clamp-2 max-w-md text-left text-slate-700 underline-offset-2 hover:underline"
        >
          {row.reason}
        </button>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) =>
        row.status === 'Pending' ? (
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
          >
            Edit
          </button>
        ) : null,
    },
  ];

  const submitButton = canSubmit ? (
    <button
      type="button"
      onClick={openCompose}
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
    >
      Submit letter
    </button>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FormField
          label="Status"
          as="select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={filterSelectClass}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === 'All' ? 'All statuses' : s}
            </option>
          ))}
        </FormField>
        <div className="flex gap-2">
          {canReset ? (
            <button
              type="button"
              onClick={() => setStatus('All')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Reset
            </button>
          ) : null}
          {submitButton}
        </div>
      </div>

      {!canSubmit ? (
        <p className="text-sm text-slate-500">
          Submitting is unavailable until the school office links this account to a student.
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={visible}
        keyField="id"
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon={emptyState.icon}
        emptyTitle={emptyState.title}
        emptyMessage={emptyState.message}
        emptyAction={
          emptyState.showReset ? (
            <button
              type="button"
              onClick={() => setStatus('All')}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Show all letters
            </button>
          ) : canSubmit && status === 'All' ? (
            submitButton
          ) : null
        }
      />

      <Modal
        open={Boolean(reading)}
        onClose={() => setReading(null)}
        title="Excuse letter"
        size="lg"
      >
        {reading ? (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Absence date</dt>
                <dd className="mt-0.5 text-sm text-slate-900">{reading.absence_date}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={reading.status} />
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Reason</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{reading.reason}</dd>
              </div>
              {reading.details ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Details</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{reading.details}</dd>
                </div>
              ) : null}
              {reading.teacher_remarks ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Adviser remarks</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{reading.teacher_remarks}</dd>
                </div>
              ) : null}
            </dl>
            {reading.status === 'Pending' ? (
              <button
                type="button"
                onClick={() => openEdit(reading)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                Edit
              </button>
            ) : (
              <p className="text-sm text-slate-500">
                This letter has been reviewed and can no longer be edited.
              </p>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={composing}
        onClose={closeCompose}
        title={editing ? 'Edit excuse letter' : 'Submit excuse letter'}
        size="lg"
        closeOnBackdrop={!saving}
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
              form="parent-excuse-form"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              {editing ? 'Save changes' : 'Submit'}
            </button>
          </>
        }
      >
        <form id="parent-excuse-form" onSubmit={submitForm} className="space-y-4">
          {formError ? <ErrorAlert message={formError} /> : null}
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            The adviser records the reason for the absence. The attendance mark stays Absent.
          </p>
          <FormField
            label="Absence date"
            type="date"
            required
            max={today}
            value={form.absence_date}
            onChange={(e) => setForm((f) => ({ ...f, absence_date: e.target.value }))}
          />
          <FormField
            label="Reason"
            required
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Short reason for the absence"
          />
          <FormField
            label="Details"
            as="textarea"
            rows={3}
            value={form.details}
            onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
            placeholder="Optional — anything the adviser should know"
          />
        </form>
      </Modal>
    </div>
  );
}
