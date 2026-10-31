// MODULE 12 (2026-10-31) — THE DEMO DATA'S OWN PROOF.
//
//   npm run test:demo-data                 part 1: no database, no port. The
//                                          map, the learners, the plan's counts
//                                          against a seed-shaped fixture, every
//                                          refusal, the guards, the login list.
//   npm run test:demo-data -- --gate       part 1, then part 2 on the loopback
//                                          cluster, in parents_portal_demo:
//                                          load, the server agrees, rollback,
//                                          undo, determinism, the message clear.
//
// PART 2 NEVER TOUCHES THE SUITES' DATABASE. It refuses every target but its
// own, starts its own API on 5010 (migration/scripts/serve-pg.js) and signs a
// token with the same development fallback that API uses, so no password is
// read or typed. db:setup's output is captured and never printed: it lists the
// seeded sign-ins.
//
// NOTHING PRINTED HERE IS AN LRN, A NAME OR A VALUE: every child's output is
// scanned for a twelve-digit run, an address and the gate's own secrets, and a
// child's text is shown only after that scan passes.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const demo = require('./demoData');
const { SCHOOL_YEAR } = require('../utils/schoolCalendar');

const SERVER = path.resolve(__dirname, '..');
const ROOT = path.resolve(SERVER, '..');

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function assertClean(label, text, secrets = []) {
  const leaks = [];
  if (/\b\d{12}\b/.test(text)) leaks.push('a twelve-digit run');
  if (/[\w.+-]+@[\w-]+(\.[\w-]+)+/.test(text)) leaks.push('an address');
  if (secrets.some((value) => text.includes(value))) leaks.push('a secret value');
  assert(leaks.length === 0, `${label}: no LRN, address or secret in the output`, leaks.join(', '));
  return leaks.length === 0;
}

const sum = (rows, read) => rows.reduce((total, row) => total + read(row), 0);

// ---------------------------------------------------------------------------
// A SEED-SHAPED FIXTURE — ids invented here, no row is read from anywhere
// ---------------------------------------------------------------------------
function seedFacts() {
  const contact = { email: null, email_verified_at: null, contact_number: null, contact_verified_at: null };
  const accounts = [
    { id: 1, login_id: demo.ADMIN_LOGIN, role: 'admin', status: 'active', ...contact },
    { id: 2, login_id: 'TCH-001', role: 'teacher', status: 'active', ...contact },
    { id: 4, login_id: 'TCH-002', role: 'teacher', status: 'active', ...contact },
    { id: 7, login_id: 'TCH-003', role: 'teacher', status: 'active', ...contact },
  ];
  const idOf = (login) => accounts.find((row) => row.login_id === login).id;

  const sections = demo.SECTIONS.map((section) => ({
    id: section.index,
    name: section.name,
    grade_level: section.grade,
    adviser_id: section.adviser.startsWith(demo.TEACHER_PREFIX) ? null : idOf(section.adviser),
  }));

  const subjects = [];
  for (const [grade, names] of Object.entries(demo.SUBJECTS)) {
    for (const name of names) subjects.push({ id: subjects.length + 1, name, grade_level: Number(grade) });
  }
  const subjectId = (grade, name) => subjects.find((row) => row.grade_level === grade && row.name === name).id;

  const weights = subjects.map((row) => {
    if (row.grade_level === 1) return { subject_id: row.id, ww_weight: '30.00', pt_weight: '50.00', ex_weight: '20.00' };
    if (row.name === 'MAPEH' || row.name === 'EPP') return { subject_id: row.id, ww_weight: '20.00', pt_weight: '60.00', ex_weight: '20.00' };
    return { subject_id: row.id, ww_weight: '20.00', pt_weight: '50.00', ex_weight: '30.00' };
  });

  const seeded = demo
    .assignmentMap()
    .filter((row) => (row.teacher === 'TCH-001' && row.section === 'Malikhain') || (row.teacher === 'TCH-003' && row.section === 'Mabait'));

  // The Grade 1 demo learner's classes: one WW and one PT column on each of
  // Mathematics and Reading and Literacy, Terms 1 and 2 (Term 3 is not read).
  const slots = [];
  const grades = [];
  for (const name of ['Mathematics', 'Reading and Literacy']) {
    for (const term of [1, 2]) {
      for (const type of ['WW', 'PT']) {
        slots.push({ id: slots.length + 1, subject_id: subjectId(1, name), grade_level: 1, section: 'Mabait', term, type, slot_no: 1, max_score: '20.00' });
      }
      grades.push({
        id: grades.length + 1,
        student_id: 3,
        subject_id: subjectId(1, name),
        term,
        is_locked: 0,
        ex_st1: '18.00',
        ex_st1_max: '20.00',
        ex_st2: '18.00',
        ex_st2_max: '20.00',
        ex_te: '18.00',
        ex_te_max: '20.00',
        term_grade: null,
        descriptive_grade: 'A',
        components: 2,
      });
    }
  }

  return {
    academicYear: SCHOOL_YEAR,
    markers: { manifest: 0, students: 0, users: 0 },
    accounts,
    sections,
    subjects,
    weights,
    modes: Object.keys(demo.SUBJECTS).map((grade) => ({ grade_level: Number(grade), mode: grade === '1' ? 'descriptive' : 'numerical' })),
    transmutation: [{ ig_min: '0.00', ig_max: '100.00', transmuted_grade: 85 }],
    learners: [
      { id: 1, grade_level: 6, section: 'Malikhain', first_name: 'Kept', last_name: 'Conde' },
      { id: 2, grade_level: 5, section: 'Masigasig', first_name: 'Kept', last_name: 'Bargaso' },
      { id: 3, grade_level: 1, section: 'Mabait', first_name: 'Kept', last_name: 'Fixture' },
      { id: 4, grade_level: 6, section: 'Malikhain', first_name: 'Kept', last_name: 'Example' },
    ],
    guardians: [
      { id: 10, name: 'Guardian Fixture', student_id: 1 },
      { id: 11, name: 'Guardian Bobis', student_id: 2 },
    ],
    assignments: seeded.map((row, index) => ({
      id: index + 1,
      teacher_id: idOf(row.teacher),
      subject_id: subjectId(row.grade, row.subject),
      grade_level: row.grade,
      section: row.section,
    })),
    slots,
    grades,
    attendance: [],
  };
}

