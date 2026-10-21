import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonClass';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok } from '../../components/FormStatus';
import FormField from '../../components/FormField';
import { StudentDetailSkeleton } from '../../components/SkeletonShapes';
import useSkeleton from '../../hooks/useSkeleton';
import Modal from '../../components/Modal';
import PasswordField from '../../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../../components/PasswordChecklist';
import { passwordIsValid, passwordRuleHint } from '../../format/passwordRule';
import StatusBadge from '../../components/StatusBadge';
import Reveal from '../../motion/Reveal';
import { usePageTitle } from '../../layout/usePageTitle';
import { useAuth } from '../../auth/AuthContext';

// One student record. TWO GATES, TWO SOURCES (pre-Stage-5 #4, 2026-09-25):
//
//   Edit           — PUT /students/:id is assigned OR adviser, so Edit is
//                    shown when this student's class (grade_level + section)
//                    appears in GET /assignments OR the student's section_id
//                    is one this teacher advises (GET /sections' adviser_id).
//   Create parent  — POST /users/parents is the ADVISER of the learner's
//                    section only, so the button is shown only when the
//                    student's section_id is advised by the signed-in
//                    teacher; otherwise muted copy, not a button that 403s.
//
// Neither probes its endpoint, and neither reuses useTeacherTargets
// (assigned-OR-adviser is the READ scope). "Already has a parent" comes
// from GET /students/:id's parent_account, never from probing the 409.
//
// A separate route rather than a modal on the list: a student record is a
// destination — deep-linkable, back-buttonable, and reachable later from the
// attendance and grades pages. It therefore fetches GET /:id itself instead of
// reusing a row handed over by the list, so a direct URL load works with no
// list in memory.
//
// Two Modals, not one with a mode. Create parent is two-phase and
// irreversible. Edit is one-phase and reversible. Sharing open /
// confirming / formError is how a page grows a mode enum nobody can read.
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): a header card — who the
// learner is, the class and status, and the record's actions — then the
// facts in one card (two until the privacy build, 2026-10-10). ONE entrance wrapper holds every state (spinner,
// refusal, error, record), so a re-read swaps what is inside it and never
// replays the entrance. Both Modals sit BESIDE that wrapper, never inside it: Modal
// renders inline, and a wrapper mid-tween carries a transform
// (motion/motion.js).

// (This page's display-casing helper went with the gender field in the privacy
// build, 2026-10-10: nothing here shows a lowercase-stored value any more.)

