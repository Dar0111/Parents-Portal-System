// MODULE 12 (2026-10-31) — THE DEMO DATA, AS A PURE PLAN. No database, no
// environment, no password and no output: scripts/demo-load.js reads the live
// rows into a `facts` object and hands it to planLoad() below, which answers
// what would be written and what must be refused. scripts/demo-logins.js and
// scripts/test-demo-data.js run the same code with no connection at all, which
// is how the login list reaches a laptop that cannot reach the database.
//
// DETERMINISTIC. Every draw is keyed by what it is for (section, seat, subject,
// term, column), never by the order it happens to run in, so a re-run writes
// the same data and one new learner does not shift anybody else's marks.
//
// THE COMPUTATION IS THE SERVER'S OWN (utils/gradeComputation.js), called with
// the same inputs in the same order as routes/grades.js recomputeGrade — the
// precedent is scripts/demoGrade1.js. recomputeGrade is not exported, so
// test-demo-data.js proves the two agree through a real dry run of the class
// record. Nothing here types a computed value.
//
// docs/DEMO_DATA.md is the run sheet. Nothing in this file is seed data: the
// Seeded baseline in CLAUDE.md is `db:setup` alone, and the suites never see
// a row this module writes.

const gc = require('../utils/gradeComputation');
const { SCHOOL_YEAR } = require('../utils/schoolCalendar');
const { isClassDay } = require('../utils/excuseAttendance');

// ---------------------------------------------------------------------------
// THE MARKER — the three things demo-undo.js removes by
// ---------------------------------------------------------------------------
// A real LRN opens with a school id (this school's is 136893); 999900 is
// nobody's. Followed by the grade (1), the section's place in SECTIONS (2) and
// the seat (3), it is twelve digits and passes utils/lrnRule.js.
const LRN_PREFIX = '999900';
const TEACHER_PREFIX = 'DEMO-TCH-';
// The manifest: one system_settings row, invisible to the API (routes/settings.js
// reads through its allow-list) and written in the load's own transaction, so a
// restore keeps it in step with the rows it describes. Its unique key is the
// double-load guard.
const MANIFEST_KEY = 'demo_load_v1';

const SEED = 'module-12-v1';

// The last class day the attendance covers. A constant, not today: "the last
// two school weeks" must mean the same days on a re-run.
const AS_OF = '2026-10-30';
const ATTENDANCE_DAYS = 10;

// A hosted --apply needs this exact value in that one command. The same shape
// as PORTAL_FIXTURE_HOSTED, and deliberately not the same key: that one
// unlocks the staging smoke and must never unlock this.
const HOSTED_FLAG = 'PORTAL_DEMO_HOSTED';
const HOSTED_VALUE = 'production-demo-load';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

const ADMIN_LOGIN = 'ADMIN001';
const SEEDED_TEACHERS = Object.freeze(['TCH-001', 'TCH-002', 'TCH-003']);

// Four values Darryl types into one terminal; never a file (docs/DEMO_DATA.md).
const SECRET_KEYS = Object.freeze({
  teacher: 'DEMO_TEACHER_PASSWORD',
  parent: 'DEMO_PARENT_PASSWORD',
  confirmed: 'DEMO_CONFIRMED_PASSWORD',
  email: 'DEMO_CONTACT_EMAIL',
});

// A refusal is written here, for a human, and carries a section or a subject
// at most — never a name, an LRN or a value. It is the only error text the
// scripts print whole.
class Refusal extends Error {}

const t = (n) => `${TEACHER_PREFIX}${String(n).padStart(3, '0')}`;

// ---------------------------------------------------------------------------
// THE SCHOOL'S SHAPE — subjects in printed order, sections in the seed's order
// ---------------------------------------------------------------------------
// planLoad() checks both lists against the live tables, so a difference is a
// refusal rather than a silent gap.
const INTERMEDIATE = ['English', 'Mathematics', 'Filipino', 'Araling Panlipunan', 'GMRC', 'Science', 'MAPEH', 'EPP'];
const SUBJECTS = Object.freeze({
  1: ['Makabansa', 'Mathematics', 'GMRC', 'Reading and Literacy', 'Language'],
  2: ['Makabansa', 'Mathematics', 'GMRC', 'English', 'Filipino'],
  3: ['English', 'Mathematics', 'Science', 'Filipino', 'Makabansa', 'GMRC'],
  4: INTERMEDIATE,
  5: INTERMEDIATE,
  6: INTERMEDIATE,
});

const DEMO_SIZE = 30;
const OTHER_SIZE = 10;