// ---------------------------------------------------------------------------
// PART 1 — no database, no port
// ---------------------------------------------------------------------------
function partOneMap() {
  console.log('\nThe teacher map (decision 3)');
  const map = demo.assignmentMap();
  const advisers = demo.SECTIONS.map((section) => section.adviser);
  const taught = new Set(map.map((row) => row.teacher));
  const everyone = new Set([...advisers, ...taught]);

  assert(demo.SECTIONS.length === 23, '23 sections');
  assert(demo.SECTIONS.filter((section) => section.demo).length === 6, 'one demo section per grade');
  assert(sum(demo.SECTIONS, (section) => section.size) === 350, '6 x 30 + 17 x 10 = 350');
  assert(map.length === 155, '155 subject-section rows', String(map.length));
  assert(new Set(map.map((row) => `${row.grade}|${row.section}|${row.subject}`)).size === 155, 'exactly one teacher for every subject of every section');
  assert(new Set(advisers).size === 23, 'a different adviser for every section');
  assert(everyone.size === 25, '25 teachers in all', String(everyone.size));
  assert(demo.TEACHERS.length === 22, '22 new teachers');
  assert(demo.TEACHERS.every((row) => everyone.has(row.login_id)), 'every new teacher has a place in the map');
  assert([...everyone].filter((login) => !advisers.includes(login)).length === 2, 'two subject-only teachers');

  const rowsOf = (login) => map.filter((row) => row.teacher === login);
  assert(rowsOf('TCH-002').length === 0, 'TCH-002 keeps zero assignments');
  assert(rowsOf('TCH-001').filter((row) => row.section === 'Malikhain').length === 3, 'TCH-001 keeps three subjects in Malikhain');
  assert(rowsOf('TCH-003').filter((row) => row.section === 'Mabait').length === 5, 'TCH-003 keeps every Grade 1 subject in Mabait');
  assert(rowsOf('TCH-001').length === 12, 'TCH-001 extended across Grade 6 (the owner\'s Q2)');

  for (const grade of [1, 2]) {
    const self = map.filter((row) => row.grade === grade).every((row) => demo.SECTIONS.find((s) => s.grade === grade && s.name === row.section).adviser === row.teacher);
    assert(self, `Grade ${grade} is self-contained`);
  }

  const grade3 = demo.SECTIONS.filter((section) => section.grade === 3);
  const exchange = grade3.every((section) => {
    const own = map.filter((row) => row.teacher === section.adviser && row.section === section.name).length;
    const away = new Set(map.filter((row) => row.teacher === section.adviser && row.section !== section.name).map((row) => row.subject));
    return own === 3 && away.size === 1;
  });
  assert(exchange, 'Grade 3: three subjects at home, one across the others');

  for (const grade of [4, 5, 6]) {
    const bySubject = new Map();
    for (const row of map.filter((entry) => entry.grade === grade)) {
      if (!bySubject.has(row.subject)) bySubject.set(row.subject, new Set());
      bySubject.get(row.subject).add(row.teacher);
    }
    assert([...bySubject.values()].every((set) => set.size === 1), `Grade ${grade}: one teacher per subject across the grade`);
    const loads = demo.SECTIONS.filter((s) => s.grade === grade && s.adviser.startsWith(demo.TEACHER_PREFIX)).map(
      (s) => new Set(map.filter((row) => row.grade === grade && row.teacher === s.adviser).map((row) => row.subject)).size
    );
    assert(loads.every((n) => n === 1 || n === 2), `Grade ${grade}: a new adviser teaches one or two subjects`);
  }

  const subjectTeacher = map.filter((row) => row.teacher === `${demo.TEACHER_PREFIX}024`);
  assert(subjectTeacher.some((row) => row.section === 'Malikhain') && !advisers.includes(`${demo.TEACHER_PREFIX}024`), 'the pre-confirmed subject teacher teaches in Malikhain and advises nothing');
}

function partOneLearners() {
  console.log('\nLearners, names, pre-confirmed accounts');
  const learners = demo.newLearners(demo.SEEDED_KEPT);
  assert(learners.length === 346, '346 new learners, topped up to 350', String(learners.length));
  assert(new Set(learners.map((row) => row.lrn)).size === 346, 'every LRN is unique');
  assert(learners.every((row) => /^999900\d{6}$/.test(row.lrn)), 'every LRN follows the fixed pattern');
  assert(new Set(learners.map((row) => `${row.first_name} ${row.last_name}`)).size === 346, 'no two learners share a full name');

  const banned = new Set([...demo.REFUSED_SURNAMES, ...demo.REFUSED_FIRST_NAMES].map((name) => name.toLowerCase()));
  const clean = (text) => !String(text).toLowerCase().split(/\s+/).some((word) => banned.has(word));
  assert([...demo.FIRST_NAMES, ...demo.SURNAMES, ...demo.GUARDIAN_NAMES].every(clean), 'no name list holds a team member or the principal');
  assert(demo.TEACHERS.every((row) => clean(row.name)), 'no new teacher carries a refused name');
  assert(learners.every((row) => clean(`${row.first_name} ${row.last_name} ${row.guardian}`)), 'no learner or guardian carries a refused name');

  const confirmed = learners.filter((row) => row.confirmed);
  assert(confirmed.length === 6, 'one pre-confirmed parent per grade');
  assert(new Set(confirmed.map((row) => row.grade)).size === 6, 'the six are in six grades');
  assert(demo.CONFIRMED_EXISTING.length + demo.CONFIRMED_NEW_TEACHERS.length + confirmed.length === 14, '14 pre-confirmed accounts in all');
}

