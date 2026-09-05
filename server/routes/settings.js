const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();

// The only keys this API will ever read or write. An open key-value write
// endpoint is a way to smuggle junk into the database — every write is
// checked against this list before anything touches a query.
const ALLOWED_KEYS = ['school_name', 'school_address', 'academic_year', 'current_term', 'logo_url'];

function validateNonEmpty(fieldName) {
  return (value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return `${fieldName} must not be empty.`;
    }
    return null;
  };
}

function validateAcademicYear(value) {
  if (typeof value !== 'string') {
    return 'academic_year must be a string.';
  }
  const match = value.match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    return 'academic_year must match YYYY-YYYY.';
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (second !== first + 1) {
    return 'academic_year must span two consecutive years (e.g. 2026-2027).';
  }
  return null;
}

// current_term's accepted values used to be read live from grades.quarter's
// ENUM via INFORMATION_SCHEMA, specifically because the quarter-vs-term
// question was provisional (CLAUDE.md's old Blocked section). DO 009 s.2026
// has since confirmed three terms, not four quarters — that's a settled
// DepEd fact now, not a placeholder — so the live-introspection indirection
// no longer earns its complexity. grades.term is also a TINYINT + CHECK now,
// not an ENUM, so there is nothing left to introspect anyway.
function validateCurrentTerm(value) {
  const allowed = ['1', '2', '3'];
  if (typeof value !== 'string' || !value) {
    return 'current_term must not be empty.';
  }
  if (!allowed.includes(value)) {
    return `current_term must be one of: ${allowed.join(', ')}.`;
  }
  return null;
}

function validateLogoUrl(value) {
  if (typeof value !== 'string') {
    return 'logo_url must be a string.';
  }
  return null; // may be empty — no logo uploaded yet is a valid state
}

const VALIDATORS = {
  school_name: validateNonEmpty('school_name'),
  school_address: validateNonEmpty('school_address'),
  academic_year: validateAcademicYear,
  current_term: validateCurrentTerm,
  logo_url: validateLogoUrl,
};

async function validateSetting(key, value) {
  return VALIDATORS[key](value);
}

// GET /api/settings — all roles, read-only. Filtered by the same allow-list
// writes are checked against — without this WHERE, this returns every row in
// the table regardless of ALLOWED_KEYS, which would expose anything that
// ever lands there by any other means (e.g. an internal-only key like
// token_valid_after, never meant to be readable by non-admin roles) to
// every authenticated role, parents included.
router.get('/', authenticate, async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (?)', [
      ALLOWED_KEYS,
    ]);
    const settings = {};
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value;
    }
    return res.json({ success: true, settings });
  } catch (error) {
    console.error('List settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
  }
});

// GET /api/settings/:key — all roles, read-only. :key is a string, not a
// numeric id — parseId doesn't apply. Allow-list membership is the guard;
// anything else is a 404, same as any other unknown single-resource read.
router.get('/:key', authenticate, async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.includes(key)) {
    return res.status(404).json({ success: false, message: 'Setting not found.' });
  }

  try {
    const [rows] = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1', [
      key,
    ]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Setting not found.' });
    }
    return res.json({ success: true, key, value: rows[0].setting_value });
  } catch (error) {
    console.error('Get setting error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch setting.' });
  }
});

// PUT /api/settings/:key — admin only, update one
router.put('/:key', authenticate, authorize('admin'), async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (!ALLOWED_KEYS.includes(key)) {
    return res.status(400).json({
      success: false,
      message: `Unknown setting key. Allowed keys: ${ALLOWED_KEYS.join(', ')}.`,
    });
  }

  const error = await validateSetting(key, value);
  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  try {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, value]
    );

    await logActivity(req.user.id, 'update_setting', `Updated setting "${key}" to "${value}"`);

    return res.json({ success: true, message: 'Setting updated.', key, value });
  } catch (error) {
    console.error('Update setting error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update setting.' });
  }
});

// PATCH /api/settings — admin only, update several at once. All-or-nothing:
// every key checked against the allow-list and every value validated before
// anything is written, then written in one transaction — same reasoning as
// POST /api/attendance/bulk.
router.patch('/', authenticate, authorize('admin'), async (req, res) => {
  const { settings } = req.body;

  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || !Object.keys(settings).length) {
    return res.status(400).json({
      success: false,
      message: 'settings must be a non-empty object of key/value pairs.',
    });
  }

  const keys = Object.keys(settings);
  const unknownKeys = keys.filter((k) => !ALLOWED_KEYS.includes(k));
  if (unknownKeys.length) {
    return res.status(400).json({
      success: false,
      message: `Unknown setting key(s): ${unknownKeys.join(', ')}. Allowed keys: ${ALLOWED_KEYS.join(', ')}.`,
    });
  }

  for (const key of keys) {
    const error = await validateSetting(key, settings[key]);
    if (error) {
      return res.status(400).json({ success: false, message: `${key}: ${error}` });
    }
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    for (const key of keys) {
      await conn.query(
        `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, settings[key]]
      );
    }

    await conn.commit();

    const [rows] = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const updated = {};
    for (const row of rows) {
      updated[row.setting_key] = row.setting_value;
    }

    await logActivity(req.user.id, 'update_settings_bulk', `Updated settings: ${keys.join(', ')}`);

    return res.json({ success: true, message: 'Settings updated.', settings: updated });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore rollback failure — connection is being released regardless
      }
    }
    console.error('Bulk update settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update settings.' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