// `demo: true` is the one 30-learner section of its grade. Grade 4's is
// Makatao, not Makabansa: Makabansa is also a subject, and a panel reading
// "Makabansa, Makabansa" on a class record should not have to ask.
const SECTIONS = Object.freeze(
  [
    { grade: 1, name: 'Matipid', adviser: t(4) },
    { grade: 1, name: 'Mabait', adviser: 'TCH-003', demo: true },
    { grade: 1, name: 'Maagap', adviser: t(5) },
    { grade: 1, name: 'Mapagmahal', adviser: t(6) },
    { grade: 2, name: 'Mapagkaibigan', adviser: t(7) },
    { grade: 2, name: 'Masikap', adviser: t(8), demo: true },
    { grade: 2, name: 'Mapagkakatiwalaan', adviser: t(9) },
    { grade: 3, name: 'Magiliw', adviser: t(10), demo: true },
    { grade: 3, name: 'Matapat', adviser: t(11) },
    { grade: 3, name: 'Masipag', adviser: t(12) },
    { grade: 3, name: 'Malinis', adviser: t(13) },
    { grade: 4, name: 'Makabansa', adviser: t(14) },
    { grade: 4, name: 'Makakalikasan', adviser: t(15) },
    { grade: 4, name: 'Makadiyos', adviser: t(16) },
    { grade: 4, name: 'Makatao', adviser: t(17), demo: true },
    { grade: 5, name: 'Mahusay', adviser: t(18) },
    { grade: 5, name: 'Masigasig', adviser: 'TCH-002', demo: true },
    { grade: 5, name: 'Masinop', adviser: t(19) },
    { grade: 5, name: 'Masunurin', adviser: t(20) },
    { grade: 6, name: 'Maunlad', adviser: t(21) },
    { grade: 6, name: 'Matatag', adviser: t(22) },
    { grade: 6, name: 'Malikhain', adviser: 'TCH-001', demo: true },
    { grade: 6, name: 'Marangal', adviser: t(23) },
  ].map((section, index) => Object.freeze({ ...section, index: index + 1, size: section.demo ? DEMO_SIZE : OTHER_SIZE }))
);

// ---------------------------------------------------------------------------
// THE 22 NEW TEACHERS — fictional, no real teacher's name
// ---------------------------------------------------------------------------
const TEACHERS = Object.freeze(
  [
    [4, 'Corazon Silangan'],
    [5, 'Alma Amihan'],
    [6, 'Gloria Liwanag'],
    [7, 'Aurora Habagat'],
    [8, 'Belen Sinag'],
    [9, 'Cecilia Himig'],
    [10, 'Editha Tanglaw'],
    [11, 'Flora Banaag'],
    [12, 'Imelda Kawayan'],
    [13, 'Josefina Alapaap'],
    [14, 'Lourdes Bahaghari'],
    [15, 'Marilou Luntian'],
    [16, 'Arnel Talampas'],
    [17, 'Bernardo Lambak'],
    [18, 'Cesar Batis'],
    [19, 'Danilo Sampaguita'],
    [20, 'Eduardo Narra'],
    [21, 'Ernesto Molave'],
    [22, 'Fernando Yakal'],
    [23, 'Gerardo Dakila'],
    [24, 'Hernan Magiting'],
    [25, 'Jaime Hiraya'],
  ].map(([n, name]) => Object.freeze({ login_id: t(n), name }))
);

// ---------------------------------------------------------------------------
// WHO TEACHES WHAT (decision 3)
// ---------------------------------------------------------------------------
// Grades 1-2 are self-contained: the adviser teaches everything.
//
// Grade 3 exchanges: each adviser takes one subject across the whole grade and
// keeps Makabansa and GMRC in their own section, so three subjects at home and
// one across the others.
const GRADE_3_EXCHANGE = Object.freeze({ English: t(10), Mathematics: t(11), Science: t(12), Filipino: t(13) });

// Grades 4-6 are departmentalized: one teacher per subject across the grade.
// TCH-002 has no row on purpose — zero assignments is that account's whole
// point. TCH-001 holds three in Grade 6, one more than decision 3's "one or
// two": the seed gave them Mathematics, English and Filipino in Malikhain, and
// the owner's Q2 keeps those and extends them across the grade. 024 and 025
// are the two subject-only teachers.
const DEPARTMENTALIZED = Object.freeze({
  4: { English: t(14), Filipino: t(14), Science: t(15), EPP: t(15), GMRC: t(16), MAPEH: t(16), Mathematics: t(17), 'Araling Panlipunan': t(17) },
  5: { English: t(18), Filipino: t(18), Mathematics: t(19), Science: t(19), 'Araling Panlipunan': t(20), GMRC: t(20), MAPEH: t(24), EPP: t(25) },
  6: {
    English: 'TCH-001',
    Mathematics: 'TCH-001',
    Filipino: 'TCH-001',
    'Araling Panlipunan': t(21),
    Science: t(22),
    GMRC: t(23),
    MAPEH: t(24),
    EPP: t(25),
  },
});

function teacherFor(section, subject) {
  if (section.grade <= 2) return section.adviser;
  if (section.grade === 3) return GRADE_3_EXCHANGE[subject] || section.adviser;
  return DEPARTMENTALIZED[section.grade][subject];
}

// Every (section, subject) with its one teacher: 155 rows, 8 of them seeded.
function assignmentMap() {
  return SECTIONS.flatMap((section) =>
    SUBJECTS[section.grade].map((subject) => ({ grade: section.grade, section: section.name, subject, teacher: teacherFor(section, subject) }))
  );
}

