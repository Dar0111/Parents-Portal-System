import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonClass';
import DataTable from '../../components/DataTable';
import DraftNotice from '../../components/DraftNotice';
import ErrorAlert from '../../components/ErrorAlert';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField, { filterFieldClass, filterSelectClass } from '../../components/FormField';
import FormStatus, { ok } from '../../components/FormStatus';
import Modal from '../../components/Modal';
import SectionHeader from '../../components/SectionHeader';
import { shortDate, todayLocalDateString } from '../../format/date';
import { staffAudienceLabel } from '../../format/audience';
import Reveal from '../../motion/Reveal';
import teacherEventCard from './events/card';
import useTeacherTargets from '../../hooks/useTeacherTargets';
import { useAuth } from '../../auth/AuthContext';
import { editContext, itemChangedSince } from '../../drafts/draftCore';
import { findOpenDrafts, loadDraft } from '../../drafts/sessionDrafts';
import { useDraftAutosave } from '../../drafts/useDraft';
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
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): one section — its header
// (title, New event), the filter card, the last write's result, the list.
// Both Modals sit BESIDE the entrance wrapper, never inside it: Modal
// renders inline, and a wrapper mid-tween carries a transform
// (motion/motion.js).
//
// THE FORM KEEPS A DRAFT (feat/form-drafts, 2026-10-04; FRONTEND §28): kept in
// this tab under this account's numeric id — `new`, or `edit-<event id>` — so
// Close and a reload keep it and a reload reopens the form; removed on a
// confirmed post or edit, on a confirmed Discard draft, and on logout.

const EMPTY_FORM = { title: '', description: '', event_date: '', target_grade: '' };

