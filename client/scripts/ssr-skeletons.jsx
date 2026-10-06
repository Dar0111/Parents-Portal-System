// PROOF — build 2, feat/dashboards-look (2026-10-07), commit 1: skeleton
// loading tier 1 and the re-read rule (the owner's decisions 1, 5, 6 and 7,
// decision 1 as narrowed the same day).
//
// What it drives directly (pure or rendered):
//   - hooks/useSkeleton.js `skeletonPhase` — nothing before 300 ms, the
//     skeleton from 300 ms, 'off' the moment loading ends (no minimum);
//   - pages/dashboards/useCard.js `startRead` / `cardView` — the same query
//     keeps its answer (`refreshing`), a new query never shows the old one
//     (`loading`), a failed read has nothing to keep — with a negative
//     control that is the old one-flag view;
//   - components/Skeleton.jsx RENDERED in both phases — role, live region,
//     busy, the sr-only label, hidden shapes; unpainted during the wait,
//     the finite `motion-safe` pulse once painted;
//   - DataTable RENDERED: nothing on screen → the skeleton with the real
//     headers (cards below `sm`, the pager strip when paged, C7's stale page
//     too); rows on screen while loading → the SAME rows, the frame
//     `aria-busy` and `inert`; idle → neither attribute; an error first;
//   - the dashboard Card RENDERED: each skeleton shape, the re-read's busy
//     and inert content, an idle card without either;
//   - the report card RENDERED loading: its title band over the skeleton,
//     the general-average band only when the mode is not descriptive.
// What it reads as SOURCE TEXT, said plainly: that the hook sets state only
// from its timer, the newest-ticket guard in useCard, DataTable's `kept`
// rule and its 300 ms grey, the web/phone mirror of useSkeleton.
//
// WHAT IT CANNOT: the real 300 ms on a device, the pulse itself, the fill's
// look in either theme, and what a screen reader says — the owner's check.
// Under renderToStaticMarkup no effect runs, so a rendered skeleton is always
// in its 'wait' phase; the painted phase is rendered by passing the phase.
//
// Run (from client/):
//   npx vite build --ssr scripts/ssr-skeletons.jsx --outDir .ssr-tmp --logLevel error && node .ssr-tmp/ssr-skeletons.js

import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SKELETON_DELAY_MS, skeletonPhase } from '../src/hooks/useSkeleton.js';
import { cardView, startRead } from '../src/pages/dashboards/useCard.js';
import Skeleton, { SkeletonBar } from '../src/components/Skeleton.jsx';
import DataTable from '../src/components/DataTable.jsx';
import Card, { Stat } from '../src/pages/dashboards/Card.jsx';
import ReportCard from '../src/pages/parent/ReportCard.jsx';

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
const src = (p) => fs.readFileSync(path.resolve(p), 'utf8').replace(/\r\n/g, '\n');
const render = (node) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const count = (html, re) => (html.match(re) || []).length;

console.log('When a skeleton shows (pure, hooks/useSkeleton.js)');
assert(SKELETON_DELAY_MS === 300, 'the wait is 300 ms');
assert(skeletonPhase({ loading: true, elapsedMs: 0 }) === 'wait' && skeletonPhase({ loading: true, elapsedMs: 299 }) === 'wait', 'loading, under 300 ms: wait — the space is held, nothing is painted');
assert(skeletonPhase({ loading: true, elapsedMs: 300 }) === 'skeleton' && skeletonPhase({ loading: true, elapsedMs: 5000 }) === 'skeleton', 'loading, from 300 ms: the skeleton');
assert(skeletonPhase({ loading: false, elapsedMs: 0 }) === 'off' && skeletonPhase({ loading: false, elapsedMs: 5000 }) === 'off', 'not loading: off at once, however long it showed — no minimum display time');
assert(skeletonPhase({ loading: true, elapsedMs: 100, delayMs: 100 }) === 'skeleton', 'the delay is a parameter, the rule is the same');
const hook = src('src/hooks/useSkeleton.js');
assert(/setTimeout\(\(\) => setElapsed\(true\), delayMs\)/.test(hook) && /return \(\) => clearTimeout\(timer\);/.test(hook), 'the hook sets state only from its timer, and clears the timer when loading ends');
assert(/if \(active !== seen\) \{\n\s+setSeen\(active\);\n\s+setElapsed\(false\);\n\s+\}/.test(hook), 'a new wait starts the clock again — reset during render, not in an effect');
assert((hook.match(/setTimeout/g) || []).length === 1, 'one timer, the delay — there is no second, minimum-display timer');
assert(hook === src('../mobile/src/hooks/useSkeleton.js'), 'the phone runs the same file (byte for byte; lint:mirrors holds it)');

