import { useCallback, useEffect, useState } from 'react';
import api, { listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import FilterActions from '../../components/FilterActions';
import { isDirty } from '../../components/filterState';
import FormField, { filterFieldClass, filterSelectClass } from '../../components/FormField';
import FormStatus, { ok, fail } from '../../components/FormStatus';
import Button from '../../components/Button';
import SectionHeader from '../../components/SectionHeader';
import { cardClass } from '../../components/buttonClass';
import { dateTime } from '../../format/date';
import { usePageTitle } from '../../layout/usePageTitle';
import Reveal from '../../motion/Reveal';
import {
  GROUP_PREFIX,
  ROLE_OPTIONS,
  defaultFilters,
  downloadFileName,
  emptyCopy,
  filtersToParams,
  roleWord,
} from './activityLog';

// Admin → Activity log (feat/activity-log, B2 — the owner's decision D-21,
// 2026-10-16; Figure 4 lists "activity logs" among the system's outputs to the
// admin). READ ONLY: who did what kind of thing, and when, newest first —
// filtered by date, account role and action, and downloaded as a CSV. FRONTEND
// §36.
//
// AN ENTRY'S DETAILS ARE NOT SHOWN (the owner's Q1 (a)): the API never selects
// `description`, so nothing here can render it. The words for an action are
// the server's — each row's `action_label`, and the filter's options from
// GET /activity-logs/actions — so this page spells none of them.
//
// THE SERVER SORTS, ALWAYS NEWEST FIRST: no column sorts, because a sort of
// one page of a paged list would mislead (C1).
//
// THE DOWNLOAD is exactly the applied filters. Its file name comes from the
// server's Content-Disposition. A filter over the server's cap is refused
// WITHOUT a request: the list's `export_limit.message` is the server's own
// sentence, shown when Download is pressed. A download writes one
// export_activity_log row (the owner's Q8) — the list does not re-read for
// it; the browser's reload shows it (no Reload control).
//
// §5b: `rows` come from the last successful GET only; load() is the only
// writer. §5c: no login id anywhere — the account is its name and its role.

// A failed download arrives as a Blob (responseType: 'blob'), so extractError
// cannot see the JSON message inside it — the same reading as Backup & Restore.
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

export default function AdminActivityLogPage() {
  usePageTitle('Activity log');

  // The default range is fixed when the page opens; Reset returns to it.
  const [defaults] = useState(() => defaultFilters());
  const [draft, setDraft] = useState(defaults);
  const [applied, setApplied] = useState(defaults);
  const dirty = isDirty(draft, applied);
  const [toError, setToError] = useState(null);

  // The filter's options. A failed read leaves "All actions" only.
  const [groups, setGroups] = useState([]);
  const [groupsError, setGroupsError] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState(null);
  const [exportLimit, setExportLimit] = useState(null);

  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState({});

  useEffect(() => {
    let cancelled = false;
    api
      .get('/activity-logs/actions', { unwrap: 'groups' })
      .then((all) => {
        if (!cancelled) setGroups(all);
      })
      .catch(() => {
        if (!cancelled) setGroupsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // `load` sets state only in its reply's callbacks: whoever starts a load —
  // the first render, Apply, Reset, the pager, Try again — has already set
  // `loading` and cleared the error, so the effect below sets nothing
  // synchronously (react(set-state-in-effect)).
  const load = useCallback(() => {
    const params = { ...listParams({ offset }), ...filtersToParams(applied) };
    return api
      .get('/activity-logs', { unwrap: ['entries', 'page', 'export_limit'], params })
      .then((result) => {
        setRows(result.entries);
        setPage(result.page);
        setExportLimit(result.export_limit);
      })
      .catch((err) => {
        setError(extractError(err));
        setRows([]);
        setPage(null);
        setExportLimit(null);
      })
      .finally(() => setLoading(false));
  }, [applied, offset]);

  useEffect(() => {
    load();
  }, [load]);

  // The pager (and DataTable's step back from an emptied page, C7) and Try
  // again: each says it is loading before the load starts.
  function goToPage(next) {
    setLoading(true);
    setError(null);
    setOffset(next);
  }

  function retry() {
    setLoading(true);
    setError(null);
    load();
  }

  function applyFilters(event) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setToError('To must be on or after From.');
      return;
    }
    setToError(null);
    setStatus({});
    // Loading before applied, so the frame between them cannot render the
    // wrong empty copy.
    setLoading(true);
    setError(null);
    setRows([]);
    setPage(null);
    setOffset(0);
    setApplied({ ...draft });
  }

  function resetFilters() {
    setToError(null);
    setStatus({});
    setDraft(defaults);
    setLoading(true);
    setError(null);
    setRows([]);
    setPage(null);
    setOffset(0);
    setApplied(defaults);
  }

  // Its own value (§5f): whether the applied filters differ from the page's
  // default is a different question from which empty copy applies.
  const canReset = isDirty(applied, defaults);

  async function download() {
    setStatus({});
    if (exportLimit?.message) {
      setStatus({ download: fail(exportLimit.message) });
      return;
    }
    setDownloading(true);
    try {
      const res = await api.get('/activity-logs/export', {
        raw: true,
        responseType: 'blob',
        params: filtersToParams(applied),
      });
      const name = downloadFileName(res.headers?.['content-disposition']);
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus({ download: ok(`Downloaded ${name}.`) });
    } catch (err) {
      setStatus({ download: fail(await downloadErrorMessage(err)) });
    } finally {
      setDownloading(false);
    }
  }

  const columns = [
    {
      key: 'created_at',
      header: 'When',
      nowrap: true,
      render: (row) => <span className="tabular-nums">{dateTime(row.created_at)}</span>,
    },
    {
      key: 'account',
      header: 'Account',
      render: (row) =>
        row.actor_name ? row.actor_name : <span className="text-fg-muted">Deleted account</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => roleWord(row.actor_role) || <span className="text-fg-muted">—</span>,
    },
    { key: 'action', header: 'Action', render: (row) => row.action_label },
  ];

  return (
    <Reveal className="space-y-6">
      <section className="space-y-3">
        {/* §5i, the owner's words (C3): every claim in it is the server's
            behaviour — the account is the row's, the times are Manila's, and
            the description never leaves the server. */}
        <SectionHeader
          title="Activity log"
          description="Entries the portal records, such as sign-ins, changes and downloads. Newest first; times are in Philippine time. For a failed sign-in, a reset request or a password alert, Account is the account it concerned, which may not be who acted. An entry's details are not shown."
          actions={
            <Button
              icon="fa-download"
              loading={downloading}
              disabled={loading || !page || page.total === 0}
              onClick={download}
            >
              Download CSV
            </Button>
          }
        />
        <FormStatus status={status.download} />

        <form onSubmit={applyFilters} className={`${cardClass} flex flex-wrap items-start gap-3 p-4`}>
          <FormField
            label="From"
            type="date"
            className={filterFieldClass}
            value={draft.from}
            onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
          />
          <FormField
            label="To"
            type="date"
            className={filterFieldClass}
            value={draft.to}
            error={toError}
            onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
          />
          <FormField
            label="Account role"
            as="select"
            className={filterSelectClass}
            value={draft.role}
            onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value }))}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </FormField>
          <FormField
            label="Action"
            as="select"
            className={filterSelectClass}
            value={draft.action}
            hint={groupsError ? 'The list of actions could not be loaded.' : undefined}
            onChange={(e) => setDraft((prev) => ({ ...prev, action: e.target.value }))}
          >
            <option value="">All actions</option>
            {groups.map((g) => (
              <optgroup key={g.key} label={g.label}>
                <option value={`${GROUP_PREFIX}${g.key}`}>All {g.label}</option>
                {g.actions.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </FormField>
          <FilterActions dirty={dirty} canReset={canReset} onReset={resetFilters} />
        </form>

        <DataTable
          // A STATIC CARD (§5a-iii): an entry has nowhere to go, so no `to`.
          renderCard={(row) => ({
            title: row.action_label,
            subtitle: `${row.actor_name || 'Deleted account'}${roleWord(row.actor_role) ? ` · ${roleWord(row.actor_role)}` : ''}`,
            meta: dateTime(row.created_at),
          })}
          columns={columns}
          rows={rows}
          loading={loading}
          queryKey={[applied, offset]}
          error={error}
          onRetry={retry}
          page={page}
          onPageChange={goToPage}
          emptyIcon="fa-clock-rotate-left"
          emptyTitle="No entries"
          emptyMessage={emptyCopy(applied, groups)}
          emptyAction={
            canReset ? (
              <Button size="sm" onClick={resetFilters}>
                Reset
              </Button>
            ) : null
          }
        />
      </section>
    </Reveal>
  );
}
