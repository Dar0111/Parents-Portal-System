import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormField, { filterSelectClass } from '../../components/FormField';
import Modal from '../../components/Modal';
import { todayLocalDateString } from '../../format/date';
import { staffAudienceLabel } from '../../format/audience';
import teacherEventCard from './events/card';
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

  // Paged table (2026-09-19): one page of a server-sorted list (C1); a
  // filter or sort change resets to the first page (C6); a page emptied by
  // a delete steps back on its own (C7, in DataTable).
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { ...listParams({ offset, sort }) };
      if (applied.grade) params.grade_level = applied.grade;
      if (applied.from) params.from = applied.from;
      if (applied.to) params.to = applied.to;
      const result = await api.get('/events', { unwrap: ['events', 'page'], params });
      setRows(result.events);
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
      setRows([]);
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
            <div className="font-medium text-fg">{row.title}</div>
            {row.description ? (
              <div className="line-clamp-2 max-w-xl text-xs text-fg-muted">{row.description}</div>
            ) : null}
          </div>
        ),
      },
      { key: 'event_date', header: 'Date', sortable: true },
      {
        key: 'audience',
        header: 'Audience',
        // `hasSections: false` — the events table has no `target_section`
        // column, so an event is school-wide or a whole grade and nothing
        // else. Same wording source as Announcements and admin; the shape
        // difference is declared rather than papered over (`format/audience.js`).
        render: (row) => (
          <span className={row.target_grade === null ? 'text-fg-muted' : 'text-fg-secondary'}>
            {staffAudienceLabel(row, { hasSections: false })}
          </span>
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
                className="rounded-lg border border-edge-strong px-2.5 py-1 text-sm text-fg-body transition hover:bg-surface-muted"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleting(row);
                  setDeleteError(null);
                }}
                className="rounded-lg border border-danger-edge px-2.5 py-1 text-sm text-danger-text transition hover:bg-danger-soft"
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
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-edge bg-surface p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setOffset(0);
            setApplied({ grade: gradeFilter, from, to });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <FormField
            label="Grade"
            as="select"
            className={filterSelectClass}
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
          >
            {/* "All my grade levels", not "All I can read" — the filter is a
                GRADE filter, and the page's own empty state already says
                "events for your grades". A label should use the words the
                rest of the page uses. */}
            <option value="">All my grade levels</option>
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
            className="rounded-lg border border-edge-strong px-4 py-2 text-sm text-fg-body transition hover:bg-surface-muted"
          >
            Apply
          </button>
        </form>

        {targetsLoading ? null : canPost ? (
          <button
            type="button"
            onClick={openCompose}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
          >
            New event
          </button>
        ) : (
          <p className="max-w-sm text-sm text-fg-muted">
            You can post once you are assigned to a class or made a section adviser.
          </p>
        )}
      </div>

      <DataTable
        // CONTENT-LIST CARD (DV1b-a). The DATE LEADS the meta line here, not
        // the posting date: an event is defined by when it happens, and that
        // is the one fact a parent or teacher scans for. Audience follows it.
        //
        // Static card with its actions underneath — Edit and Delete are two
        // peers, not one primary action (§5a-iii), and only the author gets
        // them, matching the table and the API's own 403.
        renderCard={(row) =>
          teacherEventCard(row, {
            actions:
              row.posted_by === user?.id ? (
              <>
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="rounded-lg border border-edge-strong px-2.5 py-1 text-sm text-fg-body transition hover:bg-surface-muted"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleting(row);
                    setDeleteError(null);
                  }}
                  className="rounded-lg border border-danger-edge px-2.5 py-1 text-sm text-danger-text transition hover:bg-danger-soft"
                >
                  Delete
                </button>
              </>
              ) : null,
          })
        }
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        page={page}
        onPageChange={setOffset}
        sort={sort}
        onSortChange={changeSort}
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
                setOffset(0);
                setApplied({ grade: '', from: '', to: '' });
              }}
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
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
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="event-form"
              disabled={saving || !form.title.trim() || !form.event_date || !form.target_grade}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary-disabled"
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
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-danger-solid px-3 py-1.5 text-sm font-medium text-solid-fg transition hover:bg-danger-solid-hover disabled:opacity-60"
            >
              {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              Delete
            </button>
          </>
        }
      >
        {deleteError ? <ErrorAlert message={deleteError} className="mb-3" /> : null}
        <p className="text-sm text-fg-secondary">
          Delete <strong>&ldquo;{deleting?.title}&rdquo;</strong>? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
