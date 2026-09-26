import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormField, { filterSelectClass } from '../../components/FormField';
import FormStatus, { ok } from '../../components/FormStatus';
import Modal from '../../components/Modal';
import useTeacherTargets from '../../hooks/useTeacherTargets';
import { staffAudienceLabel } from '../../format/audience';
import { timestampDay } from '../../format/date';
import teacherAnnouncementCard from './announcements/card';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Teacher announcements: list, compose, edit, delete.
//
// THIS IS THE CLASS BOARD. Not a separate feature and not a separate
// affordance — CLAUDE.md records a Class Board post as identified by its SHAPE
// alone (teacher-posted, both target_grade and target_section set), and a
// teacher's ONLY legal target is an exact section. So every announcement a
// teacher posts here is already a Class Board post, and offering a distinct
// "post to class" control would present a choice that does not exist. The
// target label names the audience instead of naming a feature.
//
// "POST TO CLASS" FROM MESSAGES OPENS THIS FORM. The thread navigates here
// with location.state.compose = { content, target? }. content is the unsent
// draft (never the last incoming message). target is `${grade}|${section}`
// (keyOf's format), sent ONLY from a parent thread whose contacts row carried
// the child's class — the thread reads it from GET /messages/contacts, the one
// messages endpoint with a class. Without target, the teacher picks, or the
// one-section auto-select applies; that auto-select is "you only have one
// section", not "we knew this child's class." This page re-validates target
// against its own list before selecting it: the thread preselects, it does
// not authorize, and the server still decides on POST. Do not reconstruct the
// class by matching student_name to a student list (two students can share a
// name). Do not build another compose form.
//
// NO ATTACHMENT FIELD. announcements.attachment_url exists but nothing uploads
// — POST accepts it as a URL string with no endpoint to produce one — so
// offering it would promise a feature that does not exist. Same call as the
// excuse-letter attachment.

const EMPTY_FORM = { title: '', content: '', category: '', target: '' };

