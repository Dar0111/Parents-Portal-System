// MODULE 12 (2026-10-31) — THE DEMO DATA'S OWN PROOF.
//
//   npm run test:demo-data                 part 1: no database, no port. The
//                                          map, the learners, the plan's counts
//                                          against a seed-shaped fixture, every
//                                          refusal, the guards, the login list.
//   npm run test:demo-data -- --gate       part 1, then part 2 on the loopback
//                                          cluster, in parents_portal_demo:
//                                          load, the server agrees, rollback,
//                                          undo, determinism, demo:passwords,
//                                          the message clear.
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

    console.log('\nThe list since demo:passwords');
    const listed = fs.readFileSync(file, 'utf8');
    const rows = listed.split('\r\n').filter((line) => /^(yes|no) /.test(line));
    const onValue = (line, role, value) => line.split(/\s{2,}|\s/).includes(role) && line.endsWith(value);
    assert(rows.every((line) => onValue(line, 'teacher', demo.LOGIN_VALUES.teacher) || onValue(line, 'parent', demo.LOGIN_VALUES.parent)), 'every row names its role\'s value');
    assert(rows.filter((line) => line.endsWith(demo.LOGIN_VALUES.teacher)).length === 22, 'TEACHER VALUE on all 22 teachers, pre-confirmed included');
    assert(rows.filter((line) => line.endsWith(demo.LOGIN_VALUES.parent)).length === 345, 'PARENT VALUE on all 345 parents, pre-confirmed included');
    assert(!Object.values(demo.SECRET_KEYS).some((key) => listed.includes(key)), 'no variable from the load in the list');
    assert(listed.includes('saved nowhere else') && listed.includes(demo.LOGIN_VALUES.teacher), 'the header says which value is which and where the values are not');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// PART 1 — planPasswords and the guards of demo-passwords.js
// ---------------------------------------------------------------------------
const PRODUCTION_KEPT = Object.freeze({
  [demo.sectionKey(6, 'Malikhain')]: 2,
  [demo.sectionKey(5, 'Masigasig')]: 1,
  [demo.sectionKey(1, 'Mabait')]: 2,
});
const seatOne = (grade) => demo.lrnFor(demo.SECTIONS.find((section) => section.grade === grade && section.demo), 1);
const seatIn = (name, seat) => demo.lrnFor(demo.SECTIONS.find((section) => section.name === name), seat);

// The rows as the load left them.
function passwordAccounts(keptBySection) {
  const confirmed = new Set(demo.confirmedNewLogins());
  const logins = [
    ...demo.TEACHERS.map((teacher) => ({ login_id: teacher.login_id, role: 'teacher' })),
    ...demo.newLearners(keptBySection).map((learner) => ({ login_id: learner.lrn, role: 'parent' })),
  ];
  return logins.map((row, index) => {
    const pre = confirmed.has(row.login_id);
    return {
      ...row,
      id: 1000 + index,
      password: pre ? 'stored-confirmed' : `stored-${row.role}`,
      email: pre ? 'load@example.test' : null,
      email_verified_at: pre ? '2026-11-01' : null,
      contact_verified_at: null,
      password_changed_at: null,
      token_version: 0,
      must_change_password: pre ? 0 : 1,
    };
  });
}

