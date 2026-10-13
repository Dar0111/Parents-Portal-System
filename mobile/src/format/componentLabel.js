// The name of one score row on a parent's grade breakdown (fix/smoke-round,
// F5) — the class record's own name for that column, so a parent and the
// teacher read the same thing.
//
// A row written from the grid carries its slot: the CODE is type + number,
// "WW1", "PT2" — exactly what the grid's column header shows
// (pages/teacher/classRecord/SlotHeader.jsx) — and a column the teacher
// named keeps that name after it: "WW1 · Long quiz". GET /api/grades/:id
// joins slot_type, slot_no and slot_name onto every row.
//
// A LEGACY row (written before the grid; no slot) has no code. It keeps the
// server's display_label — the label it was written with, else "Written
// Work" / "Performance Task".
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
    const code = `${row.slot_type}${row.slot_no}`;
    const name = typeof row.slot_name === 'string' ? row.slot_name.trim() : '';
    return name ? `${code} · ${name}` : code;
  }
  return row.display_label || row.label || '';
}
