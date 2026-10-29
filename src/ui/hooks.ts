import { useEffect, useRef, useState } from 'react';

/** Re-render every `ms` milliseconds; returns Date.now(). */
export function useNow(ms = 250, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}

/** Remaining ms until a host-clock deadline, correcting for clock offset. */
export function useRemaining(deadline: number | null | undefined, hostOffset = 0, paused = false): number {
  const now = useNow(200, deadline != null && !paused);
  const frozen = useRef<number | null>(null);
  if (deadline == null) return 0;
  const remaining = Math.max(0, deadline - (now + hostOffset));
  if (paused) {
    frozen.current ??= remaining;
    return frozen.current;
  }
  frozen.current = null;
  return remaining;
}

/** Animated number that rolls toward its target. */
export function useRollingNumber(target: number, durationMs = 700): number {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(a + (target - a) * eased);
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, durationMs]);
  return val;
}

/** Keep the phone screen awake where supported (never required). */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    };
    acquire();
    const onVis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [enabled]);
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