console.log('\nThe same query keeps its answer; a new query starts from nothing (pure, useCard.js)');
{
  const loaded = { key: '[7]', data: { n: 3 }, error: null, loading: false, answered: true };
  const again = startRead(loaded, '[7]');
  assert(again.data === loaded.data && again.answered && again.loading && again.error === null, 'a re-read of the SAME query keeps the data it has');
  const viewAgain = cardView(again, '[7]');
  assert(viewAgain.refreshing && !viewAgain.loading && viewAgain.data === loaded.data, '…and the card shows it, `refreshing`, never `loading` (no skeleton over an answer)');
  const other = startRead(loaded, '[8]');
  assert(other.data === null && !other.answered && other.key === '[8]', 'a NEW query starts from nothing');
  const before = cardView(loaded, '[8]');
  assert(before.loading && before.data === null && !before.refreshing, 'even before the new read starts, the old answer is not shown for the new query');
  const nullAnswer = { key: '[]', data: null, error: null, loading: false, answered: true };
  assert(cardView(startRead(nullAnswer, '[]'), '[]').refreshing, 'an answer of null (no letter yet) is an answer: its re-read is `refreshing` too');
  const failedRead = { key: '[]', data: null, error: 'Network Error', loading: false, answered: false };
  const failedView = cardView(failedRead, '[]');
  assert(failedView.error === 'Network Error' && !failedView.loading && !failedView.refreshing, 'a failed read shows its error');
  const retry = cardView(startRead(failedRead, '[]'), '[]');
  assert(retry.loading && !retry.refreshing && retry.error === null, 'Retry after an error has nothing to keep: `loading` (the skeleton)');
  // NEGATIVE CONTROL: the one-flag view this replaced. During a re-read of the
  // same query it says "loading", which a card turns into a placeholder over
  // the answer — the jump decision 1 removes.
  const oldView = (s) => ({ loading: s.loading, data: s.data });
  assert(oldView(again).loading === true && viewAgain.loading === false, 'NEGATIVE CONTROL: the old single `loading` flag would have swapped the kept answer for a placeholder');
}
const useCardSrc = src('src/pages/dashboards/useCard.js');
assert((useCardSrc.match(/if \(live && ticket\.current === mine\)/g) || []).length === 2, 'the answer AND the error are applied only for the newest ticket — a slow re-read cannot land on a newer one');
assert(/\}, \[key, skip, refresh\]\);\n\n\s+useEffect\(load, \[load\]\);/.test(useCardSrc), 'the read re-runs on the query, `skip`, or the `refresh` counter — and `refresh` keeps the key, so it is a same-query re-read');

