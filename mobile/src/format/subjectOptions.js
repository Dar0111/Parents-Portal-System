// A teacher's subject choices on Grades, from their own GET /assignments rows
// (F2, D-196). Mirrored byte for byte on the phone (mobile/scripts/check-mirrors.mjs).
//
// Each grade's MAPEH is its own `subjects` row (uq_subject_grade), so a teacher
// who holds MAPEH in Grades 5 and 6 has two entries with one name. Only a name
// that repeats in THIS teacher's list carries its grade, as "MAPEH · Grade 5".
// Every other name stays bare: the Class choice beside it already says the
// grade, and a label on all of them would change every other teacher's list.
//
// The rows arrive in GET /assignments' own order (grade, section, the school's
// printed subject order) and a Map keeps first-insertion order. Do not re-sort.
function nameKey(name) {
  return String(name).trim().toLowerCase();
}

export function subjectOptions(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.subject_id)) {
      byId.set(row.subject_id, { id: row.subject_id, name: row.subject_name, grade_level: row.grade_level });
    }
  }
  const subjects = [...byId.values()];

  const counts = new Map();
  for (const subject of subjects) {
    const key = nameKey(subject.name);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return subjects.map(({ id, name, grade_level: gradeLevel }) => ({
    id,
    name,
    label: counts.get(nameKey(name)) > 1 ? `${name} · Grade ${gradeLevel}` : name,
  }));
}
