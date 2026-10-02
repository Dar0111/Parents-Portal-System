import StatusBadge from '../../../components/StatusBadge';
import { StatusButtons } from '../AttendancePage';
import { ROW_STATE_LABEL, rowState } from './roster';

// The desktop roster table's columns, in their own module so a proof can
// render them (§17b). They were an inline array inside `AttendancePage`,
// which made every claim about them — the headers, which state each cell
// reads — reachable only by regexing the file, and §17d is the record of
// what a source-text assertion is worth.
//
// WHY NOT SIMPLY EXPORT THEM FROM THE PAGE, which is where they were: that
// page's other exports are components, and a function export beside them
// trips `react(only-export-components)` — measured, it moved the oxlint
// baseline 43 → 45 the moment it shipped. Same rule that put the roster's
// pure logic in `roster.js`; this file is its JSX-shaped sibling, which is
// why it is `.jsx` and that one is `.js`.
//
// Everything these need is a parameter. Nothing is closed over, which is the
// property that makes them renderable outside the page at all.
//
// FIVE COLUMNS, and the middle three are one §5b argument:
//   Saved as  — the DATABASE (`recorded`), written only by loadRoster()
//   Status    — the DRAFT (`marks`), what the teacher is typing now
//   Row       — the two COMPARED, which is why they may not share state
export function rosterColumns({ recorded, marks, onPick }) {
  return [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      sortValue: (row) => `${row.last_name}, ${row.first_name}`,
      render: (row) => (
        <span className="font-semibold text-fg">
          {row.last_name}, {row.first_name}
        </span>
      ),
    },
    // nowrap: an LRN is an identifier and must never break across lines
    // (§5a-ii). Safe today because it contains no spaces, so default wrapping
    // cannot break it — the annotation is belt-and-braces, and it closes the
    // last of the queued nowrap items. Teacher → Grades, which the queue also
    // named, no longer exists.
    //
    // `tabular-nums` (feat/ui-refresh): twelve digits a row, read down a
    // column, line up digit under digit. The value is still `row.lrn`,
    // unformatted.
    {
      key: 'lrn',
      header: 'LRN',
      nowrap: true,
      render: (row) => <span className="tabular-nums">{row.lrn}</span>,
    },
    {
      key: 'recorded',
      // "Saved as", not "Recorded" (UI-A, 2026-09-23). The Row column's first
      // state IS the word "Recorded", so this header was one column's title
      // and another column's value — two columns apart, saying different
      // things with the same word (Darryl, browser check). Neither column
      // goes: §5b is the reason both exist. Only the header changed, and
      // "Saved as / Present" reads as the sentence it is.
      header: 'Saved as',
      // THE DATABASE, never the dropdown. Reads `recorded`, which only
      // loadRoster() writes. If you find yourself reaching for `marks` here,
      // that is the bug this comment exists to prevent — the two columns have
      // to be able to disagree, otherwise this one is decoration.
      render: (row) =>
        recorded.has(row.id) ? (
          <StatusBadge status={recorded.get(row.id)} />
        ) : (
          <span className="text-sm text-fg-muted">Not recorded</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      // The same four buttons as the phone card — one tap, not two, on every
      // row of a forty-learner roster.
      render: (row) => <StatusButtons student={row} marks={marks} onPick={onPick} size="web" />,
    },
    {
      key: 'row',
      header: 'Row',
      nowrap: true,
      // THE DATABASE AND THE DRAFT, told apart (§5b). "Recorded" reads
      // `recorded`; "Changed · not saved" is the two disagreeing. This is the
      // same distinction the old stored-status column made on its own, now
      // saying which of the two the teacher is looking at.
      //
      // The WORDS are the state; the unsaved one is also heavier, so it is
      // never colour alone. The span holds the label and nothing else — a
      // proof reads the row value straight out of the markup.
      render: (row) => {
        const state = rowState(row.id, marks, recorded);
        return (
          <span className={`text-sm ${state === 'changed' ? 'font-semibold text-warning-fg' : 'text-fg-muted'}`}>
            {ROW_STATE_LABEL[state]}
          </span>
        );
      },
    },
  ];
}
