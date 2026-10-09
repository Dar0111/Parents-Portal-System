import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonClass';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import Reveal from '../../motion/Reveal';
import { usePageTitle } from '../../layout/usePageTitle';

// One student record, admin view. Same shape as Teacher → Students detail,
// minus everything that exists because a teacher is scoped:
//   - No GET /assignments and no canEdit. PUT /api/students/:id is
//     admin-unscoped, so Edit always shows.
//   - No "not in your classes" branch. For admin, GET /:id 404s only for a
//     student that does not exist.
//   - No "Create parent account". POST /users/parents is authorize('teacher')
//     and answers an admin 403. The pending queue is Admin → Users.
//   - No status control. Deactivate/Activate lives on the list (it matches
//     Admin → Users, and a filter decides whether the row stays visible).
//
// §5b: `student` renders from load() or from the PUT response. Never from
// the draft.
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): a header card — who the
// learner is, the class and status, and the record's one action — then the
// facts in one card (two until the privacy build, 2026-10-10). ONE entrance wrapper holds every state (spinner, not
// found, error, record), so a re-read swaps what is inside it and never
// replays the entrance. The Modal sits BESIDE that wrapper, never inside it: Modal
// renders inline, and a wrapper mid-tween carries a transform
// (motion/motion.js).

// DISPLAY CASING ONLY — convention 5d. Applied at the value (a parent
// account's status is stored lowercase), not inside Field. Second copy of this
// helper after StatusBadge.jsx — teacher/StudentDetailPage.jsx's went with the
// gender field in the privacy build (2026-10-10); a third occurrence moves
// them to client/src/format/text.js.
function titleCase(value) {
  return typeof value === 'string' && value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

// `valueClass` is for a value made of digits (the LRN, a phone number):
// tabular figures. It is on the <dd> only when there IS a value — the empty
// text is words, and takes the muted colour instead.
function Field({ label, value, empty = 'Not recorded', valueClass = '' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</dt>
      <dd className={`mt-1 break-words text-sm text-fg ${value ? valueClass : ''}`}>
        {value || <span className="text-fg-muted">{empty}</span>}
      </dd>
    </div>
  );
}

// The head of one fact card: the icon chip and the card's title. The flex is
// on the chip, never on the Font Awesome element (Button.jsx says why).
function CardTitle({ icon, children }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"
      >
        <i className={`fa-solid ${icon}`} />
      </span>
      <h3 className="font-serif text-base font-bold text-fg">{children}</h3>
    </div>
  );
}

// The learner's name only. Birthday, gender, address and contact number are
// not collected since the privacy build (2026-10-10, decision 6) — the
// server refuses a value for any of them.
const EMPTY_EDIT = {
  first_name: '',
  last_name: '',
};

function draftFrom(row) {
  return {
    first_name: row.first_name || '',
    last_name: row.last_name || '',
  };
}

