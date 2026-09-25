// UI-C1a render proof — the timezone fix.
//
// RUN FROM `client/`, AND RUN IT TWICE, UNDER TWO ZONES:
//
//   npx vite build --ssr scripts/ssr-dates.jsx --outDir .ssr-tmp
//   TZ=UTC              node .ssr-tmp/ssr-dates.js
//   TZ=America/New_York node .ssr-tmp/ssr-dates.js
//
// THE SECOND RUN IS THE POINT. Every assertion below must give the SAME
// answer in both, because the school's calendar day is a fact about the
// school and not about the machine rendering it. A helper that reads the
// host zone passes under TZ=UTC on a PH laptop and fails in New York — and
// the bug this dispatch fixes was exactly that shape, one layer down.
//
// Add `NODE_ENV=development` to see the DEV guard fire; without it the guard
// is tree-shaken out (§17f) and the fallback is what gets exercised. Both
// are asserted, each under the build that can see them.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import DataTable from '../src/components/DataTable.jsx';
import {
  calendarDaysAgo,
  calendarDaysAgoLabel,
  dateTime,
  longDate,
  shortDate,
  timestampDay,
} from '../src/format/date.js';
import teacherAnnouncementCard from '../src/pages/teacher/announcements/card.jsx';
import parentLetterCard from '../src/pages/parent/excuseLetters/card.jsx';
import teacherLetterCard from '../src/pages/teacher/excuseLetters/card.jsx';
import teacherEventCard from '../src/pages/teacher/events/card.jsx';

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS — ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL — ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}
const render = (node) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

console.log(`UI-C1a — dates, under TZ=${process.env.TZ || '(host default)'}:\n`);

// --------------------------------------------- 1. the bug, at its boundary
console.log('1. the 08:00 PH rollover:');

// Measured from the real database, not invented: a row written at
// 2026-09-25 07:00:00 PH leaves the API as this exact string.
const MORNING = '2026-09-24T23:00:00.000Z';
assert(timestampDay(MORNING) === '25 Sep 2026', 'a 07:00 PH post is 25 Sep, not 24 Sep', timestampDay(MORNING));
assert(
  timestampDay(MORNING, { style: 'long' }) === '25 September 2026',
  'and the long form agrees'
);
assert(
  String(MORNING).slice(0, 10) === '2026-09-24',
  'NEGATIVE CONTROL: the OLD slice really does give the previous day'
);

// Both ends of the PH day. 00:00 PH is 16:00 UTC the day before; 23:59 PH is
// 15:59 UTC the same day. Both must land on 25 September.
assert(timestampDay('2026-09-24T16:00:00.000Z') === '25 Sep 2026', '00:00 PH → 25 Sep');
assert(timestampDay('2026-09-25T15:59:00.000Z') === '25 Sep 2026', '23:59 PH → 25 Sep');
// One minute either side falls on the neighbouring day — the boundary is a
// boundary, not a fudge.
assert(timestampDay('2026-09-24T15:59:00.000Z') === '24 Sep 2026', '23:59 PH the day before → 24 Sep');
assert(timestampDay('2026-09-25T16:00:00.000Z') === '26 Sep 2026', '00:00 PH the next day → 26 Sep');

// A year boundary, where a naive local-time implementation is worst.
assert(timestampDay('2025-12-31T16:00:00.000Z') === '1 Jan 2026', 'New Year in Manila, not in UTC');

// --------------------------------------------- 2. date-only is untouched
console.log('\n2. DATE columns are string surgery, and unchanged:');

assert(shortDate('2026-09-25') === '25 Sep 2026', 'shortDate on a date-only string');
assert(longDate('2026-09-25') === '25 September 2026', 'longDate on a date-only string');
assert(shortDate('2026-01-01') === '1 Jan 2026', 'no zero-padding, and January is right');
assert(shortDate('2026-12-31') === '31 Dec 2026', 'and December');
// The reason these cannot shift: no Date is ever built. Under a zone west of
// Greenwich, `new Date('2026-09-25')` would be 24 September locally.
assert(
  new Date('2026-09-25').getUTCDate() === 25 && shortDate('2026-09-25') === '25 Sep 2026',
  'and it is parse-free, so the host zone cannot move it'
);
assert(shortDate('not a date') === 'not a date', 'an unparseable value passes through, never a guess');

// --------------------------------------------- 3. the guard / the fallback
console.log('\n3. a timestamp handed to a date-only helper:');

