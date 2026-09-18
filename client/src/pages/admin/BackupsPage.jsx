import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import ErrorAlert from '../../components/ErrorAlert';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import FormField from '../../components/FormField';
import Modal from '../../components/Modal';
import PasswordField from '../../components/PasswordField';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

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
  const [outcome, setOutcome] = useState(null);
  const attemptedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/backups', { unwrap: ['backups', 'orphaned_files'] });
      setBackups(data.backups);
      setOrphans(data.orphaned_files);
    } catch (err) {
      setError(extractError(err));
      setBackups([]);
      setOrphans([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
    // A failed attempt can still have created a safety copy (a partial
    // restore, or one that failed after the safety dump) — show it.
    if (attemptedRef.current) load();
  }

  async function submitRestore(event) {
    event.preventDefault();
    if (!restoring) return;
    attemptedRef.current = true;
    setRestoreError(null);
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
      setRestoreError(extractError(err));
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
      render: (row) => <span className="font-mono text-xs text-slate-900">{row.filename}</span>,
    },
    {
      key: 'kind',
      header: 'Kind',
      render: (row) =>
        isSafetyCopy(row) ? (
          <span className="text-slate-700">Safety copy (taken automatically before a restore)</span>
        ) : (
          <span className="text-slate-700">Manual backup</span>
        ),
    },
    { key: 'created_at', header: 'Created', sortable: true, render: (row) => formatWhen(row.created_at) },
    { key: 'created_by_name', header: 'Created by', render: (row) => row.created_by_name || '—' },
    { key: 'file_size', header: 'Size', align: 'right', render: (row) => formatSize(row.file_size) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => {
        const disabled = busy !== null;
        if (!row.file_exists) {
          return (
            <div className="flex items-center justify-end gap-2">
              <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Missing from disk</span>
              {isSafetyCopy(row) ? null : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    clearStrips();
                    setDeleteError(null);
                    setDeleting(row);
                  }}
                  className="rounded-lg border border-rose-200 px-2.5 py-1 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
          );
        }
        return (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => downloadBackup(row)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              {busy === `download-${row.id}` ? <i className="fa-solid fa-circle-notch fa-spin" /> : 'Download'}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => openRestore(row)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-800 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Restore…
            </button>
            {isSafetyCopy(row) ? null : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  clearStrips();
                  setDeleteError(null);
                  setDeleting(row);
                }}
                className="rounded-lg border border-rose-200 px-2.5 py-1 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                Delete
              </button>
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
      render: (row) => <span className="font-mono text-xs text-slate-700">{row.filename}</span>,
    },
    { key: 'file_size', header: 'Size', align: 'right', render: (row) => formatSize(row.file_size) },
    { key: 'mtime', header: 'Modified', render: (row) => formatWhen(row.mtime) },
  ];

  const restoreDate = restoring ? formatWhen(restoring.created_at) : '';

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Backups</h2>
            {/* §5i: routes/backups.js — the download is the most sensitive
                action the API permits, and it is logged. */}
            <p className="text-sm text-slate-500">
              A backup is a full copy of the database. A download is a full copy of every
              student&apos;s records — keep it private. Downloads are recorded in the activity log.
            </p>
          </div>
          <button
            type="button"
            onClick={createBackup}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === 'create' ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin" />
                Creating backup…
              </>
            ) : (
              'Create backup'
            )}
          </button>
        </div>

        {/* §5f: two causes of an empty list, two branches. */}
        <FormStatus status={status.list} />

        <DataTable
          columns={columns}
          rows={backups}
          loading={loading}
          error={error}
          onRetry={load}
          emptyIcon="fa-database"
          emptyTitle={orphans.length ? 'No backups recorded' : 'No backups yet'}
          emptyMessage={
            orphans.length
              ? 'Files found on the server with no record are listed below. They cannot be used from this page.'
              : 'Create a backup to have a copy of the database you can restore from.'
          }
        />
      </section>

      {orphans.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Files on disk with no record</h2>
          <p className="text-sm text-slate-500">
            The system has no record of these files, so they cannot be downloaded, restored or
            deleted here.
          </p>
          <DataTable columns={orphanColumns} rows={orphans} keyField="filename" />
        </section>
      ) : null}

      <Modal
        open={Boolean(deleting)}
        onClose={() => (busy ? null : setDeleting(null))}
        closeOnBackdrop={!busy}
        title="Delete backup"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={Boolean(busy)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {busy ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
              Delete
            </button>
          </>
        }
      >
        {deleteError ? <ErrorAlert message={deleteError} className="mb-3" /> : null}
        {deleting ? (
          <p className="text-sm text-slate-700">
            Delete <span className="font-mono text-xs">{deleting.filename}</span>, taken{' '}
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
            <button
              type="button"
              onClick={logInAgain}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Log in again
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={closeRestore}
                disabled={stage === 'running'}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="restore-form"
                disabled={stage === 'running' || !password || !confirmName}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {stage === 'running' ? <i className="fa-solid fa-circle-notch fa-spin" /> : null}
                {stage === 'running' ? 'Restoring…' : 'Restore database'}
              </button>
            </>
          )
        }
      >
        {restoring && stage === 'done' && outcome ? (
          // Server wording, verbatim. Nothing on this page calls the API
          // again: every session — this one included — is now invalid.
          <div className="space-y-3">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {outcome.message}
            </p>
            {outcome.restored_from ? (
              <p className="text-sm text-slate-700">
                Restored from <span className="font-mono text-xs">{outcome.restored_from.filename}</span>.
              </p>
            ) : null}
            {outcome.safety_backup ? (
              <p className="text-sm text-slate-700">
                Safety copy of the database as it was just before this restore:{' '}
                <span className="font-mono text-xs font-semibold">{outcome.safety_backup.filename}</span>.
                If this restore was a mistake, log in and restore that file.
              </p>
            ) : null}
            {Number(outcome.activity_logs_wiped) > 0 ? (
              <p className="text-sm text-slate-700">
                {outcome.activity_logs_wiped} activity log{' '}
                {Number(outcome.activity_logs_wiped) === 1 ? 'entry' : 'entries'} recorded after the
                backup was taken {Number(outcome.activity_logs_wiped) === 1 ? 'was' : 'were'} lost.
              </p>
            ) : null}
            <p className="text-sm text-slate-500">
              Log in again with the password that was valid when{' '}
              <span className="font-mono text-xs">{restoring.filename}</span> was taken.
            </p>
          </div>
        ) : restoring ? (
          <form id="restore-form" onSubmit={submitRestore} className="max-h-[70vh] space-y-4 overflow-y-auto">
            {restoreError ? <ErrorAlert message={restoreError} /> : null}

            <p className="text-sm text-slate-800">
              This replaces the entire database with{' '}
              <span className="font-mono text-xs font-semibold">{restoring.filename}</span>, taken{' '}
              {restoreDate}.
            </p>

            {/* §5i: the server's own order and terms (routes/backups.js). */}
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
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
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              revealed={revealed}
              onToggleReveal={() => setRevealed((r) => !r)}
            />

            <div className="space-y-1.5">
              <p className="text-sm text-slate-700">
                Type the file name to confirm:{' '}
                <span className="font-mono text-xs font-semibold text-slate-900">{restoring.filename}</span>
              </p>
              <FormField
                label="File name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={stage === 'running'}
              />
            </div>

            {stage === 'running' ? (
              <p className="text-sm font-medium text-slate-800">
                Restoring — do not close or refresh this tab.
              </p>
            ) : null}
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