function partOnePasswords() {
  console.log('\nplanPasswords');
  const sender = 'sender@example.test';
  const facts = (accounts, extra = {}) => ({
    accounts,
    keptAccounts: [{ id: 1, email: 'load@example.test' }, { id: 2, email: sender }, { id: 3, email: 'own@example.test' }],
    manifest: { contacts: [{ id: 1, email_set: 'load@example.test' }, { id: 2, email_set: 'load@example.test' }] },
    markedStudents: accounts.filter((row) => row.role === 'parent').length,
    sender,
    ...extra,
  });
  const edit = (accounts, login, change) => accounts.map((row) => (row.login_id === login ? { ...row, ...change } : row));

  const logins = demo.confirmedNewLogins();
  assert(new Set(logins).size === 11, '11 new pre-confirmed logins');
  assert(logins.filter((login) => login.startsWith(demo.TEACHER_PREFIX)).length === 5, 'five of them teachers');
  assert(logins.filter((login) => login.startsWith(demo.LRN_PREFIX)).length === 6, 'six of them parents');
  assert(!logins.some((login) => [demo.ADMIN_LOGIN, ...demo.SEEDED_TEACHERS].includes(login)), 'no kept account among them');

  const fresh = passwordAccounts(PRODUCTION_KEPT);
  assert(fresh.length === 367, 'the production shape: 367 accounts', String(fresh.length));
  const clean = demo.planPasswords(facts(fresh));
  assert(clean.refusals.length === 0, 'nothing refused', clean.refusals.join(' '));
  assert(clean.write.teacher.length === 22 && clean.write.parent.length === 345 && clean.skipped.length === 0, 'an untouched load: all 22 and all 345');
  assert(clean.contactFix.length === 11, 'the contact fix reaches all 11');

  let changed = edit(fresh, demo.CONFIRMED_NEW_TEACHERS[4], { password_changed_at: '2026-11-02', token_version: 1 });
  changed = edit(changed, seatOne(6), { password_changed_at: '2026-11-02', token_version: 1 });
  for (const login of [seatIn('Mabait', 2), seatIn('Masikap', 2)]) {
    changed = edit(changed, login, { password_changed_at: '2026-11-02', token_version: 2, email: 'own@example.test', email_verified_at: '2026-11-02', must_change_password: 0 });
  }
  const production = demo.planPasswords(facts(changed));
  assert(production.refusals.length === 0, 'the four changed accounts refuse nothing', production.refusals.join(' '));
  assert(production.write.teacher.length === 21 && production.write.parent.length === 342, 'the expected production run: 21 teachers, 342 parents');
  assert(production.skipped.length === 4 && production.skippedPassword === 4, 'skipped 4, password changed 4');
  assert(production.contactFix.length === 11, 'DEMO-TCH-024 and the Grade 6 parent still get the contact fix');
  const skippedIds = new Set(production.skipped.map((row) => row.id));
  assert(![...production.write.teacher, ...production.write.parent].some((id) => skippedIds.has(id)), 'no skipped account is written');

  const onlyContact = demo.planPasswords(facts(edit(fresh, seatIn('Mabait', 3), { email: 'own@example.test', email_verified_at: '2026-11-02' })));
  assert(onlyContact.skippedContact === 1 && onlyContact.write.parent.length === 344, 'a contact confirmed with no password change is skipped');
  const ownContact = demo.planPasswords(facts(edit(fresh, seatOne(3), { contact_verified_at: '2026-11-02' })));
  assert(ownContact.contactKept === 1 && ownContact.contactFix.length === 10, 'a holder\'s own confirmed number keeps the contact out of the fix');
  const unverified = demo.planPasswords(facts(edit(fresh, seatOne(3), { email_verified_at: null })));
  assert(unverified.contactKept === 1 && unverified.skippedContact === 1, 'a pre-confirmed email no longer confirmed is the holder\'s, and is left');
  const correct = demo.planPasswords(facts(edit(fresh, seatOne(3), { email: sender })));
  assert(correct.contactCorrect === 1 && correct.contactFix.length === 10, 'an email already on the sender is not rewritten');

  assert(clean.keptOnLoadAddress === 1 && clean.keptTotal === 3, 'kept accounts: only a manifest row still on its address counts');
  const noneLeft = demo.planPasswords(facts(fresh, { manifest: { contacts: [] } }));
  assert(noneLeft.keptOnLoadAddress === 0 && noneLeft.keptTotal === 3, 'no manifest contact: 0 of 3');

  const refusedBy = (input) => demo.planPasswords(input).refusals.length > 0;
  assert(refusedBy(facts(fresh.slice(1))), 'a missing teacher is refused');
  assert(refusedBy(facts(fresh, { markedStudents: 344 })), 'parents and marked learners that differ are refused');
  assert(refusedBy(facts(fresh.filter((row) => row.login_id !== seatOne(4)), { markedStudents: 344 })), 'a missing pre-confirmed account is refused');
  assert(refusedBy(facts(edit(fresh, seatIn('Mabait', 3), { must_change_password: 0 }))), 'a forced-change flag the load did not set is refused');
  assert(refusedBy(facts(edit(fresh, seatOne(3), { must_change_password: 1 }))), 'a pre-confirmed account in forced change is refused');
  assert(refusedBy(facts([...fresh, { ...fresh[0], id: 1, login_id: demo.ADMIN_LOGIN, role: 'admin' }])), 'a kept account in the marked rows is refused');

  console.log('\ndemo-passwords.js refuses before any connection');
  const base = { ...process.env, PG_SSL: 'require', PG_MIGRATE_PASSWORD: crypto.randomBytes(8).toString('hex') };
  for (const key of Object.values(demo.SECRET_KEYS)) delete base[key];
  delete base[demo.HOSTED_FLAG];
  const loopback = { ...base, PG_HOST: '127.0.0.1', PG_SSL: 'disable' };
  const teacherValue = `${crypto.randomBytes(6).toString('hex')}7`;
  const parentValue = `${crypto.randomBytes(6).toString('hex')}8`;
  const both = { DEMO_TEACHER_PASSWORD: teacherValue, DEMO_PARENT_PASSWORD: parentValue, SMTP_USER: sender };
  const run = (env, args = []) => child('scripts/demo-passwords.js', args, env);
  const secrets = [teacherValue, parentValue];

  const hosted = run({ ...base, PG_HOST: 'db.example.test', ...both }, ['--apply']);
  assert(hosted.status === 2 && hosted.out.includes(demo.HOSTED_FLAG), 'hosted --apply without the flag is refused', String(hosted.status));
  assertClean('hosted refusal', hosted.out, secrets);
  const wrongFlag = run({ ...base, PG_HOST: 'db.example.test', ...both, [demo.HOSTED_FLAG]: 'yes' }, ['--apply']);
  assert(wrongFlag.status === 2 && wrongFlag.out.includes(demo.HOSTED_FLAG), 'hosted --apply with a wrong flag value is refused');
  const none = run({ ...loopback, DEMO_TEACHER_PASSWORD: '', DEMO_PARENT_PASSWORD: '', SMTP_USER: '' });
  assert(none.status === 2 && ['DEMO_TEACHER_PASSWORD', 'DEMO_PARENT_PASSWORD', 'SMTP_USER'].every((key) => none.out.includes(key)), 'no value set: all three named');
  const oneOnly = run({ ...loopback, ...both, DEMO_PARENT_PASSWORD: '' });
  assert(oneOnly.status === 2 && oneOnly.out.includes('DEMO_PARENT_PASSWORD is not set') && !oneOnly.out.includes('DEMO_TEACHER_PASSWORD is'), 'one value alone is refused, naming the other');
  const shortValue = 'short1';
  const weak = run({ ...loopback, ...both, DEMO_TEACHER_PASSWORD: shortValue });
  assert(weak.status === 2 && weak.out.includes('DEMO_TEACHER_PASSWORD does not meet the password rule') && !weak.out.includes(shortValue), 'a weak value is refused, the value not printed');
  const same = run({ ...loopback, ...both, DEMO_PARENT_PASSWORD: teacherValue });
  assert(same.status === 2 && same.out.includes('must differ') && !same.out.includes(teacherValue), 'two equal values are refused');
  const displayName = run({ ...loopback, ...both, SMTP_USER: `Portal <${sender}>` });
  assert(displayName.status === 2 && displayName.out.includes('SMTP_USER is not a bare email address') && !displayName.out.includes(sender), 'a sender with a display name is refused, the value not printed');
  const notAddress = run({ ...loopback, ...both, SMTP_USER: 'not-an-address' });
  assert(notAddress.status === 2 && notAddress.out.includes('SMTP_USER is not a bare email address') && !notAddress.out.includes('not-an-address'), 'a sender that is no address is refused');
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

// ---------------------------------------------------------------------------
// PART 2 — demo:passwords, on a real load
// ---------------------------------------------------------------------------
async function userSnapshot(client) {
  const { rows } = await client.query('SELECT id, to_jsonb(u) AS row FROM users u');
  return new Map(rows.map((row) => [row.id, row.row]));
}

// The ids whose row differs anywhere the script may not write. `allowed` names
// per id what it may: the password, the email, and updated_at with either, by
// the trigger. Every other row is compared on every column, updated_at included.
function outsideWrite(before, after, allowed = { password: new Set(), email: new Set() }) {
  const wrong = [];
  if (before.size !== after.size) wrong.push('row count');
  for (const [id, row] of before) {
    const now = after.get(id) || {};
    const may = new Set();
    if (allowed.password.has(id)) may.add('password');
    if (allowed.email.has(id)) may.add('email');
    if (may.size) may.add('updated_at');
    if (Object.keys(row).some((key) => !may.has(key) && row[key] !== now[key])) wrong.push(id);
  }
  return wrong.length;
}

async function everyTableCount(client) {
  const { rows } = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'portal' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  const counts = {};
  for (const { table_name: table } of rows) counts[table] = await tableCount(client, table);
  return counts;
}

// Compiled in memory, as migration/scripts/serve-pg.js does its mutants: nothing
// on disk changes. The plan is told nothing was changed, so every account is
// offered for writing; `removeSql` also takes the clause off both statements.
function mutant(removeSql) {
  return `
    const fs = require('fs');
    const path = require('path');
    const Module = require('module');
    const demo = require('./scripts/demoData');
    const real = demo.planPasswords;
    const pre = new Set(demo.confirmedNewLogins());
    demo.planPasswords = (facts) => real({
      ...facts,
      accounts: facts.accounts.map((row) => ({
        ...row,
        password_changed_at: null,
        token_version: 0,
        contact_verified_at: null,
        email_verified_at: pre.has(row.login_id) ? 'x' : null,
        must_change_password: pre.has(row.login_id) ? 0 : 1,
      })),
    });
    const file = path.resolve('scripts/demo-passwords.js');
    let source = fs.readFileSync(file, 'utf8');
    ${
      removeSql
        ? `source = source.replace(' AND password_changed_at IS NULL AND token_version = 0', '');
           source = source.replace(' AND contact_verified_at IS NULL AND email_verified_at IS NOT NULL', '');`
        : ''
    }
    process.argv.push('--apply');
    const copy = new Module(file);
    copy.filename = file;
    copy.paths = Module._nodeModulePaths(path.dirname(file));
    copy._compile(source, file);
    copy.exports.run();
  `;
}

async function passwordsGate({ client, env, script, secrets, secretValues, keptPasswords, passwordsBefore }) {
  const { signToken } = require('../utils/jwt');
  const { comparePassword } = require('../utils/password');
  const SCRIPT = 'scripts/demo-passwords.js';
  const sender = 'demo.sender@example.test';
  const fresh = (tail) => `${crypto.randomBytes(10).toString('hex')}${tail}`;
  const values = { DEMO_TEACHER_PASSWORD: fresh('4'), DEMO_PARENT_PASSWORD: fresh('5'), SMTP_USER: sender };
  const secondValues = { DEMO_TEACHER_PASSWORD: fresh('6'), DEMO_PARENT_PASSWORD: fresh('7'), SMTP_USER: sender };
  secrets.push(values.DEMO_TEACHER_PASSWORD, values.DEMO_PARENT_PASSWORD, secondValues.DEMO_TEACHER_PASSWORD, secondValues.DEMO_PARENT_PASSWORD);
  const ownParentPassword = fresh('8');
  secrets.push(ownParentPassword);
  const withValues = { ...env, ...values };

  const account = async (login) => (await client.query('SELECT id, role::text AS role, token_version, student_id FROM users WHERE login_id = $1', [login])).rows[0];
  const adminRow = await account(demo.ADMIN_LOGIN);
  const tokenFor = (row) => signToken({ id: row.id, role: row.role, v: Number(row.token_version) });
  const versions = JSON.parse(fs.readFileSync(path.join(SERVER, 'policy', 'versions.json'), 'utf8'));
  const accept = (row) =>
    client.query(`INSERT INTO policy_acceptances (user_id, document, version, student_id) VALUES ($1, 'privacy_notice', $2, $4), ($1, 'terms_of_use', $3, $4)`, [
      row.id,
      versions.privacy_notice.version,
      versions.terms_of_use.version,
      row.student_id,
    ]);
  const signIn = async (login, password) => {
    const result = await api('POST', '/api/auth/login', '', { login_id: login, password });
    return { status: result.status, user: result.json && result.json.user };
  };

  const preTeacher = demo.CONFIRMED_NEW_TEACHERS[4];
  const preParent = seatOne(6);
  const writtenPreTeacher = demo.CONFIRMED_NEW_TEACHERS[0];
  const writtenPreParent = seatOne(2);
  const otherTeacher = demo.TEACHERS.map((teacher) => teacher.login_id).find((login) => !demo.CONFIRMED_NEW_TEACHERS.includes(login));
  const otherParent = seatIn('Mabait', 4);
  const tempParent = seatIn('Mabait', 2);
  const contactParent = seatIn('Masikap', 2);

  // A token signed here must verify there, and sign-in needs a JWT_SECRET
  // (utils/loginThrottle.js) that a worktree's missing .env does not give it.
  const serverEnv = { ...env, JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me' };
  const server = spawn(process.execPath, [path.join(ROOT, 'migration', 'scripts', 'serve-pg.js')], { cwd: SERVER, env: serverEnv, stdio: 'ignore' });
  try {
    console.log('\ndemo:passwords — four accounts changed the way production\'s were');
    assert(await waitForHealth(), 'the API is up for the fixtures');
    const adminToken = tokenFor(adminRow);
    await accept(adminRow);

    const teacherRow = await account(preTeacher);
    await accept(teacherRow);
    const byTeacher = await api('PUT', '/api/auth/change-password', tokenFor(teacherRow), {
      current_password: secretValues.DEMO_CONFIRMED_PASSWORD,
      new_password: values.DEMO_TEACHER_PASSWORD,
    });
    assert(byTeacher.status === 200, 'a pre-confirmed teacher changes the password through the real route', String(byTeacher.status));

    const parentRow = await account(preParent);
    await accept(parentRow);
    const byParent = await api('PUT', '/api/auth/change-password', tokenFor(parentRow), {
      current_password: secretValues.DEMO_CONFIRMED_PASSWORD,
      new_password: ownParentPassword,
    });
    assert(byParent.status === 200, 'a pre-confirmed parent changes the password through the real route', String(byParent.status));

    const tempRow = await account(tempParent);
    const temporary = await api('POST', `/api/users/${tempRow.id}/temp-password`, adminToken);
    assert(temporary.status === 200, 'an admin gives another parent a temporary password', String(temporary.status));
    await client.query(`UPDATE users SET email = 'own.one@example.test', email_verified_at = portal.now_s(), must_change_password = 0 WHERE id = $1`, [tempRow.id]);
    const contactRow = await account(contactParent);
    await client.query(`UPDATE users SET email = 'own.two@example.test', email_verified_at = portal.now_s() WHERE id = $1`, [contactRow.id]);

    const { rows: marked } = await client.query(
      `SELECT id, login_id, role::text AS role FROM users
        WHERE (role = 'teacher' AND login_id COLLATE "und-x-icu" LIKE $1) OR (role = 'parent' AND login_id COLLATE "und-x-icu" LIKE $2)`,
      [`${demo.TEACHER_PREFIX}%`, `${demo.LRN_PREFIX}%`]
    );
    const skipped = new Set([teacherRow.id, parentRow.id, tempRow.id, contactRow.id]);
    const preIds = marked.filter((row) => demo.confirmedNewLogins().includes(row.login_id)).map((row) => row.id);
    const writtenIds = marked.filter((row) => !skipped.has(row.id)).map((row) => row.id);
    const allowed = { password: new Set(writtenIds), email: new Set(preIds) };
    assert(preIds.length === 11 && writtenIds.length === marked.length - 4, '11 pre-confirmed, four skipped');

    console.log('\ndemo:passwords — the dry run');
    const quiet = await userSnapshot(client);
    const dry = script(SCRIPT, [], withValues);
    assert(dry.status === 0, 'the dry run exits 0', `exit ${dry.status}`);
    for (const line of [
      'Target: loopback.',
      'BEGIN READ ONLY: a dry run, nothing can be written.',
      'Marked: 22 teachers, 346 parents. Manifest present.',
      'Will set: 21 teachers, 343 parents.',
      'Skipped: 4 (password changed 3, contact confirmed 1).',
      "Skipped accounts already on their role's typed value: 1 of 4 (information only).",
      'Stored hashes to replace: 2 teachers, 2 parents.',
      'Contact fix: 11 of 11 (own contact kept 0, already correct 0).',
      "Kept accounts still on the load's address: 3 of 3.",
      'Dry run complete. Nothing was written.',
    ]) {
      assert(dry.out.includes(line), `dry run prints: ${line}`);
    }
    assert(outsideWrite(quiet, await userSnapshot(client)) === 0, 'the dry run changed no row');
    console.log(dry.out.trim().split(/\r?\n/).map((line) => `    | ${line}`).join('\n'));

    console.log('\ndemo:passwords — refusals on the database');
    await client.query(`UPDATE system_settings SET setting_key = 'demo_load_hidden' WHERE setting_key = $1`, [demo.MANIFEST_KEY]);
    const noManifest = script(SCRIPT, ['--apply'], withValues);
    await client.query(`UPDATE system_settings SET setting_key = $1 WHERE setting_key = 'demo_load_hidden'`, [demo.MANIFEST_KEY]);
    assert(noManifest.status === 2 && noManifest.out.includes('manifest is missing'), 'no manifest, no run', `exit ${noManifest.status}`);
    assert(outsideWrite(quiet, await userSnapshot(client)) === 0, 'and nothing written');

    await client.query(`CREATE FUNCTION portal.demo_gate_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'gate failure'; END $$`);
    await client.query('CREATE TRIGGER demo_gate_fail BEFORE INSERT ON portal.activity_logs FOR EACH ROW EXECUTE FUNCTION portal.demo_gate_fail()');
    const broken = script(SCRIPT, ['--apply'], withValues);
    await client.query('DROP TRIGGER demo_gate_fail ON portal.activity_logs');
    await client.query('DROP FUNCTION portal.demo_gate_fail()');
    assert(broken.status === 1 && broken.out.includes('FAILED at activity'), 'a failure on the last write stops it', `exit ${broken.status}`);
    assert(outsideWrite(quiet, await userSnapshot(client)) === 0, 'and the whole transaction rolled back');

    console.log('\ndemo:passwords — the apply');
    const countsBefore = await everyTableCount(client);
    const othersBefore = await digestOf(client);
    const before = await userSnapshot(client);
    const applied = script(SCRIPT, ['--apply'], withValues);
    assert(applied.status === 0 && applied.out.includes('Passwords committed.'), 'the apply commits', `exit ${applied.status}`);
    assert(applied.out.includes('Set: 21 teachers, 343 parents. Contact fix: 11.'), 'and prints what it set');
    const after = await userSnapshot(client);

    const outside = outsideWrite(before, after, allowed);
    assert(outside === 0, `every users row and column byte-equal outside the password of ${writtenIds.length} rows and the email of ${preIds.length}`, `${outside} rows differ`);
    const tampered = new Map(after);
    tampered.set(teacherRow.id, { ...after.get(teacherRow.id), password: 'x' });
    assert(outsideWrite(before, tampered, allowed) === 1, 'negative control: that comparison sees one skipped account overwritten');

    assert(writtenIds.every((id) => before.get(id).password !== after.get(id).password), 'every written account has a new stored hash');
    assert([...skipped].every((id) => before.get(id).password === after.get(id).password), 'every skipped account keeps its stored hash');
    assert([...skipped].every((id) => before.get(id).email === after.get(id).email || preIds.includes(id)), 'the two skipped other parents keep their own email');
    assert(writtenIds.every((id) => after.get(id).password_changed_at === null && after.get(id).token_version === 0), 'password_changed_at and token_version stay as the load left them');
    assert((await keptPasswords()) === passwordsBefore, 'the eight kept accounts keep password and forced-change flag');

    const written = (role) => writtenIds.filter((id) => after.get(id).role === role);
    const hashesOf = (ids) => [...new Set(ids.map((id) => after.get(id).password))];
    const [teacherHash, ...moreTeacher] = hashesOf(written('teacher'));
    const [parentHash, ...moreParent] = hashesOf(written('parent'));
    assert(moreTeacher.length === 0 && moreParent.length === 0, 'one stored hash per value');
    assert(await comparePassword(values.DEMO_TEACHER_PASSWORD, teacherHash), 'the teachers\' hash is the teacher value');
    assert(await comparePassword(values.DEMO_PARENT_PASSWORD, parentHash), 'the parents\' hash is the parent value');
    assert(!(await comparePassword(values.DEMO_PARENT_PASSWORD, teacherHash)), 'and not the parent value');
    assert(preIds.every((id) => skipped.has(id) || after.get(id).must_change_password === 0), 'pre-confirmed state kept: no forced change');

    assert(preIds.every((id) => after.get(id).email === sender), 'F3: all 11 emails equal the configured sender, the two skipped ones included');
    assert(preIds.every((id) => before.get(id).email_verified_at === after.get(id).email_verified_at), 'F3: email_verified_at unchanged');
    assert([...after.keys()].filter((id) => after.get(id).email === sender).length === 11, 'F3: nobody else holds the sender');
    assert((await countOf(client, 'SELECT COUNT(*) AS n FROM users WHERE login_id = ANY($1::text[]) AND email = $2', [demo.CONFIRMED_EXISTING, secretValues.DEMO_CONTACT_EMAIL])) === 3, 'F3: the kept accounts stay on what they held');

    const countsAfter = await everyTableCount(client);
    const movedTables = Object.keys(countsBefore).filter((table) => countsBefore[table] !== countsAfter[table]);
    assert(movedTables.length === 1 && movedTables[0] === 'activity_logs' && countsAfter.activity_logs === countsBefore.activity_logs + 1, `one activity row, and no other of ${Object.keys(countsBefore).length} tables changed count`, movedTables.join(', '));
    assert((await countOf(client, `SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'demo_passwords_set'`)) === 1, 'one demo_passwords_set row');
    const othersAfter = await digestOf(client);
    delete othersBefore.users;
    delete othersAfter.users;
    assert(sameDigest(othersAfter, othersBefore), 'learners, grades, attendance, slots and settings byte-equal', differingKeys(othersBefore, othersAfter));

    console.log('\ndemo:passwords — real sign-ins');
    const preT = await signIn(writtenPreTeacher, values.DEMO_TEACHER_PASSWORD);
    assert(preT.status === 200 && preT.user.policy_pending && !preT.user.contact_pending && !preT.user.must_change_password, 'pre-confirmed teacher: consent next, no contact step, no password step', String(preT.status));
    const preP = await signIn(writtenPreParent, values.DEMO_PARENT_PASSWORD);
    assert(preP.status === 200 && preP.user.policy_pending && !preP.user.contact_pending && !preP.user.must_change_password, 'pre-confirmed parent: the same', String(preP.status));
    const otherT = await signIn(otherTeacher, values.DEMO_TEACHER_PASSWORD);
    assert(otherT.status === 200 && otherT.user.policy_pending && otherT.user.contact_pending && otherT.user.must_change_password === 1, 'other teacher: consent, contact and password all still ahead', String(otherT.status));
    const otherP = await signIn(otherParent, values.DEMO_PARENT_PASSWORD);
    assert(otherP.status === 200 && otherP.user.policy_pending && otherP.user.contact_pending && otherP.user.must_change_password === 1, 'other parent: the same', String(otherP.status));
    assert((await signIn(writtenPreTeacher, secretValues.DEMO_CONFIRMED_PASSWORD)).status === 401, 'the load\'s pre-confirmed value is dead');
    assert((await signIn(otherTeacher, secretValues.DEMO_TEACHER_PASSWORD)).status === 401, 'the load\'s teacher value is dead');
    assert((await signIn(otherParent, values.DEMO_TEACHER_PASSWORD)).status === 401, 'a parent cannot use the teacher value');
    assert((await signIn(preParent, ownParentPassword)).status === 200, 'a skipped account still signs in with its own');

    console.log('\ndemo:passwords — the re-run repairs a mistyped value');
    const holder = await account(seatOne(3));
    await client.query(`UPDATE users SET email = 'own.three@example.test', contact_number = '09170000000', contact_verified_at = portal.now_s() WHERE id = $1`, [holder.id]);
    const beforeSecond = await userSnapshot(client);
    const second = script(SCRIPT, ['--apply'], { ...env, ...secondValues });
    assert(second.status === 0 && second.out.includes('Set: 21 teachers, 342 parents. Contact fix: 0.'), 'the same accounts are written again, less the one that confirmed a number', `exit ${second.status}`);
    const afterSecond = await userSnapshot(client);
    assert(afterSecond.get(holder.id).email === 'own.three@example.test' && afterSecond.get(holder.id).password === beforeSecond.get(holder.id).password, 'a holder\'s own confirmed contact is left, email and password');
    assert((await signIn(writtenPreTeacher, secondValues.DEMO_TEACHER_PASSWORD)).status === 200, 'the second value signs in');

    console.log('\ndemo:passwords — negative controls, compiled in memory');
    const raceBefore = await userSnapshot(client);
    const race = child('-e', [mutant(false)], { ...env, ...secondValues });
    assertClean('the plan told nothing changed', race.out, secrets);
    assert(race.status === 2 && race.out.includes('An account changed during the run'), 'a plan that offers a changed account is refused by the statement: the same as a holder changing it mid-run', `exit ${race.status}`);
    assert(outsideWrite(raceBefore, await userSnapshot(client)) === 0, 'and nothing was written');
    const blind = child('-e', [mutant(true)], { ...env, ...secondValues });
    assertClean('the skip removed', blind.out, secrets);
    const overwritten = outsideWrite(raceBefore, await userSnapshot(client), { password: new Set(writtenIds.filter((id) => id !== holder.id)), email: new Set() });
    assert(blind.status === 0 && overwritten > 0, `with the skip removed the gate sees ${overwritten} accounts overwritten`, `exit ${blind.status}`);
    assert((await keptPasswords()) === passwordsBefore, 'even then the markers keep every kept account out');

    await client.query('DELETE FROM policy_acceptances WHERE user_id = $1', [adminRow.id]);
  } finally {
    server.kill();
    await waitFor(500);
  }
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
    await passwordsGate({ client, env, script, secrets, secretValues, keptPasswords, passwordsBefore });
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
  partOnePasswords();
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
