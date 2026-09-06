import { useState } from 'react';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField, { controlClass } from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import GradeValue, { GradeLegend } from '../../format/grade';
import { NavItem } from '../../layout/Shell';

// Dev-only component gallery (routed in App.jsx behind import.meta.env.DEV).
// Every primitive in every state it can be in, so the shared pattern can be
// reviewed before any feature page is built against it.

function Section({ title, note, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {note ? <p className="mt-1 text-sm text-slate-500">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-medium text-slate-400">{label}</p>
      {children}
    </div>
  );
}

const STUDENTS = [
  { id: 1, name: 'Marwin Conde', lrn: '136491230001', section: 'Malikhain', grade: '90.00', mode: 'numerical', status: 'active' },
  { id: 2, name: 'Jea Mae Bargaso', lrn: '136491230002', section: 'Masigasig', grade: '0.00', mode: 'numerical', status: 'active' },
  { id: 3, name: 'Ashley Geguiera', lrn: '136491230003', section: 'Malikhain', grade: null, mode: 'numerical', status: 'inactive' },
  { id: 4, name: 'Liwayway Cruz', lrn: '136491230004', section: 'Maagap', grade: null, mode: 'descriptive', status: 'active' },
  // These two rows exist to prove mysql2's DECIMAL strings are compared as
  // NUMBERS, not text. 87.50 and 90.00 alone cannot show that: lexicographic
  // and numeric ordering agree on them ('8' < '9'), as they do on 0.00.
  // 100.00 is the discriminator — numerically the largest value here, but
  // lexicographically the second-smallest, since '1' < '8'. So a regression to
  // String#localeCompare reorders the table visibly:
  //   numeric ascending        0.00, 87.50, 90.00, 100.00
  //   lexicographic ascending  0.00, 100.00, 87.50, 90.00
  // Do not remove either row.
  { id: 5, name: 'Bayani Salazar', lrn: '136491230005', section: 'Masigasig', grade: '87.50', mode: 'numerical', status: 'active' },
  { id: 6, name: 'Perlita Manalo', lrn: '136491230006', section: 'Malikhain', grade: '100.00', mode: 'numerical', status: 'active' },
];

const COLUMNS = [
  { key: 'name', header: 'Student', sortable: true },
  { key: 'lrn', header: 'LRN' },
  { key: 'section', header: 'Section', sortable: true },
  {
    key: 'grade',
    header: 'Term grade',
    align: 'right',
    sortable: true,
    render: (row) => <GradeValue value={row.grade} mode={row.mode} />,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

export default function UiGallery() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="text-lg font-semibold text-slate-900">UI primitives</h1>
          <p className="mt-1 text-sm text-slate-500">
            Dev-only gallery. Not in any nav, not in a production build.
          </p>
        </header>

        <Section
          title="StatusBadge"
          note="All five status vocabularies in the system, plus the unknown-value fallback and a tone override."
        >
          <Row label="users">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="active" />
              <StatusBadge status="pending" />
              <StatusBadge status="inactive" />
              <StatusBadge status="rejected" />
            </div>
          </Row>
          <Row label="attendance">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="Present" />
              <StatusBadge status="Absent" />
              <StatusBadge status="Late" />
              <StatusBadge status="Excused" />
            </div>
          </Row>
          <Row label="excuse_letters">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="Pending" />
              <StatusBadge status="Approved" />
              <StatusBadge status="Declined" />
            </div>
          </Row>
          <Row label="contribution_records">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="Paid" />
              <StatusBadge status="Pending" />
            </div>
          </Row>
          <Row label="grades (is_locked)">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="locked" label="Locked" />
              <StatusBadge status="unlocked" label="Unlocked" />
            </div>
          </Row>
          <Row label="unknown value falls back to neutral / tone prop overrides the map">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="Something New" />
              <StatusBadge status="Pending" tone="danger" />
            </div>
          </Row>
        </Section>

        <Section
          title="DataTable — populated"
          note="Sortable headers cycle asc → desc → the API's own order. Nulls sort last in BOTH directions. Term grade ascending must read 0.00, 87.50, 90.00, 100.00 — 100.00 landing second would mean DECIMAL strings are being compared as text."
        >
          <DataTable columns={COLUMNS} rows={STUDENTS} />
        </Section>

        <Section title="DataTable — loading">
          <DataTable columns={COLUMNS} rows={[]} loading />
        </Section>

        <Section title="DataTable — empty">
          <DataTable
            columns={COLUMNS}
            rows={[]}
            emptyIcon="fa-user-graduate"
            emptyTitle="No students in this section"
            emptyMessage="Students appear here once they are enrolled in Grade 6 - Malikhain."
          />
        </Section>

        <Section
          title="DataTable — error"
          note="Message is the API's own wording, passed through extractError()."
        >
          <DataTable
            columns={COLUMNS}
            rows={[]}
            error="You are not the adviser of this student's section."
            onRetry={() => {}}
          />
        </Section>

        <Section title="LoadingSpinner">
          <div className="flex items-center gap-10 rounded-xl border border-slate-200 bg-white p-6">
            <LoadingSpinner size="sm" label={null} />
            <LoadingSpinner size="md" />
            <LoadingSpinner size="lg" label="Saving…" />
          </div>
        </Section>

        <Section title="EmptyState">
          <div className="rounded-xl border border-slate-200 bg-white">
            <EmptyState
              icon="fa-envelope-open-text"
              title="No excuse letters yet"
              message="Letters submitted by parents in your section will appear here for review."
              action={
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Refresh
                </button>
              }
            />
          </div>
        </Section>

        <Section title="ErrorAlert">
          <div className="space-y-3">
            <ErrorAlert
              message="Cannot reach the server. Check that it is running, then try again."
              onRetry={() => {}}
            />
            <ErrorAlert message="Cannot delete. 1 payment record exists for this contribution." />
          </div>
        </Section>

        <Section
          title="FormField"
          note="Four shapes: input (default), textarea, select with children as its options, or a custom control via render={({ id, describedBy }) => …}."
        >
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
            <FormField label="Student name" placeholder="Juan dela Cruz" required />
            <FormField label="LRN" hint="12 digits, immutable after creation." placeholder="136491230001" />
            <FormField label="Contact number" error="Contact number must be 11 digits." defaultValue="0917" />
            <FormField label="Status" as="select" defaultValue="Present">
              <option>Present</option>
              <option>Absent</option>
              <option>Late</option>
              <option>Excused</option>
            </FormField>
            <FormField
              label="Remarks"
              as="textarea"
              rows={3}
              className="sm:col-span-2"
              placeholder="Optional note to the parent…"
            />
            <FormField label="Disabled" placeholder="Locked for editing" disabled />
            <FormField
              label="Custom control (render)"
              render={({ id, describedBy }) => (
                <div className="flex gap-2">
                  <input id={id} aria-describedby={describedBy} className={controlClass} placeholder="From" />
                  <input className={controlClass} placeholder="To" />
                </div>
              )}
            />
          </div>
        </Section>

        <Section
          title="GradeValue — the four states"
          note="NULL is never a bare dash: the reason is inline text, because tooltips do not exist on touch and the report card is a phone screen."
        >
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-400">a real grade</p>
                <GradeValue value="88.05" mode="numerical" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-400">a real zero</p>
                <GradeValue value="0.00" mode="numerical" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-400">null, numerical</p>
                <GradeValue value={null} mode="numerical" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-400">null, descriptive</p>
                <GradeValue value={null} mode="descriptive" />
              </div>
            </div>
            <GradeLegend pending notApplicable />
          </div>
        </Section>

        <Section
          title="Nav states"
          note="Three states, not two. Blocked is a stronger claim than unbuilt and takes precedence — hover it for the reason."
        >
          <div className="max-w-xs rounded-xl border border-slate-200 bg-white p-2">
            <NavItem item={{ to: '/dev/ui', label: 'Built (this page)', icon: 'fa-gauge', built: true }} />
            <NavItem item={{ to: '/x', label: 'Not built yet', icon: 'fa-user-graduate', built: false }} />
            <NavItem
              item={{
                to: '/y',
                label: 'Blocked',
                icon: 'fa-clipboard-user',
                built: false,
                blocked: 'Attendance rate formula unanswered — see CLAUDE.md OPEN QUESTIONS',
              }}
            />
          </div>
        </Section>

        <Section title="Modal" note="Escape closes, backdrop click closes, body scroll locks while open.">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Open modal
          </button>

          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Decline excuse letter"
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700"
                >
                  Decline
                </button>
              </>
            }
          >
            <FormField
              label="Reason"
              as="textarea"
              rows={3}
              hint="Optional in the API — but a decline with no reason sends the parent to Messages instead."
            />
          </Modal>
        </Section>
      </div>
    </div>
  );
}
