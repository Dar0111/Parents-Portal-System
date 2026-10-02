import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// IS MOTION ALLOWED? — the phone's `prefers-reduced-motion` (feat/ui-refresh,
// 2026-10-02). One read of the OS setting when the app loads this module and
// one listener for a change, held here so a component can ask synchronously.
//
// UNKNOWN MEANS NO. Until the OS has answered, `motionAllowed()` is false, so
// a screen that renders in that first instant simply appears in its final
// state. Nothing is ever hidden while waiting to learn whether it may move.
let reduce = null; // null = not known yet
const listeners = new Set();

function set(value) {
  if (reduce === value) return;
  reduce = value;
  listeners.forEach((listener) => listener());
}

AccessibilityInfo.isReduceMotionEnabled()
  .then((enabled) => set(Boolean(enabled)))
  .catch(() => set(true));

AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => set(Boolean(enabled)));

export function motionAllowed() {
  return reduce === false;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// For a component whose render depends on the answer.
export function useMotionAllowed() {
  return useSyncExternalStore(subscribe, motionAllowed, motionAllowed);
}

// The phone's motion numbers — the web's motion/motion.js in milliseconds.
export const DURATION = Object.freeze({ fast: 150, base: 250, slow: 350 });
export const RISE = 10;
export const STAGGER = 40;
