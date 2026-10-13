// The name of one score row on a parent's grade breakdown (fix/smoke-round,
// F5; the owner's decision after the device check's section 3) — the name the
// class record's own helper promises the teacher: "Left blank, this column is
// called “Written Work 1” here and on the parent's grade breakdown"
// (pages/teacher/classRecord/SlotHeader.jsx; the phone's SlotScreen).
//
// A row written from the grid carries its slot — GET /api/grades/:id joins
// slot_type, slot_no and slot_name onto every row:
//   - an UNNAMED column is its full name: "Written Work 1", "Performance Task 2";
//   - a NAMED column is its name alone: "Group project".
// That is the server's slotDisplayLabel (utils/validateScore.js), the
// display_label it already sends; built here from the slot so a grid row can
// never print a bare code or nothing. The teacher's grid keeps its column CODE
// ("PT1", the name under it): a header under a group label is a different
// place from a parent's list.
//
// A LEGACY row (written before the grid; no slot) keeps the server's
// display_label — the label it was written with, else "Written Work" /
// "Performance Task".
//
// WHY THIS EXISTS: both clients printed `row.label`, which is NULL for every
// score written from the grid (the column's name lives on the slot), so the
// breakdown showed scores with no names at all.
//
// MIRRORED: mobile/src/format/componentLabel.js is a byte-for-byte copy
// (`npm run lint:mirrors`).

export function componentLabel(row) {
  if (!row) return '';
  if (row.slot_id != null && (row.slot_type === 'WW' || row.slot_type === 'PT') && row.slot_no != null) {
    const name = typeof row.slot_name === 'string' ? row.slot_name.trim() : '';
    if (name) return name;
    return `${row.slot_type === 'WW' ? 'Written Work' : 'Performance Task'} ${row.slot_no}`;
  }
  return row.display_label || row.label || '';
}
