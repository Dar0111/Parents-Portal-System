import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok } from '../../components/FormStatus';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField, { filterSelectClass } from '../../components/FormField';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import SectionHeader from '../../components/SectionHeader';
import { buttonClass, cardClass } from '../../components/buttonClass';
import { staffAudienceLabel } from '../../format/audience';
import { timestampDay } from '../../format/date';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';
import Reveal from '../../motion/Reveal';

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
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): the one-line note, then the
// two sections, each with its own header (title, Reload, its "New …"
// action), its write's result and its list. EACH RELOAD IS THAT LIST'S OWN
// load(): announcements with the grade/class filter, page and sort that are
// APPLIED now, memos with their page and sort. Neither commits a draft
// filter, resets anything, or touches the other list or a status message.
// The three dialogs sit BESIDE the entrance wrapper, never inside it: Modal
// renders inline, and a wrapper mid-tween carries a transform
// (motion/motion.js).

const EMPTY_ANN = { audience: 'school', grade: '', section: '', title: '', content: '', category: '' };
const EMPTY_MEMO = { title: '', content: '' };
const EMPTY_FILTER = { grade: '', section: '' };

// The compose form's three audiences, in the order the server's admin branch
// resolves them. The labels describe the action about to be taken (see the
// note on `audienceLabel` below).
const AUDIENCE_OPTIONS = [
  { value: 'school', label: 'Everyone at the school' },
  { value: 'grade', label: 'One whole grade' },
  { value: 'class', label: 'One class' },
];

