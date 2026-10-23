// CSV FOR A SPREADSHEET (feat/activity-log, B2): RFC 4180, opened in Excel.
//
// - UTF-8 with a byte-order mark. Without it Excel reads the file in the
//   machine's ANSI code page, and a name with an "ñ" or an em dash turns to
//   noise.
// - Every field quoted, an inner quote doubled, CRLF between records (RFC
//   4180 §2). A CR or LF inside a quoted field is legal and stays.
// - THE FORMULA GUARD. A cell that starts with =, +, -, @, a tab or a CR is
//   read by a spreadsheet as a formula, so a name typed as "=HYPERLINK(…)"
//   would run on the admin's machine. Such a cell gets a leading apostrophe —
//   the spreadsheet's own "this is text" mark — and shows as typed. EVERY cell
//   is guarded, not a chosen few: a guard that must be remembered per column
//   is the one that gets forgotten.

const BOM = '﻿';
const FORMULA_START = /^[=+\-@\t\r]/;

function guardCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return FORMULA_START.test(text) ? `'${text}` : text;
}

function csvField(value) {
  return `"${guardCell(value).replace(/"/g, '""')}"`;
}

function csvRecord(cells) {
  return cells.map(csvField).join(',');
}

// header: string[]; rows: unknown[][]. The whole file, BOM first, every record
// (the header included) ending in CRLF.
function buildCsv(header, rows) {
  return `${BOM}${[header, ...rows].map(csvRecord).join('\r\n')}\r\n`;
}

module.exports = { BOM, guardCell, csvField, csvRecord, buildCsv };
