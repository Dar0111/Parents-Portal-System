// THE PURE HALF OF THE WEB'S ReportCard.jsx, lifted so
// scripts/proof-report-card.mjs can drive it (§17b). The phone builds only
// the web's narrow "term view" (segments + subject rows); the wide table is
// not built. Everything here is the web's logic unchanged.

export function hasValue(entry, mode) {
  if (!entry) return false;
  return mode === 'descriptive' ? entry.descriptive_grade != null : entry.term_grade != null;
}

export function termStatuses(subjects, mode) {
  return [1, 2, 3].map((term) => {
    const recorded = subjects.filter((subject) => hasValue(subject.terms?.[term], mode)).length;
    return {
      term,
      recorded,
      total: subjects.length,
      state: recorded === 0 ? 'none' : recorded === subjects.length ? 'full' : 'partial',
    };
  });
}

export function joinTerms(terms) {
  if (terms.length === 1) return `Term ${terms[0]}`;
  const head = terms.slice(0, -1).join(', ');
  return `Terms ${head} and ${terms[terms.length - 1]}`;
}

// The status line: the latest term with anything recorded, and the terms
// with nothing. null `latest` means no grades at all.
export function statusLine(statuses) {
  const latest = [...statuses].reverse().find((status) => status.recorded > 0) || null;
  const missing = statuses.filter((status) => status.state === 'none').map((status) => status.term);
  if (!latest) return { label: 'No grades recorded yet', tone: 'neutral', missing: [] };
  const label =
    latest.state === 'full'
      ? `Term ${latest.term} recorded`
      : `Term ${latest.term} partly recorded (${latest.recorded} of ${latest.total})`;
  return { label, tone: latest.state === 'full' ? 'success' : 'neutral', missing };
}

// The segment the term view opens on: the latest term with data, else 1.
export function initialSegment(statuses) {
  const latest = [...statuses].reverse().find((status) => status.recorded > 0);
  return latest ? String(latest.term) : '1';
}

export const SEGMENTS = [
  { key: '1', label: 'Term 1' },
  { key: '2', label: 'Term 2' },
  { key: '3', label: 'Term 3' },
  { key: 'final', label: 'Final' },
];

export const NUMERICAL_LEGEND = [
  ['90 - 100', 'Advancing'],
  ['80 - 89', 'Benchmarking'],
  ['75 - 79', 'Connecting'],
  ['65 - 74', 'Developing'],
  ['Below 65', 'Emerging'],
];

export const DESCRIPTIVE_LEGEND = [
  ['A', 'Advancing'],
  ['B', 'Benchmarking'],
  ['C', 'Connecting'],
  ['D', 'Developing'],
  ['E', 'Emerging'],
];

export function readingNoteLines(mode, { hasTermGrade = false, canOpen = false } = {}) {
  const lines =
    mode === 'descriptive'
      ? [
          'This grade level uses descriptive grading (A to E).',
          'A term shows "Pending" until its letter can be worked out — written works, performance tasks and all three summative scores must be recorded first.',
          'The final letter for a learning area is worked out from the scores of all three terms, so it appears once every term has its scores recorded.',
          'There is no general average for this grade level.',
        ]
      : [
          'A term shows "Pending" until its grade can be computed — Written Works, Performance Tasks and all three examination scores must be recorded first.',
          ...(hasTermGrade
            ? ['Term grades follow the DepEd transmutation table, so a term grade is not the same as the percentage of the scores below.']
            : []),
          'The final grade for a learning area appears once all three terms are recorded.',
          "A term's general average appears once every learning area has that term recorded.",
          'The final general average appears once every learning area has a final grade.',
        ];
  return canOpen ? [...lines, 'Tap any grade to see the scores behind it.'] : lines;
}

// "Has a Final" and "has a General Average" are TWO flags (§5a-v): the
// final cell needs two renderers by mode, and only numerical mode has a
// general-average row at all.
export function finalCell(subject, mode) {
  return mode === 'descriptive'
    ? { kind: 'letter', entry: { descriptive_grade: subject.final_grade, descriptor: subject.final_grade_descriptor } }
    : { kind: 'number', value: subject.final_grade };
}

export function showGeneralAverage(mode) {
  return mode !== 'descriptive';
}