// In production the guard is compiled out, so the FALLBACK is what protects
// the screen — and it must give the Manila day, never the raw string.
assert(shortDate(MORNING) === '25 Sep 2026', 'shortDate falls back to the Manila day, not the raw ISO');
assert(longDate(MORNING) === '25 September 2026', 'longDate likewise');
assert(
  !String(shortDate(MORNING)).includes('T'),
  'NEGATIVE CONTROL: the raw ISO string never reaches the screen',
  shortDate(MORNING)
);

const errors = [];
const realError = console.error;
console.error = (...a) => errors.push(a.join(' '));
shortDate(MORNING);
longDate(MORNING);
console.error = realError;
if (process.env.NODE_ENV === 'development') {
  assert(errors.length === 2, 'DEV: the guard fires once per helper', String(errors.length));
  assert(/shortDate\(\)/.test(errors[0] || ''), 'and names the helper that was misused');
  assert(/Asia\/Manila/.test(errors[0] || ''), 'and names the timezone the fix goes through');
} else {
  assert(errors.length === 0, 'PRODUCTION: the guard is compiled out and stays silent (§17f)');
}

// --------------------------------------------- 4. dateTime
console.log('\n4. dateTime — the one place the clock matters:');

assert(dateTime(MORNING) === '25 Sep 2026, 7:00 AM', 'a 07:00 PH message reads 7:00 AM on the 25th', dateTime(MORNING));
assert(dateTime('2026-09-25T15:59:00.000Z') === '25 Sep 2026, 11:59 PM', 'and 23:59 PH reads 11:59 PM');
assert(dateTime('2026-09-24T16:00:00.000Z') === '25 Sep 2026, 12:00 AM', 'midnight is 12:00 AM, not 0:00');
assert(dateTime('rubbish') === 'rubbish', 'an unparseable value passes through');

// --------------------------------------------- 5. through a real component
console.log('\n5. the real announcement card:');

const html = render(
  <DataTable
    columns={[{ key: 'id', header: 'Id' }]}
    keyField="id"
    rows={[{ id: 1, title: 'Morning post', content: 'x', target_grade: null, created_at: MORNING }]}
    renderCard={(row) => teacherAnnouncementCard(row, { actions: null })}
  />
);
assert(html.includes('25 Sep 2026'), 'the card shows the school day the post was made');
assert(!html.includes('2026-09-24'), 'and not the UTC day before', html.slice(0, 200));
assert(!html.includes('2026-09-25'), 'nor a raw ISO date of any kind');

// --------------------------------------------- 6. DATE columns, through the real cards
console.log('\n6. the real DATE-bearing cards (UI-C1b):');

// These are the cards UI-C1b converted, rendered through the real
// `DataTable` rather than read as source text (§17d). A DATE column is a
// literal "YYYY-MM-DD" string, so the only thing that can go wrong here is
// that the raw string reaches the screen — which is exactly what these
// assert did not happen.
const ABSENCE = '2026-09-22';

const letterHtml = render(
  <DataTable
    columns={[{ key: 'id', header: 'Id' }]}
    keyField="id"
    rows={[{ id: 1, absence_date: ABSENCE, reason: 'Fever', status: 'Declined' }]}
    renderCard={(row) => parentLetterCard(row, { onRead: () => {} })}
  />
);
assert(letterHtml.includes('22 September 2026'), "the parent's letter card names the day in full");
assert(!letterHtml.includes(ABSENCE), 'and the raw DATE string is nowhere in the markup', ABSENCE);

const teacherLetterHtml = render(
  <DataTable
    columns={[{ key: 'id', header: 'Id' }]}
    keyField="id"
    rows={[
      {
        id: 1,
        absence_date: ABSENCE,
        reason: 'Fever',
        status: 'Pending',
        first_name: 'Nino',
        last_name: 'Alcantara',
        grade_level: 1,
        section: 'Mabait',
      },
    ]}
    renderCard={(row) => teacherLetterCard(row, { canReview: () => true, onOpen: () => {} })}
  />
);
assert(
  teacherLetterHtml.includes('22 September 2026') && teacherLetterHtml.includes('Grade 1 - Mabait'),
  "the teacher's letter card keeps the class beside the formatted date"
);
assert(!teacherLetterHtml.includes(ABSENCE), 'and no raw DATE string');

