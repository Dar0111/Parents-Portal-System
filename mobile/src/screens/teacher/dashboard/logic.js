// THE PURE HALF OF THE WEB'S TeacherDashboard.jsx, lifted into a module so
// scripts/proof-teacher-dashboard.mjs can drive it (§17b). `bannerFor` is
// the web's function, byte for byte in logic; only the file moved.
//
// Amber is not a verdict (§4): partial means "still doing it", not "late" or
// "bad". Green requires FULL coverage (Darryl, Q4) — the encode screen omits
// unset rows rather than defaulting them, so "some rows exist" is genuinely
// different from "the register is done". Late counts as present: the
// school's rule (2026-09-13), never DepEd's.
export function bannerFor(section, rows, rosterCount) {
  const recorded = rows.length;
  if (recorded === 0) {
    return { tone: 'warning', label: 'Not recorded', detail: 'No attendance recorded today.' };
  }
  const present = rows.filter((r) => r.status === 'Present' || r.status === 'Late').length;
  const absent = rows.filter((r) => r.status === 'Absent').length;
  if (rosterCount > 0 && recorded < rosterCount) {
    return {
      tone: 'warning',
      label: `${recorded} of ${rosterCount} recorded`,
      detail: `${present} present, ${absent} absent so far.`,
    };
  }
  return {
    tone: 'success',
    label: 'Recorded',
    detail: `${present} present, ${absent} absent.`,
  };
}

// The sections this teacher ADVISES, picked out of the unscoped reference
// list — there is no ?adviser_id= filter and inventing one would widen an
// endpoint for a dashboard. Number() on both sides: `adviser_id` arrives as
// a number from mysql2 and `user.id` from /auth/me, but a mismatch of type
// here would hide every banner and nothing would say why.
export function advisedSections(sections, userId) {
  return (sections || []).filter((s) => Number(s.adviser_id) === Number(userId));
}
