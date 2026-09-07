import { useCallback, useEffect, useMemo, useState } from 'react';
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
// THE LATER "Post to class" FROM MESSAGES PRE-FILLS THIS FORM. That dispatch
// needs no new endpoint, no new field, and no second composer — it navigates
// here with `content` populated and the section preselected. Do not build
// another compose form for it.
//
// NO ATTACHMENT FIELD. announcements.attachment_url exists but nothing uploads
// — POST accepts it as a URL string with no endpoint to produce one — so
// offering it would promise a feature that does not exist. Same call as the
// excuse-letter attachment.

const EMPTY_FORM = { title: '', content: '', category: '', target: '' };

export default function AnnouncementsPage() {
  usePageTitle('Announcements');
  const { user } = useAuth();
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

  function openCompose() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, target: sections.length === 1 ? keyOf(sections[0]) : '' });
    setFormError(null);
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

          <FormField
            label="Posting to"
            as="select"
            required
            value={form.target}
            onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
            // Names the AUDIENCE rather than a feature name. A teacher cannot
            // post school-wide or whole-grade (both admin-only, 403), so those
            // options are not offered at all.
            hint="Parents of this section will see this post. Teachers can only post to their own sections."
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