// The form's fields of an event — what an edit opens with, and the draft's base.
function eventFields(row) {
  return {
    title: row.title || '',
    description: row.description || '',
    event_date: row.event_date || '',
    target_grade: String(row.target_grade ?? ''),
  };
}

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

  // Assembled ONCE and read by both `isDirty` and the submit handler below —
  // two derivations of the same truth is how a cue and a commit drift apart
  // (item 5).
  const draftFilters = { grade: gradeFilter, from, to };
  const dirty = isDirty(draftFilters, applied);

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  // What the form opened with (the draft's base), and the notice while a
  // kept draft is on screen ('restored' / 'changed').
  const [formBase, setFormBase] = useState(EMPTY_FORM);
  const [draftNotice, setDraftNotice] = useState(null);
  const userId = user?.id ?? null;
  const draft = useDraftAutosave({
    userId,
    form: 'event',
    context: editing ? editContext(editing.id) : 'new',
    values: form,
    base: formBase,
    active: composing,
  });
  const restoreTried = useRef(false);

  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // The outcome of the last post, edit or delete, rendered above the list
  // (§7c — it outlives the modal). Admin → Announcements' pattern: this page
  // closed its modal and reloaded, and a changed row was the only sign a write
  // had landed (fix/smoke-gate). Cleared whenever a modal opens.
  const [writeStatus, setWriteStatus] = useState({});

  function openDelete(row) {
    setWriteStatus({});
    setDeleting(row);
    setDeleteError(null);
  }

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
      // THE FORM THAT WAS OPEN COMES BACK after a reload (FRONTEND §28): a new
      // event's draft, or an edit whose event is on this page. Once, here.
      if (!restoreTried.current) {
        restoreTried.current = true;
        const [open] = findOpenDrafts({ userId, form: 'event' });
        const row = open && open.context !== 'new' ? result.events.find((r) => editContext(r.id) === open.context) : null;
        if (open && (open.context === 'new' || row)) {
          setEditing(row || null);
          setForm(open.record.values);
          setFormBase(open.record.base || (row ? eventFields(row) : EMPTY_FORM));
          setDraftNotice(row && itemChangedSince('event', open.record, eventFields(row)) ? 'changed' : 'restored');
          setComposing(true);
        }
      }
    } catch (err) {
      setError(extractError(err));
      setRows([]);
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [applied, offset, sort, userId]);

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

  useEffect(() => {
    load();
  }, [load]);

  function openCompose() {
    setWriteStatus({});
    setEditing(null);
    const opening = {
      ...EMPTY_FORM,
      event_date: todayLocalDateString(),
      target_grade: grades.length === 1 ? String(grades[0]) : '',
    };
    const kept = loadDraft({ userId, form: 'event', context: 'new' });
    setForm(kept ? kept.values : opening);
    setFormBase(kept?.base || opening);
    setDraftNotice(kept ? 'restored' : null);
    setFormError(null);
    setComposing(true);
  }

  // A callback on the account id, because the table's columns (memoised
  // below) call it: it reads this account's draft for the row.
  const openEdit = useCallback(
    (row) => {
      setWriteStatus({});
      setEditing(row);
      const current = eventFields(row);
      const kept = loadDraft({ userId, form: 'event', context: editContext(row.id) });
      setForm(kept ? kept.values : current);
      setFormBase(kept?.base || current);
      setDraftNotice(kept ? (itemChangedSince('event', kept, current) ? 'changed' : 'restored') : null);
      setFormError(null);
      setComposing(true);
    },
    [userId]
  );

  // Close keeps the draft; only Discard draft and a confirmed write remove it.
  function closeCompose() {
    if (saving) return;
    draft.close();
    setComposing(false);
    setDraftNotice(null);
  }

  // After the inline "Discard this draft?" was confirmed (DraftNotice).
  function discardDraft() {
    draft.discard();
    const opening = editing
      ? eventFields(editing)
      : { ...EMPTY_FORM, event_date: todayLocalDateString(), target_grade: grades.length === 1 ? String(grades[0]) : '' };
    setForm(opening);
    setFormBase(opening);
    setDraftNotice(null);
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
      const message = editing ? 'Event updated.' : 'Event posted.';
      // The server confirmed: the draft goes, and is not written again.
      draft.submitted(form);
      setDraftNotice(null);
      setComposing(false);
      await load();
      setWriteStatus({ events: ok(message) });
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
      setWriteStatus({ events: ok('Event deleted.') });
    } catch (err) {
      setDeleteError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  const canPost = grades.length > 0;
  const hasFilter = Boolean(applied.grade || applied.from || applied.to);

  // ONE reset, used by the filter bar AND the empty state (item 5b). Item 5
  // handed `FilterActions` a `canReset={false}` and a no-op `onReset` while an
  // inline clear handler with exactly this body sat in the empty state below
  // — so a filtered list that HAD results offered no way to clear except
  // retyping each control, and the empty state's "Clear filters" appeared only
  // once the list was empty. `hasFilter` already answers "is anything
  // applied", which is precisely what `canReset` means.
  function resetFilters() {
    setGradeFilter('');
    setFrom('');
    setTo('');
    setOffset(0);
    setApplied({ grade: '', from: '', to: '' });
  }

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
            <div className="font-semibold text-fg">{row.title}</div>
            {row.description ? (
              <div className="mt-0.5 line-clamp-2 max-w-xl text-xs text-fg-muted">{row.description}</div>
            ) : null}
          </div>
        ),
      },
      // A DATE column: the literal "2026-09-25" arrives as a string and
      // `shortDate` rewrites it as one (§5a-iv). DataTable sorts the raw row
      // value, so the column still sorts chronologically. One line, tabular
      // figures: the date is the fact this list is scanned for.
      {
        key: 'event_date',
        header: 'Date',
        sortable: true,
        nowrap: true,
        render: (row) => <span className="font-semibold tabular-nums text-fg">{shortDate(row.event_date)}</span>,
      },
      {
        key: 'audience',
        header: 'Audience',
        // `hasSections: false` — the events table has no `target_section`
        // column, so an event is school-wide or a whole grade and nothing
        // else. Same wording source as Announcements and admin; the shape
        // difference is declared rather than papered over (`format/audience.js`).
        // The same chip as Announcements: school-wide muted, a grade not.
        nowrap: true,
        render: (row) => (
          <span
            className={`inline-flex rounded-md px-2.5 py-0.5 text-xs font-semibold ${
              row.target_grade === null ? 'bg-surface-muted text-fg-muted' : 'bg-brand-soft text-brand'
            }`}
          >
            {staffAudienceLabel(row, { hasSections: false })}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        nowrap: true,
        render: (row) =>
          row.posted_by === user?.id ? (
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => openEdit(row)}>
                Edit
              </Button>
              <Button size="sm" variant="danger-outline" onClick={() => openDelete(row)}>
                Delete
              </Button>
            </div>
          ) : null,
      },
    ],
    [user?.id, openEdit]
  );

  return (
    <div>
      <Reveal className="space-y-6">
        <section className="space-y-3">
          {/* THE PAGE'S ACTION SITS IN THE SECTION HEADER, ABOVE AND OUTSIDE
              THE FILTER CARD, AND IS NEUTRAL (fix/smoke-gate). It sat inside
              the card beside Apply, so a staged filter showed two identical
              filled buttons — and Apply's fill is the "changes not applied"
              signal (§21b), the one that needs the eye. Worse, the cue's
              width pushed the dirty row past the card at 1280 and "New event"
              jumped to a new line the moment a filter was touched. Out of the
              card, nothing a filter does can move it. Enroll student is the
              same neutral, for the same reason.

              Nothing is said while the target list is loading; a teacher
              with no grade to post to reads why there is no button. */}
          <SectionHeader
            title="Posted events"
            description={
              targetsLoading || canPost
                ? null
                : 'You can post once you are assigned to a class or made a section adviser.'
            }
            actions={
              !targetsLoading && canPost ? (
                <Button icon="fa-plus" onClick={openCompose}>
                  New event
                </Button>
              ) : null
            }
          />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setOffset(0);
              setApplied(draftFilters);
            }}
            className={`${cardClass} flex flex-wrap items-start gap-3 p-4`}
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
            <FormField
              label="From"
              type="date"
              className={filterFieldClass}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <FormField
              label="To"
              type="date"
              className={filterFieldClass}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <FilterActions dirty={dirty} canReset={hasFilter} onReset={resetFilters} />
          </form>

          <FormStatus status={writeStatus.events} />

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
                      <Button size="sm" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger-outline" onClick={() => openDelete(row)}>
                        Delete
                      </Button>
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
                <Button size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        </section>
      </Reveal>

      <Modal
        open={composing}
        onClose={closeCompose}
        closeOnBackdrop={!saving}
        title={editing ? 'Edit event' : 'New event'}
        size="lg"
        footer={
          <>
            <Button onClick={closeCompose} disabled={saving}>
              Close
            </Button>
            {/* `loading` adds the spinner; the button is disabled exactly
                when it was before (saving, or a required field empty). */}
            <Button
              variant="primary"
              type="submit"
              form="event-form"
              disabled={saving || !form.title.trim() || !form.event_date || !form.target_grade}
              loading={saving}
            >
              {editing ? 'Save changes' : 'Post'}
            </Button>
          </>
        }
      >
        <form id="event-form" onSubmit={submitForm} className="space-y-4">
          {draftNotice ? <DraftNotice changed={draftNotice === 'changed'} onDiscard={discardDraft} /> : null}
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
            <Button onClick={() => setDeleting(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={saving}>
              Delete
            </Button>
          </>
        }
      >
        {deleteError ? <ErrorAlert message={deleteError} className="mb-4" /> : null}
        <p className="break-words text-sm text-fg-body">
          Delete <strong className="text-fg">&ldquo;{deleting?.title}&rdquo;</strong>? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