export default function StudentDetailPage() {
  const { id } = useParams();

  const [student, setStudent] = useState(null);
  // { id, status } or null, from GET /students/:id (2026-09-18); load() is
  // the only writer (§5b). Admin has no create button — it says which it is.
  const [parentAccount, setParentAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);


  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Keyed status. `edit` renders INSIDE the modal, above the form it
  // describes. `record` is the success that OUTLIVES the modal ("Student
  // updated."), so it belongs to the record it describes and renders above
  // the header card. See FormStatus.
  const [status, setStatus] = useState({});
  const [draft, setDraft] = useState(EMPTY_EDIT);

  usePageTitle(student ? `${student.first_name} ${student.last_name}` : 'Student');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const row = await api.get(`/students/${id}`, { unwrap: ['student', 'parent_account'] });
      setStudent(row.student);
      setParentAccount(row.parent_account);
    } catch (err) {
      if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(extractError(err));
      }
      setStudent(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit() {
    if (!student) return;
    setDraft(draftFrom(student));
    setStatus({});
    setEditOpen(true);
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditOpen(false);
    setStatus({});
    setDraft(EMPTY_EDIT);
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!student) return;
    setStatus({});
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setStatus({ edit: fail('First name and last name are required.') });
      return;
    }
    setSavingEdit(true);
    try {
      // The name only. grade_level and section are omitted (a differing
      // pair is a 400; omitting cannot trip it). lrn, status and section_id
      // are ignored by the server — not sent.
      const { student: updated, message } = await api.put(
        `/students/${student.id}`,
        {
          first_name: draft.first_name.trim(),
          last_name: draft.last_name.trim(),
        },
        { unwrap: ['student', 'message'] }
      );
      setStudent(updated);
      setStatus({ record: ok(message) });
      setEditOpen(false);
      setDraft(EMPTY_EDIT);
    } catch (err) {
      setStatus({ edit: fail(extractError(err)) });
    } finally {
      setSavingEdit(false);
    }
  }

  // A 44px-tall target with the shared keyboard outline; the arrow is
  // decoration, the words are the name.
  const backLink = (
    <Link
      to="/admin/students"
      className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-fg-muted transition hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"
    >
      <i aria-hidden="true" className="fa-solid fa-arrow-left" />
      All students
    </Link>
  );

  // ONE STATE AT A TIME, the same four as before and in the same order:
  // loading, not found, a failed request, the record.
  let body = null;
  if (loading) {
    body = <LoadingSpinner className="py-16" label="Loading student…" />;
  } else if (notFound) {
    body = (
      <>
        {backLink}
        <div className={cardClass}>
          <EmptyState
            icon="fa-user-slash"
            title="Student not found"
            message="No student record exists with this id."
          />
        </div>
      </>
    );
  } else if (error) {
    body = (
      <>
        {backLink}
        <ErrorAlert message={error} onRetry={load} />
      </>
    );
  } else if (student) {
    body = (
      <>
        {backLink}

        <FormStatus status={status.record} />

        {/* THE HEADER CARD: the learner, then the class and the status badge,
            and the record's controls on the right. Initials only — a learner
            has no photo (§25). Edit is the neutral button: nothing on this
            page is a filled action, the record is mostly read.

            `grow basis-64`, NOT `flex-1`: a zero basis never wraps, so on a
            phone the controls would stay beside the name and squeeze it to a
            few letters a line. With a 16rem basis the controls drop to their
            own line when the two do not fit, and the name keeps the width. */}
        <div className={`${cardClass} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 grow basis-64 items-center gap-4">
              <Avatar name={`${student.first_name} ${student.last_name}`} size="lg" />
              <div className="min-w-0">
                <h2 className="break-words font-serif text-xl font-bold text-fg">
                  {student.last_name}, {student.first_name}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                  <span>
                    Grade {student.grade_level} - {student.section}
                  </span>
                  <StatusBadge status={student.status} />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button icon="fa-pen" onClick={openEdit}>
                Edit
              </Button>
            </div>
          </div>
        </div>

        {/* Same fields as the teacher view. Omitted: section_id (internal FK),
            created_by (a raw user id), timestamps (bookkeeping).

            ONE CARD since the privacy build (2026-10-10, decision 6): who the
            learner is and whether a parent account is linked. The learner's
            birthday, gender, address and contact number — and the Contact
            details card — are gone: no longer collected. */}
        <div className={`${cardClass} space-y-4 p-5`}>
          <CardTitle icon="fa-id-card">Student details</CardTitle>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="LRN" value={student.lrn} valueClass="tabular-nums" />
            {/* Which it is, not a button: POST /users/parents is teacher-only.
                users.status of the linked account; "None" = no account yet. */}
            <Field
              label="Parent account"
              value={parentAccount ? titleCase(parentAccount.status) : null}
              empty="None"
            />
          </dl>
        </div>
      </>
    );
  }

  // The Modal reads `student`, so it exists only beside a loaded record —
  // exactly when it did before.
  if (loading || !student) {
    return (
      <div>
        <Reveal className="space-y-6">{body}</Reveal>
      </div>
    );
  }

  // The same <div> → <Reveal> at the same position as the return above, so
  // React keeps ONE wrapper across every state and the entrance never replays.
  return (
    <div>
      <Reveal className="space-y-6">{body}</Reveal>

      <Modal
        open={editOpen}
        onClose={closeEdit}
        closeOnBackdrop={!savingEdit}
        title="Edit student"
        size="lg"
        footer={
          <>
            <Button onClick={closeEdit} disabled={savingEdit}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="admin-student-edit-form" loading={savingEdit}>
              Save
            </Button>
          </>
        }
      >
        {/* No scroller of its own: Modal's body scrolls (and keeps the footer
            on screen), and a second one inside it clipped the fields' focus
            rings at its edges. */}
        <div>
          <FormStatus status={status.edit} className="mb-4" />

          <form id="admin-student-edit-form" onSubmit={submitEdit} className="space-y-4">
            <FormField label="LRN" value={student.lrn} disabled />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="First name"
                value={draft.first_name}
                onChange={(e) => setDraft((prev) => ({ ...prev, first_name: e.target.value }))}
                required
              />
              <FormField
                label="Last name"
                value={draft.last_name}
                onChange={(e) => setDraft((prev) => ({ ...prev, last_name: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Grade level" value={`Grade ${student.grade_level}`} disabled />
              <FormField label="Section" value={student.section} disabled />
            </div>
            {/* §5i: word for word the Teacher → Students copy. Two pages
                disagreeing about whether a class can change is worse than
                either wording. The school question behind a move is open. */}
            <p className="text-sm text-fg-muted">
              A student's class cannot be changed here. The system does not support moving a
              student between classes.
            </p>
          </form>
        </div>
      </Modal>
    </div>
  );
}
