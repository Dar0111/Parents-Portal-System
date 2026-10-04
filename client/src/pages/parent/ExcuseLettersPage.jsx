import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { fetchAll } from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import DataTable from '../../components/DataTable';
import DraftNotice from '../../components/DraftNotice';
import ErrorAlert from '../../components/ErrorAlert';
import FormField, { filterSelectClass } from '../../components/FormField';
import FormStatus, { ok } from '../../components/FormStatus';
import Modal from '../../components/Modal';
import SectionHeader from '../../components/SectionHeader';
import StatusBadge from '../../components/StatusBadge';
import { cardClass, linkClass } from '../../components/buttonClass';
import Reveal from '../../motion/Reveal';
import { longDate, shortDate, todayLocalDateString } from '../../format/date';
import parentLetterCard from './excuseLetters/card';
import { useAuth } from '../../auth/AuthContext';
import { editContext, itemChangedSince } from '../../drafts/draftCore';
import { findOpenDrafts, loadDraft } from '../../drafts/sessionDrafts';
import { useDraftAutosave } from '../../drafts/useDraft';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent excuse letters — submit, list, edit while Pending.
//
// NOT a mirror of Teacher → Excuse Letters. That page is a review queue:
// PATCH /:id/review is irreversible, adviser-only, and there is no parent
// submission on it. This page is the other side of the same table.
//
// WRITES: POST / and PUT /:id while status is Pending. parent_id and
// student_id come from the session, never the form. Skip POST when
// user.student_id is null — the column is NOT NULL and an unlinked POST
// is a 500, not a 400 (flagged, not fixed).
//
// NO DELETE / withdraw. The handler has none. Edit while Pending is the
// correction path, which is why submit has no confirmation (§5e).
//
// NO ATTACHMENT. attachment_url exists; POST/PUT ignore it; nothing uploads.
//
// NO GET /:id. The list (GET /mine) is SELECT * and already carries every
// column a detail view would show, including teacher_remarks. GET /:id is
// the same thinner-than-list oddity the Teacher page recorded.
//
// GET /mine accepts no query filters. Status is filtered client-side.
// Default is All — a parent cares about history, not a review queue.
// Dates are not offered: the endpoint would ignore them.
//
// §5b: the table renders last GET /mine only. Success refetches; the form
// never writes the list. §5c: no LRN, no login_id, route has no :id.
//
// THE FORM KEEPS A DRAFT (feat/form-drafts, 2026-10-04; FRONTEND §28). What
// is typed is kept in this tab (sessionStorage) under this account's numeric
// id — `new`, or `edit-<letter id>` — so Close and a reload keep it, and a
// reload reopens the form it was in. It is removed when the server confirms
// the submit, on a confirmed Discard draft, and on logout.

// The label of one field in the reading view: the eyebrow style.
const FIELD_LABEL = 'text-xs font-semibold uppercase tracking-wider text-fg-muted';
// A parent's own words (and the adviser's reply) are reading text: one step
// larger than the body size, in a column that stays under ~75 characters.
const FIELD_PROSE = 'mt-1 max-w-prose whitespace-pre-wrap break-words text-base leading-relaxed text-fg-body';

const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Declined'];
const EMPTY_FORM = { absence_date: '', reason: '', details: '' };

// The form's fields of a letter — what an edit opens with, and the draft's base.
function letterFields(letter) {
  return {
    absence_date: letter.absence_date || '',
    reason: letter.reason || '',
    details: letter.details || '',
  };
}

