import { useCallback, useEffect, useState } from 'react';

// A countdown in whole seconds for "Resend code in 0:59" (feat/first-signin,
// 2026-10-18). start(seconds) begins it; `remaining` is 0 when the button may
// be pressed again.
//
// THE DEADLINE IS A TIME, NOT A COUNT OF TICKS: a throttled timer — a tab in
// the background, a phone that slept — must not make the wait longer than it
// says, so every tick re-reads the clock. The server keeps its own copy of the
// rule (utils/authCodes.js), so this is what the button says, never what
// decides.
//
// MIRRORED BYTE FOR BYTE to mobile/src/hooks/useCooldown.js (lint:mirrors).
export default function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [until]);

  const start = useCallback((seconds) => {
    const t = Date.now();
    setNow(t);
    setUntil(t + Math.max(0, Number(seconds) || 0) * 1000);
  }, []);

  const remaining = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
  return { remaining, start };
}
