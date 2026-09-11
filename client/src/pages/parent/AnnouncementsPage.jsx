import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import { useAuth } from '../../auth/AuthContext';
import { usePageTitle } from '../../layout/usePageTitle';

// Parent announcements — READ ONLY, and every absence below is deliberate.
//
// NO COMPOSE, EDIT OR DELETE. POST/PUT/DELETE on /api/announcements are all
// authorize('teacher', 'admin'), so a parent never reaches a handler: the
// middleware answers 403 "Access denied." first — a generic refusal with no
// reason in it, which is exactly why offering the control would be worse than
// a scope refusal that at least explains itself. Same anti-dead-end rule as
// the Students page's absent Edit button.
//
// FULL TEXT OPENS IN A MODAL, NOT A DETAIL ROUTE, because there is no
// GET /api/announcements/:id at all — a direct request answers 404 "Route not
// found." from server.js's app-level fallback. A detail route would therefore
// have to fetch the whole collection and filter client-side to render one
// item. This is the Excuse Letters modal decision in a stronger form: there
// GET /:id existed and returned less than a list row, here it does not exist.
// The row already carries every column the endpoint returns (SELECT a.*), so
// the modal costs no request.
//
// THE TERM "CLASS BOARD" APPEARS NOWHERE ON SCREEN, on purpose. A Class Board
// post is identified by its shape alone (teacher-posted, both target columns
// set) and a teacher's only legal target IS an exact section — so a teacher's
// announcements simply are Class Board posts, and naming the mechanism to a
// parent would invent a UI concept for something that reads as "a post from
// your child's teacher".
//
// NO FILTERS. grade_level and section are AND-ed straight onto the target
// columns, so `a.target_grade = 6` is FALSE for a school-wide post — for a
// parent those params can only hide the school's own posts, which is not a
// question anyone has. `category` is unvalidated free text with no allow-list,
// so a dropdown would mean guessing an enum. Sortable columns are the find-it
// affordance instead.
//
// NOT RENDERED: `attachment_url` (column exists, nothing uploads — an
// affordance would promise a missing feature). `posted_by` is still on the
// row and is still not shown: the three teacher pages authorize edits with
// row.posted_by === user?.id, so the id stays in the payload. The name is
// posted_by_name, INNER JOINed 2026-09-11 (71d23f9); this page renders it
// in the modal only (2026-09-12). `/auth/me` no longer returns `lrn`
// (a582bd8, 2026-09-12). `login_id` is still the LRN and is still not
// rendered here (convention 5c).
//
// AUDIENCE LABELS ARE DERIVED FROM THE TARGET COLUMNS' NULLNESS, never from
// user.grade_level / user.section — which /auth/me does return. Declining to
// use them is the deliberate half: naming "Grade 6 - Malikhain" teaches a
// parent the routing model in exchange for nothing they can act on. Three
// cases, not two: collapsing whole-grade into "your child's class" would be
// wrong for an admin's whole-grade post, which the API explicitly permits.

function audienceLabel(row) {
  if (row.target_grade === null) return 'For everyone at the school';
  if (row.target_section === null) return "For your child's year level";
  return "For your child's class";
}

export default function ParentAnnouncementsPage() {
  usePageTitle('Announcements');
  const { user } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(null);

  // The request is ALWAYS made. user.student_id only picks which empty copy to
  // show once the list has actually come back empty — skipping the fetch
  // because the account "looks unlinked" would hide real posts behind a stale
  // AuthContext.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.get('/announcements', { unwrap: 'announcements' }));
    } catch (err) {
      setError(extractError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Empty-state copy derived from the state that produced it (convention 5f).
  // Two branches, not three, and that is a fact about this endpoint rather
  // than a gap: it accepts no filter this page sends, so there is no
  // "filter too narrow" cause to distinguish. No reset is offered in either
  // branch, because there is nothing a reset would change.
  const empty =
    user?.student_id == null
      ? {
          icon: 'fa-link-slash',
          title: "Your account isn't linked to a student record yet",
          message:
            "Ask the school office to link your account so you can see posts for your child's class.",
        }
      : {
          icon: 'fa-bullhorn',
          title: 'No announcements yet',
          message: "Posts from the school and from your child's teacher appear here.",
        };

  const columns = useMemo(
    () => [
      {
        key: 'title',
        header: 'Announcement',
        sortable: true,
        render: (row) => (
          <div>
            {/* A button in the cell, not a whole-row click: DataTable has no
                onRowClick, and adding one for the first pages that want it
                would shape a shared primitive around its callers. Same
                solution the Students page used for its detail link. */}
            <button
              type="button"
              onClick={() => setReading(row)}
              className="text-left font-medium text-slate-900 underline-offset-2 hover:underline"
            >
              {row.title}
            </button>
            <div className="line-clamp-2 max-w-xl text-xs text-slate-500">{row.content}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{audienceLabel(row)}</span>
              {row.category ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                  {/* Rendered exactly as stored. Free-text columns are outside
                      convention 5d's casing permission, which covers only
                      values whose stored form is lowercase BY SCHEMA. */}
                  {row.category}
                </span>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        key: 'created_at',
        header: 'Posted',
        sortable: true,
        render: (row) => String(row.created_at).slice(0, 10),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon={empty.icon}
        emptyTitle={empty.title}
        emptyMessage={empty.message}
      />

      <Modal
        open={Boolean(reading)}
        onClose={() => setReading(null)}
        title={reading?.title}
        size="lg"
      >
        {/* Scrolling lives here, not behind a new Modal prop: a long
            announcement would otherwise push the panel past the viewport and
            take its close button with it. */}
        <div className="max-h-[70vh] overflow-y-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{reading ? audienceLabel(reading) : null}</span>
            <span aria-hidden="true">·</span>
            <span>Posted {String(reading?.created_at).slice(0, 10)}</span>
            <span aria-hidden="true">·</span>
            <span>Posted by {reading?.posted_by_name}</span>
            {reading?.category ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{reading.category}</span>
              </>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {reading?.content}
          </p>
        </div>
      </Modal>
    </div>
  );
}
