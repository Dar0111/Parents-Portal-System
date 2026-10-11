import Skeleton, { SkeletonBar, SkeletonCircle } from './Skeleton';
import { cardClass } from './buttonClass';

// TIER 2 (feat/skeleton-tier2-web, 2026-10-11): the shapes for the pages that
// still showed a spinner — the thread, the class record and the class summary,
// the attendance pages, the parent calendar, the student detail pages, the
// breakdown modal, School settings and About. Each export is the ONE region a
// page renders while NOTHING of that content is on screen — a first load or a
// new key, never a re-read; the page decides that (§5, `hooks/useSkeleton.js`).
//
// The region, its clock and its look are tier 1's (components/Skeleton.jsx):
// nothing for 300 ms, then the `edge` fill and the three-pass sweep, no
// minimum, `role="status"` + `aria-busy` with the spinner's own words. Each
// shape sits in the frame the content will fill — a card, the thread's three
// bands, a grid — so the content lands in the space the skeleton held. No new
// token and no new element: bars, circles and the app's own frames.

// A label above a control — a filter or a form field.
function FieldShape({ wide = false }) {
  return (
    <div className={`space-y-1.5 ${wide ? 'w-full' : ''}`}>
      <SkeletonBar className="h-4 w-20" />
      <SkeletonBar className={`h-11 ${wide ? 'w-full' : 'w-48'}`} round="rounded-lg" />
    </div>
  );
}

// The card of filters above a list.
function FilterCardShape({ fields = 2 }) {
  return (
    <div className={`${cardClass} flex flex-wrap items-end gap-3 p-4`}>
      {Array.from({ length: fields }, (_, i) => (
        <FieldShape key={i} />
      ))}
    </div>
  );
}

