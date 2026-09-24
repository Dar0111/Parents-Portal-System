import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok } from '../../components/FormStatus';
import FormField, { filterSelectClass } from '../../components/FormField';
import Modal from '../../components/Modal';
import { staffAudienceLabel } from '../../format/audience';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Admin announcements AND memos — Figure 5 process 1.18, manuscript Feature 4
// ("Announcements & Memo Dissemination"). Darryl decided 2026-09-14 that
// memos live on this page: memosRouter POST/PUT/DELETE are all
// authorize('admin'), Teacher and Parent → Memos are read-only, so this is the
// ONLY place a memo can be written. The unbuilt admin "Memos" nav item stays
// built: false; this page covers it.
//
// TWO STACKED SECTIONS, not tabs (Admin → Settings precedent). Memos are here
// because they have no other home; a tab would hide them again.
//
// ANNOUNCEMENT TARGETS — the server's admin branch (content.js
// resolveAnnouncementTarget): school-wide = target_grade null + target_section
// null; whole grade = target_grade N + section null; one class = both. The
// admin section is NOT checked against `sections` server-side (a typo would
// make a post nobody can read), so the class comes from GET /sections.
//
// PUT KEEPS A FIELD'S OLD VALUE WHEN THE KEY IS OMITTED (content.js
// nextTargetGrade/nextTargetSection). "I cleared the section" and "I sent
// target_section: null" look identical in a form and are opposite in the
// request — so every write sends BOTH target keys, null when absent.
//
// EDIT ONLY YOUR OWN; DELETE ANY. The server lets admin PUT and DELETE any
// announcement. An admin PUT keeps posted_by as the original author and
// applies admin targeting, so editing a teacher's post would put new words —
// and possibly a school-wide audience — under that teacher's name. Removing a
// post is unambiguous; rewriting someone's words under their name is not.
//
// §5e: delete is a hard DELETE with no restore, so it confirms and names what
// is lost. Nothing in the system notifies the original poster; the
// confirmation says so. Edit is repeatable and does not confirm.
//
// §5b: each list has its own load(), its only writer. Drafts live in the
// modals. After a successful write that list reloads rather than splicing —
// a new post may or may not match the current filter.
//
// No attachment field: attachment_url exists on both tables and nothing
// uploads. No category filter: category is free text with no allow-list.

const EMPTY_ANN = { audience: 'school', grade: '', section: '', title: '', content: '', category: '' };
const EMPTY_MEMO = { title: '', content: '' };
const EMPTY_FILTER = { grade: '', section: '' };

// ONE staff label, shared with both teacher pages (`format/audience.js`).
// This page's own wording — "Everyone at the school" / "All of Grade 6" —
// was the outlier, and it was the outlier against THIS PAGE's own prose:
// the filter copy below already says "School-wide posts are not included in
// this filter."
//
// The COMPOSE form's options are deliberately not this: they describe an
// action you are about to take, not a post that exists.
const audienceLabel = staffAudienceLabel;

function formFromRow(row) {
  return {
    audience: row.target_grade === null ? 'school' : row.target_section ? 'class' : 'grade',
    grade: row.target_grade === null ? '' : String(row.target_grade),
    section: row.target_section || '',
    title: row.title || '',
    content: row.content || '',
    category: row.category || '',
  };
}

