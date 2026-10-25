const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { ACTION_GROUPS, OTHER_GROUP, actionInfo, groupCodes, groupLabel, knownCodes } = require('../utils/activityActions');
const { isRealDate, manilaDayStart, manilaDayEnd, manilaParts, manilaToday } = require('../utils/manilaTime');
const { buildCsv } = require('../utils/csv');
const { refuseNul } = require('../utils/requestLimits');

const router = express.Router();
router.use(refuseNul);

// THE ACTIVITY LOG (feat/activity-log, B2 — the owner's decision D-21,
// 2026-10-16): the admin reads activity_logs by date, account role and action,
// and downloads the same set as a CSV. Three handlers, admin only.
//
// THE DESCRIPTION IS NEVER SELECTED (the owner's Q1 (a)). Its templates can
// hold a typed title, a person's name, a setting's value, a login id (three
// writers until 2026-10-23) and an LRN (six writers until 2026-09-18), and old
// rows keep old wording. So no statement here names the column, and an entry
// is exactly the seven fields `entryOf` builds: the row id, the instant, the
// action code with its label and group (utils/activityActions.js), and the
// account's name and role. Never `user_id`, never a login id — a parent's
// login id IS the child's LRN (§5c).
//
// "Account" is the account the row names: who acted, except for a failed
// sign-in, a reset request and a password alert, where it is the account
// concerned — the page says so. A NULL user_id is a deleted account (every
// writer passes an id; the FK is ON DELETE SET NULL), shown as "Deleted
// account" and filtered as role=deleted.
//
// NEWEST FIRST, ALWAYS: `created_at`, then `id` — not `id` alone, because the
// three rows dated 2026-09-21 by the clock test sit out of id order (CLAUDE.md:
// do not "fix" those timestamps). No sort parameter is accepted.
//
// Days are MANILA days on a TIMESTAMP (utils/manilaTime.js): `from` is that
// day's first instant, `to` the first instant after it.
//
// No index on created_at (B2's survey, 2026-10-23: a page cost about 0.2 s at
// 29,000 rows — docs/KNOWN_ISSUES.md has the trigger).

const ROLES = ['admin', 'teacher', 'parent', 'deleted'];
const ROLE_WORDS = { admin: 'Admin', teacher: 'Teacher', parent: 'Parent' };
const ACTION_SHAPE = /^[a-z_]{1,50}$/;
const EXPORT_CAP = 50000;

const FROM = 'FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id';
const COLUMNS = 'a.id, a.created_at, a.action, u.name AS actor_name, u.role AS actor_role';
const ORDER = 'ORDER BY a.created_at DESC, a.id DESC';

const CSV_HEADER = ['Entry', 'Date', 'Time (Philippine time)', 'Account', 'Role', 'Group', 'Action', 'Action code'];

function placeholders(list) {
  return list.map(() => '?').join(', ');
}

// The one reading of the filters, shared by the list and the export.
// Returns { where, params, applied } or { error } (the 400 message).
function readFilters(query) {
  const { from, to, role, action, group } = query;
  for (const [name, value] of [['from', from], ['to', to]]) {
    if (value !== undefined && !isRealDate(value)) {
      return { error: `${name} must be a real date in YYYY-MM-DD format.` };
    }
  }
  if (from !== undefined && to !== undefined && from > to) {
    return { error: 'from must be on or before to.' };
  }
  if (role !== undefined && !ROLES.includes(role)) {
    return { error: "role must be 'admin', 'teacher', 'parent' or 'deleted'." };
  }
  if (action !== undefined && group !== undefined) {
    return { error: 'Send action or group, not both.' };
  }
  if (action !== undefined && (typeof action !== 'string' || !ACTION_SHAPE.test(action))) {
    return { error: 'action must be an action code: lower-case letters and underscores.' };
  }
  let groupList = null;
  if (group !== undefined && group !== OTHER_GROUP.key) {
    groupList = typeof group === 'string' ? groupCodes(group) : null;
    if (!groupList) {
      const keys = [...ACTION_GROUPS.map((g) => g.key), OTHER_GROUP.key];
      return { error: `group must be one of: ${keys.join(', ')}.` };
    }
  }

  const conditions = [];
  const params = [];
  if (from !== undefined) {
    conditions.push('a.created_at >= ?');
    params.push(manilaDayStart(from));
  }
  if (to !== undefined) {
    conditions.push('a.created_at < ?');
    params.push(manilaDayEnd(to));
  }
  if (role === 'deleted') {
    conditions.push('a.user_id IS NULL');
  } else if (role !== undefined) {
    conditions.push('u.role = ?');
    params.push(role);
  }
  if (action !== undefined) {
    conditions.push('a.action = ?');
    params.push(action);
  }
  if (groupList) {
    conditions.push(`a.action IN (${placeholders(groupList)})`);
    params.push(...groupList);
  }
  if (group === OTHER_GROUP.key) {
    const known = knownCodes();
    conditions.push(`a.action NOT IN (${placeholders(known)})`);
    params.push(...known);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    applied: { from, to, role, action, group },
  };
}

