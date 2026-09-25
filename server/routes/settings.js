const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { validateEmail } = require('../utils/emailRule');

const router = express.Router();

// The only keys this API will ever read or write. An open key-value write
// endpoint is a way to smuggle junk into the database — every write is
// checked against this list before anything touches a query.
//
// The four school_* keys after logo_url arrived with pre-Stage-5 #5a
// (2026-09-26): the DepEd School ID, the school's DepEd email, its phone and
// its Facebook page had nowhere to live, and the About page reads them.
const ALLOWED_KEYS = [
  'school_name',
  'school_address',
  'academic_year',
  'current_term',
  'logo_url',
  'school_id',
  'school_email',
  'school_phone',
  'facebook_page',
];

// The subset an UNAUTHENTICATED caller may read (GET /public): what the
// school prints on its own gate. Never academic_year, current_term or
// logo_url — not secrets, but not the public face either, and a public
// endpoint should carry exactly what it exists for.
const PUBLIC_KEYS = ['school_name', 'school_address', 'school_id', 'school_email', 'school_phone', 'facebook_page'];

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

// The DepEd School ID is a six-digit number (136893 here). Optional so an
// install without one is a valid state; if given, exactly six digits.
function validateSchoolId(value) {
  if (typeof value !== 'string') return 'school_id must be a string.';
  if (value === '') return null;
  return /^\d{6}$/.test(value) ? null : 'school_id must be exactly 6 digits.';
}

// The one email rule (utils/emailRule.js), adapted to this file's
// string-or-null convention. Optional.
function validateSchoolEmail(value) {
  if (typeof value !== 'string') return 'school_email must be a string.';
  return validateEmail(value).error;
}

// A LANDLINE OR A MOBILE — not the contact rule. The school's number is
// 3506114, seven digits, so the 09-prefixed eleven-digit mobile shape that
// utils/contactRule.js enforces for people would refuse the school's own
// phone. Spaces, dashes, parentheses and a leading + are stripped; what is
// left must be 7 to 15 digits. Stored as typed (trimmed) — the display is a
// tel: link, and a formatted number reads better than a digit run.
function validateSchoolPhone(value) {
  if (typeof value !== 'string') return 'school_phone must be a string.';
  if (value === '') return null;
  const digits = value.replace(/^\+/, '').replace(/[\s\-().]/g, '');
  return /^\d{7,15}$/.test(digits) ? null : 'school_phone must be 7 to 15 digits (spaces and dashes allowed).';
}

// A page name or a URL; the school has not given one yet, so the seed is
// blank and no format is invented. Length is the column's practical limit.
function validateFacebookPage(value) {
  if (typeof value !== 'string') return 'facebook_page must be a string.';
  return value.length <= 255 ? null : 'facebook_page must be 255 characters or fewer.';
}

const VALIDATORS = {
  school_name: validateNonEmpty('school_name'),
  school_address: validateNonEmpty('school_address'),
  academic_year: validateAcademicYear,
  current_term: validateCurrentTerm,
  logo_url: validateLogoUrl,
  school_id: validateSchoolId,
  school_email: validateSchoolEmail,
  school_phone: validateSchoolPhone,
  facebook_page: validateFacebookPage,
};

// A key in ALLOWED_KEYS with no validator used to be a TypeError — a 500 —
// the day someone added the key and forgot the function. Both callers
// allow-list first, so this is a backstop that answers 400 instead.
async function validateSetting(key, value) {
  const validator = VALIDATORS[key];
  if (!validator) return 'Unknown setting key.';
  return validator(value);
}

// Trimmed once, where a value enters, and that trimmed value is the one
// validated, stored, echoed and logged. The validators always checked
// value.trim() while the INSERT wrote the raw value, so "  name  " passed as
// "name" and was saved with its spaces. Non-strings pass through untouched —
// the validators reject them.
function normalizeValue(value) {
  return typeof value === 'string' ? value.trim() : value;
}

// Every read of the whole table goes through the allow-list. Without the
// WHERE, a read returns every row regardless of ALLOWED_KEYS, exposing
// anything that ever lands there by other means (e.g. an internal-only key
// like token_valid_after). GET / was fixed for that on 2026-08-29 and the
// PATCH response kept the unfiltered query until 2026-09-15 — one function
// both use is what stops them drifting apart again.
async function readAllowedSettings() {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (?)', [
    ALLOWED_KEYS,
  ]);
  const settings = {};
  for (const row of rows) {
    settings[row.setting_key] = row.setting_value;
  }
  return settings;
}

// GET /api/settings — all roles, read-only, allow-listed (readAllowedSettings).
router.get('/', authenticate, async (_req, res) => {
  try {
    const settings = await readAllowedSettings();
    return res.json({ success: true, settings });
  } catch (error) {
    console.error('List settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
  }
});

// GET /api/settings/public — NO AUTH (pre-Stage-5 #5a). The public About
// page (/about, reachable from the login screen) shows the school's name,
// address, DepEd School ID, email, phone and Facebook page — the details on
// the school's own gate — and a signed-out visitor cannot call GET /. This
// returns PUBLIC_KEYS and nothing else.
//
// REGISTERED BEFORE `/:key`, or Express parses "public" as a setting key and
// answers 404 "Setting not found." — the same route-order trap
// routes/grades.js documents for `class-record`.
router.get('/public', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (?)', [
      PUBLIC_KEYS,
    ]);
    const settings = {};
    for (const key of PUBLIC_KEYS) settings[key] = '';
    for (const row of rows) settings[row.setting_key] = row.setting_value;
    return res.json({ success: true, settings });
  } catch (error) {
    console.error('Public settings error:', error);
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
  const value = normalizeValue(req.body.value);

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

  const normalized = {};
  for (const key of keys) {
    normalized[key] = normalizeValue(settings[key]);
  }

  for (const key of keys) {
    const error = await validateSetting(key, normalized[key]);
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
        [key, normalized[key]]
      );
    }

    await conn.commit();

    const updated = await readAllowedSettings();

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