export default function AdminAnnouncementsPage() {
  usePageTitle('Announcements & memos');
  const { user: me } = useAuth();

  const [sections, setSections] = useState([]);

  const [announcements, setAnnouncements] = useState([]);
  const [annLoading, setAnnLoading] = useState(true);
  const [annError, setAnnError] = useState(null);

  const [memos, setMemos] = useState([]);
  const [memoLoading, setMemoLoading] = useState(true);
  const [memoError, setMemoError] = useState(null);

  const [filterDraft, setFilterDraft] = useState(EMPTY_FILTER);
  const [filter, setFilter] = useState(EMPTY_FILTER);

  // Keyed status, two keys for the two stacked lists: `announcements` and
  // `memos`. Every write here happens in a modal that closes on success, so
  // the message outlives its modal and belongs above the list it changed.
  const [status, setStatus] = useState({});

  const [annEditing, setAnnEditing] = useState(null); // null = closed, {} = new, row = edit
  const [annForm, setAnnForm] = useState(EMPTY_ANN);
  const [memoEditing, setMemoEditing] = useState(null);
  const [memoForm, setMemoForm] = useState(EMPTY_MEMO);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState(null); // { kind, row }
  const [deleteError, setDeleteError] = useState(null);

  // Two paged tables, two pager states (2026-09-19). Each is one page of a
  // server-sorted list (C1); a filter or sort change resets its offset (C6);
  // a page emptied by a delete steps back on its own (C7, in DataTable).
  const [annOffset, setAnnOffset] = useState(0);
  const [annSort, setAnnSort] = useState(null);
  const [annPage, setAnnPage] = useState(null);
  const [memoOffset, setMemoOffset] = useState(0);
  const [memoSort, setMemoSort] = useState(null);
  const [memoPage, setMemoPage] = useState(null);

  const loadAnnouncements = useCallback(async () => {
    setAnnLoading(true);
    setAnnError(null);
    try {
      const params = { ...listParams({ offset: annOffset, sort: annSort }) };
      if (filter.grade) params.grade_level = filter.grade;
      if (filter.section) params.section = filter.section;
      const result = await api.get('/announcements', { unwrap: ['announcements', 'page'], params });
      setAnnouncements(result.announcements);
      setAnnPage(result.page);
    } catch (err) {
      setAnnError(extractError(err));
      setAnnouncements([]);
      setAnnPage(null);
    } finally {
      setAnnLoading(false);
    }
  }, [filter, annOffset, annSort]);

  const loadMemos = useCallback(async () => {
    setMemoLoading(true);
    setMemoError(null);
    try {
      const result = await api.get('/memos', {
        unwrap: ['memos', 'page'],
        params: listParams({ offset: memoOffset, sort: memoSort }),
      });
      setMemos(result.memos);
      setMemoPage(result.page);
    } catch (err) {
      setMemoError(extractError(err));
      setMemos([]);
      setMemoPage(null);
    } finally {
      setMemoLoading(false);
    }
  }, [memoOffset, memoSort]);

  function changeAnnSort(next) {
    setAnnSort(next);
    setAnnOffset(0);
  }

  function changeMemoSort(next) {
    setMemoSort(next);
    setMemoOffset(0);
  }

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (!cancelled) setSections(rows);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sectionsFor = useCallback(
    (grade) =>
      grade
        ? sections
            .filter((s) => Number(s.grade_level) === Number(grade))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [sections]
  );

  const filterSections = useMemo(() => sectionsFor(filterDraft.grade), [sectionsFor, filterDraft.grade]);
  const formSections = useMemo(() => sectionsFor(annForm.grade), [sectionsFor, annForm.grade]);
  const chosenSection = useMemo(
    () => formSections.find((s) => s.name === annForm.section) || null,
    [formSections, annForm.section]
  );

  // §5i: each option says who actually reads it — the GET /announcements
  // parent and teacher branches in content.js.
  const audienceHint = (() => {
    if (annForm.audience === 'school') return 'Every teacher and every parent will see this.';
    if (annForm.audience === 'grade') {
      return annForm.grade
        ? `Every parent with a child in Grade ${annForm.grade}, and every teacher who teaches or advises a class in Grade ${annForm.grade}.`
        : 'Pick a grade.';
    }
    if (!annForm.grade || !annForm.section) return 'Pick a grade, then a class.';
    return `Parents of Grade ${annForm.grade} - ${annForm.section}, and the teachers who teach or advise that class.`;
  })();

  function clearStrips() {
    setStatus({});
  }

  function openNewAnnouncement() {
    clearStrips();
    setAnnForm(EMPTY_ANN);
    setFormError(null);
    setAnnEditing({});
  }

  function openEditAnnouncement(row) {
    clearStrips();
    setAnnForm(formFromRow(row));
    setFormError(null);
    setAnnEditing(row);
  }

  function closeAnnouncement() {
    if (saving) return;
    setAnnEditing(null);
    setFormError(null);
  }

  async function submitAnnouncement(event) {
    event.preventDefault();
    setFormError(null);
    const title = annForm.title.trim();
    const content = annForm.content.trim();
    if (!title || !content) {
      setFormError('Title and message are required.');
      return;
    }
    if (annForm.audience !== 'school' && !annForm.grade) {
      setFormError('Pick a grade.');
      return;
    }
    if (annForm.audience === 'class' && !annForm.section) {
      setFormError('Pick a class.');
      return;
    }
    // BOTH target keys, always — null when absent (PUT keeps an omitted key).
    const body = {
      title,
      content,
      category: annForm.category.trim() || null,
      target_grade: annForm.audience === 'school' ? null : Number(annForm.grade),
      target_section: annForm.audience === 'class' ? annForm.section : null,
    };
    const isEdit = Boolean(annEditing?.id);
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/announcements/${annEditing.id}`, body, { unwrap: 'announcement' });
      } else {
        await api.post('/announcements', body, { unwrap: 'announcement' });
      }
      setAnnEditing(null);
      setStatus({ announcements: ok(isEdit ? 'Announcement updated.' : 'Announcement posted.') });
      await loadAnnouncements();
    } catch (err) {
      setFormError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  function openNewMemo() {
    clearStrips();
    setMemoForm(EMPTY_MEMO);
    setFormError(null);
    setMemoEditing({});
  }

  function openEditMemo(row) {
    clearStrips();
    setMemoForm({ title: row.title || '', content: row.content || '' });
    setFormError(null);
    setMemoEditing(row);
  }

  function closeMemo() {
    if (saving) return;
    setMemoEditing(null);
    setFormError(null);
  }

  async function submitMemo(event) {
    event.preventDefault();
    setFormError(null);
    const title = memoForm.title.trim();
    const content = memoForm.content.trim();
    if (!title || !content) {
      setFormError('Title and message are required.');
      return;
    }
    const isEdit = Boolean(memoEditing?.id);
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/memos/${memoEditing.id}`, { title, content }, { unwrap: 'memo' });
      } else {
        await api.post('/memos', { title, content }, { unwrap: 'memo' });
      }
      setMemoEditing(null);
      setStatus({ memos: ok(isEdit ? 'Memo updated.' : 'Memo posted.') });
      await loadMemos();
    } catch (err) {
      setFormError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  function openDelete(kind, row) {
    clearStrips();
    setDeleteError(null);
    setDeleting({ kind, row });
  }

  async function confirmDelete() {
    if (!deleting) return;
    const { kind, row } = deleting;
    setSaving(true);
    setDeleteError(null);
    try {
      if (kind === 'announcement') {
        await api.delete(`/announcements/${row.id}`, { unwrap: 'message' });
        setDeleting(null);
        setStatus({ announcements: ok('Announcement deleted.') });
        await loadAnnouncements();
      } else {
        await api.delete(`/memos/${row.id}`, { unwrap: 'message' });
        setDeleting(null);
        setStatus({ memos: ok('Memo deleted.') });
        await loadMemos();
      }
    } catch (err) {
      setDeleteError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  function applyFilter(event) {
    event.preventDefault();
    setAnnLoading(true);
    setAnnOffset(0);
    setFilter(filterDraft);
  }

  function resetFilter() {
    setFilterDraft(EMPTY_FILTER);
    setAnnLoading(true);
    setAnnOffset(0);
    setFilter(EMPTY_FILTER);
  }

  // Its own value (§5f): "is a filter applied" is separate from the copy.
  const canReset = Boolean(filter.grade || filter.section);
  const filterLabel = filter.section ? `Grade ${filter.grade} - ${filter.section}` : `Grade ${filter.grade}`;

  const buttonNeutral =
    'rounded-lg border border-edge-strong px-2.5 py-1 text-sm text-fg-body transition hover:bg-surface-muted';
  const buttonDanger =
    'rounded-lg border border-danger-edge px-2.5 py-1 text-sm text-danger-text transition hover:bg-danger-soft';

  const announcementColumns = [
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
      render: (row) => <span className="text-fg-secondary">{audienceLabel(row)}</span>,
    },
    // Authors are mixed on the admin list, and Edit depends on it — so the
    // name is shown here even though Teacher → Announcements omits it.
    { key: 'posted_by_name', header: 'Posted by', sortable: true, render: (row) => row.posted_by_name },
    { key: 'created_at', header: 'Posted', sortable: true, render: (row) => String(row.created_at).slice(0, 10) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          {row.posted_by === me?.id ? (
            <button type="button" onClick={() => openEditAnnouncement(row)} className={buttonNeutral}>
              Edit
            </button>
          ) : null}
          <button type="button" onClick={() => openDelete('announcement', row)} className={buttonDanger}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  const memoColumns = [
    {
      key: 'title',
      header: 'Memo',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium text-fg">{row.title}</div>
          <div className="line-clamp-2 max-w-2xl text-xs text-fg-muted">{row.content}</div>
        </div>
      ),
    },
    { key: 'posted_by_name', header: 'Posted by', sortable: true, render: (row) => row.posted_by_name },
    { key: 'created_at', header: 'Posted', sortable: true, render: (row) => String(row.created_at).slice(0, 10) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => openEditMemo(row)} className={buttonNeutral}>
            Edit
          </button>
          <button type="button" onClick={() => openDelete('memo', row)} className={buttonDanger}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  const deletingOwn = deleting?.kind === 'announcement' && deleting.row.posted_by === me?.id;

  return (
    <div className="space-y-8">
      <p className="text-sm text-fg-muted">
        Memos have no page of their own — they are posted here, below announcements, and go to
        everyone.
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-fg">Announcements</h2>
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-edge bg-surface p-4">
          <form onSubmit={applyFilter} className="flex flex-wrap items-end gap-3">
            <FormField
              label="Grade"
              as="select"
              className={filterSelectClass}
              value={filterDraft.grade}
              onChange={(e) => setFilterDraft({ grade: e.target.value, section: '' })}
            >
              <option value="">All grades</option>
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <option key={g} value={String(g)}>
                  Grade {g}
                </option>
              ))}
            </FormField>
            <FormField
              label="Class"
              as="select"
              className={filterSelectClass}
              value={filterDraft.section}
              disabled={!filterDraft.grade}
              onChange={(e) => setFilterDraft((prev) => ({ ...prev, section: e.target.value }))}
            >
              <option value="">{filterDraft.grade ? 'All classes' : 'Pick a grade first'}</option>
              {filterSections.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </FormField>
            <button type="submit" className="rounded-lg border border-edge-strong px-4 py-2 text-sm text-fg-body transition hover:bg-surface-muted">
              Apply
            </button>
            {canReset ? (
              <button type="button" onClick={resetFilter} className="rounded-lg border border-edge-strong px-4 py-2 text-sm text-fg-body transition hover:bg-surface-muted">
                Reset
              </button>
            ) : null}
          </form>
          <button
            type="button"
            onClick={openNewAnnouncement}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
          >
            New announcement
          </button>
        </div>
        {/* §5f: two causes, two branches. A grade filter is an exact match on
            target_grade, so school-wide posts (NULL) are never in it — said. */}
        <FormStatus status={status.announcements} />

        <DataTable
          // CONTENT-LIST CARD (DV1b-a). TWO LABELLED GROUPS, NEVER
          // INTERLEAVED (Darryl, 2026-09-23): this page renders two tables —
          // announcements, then memos — and each keeps its own heading and
          // its own card list below `sm`. Merging them into one stream would
          // lose the distinction the page exists to make, since a memo has no
          // audience and an announcement always does.
          //
          // Static card with actions underneath: Edit (author only, matching
          // the API's 403) and Delete (any admin) are two peers, not one
          // primary action.
          renderCard={(row) => ({
            title: row.title,
            subtitle: row.content,
            meta: `${audienceLabel(row)} · ${row.posted_by_name} · ${String(row.created_at).slice(0, 10)}`,
            actions: (
              <>
                {row.posted_by === me?.id ? (
                  <button type="button" onClick={() => openEditAnnouncement(row)} className={buttonNeutral}>
                    Edit
                  </button>
                ) : null}
                <button type="button" onClick={() => openDelete('announcement', row)} className={buttonDanger}>
                  Delete
                </button>
              </>
            ),
          })}
          columns={announcementColumns}
          rows={announcements}
          loading={annLoading}
          error={annError}
          onRetry={loadAnnouncements}
          page={annPage}
          onPageChange={setAnnOffset}
          sort={annSort}
          onSortChange={changeAnnSort}
          emptyIcon={canReset ? 'fa-filter' : 'fa-bullhorn'}
          emptyTitle={canReset ? `No announcements addressed to ${filterLabel}` : 'No announcements yet'}
          emptyMessage={
            canReset
              ? 'School-wide posts are not included in this filter.'
              : 'Posts you make here and posts teachers make for their classes appear here.'
          }
          emptyAction={
            canReset ? (
              <button type="button" onClick={resetFilter} className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted">
                Clear filter
              </button>
            ) : null
          }
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">Memos</h2>
          <button
            type="button"
            onClick={openNewMemo}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
          >
            New memo
          </button>
        </div>
        {/* §5f: GET /memos takes no parameters — one cause of empty, one branch. */}
        <FormStatus status={status.memos} />

        <DataTable
          // The second of the two labelled groups. A memo is school-wide by
          // definition, so meta carries who posted it and when and there is
          // no audience — which is exactly the distinction that keeps these
          // two lists apart rather than interleaved.
          //
          // Edit is unconditional here, unlike the announcement card: Admin →
          // Announcements is the only place a memo can be written, so every
          // memo is editable from it.
          renderCard={(row) => ({
            title: row.title,
            subtitle: row.content,
            meta: `${row.posted_by_name} · ${String(row.created_at).slice(0, 10)}`,
            actions: (
              <>
                <button type="button" onClick={() => openEditMemo(row)} className={buttonNeutral}>
                  Edit
                </button>
                <button type="button" onClick={() => openDelete('memo', row)} className={buttonDanger}>
                  Delete
                </button>
              </>
            ),
          })}
          columns={memoColumns}
          rows={memos}
          loading={memoLoading}
          error={memoError}
          onRetry={loadMemos}
          page={memoPage}
          onPageChange={setMemoOffset}
          sort={memoSort}
          onSortChange={changeMemoSort}
          emptyIcon="fa-file-lines"
          emptyTitle="No memos yet"
          emptyMessage="A memo posted here reaches every teacher and parent."
        />
      </section>

      <Modal
        open={annEditing !== null}
        onClose={closeAnnouncement}
        closeOnBackdrop={!saving}
        title={annEditing?.id ? 'Edit announcement' : 'New announcement'}
        size="lg"
        footer={
          <>
            <button type="button" onClick={closeAnnouncement} disabled={saving} className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50">
              Cancel
            </button>
            <button
              type="submit"
              form="admin-announcement-form"
              disabled={saving || !annForm.title.trim() || !annForm.content.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary-disabled"
            >
              {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              {annEditing?.id ? 'Save changes' : 'Post'}
            </button>
          </>
        }
      >
        <form id="admin-announcement-form" onSubmit={submitAnnouncement} className="max-h-[70vh] space-y-4 overflow-y-auto">
          {formError ? <ErrorAlert message={formError} /> : null}

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium text-fg-secondary">Audience</legend>
            {[
              { value: 'school', label: 'Everyone at the school' },
              { value: 'grade', label: 'One whole grade' },
              { value: 'class', label: 'One class' },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-fg-secondary">
                <input
                  type="radio"
                  name="audience"
                  value={opt.value}
                  checked={annForm.audience === opt.value}
                  onChange={() => setAnnForm((f) => ({ ...f, audience: opt.value, section: '' }))}
                />
                {opt.label}
              </label>
            ))}
          </fieldset>

          {annForm.audience !== 'school' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Grade"
                as="select"
                value={annForm.grade}
                onChange={(e) => setAnnForm((f) => ({ ...f, grade: e.target.value, section: '' }))}
              >
                <option value="">Pick a grade</option>
                {[1, 2, 3, 4, 5, 6].map((g) => (
                  <option key={g} value={String(g)}>
                    Grade {g}
                  </option>
                ))}
              </FormField>
              {annForm.audience === 'class' ? (
                <FormField
                  label="Class"
                  as="select"
                  value={annForm.section}
                  disabled={!annForm.grade}
                  onChange={(e) => setAnnForm((f) => ({ ...f, section: e.target.value }))}
                >
                  <option value="">{annForm.grade ? 'Pick a class' : 'Pick a grade first'}</option>
                  {formSections.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </FormField>
              ) : null}
            </div>
          ) : null}

          <p className="text-sm text-fg-muted">{audienceHint}</p>
          {annForm.audience === 'class' && chosenSection && Number(chosenSection.student_count) === 0 ? (
            <p className="rounded-lg border border-warning-edge bg-warning-soft px-3 py-2 text-sm text-warning-strong">
              This class has no students, so no parent will see this post.
            </p>
          ) : null}

          <FormField
            label="Title"
            required
            maxLength={200}
            value={annForm.title}
            onChange={(e) => setAnnForm((f) => ({ ...f, title: e.target.value }))}
          />
          <FormField
            label="Message"
            as="textarea"
            rows={6}
            required
            value={annForm.content}
            onChange={(e) => setAnnForm((f) => ({ ...f, content: e.target.value }))}
          />
          <FormField
            label="Category"
            maxLength={50}
            value={annForm.category}
            onChange={(e) => setAnnForm((f) => ({ ...f, category: e.target.value }))}
            hint="Optional — e.g. Reminder, Activity."
          />
        </form>
      </Modal>

      <Modal
        open={memoEditing !== null}
        onClose={closeMemo}
        closeOnBackdrop={!saving}
        title={memoEditing?.id ? 'Edit memo' : 'New memo'}
        size="lg"
        footer={
          <>
            <button type="button" onClick={closeMemo} disabled={saving} className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50">
              Cancel
            </button>
            <button
              type="submit"
              form="admin-memo-form"
              disabled={saving || !memoForm.title.trim() || !memoForm.content.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary-disabled"
            >
              {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              {memoEditing?.id ? 'Save changes' : 'Post memo'}
            </button>
          </>
        }
      >
        <form id="admin-memo-form" onSubmit={submitMemo} className="space-y-4">
          {formError ? <ErrorAlert message={formError} /> : null}
          {/* A form with no audience field invites the assumption that one was
              forgotten. Memos have no targeting columns (content.js). */}
          <p className="text-sm text-fg-muted">
            Memos have no audience setting — every memo goes to every teacher and every parent.
          </p>
          <FormField
            label="Title"
            required
            maxLength={200}
            value={memoForm.title}
            onChange={(e) => setMemoForm((f) => ({ ...f, title: e.target.value }))}
          />
          <FormField
            label="Message"
            as="textarea"
            rows={6}
            required
            value={memoForm.content}
            onChange={(e) => setMemoForm((f) => ({ ...f, content: e.target.value }))}
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => (saving ? null : setDeleting(null))}
        closeOnBackdrop={!saving}
        title={deleting?.kind === 'memo' ? 'Delete memo' : 'Delete announcement'}
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setDeleting(null)} disabled={saving} className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted disabled:opacity-50">
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
        {deleting?.kind === 'memo' ? (
          <p className="text-sm text-fg-secondary">
            Delete <strong>&ldquo;{deleting.row.title}&rdquo;</strong>? This cannot be undone. Every
            teacher and parent loses it.
          </p>
        ) : deleting ? (
          // "…is not told" stays: nothing in the system notifies the poster,
          // and this is the only place that fact appears in the product.
          <p className="text-sm text-fg-secondary">
            Delete <strong>&ldquo;{deleting.row.title}&rdquo;</strong>, posted by{' '}
            {deletingOwn ? 'you' : deleting.row.posted_by_name} to {audienceLabel(deleting.row)}? This
            cannot be undone. Parents who have not read it will never see it
            {deletingOwn ? '.' : `, and ${deleting.row.posted_by_name} is not told.`}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
