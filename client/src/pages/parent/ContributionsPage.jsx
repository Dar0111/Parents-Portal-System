import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent contributions — READ ONLY. Tracking, not collection. There is no
// payment gateway and no parent write on this router.
//
// ONE REQUEST: GET /api/contributions/my-records. That is the child's grade
// fee list LEFT JOINed to THIS student_id only (Pending default). GET /
// returns the same fees without payment status — do not call it. GET /:id
// is unneeded. GET /:id/records is teacher/admin and would 403; it is also
// the whole-grade roster including LRNs, which a parent must not see (§5c).
//
// SKIPS THE REQUEST when user.student_id is null (Parent → Grades pattern).
// my-records returns [] for both unlinked and "no fees at this grade", so
// skipping is how the empty copy names the right cause (§5f). loading is
// cleared in the same turn as the skip.
//
// NOT A MIRROR of Teacher → Contributions. That page composes fees and marks
// a roster. Every write here is authorize('teacher','admin') → 403
// "Access denied." — so none of those controls exist.
//
// No "Pay now". No Download Statement (KNOWN ISSUES — the endpoint does not
// exist). No overdue verdict from due_date (convention 4).

function formatAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

export default function ParentContributionsPage() {
  usePageTitle('Contributions');
  const { user } = useAuth();
  const studentId = user?.student_id ?? null;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (studentId == null) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setRows(await api.get('/contributions/my-records', { unwrap: 'records' }));
    } catch (err) {
      setError(extractError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const empty =
    studentId == null
      ? {
          icon: 'fa-link-slash',
          title: "Your account isn't linked to a student record yet",
          message:
            "Ask the school office to link your account so you can see contributions for your child's grade.",
        }
      : {
          icon: 'fa-peso-sign',
          title: 'No contributions posted for this grade yet',
          message: "When a teacher posts a contribution for your child's grade, it appears here with Paid or Pending.",
        };

  const columns = useMemo(
    () => [
      { key: 'title', header: 'Contribution', sortable: true },
      {
        key: 'fee_amount',
        header: 'Fee',
        sortable: true,
        sortValue: (row) => Number(row.fee_amount),
        render: (row) => <span className="tabular-nums">₱{formatAmount(row.fee_amount)}</span>,
      },
      {
        key: 'amount',
        header: 'Amount due',
        sortable: true,
        sortValue: (row) => Number(row.amount),
        render: (row) => <span className="tabular-nums">₱{formatAmount(row.amount)}</span>,
      },
      {
        key: 'due_date',
        header: 'Due',
        sortable: true,
        render: (row) => row.due_date || <span className="text-slate-400">No due date</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <StatusBadge status={row.status} />,
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        This list shows contributions for your child&rsquo;s grade and whether this child is marked
        Paid or Pending. Payment is collected at school — not through this page.
      </p>
      <DataTable
        columns={columns}
        rows={rows}
        keyField="contribution_id"
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon={empty.icon}
        emptyTitle={empty.title}
        emptyMessage={empty.message}
      />
    </div>
  );
}
