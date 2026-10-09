const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const policy = require('../utils/policy');

// THE CONSENT GATE'S THREE ENDPOINTS (feat/privacy, 2026-10-10). All three are
// reachable while the gate is shut — middleware/auth.js lets /api/policy/*
// through for a parent who has not accepted yet, after the forced password
// change (that comes first).
const router = express.Router();

function documentView(d) {
  return { document: d.document, title: d.title, version: d.version, text: d.text };
}

// GET /api/policy — the current Data Privacy Notice and Terms of Use, every role.
router.get('/', authenticate, (_req, res) => {
  return res.json({ success: true, documents: policy.CURRENT.map(documentView) });
});

// GET /api/policy/status — this user's acceptance of each CURRENT version.
// `accepted_at` is null until accepted (and always null for staff in this
// build: staff acceptance is deferred). `required` says whether this role
// must accept at all.
router.get('/status', authenticate, async (req, res) => {
  try {
    const accepted = await policy.currentAcceptances(req.user.id);
    const count = Object.keys(accepted).length;
    return res.json({
      success: true,
      required: policy.mustAccept(req.user.role),
      policy_pending: policy.isPending(req.user.role, count),
      acceptances: policy.CURRENT.map((d) => ({
        document: d.document,
        title: d.title,
        version: d.version,
        accepted_at: accepted[d.document]?.accepted_at || null,
      })),
    });
  } catch (error) {
    console.error('Policy status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load your acceptance record.' });
  }
});

// POST /api/policy/accept — a parent accepts both documents, for themselves
// and on behalf of their child, in one request: the three ticks on the
// consent screen. Body: { versions: { privacy_notice, terms_of_use },
// on_behalf_of_child: true }.
//
// The versions must be the CURRENT ones — the text the parent was shown. A
// version that changed while the screen was open is 409, never a silent
// acceptance of words they did not read.
router.post('/accept', authenticate, authorize('parent'), async (req, res) => {
  const { versions, on_behalf_of_child: onBehalf } = req.body || {};

  for (const d of policy.CURRENT) {
    const sent = versions?.[d.document];
    if (sent === undefined || sent === null || String(sent).trim() === '') {
      return res.status(400).json({
        success: false,
        message: `Tick the box to accept the ${d.title}.`,
        field: d.document,
      });
    }
  }
  if (onBehalf !== true) {
    return res.status(400).json({
      success: false,
      message: 'Tick the box to accept on behalf of your child.',
      field: 'on_behalf_of_child',
    });
  }
  for (const d of policy.CURRENT) {
    if (String(versions[d.document]) !== d.version) {
      return res.status(409).json({
        success: false,
        message: `The ${d.title} has changed since this page opened. Read the new version, then accept again.`,
        field: d.document,
      });
    }
  }

  try {
    let inserted = 0;
    for (const d of policy.CURRENT) {
      // INSERT IGNORE on uq_policy_once: accepting a version already accepted
      // is a no-op that still answers success (a double tap, a second tab).
      const [result] = await pool.query(
        'INSERT IGNORE INTO policy_acceptances (user_id, document, version, student_id) VALUES (?, ?, ?, ?)',
        [req.user.id, d.document, d.version, req.user.student_id || null]
      );
      inserted += result.affectedRows;
    }
    if (inserted > 0) {
      // Document names and versions only — never a login id or an LRN.
      await logActivity(
        req.user.id,
        'accept_policy',
        policy.CURRENT.map((d) => `${d.document} ${d.version}`).join(', ')
      );
    }

    const accepted = await policy.currentAcceptances(req.user.id);
    return res.json({
      success: true,
      message: 'Thank you. You can now use the portal.',
      policy_pending: policy.isPending(req.user.role, Object.keys(accepted).length),
      acceptances: policy.CURRENT.map((d) => ({
        document: d.document,
        title: d.title,
        version: d.version,
        accepted_at: accepted[d.document]?.accepted_at || null,
      })),
    });
  } catch (error) {
    console.error('Policy accept error:', error);
    return res.status(500).json({ success: false, message: 'Failed to record your acceptance.' });
  }
});

module.exports = router;