// ---------------------------------------------------------------------------
// THE PRE-CONFIRMED ACCOUNTS (decision 6) — 14 with the admin
// ---------------------------------------------------------------------------
// One adviser per grade, from the section the panel will open. Grade 5's is
// 019, not TCH-002: TCH-002 cannot encode anything, and 019 teaches Mathematics
// and Science in Masigasig's thirty as well as advising Masinop. 024 is the
// panel's own case: teaches MAPEH in Malikhain, advises nothing.
const CONFIRMED_NEW_TEACHERS = Object.freeze([t(8), t(10), t(17), t(19), t(24)]);
// Existing rows: confirmed only if they have no confirmed contact, and their
// password and forced-change flag are never written.
const CONFIRMED_EXISTING = Object.freeze([ADMIN_LOGIN, 'TCH-001', 'TCH-003']);

// ---------------------------------------------------------------------------
// NAMES — every one fictional (decision 2)
// ---------------------------------------------------------------------------
// Tagalog words as surnames, so nobody reads one as a real family; plain first
// names. REFUSED_* are the team and the principal: test-demo-data.js holds
// the lists to them, and a kept row carrying a team surname is renamed in the
// load (the owner's Q3).
const FIRST_NAMES = Object.freeze([
  'Aira', 'Althea', 'Angela', 'Bea', 'Bianca', 'Camille', 'Carla', 'Danica', 'Diana', 'Elaine',
  'Erika', 'Faith', 'Gabrielle', 'Hannah', 'Isabel', 'Jasmine', 'Joy', 'Karen', 'Katrina', 'Lea',
  'Lorraine', 'Maja', 'Mika', 'Nicole', 'Patricia', 'Rhea', 'Sofia', 'Trisha', 'Vanessa', 'Ysabel',
  'Adrian', 'Aldrin', 'Andrei', 'Benjie', 'Carlo', 'Christian', 'Daniel', 'Dennis', 'Elmer', 'Emil',
  'Francis', 'Gabriel', 'Harvey', 'Ian', 'Jericho', 'Joshua', 'Kenneth', 'Kevin', 'Lance', 'Leo',
  'Mark', 'Miguel', 'Nathan', 'Noel', 'Oliver', 'Paolo', 'Raffy', 'Renz', 'Santino', 'Vince',
]);
const SURNAMES = Object.freeze([
  'Bituin', 'Silangan', 'Amihan', 'Liwanag', 'Habagat', 'Sinag', 'Himig', 'Tanglaw', 'Banaag', 'Kawayan',
  'Alapaap', 'Bahaghari', 'Luntian', 'Talampas', 'Lambak', 'Batis', 'Sampaguita', 'Narra', 'Molave', 'Yakal',
  'Dakila', 'Magiting', 'Hiraya', 'Mayumi', 'Tagumpay', 'Pagasa', 'Ligaya', 'Kalinaw', 'Payapa', 'Marilag',
]);
const GUARDIAN_NAMES = Object.freeze([
  'Alma', 'Amelia', 'Aurora', 'Belen', 'Carmela', 'Cecilia', 'Dolores', 'Editha', 'Elena', 'Flora',
  'Gloria', 'Imelda', 'Josefina', 'Lourdes', 'Luzviminda', 'Marilou', 'Nenita', 'Norma', 'Remedios', 'Rosario',
  'Alfredo', 'Antonio', 'Arnel', 'Bernardo', 'Cesar', 'Danilo', 'Eduardo', 'Ernesto', 'Fernando', 'Gerardo',
  'Hernan', 'Jaime', 'Leonardo', 'Manuel', 'Nestor', 'Orlando', 'Renato', 'Ricardo', 'Rodolfo', 'Romeo',
]);
const REFUSED_SURNAMES = Object.freeze(['Candilada', 'Conde', 'Bargaso', 'Bobis', 'Geguiera', 'Bajar']);
const REFUSED_FIRST_NAMES = Object.freeze(['Darryl', 'Marwin', 'Jea', 'Joan', 'Ashley']);

const NAME_SPACE = FIRST_NAMES.length * SURNAMES.length; // 1,800 pairs

// 13 is coprime with 1,800, so distinct i give distinct pairs (no learner
// shares a full name) while the surnames still read as mixed.
function namePair(i) {
  const p = (i * 13) % NAME_SPACE;
  return { first_name: FIRST_NAMES[p % FIRST_NAMES.length], last_name: SURNAMES[Math.floor(p / FIRST_NAMES.length)] };
}

function guardianName(i, lastName) {
  return `${GUARDIAN_NAMES[(i * 7) % GUARDIAN_NAMES.length]} ${lastName}`;
}

function hasTeamSurname(text) {
  const words = String(text || '').toLowerCase().split(/[\s,.-]+/);
  return REFUSED_SURNAMES.some((surname) => words.includes(surname.toLowerCase()));
}

// A kept row's replacement comes from the far end of the index range, where no
// seat can reach: seats stop at 23 x 32 + 29 = 765.
function renamePair(index) {
  return namePair(NAME_SPACE - 1 - index);
}