export default function AnnouncementsPage() {
  usePageTitle('Announcements');
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { sections, loading: targetsLoading } = useTeacherTargets();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sectionFilter, setSectionFilter] = useState('');
  const [applied, setApplied] = useState({ section: '' });

  // Compose/edit modal owns its draft, created when it opens and discarded when
  // it closes (convention 5b). The list row renders the STORED post and is
  // never written from this form — on success the list refetches.
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  // True only when location.state asked for a target that is not in `sections`.
  // By construction a contacts-derived class is in this list (see the thread
  // page header); this branch is the backstop so a disagreement lands on
  // "Pick a section", never silently on another section's option.
  const [staleTargetNotice, setStaleTargetNotice] = useState(false);
  // A thread arrival that could not open compose because the target list came
  // back empty. Held here so the draft is shown, not discarded — see the
  // arrival effect.
  const [undelivered, setUndelivered] = useState(null);

  // Delete is a HARD DELETE with no status column and no restore path, so it
  // gets an explicit confirmation naming the post (convention 5e). Editing is
  // freely repeatable and gets none.
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // The outcome of the last post, edit or delete, rendered above the list
  // (§7c — it outlives the modal). Admin → Announcements' pattern, and its
  // words: this page closed its modal and reloaded, and a changed row was the
  // only sign a write had landed (fix/smoke-gate). Cleared whenever a modal
  // opens, so a stale message never sits beside a new action.
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
      if (applied.section) {
        const [grade, name] = applied.section.split('|');
        params.grade_level = grade;
        params.section = name;
      }
      const result = await api.get('/announcements', { unwrap: ['announcements', 'page'], params });
      setRows(result.announcements);
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

  // Thread arrival. Auto-open only when compose state is present AND the
  // target list has finished loading — opening against [] would hide compose
  // behind the "no targets" muted copy, or auto-select nothing and then
  // overwrite once sections arrive. Consume-once replace so refresh / Back
  // does not reopen a write form (state does not travel in a shared link).
  useEffect(() => {
    const compose = location.state?.compose;
    if (!compose || targetsLoading) return;
    if (sections.length === 0) {
      // Do NOT open compose: a form with no valid target is the dead-end this
      // codebase refuses. But do not drop the draft silently either — since
      // the thread now sends a target too, a silent drop loses more and shows
      // less. Keep it and say so. useTeacherTargets returns [] both when the
      // list failed to load and when there is genuinely nothing to post to,
      // and it exposes no error, so the notice names both causes rather than
      // guessing one (§5f). Distinguishing them would mean changing the hook —
      // out of scope here.
      setUndelivered({
        content: typeof compose.content === 'string' ? compose.content : '',
        target: typeof compose.target === 'string' ? compose.target : '',
      });
      navigate('.', { replace: true, state: {} });
      return;
    }
    openComposeFromThread(compose);
    navigate('.', { replace: true, state: {} });
    // sections is state from useTeacherTargets — identity is stable until load.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consume-once; openComposeFromThread reads current sections
  }, [location.state, targetsLoading, sections, navigate]);

  function openCompose() {
    setWriteStatus({});
    setEditing(null);
    setForm({ ...EMPTY_FORM, target: sections.length === 1 ? keyOf(sections[0]) : '' });
    setFormError(null);
    setStaleTargetNotice(false);
    setComposing(true);
  }

  // Do not call openCompose() from the thread path — that helper resets content.
  function openComposeFromThread({ content, target: requested }) {
    const requestedKey = typeof requested === 'string' && requested ? requested : '';
    const known = requestedKey && sections.some((s) => keyOf(s) === requestedKey);
    let target = '';
    let stale = false;
    if (known) {
      target = requestedKey;
    } else if (requestedKey) {
      target = '';
      stale = true;
    } else {
      target = sections.length === 1 ? keyOf(sections[0]) : '';
    }
    setWriteStatus({});
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      content: typeof content === 'string' ? content : '',
      target,
    });
    setFormError(null);
    setStaleTargetNotice(stale);
    setComposing(true);
  }

  function openEdit(row) {
    setWriteStatus({});
    setEditing(row);
    setForm({
      title: row.title || '',
      content: row.content || '',
      category: row.category || '',
      target: `${row.target_grade}|${row.target_section}`,
    });
    setFormError(null);
    setStaleTargetNotice(false);
    setComposing(true);
  }

  async function submitForm(event) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const [grade, name] = form.target.split('|');
      const body = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category.trim() || undefined,
        target_grade: Number(grade),
        target_section: name,
      };
      if (editing) {
        await api.put(`/announcements/${editing.id}`, body, { unwrap: 'announcement' });
      } else {
        await api.post('/announcements', body, { unwrap: 'announcement' });
      }
      const message = editing ? 'Announcement updated.' : 'Announcement posted.';
      setComposing(false);
      await load();
      setWriteStatus({ announcements: ok(message) });
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
      await api.delete(`/announcements/${deleting.id}`, { raw: true });
      setDeleting(null);
      await load();
      setWriteStatus({ announcements: ok('Announcement deleted.') });
    } catch (err) {
      setDeleteError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  const canPost = sections.length > 0;
  const hasFilter = Boolean(applied.section);

  // Empty-state copy derived from the filter state that produced it, never from
  // a flag that means "something is set" (convention 5f).
  const emptyState = hasFilter
    ? {
        icon: 'fa-filter',
        title: 'No announcements for that section',
        message: 'Try another section, or clear the filter to see everything you can read.',
        reset: true,
      }
    : {
        icon: 'fa-bullhorn',
        title: 'No announcements yet',
        message: canPost
          ? 'School-wide posts from the admin and posts for your classes appear here.'
          : 'School-wide posts from the admin appear here.',
        reset: false,
      };

  const columns = useMemo(
    () => [
      {
        key: 'title',
        header: 'Announcement',
        sortable: true,
        render: (row) => (
          <div>
            <div className="font-medium text-fg">{row.title}</div>
            <div className="line-clamp-2 max-w-xl text-xs text-fg-muted">{row.content}</div>
          </div>
        ),
      },
      {
        key: 'audience',
        header: 'Audience',
        // ONE label per audience, shared with this page's card and with
        // Admin → Announcements (`format/audience.js`). The tone still
        // differs — school-wide is muted, a targeted post is not — because
        // that is emphasis, not wording.
        render: (row) => (
          <span className={row.target_grade === null ? 'text-fg-muted' : 'text-fg-secondary'}>
            {staffAudienceLabel(row)}
          </span>
        ),
      },
      // `timestampDay`, NOT slice(0, 10) — `created_at` is a TIMESTAMP on
      // the wire as a UTC instant, and slicing it showed the PREVIOUS day
      // for anything posted before 08:00 PH (format/date.js).
      { key: 'created_at', header: 'Posted', sortable: true, render: (row) => timestampDay(row.created_at) },
      {
        key: 'actions',
        header: '',
        align: 'right',
        // Author-or-admin only. A teacher who is not the author gets 403 from
        // the API, so the controls are simply not offered — same anti-dead-end
        // rule as the Students page's absent Edit button.
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
                onClick={() => openDelete(row)}
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
      {undelivered ? (
        <div className="space-y-2 rounded-lg border border-warning-edge bg-warning-soft px-4 py-3 text-sm text-warning-strong">
          <p>
            The announcement form could not open: your section list did not load, or you have
            no sections to post to.
            {undelivered.target
              ? ` It was meant for Grade ${undelivered.target.split('|')[0]} - ${undelivered.target.split('|')[1]}.`
              : ''}{' '}
            Nothing was posted.
          </p>
          {undelivered.content ? (
            <>
              <p>Your message draft is below. Copy it before leaving this page.</p>
              <textarea
                readOnly
                rows={3}
                value={undelivered.content}
                aria-label="Undelivered message draft"
                className="block w-full rounded-lg border border-warning-edge bg-surface px-3 py-2 text-sm text-fg"
              />
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setUndelivered(null)}
            className="rounded-lg border border-warning-edge-strong px-3 py-1 text-sm text-warning-strong transition hover:bg-warning-soft-hover"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-edge bg-surface p-4">
        {/* NO APPLY BUTTON, AND NO FORM (item 5, 2026-09-25). This page has
            exactly ONE bounded control, and "one control that refetches on
            change has no state worth staging" — the rule both parent list
            pages already state in their own words. Staging exists to stop a
            request per keystroke on a free-text search; there is no text here
            and nothing to commit together.

            `applied` STAYS. It is a `load` dependency and the empty-state copy
            keys on it (§5f), so collapsing it into the select's own value
            would mean rewriting the fetch and the empty branches for no gain.
            The select simply writes both at once, the way the parent pages do.

            `setOffset(0)` travels with it: a filter change that left the
            reader on page 3 of a different list is C6, and it is the exact
            defect `teacher/AttendanceRecordsPage` shipped with. */}
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            label="Section"
            as="select"
            className={filterSelectClass}
            value={sectionFilter}
            onChange={(e) => {
              setSectionFilter(e.target.value);
              setOffset(0);
              setApplied({ section: e.target.value });
            }}
          >
            {/* "All my classes", not "All I can read" — this is a SECTION
                filter, and the page's own empty state says "posts for your
                classes". Same fact, same words. */}
            <option value="">All my classes</option>
            {sections.map((s) => (
              <option key={keyOf(s)} value={keyOf(s)}>
                Grade {s.grade_level} - {s.name}
              </option>
            ))}
          </FormField>
        </div>

        {targetsLoading ? null : canPost ? (
          <button
            type="button"
            onClick={openCompose}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
          >
            New announcement
          </button>
        ) : (
          // No valid targets: hide compose rather than offer a form that can
          // only fail. The explanation is what stops this reading as broken.
          <p className="max-w-sm text-sm text-fg-muted">
            You can post once you are assigned to a class or made a section adviser.
          </p>
        )}
      </div>

      <FormStatus status={writeStatus.announcements} />

      <DataTable
        // CONTENT-LIST CARD (DV1b-a). Each fact appears ONCE: the headline as
        // the title, the body preview as the subtitle, and audience + date
        // together in meta. Every card slot truncates to a single line, so a
        // line-clamped paragraph is not an option here and the preview is one
        // line by construction.
        //
        // NO `to` AND NO `onSelect`: this page has no detail route, and Edit /
        // Delete are two peers rather than one primary action — the Users
        // directory's case (§5a-iii). The card renders static with its actions
        // underneath, and no chevron, because a card that looks tappable and
        // is not is worse than one that never claimed to be.
        renderCard={(row) =>
          teacherAnnouncementCard(row, {
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
                  onClick={() => openDelete(row)}
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
                setSectionFilter('');
                setOffset(0);
                setApplied({ section: '' });
              }}
              className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
            >
              Clear filter
            </button>
          ) : null
        }
      />

      <Modal
        open={composing}
        onClose={() => (saving ? null : setComposing(false))}
        closeOnBackdrop={!saving}
        title={editing ? 'Edit announcement' : 'New announcement'}
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
              form="announcement-form"
              disabled={saving || !form.title.trim() || !form.content.trim() || !form.target}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary-disabled"
            >
              {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              {editing ? 'Save changes' : 'Post'}
            </button>
          </>
        }
      >
        <form id="announcement-form" onSubmit={submitForm} className="space-y-4">
          {formError ? <ErrorAlert message={formError} /> : null}
          {staleTargetNotice ? (
            <p className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2 text-sm text-warning-strong">
              That class is not in your current list. Pick a section.
            </p>
          ) : null}

          <FormField
            label="Posting to"
            as="select"
            required
            value={form.target}
            onChange={(e) => {
              setForm((f) => ({ ...f, target: e.target.value }));
              setStaleTargetNotice(false);
            }}
            // Names the AUDIENCE rather than a feature name. A teacher cannot
            // post school-wide or whole-grade (both admin-only, 403), so those
            // options are not offered at all.
            // The empty-audience sentence is GENERAL, not a warning about the
            // currently selected section. useTeacherTargets returns no
            // enrollment count, so "only when this section is empty" is not
            // knowable without a third call (GET /students) — the call this
            // dispatch retired. An assigned empty / all-inactive section is
            // now in the picker; saying only "parents will see this" would
            // be vacuously true in the way that misleads (§5i).
            hint="Parents of this section will see this post. A section with no students has no parents to reach. Teachers can only post to their own sections."
          >
            <option value="">Select a section…</option>
            {sections.map((s) => (
              <option key={keyOf(s)} value={keyOf(s)}>
                Grade {s.grade_level} - {s.name}
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
            label="Message"
            as="textarea"
            rows={6}
            required
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
          />

          <FormField
            label="Category"
            maxLength={50}
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            hint="Optional — e.g. Reminder, Activity."
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => (saving ? null : setDeleting(null))}
        closeOnBackdrop={!saving}
        title="Delete announcement"
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
          Delete <strong>&ldquo;{deleting?.title}&rdquo;</strong>? This cannot be undone — parents
          who have not read it yet will never see it.
        </p>
      </Modal>
    </div>
  );
}

function keyOf(section) {
  return `${section.grade_level}|${section.name}`;
}
