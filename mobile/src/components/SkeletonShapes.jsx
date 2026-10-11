import { View } from 'react-native';
import { cardClass } from './buttonStyles';
import Skeleton, { QuietSkeleton, SkeletonBar, SkeletonCircle } from './Skeleton';

// TIER 2 ON THE PHONE (feat/skeleton-tier2-phone, 2026-10-11): the shapes for
// the screens that still showed a spinner — the thread, the class record and
// its slot, the class summary, both attendance screens, the parent's month,
// both student records, the breakdown, admin Grades, School settings and
// About. The web's tier 2 (client/src/components/SkeletonShapes.jsx) in the
// phone's own layout; not a mirror — the frames differ.
//
// Each export is the ONE region a screen shows while NOTHING of that content is
// on screen — a first load or a new key, never a re-read; the screen decides
// that (§5, hooks/useSkeleton.js). The region, its clock and its sweep are
// tier 1's (components/Skeleton.jsx); the three Teacher → Attendance pieces
// that sit beside the roster's own region are QUIET (no second announcement).
// No new token and no new element: bars, circles and the screens' own frames.
//
// HEIGHTS IN dp WHERE A CONTROL STANDS IN: the phone's rem is 14 (M19), so a
// 48dp field or button is a style, never `h-12` (42dp) — buttonStyles.js.
const CONTROL = { height: 48 };
const SMALL_CONTROL = { height: 44 };

// A label over a control — a form field, a date, a picker.
function FieldShape({ label = 'w-24' }) {
  return (
    <View className="gap-1.5">
      <SkeletonBar className={`h-3.5 ${label}`} />
      <SkeletonBar round="rounded-lg" style={CONTROL} />
    </View>
  );
}