function partOneScores() {
  console.log('\nThe computation');
  // The seed's own worked row: 19/20, 19/20, then 18, 19, 19 of 20 at
  // 30/50/20 is an Initial Grade of 94.70 and an A (CLAUDE.md, Seeded baseline).
  const worked = demo.computeGrade({
    mode: 'descriptive',
    weights: { ww_weight: '30.00', pt_weight: '50.00', ex_weight: '20.00' },
    ww: [{ score: 19, max_score: 20, slot_id: 1 }],
    pt: [{ score: 19, max_score: 20, slot_id: 1 }],
    exam: { st1: 18, st1_max: 20, st2: 19, st2_max: 20, te: 19, te_max: 20 },
    transmute: () => {
      throw new Error('a descriptive row is never transmuted');
    },
  });
  assert(worked.initial_grade === 94.7 && worked.descriptive_grade === 'A' && worked.term_grade === null, 'the seeded worked row gives 94.70 and A');

  const transmute = demo.makeTransmuter([
    { ig_min: '70.00', ig_max: '71.17', transmuted_grade: 75 },
    { ig_min: '65.34', ig_max: '69.99', transmuted_grade: 74 },
  ]);
  assert(transmute(71.17) === 75 && transmute(65.34) === 74, 'the transmutation range test is inclusive at both ends');
  assert(transmute(99) === 99, 'no row for a value means the Initial Grade directly');
  assert(demo.computeGrade({ mode: 'numerical', weights: { ww_weight: '20.00', pt_weight: '50.00', ex_weight: '30.00' }, ww: [{ score: 10, max_score: 20, slot_id: 1 }], pt: [{ score: 10, max_score: 20, slot_id: 1 }], exam: null, transmute }).initial_grade === null, 'no Summative means no Initial Grade');

  const days = demo.attendanceDays();
  assert(days.length === 10, 'ten class days');
  assert(days[0] === '2026-10-19' && days[9] === '2026-10-30', 'the window is 2026-10-19 to 2026-10-30');
  const statuses = days.flatMap((date) => Array.from({ length: 50 }, (_, seat) => demo.attendanceStatus(`s${seat}`, date)));
  assert(new Set(statuses).size === 3 && !statuses.includes('Excused'), 'Present, Late and Absent, and never Excused');
}

function partOnePlan() {
  console.log('\nThe plan, against a seed-shaped fixture');
  const plan = demo.planLoad(seedFacts());
  assert(plan.refusals.length === 0, 'no refusal on the seed', plan.refusals.join(' | '));
  const expected = { users: 368, students: 346, teacher_assignments: 147, assessment_slots: 1377, grades: 4696, grade_components: 20842, attendance: 3500 };
  for (const [table, count] of Object.entries(expected)) {
    assert(plan.counts[table] === count, `${table} +${count}`, String(plan.counts[table]));
  }
  assert(plan.adviserCount === 20, '20 advisers to set');
  assert(plan.reusedClassTerms === 4, 'the four Mabait class-terms keep their own columns', String(plan.reusedClassTerms));

  const keptRows = plan.gradeRows.filter((row) => row.student_id === 3);
  assert(keptRows.length === 6, 'the kept Grade 1 learner gets only the six rows they do not have', String(keptRows.length));
  const onReused = plan.gradeRows.filter((row) => row.section === 'Mabait' && row.subject_id === seedFacts().subjects.find((s) => s.grade_level === 1 && s.name === 'Mathematics').id);
  assert(onReused.every((row) => row.scored.length === 2 && row.exam.st1_max === 20), 'a kept class is scored on its own columns and maxima');

  const marks = plan.gradeRows.flatMap((row) => row.scored);
  assert(marks.every((slot) => Number.isInteger(slot.score) && slot.score >= 0 && slot.score <= slot.max_score), 'every mark is whole, and never above its column');
  const exams = plan.gradeRows.filter((row) => row.exam);
  assert(exams.every((row) => Number.isInteger(row.exam.st1) && row.exam.st1 <= row.exam.st1_max && row.exam.te <= row.exam.te_max), 'every Summative mark is whole, and never above its maximum');
  assert(plan.gradeRows.filter((row) => row.term === 1).every((row) => row.computed.initial_grade !== null), 'Term 1 is complete');
  const termTwo = plan.gradeRows.filter((row) => row.term === 2);
  assert(termTwo.some((row) => row.computed.initial_grade !== null) && termTwo.some((row) => row.computed.initial_grade === null), 'Term 2 is partial: some computed, some Pending');
  assert(plan.gradeRows.filter((row) => row.grade === 1).every((row) => row.computed.term_grade === null), 'Grade 1 never holds a term grade');
  assert(plan.gradeRows.filter((row) => row.grade > 1).every((row) => row.computed.descriptive_grade === null), 'Grades 2-6 never hold a letter');
  const malikhain = new Set(plan.gradeRows.filter((row) => row.section === 'Malikhain' && row.term === 2 && row.computed.term_grade !== null).map((row) => row.subject_id));
  assert(malikhain.size === 4, 'Malikhain Term 2: four of eight subjects computed', String(malikhain.size));

  const added = new Set(plan.renamedLearners.map((row) => row.id));
  assert(added.size === 2 && added.has(1) && added.has(2), 'the two kept learners with team surnames are renamed, nobody else');
  assert(plan.renamedLearners.every((row) => !demo.hasTeamSurname(row.after.last_name)), 'their new names are clean');
  assert(plan.renamedGuardians.length === 1 && !demo.hasTeamSurname(plan.renamedGuardians[0].after), 'the guardian with a team surname is renamed');
  assert(plan.contacts.length === 3, 'three existing accounts to confirm on the seed');

  const again = demo.planLoad(seedFacts());
  assert(JSON.stringify(again) === JSON.stringify(plan), 'two plans are identical');

  console.log('\nEvery refusal');
  const refused = (change, label) => {
    const facts = seedFacts();
    change(facts);
    const outcome = demo.planLoad(facts);
    assert(outcome.refusals.length > 0, label);
  };
  refused((f) => { f.markers.manifest = 1; }, 'a second load: the manifest exists');
  refused((f) => { f.markers.students = 1; }, 'demo learners already there');
  refused((f) => { f.markers.users = 1; }, 'demo accounts already there');
  refused((f) => { f.academicYear = '2027-2028'; }, 'another school year');
  refused((f) => { f.sections[0].adviser_id = 99; }, 'a section with another adviser');
  refused((f) => { f.sections.find((row) => row.name === 'Malikhain').adviser_id = 99; }, 'a kept section that changed adviser');
  refused((f) => { f.sections.pop(); }, 'a missing section');
  refused((f) => { f.subjects.pop(); }, 'a missing subject');
  refused((f) => { f.weights.pop(); }, 'a subject with no weights');
  refused((f) => { f.modes.pop(); }, 'a grade with no mode');
  refused((f) => { f.transmutation = []; }, 'no transmutation table');
  refused((f) => { f.accounts = f.accounts.filter((row) => row.login_id !== 'TCH-002'); }, 'a seeded teacher missing');
  refused((f) => { f.assignments[0].teacher_id = 99; }, 'a subject that already has another teacher');
  refused((f) => { f.grades[0].is_locked = 1; }, 'a locked grade in a kept class');
  refused((f) => { f.grades[0].ex_st1_max = '30.00'; f.grades.push({ ...f.grades[0], id: 99, student_id: 3, ex_st1_max: '40.00', term: 1 }); f.learners.push({ id: 5, grade_level: 1, section: 'Mabait', first_name: 'Kept', last_name: 'Fixture' }); f.grades[f.grades.length - 1].student_id = 5; }, 'mixed Summative maxima');
  refused((f) => { f.grades.push({ ...f.grades[0], id: 98, student_id: 1, subject_id: f.subjects.find((s) => s.grade_level === 6 && s.name === 'Science').id, term: 1 }); }, 'a recorded grade in a class with no columns');
  refused((f) => { for (let i = 0; i < 31; i += 1) f.learners.push({ id: 100 + i, grade_level: 1, section: 'Mabait', first_name: 'Kept', last_name: 'Fixture' }); }, 'a section over its size');
  refused((f) => { f.learners.push({ id: 200, grade_level: 1, section: 'Nowhere', first_name: 'Kept', last_name: 'Fixture' }); }, 'a learner in an unknown section');

  const topped = seedFacts();
  topped.learners.push({ id: 300, grade_level: 2, section: 'Matipid', first_name: 'x', last_name: 'y' });
  assert(demo.planLoad(topped).refusals.length > 0, 'a section the wrong grade is not silently accepted');
  const extra = seedFacts();
  extra.learners.push({ id: 301, grade_level: 2, section: 'Masikap', first_name: 'Kept', last_name: 'Fixture' });
  assert(demo.planLoad(extra).counts.students === 345, 'an extra kept learner takes a seat: the top-up is from the live count');
  const confirmedAdmin = seedFacts();
  confirmedAdmin.accounts[0].email = 'x';
  confirmedAdmin.accounts[0].email_verified_at = new Date(0);
  assert(demo.planLoad(confirmedAdmin).contacts.length === 2, 'an already confirmed account is left alone');
  const dayKept = seedFacts();
  dayKept.attendance.push({ student_id: 1, date: '2026-10-19' });
  assert(demo.planLoad(dayKept).counts.attendance === 3499, 'an attendance day already recorded wins');
}