// ---------------------------------------------------------------------------
// LEARNERS
// ---------------------------------------------------------------------------
function lrnFor(section, seat) {
  return `${LRN_PREFIX}${section.grade}${String(section.index).padStart(2, '0')}${String(seat).padStart(3, '0')}`;
}

function sectionKey(grade, name) {
  return `${grade}|${name}`;
}

// The seats a section needs. Topped up, so a kept learner is one of the thirty
// and the total is the 350 of decision 1. Seat 1 of a demo section is its
// pre-confirmed parent.
function newLearners(keptBySection = {}) {
  return SECTIONS.flatMap((section) => {
    const seats = Math.max(0, section.size - (keptBySection[sectionKey(section.grade, section.name)] || 0));
    return Array.from({ length: seats }, (_, offset) => {
      const seat = offset + 1;
      const pair = namePair(section.index * 32 + offset);
      return {
        grade: section.grade,
        section: section.name,
        seat,
        key: `s${seat}`,
        lrn: lrnFor(section, seat),
        ...pair,
        guardian: guardianName(section.index * 32 + offset, pair.last_name),
        confirmed: Boolean(section.demo) && seat === 1,
      };
    });
  });
}

// The seed's kept learners per section, for the login list on a machine with
// no database. A production that differs prints a --kept value (demo-load.js).
const SEEDED_KEPT = Object.freeze({ '1|Mabait': 1, '5|Masigasig': 1, '6|Malikhain': 2 });