// A screen's heading and the line under it (SectionHeader).
function HeaderShape({ title = 'w-40' }) {
  return (
    <View className="gap-2">
      <SkeletonBar className={`h-5 ${title}`} />
      <SkeletonBar className="h-3.5 w-4/5" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// The thread: who it is with, the bubbles (theirs left, mine right), the box.
// The box is pinned at the bottom like the real composer — a quiet region, so
// the thread is announced once.
const BUBBLES = [
  [false, 'w-3/5'],
  [true, 'w-2/5'],
  [false, 'w-1/2'],
  [true, 'w-3/5'],
  [false, 'w-1/3'],
];

export function ThreadSkeleton({ phase }) {
  return (
    <View className="flex-1 bg-page">
      <Skeleton phase={phase} label="Loading conversation…">
        <View className="flex-row items-center gap-3 border-b border-edge bg-surface px-4 py-2">
          <SkeletonCircle size={38} />
          <SkeletonBar className="h-4 w-1/2" />
        </View>
        <View className="gap-3 px-4 py-4">
          {BUBBLES.map(([mine, width], i) => (
            <View key={i} className={`flex-row ${mine ? 'justify-end' : 'justify-start'}`}>
              <SkeletonBar className={width} round="rounded-2xl" style={{ height: 52 }} />
            </View>
          ))}
        </View>
      </Skeleton>
      <View className="flex-1" />
      <QuietSkeleton phase={phase} className="flex-row items-end gap-2 border-t border-edge bg-surface px-4 py-3">
        <View className="min-w-0 flex-1">
          <SkeletonBar round="rounded-lg" style={CONTROL} />
        </View>
        <SkeletonBar className="w-20" round="rounded-lg" style={CONTROL} />
      </QuietSkeleton>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The class record's slot list: a group label over rows of a code chip, a
// title and "n of m scored". `pickers` adds the subject / class / term card the
// screen draws once its classes are known.
function SlotGroupShape({ rows }) {
  return (
    <View className="gap-2">
      <SkeletonBar className="h-3 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className={`${cardClass} flex-row items-center gap-3 px-4 py-3`} style={{ minHeight: 48 }}>
          <SkeletonBar className="h-9" round="rounded-xl" style={{ width: 44 }} />
          <View className="min-w-0 flex-1 gap-1.5">
            <SkeletonBar className="h-3.5 w-2/3" />
            <SkeletonBar className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ClassRecordSkeleton({ phase, label, pickers = false }) {
  return (
    <Skeleton phase={phase} label={label}>
      <View className="gap-4">
        {pickers ? (
          <View className={`${cardClass} gap-3 p-4`}>
            <FieldShape label="w-16" />
            <FieldShape label="w-12" />
            <FieldShape label="w-12" />
          </View>
        ) : null}
        <SlotGroupShape rows={3} />
        <SlotGroupShape rows={3} />
        <SlotGroupShape rows={2} />
      </View>
    </Skeleton>
  );
}

// One column of the class record (SlotScreen): the heading, the column's own
// settings, then a card per learner — the name, the score box, "/ max", and
// the live line under them.
export function SlotSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading the class record…" className="flex-1 bg-page p-4">
      <View className="gap-4">
        <HeaderShape title="w-32" />
        <View className={`${cardClass} gap-3 p-4`}>
          <FieldShape label="w-28" />
          <FieldShape label="w-40" />
          <View className="border-t border-edge-soft pt-3">
            <SkeletonBar className="h-3 w-3/4" />
          </View>
        </View>
        {[0, 1, 2].map((i) => (
          <View key={i} className={`${cardClass} p-4`}>
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1">
                <SkeletonBar className="h-4 w-3/4" />
              </View>
              <SkeletonBar className="w-20" round="rounded-xl" style={CONTROL} />
              <SkeletonBar className="h-3.5 w-10" />
            </View>
            <View className="mt-3 border-t border-edge-soft pt-3">
              <SkeletonBar className="h-3 w-4/5" />
            </View>
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

// ---------------------------------------------------------------------------
// The class summary's sheet: the fixed learner column and the subject columns
// beside it — two that fit any phone, so nothing is cut at the card's edge.
function SheetShape() {
  return (
    <View className={`${cardClass} flex-row overflow-hidden`}>
      <View style={{ width: 150 }} className="border-r border-edge">
        <View style={{ height: 88 }} className="justify-end bg-surface-subtle px-3 pb-2">
          <SkeletonBar className="h-3 w-16" />
        </View>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ height: 48 }} className="justify-center border-t border-edge-soft px-3">
            <SkeletonBar className="h-3.5 w-4/5" />
          </View>
        ))}
      </View>
      <View className="min-w-0 flex-1">
        <View style={{ height: 88 }} className="flex-row bg-surface-subtle">
          {[0, 1].map((c) => (
            <View key={c} className="flex-1 items-center justify-end px-1 pb-2">
              <SkeletonBar className="h-3 w-3/5" />
            </View>
          ))}
        </View>
        {[0, 1, 2, 3, 4].map((r) => (
          <View key={r} style={{ height: 48 }} className="flex-row border-t border-edge-soft">
            {[0, 1].map((c) => (
              <View key={c} className="flex-1 items-center justify-center">
                <SkeletonBar className="h-3.5 w-8" />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export function SummarySheetSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading the class summary…">
      <SheetShape />
    </Skeleton>
  );
}

// The whole screen while the adviser's classes load: the heading, the class
// and term card, then the sheet.
export function ClassSummarySkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading your classes…" className="flex-1 bg-page p-4">
      <View className="gap-4">
        <HeaderShape title="w-44" />
        <View className={`${cardClass} gap-3 p-4`}>
          <View className="flex-row items-center gap-3">
            <SkeletonBar className="h-9 w-9" round="rounded-xl" />
            <SkeletonBar className="h-4 w-1/2" />
          </View>
          <FieldShape label="w-12" />
        </View>
        <SheetShape />
      </View>
    </Skeleton>
  );
}

// ---------------------------------------------------------------------------
// TEACHER → ATTENDANCE. One roster card: the learner, the row's state, the
// four status buttons (44dp, as the real ones).
function RosterCardShape() {
  return (
    <View className={`${cardClass} p-4`}>
      <SkeletonBar className="h-4 w-2/3" />
      <SkeletonBar className="mt-1.5 h-3 w-1/4" />
      <View className="mt-3 flex-row gap-2">
        {[0, 1, 2, 3].map((b) => (
          <View key={b} className="flex-1">
            <SkeletonBar round="rounded-lg" style={SMALL_CONTROL} />
          </View>
        ))}
      </View>
    </View>
  );
}

// The summary card's inside: "n of m marked" and Mark all Present on one line,
// then the four count tiles.
function RosterSummaryShape() {
  return (
    <>
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <SkeletonBar className="h-3.5 w-1/2" />
        </View>
        <SkeletonBar className="w-36" round="rounded-lg" style={SMALL_CONTROL} />
      </View>
      <View className="flex-row gap-2">
        {[0, 1, 2, 3].map((t) => (
          <View key={t} className="flex-1">
            <SkeletonBar round="rounded-xl" style={{ height: 52 }} />
          </View>
        ))}
      </View>
    </>
  );
}

const SUMMARY_CARD = `${cardClass} gap-3 p-4`;

// The roster's own region (cards), announced as the spinner was.
export function RosterCardsSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading the roster…">
      <View className="gap-3">
        <RosterCardShape />
        <RosterCardShape />
        <RosterCardShape />
      </View>
    </Skeleton>
  );
}

// QUIET, beside the roster's region (fix round T2, applied to the phone): what
// the old register's counts, buttons and note would otherwise show while a new
// section or date loads.
export function RosterSummarySkeleton({ phase }) {
  return (
    <QuietSkeleton phase={phase} className={SUMMARY_CARD}>
      <RosterSummaryShape />
    </QuietSkeleton>
  );
}

export function RosterNoteSkeleton({ phase }) {
  return (
    <QuietSkeleton phase={phase} className="flex-row items-start gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
      <View className="min-w-0 flex-1">
        <SkeletonBar className="h-3.5 w-4/5" />
      </View>
    </QuietSkeleton>
  );
}

// The pinned Save bar: the unsaved line and Save, where the real bar sits.
export function RosterSaveBarSkeleton({ phase }) {
  return (
    <QuietSkeleton phase={phase} className="flex-row items-center gap-3 border-t border-edge bg-surface px-4 py-3">
      <View className="min-w-0 flex-1">
        <SkeletonBar className="h-3.5 w-1/2" />
      </View>
      <SkeletonBar className="w-40" round="rounded-lg" style={CONTROL} />
    </QuietSkeleton>
  );
}

// The whole register while the adviser's sections load — in the screen's own
// card shape (fix round T1): the section and date card, the Roster heading,
// the summary card, three roster cards.
export function AttendanceRegisterSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading your sections…" className="flex-1 bg-page p-4">
      <View className="gap-4">
        <View className={`${cardClass} gap-3 p-4`}>
          <FieldShape label="w-16" />
          <FieldShape label="w-10" />
        </View>
        <HeaderShape title="w-24" />
        <View className={SUMMARY_CARD}>
          <RosterSummaryShape />
        </View>
        <RosterCardShape />
        <RosterCardShape />
        <RosterCardShape />
      </View>
    </Skeleton>
  );
}

// Attendance records while the sections load: the filter card, then the
// list's cards with their circles (DataList's own skeleton, here for the
// screen's first read).
export function RecordsSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading your sections…">
      <View className="gap-4">
        <View className={`${cardClass} gap-3 p-4`}>
          <SkeletonBar round="rounded-lg" style={CONTROL} />
          <FieldShape label="w-12" />
          <FieldShape label="w-10" />
          <View className="flex-row gap-2">
            <SkeletonBar className="w-24" round="rounded-lg" style={SMALL_CONTROL} />
            <SkeletonBar className="w-20" round="rounded-lg" style={SMALL_CONTROL} />
          </View>
        </View>
        {['w-2/3', 'w-1/2', 'w-3/4'].map((w) => (
          <View key={w} className={`${cardClass} flex-row items-start gap-3 p-4`}>
            <SkeletonCircle size={38} />
            <View className="min-w-0 flex-1 gap-2">
              <SkeletonBar className={`h-3.5 ${w}`} />
              <SkeletonBar className="h-3 w-1/2" />
            </View>
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

// ---------------------------------------------------------------------------
// PARENT → ATTENDANCE. The month: the five weekday names over five weeks of
// day cells (the real cells' min-h-16), then the key's line.
export function MonthGridSkeleton({ phase }) {
  return (
    <Skeleton phase={phase}>
      <View className="flex-row pb-2">
        {[0, 1, 2, 3, 4].map((d) => (
          <View key={d} className="flex-1 items-center">
            <SkeletonBar className="h-3 w-8" />
          </View>
        ))}
      </View>
      {[0, 1, 2, 3, 4].map((w) => (
        <View key={w} className="flex-row">
          {[0, 1, 2, 3, 4].map((d) => (
            <View key={d} className="flex-1 p-0.5">
              <SkeletonBar className="h-16" round="rounded-lg" />
            </View>
          ))}
        </View>
      ))}
      <View className="mt-3 border-t border-edge-soft pt-3">
        <SkeletonBar className="h-3 w-3/4" />
      </View>
    </Skeleton>
  );
}

// The month's summary card under the month's name (fix round P1, applied to
// the phone): the figure, its caption, the four count tiles, the footnote — so
// "Nothing recorded" can never show before the month has answered.
export function MonthSummarySkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading this month's summary…">
      <SkeletonBar className="mt-3 h-7 w-24" />
      <SkeletonBar className="mt-1.5 h-3.5 w-40" />
      <View className="mt-4 gap-2">
        {[0, 1].map((r) => (
          <View key={r} className="flex-row gap-2">
            {[0, 1].map((c) => (
              <View key={c} className="flex-1 flex-row items-center justify-between gap-2 rounded-xl border border-edge-soft bg-surface-subtle px-3 py-2.5">
                <SkeletonBar className="h-5 w-16" />
                <SkeletonBar className="h-5 w-6" />
              </View>
            ))}
          </View>
        ))}
      </View>
      <SkeletonBar className="mt-4 h-3 w-3/4" />
    </Skeleton>
  );
}

// ---------------------------------------------------------------------------
// A learner's record: the header card (the 48dp circle, the name, the class and
// the badge, the action row), then the details card with as many fields as the
// screen shows.
export function StudentDetailSkeleton({ phase, fields = 2 }) {
  return (
    <Skeleton phase={phase} label="Loading student…" className="flex-1 bg-page p-4">
      <View className="gap-4">
        <View className={`${cardClass} gap-4 p-5`}>
          <View className="flex-row items-start gap-3">
            <SkeletonCircle size={48} />
            <View className="min-w-0 flex-1 gap-2">
              <SkeletonBar className="h-5 w-3/4" />
              <View className="flex-row items-center gap-2">
                <SkeletonBar className="h-3.5 w-28" />
                <SkeletonBar className="h-5 w-14" />
              </View>
            </View>
          </View>
          <SkeletonBar className="w-24" round="rounded-lg" style={CONTROL} />
        </View>
        <View className={`${cardClass} gap-4 p-4`}>
          <SkeletonBar className="h-4 w-36" />
          {Array.from({ length: fields }, (_, i) => (
            <View key={i} className="gap-1.5">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-3.5 w-32" />
            </View>
          ))}
        </View>
      </View>
    </Skeleton>
  );
}

// The grade breakdown's scores, inside the screen's own card: three groups of a
// title and a few rows, a name and a score.
export function ScoresSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading scores…">
      <View className="gap-5">
        {[0, 1, 2].map((s) => (
          <View key={s} className="gap-2">
            <SkeletonBar className="h-4 w-32" />
            {[0, 1, 2].map((r) => (
              <View key={r} className="flex-row items-center justify-between gap-3">
                <SkeletonBar className="h-3.5 w-1/2" />
                <SkeletonBar className="h-3.5 w-12" />
              </View>
            ))}
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

// Admin → Grades' report card: the learner's header card, the two lines under
// it, then a card per subject — its name and Final, then its three terms.
export function ReportCardSkeleton({ phase }) {
  return (
    <Skeleton phase={phase}>
      <View className="gap-4">
        <View className={`${cardClass} flex-row items-center gap-3 p-4`}>
          <SkeletonCircle size={48} />
          <View className="min-w-0 flex-1 gap-2">
            <SkeletonBar className="h-5 w-2/3" />
            <SkeletonBar className="h-3.5 w-4/5" />
          </View>
        </View>
        <SkeletonBar className="h-3.5 w-11/12" />
        <View className="gap-3">
          {[0, 1, 2].map((s) => (
            <View key={s} className={`${cardClass} gap-3 p-4`}>
              <View className="flex-row items-start justify-between gap-3">
                <SkeletonBar className="h-4 w-1/2" />
                <SkeletonBar className="h-3.5 w-16" />
              </View>
              <View className="flex-row gap-2">
                {[0, 1, 2].map((t) => (
                  <View key={t} className="flex-1">
                    <SkeletonBar round="rounded-lg" style={CONTROL} />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
    </Skeleton>
  );
}

// ---------------------------------------------------------------------------
// School settings: the heading, the year-and-term facts, the details form.
export function SettingsSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading school settings…" className="flex-1 bg-page p-4">
      <View className="gap-4">
        <HeaderShape title="w-40" />
        <View className={`${cardClass} gap-3 p-4`}>
          <SkeletonBar className="h-4 w-44" />
          <View className="gap-3 rounded-xl border border-edge bg-surface-subtle px-4 py-3">
            {[0, 1].map((i) => (
              <View key={i} className="gap-1.5">
                <SkeletonBar className="h-3 w-24" />
                <SkeletonBar className="h-3.5 w-3/4" />
              </View>
            ))}
          </View>
        </View>
        <View className={`${cardClass} gap-4 p-4`}>
          <SkeletonBar className="h-4 w-36" />
          <FieldShape label="w-28" />
          <FieldShape label="w-32" />
          <FieldShape label="w-28" />
          <FieldShape label="w-24" />
        </View>
      </View>
    </Skeleton>
  );
}

// About: the school's band — a NEUTRAL card here, since a bar on the brand
// panel would be an unchecked pair — the detail tiles, the reading cards.
export function AboutSkeleton({ phase }) {
  return (
    <Skeleton phase={phase} label="Loading school details…">
      <View className="gap-4">
        <View className={`${cardClass} items-center gap-3 p-5`}>
          <SkeletonCircle size={88} />
          <SkeletonBar className="h-3 w-1/2" />
          <SkeletonBar className="h-6 w-3/4" />
          <SkeletonBar className="h-3.5 w-2/3" />
          <View className="flex-row gap-2">
            <SkeletonBar className="h-6 w-28" round="rounded-full" />
            <SkeletonBar className="h-6 w-24" round="rounded-full" />
          </View>
        </View>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} className={`${cardClass} flex-row items-start gap-3 p-4`}>
            <SkeletonBar className="h-9 w-9" round="rounded-xl" />
            <View className="min-w-0 flex-1 gap-2">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-3.5 w-3/4" />
            </View>
          </View>
        ))}
        {[0, 1].map((i) => (
          <View key={i} className={`${cardClass} gap-3 p-5`}>
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="h-3.5 w-full" />
            <SkeletonBar className="h-3.5 w-5/6" />
            <SkeletonBar className="h-3.5 w-2/3" />
          </View>
        ))}
      </View>
    </Skeleton>
  );
}
