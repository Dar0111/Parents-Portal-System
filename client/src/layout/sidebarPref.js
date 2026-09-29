// The sidebar's expanded / collapsed state, remembered PER BROWSER
// (feat/ui-polish, 2026-09-30). Key `pp.sidebar`, next to `pp.theme` and
// `pp.textSize` — a device preference, never a user column.
//
// Read synchronously in Shell's useState initializer, so the first render
// already has the right width: no flash from wide to narrow, and no inline
// script in index.html (the theme needs one because it paints before React;
// the sidebar is React). Storage can throw (a private window, blocked site
// data), so both directions are guarded and the fallback is EXPANDED — the
// state a first-time user sees.

export const SIDEBAR_KEY = 'pp.sidebar';

export function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // The choice still holds for this page's life; it just is not remembered.
  }
}