const eventHtml = render(
  <DataTable
    columns={[{ key: 'id', header: 'Id' }]}
    keyField="id"
    rows={[{ id: 1, title: 'Recognition Day', description: null, event_date: ABSENCE, target_grade: null }]}
    renderCard={(row) => teacherEventCard(row, { actions: null })}
  />
);
assert(eventHtml.includes('22 September 2026'), 'the event card names the day in full');
assert(!eventHtml.includes(ABSENCE), 'and no raw DATE string');

// NEGATIVE CONTROL: a card built the OLD way — the bare column value — puts
// the raw string on screen, which is what the three assertions above would
// have passed on before this dispatch.
const rawHtml = render(
  <DataTable
    columns={[{ key: 'id', header: 'Id' }]}
    keyField="id"
    rows={[{ id: 1, absence_date: ABSENCE }]}
    renderCard={(row) => ({ title: `Absence on ${row.absence_date}` })}
  />
);
assert(
  rawHtml.includes(ABSENCE),
  'NEGATIVE CONTROL: the unformatted card really does print 2026-09-22'
);

// --------------------------------------------- 7. calendar days, not elapsed hours
console.log('\n7. calendarDaysAgo — a date question, not a duration:');

// THE BUG, at its own boundary. A backup taken at 23:00 and read at 01:00
// the next morning is two hours old and a day old, and the admin dashboard
// answered the wrong one of those two questions.
const LATE_NIGHT = '2026-09-24T15:00:00.000Z'; // 23:00 PH on the 24th
const NEXT_MORNING = Date.parse('2026-09-24T17:00:00.000Z'); // 01:00 PH on the 25th
assert(calendarDaysAgo(LATE_NIGHT, NEXT_MORNING) === 1, 'two hours across midnight is ONE day');
assert(
  calendarDaysAgoLabel(LATE_NIGHT, NEXT_MORNING) === 'yesterday',
  'and it reads "yesterday"',
  calendarDaysAgoLabel(LATE_NIGHT, NEXT_MORNING)
);
assert(
  Math.floor((NEXT_MORNING - Date.parse(LATE_NIGHT)) / 86400000) === 0,
  'NEGATIVE CONTROL: the old elapsed-hours arithmetic really did score this 0 ("today")'
);

// The mirror image: twenty-two hours INSIDE one day is still today.
const EARLY = '2026-09-24T17:00:00.000Z'; // 01:00 PH on the 25th
const LATE_SAME_DAY = Date.parse('2026-09-25T15:00:00.000Z'); // 23:00 PH on the 25th
assert(calendarDaysAgo(EARLY, LATE_SAME_DAY) === 0, 'twenty-two hours within one day is ZERO days');
assert(calendarDaysAgoLabel(EARLY, LATE_SAME_DAY) === 'today', 'and it reads "today"');

// A MONTH END, where day-number subtraction would give a negative answer.
const SEP_30 = '2026-09-30T15:00:00.000Z'; // 23:00 PH, 30 September
const OCT_1 = Date.parse('2026-09-30T17:00:00.000Z'); // 01:00 PH, 1 October
assert(calendarDaysAgo(SEP_30, OCT_1) === 1, '30 September → 1 October is one day, not -29');
assert(calendarDaysAgoLabel(SEP_30, OCT_1) === 'yesterday', 'and reads "yesterday" across the month end');

// A YEAR END, the same shape one level up.
assert(
  calendarDaysAgo('2025-12-31T15:00:00.000Z', Date.parse('2025-12-31T17:00:00.000Z')) === 1,
  '31 December → 1 January is one day'
);

// Plural days, and the wording the dashboard prints.
const A_WEEK_AGO = '2026-09-18T01:00:00.000Z';
assert(
  calendarDaysAgo(A_WEEK_AGO, Date.parse('2026-09-25T01:00:00.000Z')) === 7,
  'a week is seven days'
);
assert(
  calendarDaysAgoLabel(A_WEEK_AGO, Date.parse('2026-09-25T01:00:00.000Z')) === '7 days ago',
  'and reads "7 days ago" — the number the 7-day tone boundary also reads'
);
assert(
  calendarDaysAgoLabel('2026-09-23T01:00:00.000Z', Date.parse('2026-09-25T01:00:00.000Z')) === '2 days ago',
  'two days is plural'
);

// Nothing to measure, and nothing invented.
assert(calendarDaysAgo(null) === null, 'a missing timestamp is null, never 0');
assert(calendarDaysAgo('rubbish') === null, 'and so is an unparseable one');
assert(calendarDaysAgoLabel(null) === null, 'the label agrees');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