export default function ParentExcuseLettersPage() {
  usePageTitle('Excuse Letters');
  const { user } = useAuth();
  const studentId = user?.student_id ?? null;
  const today = todayLocalDateString();

  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The select IS the applied value — one control, no draft/Apply pair.
  const [status, setStatus] = useState('All');

  const [reading, setReading] = useState(null);

  // Compose draft. Null editing = new letter; a letter row = PUT.
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  // What the form opened with — the draft's base: EMPTY_FORM for a new
  // letter, the letter's fields when the edit began.
  const [formBase, setFormBase] = useState(EMPTY_FORM);
  // 'restored' / 'changed' while a kept draft is on screen, else null.
  const [draftNotice, setDraftNotice] = useState(null);
  const userId = user?.id ?? null;
  const draft = useDraftAutosave({
    userId,
    form: 'excuse',
    context: editing ? editContext(editing.id) : 'new',
    values: form,
    base: formBase,
    active: composing,
  });
  // A reload reopens the draft that was open — once, on the first load.
  const restoreTried = useRef(false);

  // The outcome of the last write, rendered above the list it changed (§7c —
  // it outlives the modal that caused it). `writeStatus`, not `status`: this
  // page's `status` is the filter. Cleared whenever a modal opens, so a stale
  // "Letter submitted." never sits beside a fresh edit (fix/smoke-gate: the
  // page closed its modal and reloaded, and the new row was the only sign the
  // write had worked).
  const [writeStatus, setWriteStatus] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // C2 (2026-09-19): this page filters by status CLIENT-SIDE (`visible`
      // below) and GET /mine has no status filter, so it needs the parent's
      // whole set — one child's letters, bounded — and fetchAll pages through
      // it. The table keeps its client-side sort; no pager here on purpose:
      // a pager over a locally filtered page would show "3 of 40" for a
      // filter the server never saw (C4).
      const rows = await fetchAll('/excuse-letters/mine', { unwrap: 'excuse_letters' });
      setLetters(rows);
      // THE FORM THAT WAS OPEN COMES BACK after a reload (FRONTEND §28): a
      // new letter's draft, or an edit whose letter is here and still
      // Pending. Here, after the list arrives, not in an effect of its own.
      if (!restoreTried.current) {
        restoreTried.current = true;
        const [open] = findOpenDrafts({ userId, form: 'excuse' });
        if (open && open.context === 'new') {
          setEditing(null);
          setForm(open.record.values);
          setFormBase(open.record.base || EMPTY_FORM);
          setDraftNotice('restored');
          setComposing(true);
        } else if (open) {
          const row = rows.find((l) => editContext(l.id) === open.context && l.status === 'Pending');
          if (row) {
            setEditing(row);
            setForm(open.record.values);
            setFormBase(open.record.base || letterFields(row));
            setDraftNotice(itemChangedSince('excuse', open.record, letterFields(row)) ? 'changed' : 'restored');
            setComposing(true);
          }
        }
      }
    } catch (err) {
      setError(extractError(err));
      setLetters([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => (status === 'All' ? letters : letters.filter((row) => row.status === status)),
    [letters, status]
  );

  const emptyState = (() => {
    if (studentId == null && letters.length === 0) {
      return {
        icon: 'fa-link-slash',
        title: "Your account isn't linked to a student record yet",
        message:
          'Ask the school office to link your account so you can submit an excuse letter for an absence.',
        showReset: false,
      };
    }
    if (status !== 'All') {
      return {
        icon: 'fa-filter',
        title: 'No letters match this filter',
        message: 'Try a different status, or show all letters.',
        showReset: true,
      };
    }
    return {
      icon: 'fa-envelope-open-text',
      title: 'No excuse letters yet',
      // §5f: the header's Submit letter is always visible when a letter can
      // be submitted, so the empty state names it instead of repeating it.
      // "…it does not change the attendance record", not "…stays Absent"
      // (fix/smoke-gate): the day may be Present or not recorded at all, and
      // a letter does not make it an absence. The rule is that review never
      // touches attendance; that is what the sentence now says (§5i).
      message: 'Use Submit letter when your child is absent. The adviser reviews it; it does not change the attendance record.',
      showReset: false,
    };
  })();

  const canReset = status !== 'All';
  const canSubmit = studentId != null;

  function openCompose() {
    setWriteStatus({});
    setEditing(null);
    const kept = loadDraft({ userId, form: 'excuse', context: 'new' });
    setForm(kept ? kept.values : EMPTY_FORM);
    setFormBase(kept?.base || EMPTY_FORM);
    setDraftNotice(kept ? 'restored' : null);
    setFormError(null);
    setComposing(true);
  }

  function openEdit(letter) {
    setWriteStatus({});
    setEditing(letter);
    const current = letterFields(letter);
    const kept = loadDraft({ userId, form: 'excuse', context: editContext(letter.id) });
    setForm(kept ? kept.values : current);
    setFormBase(kept?.base || current);
    setDraftNotice(kept ? (itemChangedSince('excuse', kept, current) ? 'changed' : 'restored') : null);
    setFormError(null);
    setReading(null);
    setComposing(true);
  }

  // Close keeps the draft (it comes back on the next Submit letter / Edit);
  // only Discard draft and a confirmed submit remove it.
  function closeCompose() {
    if (saving) return;
    draft.close();
    setComposing(false);
    setEditing(null);
    setFormError(null);
    setDraftNotice(null);
  }

  // After the inline "Discard this draft?" was confirmed (DraftNotice).
  function discardDraft() {
    draft.discard();
    const opening = editing ? letterFields(editing) : EMPTY_FORM;
    setForm(opening);
    setFormBase(opening);
    setDraftNotice(null);
  }

  async function submitForm(event) {
    event.preventDefault();
    if (!canSubmit && !editing) return;

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        absence_date: form.absence_date,
        reason: form.reason,
        details: form.details.trim() ? form.details : null,
      };
      if (editing) {
        await api.put(`/excuse-letters/${editing.id}`, body, { unwrap: 'excuse_letter' });
      } else {
        await api.post('/excuse-letters', body, { unwrap: 'excuse_letter' });
      }
      const message = editing ? 'Letter updated.' : 'Letter submitted.';
      // The server confirmed: the draft goes, and is not written again as
      // the modal closes.
      draft.submitted(form);
      setDraftNotice(null);
      setComposing(false);
      setEditing(null);
      await load();
      setWriteStatus({ letters: ok(message) });
    } catch (err) {
      setFormError(extractError(err));
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    // A DATE column (§5a-iv): the literal "2026-09-25" arrives as a string
    // and `shortDate` rewrites it as one. DataTable sorts the row value, so
    // the column still sorts chronologically.
    {
      key: 'absence_date',
      header: 'Absence date',
      sortable: true,
      nowrap: true,
      render: (row) => <span className="tabular-nums">{shortDate(row.absence_date)}</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      sortable: true,
      render: (row) => (
        <button
          type="button"
          onClick={() => setReading(row)}
          className={`${linkClass} line-clamp-2 max-w-md text-left`}
        >
          {row.reason}
        </button>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      nowrap: true,
      render: (row) =>
        row.status === 'Pending' ? (
          <Button size="sm" onClick={() => openEdit(row)}>
            Edit
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <Reveal className="space-y-6">
        <section className="space-y-3">
          {/* Submit letter is the page's one primary action, and it is in the
              header at every state — which is why the empty state below names
              it instead of repeating it (§5f). */}
          <SectionHeader
            title="Submitted letters"
            actions={
              canSubmit ? (
                <Button variant="primary" icon="fa-plus" onClick={openCompose}>
                  Submit letter
                </Button>
              ) : null
            }
          />

          {!canSubmit ? (
            <p className="flex items-start gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3 text-sm text-info-strong">
              <span aria-hidden="true" className="mt-0.5 flex items-center justify-center">
                <i className="fa-solid fa-circle-info" />
              </span>
              <span className="min-w-0">
                Submitting is unavailable until the school office links this account to a student.
              </span>
            </p>
          ) : null}

          {/* The filter bar. The select IS the applied value, so there is no
              Apply; Reset appears only when it would change the list. */}
          <div className={`${cardClass} flex flex-wrap items-end gap-3 p-4`}>
            <FormField
              label="Status"
              as="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={filterSelectClass}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === 'All' ? 'All statuses' : s}
                </option>
              ))}
            </FormField>
            {canReset ? <Button onClick={() => setStatus('All')}>Reset</Button> : null}
          </div>

          <FormStatus status={writeStatus.letters} />

          <DataTable
            // RECORD CARD (DV1b-a). The absence DATE is the title here, not a
            // learner name: a parent has exactly one child, so the name would
            // be the same on every card and carry no information. **No LRN
            // and no login_id** (§5c) — there is none in the payload to leak.
            //
            // The card itself is `excuseLetters/card.jsx` — a module, so the
            // proof can render it through the real `Card` instead of regexing
            // this file (§17b, §17d). Its header carries the reasoning: every
            // card opens the reading view whatever the status, and Edit is
            // NOT on the card.
            renderCard={(row) => parentLetterCard(row, { onRead: setReading })}
            columns={columns}
            rows={visible}
            keyField="id"
            loading={loading}
            error={error}
            onRetry={load}
            emptyIcon={emptyState.icon}
            emptyTitle={emptyState.title}
            emptyMessage={emptyState.message}
            emptyAction={
              emptyState.showReset ? (
                <Button size="sm" onClick={() => setStatus('All')}>
                  Show all letters
                </Button>
              ) : null
            }
          />
        </section>
      </Reveal>

      {/* BOTH DIALOGS ARE OUTSIDE the entrance wrapper: Modal renders inline
          behind a fixed backdrop, so it must never sit under an element that
          can carry a transform (motion/motion.js). Each body is Modal's own
          scroller. */}
      <Modal
        open={Boolean(reading)}
        onClose={() => setReading(null)}
        title="Excuse letter"
        size="lg"
        // Edit, while the letter is still Pending, is the dialog's one action
        // and sits in its footer — in reach however long the letter is.
        footer={
          reading?.status === 'Pending' ? (
            <Button icon="fa-pen" onClick={() => openEdit(reading)}>
              Edit
            </Button>
          ) : null
        }
      >
        {reading ? (
          <div className="space-y-5">
            {/* The letter's header: the day it is about, in the title face,
                with where it stands beside it. */}
            <dl className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-edge-soft pb-4">
              <div className="min-w-0">
                <dt className={FIELD_LABEL}>Absence date</dt>
                <dd className="mt-0.5 font-serif text-xl font-bold text-fg">{longDate(reading.absence_date)}</dd>
              </div>
              <div>
                <dt className={FIELD_LABEL}>Status</dt>
                <dd className="mt-1.5">
                  <StatusBadge status={reading.status} />
                </dd>
              </div>
            </dl>
            <dl className="space-y-4">
              <div>
                <dt className={FIELD_LABEL}>Reason</dt>
                <dd className="mt-1 max-w-prose whitespace-pre-wrap break-words text-sm font-semibold text-fg">
                  {reading.reason}
                </dd>
              </div>
              {reading.details ? (
                <div>
                  <dt className={FIELD_LABEL}>Details</dt>
                  <dd className={FIELD_PROSE}>{reading.details}</dd>
                </div>
              ) : null}
              {reading.teacher_remarks ? (
                // The adviser's reply, set apart from the parent's own words:
                // after a decline this is the one thing the parent opened the
                // letter to read.
                <div className="rounded-xl border border-edge-soft bg-surface-subtle px-4 py-3">
                  <dt className={FIELD_LABEL}>Adviser remarks</dt>
                  <dd className={FIELD_PROSE}>{reading.teacher_remarks}</dd>
                </div>
              ) : null}
            </dl>
            {reading.status === 'Pending' ? null : (
              <p className="text-sm text-fg-muted">
                This letter has been reviewed and can no longer be edited.
              </p>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={composing}
        onClose={closeCompose}
        title={editing ? 'Edit excuse letter' : 'Submit excuse letter'}
        size="lg"
        closeOnBackdrop={!saving}
        footer={
          <>
            <Button onClick={closeCompose} disabled={saving}>
              Close
            </Button>
            <Button variant="primary" type="submit" form="parent-excuse-form" loading={saving}>
              {editing ? 'Save changes' : 'Submit'}
            </Button>
          </>
        }
      >
        <form id="parent-excuse-form" onSubmit={submitForm} className="space-y-4">
          {draftNotice ? <DraftNotice changed={draftNotice === 'changed'} onDiscard={discardDraft} /> : null}
          {formError ? <ErrorAlert message={formError} /> : null}
          <p className="flex items-start gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3 text-sm text-info-strong">
            <span aria-hidden="true" className="mt-0.5 flex items-center justify-center">
              <i className="fa-solid fa-circle-info" />
            </span>
            <span className="min-w-0">
              The adviser records the reason. It does not change the attendance record for that day.
            </span>
          </p>
          <FormField
            label="Absence date"
            type="date"
            required
            max={today}
            value={form.absence_date}
            onChange={(e) => setForm((f) => ({ ...f, absence_date: e.target.value }))}
          />
          <FormField
            label="Reason"
            required
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Short reason for the absence"
          />
          <FormField
            label="Details"
            as="textarea"
            rows={3}
            value={form.details}
            onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
            placeholder="Optional — anything the adviser should know"
          />
        </form>
      </Modal>
    </>
  );
}
