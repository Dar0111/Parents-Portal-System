import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField from '../../components/FormField';
import Modal from '../../components/Modal';
import PasswordField from '../../components/PasswordField';
import Button from '../../components/Button';
import SectionHeader from '../../components/SectionHeader';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';
import Reveal from '../../motion/Reveal';

// Admin backup & restore — Figure 5 processes 1.27 (Backup & Restore) and
// 1.28 (Show Backup Logs: the list is the history). Stage 4's last page.
//
// THE SERVER IS ALREADY CAREFUL; THIS PAGE MUST NOT UNDERMINE IT. Every
// safeguard lives in routes/backups.js and is explained there. Server
// messages are surfaced VERBATIM — several are written for someone reading
// them in a panic, and a paraphrase would lose the file name they carry.
//
// A WRONG STEP-UP PASSWORD IS 403, A MISSING ONE 400 (since 2026-09-15). It
// used to be 401 on a live session, which the shared interceptor reads as a
// dead session — a typo threw the admin out, and this call carried a
// per-call opt-out to survive it. The server status was fixed instead and
// the opt-out removed; "Incorrect password." now reaches the form through
// the ordinary catch below.
//
// AFTER A SUCCESSFUL RESTORE the server has invalidated every session
// (auth_security_state.token_valid_after), including this one. The page makes
// NO further request — not even a list reload — because any request would 401
// and the interceptor would jump to /login before the admin reads the safety
// copy's file name. Instead the result stays on screen until the admin clicks
// "Log in again", which logs out deliberately.
//
// ORPHANED FILES (.sql on disk with no backups row) are shown read-only.
// Every action keys on a row id; they have none. No adopt affordance — the
// server refuses to fabricate a created_by, and so does this page.
//
// SAFETY COPIES (pre_restore_*) have no Delete: one may be the only way back
// from a bad restore. Kind is read from the filename prefix the server sets
// (routes/backups.js formatBackupFilename).
//
// §5b: backups + orphaned_files come from load() only. Create and delete
// reload. A successful restore deliberately does not. §5e: delete confirms
// (the file leaves the disk); restore requires the server's password and
// typed file name; create does not confirm.
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): the Backups section — its
// header (title, Reload, Create backup), the privacy note, the write's
// result, the list — and, only when there are any, the files with no record.
// RELOAD is `load` itself: the same GET with the page and sort that are
// applied now. That one request returns BOTH lists, so the one Reload on the
// Backups header refreshes the orphan list too and the second section has no
// button of its own. It is held while a create, download or delete is
// running — the page's one-request-at-a-time rule (`busy`) — and it leaves
// the status message alone. It is also held for as long as the restore
// dialog is open (`restoring`): Modal has no focus trap, so the Tab key can
// still reach the page behind it, and a restore that is running or done must
// not be followed by a request from this page — the result panel's only exit
// is "Log in again". Both dialogs sit BESIDE the entrance wrapper, never inside it:
// Modal renders inline, and a wrapper mid-tween carries a transform
// (motion/motion.js).
//
// A FILE NAME INSIDE A SENTENCE MAY BREAK (`break-all`); IN THE LIST IT NEVER
// DOES (`nowrap`). The list's table has its own sideways scroller; a dialog
// has none, and a 48-character name in a 24rem dialog would push it wider
// than a phone. The name stays whole to copy and to read — only the line
// folds.

const SAFETY_PREFIX = 'pre_restore_';

function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value ?? '—') : d.toLocaleString();
}

function isSafetyCopy(row) {
  return String(row.filename).startsWith(SAFETY_PREFIX);
}

// A failed download arrives as a Blob (responseType: 'blob'), so extractError
// cannot see the JSON message inside it. Read it out so "missing from disk"
// reaches the screen as written.
async function downloadErrorMessage(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } catch {
      // fall through to the generic path
    }
  }
  return extractError(err);
}