// `valueClass` is for a value made of digits (the LRN): tabular figures. It
// is not applied to "Not recorded".
function Field({ label, value, valueClass = '' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-fg">
        {value ? (
          <span className={valueClass}>{value}</span>
        ) : (
          <span className="text-fg-muted">Not recorded</span>
        )}
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

function assignmentMatchesStudent(row, student) {
  return (
    Number(row.grade_level) === Number(student.grade_level) && String(row.section) === String(student.section)
  );
}

// The learner's name only. Birthday, gender, address and contact number are
// not collected since the privacy build (2026-10-10, decision 6) — the
// server refuses a value for any of them.
function draftFrom(row) {
  return {
    first_name: row.first_name || '',
    last_name: row.last_name || '',
  };
}

// No email and no contact number (feat/account-create, 2026-10-21): the
// parent confirms their own Gmail or mobile number at the first sign-in, and
// POST /users/parents refuses either key with a value.
const EMPTY_PARENT = {
  name: '',
  password: '',
  confirmPassword: '',
};

const EMPTY_EDIT = {
  first_name: '',
  last_name: '',
};

export default function StudentDetailPage() {
  const { id } = useParams();

  const [student, setStudent] = useState(null);
  // null = no parent account yet; { id, status } = one exists (one per
  // student is LOCKED). load() is the only writer (§5b).
  const [parentAccount, setParentAccount] = useState(null);
  // Field-level refusals in the create-parent modal — the server's 400 with a
  // `field` key (the parent's password) — render under their input with a red
  // border (§7c). Cleared when a modal opens or closes and per field as it
  // changes.
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notInScope, setNotInScope] = useState(false);
  const [assignments, setAssignments] = useState([]);
  // Sections this teacher advises (GET /sections, adviser_id === me): the
  // Create-parent gate and the adviser leg of the Edit gate.
  const [advised, setAdvised] = useState([]);
  const { user } = useAuth();

  // Keyed status, one key. Both modals report their own failures inside
  // themselves (formError on create-parent, editError on edit) — already the
  // right place. What survives a modal closing is the success, and it
  // describes the record, so it renders above the card.
  //
  // `saveError` was dead state here too: only ever set to null. Removed.
  const [status, setStatus] = useState({});

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [parent, setParent] = useState(EMPTY_PARENT);
  const [revealed, setRevealed] = useState({ password: false, confirm: false });

  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [draft, setDraft] = useState(EMPTY_EDIT);

  // Falls back to a neutral title until the record loads, so the header never
  // flashes an id or an empty string.
  usePageTitle(student ? `${student.first_name} ${student.last_name}` : 'Student');
  // The record's skeleton (feat/skeleton-tier2-web): a first load or a new id.
  const phase = useSkeleton(loading);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotInScope(false);

    try {
      // parent_account (2026-09-18): { id, status } or null — so the page can
      // say whether a parent account exists instead of offering a button
      // that ends in the server's 409. The array form keeps the missing-key
      // guard on both keys.
      const row = await api.get(`/students/${id}`, { unwrap: ['student', 'parent_account'] });
      setStudent(row.student);
      setParentAccount(row.parent_account);
    } catch (err) {
      // 404 here is deliberate API design, not a missing record: routes/students.js
      // collapses "does not exist" and "outside your scope" into the same
      // response so a teacher cannot enumerate student ids by probing. The copy
      // must not undo that — it says neither "access denied" (which would
      // confirm the record exists) nor "not found" (which would deny it).
      if (err?.response?.status === 404) {
        setNotInScope(true);
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

  // Same fetch shape as StudentsPage Enroll: own effect, unwrap assignments,
  // no teacher_id, catch → []. A failed call looks like adviser-only.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/assignments', { unwrap: 'assignments' })
      .then((rows) => {
        if (!cancelled) setAssignments(rows);
      })
      .catch(() => {
        if (!cancelled) setAssignments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    api
      .get('/sections', { unwrap: 'sections' })
      .then((rows) => {
        if (!cancelled) setAdvised(rows.filter((sec) => Number(sec.adviser_id) === Number(user.id)));
      })
      .catch(() => {
        if (!cancelled) setAdvised([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const advisesThisSection = useMemo(
    () => (student ? advised.some((sec) => Number(sec.id) === Number(student.section_id)) : false),
    [advised, student]
  );

  const canEdit = useMemo(
    () => (student ? assignments.some((row) => assignmentMatchesStudent(row, student)) || advisesThisSection : false),
    [assignments, student, advisesThisSection]
  );
  const canCreateParent = advisesThisSection;

  function openCreate() {
    setParent(EMPTY_PARENT);
    setConfirming(false);
    setFormError(null);
    setFieldErrors({});
    setRevealed({ password: false, confirm: false });
    setStatus({});
    setOpen(true);
  }

  function closeCreate() {
    if (saving) return;
    setOpen(false);
    setConfirming(false);
    setFormError(null);
    setFieldErrors({});
    setParent(EMPTY_PARENT);
    setRevealed({ password: false, confirm: false });
  }

  function requestCreate(event) {
    event.preventDefault();
    setFormError(null);
    if (!parent.name.trim() || !parent.password) {
      setFormError('Guardian name and password are required.');
      return;
    }
    // One rule, one module (format/passwordRule.js); the server enforces it
    // on POST /users/parents and answers 400 with field "password".
    if (!passwordIsValid(parent.password)) {
      setFormError(`Password: ${passwordRuleHint()}`);
      return;
    }
    if (parent.password !== parent.confirmPassword) {
      setFormError('New password and confirmation do not match.');
      return;
    }
    setConfirming(true);
  }

  async function submitCreate() {
    if (!student?.lrn) return;
    setSaving(true);
    setFormError(null);
    setStatus({});
    try {
      const body = {
        lrn: student.lrn,
        password: parent.password,
        name: parent.name.trim(),
      };

      const { message } = await api.post('/users/parents', body, { unwrap: ['user', 'message'] });
      setStatus({ record: ok(message) });
      setOpen(false);
      setConfirming(false);
      setParent(EMPTY_PARENT);
      // Re-read so parent_account reflects the new row (§5b: load() writes it).
      await load();
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field) setFieldErrors({ [field]: extractError(err) });
      else setFormError(extractError(err));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  function openEdit() {
    if (!student) return;
    setDraft(draftFrom(student));
    setEditError(null);
    setFieldErrors({});
    setStatus({});
    setEditOpen(true);
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditOpen(false);
    setEditError(null);
    setFieldErrors({});
    setDraft(EMPTY_EDIT);
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!student) return;
    setEditError(null);
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setEditError('First name and last name are required.');
      return;
    }
    setSavingEdit(true);
    setStatus({});
    try {
      // Omit grade_level, section, lrn, status. A matching class pair works
      // today and is one more way to trip the 400 later. Omitting cannot.
      const { student: updated, message } = await api.put(
        `/students/${student.id}`,
        {
          first_name: draft.first_name.trim(),
          last_name: draft.last_name.trim(),
        },
        { unwrap: ['student', 'message'] }
      );
      // §5b: the card reads `student`. Writers are load() and this success
      // path. Never copy draft onto the record.
      setStudent(updated);
      setStatus({ record: ok(message) });
      setEditOpen(false);
      setDraft(EMPTY_EDIT);
    } catch (err) {
      setEditError(extractError(err));
    } finally {
      setSavingEdit(false);
    }
  }

  // A 44px-tall target with the shared keyboard outline; the arrow is
  // decoration, the words are the name.
  const backLink = (
    <Link
      to="/teacher/students"
      className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-fg-muted transition hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-accent"
    >
      <i aria-hidden="true" className="fa-solid fa-arrow-left" />
      All students
    </Link>
  );

  // The record's notes: what this teacher may NOT do here and why, and
  // whether a parent account exists. Any of the three may be absent; the
  // strip under the header is drawn only when at least one is present.
  const showEditNote = !canEdit;
  const showParentNote = !parentAccount && !canCreateParent;
  const hasNotes = Boolean(parentAccount) || showEditNote || showParentNote;

  // ONE STATE AT A TIME, the same four as before and in the same order:
  // loading, the anti-enumeration refusal, a failed request, the record.
  let body = null;
  if (loading) {
    // The way back is on screen while it loads too (feat/skeleton-tier2-web):
    // the same link every other state leads with, above the record's shapes.
    body = (
      <>
        {backLink}
        <StudentDetailSkeleton phase={phase} fields={1} />
      </>
    );
  } else if (notInScope) {
    body = (
      <>
        {backLink}
        <div className={cardClass}>
          <EmptyState
            icon="fa-user-slash"
            title="This student is not in your classes"
            message="You can only open students in the sections you teach or advise."
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
            and the record's actions on the right. Initials only — a learner
            has no photo (§25). */}
        <div className={`${cardClass} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* `grow basis-64`, NOT `flex-1`. A zero basis never asks the row
                to wrap: beside three actions the circle and the name were
                left a few dozen pixels on a tablet-width window and ran
                under the buttons. With a real basis the actions drop to
                their own line whenever the learner cannot keep this much. */}
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
            <div className="flex flex-wrap items-center gap-2 empty:hidden">
              {canEdit ? (
                <Button icon="fa-pen" onClick={openEdit}>
                  Edit
                </Button>
              ) : null}
              {!parentAccount && canCreateParent ? (
                <Button variant="primary" icon="fa-user-plus" onClick={openCreate}>
                  Create parent account
                </Button>
              ) : null}
            </div>
          </div>

          {hasNotes ? (
            <div className="mt-5 space-y-2 border-t border-edge-soft pt-4">
              {parentAccount ? (
                // One account per student (LOCKED). The server refuses a second
                // with a 409; the page now knows from GET /students/:id and says
                // so instead of offering a dead end. The status is the account's
                // own (users.status): pending needs an admin's approval.
                <p className="flex flex-wrap items-center gap-2 text-sm text-fg-body">
                  Parent account: <StatusBadge status={parentAccount.status} />
                </p>
              ) : null}
              {showEditNote ? (
                <p className="text-sm text-fg-muted">
                  Editing a student is limited to classes you teach or advise.
                </p>
              ) : null}
              {showParentNote ? (
                <p className="text-sm text-fg-muted">
                  Only the adviser of this section can create the parent account.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Shown: what a teacher needs to identify a learner and contact their
            guardian about an absence — the module's actual purpose.
            Deliberately omitted: section_id (an internal FK), created_by (a raw
            user id, and provenance rather than student information), and
            created_at/updated_at (record bookkeeping, not the student).

            ONE CARD since the privacy build (2026-10-10, decision 6): the
            learner's birthday, gender, address and contact number — and the
            Contact details card — are gone: no longer collected. The
            guardian's own contact details live on the parent account. */}
        <div className={`${cardClass} space-y-4 p-5`}>
          <CardTitle icon="fa-id-card">Student details</CardTitle>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="LRN" value={student.lrn} valueClass="tabular-nums" />
            {/* Status is NOT repeated here — the badge in the header above
                already carries it, is scannable, and matches how status reads on
                the list. Repeating it in the definition list read as duplication
                rather than as two facts. */}
          </dl>
        </div>
      </>
    );
  }

  // The Modals read `student`, so they exist only beside a loaded record —
  // exactly when they did before.
  if (loading || !student) {
    return (
      <div>
        <Reveal className="space-y-6">{body}</Reveal>
      </div>
    );
  }

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
            <Button variant="primary" type="submit" form="detail-edit-form" loading={savingEdit}>
              Save
            </Button>
          </>
        }
      >
        {/* No scroller of its own: Modal's body scrolls (and keeps the footer
            on screen), and a second one inside it clipped the fields' focus
            rings at its edges. */}
        <div>
          {editError ? <ErrorAlert message={editError} className="mb-4" /> : null}

          <form id="detail-edit-form" onSubmit={submitEdit} className="space-y-4">
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
            {/* §5i: the fact plus the reason. Do not name a transfer route,
                imply one is coming, or tell them to ask someone. The school
                question behind a move is unanswered. */}
            <p className="text-sm text-fg-muted">
              A student's class cannot be changed here. The system does not support moving a
              student between classes.
            </p>
          </form>
        </div>
      </Modal>

      <Modal
        open={open}
        onClose={closeCreate}
        closeOnBackdrop={!saving}
        title={confirming ? 'Create this parent account?' : 'Create parent account'}
        size="md"
        footer={
          confirming ? (
            <>
              <Button
                onClick={() => {
                  if (saving) return;
                  setConfirming(false);
                }}
                disabled={saving}
              >
                Go back
              </Button>
              <Button variant="primary" onClick={submitCreate} loading={saving}>
                Yes, create parent account
              </Button>
            </>
          ) : (
            <>
              <Button onClick={closeCreate} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                form="detail-parent-form"
                disabled={saving || !passwordFormReady(parent.password, parent.confirmPassword)}
              >
                Continue
              </Button>
            </>
          )
        }
      >
        {formError ? <ErrorAlert message={formError} className="mb-4" /> : null}

        {confirming ? (
          // An amber notice, not body copy: the write cannot be taken back
          // (§5e). The sentence is unchanged; the icon is decoration and
          // takes the notice's own colour.
          <div className="flex items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3 text-sm text-warning-strong">
            <i aria-hidden="true" className="fa-solid fa-triangle-exclamation mt-0.5" />
            <p className="min-w-0 flex-1">
              Create a pending parent account for {parent.name.trim()} (login ID {student.lrn})?
              An admin must approve it before they can log in. You cannot un-create it.
            </p>
          </div>
        ) : (
          <form id="detail-parent-form" onSubmit={requestCreate} className="space-y-4">
            <FormField label="Login ID (child's LRN)" value={student.lrn} disabled />
            <FormField
              label="Guardian name"
              value={parent.name}
              onChange={(e) => setParent((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <PasswordField
              label="Password"
              value={parent.password}
              onChange={(e) => setParent((prev) => ({ ...prev, password: e.target.value }))}
              autoComplete="new-password"
              revealed={revealed.password}
              onToggleReveal={() => setRevealed((prev) => ({ ...prev, password: !prev.password }))}
              error={fieldErrors.password}
              below={<PasswordChecklist value={parent.password} />}
            />
            <PasswordField
              label="Confirm password"
              value={parent.confirmPassword}
              onChange={(e) => setParent((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              autoComplete="new-password"
              revealed={revealed.confirm}
              onToggleReveal={() => setRevealed((prev) => ({ ...prev, confirm: !prev.confirm }))}
              error={confirmError(parent.password, parent.confirmPassword)}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
