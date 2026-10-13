import { useMemo, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import FormField from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import Modal from '../../components/Modal';
import { todayLocalDateString } from '../../format/date';
import {
  LOCK_TERM_LABEL,
  LOCKS_UNWRAP,
  applyLabel,
  introFor,
  locksBody,
  previewLines,
  resultLine,
  scopeHeading,
  skippedRow,
} from '../../format/gradeLocks';
import { currentTerm } from '../../format/schoolCalendar';

// LOCK OR UNLOCK A WHOLE TERM (fix/grade-locks, 2026-10-13; the owner's
// Finding 1) — Admin → Grades' second write, beside the one-grade lock modal.
// POST /api/grades/locks, admin only.
//
// PREVIEW, THEN ONE WRITE. "Preview" is a dry run; the primary button appears
// only once a preview for the choices ON SCREEN says there is something to do,
// and names the count ("Lock 8 grade records"). Changing any control clears
// the preview, so the button can never act on a scope the admin is no longer
// looking at; the controls are locked while a request is out. The step is
// reversible (unlock), so the preview IS the deliberate step — no further
// confirmation (§5e).
//
// The words come from format/gradeLocks.js, shared with the phone. A learner
// skipped by a lock is listed by name and class only — never an LRN (§5c).
// The list is plain, not a DataTable: a read-only summary inside a dialog,
// nothing to sort or open (the owner's D4); the Modal body scrolls.
//
// ONE result slot (§7c): a failed preview, a failed write and the result
// line share it, at the top of the body, so two can never be on screen. The
// page shows the result line too (`onApplied`), under its header, after the
// dialog closes.

const TERMS = ['1', '2', '3'];
const GRADE_LEVELS = ['1', '2', '3', '4', '5', '6'];

function defaultChoices() {
  return { action: 'lock', term: String(currentTerm(todayLocalDateString())), grade: '', section: '' };
}

// The preview block, exported so the SSR proof can render every state from
// the server's own response shape.
export function GradeLocksPreview({ result }) {
  const lines = previewLines(result);
  return (
    <div className="space-y-2 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
      <p className="text-sm font-semibold text-fg">{scopeHeading(result.scope)}</p>
      {lines.map((line) => (
        <p key={line.text} className={`text-sm ${line.kind === 'nothing' ? 'text-fg-muted' : 'text-fg-body'}`}>
          {line.text}
        </p>
      ))}
      {result.lock && result.skipped.length > 0 ? (
        <ul className="space-y-1 text-sm text-fg-body">
          {result.skipped.map((row) => (
            <li key={row.student_id}>{skippedRow(row)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function GradeLocksModal({ open, onClose, sections = [], onApplied }) {
  const [choices, setChoices] = useState(defaultChoices);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null); // 'preview' | 'apply' | null
  const [status, setStatus] = useState(null);

  // A fresh dialog every time it opens — today's term, the whole school — by
  // resetting as it CLOSES (no effect: the dialog stays mounted while shut).
  // Never while a write is out.
  function close() {
    if (busy === 'apply') return;
    setChoices(defaultChoices());
    setPreview(null);
    setStatus(null);
    onClose();
  }

  const sectionOptions = useMemo(
    () =>
      choices.grade
        ? sections
            .filter((s) => Number(s.grade_level) === Number(choices.grade))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [sections, choices.grade]
  );

  function choose(patch) {
    setChoices((prev) => ({ ...prev, ...patch }));
    setPreview(null);
    setStatus(null);
  }

  async function runPreview() {
    setBusy('preview');
    setStatus(null);
    try {
      const result = await api.post('/grades/locks', locksBody(choices, true), { unwrap: LOCKS_UNWRAP });
      setPreview(result);
    } catch (err) {
      setPreview(null);
      setStatus(fail(extractError(err)));
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!preview || preview.records_changed === 0) return;
    setBusy('apply');
    setStatus(null);
    try {
      const result = await api.post('/grades/locks', locksBody(choices, false), { unwrap: LOCKS_UNWRAP });
      const line = resultLine(result);
      setPreview(null);
      setStatus(ok(line));
      if (onApplied) onApplied(line);
    } catch (err) {
      setStatus(fail(extractError(err)));
    } finally {
      setBusy(null);
    }
  }

  const lock = choices.action === 'lock';
  const canApply = Boolean(preview) && preview.records_changed > 0;

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnBackdrop={busy !== 'apply'}
      title={LOCK_TERM_LABEL}
      size="md"
      footer={
        <>
          <Button onClick={close} disabled={busy === 'apply'}>
            Close
          </Button>
          <Button onClick={runPreview} loading={busy === 'preview'} disabled={busy === 'apply'}>
            Preview
          </Button>
          {canApply ? (
            <Button
              variant="primary"
              icon={lock ? 'fa-lock' : 'fa-lock-open'}
              onClick={apply}
              loading={busy === 'apply'}
              disabled={busy === 'preview'}
            >
              {applyLabel(lock, preview.records_changed)}
            </Button>
          ) : null}
        </>
      }
    >
      <FormStatus status={status} className="mb-4" />
      <div className="space-y-4">
        <p className="text-sm text-fg-body">{introFor(lock)}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Action"
            as="select"
            value={choices.action}
            disabled={Boolean(busy)}
            onChange={(e) => choose({ action: e.target.value })}
          >
            <option value="lock">Lock grades</option>
            <option value="unlock">Unlock grades</option>
          </FormField>
          <FormField
            label="Term"
            as="select"
            value={choices.term}
            disabled={Boolean(busy)}
            onChange={(e) => choose({ term: e.target.value })}
          >
            {TERMS.map((t) => (
              <option key={t} value={t}>
                Term {t}
              </option>
            ))}
          </FormField>
          <FormField
            label="Grade"
            as="select"
            value={choices.grade}
            disabled={Boolean(busy)}
            onChange={(e) => choose({ grade: e.target.value, section: '' })}
          >
            <option value="">Whole school</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </FormField>
          <FormField
            label="Section"
            as="select"
            value={choices.section}
            disabled={Boolean(busy) || !choices.grade}
            onChange={(e) => choose({ section: e.target.value })}
          >
            <option value="">{choices.grade ? `All sections in Grade ${choices.grade}` : 'Pick a grade first'}</option>
            {sectionOptions.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </FormField>
        </div>
        {preview ? <GradeLocksPreview result={preview} /> : null}
      </div>
    </Modal>
  );
}