console.log('\nThe skeleton region (rendered, components/Skeleton.jsx)');
{
  const waiting = renderToStaticMarkup(
    <Skeleton phase="wait">
      <SkeletonBar className="h-3 w-1/2" />
    </Skeleton>
  );
  assert(/^<div role="status" aria-live="polite" aria-busy="true"/.test(waiting), 'role="status", aria-live="polite", aria-busy="true" (decision 7)', waiting.slice(0, 120));
  assert(waiting.includes('<span class="sr-only">Loading…</span>'), 'the spinner’s own words, "Loading…", in an sr-only span');
  assert(/<div aria-hidden="true" data-skeleton="wait" class="invisible">/.test(waiting), 'during the wait the shapes are laid out (the height is held) but invisible, and hidden from the screen reader');
  assert(!/animate-/.test(waiting), '…and nothing pulses yet');
  const painted = renderToStaticMarkup(
    <Skeleton phase="skeleton" label="Loading the report card…">
      <SkeletonBar className="h-3 w-1/2" />
    </Skeleton>
  );
  assert(/<div aria-hidden="true" data-skeleton="painted" class="motion-safe:animate-pulse" style="animation-iteration-count:2">/.test(painted), 'painted: the pulse, only under motion-safe (static under reduced motion), and only TWICE — never on without end', painted.slice(0, 260));
  assert(painted.includes('<span class="sr-only">Loading the report card…</span>'), 'a caller may name the wait');
  assert(/<span class="block rounded-md bg-edge h-3 w-1\/2"><\/span>/.test(painted), 'a bar is the `edge` token with a tag’s corner — no new token');
  const skeletonSrc = src('src/components/Skeleton.jsx');
  assert(/const FILL = 'bg-edge';/.test(skeletonSrc) && !/\bbg-(slate|gray|zinc|neutral|stone)-\d/.test(skeletonSrc), 'one FILL constant, a token (edge-strong is the one-line fallback)');
  assert(!/(^|[\s'"`])animate-/m.test(skeletonSrc.replace(/motion-safe:animate-pulse/g, '')), 'no animation class without `motion-safe:`');
}

console.log('\nDataTable — nothing on screen gets the skeleton (rendered)');
const columns = [
  { key: 'name', header: 'Name' },
  { key: 'grade', header: 'Grade', align: 'right' },
];
const rows = [
  { id: 1, name: 'Ana Cruz', grade: '87.50' },
  { id: 2, name: 'Ben Reyes', grade: '100.00' },
];
{
  const first = render(<DataTable columns={columns} rows={[]} loading />);
  assert(!/fa-circle-notch/.test(first) && /role="status" aria-live="polite" aria-busy="true"/.test(first), 'a first load is the skeleton, not the spinner');
  assert(/>Name<\/th>/.test(first) && />Grade<\/th>/.test(first), 'it carries the real column headers');
  assert(count(first, /<tr/g) === 6, 'a header row over five placeholder rows', String(count(first, /<tr/g)));
  assert(/class="rounded-xl border border-edge bg-surface /.test(first), 'inside the same frame the rows will use');
  const withCards = render(<DataTable columns={columns} rows={[]} loading renderCard={(r) => ({ title: r.name })} />);
  assert(/<div class="sm:hidden">/.test(withCards) && /class="overflow-x-auto hidden sm:block"/.test(withCards), 'a page with cards gets card-shaped placeholders below `sm`, the table from `sm` up');
  const paged = render(<DataTable columns={columns} rows={[]} loading page={{ limit: 50, offset: 0, total: 0, has_more: false }} />);
  assert(/rounded-b-xl border-t border-edge bg-surface-subtle/.test(paged) && /rounded-lg bg-edge h-9 w-24/.test(paged), 'paged: the pager’s strip is there too, so the frame is its finished height');
  const stale = render(<DataTable columns={columns} rows={[]} page={{ limit: 50, offset: 50, total: 3, has_more: false }} onPageChange={() => {}} />);
  assert(/aria-busy="true"/.test(stale) && !/Nothing here|No records/i.test(stale), 'C7’s stale page (asking for the last real page) is the skeleton too, never "nothing here"');
  const failedTable = render(<DataTable columns={columns} rows={[]} loading error="Network Error" onRetry={() => {}} />);
  assert(/Network Error/.test(failedTable) && !/aria-busy/.test(failedTable), 'an error comes first, with its Retry — never a skeleton over a failure');
}

console.log('\nDataTable — a re-read keeps the rows, and nothing in them can be pressed (rendered)');
{
  const kept = render(<DataTable columns={columns} rows={rows} loading />);
  assert(/Ana Cruz/.test(kept) && /Ben Reyes/.test(kept), 'the rows on screen stay while the list re-reads');
  assert(/^<div class="rounded-xl border border-edge bg-surface " aria-busy="true" inert="">/.test(kept), 'the frame is aria-busy AND inert — a stale lock or mark button cannot be pressed or reached by Tab', kept.slice(0, 120));
  assert(!/role="status"/.test(kept), 'no skeleton over rows that are on screen');
  assert(!/opacity-60/.test(kept), 'not greyed yet: the grey comes only after the same 300 ms (no flash on a fast re-read)');
  const idle = render(<DataTable columns={columns} rows={rows} />);
  assert(!/inert|aria-busy/.test(idle), 'idle, the frame carries neither — the table is exactly as before');
  const table = src('src/components/DataTable.jsx');
  assert(/const kept = loading && sortedRows\.length > 0;/.test(table) && /const dimmed = useSkeleton\(kept\) === 'skeleton';/.test(table) && /dimmed \? `\$\{frame\} opacity-60` : frame/.test(table), 'greyed only once a kept re-read has taken 300 ms (source)');
  assert(!/LoadingSpinner/.test(table) && !/if \(loading \|\| pageIsStale\)/.test(table), 'the spinner branch that swapped the rows away is gone (source)');
}

console.log('\nThe dashboard Card (rendered)');
{
  const shapes = ['figure', 'lead', 'list', 'facts'].map((shape) => [shape, render(<Card title="Students" icon="fa-user-graduate" to="/x" loading skeleton={shape} />)]);
  assert(shapes.every(([, html]) => /Students/.test(html) && /aria-busy="true"/.test(html) && !/fa-circle-notch/.test(html)), 'loading: the title stays, the body is the skeleton — no spinner — in every shape');
  const by = Object.fromEntries(shapes);
  assert(/flex h-7 items-center/.test(by.figure) && /flex h-8 items-center/.test(by.lead), 'figure: a text-xl figure over a caption; lead: the bigger text-2xl figure');
  assert(count(by.list, /flex h-5 items-center/g) === 4 && /border-t border-edge-soft pt-3/.test(by.list), 'list: a figure over three lines under a hairline');
  assert(/lg:grid-cols-4/.test(by.facts) && count(by.facts, /mt-0\.5 flex h-5 items-center/g) === 4, 'facts: the System card’s four label-over-value facts');
  const refreshing = render(
    <Card title="Students" to="/x" refreshing>
      <Stat value="12" caption="on the roll" />
    </Card>
  );
  assert(/<div class="min-w-0 flex-1" aria-busy="true" inert="">/.test(refreshing) && />12</.test(refreshing), 'a re-read: the answer stays on screen, its content aria-busy and inert');
  const idle = render(
    <Card title="Students" to="/x">
      <Stat value="12" caption="on the roll" />
    </Card>
  );
  assert(/<div class="min-w-0 flex-1">/.test(idle) && !/inert|aria-busy/.test(idle), 'idle: neither attribute');
  const cardSrc = src('src/pages/dashboards/Card.jsx');
  assert(!/LoadingSpinner/.test(cardSrc), 'the card’s spinner is gone (source)');
}

console.log('\nThe report card (rendered loading)');
{
  const numerical = render(<ReportCard report={null} loading error={null} />);
  assert(/Learner&#x27;s Performance Report|Learner’s Performance Report/.test(numerical) && /aria-busy="true"/.test(numerical), 'the real title band, over the skeleton');
  assert(!/fa-circle-notch/.test(numerical), 'no spinner');
  assert(count(numerical, /<li class="flex min-h-11 items-center justify-between gap-3 py-2\.5">/g) === 6, 'six learning-area rows, at the row’s own 44px');
  assert(/rounded-xl bg-edge h-12 w-full/.test(numerical), 'the general-average band (the mode is not known to be Key Stage 1)');
  const descriptive = render(<ReportCard report={{ grading_mode: 'descriptive', subjects: [] }} loading error={null} />);
  assert(!/rounded-xl bg-edge h-12 w-full/.test(descriptive), 'a Key Stage 1 card has no general-average band in its skeleton either');
}

console.log(`\nssr-skeletons: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
