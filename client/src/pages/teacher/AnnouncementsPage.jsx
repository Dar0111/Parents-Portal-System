import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import Modal from '../../components/Modal';
import useTeacherTargets from '../../hooks/useTeacherTargets';
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (applied.section) {
        const [grade, name] = applied.section.split('|');
        params.grade_level = grade;
        params.section = name;
      }
      setRows(await api.get('/announcements', { unwrap: 'announcements', params }));
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
      await api.delete(`/announcements/${deleting.id}`, { raw: true });
      setDeleting(null);
      await load();
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
            <div className="font-medium text-slate-900">{row.title}</div>
            <div className="line-clamp-2 max-w-xl text-xs text-slate-500">{row.content}</div>
          </div>
        ),
      },
      {
        key: 'audience',
        header: 'Audience',
        render: (row) =>
          row.target_grade === null ? (
            <span className="text-slate-500">School-wide</span>
          ) : (
            <span className="text-slate-700">
              Grade {row.target_grade}
              {row.target_section ? ` - ${row.target_section}` : ' (whole grade)'}
            </span>
          ),
      },
      { key: 'created_at', header: 'Posted', sortable: true, render: (row) => String(row.created_at).slice(0, 10) },
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
      {undelivered ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
                className="block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setUndelivered(null)}
            className="rounded-lg border border-amber-300 px-3 py-1 text-sm text-amber-900 transition hover:bg-amber-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setApplied({ section: sectionFilter });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <FormField
            label="Section"
            as="select"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="">All I can read</option>
            {sections.map((s) => (
              <option key={keyOf(s)} value={keyOf(s)}>
                Grade {s.grade_level} - {s.name}
              </option>
            ))}
          </FormField>
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
            New announcement
          </button>
        ) : (
          // No valid targets: hide compose rather than offer a form that can
          // only fail. The explanation is what stops this reading as broken.
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
                setSectionFilter('');
                setApplied({ section: '' });
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
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
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="announcement-form"
              disabled={saving || !form.title.trim() || !form.content.trim() || !form.target}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
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