export default function AdminBackupsPage() {
  usePageTitle('Backup & Restore');
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [backups, setBackups] = useState([]);
  const [orphans, setOrphans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // One request at a time across every action: no second click anywhere
  // while a create, download or delete is running.
  const [busy, setBusy] = useState(null);
  // Keyed status. One key: every write on this page (create, download,
  // delete) is about the backup list, and each reports above that list.
  // The restore result is NOT a status — it is a terminal panel that
  // replaces the page, because after a restore no further request can
  // succeed against the new session cutoff.
  const [status, setStatus] = useState({});

  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const [restoring, setRestoring] = useState(null); // the row
  const [stage, setStage] = useState('form'); // 'form' | 'running' | 'done'
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [restoreError, setRestoreError] = useState(null);
  // The server names the input it refused (`field`: "password" or
  // "confirm_filename", 2026-09-18), so those messages render under that
  // field with a red border instead of at the top of the scrolling body;
  // restoreError keeps everything else (offline, 404, 500).
  const [restoreFieldErrors, setRestoreFieldErrors] = useState({});
  const [outcome, setOutcome] = useState(null);
  const attemptedRef = useRef(false);

  // Paged table (2026-09-19): one page of a server-sorted list (C1); a
  // sort change resets to the first page (C6); a page emptied by a delete
  // steps back on its own (C7, in DataTable). orphaned_files is NOT paged —
  // it is the disk minus EVERY row, the same list on every page.
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/backups', {
        unwrap: ['backups', 'orphaned_files', 'page'],
        params: listParams({ offset, sort }),
      });
      setBackups(data.backups);
      setOrphans(data.orphaned_files);
      setPage(data.page);
    } catch (err) {
      setError(extractError(err));
      setBackups([]);
      setOrphans([]);
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [offset, sort]);

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

  useEffect(() => {
    load();
  }, [load]);

  function clearStrips() {
    setStatus({});
  }

  async function createBackup() {
    clearStrips();
    setBusy('create');
    try {
      const { message } = await api.post('/backups', null, { unwrap: ['backup', 'message'] });
      setStatus({ list: ok(message) });
      await load();
    } catch (err) {
      setStatus({ list: fail(extractError(err)) });
    } finally {
      setBusy(null);
    }
  }

  async function downloadBackup(row) {
    clearStrips();
    setBusy(`download-${row.id}`);
    try {
      const res = await api.get(`/backups/${row.id}/download`, { raw: true, responseType: 'blob' });
      // CORS does not expose Content-Disposition (server.js cors() has no
      // exposedHeaders), so the name comes from the row, not the response.
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = row.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus({ list: fail(await downloadErrorMessage(err)) });
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(`delete-${deleting.id}`);
    setDeleteError(null);
    try {
      const message = await api.delete(`/backups/${deleting.id}`, { unwrap: 'message' });
      setDeleting(null);
      setStatus({ list: ok(message) });
      await load();
    } catch (err) {
      setDeleteError(extractError(err));
    } finally {
      setBusy(null);
    }
  }

  function openRestore(row) {
    clearStrips();
    setRestoring(row);
    setStage('form');
    setPassword('');
    setRevealed(false);
    setConfirmName('');
    setRestoreError(null);
    setRestoreFieldErrors({});
    setOutcome(null);
    attemptedRef.current = false;
  }

  function closeRestore() {
    // Running: nothing may interrupt it. Done: the only way out is "Log in
    // again" — every request from here on would 401.
    if (stage !== 'form') return;
    setRestoring(null);
    setPassword('');
    setConfirmName('');
    setRestoreError(null);
    setRestoreFieldErrors({});
    // A failed attempt can still have created a safety copy (a partial
    // restore, or one that failed after the safety dump) — show it.
    if (attemptedRef.current) load();
  }

  async function submitRestore(event) {
    event.preventDefault();
    if (!restoring) return;
    attemptedRef.current = true;
    setRestoreError(null);
    setRestoreFieldErrors({});
    setStage('running');
    try {
      // raw: this is the one endpoint where success:true does not always mean
      // full success — the message must be read.
      const res = await api.post(
        `/backups/${restoring.id}/restore`,
        { password, confirm_filename: confirmName },
        { raw: true }
      );
      setPassword('');
      setOutcome(res.data);
      setStage('done');
    } catch (err) {
      const field = err?.response?.data?.field;
      if (field === 'password' || field === 'confirm_filename') {
        setRestoreFieldErrors({ [field]: extractError(err) });
      } else {
        setRestoreError(extractError(err));
      }
      setStage('form');
    }
  }

  function logInAgain() {
    logout();
    navigate('/login', { replace: true });
  }

  const columns = [
    {
      key: 'filename',
      header: 'File',
      sortable: true,
      // NOWRAP — an identifier never wraps (§5), and this one DID: a HYPHEN is
      // a line-break opportunity, so "parents_portal_2026-09-26_203944.sql"
      // broke after "2026-09-" at 1280 even with no space in it (smoke gate,
      // 2026-09-26). Measured with nowrap: 0px table overflow at 1280; at 1024
      // the table's own scroller (which already scrolled 31px) scrolls 137px;
      // the page never scrolls sideways. The actions and "Created by" still
      // wrap — at a space, which §5 allows; holding them on one line cost 40px
      // of scroll at 1280.
      nowrap: true,
      render: (row) => <span className="font-mono text-xs text-fg">{row.filename}</span>,
    },
    {
      key: 'kind',
      header: 'Kind',
      render: (row) =>
        isSafetyCopy(row) ? (
          <span className="text-fg-secondary">Safety copy (taken automatically before a restore)</span>
        ) : (
          <span className="text-fg-secondary">Manual backup</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      nowrap: true,
      render: (row) => <span className="tabular-nums">{formatWhen(row.created_at)}</span>,
    },
    { key: 'created_by_name', header: 'Created by', render: (row) => row.created_by_name || '—' },
    {
      key: 'file_size',
      header: 'Size',
      align: 'right',
      nowrap: true,
      render: (row) => <span className="tabular-nums">{formatSize(row.file_size)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      // THE ROW ACTIONS: the row-action size (44px under a finger, 36px
      // under a pointer), 8px apart. Download and Restore are the neutral
      // pair; Delete is the outlined danger and opens the confirmation that
      // names the file — the filled danger is a dialog's confirm, nowhere
      // else.
      render: (row) => {
        const disabled = busy !== null;
        if (!row.file_exists) {
          return (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-warning-soft px-2 py-1 text-xs font-semibold text-warning-fg">
                <i aria-hidden="true" className="fa-solid fa-triangle-exclamation" />
                Missing from disk
              </span>
              {isSafetyCopy(row) ? null : (
                <Button
                  size="sm"
                  variant="danger-outline"
                  disabled={disabled}
                  onClick={() => {
                    clearStrips();
                    setDeleteError(null);
                    setDeleting(row);
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
          );
        }
        return (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* WHILE IT DOWNLOADS THE BUTTON KEEPS ITS WORD — the spinner
                takes the icon's place instead of the label's, so the button
                neither loses its name nor changes width. */}
            <Button
              size="sm"
              icon="fa-download"
              disabled={disabled}
              loading={busy === `download-${row.id}`}
              onClick={() => downloadBackup(row)}
            >
              Download
            </Button>
            <Button size="sm" disabled={disabled} onClick={() => openRestore(row)}>
              Restore…
            </Button>
            {isSafetyCopy(row) ? null : (
              <Button
                size="sm"
                variant="danger-outline"
                disabled={disabled}
                onClick={() => {
                  clearStrips();
                  setDeleteError(null);
                  setDeleting(row);
                }}
              >
                Delete
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const orphanColumns = [
    {
      key: 'filename',
      header: 'File',
      // NOWRAP, same reason as the backups list above: a hyphen breaks it.
      nowrap: true,
      render: (row) => <span className="font-mono text-xs text-fg-secondary">{row.filename}</span>,
    },
    {
      key: 'file_size',
      header: 'Size',
      align: 'right',
      nowrap: true,
      render: (row) => <span className="tabular-nums">{formatSize(row.file_size)}</span>,
    },
    {
      key: 'mtime',
      header: 'Modified',
      nowrap: true,
      render: (row) => <span className="tabular-nums">{formatWhen(row.mtime)}</span>,
    },
  ];

  const restoreDate = restoring ? formatWhen(restoring.created_at) : '';

  return (
    <div>
      <Reveal className="space-y-6">
        <section className="space-y-3">
          {/* Create backup is the page's ONE filled action. While it runs the
              label says so and the spinner takes the icon's place; every other
              action on the page — Reload included — waits (`busy`). */}
          <SectionHeader
            title="Backups"
            onReload={load}
            reloading={loading}
            reloadDisabled={busy !== null || restoring !== null}
            reloadLabel="Reload backups"
            actions={
              <Button
                variant="primary"
                icon="fa-plus"
                onClick={createBackup}
                disabled={busy !== null}
                loading={busy === 'create'}
              >
                {busy === 'create' ? 'Creating backup…' : 'Create backup'}
              </Button>
            }
          />

          {/* §5i: routes/backups.js — the download is the most sensitive
              action the API permits, and it is logged.

              A NOTE UNDER THE HEADER, NOT THE HEADER'S `description`: beside
              Reload and Create backup a phone leaves the header's text column
              about 9rem, and three sentences in it would run a dozen lines.
              Here they take the full width. */}
          <p className="flex items-start gap-3 rounded-xl border border-info-edge bg-info-soft px-4 py-3 text-sm text-info-strong">
            <span aria-hidden="true" className="mt-0.5 flex items-center justify-center">
              <i className="fa-solid fa-circle-info" />
            </span>
            <span className="min-w-0">
              A backup is a full copy of the database. A download is a full copy of every
              student&apos;s records — keep it private. Downloads are recorded in the activity log.
            </span>
          </p>

          {/* §5f: two causes of an empty list, two branches. */}
          <FormStatus status={status.list} />

          <DataTable
            // THE NON-PERSON CASE, and it is here in DV1 on purpose: a row is
            // a FILE, so there is no `avatar` — a backup with an initials disc
            // would read as a member of staff. It also has no primary action:
            // download, delete and restore are three peers, and restore is
            // irreversible, so a whole-card tap is exactly the wrong shape.
            // Static card, no chevron, the same action buttons underneath.
            renderCard={(row) => ({
              title: row.filename,
              subtitle: isSafetyCopy(row) ? 'Safety copy' : 'Manual backup',
              meta: `${formatWhen(row.created_at)} · ${formatSize(row.file_size)}`,
              actions: columns[columns.length - 1].render(row),
            })}
            columns={columns}
            rows={backups}
            loading={loading}
            error={error}
            onRetry={load}
            page={page}
            onPageChange={setOffset}
            sort={sort}
            onSortChange={changeSort}
            emptyIcon="fa-database"
            emptyTitle={orphans.length ? 'No backups recorded' : 'No backups yet'}
            emptyMessage={
              orphans.length
                ? 'Files found on the server with no record are listed below. They cannot be used from this page.'
                : 'Create a backup to have a copy of the database you can restore from.'
            }
          />
        </section>

        {/* READ-ONLY, AND IT STAYS THAT WAY: no actions, no adopt control, no
            card (see the header). No Reload of its own either — this list comes
            back with the Backups request, so that section's Reload is this
            one's too. */}
        {orphans.length ? (
          <section className="space-y-3">
            <SectionHeader
              title="Files on disk with no record"
              description="The system has no record of these files, so they cannot be downloaded, restored or deleted here."
            />
            <DataTable columns={orphanColumns} rows={orphans} keyField="filename" />
          </section>
        ) : null}
      </Reveal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => (busy ? null : setDeleting(null))}
        closeOnBackdrop={!busy}
        title="Delete backup"
        size="sm"
        footer={
          // The neutral way out, then the filled danger — a dialog's confirm
          // and nothing else. `loading` adds the spinner the old button drew
          // by hand, and disables it exactly as `disabled` already did.
          <>
            <Button onClick={() => setDeleting(null)} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={Boolean(busy)} loading={Boolean(busy)}>
              Delete
            </Button>
          </>
        }
      >
        {deleteError ? <ErrorAlert message={deleteError} className="mb-4" /> : null}
        {deleting ? (
          <p className="text-sm text-fg-secondary">
            Delete <span className="break-all font-mono text-xs font-semibold text-fg">{deleting.filename}</span>, taken{' '}
            {formatWhen(deleting.created_at)}? The file is removed from the server&apos;s disk and
            cannot be recovered.
          </p>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(restoring)}
        onClose={closeRestore}
        closeOnBackdrop={stage === 'form'}
        title={stage === 'done' ? 'Database restored' : 'Restore database'}
        size="lg"
        footer={
          stage === 'done' ? (
            <Button variant="primary" onClick={logInAgain}>
              Log in again
            </Button>
          ) : (
            // The confirm of the one irreversible action on the page: the
            // filled danger, disabled until both fields are filled.
            <>
              <Button onClick={closeRestore} disabled={stage === 'running'}>
                Cancel
              </Button>
              <Button
                variant="danger"
                type="submit"
                form="restore-form"
                disabled={stage === 'running' || !password || !confirmName}
                loading={stage === 'running'}
              >
                {stage === 'running' ? 'Restoring…' : 'Restore database'}
              </Button>
            </>
          )
        }
      >
        {restoring && stage === 'done' && outcome ? (
          // Server wording, verbatim. Nothing on this page calls the API
          // again: every session — this one included — is now invalid.
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-success-edge bg-success-soft px-4 py-3">
              <i aria-hidden="true" className="fa-solid fa-circle-check mt-0.5 text-success-icon" />
              <p className="min-w-0 flex-1 text-sm text-success-strong">{outcome.message}</p>
            </div>
            {outcome.restored_from ? (
              <p className="text-sm text-fg-secondary">
                Restored from{' '}
                <span className="break-all font-mono text-xs">{outcome.restored_from.filename}</span>.
              </p>
            ) : null}
            {/* The way back, set apart: the one file name on this panel the
                admin may need again. */}
            {outcome.safety_backup ? (
              <p className="rounded-xl border border-edge bg-surface-subtle px-4 py-3 text-sm text-fg-secondary">
                Safety copy of the database as it was just before this restore:{' '}
                <span className="break-all font-mono text-xs font-semibold text-fg">
                  {outcome.safety_backup.filename}
                </span>
                . If this restore was a mistake, log in and restore that file.
              </p>
            ) : null}
            {Number(outcome.activity_logs_wiped) > 0 ? (
              <p className="text-sm text-fg-secondary">
                <span className="tabular-nums">{outcome.activity_logs_wiped}</span> activity log{' '}
                {Number(outcome.activity_logs_wiped) === 1 ? 'entry' : 'entries'} recorded after the
                backup was taken {Number(outcome.activity_logs_wiped) === 1 ? 'was' : 'were'} lost.
              </p>
            ) : null}
            <p className="text-sm text-fg-muted">
              Log in again with the password that was valid when{' '}
              <span className="break-all font-mono text-xs">{restoring.filename}</span> was taken.
            </p>
          </div>
        ) : restoring ? (
          // No scroller of its own: the dialog's body is the scroller now
          // (Modal), so this long form no longer scrolls inside a scrolling
          // box and its action row stays in view.
          <form id="restore-form" onSubmit={submitRestore} className="space-y-4">
            <p className="text-sm text-fg-secondary">
              This replaces the entire database with{' '}
              <span className="break-all font-mono text-xs font-semibold text-fg">{restoring.filename}</span>, taken{' '}
              {restoreDate}.
            </p>

            {/* §5i: the server's own order and terms (routes/backups.js).
                Every sentence stays; the amber panel only marks them as what
                they are — consequences to read before the password. */}
            <ol className="list-decimal space-y-2 rounded-xl border border-warning-edge bg-warning-soft py-3 pl-9 pr-4 text-sm text-warning-strong marker:font-semibold">
              <li>A safety backup of the current database is taken first. If that fails, nothing is changed.</li>
              <li>
                Everything except the list of backups is replaced with this backup&apos;s contents —
                students, grades, attendance, messages, accounts and passwords, and the activity
                log. Anything recorded after {restoreDate} is gone.
              </li>
              <li>
                If the restore fails partway, the database may be left partly restored. That cannot
                be undone automatically; the safety backup is what you recover from.
              </li>
              <li>
                Every session ends — everyone, including you, must log in again, with the password
                that was valid when this backup was taken.
              </li>
            </ol>

            <PasswordField
              label="Your password"
              value={password}
              onChange={(e) => {
                setRestoreFieldErrors((prev) => ({ ...prev, password: null }));
                setPassword(e.target.value);
              }}
              autoComplete="current-password"
              revealed={revealed}
              onToggleReveal={() => setRevealed((r) => !r)}
              error={restoreFieldErrors.password}
              disabled={stage === 'running'}
            />

            <div className="space-y-1.5">
              <p className="text-sm text-fg-secondary">
                Type the file name to confirm:{' '}
                <span className="break-all font-mono text-xs font-semibold text-fg">{restoring.filename}</span>
              </p>
              <FormField
                label="File name"
                value={confirmName}
                onChange={(e) => {
                  setRestoreFieldErrors((prev) => ({ ...prev, confirm_filename: null }));
                  setConfirmName(e.target.value);
                }}
                autoComplete="off"
                spellCheck={false}
                disabled={stage === 'running'}
                error={restoreFieldErrors.confirm_filename}
              />
            </div>

            {/* Everything the server did not attribute to a field — offline,
                a 404, a 500 — renders here, under the fields and next to the
                action row (§7c), not at the top of the scrolling body. */}
            {restoreError ? <ErrorAlert message={restoreError} /> : null}

            {stage === 'running' ? (
              <p className="flex items-start gap-3 rounded-xl border border-warning-edge bg-warning-soft px-4 py-3 text-sm font-semibold text-warning-strong">
                <span aria-hidden="true" className="mt-0.5 flex items-center justify-center">
                  <i className="fa-solid fa-triangle-exclamation" />
                </span>
                <span className="min-w-0">Restoring — do not close or refresh this tab.</span>
              </p>
            ) : null}
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