function child(script, args, env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: SERVER, env, encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

function partOneGuards() {
  console.log('\nThe guards, and no connection is opened');
  const noFlag = () => demo.assertTarget({ host: 'db.invalid', apply: true, flag: undefined });
  assert((() => { try { noFlag(); return false; } catch (error) { return error instanceof demo.Refusal; } })(), 'a hosted --apply with no flag is refused');
  assert((() => { try { demo.assertTarget({ host: 'db.invalid', apply: true, flag: 'staging-smoke' }); return false; } catch (error) { return error instanceof demo.Refusal; } })(), "the staging smoke's value does not unlock it");
  demo.assertTarget({ host: 'db.invalid', apply: true, flag: demo.HOSTED_VALUE });
  demo.assertTarget({ host: 'db.invalid', apply: false, flag: undefined });
  demo.assertTarget({ host: '127.0.0.1', apply: true, flag: undefined });
  assert(true, 'the exact flag, a dry run and a loopback host all pass');

  const base = { ...process.env, PG_SSL: 'disable', PG_MIGRATE_PASSWORD: crypto.randomBytes(8).toString('hex') };
  for (const key of Object.values(demo.SECRET_KEYS)) delete base[key];
  delete base[demo.HOSTED_FLAG];

  for (const script of ['scripts/demo-load.js', 'scripts/demo-undo.js', 'scripts/demo-clear-messages.js']) {
    const hosted = child(script, ['--apply'], { ...base, PG_HOST: 'db.invalid' });
    assert(hosted.status === 2 && hosted.out.includes('REFUSED'), `${script}: hosted --apply refused, before any connection`, String(hosted.status));
    assertClean(script, hosted.out);
  }
  const noSecrets = child('scripts/demo-load.js', [], { ...base, PG_HOST: '127.0.0.1' });
  assert(noSecrets.status === 2 && Object.values(demo.SECRET_KEYS).every((key) => noSecrets.out.includes(key)), 'missing values are named, before any connection', String(noSecrets.status));
  const weak = { ...base, PG_HOST: '127.0.0.1', DEMO_TEACHER_PASSWORD: 'short', DEMO_PARENT_PASSWORD: 'nodigitshere', DEMO_CONFIRMED_PASSWORD: 'short', DEMO_CONTACT_EMAIL: 'not-an-address' };
  const refused = child('scripts/demo-load.js', [], weak);
  assert(refused.status === 2 && !refused.out.includes('nodigitshere') && !refused.out.includes('not-an-address'), 'bad values are refused, and a refusal never repeats one');

  console.log('\nThe login list');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-logins-'));
  try {
    const file = path.join(dir, 'demo-logins.txt');
    const written = child('scripts/demo-logins.js', [`--out=${file}`], base);
    assert(written.status === 0, 'the list is written with no database', written.out.slice(0, 200));
    assertClean('demo:logins', written.out);
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\r\n').filter((line) => /^(yes|no) /.test(line));
    assert(lines.length === 368, '368 rows: 22 teachers and 346 parents', String(lines.length));
    assert(lines.filter((line) => line.startsWith('yes ')).length === 11, '11 pre-confirmed new accounts on the list');
    assert(lines.slice(0, 11).every((line) => line.startsWith('yes ')), 'the pre-confirmed come first');
    const inside = child('scripts/demo-logins.js', [`--out=${path.join(ROOT, 'demo-logins.txt')}`], base);
    assert(inside.status === 2, 'a path inside the repo is refused');
    const secrets = child('scripts/demo-logins.js', [`--out=${path.join(dir, 'Parents_Portal-migration-data', 'secrets', 'x.txt')}`], base);
    assert(secrets.status === 2, 'a path inside the migration data is refused');
    const fewer = child('scripts/demo-logins.js', [`--out=${file}`, '--kept=1:Mabait=2,5:Masigasig=1,6:Malikhain=2'], base);
    assert(fewer.status === 0 && (fs.readFileSync(file, 'utf8').match(/^(yes|no) /gm) || []).length === 367, '--kept drops a seat from the list');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// PART 2 — the loopback cluster, in parents_portal_demo alone
// ---------------------------------------------------------------------------
const GATE_DB = 'parents_portal_demo';
const GATE_PORT = 5010;
const BASE = `http://127.0.0.1:${GATE_PORT}`;
const COMPUTED_FIELDS = ['ww_percentage', 'ww_weighted', 'pt_percentage', 'pt_weighted', 'ex_percentage', 'ex_weighted', 'initial_grade', 'term_grade', 'descriptive_grade'];

// Natural keys, never ids: a second load takes new ids and must still match.
const DIGESTS = Object.freeze({
  users: `SELECT u.login_id, u.role, u.status, u.name, u.email, u.email_verified_at IS NOT NULL AS confirmed,
                 u.contact_number, u.must_change_password, s.lrn
            FROM users u LEFT JOIN students s ON s.id = u.student_id`,
  students: 'SELECT lrn, first_name, last_name, grade_level, section, status FROM students',
  sections: 'SELECT s.grade_level, s.name, u.login_id FROM sections s LEFT JOIN users u ON u.id = s.adviser_id',
  assignments: `SELECT u.login_id, su.grade_level, su.name, ta.section
                  FROM teacher_assignments ta JOIN users u ON u.id = ta.teacher_id JOIN subjects su ON su.id = ta.subject_id`,
  slots: `SELECT su.grade_level, su.name, a.section, a.term, a.type, a.slot_no, a.max_score
            FROM assessment_slots a JOIN subjects su ON su.id = a.subject_id`,
  grades: `SELECT st.lrn, su.name, g.term, g.ww_percentage, g.ww_weighted, g.pt_percentage, g.pt_weighted,
                  g.ex_st1, g.ex_st1_max, g.ex_st2, g.ex_st2_max, g.ex_te, g.ex_te_max, g.ex_percentage, g.ex_weighted,
                  g.initial_grade, g.term_grade, g.descriptive_grade, g.is_locked
             FROM grades g JOIN students st ON st.id = g.student_id JOIN subjects su ON su.id = g.subject_id`,
  components: `SELECT st.lrn, su.name, g.term, c.type, sl.slot_no, c.score, c.max_score
                 FROM grade_components c
                 JOIN grades g ON g.id = c.grade_id
                 JOIN students st ON st.id = g.student_id
                 JOIN subjects su ON su.id = g.subject_id
                 LEFT JOIN assessment_slots sl ON sl.id = c.slot_id`,
  attendance: `SELECT st.lrn, a.date, a.status, u.login_id
                 FROM attendance a JOIN students st ON st.id = a.student_id JOIN users u ON u.id = a.recorded_by`,
  settings: `SELECT setting_key, setting_value FROM system_settings WHERE setting_key <> '${demo.MANIFEST_KEY}'`,
});

function waitFor(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function digestOf(client) {
  const digest = {};
  for (const [name, sql] of Object.entries(DIGESTS)) {
    const { rows } = await client.query(`SELECT md5(COALESCE(string_agg(r::text, chr(10) ORDER BY r::text), '')) AS d FROM (${sql}) r`);
    digest[name] = rows[0].d;
  }
  return digest;
}

async function countOf(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return Number(rows[0].n);
}

async function tableCount(client, table) {
  return countOf(client, `SELECT COUNT(*) AS n FROM ${table}`);
}

const sameDigest = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const differingKeys = (a, b) => Object.keys(a).filter((key) => a[key] !== b[key]).join(', ');

async function api(method, route, token, body) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return true;
    } catch {
      // not listening yet
    }
    await waitFor(500);
  }
  return false;
}

// The class record the way the grid would send it, with the stored values.
function dryRunBody(record, term, subjectId, gradeLevel, section, change = null) {
  const entries = record.learners
    .filter((learner) => learner.grade_id)
    .map((learner) => {
      const entry = {
        student_id: learner.student_id,
        scores: Object.entries(learner.scores).map(([slotId, score]) => ({ slot_id: Number(slotId), score })),
      };
      if (learner.ex_st1 !== null) {
        Object.assign(entry, {
          st1_score: learner.ex_st1,
          st1_max: learner.ex_st1_max,
          st2_score: learner.ex_st2,
          st2_max: learner.ex_st2_max,
          te_score: learner.ex_te,
          te_max: learner.ex_te_max,
        });
      }
      return entry;
    });
  if (change) change(entries);
  return { subject_id: subjectId, grade_level: gradeLevel, section, term, school_year: SCHOOL_YEAR, dry_run: true, entries };
}

async function serverAgrees(client, token) {
  const { rows: classTerms } = await client.query(
    `SELECT DISTINCT subject_id, grade_level, section, term FROM assessment_slots
      WHERE school_year = $1 AND term IN (1, 2) ORDER BY grade_level, section, subject_id, term`,
    [SCHOOL_YEAR]
  );
  let compared = 0;
  let disagreed = 0;
  let controlled = false;
  for (const row of classTerms) {
    const query = new URLSearchParams({
      subject_id: row.subject_id,
      grade_level: row.grade_level,
      section: row.section,
      term: row.term,
      school_year: SCHOOL_YEAR,
    });
    const { status, json: record } = await api('GET', `/api/grades/class-record?${query}`, token);
    if (status !== 200) {
      disagreed += 1;
      continue;
    }
    const stored = new Map(record.learners.map((learner) => [learner.student_id, learner]));
    const body = dryRunBody(record, row.term, row.subject_id, row.grade_level, row.section);
    const put = await api('PUT', '/api/grades/class-record', token, body);
    if (put.status !== 200) {
      disagreed += 1;
      continue;
    }
    for (const result of put.json.results) {
      compared += 1;
      const learner = stored.get(result.student_id);
      if (COMPUTED_FIELDS.some((field) => result[field] !== learner[field])) disagreed += 1;
    }

    // THE NEGATIVE CONTROL, once: a changed mark must move the result, or the
    // comparison above proves nothing.
    if (!controlled && Number(row.term) === 1 && row.grade_level > 1 && body.entries.length) {
      const first = body.entries[0];
      const lowered = dryRunBody(record, row.term, row.subject_id, row.grade_level, row.section, (entries) => {
        const entry = entries.find((item) => item.student_id === first.student_id);
        entry.scores[0].score = 0;
      });
      const control = await api('PUT', '/api/grades/class-record', token, lowered);
      const moved = control.json.results.find((result) => result.student_id === first.student_id);
      const held = stored.get(first.student_id);
      controlled = true;
      assert(moved.initial_grade !== held.initial_grade, 'negative control: a changed mark moves the server\'s answer');
    }
  }
  return { classTerms: classTerms.length, compared, disagreed };
}

async function gate() {
  console.log(`\nPART 2 — the gate, in ${GATE_DB} on the loopback cluster`);
  const { Client } = require('pg');
  const { LOCAL_PG } = require('../../migration/lib/env');
  const { signToken } = require('../utils/jwt');

  const env = {
    ...process.env,
    PG_HOST: '127.0.0.1',
    PG_PORT: String(LOCAL_PG.port),
    PG_DATABASE: GATE_DB,
    PG_SSL: 'disable',
    PG_USER: LOCAL_PG.user,
    PG_PASSWORD: LOCAL_PG.password,
    PG_MIGRATE_USER: LOCAL_PG.user,
    PG_MIGRATE_PASSWORD: LOCAL_PG.password,
    PORT: String(GATE_PORT),
    MAIL_TRANSPORT: 'file',
    SMS_TRANSPORT: 'file',
  };
  for (const key of Object.values(demo.SECRET_KEYS)) delete env[key];
  delete env[demo.HOSTED_FLAG];

  // Random for this run, shown to nobody, gone when it ends.
  const secretValues = {
    DEMO_TEACHER_PASSWORD: `${crypto.randomBytes(10).toString('hex')}1`,
    DEMO_PARENT_PASSWORD: `${crypto.randomBytes(10).toString('hex')}2`,
    DEMO_CONFIRMED_PASSWORD: `${crypto.randomBytes(10).toString('hex')}3`,
    DEMO_CONTACT_EMAIL: 'demo.gate@example.invalid',
  };
  const secrets = Object.values(secretValues);
  const withSecrets = { ...env, ...secretValues };

  const script = (name, args = [], extra = env) => {
    const result = child(name, args, extra);
    if (assertClean(`${name} ${args.join(' ')}`.trim(), result.out, secrets) && result.status !== 0) {
      console.error(result.out.trim().split('\n').slice(0, 12).join('\n'));
    }
    return result;
  };

  // db:setup prints the seeded sign-ins: captured, never shown, never scanned.
  const setup = child('scripts/setup-db.js', [], env);
  assert(setup.status === 0, 'a fresh db:setup in the gate database', `exit ${setup.status}`);
  if (setup.status !== 0) return;

  const client = new Client({ host: '127.0.0.1', port: LOCAL_PG.port, user: LOCAL_PG.user, password: LOCAL_PG.password, database: GATE_DB, ssl: false });
  await client.connect();
  await client.query('SET search_path TO portal, pg_catalog');

  let server = null;
  try {
    const baseline = await digestOf(client);
    const baseCounts = {};
    for (const table of ['users', 'students', 'teacher_assignments', 'assessment_slots', 'grades', 'grade_components', 'attendance']) {
      baseCounts[table] = await tableCount(client, table);
    }
    const keptPasswords = async () =>
      (await client.query(`SELECT md5(string_agg(id::text || password || must_change_password::text, ',' ORDER BY id)) AS d FROM users WHERE id <= 8`)).rows[0].d;
    const passwordsBefore = await keptPasswords();
    const maxGrade = await countOf(client, 'SELECT MAX(id) AS n FROM grades');
    const keptGrades = async () =>
      (await client.query(`SELECT md5(string_agg(g::text, ',' ORDER BY g.id)) AS d FROM (SELECT id, ww_percentage, pt_percentage, ex_percentage, initial_grade, descriptive_grade, ex_st1, ex_st2, ex_te FROM grades WHERE id <= $1) g`, [maxGrade])).rows[0].d;
    const gradesBefore = await keptGrades();
    const notificationsBefore = await tableCount(client, 'notifications');
    const acceptancesBefore = await tableCount(client, 'policy_acceptances');
    const activityBefore = await countOf(client, `SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'demo_data_load'`);

    console.log('\nThe dry run');
    const dry = script('scripts/demo-load.js', [], withSecrets);
    assert(dry.status === 0, 'the dry run passes', `exit ${dry.status}`);
    assert(dry.out.includes('BEGIN READ ONLY'), 'the dry run is a READ ONLY transaction');
    assert(sameDigest(await digestOf(client), baseline), 'the dry run wrote nothing');

    console.log('\nA failure part way through rolls everything back');
    await client.query(`CREATE FUNCTION portal.demo_gate_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'gate failure'; END $$`);
    await client.query('CREATE TRIGGER demo_gate_fail BEFORE INSERT ON portal.attendance FOR EACH ROW EXECUTE FUNCTION portal.demo_gate_fail()');
    const broken = script('scripts/demo-load.js', ['--apply'], withSecrets);
    await client.query('DROP TRIGGER demo_gate_fail ON portal.attendance');
    await client.query('DROP FUNCTION portal.demo_gate_fail()');
    assert(broken.status === 1 && broken.out.includes('FAILED at attendance'), 'the load fails at attendance, its last table', `exit ${broken.status}`);
    assert(sameDigest(await digestOf(client), baseline), 'and nothing it wrote before that survives');

    console.log('\nThe load');
    const load = script('scripts/demo-load.js', ['--apply'], withSecrets);
    assert(load.status === 0, 'the load commits', `exit ${load.status}`);
    if (load.status !== 0) return;
    const committed = /Load committed in [\d.]+ seconds\./.exec(load.out);
    console.log(`  ${committed ? committed[0] : 'No load time was printed.'}`);

    const expected = { users: 368, students: 346, teacher_assignments: 147, assessment_slots: 1377, grades: 4696, grade_components: 20842, attendance: 3500 };
    for (const [table, added] of Object.entries(expected)) {
      const now = await tableCount(client, table);
      assert(now === baseCounts[table] + added, `${table}: ${baseCounts[table]} + ${added} = ${now}`, String(now));
    }
    const firstLoad = await digestOf(client);

    console.log('\nWhat the load left');
    assert((await countOf(client, 'SELECT COUNT(*) AS n FROM sections WHERE adviser_id IS NULL')) === 0, 'every section has an adviser');
    assert((await countOf(client, 'SELECT COUNT(*) AS n FROM (SELECT subject_id, grade_level, section FROM teacher_assignments GROUP BY 1, 2, 3 HAVING COUNT(*) > 1) x')) === 0, 'no subject of any section has two teachers');
    assert((await countOf(client, `SELECT COUNT(*) AS n FROM teacher_assignments ta JOIN users u ON u.id = ta.teacher_id WHERE u.login_id = 'TCH-002'`)) === 0, 'TCH-002 has zero assignments');
    assert((await countOf(client, 'SELECT COUNT(*) AS n FROM students WHERE section_id IS NULL')) === 0, 'no learner has a NULL section_id');
    assert((await countOf(client, 'SELECT COUNT(*) AS n FROM teacher_assignments WHERE section_id IS NULL')) === 0, 'no assignment has a NULL section_id');
    assert((await countOf(client, 'SELECT COUNT(*) AS n FROM grades WHERE is_locked = 1')) === 0, 'no grade is locked');
    assert((await countOf(client, 'SELECT COUNT(*) AS n FROM grade_components WHERE score <> trunc(score) OR score > max_score OR slot_id IS NULL')) === 0, 'every score is whole, within its column, on a slot');
    const termOneOpen = await countOf(
      client,
      `SELECT COUNT(*) AS n FROM grades g JOIN students s ON s.id = g.student_id
        WHERE g.term = 1 AND ((s.grade_level = 1 AND g.descriptive_grade IS NULL) OR (s.grade_level > 1 AND g.term_grade IS NULL))`
    );
    assert(termOneOpen === 0, 'Term 1 is complete in every section', String(termOneOpen));
    const termTwoDone = await countOf(client, 'SELECT COUNT(*) AS n FROM grades WHERE term = 2 AND initial_grade IS NOT NULL');
    const termTwoOpen = await countOf(client, 'SELECT COUNT(*) AS n FROM grades WHERE term = 2 AND initial_grade IS NULL');
    assert(termTwoDone > 0 && termTwoOpen > 0, 'Term 2 is partial');
    assert((await tableCount(client, 'notifications')) === notificationsBefore, 'no notification was written');
    assert((await tableCount(client, 'policy_acceptances')) === acceptancesBefore, 'no acceptance row was written (the owner\'s Q6)');
    assert((await countOf(client, `SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'demo_data_load'`)) === activityBefore + 1, 'one activity row for the load');
    assert((await countOf(client, 'SELECT COUNT(*) AS n FROM users WHERE email = $1 AND email_verified_at IS NOT NULL', [secretValues.DEMO_CONTACT_EMAIL])) === 14, '14 pre-confirmed accounts');
    assert((await countOf(client, `SELECT COUNT(*) AS n FROM users WHERE (login_id COLLATE "und-x-icu" LIKE 'DEMO-TCH-%' OR login_id COLLATE "und-x-icu" LIKE '999900%') AND must_change_password = 0`)) === 11, 'the 11 new pre-confirmed accounts skip the forced change');
    assert((await countOf(client, `SELECT COUNT(*) AS n FROM users WHERE (login_id COLLATE "und-x-icu" LIKE 'DEMO-TCH-%' OR login_id COLLATE "und-x-icu" LIKE '999900%') AND must_change_password = 1 AND email IS NULL`)) === 357, 'the other 357 go through the normal first sign-in');
    const surnames = demo.REFUSED_SURNAMES.map((name) => name.toLowerCase());
    assert((await countOf(client, 'SELECT COUNT(*) AS n FROM students WHERE lower(last_name) = ANY($1::text[])', [surnames])) === 0, 'no learner carries a team surname');
    const guardians = (await client.query("SELECT name FROM users WHERE role = 'parent'")).rows;
    assert(guardians.every((row) => !demo.hasTeamSurname(row.name)), 'no guardian carries a team surname');
    assert((await keptPasswords()) === passwordsBefore, 'no existing password or forced-change flag moved');
    assert((await keptGrades()) === gradesBefore, 'no existing grade moved');

    console.log('\nA second load');
    const twice = script('scripts/demo-load.js', ['--apply'], withSecrets);
    assert(twice.status === 2 && twice.out.includes('already loaded'), 'refused by the manifest');

    console.log('\nThe server agrees');
    server = spawn(process.execPath, [path.join(ROOT, 'migration', 'scripts', 'serve-pg.js')], { cwd: SERVER, env, stdio: 'ignore' });
    assert(await waitForHealth(), 'the API on 5010 answers on the gate database');

    const { rows: adminRows } = await client.query(`SELECT id, token_version FROM users WHERE login_id = $1`, [demo.ADMIN_LOGIN]);
    const admin = adminRows[0];
    const versions = JSON.parse(fs.readFileSync(path.join(SERVER, 'policy', 'versions.json'), 'utf8'));
    await client.query(`INSERT INTO policy_acceptances (user_id, document, version) VALUES ($1, 'privacy_notice', $2), ($1, 'terms_of_use', $3)`, [
      admin.id,
      versions.privacy_notice.version,
      versions.terms_of_use.version,
    ]);
    const token = signToken({ id: admin.id, role: 'admin', v: Number(admin.token_version) });

    const agreement = await serverAgrees(client, token);
    assert(agreement.classTerms > 300, `${agreement.classTerms} class-terms asked`);
    assert(agreement.compared > 4000, `${agreement.compared} grades compared with a real dry run of the class record`);
    assert(agreement.disagreed === 0, 'the server computes exactly what the load stored', `${agreement.disagreed} disagreed`);
    assert((await tableCount(client, 'notifications')) === notificationsBefore, 'the dry runs wrote no notification');
    assert(sameDigest(await digestOf(client), firstLoad), 'and left the data as it was');

    console.log('\nThe backup after the load');
    const backup = await api('POST', '/api/backups', token);
    assert(backup.status === 201, 'a backup through the app', String(backup.status));
    if (backup.status === 201) {
      const size = fs.statSync(backup.json.backup.file_path || path.join(SERVER, 'backups', backup.json.backup.filename)).size;
      console.log(`  Archive size after the load: ${Math.round(size / 1024)} KB`);
      const removed = await api('DELETE', `/api/backups/${backup.json.backup.id}`, token);
      assert(removed.status === 200, 'the gate removes its own backup');
    }
    await client.query('DELETE FROM policy_acceptances WHERE user_id = $1', [admin.id]);
    server.kill();
    server = null;

    console.log('\nThe undo');
    const preview = script('scripts/demo-undo.js');
    assert(preview.status === 0 && preview.out.includes('BEGIN READ ONLY'), 'the preview is READ ONLY');
    assert(sameDigest(await digestOf(client), firstLoad), 'the preview wrote nothing');
    const undo = script('scripts/demo-undo.js', ['--apply']);
    assert(undo.status === 0, 'the undo commits', `exit ${undo.status}`);
    assert(undo.out.includes('Every count equals the count before the load.'), 'the undo says every count is back, as the run sheet expects');
    const undone = await digestOf(client);
    assert(sameDigest(undone, baseline), 'every table is back to the fresh db:setup', differingKeys(undone, baseline));
    assert((await keptPasswords()) === passwordsBefore, 'existing passwords are still untouched');
    const secondUndo = script('scripts/demo-undo.js', ['--apply']);
    assert(secondUndo.status === 2, 'a second undo is refused: no manifest');

    console.log('\nDeterminism');
    const reload = script('scripts/demo-load.js', ['--apply'], withSecrets);
    assert(reload.status === 0, 'the load commits again', `exit ${reload.status}`);
    const secondLoad = await digestOf(client);
    assert(sameDigest(secondLoad, firstLoad), 'the second load is identical to the first', differingKeys(secondLoad, firstLoad));
    assert(script('scripts/demo-undo.js', ['--apply']).status === 0, 'and comes out the same way');
    assert(sameDigest(await digestOf(client), baseline), 'back to the fresh db:setup again');

    console.log('\nThe message clear');
    const { rows: pair } = await client.query(`SELECT id FROM users WHERE role IN ('teacher', 'admin') ORDER BY id LIMIT 2`);
    for (let i = 0; i < 3; i += 1) {
      await client.query('INSERT INTO messages (sender_id, receiver_id, body) VALUES ($1, $2, $3)', [pair[0].id, pair[1].id, 'gate fixture']);
    }
    const clearDry = script('scripts/demo-clear-messages.js');
    assert(clearDry.status === 0 && clearDry.out.includes('messages: 3'), 'counts only: messages: 3');
    assert((await tableCount(client, 'messages')) === 3, 'the dry run deleted nothing');
    const clear = script('scripts/demo-clear-messages.js', ['--apply']);
    assert(clear.status === 0 && clear.out.includes('messages: 3 -> 0'), 'messages: 3 -> 0');
    assert((await tableCount(client, 'messages')) === 0, 'the table is empty');
    assert((await tableCount(client, 'notifications')) === notificationsBefore, 'notifications are unchanged');
  } finally {
    if (server) server.kill();
    await client.end();
  }
}

async function main() {
  console.log('PART 1 — no database, no port');
  partOneMap();
  partOneLearners();
  partOneScores();
  partOnePlan();
  partOneGuards();
  if (process.argv.includes('--gate')) await gate();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  // A masked first line: a driver error can quote a key, and a key can be an LRN.
  const { safeMessage } = require('../../migration/lib/safeMessage');
  console.error(`The proof stopped: ${error.code || 'no code'} — ${safeMessage(error)}`);
  process.exitCode = 1;
});