// ---------------------------------------------------------------------------
// THE KEYED DRAW
// ---------------------------------------------------------------------------
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(value) {
  const a = (value + 0x6d2b79f5) | 0;
  let x = Math.imul(a ^ (a >>> 15), 1 | a);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function draw(...parts) {
  return mulberry32(fnv1a([SEED, ...parts].join('|')));
}

// ---------------------------------------------------------------------------
// SCORES
// ---------------------------------------------------------------------------
// Term 1 complete; Term 2 two written works and one performance task. A Term 2
// Summative only for the first half of the subjects in printed order, so a
// parent's card reads "Term 2 — 4 of 8 recorded" and shows both a value and
// "— Pending" (the owner's Q5). Inside the grid's five and three columns.
const STANDARD_SLOTS = Object.freeze({
  1: Object.freeze([
    { type: 'WW', slot_no: 1, max_score: 20 },
    { type: 'WW', slot_no: 2, max_score: 25 },
    { type: 'WW', slot_no: 3, max_score: 20 },
    { type: 'WW', slot_no: 4, max_score: 30 },
    { type: 'PT', slot_no: 1, max_score: 50 },
    { type: 'PT', slot_no: 2, max_score: 50 },
  ]),
  2: Object.freeze([
    { type: 'WW', slot_no: 1, max_score: 20 },
    { type: 'WW', slot_no: 2, max_score: 25 },
    { type: 'PT', slot_no: 1, max_score: 50 },
  ]),
});
const TERMS_LOADED = Object.freeze([1, 2]);
const EXAM_MAX = Object.freeze({ st1: 30, st2: 30, te: 40 });

function examIsGiven(grade, subject, term) {
  if (term === 1) return true;
  const list = SUBJECTS[grade];
  return list.indexOf(subject) < Math.ceil(list.length / 2);
}

// A learner sits around one level, a subject moves them a little, and each
// mark moves a little more. Whole numbers, never above the column's highest
// possible score: the school awards no half points, and an over-HPS flag on a
// demo class would be a question the data invented.
function mark(learnerKey, subject, term, part, max) {
  const level = 72 + 24 * ((draw('level', learnerKey) + draw('level-2', learnerKey)) / 2);
  const offset = -4 + 8 * draw('subject', learnerKey, subject);
  const noise = -6 + 12 * draw('mark', learnerKey, subject, term, part);
  return Math.min(max, Math.max(0, Math.round(((level + offset + noise) / 100) * max)));
}

// routes/grades.js:449's range test on rows already read: no row for the year
// means the Initial Grade directly, the same absence-drives-it rule.
function makeTransmuter(rows) {
  const table = rows.map((row) => ({ min: Number(row.ig_min), max: Number(row.ig_max), grade: Number(row.transmuted_grade) }));
  return (ig) => {
    const row = table.find((entry) => entry.min <= ig && entry.max >= ig);
    return row ? row.grade : ig;
  };
}

// recomputeGrade's own steps, in its own order. `slot_id` is the slot number
// here: the check only needs a required id to match a row's id, and a new
// slot has no database id until the load has written it.
function computeGrade({ mode, weights, ww, pt, exam, transmute }) {
  const required = (rows) => rows.map((row) => row.slot_id);
  const wwPercentage = gc.componentPercentage(ww, required(ww));
  const ptPercentage = gc.componentPercentage(pt, required(pt));
  const st1 = gc.subTestPercentage(exam ? exam.st1 : null, exam ? exam.st1_max : null);
  const st2 = gc.subTestPercentage(exam ? exam.st2 : null, exam ? exam.st2_max : null);
  const te = gc.subTestPercentage(exam ? exam.te : null, exam ? exam.te_max : null);
  const exPercentage = gc.exPercentage(st1, st2, te);

  const wwWeighted = gc.weighted(wwPercentage, weights.ww_weight);
  const ptWeighted = gc.weighted(ptPercentage, weights.pt_weight);
  const exWeighted = gc.weighted(exPercentage, weights.ex_weight);
  const initial = gc.initialGrade(wwWeighted, ptWeighted, exWeighted);

  let termGrade = null;
  let descriptiveGrade = null;
  if (mode === 'descriptive') descriptiveGrade = gc.bandForScore(initial);
  else if (initial !== null) termGrade = transmute(initial);

  return {
    ww_percentage: wwPercentage,
    ww_weighted: wwWeighted,
    pt_percentage: ptPercentage,
    pt_weighted: ptWeighted,
    ex_percentage: exPercentage,
    ex_weighted: exWeighted,
    initial_grade: initial,
    term_grade: termGrade,
    descriptive_grade: descriptiveGrade,
  };
}

// One learner in one class-term: the marks and what they compute to.
function gradeRowFor({ learnerKey, subject, term, slots, examMax, mode, weights, transmute }) {
  const scored = slots.map((slot) => ({
    ...slot,
    score: mark(learnerKey, subject, term, `${slot.type}${slot.slot_no}`, Number(slot.max_score)),
  }));
  const rowsOf = (type) =>
    scored.filter((slot) => slot.type === type).map((slot) => ({ score: slot.score, max_score: slot.max_score, slot_id: slot.slot_no }));
  const exam = examMax
    ? {
        st1: mark(learnerKey, subject, term, 'st1', examMax.st1),
        st1_max: examMax.st1,
        st2: mark(learnerKey, subject, term, 'st2', examMax.st2),
        st2_max: examMax.st2,
        te: mark(learnerKey, subject, term, 'te', examMax.te),
        te_max: examMax.te,
      }
    : null;
  return { scored, exam, computed: computeGrade({ mode, weights, ww: rowsOf('WW'), pt: rowsOf('PT'), exam, transmute }) };
}

// ---------------------------------------------------------------------------
// ATTENDANCE
// ---------------------------------------------------------------------------
function dayBefore(date) {
  const [y, m, d] = date.split('-').map(Number);
  const previous = new Date(Date.UTC(y, m - 1, d - 1));
  const month = String(previous.getUTCMonth() + 1).padStart(2, '0');
  const day = String(previous.getUTCDate()).padStart(2, '0');
  return `${previous.getUTCFullYear()}-${month}-${day}`;
}

// Walked back from AS_OF through the server's own class-day rule, oldest first.
function attendanceDays() {
  const days = [];
  for (let date = AS_OF; days.length < ATTENDANCE_DAYS; date = dayBefore(date)) {
    if (isClassDay(date)) days.unshift(date);
  }
  return days;
}

// No Excused: that word comes from a reviewed letter, and there are none.
function attendanceStatus(learnerKey, date) {
  const roll = draw('attendance', learnerKey, date);
  if (roll < 0.91) return 'Present';
  return roll < 0.97 ? 'Late' : 'Absent';
}

// ---------------------------------------------------------------------------
// THE GUARD
// ---------------------------------------------------------------------------
// Reading is allowed anywhere; a dry run is a READ ONLY transaction. Writing to
// anything but a loopback host needs the exact flag, in that command alone.
function assertTarget({ host, apply, flag }) {
  if (!apply || LOOPBACK.has(host)) return;
  if (flag !== HOSTED_VALUE) {
    throw new Refusal(`--apply on a non-loopback host needs ${HOSTED_FLAG}=${HOSTED_VALUE} in that one command.`);
  }
}

// ---------------------------------------------------------------------------
// planLoad — the live rows in, what to write and what to refuse out
// ---------------------------------------------------------------------------
// `facts` is plain rows; demo-load.js readFacts() is its only real source.
// ADDED ROWS ONLY (the owner's Q7): a learner who already has a grades row for
// a class-term is skipped, an existing attendance day wins, and nothing here
// produces an UPDATE on a kept grade.
//
// A KEPT CLASS KEEPS ITS COLUMNS. A used slot with no score turns that
// learner's group to Pending on the next recompute, so adding columns to a
// class that already has them would quietly undo a kept learner's grade. Any
// class-term with used slots is scored on those slots and those Summative
// maxima, and no slot is added.
function planLoad(facts) {
  const refusals = [];
  const refuse = (text) => refusals.push(text);

  if (facts.academicYear !== SCHOOL_YEAR) refuse(`academic_year is not ${SCHOOL_YEAR}.`);
  if (facts.markers.manifest > 0) refuse('The demo data is already loaded: the manifest row exists. Undo first.');
  if (facts.markers.students > 0) refuse('Learners with the demo LRN prefix already exist.');
  if (facts.markers.users > 0) refuse('Accounts with a demo login id already exist.');

  const accountByLogin = new Map(facts.accounts.map((row) => [row.login_id, row]));
  const admin = accountByLogin.get(ADMIN_LOGIN);
  if (!admin || admin.role !== 'admin' || admin.status !== 'active') refuse('The admin account is missing or not active.');
  for (const login of SEEDED_TEACHERS) {
    const row = accountByLogin.get(login);
    if (!row || row.role !== 'teacher' || row.status !== 'active') refuse(`${login} is missing or not an active teacher.`);
  }

  // ---- sections and advisers ----
  const sectionRows = new Map(facts.sections.map((row) => [sectionKey(row.grade_level, row.name), row]));
  if (facts.sections.length !== SECTIONS.length) refuse(`There are ${facts.sections.length} sections for ${SCHOOL_YEAR}, not ${SECTIONS.length}.`);
  const adviserUpdates = [];
  const adviserBefore = [];
  for (const section of SECTIONS) {
    const label = `Grade ${section.grade} - ${section.name}`;
    const row = sectionRows.get(sectionKey(section.grade, section.name));
    if (!row) {
      refuse(`${label} does not exist.`);
      continue;
    }
    const kept = accountByLogin.get(section.adviser);
    if (section.adviser.startsWith(TEACHER_PREFIX)) {
      if (row.adviser_id !== null) refuse(`${label} already has an adviser, and the plan names another.`);
      adviserUpdates.push({ section_id: row.id, adviser: section.adviser });
      adviserBefore.push({ section_id: row.id, adviser_id: row.adviser_id });
    } else if (kept && row.adviser_id !== kept.id) {
      refuse(`${label} no longer has ${section.adviser} as its adviser.`);
    }
  }

  // ---- subjects, weights, modes ----
  const subjectRows = new Map(facts.subjects.map((row) => [`${row.grade_level}|${row.name}`, row]));
  const weightBySubject = new Map(facts.weights.map((row) => [row.subject_id, row]));
  const modeByGrade = new Map(facts.modes.map((row) => [row.grade_level, row.mode]));
  for (const grade of Object.keys(SUBJECTS).map(Number)) {
    const live = facts.subjects.filter((row) => row.grade_level === grade).length;
    if (live !== SUBJECTS[grade].length) refuse(`Grade ${grade} has ${live} subjects, not ${SUBJECTS[grade].length}.`);
    if (!modeByGrade.has(grade)) refuse(`Grade ${grade} has no grading mode for ${SCHOOL_YEAR}.`);
    for (const name of SUBJECTS[grade]) {
      const row = subjectRows.get(`${grade}|${name}`);
      if (!row) refuse(`Grade ${grade} has no subject ${name}.`);
      else if (!weightBySubject.has(row.id)) refuse(`Grade ${grade} ${name} has no weights for ${SCHOOL_YEAR}.`);
    }
  }
  if (!facts.transmutation.length) refuse(`The transmutation table has no rows for ${SCHOOL_YEAR}.`);

  // ---- the learners already there ----
  const keptBySection = {};
  const keptLearners = [];
  for (const row of facts.learners) {
    const key = sectionKey(row.grade_level, row.section);
    if (!sectionRows.has(key)) {
      refuse(`A learner is in Grade ${row.grade_level} - ${row.section}, which the plan does not know.`);
      continue;
    }
    keptBySection[key] = (keptBySection[key] || 0) + 1;
    keptLearners.push({ ...row, key: `k${row.id}` });
  }
  for (const section of SECTIONS) {
    const kept = keptBySection[sectionKey(section.grade, section.name)] || 0;
    if (kept > section.size) refuse(`Grade ${section.grade} - ${section.name} already has ${kept} learners, over its ${section.size}.`);
  }

  if (refusals.length) return { refusals, keptBySection };

  // ---- one teacher per subject and section ----
  // uq_teacher_assignment includes the teacher, so the table would hold two.
  const teacherLoginById = new Map(facts.accounts.map((row) => [row.id, row.login_id]));
  const existingAssignments = new Map();
  for (const row of facts.assignments) {
    const key = `${row.subject_id}|${row.grade_level}|${row.section}`;
    if (!existingAssignments.has(key)) existingAssignments.set(key, []);
    existingAssignments.get(key).push(row);
  }
  const newAssignments = [];
  for (const entry of assignmentMap()) {
    const subject = subjectRows.get(`${entry.grade}|${entry.subject}`);
    const rows = existingAssignments.get(`${subject.id}|${entry.grade}|${entry.section}`) || [];
    const others = rows.filter((row) => teacherLoginById.get(row.teacher_id) !== entry.teacher);
    if (others.length) refuse(`Grade ${entry.grade} - ${entry.section} ${entry.subject} already has another teacher.`);
    if (rows.length === others.length) {
      newAssignments.push({
        teacher: entry.teacher,
        subject_id: subject.id,
        grade: entry.grade,
        section: entry.section,
        section_id: sectionRows.get(sectionKey(entry.grade, entry.section)).id,
      });
    }
  }

  // ---- slots and grades, one class-term at a time ----
  const slotsByClass = new Map();
  for (const row of facts.slots) {
    const key = `${row.subject_id}|${row.grade_level}|${row.section}|${row.term}`;
    if (!slotsByClass.has(key)) slotsByClass.set(key, []);
    slotsByClass.get(key).push(row);
  }
  const keptIdsBySection = new Map();
  for (const learner of keptLearners) {
    const key = sectionKey(learner.grade_level, learner.section);
    if (!keptIdsBySection.has(key)) keptIdsBySection.set(key, []);
    keptIdsBySection.get(key).push(learner);
  }
  const gradesByLearnerClass = new Map(facts.grades.map((row) => [`${row.student_id}|${row.subject_id}|${row.term}`, row]));

  const transmute = makeTransmuter(facts.transmutation);
  const learners = newLearners(keptBySection);
  const seatsBySection = new Map();
  for (const learner of learners) {
    const key = sectionKey(learner.grade, learner.section);
    if (!seatsBySection.has(key)) seatsBySection.set(key, []);
    seatsBySection.get(key).push(learner);
  }

  const newSlots = [];
  const gradeRows = [];
  let reusedClassTerms = 0;

  for (const section of SECTIONS) {
    const key = sectionKey(section.grade, section.name);
    const kept = keptIdsBySection.get(key) || [];
    const seats = seatsBySection.get(key) || [];
    const mode = modeByGrade.get(section.grade);

    for (const subjectName of SUBJECTS[section.grade]) {
      const subject = subjectRows.get(`${section.grade}|${subjectName}`);
      const weights = weightBySubject.get(subject.id);

      for (const term of TERMS_LOADED) {
        const label = `Grade ${section.grade} - ${section.name} ${subjectName} Term ${term}`;
        const existingSlots = slotsByClass.get(`${subject.id}|${section.grade}|${section.name}|${term}`) || [];
        const existingRows = kept.map((learner) => gradesByLearnerClass.get(`${learner.id}|${subject.id}|${term}`)).filter(Boolean);

        const holdsData = (row) =>
          Number(row.components) > 0 ||
          row.ex_st1 !== null ||
          row.ex_st2 !== null ||
          row.ex_te !== null ||
          row.term_grade !== null ||
          row.descriptive_grade !== null;

        if (existingRows.some((row) => Number(row.is_locked) === 1)) {
          refuse(`${label} holds a locked grade.`);
          continue;
        }
        if (!existingSlots.length && existingRows.some(holdsData)) {
          refuse(`${label} holds a recorded grade with no used columns.`);
          continue;
        }

        // The class's Summative maxima, read off the kept rows.
        const maxima = new Set(
          existingRows
            .filter((row) => row.ex_st1_max !== null || row.ex_st2_max !== null || row.ex_te_max !== null)
            .map((row) => `${row.ex_st1_max}|${row.ex_st2_max}|${row.ex_te_max}`)
        );
        if (maxima.size > 1) {
          refuse(`${label} has mixed Summative maxima.`);
          continue;
        }
        let examMax = examIsGiven(section.grade, subjectName, term) ? EXAM_MAX : null;
        if (maxima.size === 1) {
          const [st1, st2, te] = [...maxima][0].split('|').map((value) => (value === 'null' ? null : Number(value)));
          if (st1 === null || st2 === null || te === null) {
            refuse(`${label} has incomplete Summative maxima.`);
            continue;
          }
          examMax = { st1, st2, te };
        }

        const reused = existingSlots.length > 0;
        if (reused) reusedClassTerms += 1;
        const slots = reused
          ? existingSlots.map((slot) => ({ id: slot.id, type: slot.type, slot_no: slot.slot_no, max_score: Number(slot.max_score) }))
          : STANDARD_SLOTS[term].map((slot) => ({ ...slot }));
        if (!reused) {
          for (const slot of slots) {
            newSlots.push({ ...slot, subject_id: subject.id, grade: section.grade, section: section.name, term });
          }
        }

        const add = (learnerKey, ref) => {
          const row = gradeRowFor({ learnerKey, subject: subjectName, term, slots, examMax, mode, weights, transmute });
          gradeRows.push({ ...ref, subject_id: subject.id, grade: section.grade, section: section.name, term, ...row });
        };
        for (const learner of kept) {
          if (!gradesByLearnerClass.has(`${learner.id}|${subject.id}|${term}`)) add(`${key}|${learner.key}`, { student_id: learner.id });
        }
        for (const learner of seats) add(`${key}|${learner.key}`, { lrn: learner.lrn });
      }
    }
  }

  // ---- attendance ----
  const days = attendanceDays();
  const existingDays = new Set(facts.attendance.map((row) => `${row.student_id}|${row.date}`));
  const attendanceRows = [];
  for (const section of SECTIONS) {
    const key = sectionKey(section.grade, section.name);
    for (const date of days) {
      for (const learner of keptIdsBySection.get(key) || []) {
        if (!existingDays.has(`${learner.id}|${date}`)) {
          attendanceRows.push({ student_id: learner.id, date, status: attendanceStatus(`${key}|${learner.key}`, date), adviser: section.adviser });
        }
      }
      for (const learner of seatsBySection.get(key) || []) {
        attendanceRows.push({ lrn: learner.lrn, date, status: attendanceStatus(`${key}|${learner.key}`, date), adviser: section.adviser });
      }
    }
  }

  // ---- existing accounts to confirm ----
  // Only one with no confirmed contact. An account already confirmed is left
  // exactly as it is, and the two columns below are all that is ever written.
  const contacts = CONFIRMED_EXISTING.map((login) => accountByLogin.get(login))
    .filter((row) => !((row.email && row.email_verified_at) || (row.contact_number && row.contact_verified_at)))
    .map((row) => ({ id: row.id, email_before: row.email, verified_before: row.email_verified_at }));

  // ---- team names on kept rows (the owner's Q3) ----
  // Names only. The LRN, the id and the login id stay; ids in id order, so the
  // replacement is stable. The old values go in the manifest.
  const renamedLearners = keptLearners
    .filter((row) => hasTeamSurname(row.last_name) || hasTeamSurname(row.first_name))
    .sort((a, b) => a.id - b.id)
    .map((row, index) => ({ id: row.id, before: { first_name: row.first_name, last_name: row.last_name }, after: renamePair(index) }));
  const renamedGuardians = facts.guardians
    .filter((row) => hasTeamSurname(row.name))
    .sort((a, b) => a.id - b.id)
    .map((row, index) => ({
      id: row.id,
      before: row.name,
      after: guardianName(index, (renamedLearners.find((entry) => entry.id === row.student_id) || { after: renamePair(renamedLearners.length + index) }).after.last_name),
    }));

  const components = gradeRows.reduce((sum, row) => sum + row.scored.length, 0);
  return {
    refusals,
    keptBySection,
    teachers: TEACHERS,
    adviserUpdates,
    adviserBefore,
    newAssignments,
    learners,
    newSlots,
    gradeRows,
    attendanceRows,
    contacts,
    renamedLearners,
    renamedGuardians,
    days,
    counts: {
      users: TEACHERS.length + learners.length,
      students: learners.length,
      teacher_assignments: newAssignments.length,
      assessment_slots: newSlots.length,
      grades: gradeRows.length,
      grade_components: components,
      attendance: attendanceRows.length,
    },
    reusedClassTerms,
    adviserCount: adviserUpdates.length,
    alreadyConfirmed: CONFIRMED_EXISTING.length - contacts.length,
  };
}

// ---------------------------------------------------------------------------
// THE LOGIN LIST — no database, no password value
// ---------------------------------------------------------------------------
function loginRows(keptBySection = SEEDED_KEPT) {
  const adviserOf = new Map(SECTIONS.map((section) => [section.adviser, section]));
  const teachers = TEACHERS.map((teacher) => {
    const section = adviserOf.get(teacher.login_id);
    const confirmed = CONFIRMED_NEW_TEACHERS.includes(teacher.login_id);
    return {
      confirmed,
      role: 'teacher',
      grade: section ? String(section.grade) : '-',
      section: section ? section.name : 'subject only',
      name: teacher.name,
      login_id: teacher.login_id,
      password: confirmed ? SECRET_KEYS.confirmed : SECRET_KEYS.teacher,
    };
  });
  const parents = newLearners(keptBySection).map((learner) => ({
    confirmed: learner.confirmed,
    role: 'parent',
    grade: String(learner.grade),
    section: learner.section,
    name: `${learner.guardian} (for ${learner.first_name} ${learner.last_name})`,
    login_id: learner.lrn,
    password: learner.confirmed ? SECRET_KEYS.confirmed : SECRET_KEYS.parent,
  }));
  return [...teachers, ...parents].sort((a, b) => Number(b.confirmed) - Number(a.confirmed));
}

module.exports = {
  LRN_PREFIX,
  TEACHER_PREFIX,
  MANIFEST_KEY,
  SEED,
  AS_OF,
  ATTENDANCE_DAYS,
  HOSTED_FLAG,
  HOSTED_VALUE,
  LOOPBACK,
  ADMIN_LOGIN,
  SEEDED_TEACHERS,
  SECRET_KEYS,
  Refusal,
  SUBJECTS,
  SECTIONS,
  TEACHERS,
  CONFIRMED_NEW_TEACHERS,
  CONFIRMED_EXISTING,
  FIRST_NAMES,
  SURNAMES,
  GUARDIAN_NAMES,
  REFUSED_SURNAMES,
  REFUSED_FIRST_NAMES,
  STANDARD_SLOTS,
  TERMS_LOADED,
  EXAM_MAX,
  SEEDED_KEPT,
  assignmentMap,
  namePair,
  hasTeamSurname,
  newLearners,
  lrnFor,
  sectionKey,
  examIsGiven,
  mark,
  makeTransmuter,
  computeGrade,
  attendanceDays,
  attendanceStatus,
  assertTarget,
  planLoad,
  loginRows,
};
