import { useEffect, useState } from 'react';
import DataTable from '../../components/DataTable';
import { applyTheme, readTheme } from '../settings/theme';
import seal from '../../assets/school-seal.png';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField, { controlClass } from '../../components/FormField';
import PasswordField from '../../components/PasswordField';
import PasswordChecklist, { confirmError, passwordFormReady } from '../../components/PasswordChecklist';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import GradeValue, { GradeLegend } from '../../format/grade';
import { NavItem } from '../../layout/Shell';

// Dev-only component gallery (routed in App.jsx behind import.meta.env.DEV).
// Every primitive in every state it can be in, so the shared pattern can be
// reviewed before any feature page is built against it.

// PasswordField + PasswordChecklist, live: type to watch the rules flip and
// the Confirm field's mismatch error appear; the third field is the error
// state a refused current password produces (red border AND message — the
// `invalid` in FormField's render object, 2026-09-18).
function PasswordDemo() {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [revealed, setRevealed] = useState({ next: false, confirm: false, current: false });
  const toggle = (key) => setRevealed((r) => ({ ...r, [key]: !r[key] }));
  return (
    <div className="grid gap-4 rounded-xl border border-edge bg-surface p-6 sm:grid-cols-2">
      <PasswordField
        label="New password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
        revealed={revealed.next}
        onToggleReveal={() => toggle('next')}
        below={<PasswordChecklist value={next} />}
      />
      <PasswordField
        label="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        revealed={revealed.confirm}
        onToggleReveal={() => toggle('confirm')}
        error={confirmError(next, confirm)}
        hint={passwordFormReady(next, confirm) ? 'Ready — submit would be enabled.' : 'Submit stays disabled until every rule passes and this matches.'}
      />
      <PasswordField
        label="Current password (refused)"
        value="wrong-one"
        onChange={() => {}}
        autoComplete="current-password"
        revealed={revealed.current}
        onToggleReveal={() => toggle('current')}
        error="Current password is incorrect."
      />
      <PasswordField
        label="Disabled"
        value="••••••••"
        onChange={() => {}}
        revealed={false}
        onToggleReveal={() => {}}
        disabled
      />
    </div>
  );
}