// A grid's rows: the learner's column, then narrow cells. Clipped, never
// widening the page — the real grids scroll sideways inside their own frame.
function GridShape({ rows = 6, columns = 6 }) {
  const cells = Array.from({ length: columns }, (_, i) => i);
  return (
    <div className="space-y-3 overflow-hidden p-4">
      <div className="flex items-center gap-3">
        <SkeletonBar className="h-4 w-40 shrink-0" />
        {cells.map((c) => (
          <SkeletonBar key={c} className="h-4 w-12 shrink-0" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-3 border-t border-edge-soft pt-3">
          <SkeletonBar className="h-4 w-40 shrink-0" />
          {cells.map((c) => (
            <SkeletonBar key={c} className="h-8 w-12 shrink-0" round="rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

// The thread: who it is with, the bubbles (theirs left, mine right), the box.
const BUBBLES = [
  [false, 'w-3/5'],
  [true, 'w-2/5'],
  [false, 'w-1/2'],
  [true, 'w-3/5'],
  [false, 'w-1/3'],
];

export function ThreadSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading conversation…">
      <div className={cardClass}>
        <div className="flex items-center gap-3 border-b border-edge px-4 py-3 sm:px-5">
          <SkeletonCircle className="h-[2.375rem] w-[2.375rem]" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonBar className="h-4 w-40 max-w-full" />
            <SkeletonBar className="h-3 w-16" />
          </div>
        </div>
        <div className="max-h-[28rem] space-y-3 overflow-hidden px-4 py-4 sm:px-5">
          {BUBBLES.map(([mine, width], i) => (
            <div key={i} data-side={mine ? 'mine' : 'theirs'} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <SkeletonBar className={`h-12 ${width}`} round="rounded-2xl" />
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 border-t border-edge px-4 py-3 sm:px-5">
          <SkeletonBar className="h-16 min-w-0 flex-1" round="rounded-lg" />
          <SkeletonBar className="h-11 w-20 shrink-0" round="rounded-lg" />
        </div>
      </div>
    </Skeleton>
  );
}

// A record or a summary sheet, inside the page's own card.
export function GridSkeleton({ phase, label, columns = 6, rows = 6 }) {
  return (
    <Skeleton phase={phase} label={label}>
      <GridShape columns={columns} rows={rows} />
    </Skeleton>
  );
}

// A page whose filters and list both wait on one read (its sections).
export function FilterAndTableSkeleton({ phase, label, fields = 2, columns = 4, gap = 'space-y-3' }) {
  return (
    <Skeleton phase={phase} label={label}>
      <div className={gap}>
        <FilterCardShape fields={fields} />
        <div className={cardClass}>
          <GridShape columns={columns} rows={5} />
        </div>
      </div>
    </Skeleton>
  );
}

// The phone's roster cards: a learner's name over the four status buttons.
export function RosterCardsSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading the roster…">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`space-y-3 p-4 ${i ? 'border-t border-edge-soft' : ''}`}>
          <SkeletonBar className="h-4 w-2/3" />
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((b) => (
              <SkeletonBar key={b} className="h-11" round="rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </Skeleton>
  );
}

// The parent's month: the five weekday names over five weeks of days.
export function CalendarSkeleton({ phase }) {
  return (
    <Skeleton phase={phase}>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonBar key={`day-${i}`} className="mx-auto h-4 w-8" />
        ))}
        {Array.from({ length: 25 }, (_, i) => (
          <SkeletonBar key={i} className="h-14 w-full" round="rounded-lg" />
        ))}
      </div>
    </Skeleton>
  );
}

// A learner's record: the header card (the large initials circle, the name,
// the class), then the details card with as many fields as the page shows.
export function StudentDetailSkeleton({ phase, fields = 2 }) {
  return (
    <Skeleton phase={phase} label="Loading student…">
      <div className="space-y-6">
        <div className={`${cardClass} p-5 sm:p-6`}>
          <div className="flex items-center gap-4">
            <SkeletonCircle className="h-20 w-20" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-6 w-56 max-w-full" />
              <SkeletonBar className="h-4 w-40" />
            </div>
          </div>
        </div>
        <div className={`${cardClass} space-y-4 p-5`}>
          <SkeletonBar className="h-5 w-36" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: fields }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <SkeletonBar className="h-3 w-20" />
                <SkeletonBar className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Skeleton>
  );
}

// The breakdown dialog's scores: three groups of rows, a name and a score.
export function ScoresSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading scores…">
      <div className="space-y-5">
        {[0, 1, 2].map((s) => (
          <div key={s} className="space-y-2">
            <SkeletonBar className="h-4 w-32" />
            {[0, 1, 2].map((r) => (
              <div key={r} className="flex items-center justify-between gap-3">
                <SkeletonBar className="h-4 w-40 max-w-[60%]" />
                <SkeletonBar className="h-4 w-14" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Skeleton>
  );
}

// School settings: the heading, the year-and-term facts, the details form.
export function SettingsSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading school settings…">
      <div className="space-y-6">
        <div className="space-y-2">
          <SkeletonBar className="h-6 w-48" />
          <SkeletonBar className="h-4 w-full max-w-xl" />
        </div>
        <div className="max-w-2xl space-y-3 border-t border-edge-soft pt-6">
          <SkeletonBar className="h-5 w-52" />
          <div className="grid gap-4 rounded-xl border border-edge bg-surface-subtle p-4">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-1.5">
                <SkeletonBar className="h-3 w-24" />
                <SkeletonBar className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
        <div className="max-w-2xl space-y-4 border-t border-edge-soft pt-6">
          <SkeletonBar className="h-5 w-40" />
          <FieldShape wide />
          <FieldShape wide />
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldShape wide />
            <FieldShape wide />
          </div>
        </div>
      </div>
    </Skeleton>
  );
}

// About: the school's band, the detail tiles under their heading, the reading
// cards, the values. The band is a neutral card here — a bar on the brand
// panel would be an untested pair.
export function AboutSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading school details…">
      <div className="space-y-6">
        <div className={`${cardClass} p-6 sm:p-8`}>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
            <SkeletonCircle className="h-24 w-24 sm:h-28 sm:w-28" />
            <div className="w-full min-w-0 space-y-3">
              <SkeletonBar className="mx-auto h-3 w-40 sm:mx-0" />
              <SkeletonBar className="mx-auto h-8 w-3/4 sm:mx-0" />
              <SkeletonBar className="mx-auto h-4 w-2/3 sm:mx-0" />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <SkeletonBar className="h-6 w-36" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`${cardClass} flex min-w-0 items-start gap-3 p-4 ${i === 4 ? 'sm:col-span-2' : ''}`}>
                <SkeletonBar className="h-9 w-9 shrink-0" round="rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonBar className="h-3 w-20" />
                  <SkeletonBar className="h-4 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className={`${cardClass} space-y-3 p-5 sm:p-6`}>
              <SkeletonBar className="h-5 w-40" />
              <SkeletonBar className="h-4 w-full" />
              <SkeletonBar className="h-4 w-5/6" />
              <SkeletonBar className="h-4 w-2/3" />
            </div>
          ))}
        </div>
        <div className={`${cardClass} space-y-4 p-5 sm:p-6`}>
          <SkeletonBar className="h-5 w-40" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBar key={i} className="h-16 w-full" round="rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </Skeleton>
  );
}