// The two row actions, table and card alike: the row-action size (44px under
// a finger, 36px under a pointer). Delete is the outlined danger — it opens
// the confirmation that names the post; the filled danger is that dialog's
// confirm, and nothing else.
const buttonNeutral = buttonClass({ size: 'sm' });
const buttonDanger = buttonClass({ variant: 'danger-outline', size: 'sm' });

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
  // This page names its pair `filterDraft`/`filter` rather than
  // `draft`/`applied`; the comparison is the same one either way (item 5).
  // The dependent Grade→Class pair works out correctly: changing Grade blanks
  // Class in the draft, so going 6 → 5 → 6 while "Malikhain" is APPLIED stays
  // dirty — which is right, because the class really was cleared.
  const dirty = isDirty(filterDraft, filter);

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

  const announcementColumns = [
    {
      key: 'title',
      header: 'Announcement',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-semibold text-fg">{row.title}</div>
          <div className="mt-0.5 line-clamp-2 max-w-xl text-xs text-fg-muted">{row.content}</div>
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
    // `timestampDay`, NOT slice(0, 10). `created_at` is a TIMESTAMP and
    // reaches the client as a UTC instant, so slicing it showed the PREVIOUS
    // day for anything posted before 08:00 PH (format/date.js). Sorting is
    // unaffected: DataTable sorts on the row value, never the render.
    // A date reads as one value (nowrap), in tabular figures.
    {
      key: 'created_at',
      header: 'Posted',
      sortable: true,
      nowrap: true,
      render: (row) => <span className="tabular-nums">{timestampDay(row.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      // The pair keeps one row and claims its width, rather than stacking
      // under the text beside it.
      nowrap: true,
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
          <div className="font-semibold text-fg">{row.title}</div>
          <div className="mt-0.5 line-clamp-2 max-w-2xl text-xs text-fg-muted">{row.content}</div>
        </div>
      ),
    },
    { key: 'posted_by_name', header: 'Posted by', sortable: true, render: (row) => row.posted_by_name },
    // `timestampDay`, NOT slice(0, 10). `created_at` is a TIMESTAMP and
    // reaches the client as a UTC instant, so slicing it showed the PREVIOUS
    // day for anything posted before 08:00 PH (format/date.js). Sorting is
    // unaffected: DataTable sorts on the row value, never the render.
    {
      key: 'created_at',
      header: 'Posted',
      sortable: true,
      nowrap: true,
      render: (row) => <span className="tabular-nums">{timestampDay(row.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      nowrap: true,
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
    <div>
      <Reveal className="space-y-6">
        {/* The page's one note, as a note: memos are on this page and nowhere
            else, and a reader looking for a Memos page needs to be told before
            the first list, not after it. */}
        <p className="flex items-start gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3 text-sm text-info-strong">
          <span aria-hidden="true" className="mt-0.5 flex items-center justify-center">
            <i className="fa-solid fa-circle-info" />
          </span>
          <span className="min-w-0">
            Memos have no page of their own — they are posted here, below announcements, and go to
            everyone.
          </span>
        </p>

        <section className="space-y-3">
          {/* THE ACTION SITS ON THE HEADING ROW, NEUTRAL — the Memos section's
              shape below (fix/smoke-gate). Inside the filter card, a staged
              filter showed two identical filled buttons (Apply's fill is the
              §21b signal), and the "changes not applied" cue pushed the row to
              993px in a 958px card at 1280, so "New announcement" jumped to a
              new line the moment a filter was touched. On the heading row it
              measured at identical coordinates clean and dirty, 1280 and 390.
              (Those figures are from before feat/ui-refresh and have not been
              re-measured; the placement and the reason stand.)

              THE `className` KEEPS THE TITLE WHOLE ON A PHONE. SectionHeader's
              title column has no minimum width, so beside Reload and "New
              announcement" a 390px screen leaves it about 7rem — less than the
              one unbreakable word "Announcements" needs, which would then run
              under the buttons. `min-w-fit` on that column makes the controls
              wrap to their own line instead. By arithmetic, not yet seen in a
              browser; from `sm` up everything fits on one row and nothing
              changes. */}
          <SectionHeader
            title="Announcements"
            className="[&>div:first-child]:min-w-fit"
            onReload={loadAnnouncements}
            reloading={annLoading}
            reloadLabel="Reload announcements"
            actions={
              <Button icon="fa-plus" onClick={openNewAnnouncement}>
                New announcement
              </Button>
            }
          />
          {/* THE FILTER BAR IS ITS OWN CARD, and only the filter lives in it. */}
          <form onSubmit={applyFilter} className={`${cardClass} flex flex-wrap items-end gap-3 p-4`}>
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
            {/* This page's Apply used the NEUTRAL bordered class — identical
                to its Reset, and the only one of the nine that did. Under
                item 5 neutral MEANS "nothing staged", so that styling was
                already saying the wrong thing; it just had no vocabulary to
                be wrong in. `FilterActions` now owns both states. */}
            <FilterActions dirty={dirty} canReset={canReset} onReset={resetFilter} />
          </form>
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
              meta: `${audienceLabel(row)} · ${row.posted_by_name} · ${timestampDay(row.created_at)}`,
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
                <Button size="sm" onClick={resetFilter}>
                  Clear filter
                </Button>
              ) : null
            }
          />
        </section>

        <section className="space-y-3">
          {/* Neutral too, so the page's two "New …" actions match (Darryl,
              2026-09-26) — there is no Apply beside this one, but a filled
              "New memo" under a neutral "New announcement" would read as a
              difference in weight that does not exist. */}
          <SectionHeader
            title="Memos"
            onReload={loadMemos}
            reloading={memoLoading}
            reloadLabel="Reload memos"
            actions={
              <Button icon="fa-plus" onClick={openNewMemo}>
                New memo
              </Button>
            }
          />
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
              meta: `${row.posted_by_name} · ${timestampDay(row.created_at)}`,
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
      </Reveal>

      <Modal
        open={annEditing !== null}
        onClose={closeAnnouncement}
        closeOnBackdrop={!saving}
        title={annEditing?.id ? 'Edit announcement' : 'New announcement'}
        size="lg"
        footer={
          // The neutral way out, then the one filled action. `loading` adds
          // the spinner the old button drew by hand while saving.
          <>
            <Button onClick={closeAnnouncement} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="admin-announcement-form"
              disabled={saving || !annForm.title.trim() || !annForm.content.trim()}
              loading={saving}
            >
              {annEditing?.id ? 'Save changes' : 'Post'}
            </Button>
          </>
        }
      >
        {/* No scroller of its own: the dialog's body is the scroller now
            (Modal), so a long form no longer scrolls inside a scrolling box. */}
        <form id="admin-announcement-form" onSubmit={submitAnnouncement} className="space-y-4">
          {formError ? <ErrorAlert message={formError} /> : null}

          {/* Each audience is ONE <label> around a NATIVE radio, so the whole
              44px row is the target and the arrow keys work as a radio
              group's do. The chosen one is told apart by the radio's own dot,
              a doubled edge (border plus a ring — a ring, so the row does not
              change size) and a heavier label, never by colour alone. */}
          <fieldset>
            <legend className="mb-1.5 block text-sm font-semibold text-fg-secondary">Audience</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {AUDIENCE_OPTIONS.map((opt) => {
                const checked = annForm.audience === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm text-fg transition has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus-accent ${
                      checked
                        ? 'border-primary bg-surface-subtle font-bold ring-1 ring-primary'
                        : 'border-edge-strong font-semibold hover:bg-surface-subtle'
                    }`}
                  >
                    <input
                      type="radio"
                      name="audience"
                      value={opt.value}
                      checked={checked}
                      onChange={() => setAnnForm((f) => ({ ...f, audience: opt.value, section: '' }))}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {annForm.audience !== 'school' ? (
            <div className="grid gap-4 sm:grid-cols-2">
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
            <p className="flex items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3 text-sm text-warning-strong">
              <span aria-hidden="true" className="mt-0.5 flex items-center justify-center">
                <i className="fa-solid fa-triangle-exclamation" />
              </span>
              <span className="min-w-0">This class has no students, so no parent will see this post.</span>
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
            <Button onClick={closeMemo} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="admin-memo-form"
              disabled={saving || !memoForm.title.trim() || !memoForm.content.trim()}
              loading={saving}
            >
              {memoEditing?.id ? 'Save changes' : 'Post memo'}
            </Button>
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
          // The filled danger is this dialog's confirm and appears nowhere
          // else on the page (the rows carry the outlined one).
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
        {/* `break-words`: a title is free text and may be one long unbroken
            string; in a narrow dialog it must wrap, never push the dialog
            wider than the screen. */}
        {deleting?.kind === 'memo' ? (
          <p className="break-words text-sm text-fg-secondary">
            Delete <strong className="text-fg">&ldquo;{deleting.row.title}&rdquo;</strong>? This cannot be undone. Every
            teacher and parent loses it.
          </p>
        ) : deleting ? (
          // "…is not told" stays: nothing in the system notifies the poster,
          // and this is the only place that fact appears in the product.
          <p className="break-words text-sm text-fg-secondary">
            Delete <strong className="text-fg">&ldquo;{deleting.row.title}&rdquo;</strong>, posted by{' '}
            {deletingOwn ? 'you' : deleting.row.posted_by_name} to {audienceLabel(deleting.row)}? This
            cannot be undone. Parents who have not read it will never see it
            {deletingOwn ? '.' : `, and ${deleting.row.posted_by_name} is not told.`}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
