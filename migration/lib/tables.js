// The 25 tables, their columns in schema.sql order, and how each value crosses
// from MySQL to PostgreSQL. ONE place, read by the transfer, the reconciliation
// and the inspection script, so the three cannot disagree about a column.
//
// kind:
//   id        INT UNSIGNED AUTO_INCREMENT id -> integer identity (value kept)
//   int       integer / smallint (numbers pass through; mysql2 gives numbers)
//   bool01    TINYINT(1) 0/1 -> smallint 0/1 (NOT boolean; the API keeps 0/1)
//   dec       DECIMAL(5,2) -> numeric(5,2); mysql2 string -> pg string
//   text      VARCHAR / TEXT / CHAR / ENUM labels (strings pass through)
//   date      DATE -> date; 'YYYY-MM-DD' string in, same string out
//   ts        TIMESTAMP -> timestamptz(0); read in UTC session time and sent as
//             'YYYY-MM-DD HH:MM:SS+00:00'
//   ts3       TIMESTAMP(3) -> timestamptz(3); same with milliseconds
//
// ORDER: parents before children where it is possible; the users <-> students
// cycle is why the transfer defers every FK for the length of its one
// transaction, so the order below is for readability, not correctness.

const T = (name, columns, opts = {}) => ({ name, columns, sequence: opts.sequence !== false, ...opts });
const c = (name, kind) => ({ name, kind });

const TABLES = [
  T('users', [
    c('id', 'id'), c('login_id', 'text'), c('password', 'text'), c('role', 'text'), c('status', 'text'), c('name', 'text'),
    c('email', 'text'), c('email_verified_at', 'ts'), c('password_changed_at', 'ts3'), c('token_version', 'int'),
    c('must_change_password', 'bool01'), c('contact_number', 'text'), c('contact_verified_at', 'ts'), c('profile_pic', 'text'),
    c('student_id', 'int'), c('created_by', 'int'), c('approved_by', 'int'), c('rejection_reason', 'text'),
    c('created_at', 'ts'), c('updated_at', 'ts'),
  ]),
  T('sections', [
    c('id', 'id'), c('name', 'text'), c('grade_level', 'int'), c('adviser_id', 'int'), c('school_year', 'text'),
    c('created_at', 'ts'), c('updated_at', 'ts'),
  ]),
  T('students', [
    c('id', 'id'), c('lrn', 'text'), c('first_name', 'text'), c('last_name', 'text'), c('grade_level', 'int'), c('section', 'text'),
    c('section_id', 'int'), c('birthday', 'date'), c('gender', 'text'), c('address', 'text'), c('contact_number', 'text'),
    c('status', 'text'), c('created_by', 'int'), c('created_at', 'ts'), c('updated_at', 'ts'),
  ]),
  T('subjects', [c('id', 'id'), c('name', 'text'), c('grade_level', 'int'), c('display_order', 'int')]),
  T('teacher_assignments', [
    c('id', 'id'), c('teacher_id', 'int'), c('subject_id', 'int'), c('grade_level', 'int'), c('section', 'text'), c('section_id', 'int'),
  ]),
  T('grade_weight_configs', [
    c('id', 'id'), c('subject_id', 'int'), c('school_year', 'text'), c('ww_weight', 'dec'), c('pt_weight', 'dec'), c('ex_weight', 'dec'),
  ]),
  T('grades', [
    c('id', 'id'), c('student_id', 'int'), c('subject_id', 'int'), c('term', 'int'), c('school_year', 'text'),
    c('ww_percentage', 'dec'), c('ww_weighted', 'dec'), c('pt_percentage', 'dec'), c('pt_weighted', 'dec'),
    c('ex_st1', 'dec'), c('ex_st1_max', 'dec'), c('ex_st2', 'dec'), c('ex_st2_max', 'dec'), c('ex_te', 'dec'), c('ex_te_max', 'dec'),
    c('ex_percentage', 'dec'), c('ex_weighted', 'dec'), c('initial_grade', 'dec'), c('term_grade', 'dec'), c('descriptive_grade', 'text'),
    c('is_locked', 'bool01'), c('acknowledged', 'bool01'), c('acknowledged_at', 'ts'), c('created_at', 'ts'), c('updated_at', 'ts'),
  ]),
  T('assessment_slots', [
    c('id', 'id'), c('subject_id', 'int'), c('grade_level', 'int'), c('section', 'text'), c('term', 'int'), c('school_year', 'text'),
    c('type', 'text'), c('slot_no', 'int'), c('name', 'text'), c('max_score', 'dec'), c('created_at', 'ts'), c('updated_at', 'ts'),
  ]),
  T('grade_components', [
    c('id', 'id'), c('grade_id', 'int'), c('slot_id', 'int'), c('type', 'text'), c('score', 'dec'), c('max_score', 'dec'),
    c('label', 'text'), c('date_recorded', 'date'), c('created_at', 'ts'),
  ]),
  T('transmutation_table', [c('id', 'id'), c('school_year', 'text'), c('ig_min', 'dec'), c('ig_max', 'dec'), c('transmuted_grade', 'int')]),
  T('grading_mode_configs', [c('id', 'id'), c('grade_level', 'int'), c('school_year', 'text'), c('mode', 'text')]),
  T('attendance', [
    c('id', 'id'), c('student_id', 'int'), c('date', 'date'), c('status', 'text'), c('recorded_by', 'int'), c('created_at', 'ts'), c('updated_at', 'ts'),
  ]),
  T('excuse_letters', [
    c('id', 'id'), c('student_id', 'int'), c('parent_id', 'int'), c('absence_date', 'date'), c('reason', 'text'), c('details', 'text'),
    c('attachment_url', 'text'), c('status', 'text'), c('teacher_remarks', 'text'), c('reviewed_by', 'int'), c('created_at', 'ts'), c('updated_at', 'ts'),
  ]),
  T('messages', [
    c('id', 'id'), c('sender_id', 'int'), c('receiver_id', 'int'), c('body', 'text'), c('read_status', 'bool01'), c('created_at', 'ts'),
  ]),
  T('announcements', [
    c('id', 'id'), c('title', 'text'), c('content', 'text'), c('category', 'text'), c('target_grade', 'int'), c('target_section', 'text'),
    c('section_id', 'int'), c('attachment_url', 'text'), c('posted_by', 'int'), c('created_at', 'ts'),
  ]),
  T('memos', [c('id', 'id'), c('title', 'text'), c('content', 'text'), c('attachment_url', 'text'), c('posted_by', 'int'), c('created_at', 'ts')]),
  T('events', [
    c('id', 'id'), c('title', 'text'), c('description', 'text'), c('event_date', 'date'), c('target_grade', 'int'), c('posted_by', 'int'), c('created_at', 'ts'),
  ]),
  T('activity_logs', [c('id', 'id'), c('user_id', 'int'), c('action', 'text'), c('description', 'text'), c('created_at', 'ts')]),
  T('system_settings', [c('id', 'id'), c('setting_key', 'text'), c('setting_value', 'text')]),
  T('backups', [c('id', 'id'), c('filename', 'text'), c('file_path', 'text'), c('file_size', 'int'), c('created_by', 'int'), c('created_at', 'ts')]),
  T('auth_security_state', [c('id', 'int'), c('token_valid_after', 'ts')], { sequence: false }),
  T('notifications', [
    c('id', 'id'), c('user_id', 'int'), c('type', 'text'), c('item_type', 'text'), c('item_id', 'int'), c('title_snapshot', 'text'),
    c('actor_id', 'int'), c('created_at', 'ts'), c('read_at', 'ts'),
  ]),
  T('auth_codes', [
    c('id', 'id'), c('user_id', 'int'), c('purpose', 'text'), c('code_hash', 'text'), c('email_snapshot', 'text'), c('contact_snapshot', 'text'),
    c('expires_at', 'ts'), c('attempts', 'int'), c('consumed_at', 'ts'), c('request_ip', 'text'), c('created_at', 'ts'),
  ]),
  T('policy_acceptances', [
    c('id', 'id'), c('user_id', 'int'), c('document', 'text'), c('version', 'text'), c('student_id', 'int'), c('accepted_at', 'ts'),
  ]),
  T('login_attempts', [c('id', 'id'), c('login_key', 'text'), c('ip', 'text'), c('cleared', 'bool01'), c('attempted_at', 'ts')]),
];

