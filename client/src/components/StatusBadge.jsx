// One central status -> tone map, not a per-module one.
//
// The system has five separate status vocabularies:
//   users                 pending | active | inactive | rejected
//   attendance            Present | Absent | Late | Excused
//   excuse_letters        Pending | Approved | Declined
//   contribution_records  Paid | Pending
//   grades                locked | unlocked  (rendered from is_locked)
//
// "Pending" appears in three of them meaning the same thing — waiting on
// someone — so mapping it once is honest rather than coincidental. An unknown
// string falls back to the neutral tone instead of throwing, and the `tone`
// prop overrides the map outright, so a future module that reuses one of these
// words with a different meaning is a one-line call-site change, not a
// breaking edit to this table.

const TONES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
};

const STATUS_TONE = {
  // users
  active: 'success',
  pending: 'warning',
  inactive: 'neutral',
  rejected: 'danger',
  // attendance
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'info',
  // excuse letters
  approved: 'success',
  declined: 'danger',
  // contribution records
  paid: 'success',
  // grades
  locked: 'neutral',
  unlocked: 'info',
};

// Intentionally not exported: nothing outside this file needs a tone without
// a badge yet. Export it the day something actually does.
function toneForStatus(status) {
  if (typeof status !== 'string') return 'neutral';
  return STATUS_TONE[status.trim().toLowerCase()] || 'neutral';
}

export default function StatusBadge({ status, tone, label, className = '' }) {
  if (status === null || status === undefined || status === '') return null;

  const resolved = TONES[tone] || TONES[toneForStatus(status)];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${resolved} ${className}`}
    >
      {label || status}
    </span>
  );
}
