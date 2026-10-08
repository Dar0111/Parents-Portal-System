// THE SKELETON (build 2, feat/dashboards-look, 2026-10-07) — tier 1: the
// DataTable frame, the dashboard Card and the report card. A placeholder SHAPED
// LIKE THE CONTENT it stands in for — bars where text will be, a circle where
// an avatar will be, inside the same frame — so the content arrives into the
// space the skeleton already held instead of pushing the page about.
//
// WHEN IT SHOWS is hooks/useSkeleton.js: nothing for 300 ms, then this, gone
// the moment loading ends — no minimum. The region is mounted from the first
// frame with the real height reserved (`invisible` during the wait: laid out,
// not painted). Only a region with NOTHING of its content on screen gets one;
// a re-read over content already shown keeps that content (decision 1).
//
// THE LOOK (decision 5): the app's own neutral `edge` token in both themes —
// no new token. `edge` on `surface` is faint (about 1.27:1 light, 1.2:1 dark)
// and that is deliberate: a placeholder is decoration, not information, so
// WCAG 1.4.11 does not apply, and it never sits on the bare page, only inside
// a frame. The owner's device check passed it in both themes (2026-10-08).
//
// THE SHIMMER IS A SWEEP (build 2 fix round F6, 2026-10-08 — the owner picked
// it over the opacity pulse): a light band passes across the bars, left to
// right, as ONE band over the whole region — each bar shows only the part of
// the band that crosses it, so the gaps between bars stay clean. It lives in
// `index.css` (`.skeleton-bone`, `@keyframes skeleton-sweep`), switched on by
// this region's `data-skeleton="painted"`: THREE passes of 1.5 s (4.5 s, under
// WCAG 2.2.2's five seconds), then the bars stand still — it never runs on
// without end. Under `prefers-reduced-motion: reduce` there is no band at all.
// It is the one loop in the app, by the owner's decision; motion is otherwise
// for entrances only (§27c).
//
// ACCESSIBILITY (decision 7): the region is `role="status"` + `aria-live` +
// `aria-busy="true"`, with the same words the spinner used ("Loading…" unless
// the caller names the wait) in an sr-only span. The shapes are `aria-hidden`.
const FILL = 'bg-edge';
const BONE = 'skeleton-bone';

// One bar: a line of text, a figure, a tag, a control — the caller sizes it.
// A tag's corner by default; a control-shaped bar passes `round="rounded-lg"`
// (§27f's control radius), never a second rounding class beside this one.
export function SkeletonBar({ className = '', round = 'rounded-md' }) {
  return <span className={`${BONE} block ${round} ${FILL} ${className}`} />;
}

// An avatar or a disc.
export function SkeletonCircle({ className = 'h-10 w-10' }) {
  return <span className={`${BONE} block shrink-0 rounded-full ${FILL} ${className}`} />;
}

// The region. `phase` is useSkeleton's: 'wait' lays the shapes out unpainted,
// 'skeleton' paints them — and starts the sweep.
export default function Skeleton({ phase, label = 'Loading…', className = '', children }) {
  const painted = phase === 'skeleton';
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" data-skeleton={painted ? 'painted' : 'wait'} className={painted ? undefined : 'invisible'}>
        {children}
      </div>
    </div>
  );
}
