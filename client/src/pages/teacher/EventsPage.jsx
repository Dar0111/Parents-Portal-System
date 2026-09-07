import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import Modal from '../../components/Modal';
import { todayLocalDateString } from '../../format/date';
import useTeacherTargets from '../../hooks/useTeacherTargets';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher events: list, compose, edit, delete.
//
// SHARES NO COMPONENT WITH ANNOUNCEMENTS, deliberately. The two look alike from
// a distance and differ in every detail that matters: the body column is
// `description` and is NULLABLE (announcements' `content` is NOT NULL), there
// is a required `event_date`, targeting is GRADE-ONLY (the events table has no
// target_section column at all), and the write scope is correspondingly
// grade-level — any assignment in the grade, or adviser of any section in it —
// where announcements demand an exact section. One component covering both
// would need a configuration axis per difference.
//
// NOTE ON DATES: event_date is sent as the input's own local YYYY-MM-DD string,
// never parsed into a Date and re-serialised. See client/src/format/date.js for
// the two UTC bugs this project has already paid for.

const EMPTY_FORM = { title: '', description: '', event_date: '', target_grade: '' };

export default function EventsPage() {
  usePageTitle('Events');
  const { user } = useAuth();
  const { grades, loading: targetsLoading } = useTeacherTargets();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [gradeFilter, setGradeFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ grade: '', from: '', to: '' });

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (applied.grade) params.grade_level = applied.grade;
      if (applied.from) params.from = applied.from;
      if (applied.to) params.to = applied.to;
      setRows(await api.get('/events', { unwrap: 'events', params }));
    } catch (err) {
      setError(extractError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    load();
  }, [load]);

  function openCompose() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      event_date: todayLocalDateString(),
      target_grade: grades.length === 1 ? String(grades[0]) : '',
    });
    setFormError(null);
    setComposing(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      title: row.title || '',
      description: row.description || '',
      event_date: row.event_date || '',
      target_grade: String(row.target_grade ?? ''),
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
        // description is nullable in the schema — an empty box means null, not
        // an empty string, so the column stays honest about "not provided".
        description: form.description.trim() || null,
        event_date: form.event_date,
        target_grade: Number(form.target_grade),
      };
      if (editing) {
        await api.put(`/events/${editing.id}`, body, { unwrap: 'event' });
      } else {
        await api.post('/events', body, { unwrap: 'event' });
      }
      setComposing(false);
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
      await api.delete(`/events/${deleting.id}`, { raw: true });
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleteError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  const canPost = grades.length > 0;
  const hasFilter = Boolean(applied.grade || applied.from || applied.to);

  const emptyState = hasFilter
    ? {
        icon: 'fa-filter',
        title: 'No events match these filters',
        message: 'Try a different grade or date range.',
        reset: true,
      }
    : {
        icon: 'fa-calendar-days',
        title: 'No events yet',
        message: canPost
          ? 'School-wide events from the admin and events for your grades appear here.'
          : 'School-wide events from the admin appear here.',
        reset: false,
      };

  const columns = useMemo(
    () => [
      {
        key: 'title',
        header: 'Event',
        sortable: true,
        render: (row) => (
          <div>
            <div className="font-medium text-slate-900">{row.title}</div>
            {row.description ? (
              <div className="line-clamp-2 max-w-xl text-xs text-slate-500">{row.description}</div>
            ) : null}
          </div>
        ),
      },
      { key: 'event_date', header: 'Date', sortable: true },
      {
        key: 'audience',
        header: 'Audience',
        render: (row) =>
          row.target_grade === null ? (
            <span className="text-slate-500">School-wide</span>
          ) : (
            <span className="text-slate-700">Grade {row.target_grade}</span>
          ),
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
    ],
    [user?.id]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setApplied({ grade: gradeFilter, from, to });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <FormField
            label="Grade"
            as="select"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
          >
            <option value="">All I can read</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </FormField>
          <FormField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <FormField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
          >
            Apply
          </button>
        </form>

        {targetsLoading ? null : canPost ? (
          <button
            type="button"
            onClick={openCompose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            New event
          </button>
        ) : (
          <p className="max-w-sm text-sm text-slate-500">
            You can post once you are assigned to a class or made a section adviser.
          </p>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon={emptyState.icon}
        emptyTitle={emptyState.title}
        emptyMessage={emptyState.message}
        emptyAction={
          emptyState.reset ? (
            <button
              type="button"
              onClick={() => {
                setGradeFilter('');
                setFrom('');
                setTo('');
                setApplied({ grade: '', from: '', to: '' });
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Clear filters
            </button>
          ) : null
        }
      />

      <Modal
        open={composing}
        onClose={() => (saving ? null : setComposing(false))}
        closeOnBackdrop={!saving}
        title={editing ? 'Edit event' : 'New event'}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setComposing(false)}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="event-form"
              disabled={saving || !form.title.trim() || !form.event_date || !form.target_grade}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              {editing ? 'Save changes' : 'Post'}
            </button>
          </>
        }
      >
        <form id="event-form" onSubmit={submitForm} className="space-y-4">
          {formError ? <ErrorAlert message={formError} /> : null}

          <FormField
            label="Posting to"
            as="select"
            required
            value={form.target_grade}
            onChange={(e) => setForm((f) => ({ ...f, target_grade: e.target.value }))}
            hint="Everyone in this grade sees it. School-wide events are admin-only."
          >
            <option value="">Select a grade…</option>
            {grades.map((g) => (
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
            label="Date"
            type="date"
            required
            value={form.event_date}
            onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
          />

          <FormField
            label="Description"
            as="textarea"
            rows={5}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            hint="Optional."
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => (saving ? null : setDeleting(null))}
        closeOnBackdrop={!saving}
        title="Delete event"
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
          Delete <strong>&ldquo;{deleting?.title}&rdquo;</strong>? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