// Sensitive columns: never printed by any script, even on a mismatch — a
// reconciliation names the table and the primary key only.
const NEVER_PRINT = new Set([
  'users.login_id', 'users.password', 'users.name', 'users.email', 'users.contact_number', 'users.rejection_reason',
  'students.lrn', 'students.first_name', 'students.last_name', 'students.address', 'students.contact_number',
  'activity_logs.description', 'messages.body', 'excuse_letters.reason', 'excuse_letters.details', 'excuse_letters.teacher_remarks',
  'auth_codes.code_hash', 'auth_codes.email_snapshot', 'auth_codes.contact_snapshot', 'auth_codes.request_ip',
  'login_attempts.login_key', 'login_attempts.ip', 'backups.file_path',
]);

// --- value conversion MySQL (read as strings in UTC) -> pg parameter --------
const TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;

function toPg(kind, value, where) {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case 'id':
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new Error(`${where}: not an integer`);
      return n;
    }
    case 'bool01': {
      const n = Number(value);
      if (n !== 0 && n !== 1) throw new Error(`${where}: boolean-like value outside 0/1`);
      return n;
    }
    case 'dec':
      if (!/^-?\d+(\.\d+)?$/.test(String(value))) throw new Error(`${where}: not a decimal string`);
      return String(value);
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(`${where}: not a YYYY-MM-DD date`);
      if (/^0000|-00-|-00$/.test(String(value))) throw new Error(`${where}: zero date part (invalid in PostgreSQL)`);
      return String(value);
    case 'ts':
    case 'ts3':
      if (!TS_RE.test(String(value))) throw new Error(`${where}: not a MySQL timestamp string`);
      if (/^0000/.test(String(value))) throw new Error(`${where}: zero timestamp (invalid in PostgreSQL)`);
      return `${value}+00:00`;
    case 'text':
      return String(value);
    default:
      throw new Error(`${where}: unknown kind ${kind}`);
  }
}

// --- canonical form for reconciliation (both sides reduce to the same text) --
// MySQL side: strings as read (UTC session). pg side: strings from a SELECT
// that casts every column to text in UTC (see reconcile.js). The canonical
// form strips what legitimately differs in rendering only.
function canonical(kind, value) {
  if (value === null || value === undefined) return '\\N';
  const s = String(value);
  switch (kind) {
    case 'dec': {
      const n = Number(s);
      return Number.isFinite(n) ? n.toFixed(2) : s;
    }
    case 'ts':
    case 'ts3': {
      // '2026-10-13 16:39:44', '2026-10-13 16:39:44.312', '2026-10-13 16:39:44+00', '…Z'
      const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(?:\+00(?::?00)?|Z)?$/);
      if (!m) return s;
      const frac = m[3] ? m[3].replace(/0+$/, '') : '';
      return `${m[1]} ${m[2]}${frac === '.' ? '' : frac}`;
    }
    case 'bool01':
    case 'int':
    case 'id':
      return String(Number(s));
    default:
      return s;
  }
}

module.exports = { TABLES, NEVER_PRINT, toPg, canonical };