function entryOf(row) {
  const info = actionInfo(row.action);
  return {
    id: row.id,
    created_at: row.created_at,
    action: row.action,
    action_label: info.label,
    action_group: info.group,
    actor_name: row.actor_name ?? null,
    actor_role: row.actor_role ?? null,
  };
}

function exportCapMessage(total) {
  return (
    `This filter matches ${total.toLocaleString('en-US')} entries; a download holds at most ` +
    `${EXPORT_CAP.toLocaleString('en-US')}. Narrow the dates or add a filter.`
  );
}

async function countFiltered(filters) {
  const {
    rows: [row],
  } = await pool.query(`SELECT COUNT(*) AS total ${FROM} ${filters.where}`, filters.params);
  return Number(row.total);
}

// GET /api/activity-logs — one page, newest first. `export_limit` carries the
// download's cap and, when this filter is over it, the server's own refusal,
// so the page can say it without sending a request that would be refused.
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  if (req.query.sort !== undefined || req.query.order !== undefined) {
    return res.status(400).json({ success: false, message: 'This list is always newest first; sort and order are not accepted.' });
  }
  const page = parsePagination(req.query);
  if (page.error) {
    return res.status(400).json({ success: false, message: page.error });
  }
  const filters = readFilters(req.query);
  if (filters.error) {
    return res.status(400).json({ success: false, message: filters.error });
  }

  try {
    // total counts the FILTERED set (C4) — same WHERE, same params.
    const total = await countFiltered(filters);
    const { rows } = await pool.query(`SELECT ${COLUMNS} ${FROM} ${filters.where} ${ORDER} LIMIT ? OFFSET ?`, [
      ...filters.params,
      page.limit,
      page.offset,
    ]);
    return res.json({
      success: true,
      entries: rows.map(entryOf),
      page: pageMeta({ limit: page.limit, offset: page.offset, total }),
      export_limit: { max: EXPORT_CAP, message: total > EXPORT_CAP ? exportCapMessage(total) : null },
    });
  } catch (error) {
    console.error('List activity log error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch the activity log.' });
  }
});

// GET /api/activity-logs/actions — the filter's options: every group and code
// in the map, then Other with any code the table holds that the map does not
// know (its own code as its label).
router.get('/actions', authenticate, authorize('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT DISTINCT action FROM activity_logs');
    const known = new Set(knownCodes());
    const unknown = rows
      .map((r) => r.action)
      .filter((code) => !known.has(code))
      .sort();
    const groups = ACTION_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      actions: g.actions.map((a) => ({ code: a.code, label: a.label })),
    }));
    if (unknown.length) {
      groups.push({ key: OTHER_GROUP.key, label: OTHER_GROUP.label, actions: unknown.map((code) => ({ code, label: code })) });
    }
    return res.json({ success: true, groups });
  } catch (error) {
    console.error('Activity log actions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch the activity log actions.' });
  }
});

// GET /api/activity-logs/export — the same filters, every matching entry as a
// CSV (utils/csv.js: BOM, RFC 4180, the formula guard), newest first, times in
// Manila whatever the host's zone. Over EXPORT_CAP it refuses rather than cut
// the set short: a report missing its oldest rows reads as complete.
//
// A DOWNLOAD IS LOGGED (the owner's Q8), like download_backup: the count, the
// dates and the filter codes — validated shapes, never typed text. Reading a
// page of the list is not logged; it is a read.
router.get('/export', authenticate, authorize('admin'), async (req, res) => {
  for (const key of ['sort', 'order', 'limit', 'offset']) {
    if (req.query[key] !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'A download holds the whole filtered set, newest first; sort, order, limit and offset are not accepted.',
      });
    }
  }
  const filters = readFilters(req.query);
  if (filters.error) {
    return res.status(400).json({ success: false, message: filters.error });
  }

  try {
    const total = await countFiltered(filters);
    if (total > EXPORT_CAP) {
      return res.status(400).json({ success: false, message: exportCapMessage(total) });
    }
    const { rows } = await pool.query(`SELECT ${COLUMNS} ${FROM} ${filters.where} ${ORDER} LIMIT ?`, [
      ...filters.params,
      EXPORT_CAP,
    ]);
    const csv = buildCsv(
      CSV_HEADER,
      rows.map((row) => {
        const info = actionInfo(row.action);
        const at = manilaParts(row.created_at);
        return [
          row.id,
          at ? at.date : '',
          at ? at.time : '',
          row.actor_name ?? 'Deleted account',
          ROLE_WORDS[row.actor_role] || '',
          groupLabel(info.group),
          info.label,
          row.action,
        ];
      })
    );

    const { from, to, role, action, group } = filters.applied;
    const filename = `activity-log_${from || 'beginning'}_to_${to || manilaToday()}.csv`;
    const scope = [role && `role ${role}`, action && `action ${action}`, group && `group ${group}`].filter(Boolean);
    await logActivity(
      req.user.id,
      'export_activity_log',
      `Downloaded ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}: ${from || 'beginning'} to ${to || 'today'}` +
        (scope.length ? `, ${scope.join(', ')}` : '')
    );

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    });
    return res.send(csv);
  } catch (error) {
    console.error('Export activity log error:', error);
    return res.status(500).json({ success: false, message: 'Failed to build the activity log download.' });
  }
});

module.exports = router;
