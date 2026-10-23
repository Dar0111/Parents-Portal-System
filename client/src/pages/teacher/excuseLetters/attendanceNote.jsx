import { confirmSentence, confirmTail, reviewNote } from '../../../format/excuseAttendance';

// THE REVIEW'S TWO SENTENCES ABOUT THE DAY (feat/excuse-attendance, B8): what
// the letter's day holds and what each decision will do to it, and — at the
// confirmation — the chosen decision named back with its effect (§5e). Every
// word is format/excuseAttendance.js, the phone's mirror of the same rule, so
// the two clients cannot say different things; the server still decides, and
// the note after the save is built from its reply.
//
// ITS OWN MODULE, as the reading view is (§17b): a conditional view a source
// assertion cannot check, so `scripts/ssr-excuse-attendance.jsx` renders it in
// every state.
//
// `day` is the page's read of that day: { state: 'loading' | 'ready' |
// 'failed', current }. A day that is not a class day is never read.

export function AttendanceNote({ date, day }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3 text-sm text-info-strong">
      <i aria-hidden="true" className="fa-solid fa-circle-info mt-0.5" />
      <p className="min-w-0 flex-1" data-attendance-note="">
        {reviewNote(date, day)}
      </p>
    </div>
  );
}

export function ConfirmNote({ decision, date, day }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3 text-sm text-warning-strong">
      <i aria-hidden="true" className="fa-solid fa-triangle-exclamation mt-0.5" />
      <p className="min-w-0 flex-1" data-confirm-note="">
        <strong>{decision === 'Approved' ? 'Approve this letter?' : 'Decline this letter?'}</strong>{' '}
        {confirmSentence(decision, date, day)} {confirmTail(decision, date, day)}
      </p>
    </div>
  );
}