// Page-only theme preview: sets data-theme on <html> for this visit and puts the
// STORED preference back on unmount. Never persisted — Settings does that.
const PREVIEWS = ['light', 'dark', 'system'];
function ThemePreviewToggle() {
  const [preview, setPreview] = useState(readTheme);
  useEffect(() => {
    applyTheme(preview);
  }, [preview]);
  useEffect(() => () => applyTheme(readTheme()), []);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-fg-muted">Preview theme (this page only, not saved):</span>
      {PREVIEWS.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setPreview(value)}
          aria-pressed={preview === value}
          className={`rounded-lg border px-2.5 py-1 capitalize transition ${
            preview === value
              ? 'border-primary bg-primary text-primary-fg'
              : 'border-edge-strong bg-surface text-fg-body hover:bg-surface-muted'
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

// One swatch per token, grouped as index.css groups them. The class list is
// the whole point — each swatch is the real utility, so a missing token shows
// up as an unstyled box rather than a wrong color.
const TOKEN_GROUPS = [
  ['surfaces', ['bg-page', 'bg-surface', 'bg-surface-muted', 'bg-surface-subtle', 'bg-backdrop']],
  ['edges', ['bg-edge', 'bg-edge-soft', 'bg-edge-strong', 'bg-focus-edge', 'bg-focus-ring', 'bg-focus-accent']],
  ['text', ['bg-fg', 'bg-fg-secondary', 'bg-fg-body', 'bg-fg-muted', 'bg-fg-faint', 'bg-fg-ghost']],
  ['primary', ['bg-primary', 'bg-primary-hover', 'bg-primary-fg', 'bg-primary-disabled', 'bg-solid-fg']],
  ['brand', ['bg-brand', 'bg-brand-soft', 'bg-seal-bg']],
  ['brand panel', ['bg-brand-panel', 'bg-brand-panel-fg', 'bg-brand-panel-muted']],
  ['neutral', ['bg-neutral-soft', 'bg-neutral-edge', 'bg-neutral-fg']],
  ['success', ['bg-success-soft', 'bg-success-edge', 'bg-success-fg', 'bg-success-strong', 'bg-success-icon', 'bg-success-solid', 'bg-success-solid-hover']],
  ['warning', ['bg-warning-soft', 'bg-warning-soft-hover', 'bg-warning-edge', 'bg-warning-edge-strong', 'bg-warning-fg', 'bg-warning-strong', 'bg-warning-icon']],
  ['danger', ['bg-danger-soft', 'bg-danger-edge', 'bg-danger-edge-strong', 'bg-danger-edge-focus', 'bg-danger-ring-focus', 'bg-danger-fg', 'bg-danger-strong', 'bg-danger-text', 'bg-danger-icon', 'bg-danger-solid', 'bg-danger-solid-hover']],
  ['info', ['bg-info-soft', 'bg-info-edge', 'bg-info-fg', 'bg-info-strong']],
  ['bubbles', ['bg-bubble-mine', 'bg-bubble-mine-fg', 'bg-bubble-mine-meta', 'bg-bubble-theirs', 'bg-bubble-theirs-fg', 'bg-bubble-theirs-meta']],
];
function TokenStrip() {
  return (
    <div className="space-y-3">
      {TOKEN_GROUPS.map(([group, classes]) => (
        <div key={group}>
          <p className="mb-1 text-xs text-fg-muted">{group}</p>
          <div className="flex flex-wrap gap-1.5">
            {classes.map((cls) => (
              <span key={cls} title={cls} className={`h-6 w-6 rounded border border-edge-strong ${cls}`} />
            ))}
          </div>
        </div>
      ))}
      <div className="space-y-1 rounded-lg border border-edge bg-surface p-3 text-sm">
        <p className="text-fg">fg on surface</p>
        <p className="text-fg-secondary">fg-secondary</p>
        <p className="text-fg-body">fg-body</p>
        <p className="text-fg-muted">fg-muted</p>
        <p className="text-fg-faint">fg-faint (icons only in dark)</p>
        <p className="text-fg-ghost">fg-ghost (icons)</p>
        <p className="text-danger-text">danger-text (a form error)</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <StatusBadge status="active" />
          <StatusBadge status="pending" />
          <StatusBadge status="absent" />
          <StatusBadge status="excused" />
          <StatusBadge status="locked" />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="rounded-lg bg-primary px-3 py-1 text-primary-fg">Primary</span>
          <span className="rounded-lg bg-danger-solid px-3 py-1 text-solid-fg">Danger</span>
          <span className="rounded-lg bg-success-solid px-3 py-1 text-solid-fg">Approve</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span className="rounded-lg bg-brand-soft px-3 py-1 font-medium text-brand">Active nav</span>
          <span className="font-medium text-brand underline-offset-2 hover:underline">A content link</span>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-seal-bg">
            <img src={seal} alt="Captain H. Francisco Elementary School seal" width="40" height="40" className="h-10 w-10 rounded-full" />
          </span>
        </div>
        {/* The Login panel in miniature. It is the one place brand-panel is
            used, and the one place a token pair has to look right against a
            LARGE solid field rather than as text on a card — worth being able
            to flip themes against without logging out. */}
        <div className="flex items-center gap-3 rounded-lg bg-brand-panel px-4 py-3 pt-1 text-brand-panel-fg">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-seal-bg">
            <img src={seal} alt="" width="40" height="40" className="h-10 w-10 rounded-full" />
          </span>
          <span className="text-sm font-semibold">Login panel</span>
          <span className="text-xs uppercase tracking-[0.18em] text-brand-panel-muted">Est. 1961</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, note, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{title}</h2>
      {note ? <p className="mt-1 text-sm text-fg-muted">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-medium text-fg-muted">{label}</p>
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
    <div className="min-h-screen bg-page p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="text-lg font-semibold text-fg">UI primitives</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Dev-only gallery. Not in any nav, not in a production build.
          </p>
          <ThemePreviewToggle />
        </header>

        <Section
          title="Tokens — light and dark side by side"
          note="Every semantic color token (docs/FRONTEND_CONVENTIONS.md §8), rendered twice: once in the page's theme, once inside a data-theme=&quot;dark&quot; subtree. The right column is always dark whatever the toggle above says — that is the point: any element can re-scope the tokens for its subtree."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-edge bg-page p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-muted">This page's theme</p>
              <TokenStrip />
            </div>
            <div data-theme="dark" className="rounded-xl border border-edge bg-page p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-muted">data-theme="dark"</p>
              <TokenStrip />
            </div>
          </div>
        </Section>

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
          <Row label="grades (is_locked)">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="locked" />
              <StatusBadge status="unlocked" />
            </div>
          </Row>
          <Row label="`label` is still available for when display text must differ from the value — is_locked is a boolean, so `locked`/`unlocked` are invented at the call site; it is not needed just for capitalisation">
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

        <Section
          title="DataTable — paged"
          note="A `page` prop switches the table to one page of a server-sorted list: the footer reads 51–56 of 812 (six fixture rows), Previous is enabled, Next is enabled while has_more is true, and header clicks call onSortChange instead of sorting locally (this fixture logs to the console)."
        >
          <DataTable
            columns={COLUMNS}
            rows={STUDENTS}
            page={{ limit: 50, offset: 50, total: 812, has_more: true }}
            onPageChange={(offset) => console.log('onPageChange', offset)}
            sort={{ key: 'name', dir: 'asc' }}
            onSortChange={(sort) => console.log('onSortChange', sort)}
          />
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
          <div className="flex items-center gap-10 rounded-xl border border-edge bg-surface p-6">
            <LoadingSpinner size="sm" label={null} />
            <LoadingSpinner size="md" />
            <LoadingSpinner size="lg" label="Saving…" />
          </div>
        </Section>

        <Section title="EmptyState">
          <div className="rounded-xl border border-edge bg-surface">
            <EmptyState
              icon="fa-envelope-open-text"
              title="No excuse letters yet"
              message="Letters submitted by parents in your section will appear here for review."
              action={
                <button
                  type="button"
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
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
            <ErrorAlert message="This excuse letter has already been reviewed." />
          </div>
        </Section>

        <Section
          title="FormStatus"
          note="The outcome of ONE write, rendered under the control that caused it — never in a shared slot at the top of the page. One value, so a success and a failure cannot be on screen at once. An error delegates to ErrorAlert, so the API's own wording (§2) is untouched; a success carries role=&quot;status&quot; where ErrorAlert carries role=&quot;alert&quot;."
        >
          <div className="space-y-3">
            <FormStatus status={ok('Contact number updated.')} />
            <FormStatus status={fail('Current password is incorrect.')} />
            <p className="text-sm text-fg-muted">
              A null status renders nothing — there is no empty frame to reserve space:
            </p>
            <FormStatus status={null} />
          </div>
        </Section>

        <Section
          title="FormField"
          note="Four shapes: input (default), textarea, select with children as its options, or a custom control via render={({ id, describedBy }) => …}."
        >
          <div className="grid gap-4 rounded-xl border border-edge bg-surface p-6 sm:grid-cols-2">
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
          title="PasswordField + PasswordChecklist"
          note="Eye toggle per field. The checklist reads format/passwordRule.js and goes grey → green as you type; the Confirm field shows 'Passwords do not match.' with a red border once it has a value; a refused password gets the same red border as any erroring input (invalid in FormField's render object)."
        >
          <PasswordDemo />
        </Section>

        <Section
          title="GradeValue — the four states"
          note="NULL is never a bare dash: the reason is inline text, because tooltips do not exist on touch and the report card is a phone screen."
        >
          <div className="rounded-xl border border-edge bg-surface p-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="mb-1 text-xs font-medium text-fg-muted">a real grade</p>
                <GradeValue value="88.05" mode="numerical" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-fg-muted">a real zero</p>
                <GradeValue value="0.00" mode="numerical" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-fg-muted">null, numerical</p>
                <GradeValue value={null} mode="numerical" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-fg-muted">null, descriptive</p>
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
          <div className="max-w-xs rounded-xl border border-edge bg-surface p-2">
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
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
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
                  className="rounded-lg border border-edge-strong px-3 py-1.5 text-sm text-fg-body transition hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg bg-danger-solid px-3 py-1.5 text-sm font-medium text-solid-fg transition hover:bg-danger-solid-hover"
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
