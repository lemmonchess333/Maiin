import { useState, useRef, useCallback, useEffect } from 'react';

export function useRunTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const accumulatedRef = useRef(0);

  const start = useCallback(() => { startTimeRef.current = Date.now(); setIsRunning(true); }, []);
  const pause = useCallback(() => {
    accumulatedRef.current += (Date.now() - startTimeRef.current) / 1000;
    setIsRunning(false);
  }, []);
  const resume = useCallback(() => { startTimeRef.current = Date.now(); setIsRunning(true); }, []);
  const reset = useCallback(() => {
    accumulatedRef.current = 0; startTimeRef.current = 0;
    setElapsed(0); setIsRunning(false);
  }, []);

  /**
   * Phase B3: rehydrate the timer from a persisted snapshot.
   * Sets the internal refs in a single synchronous block so the
   * next render reads consistent state. Caller chooses whether to
   * leave the timer running (active) or paused — pass `isRunning`
   * accordingly.
   *
   * `accumulatedSeconds` is what `accumulatedRef` held at write
   * time. `startedAt` is the original run-start epoch — kept around
   * so the timer's elapsed math (`accumulatedRef + (Date.now() -
   * startTimeRef) / 1000`) stays continuous from where it left off.
   *
   * When `isRunning` is true, we set `startTimeRef.current` to
   * `Date.now()` (not the original startedAt) so the running
   * portion of the elapsed only counts post-rehydrate seconds —
   * the gap between last-write and now is correctly absorbed
   * into accumulatedRef by the write-cadence semantics.
   */
  const rehydrate = useCallback(
    (args: { accumulatedSeconds: number; isRunning: boolean }) => {
      accumulatedRef.current = args.accumulatedSeconds;
      startTimeRef.current = Date.now();
      setElapsed(Math.floor(args.accumulatedSeconds));
      setIsRunning(args.isRunning);
    },
    [],
  );

  /** Force an immediate elapsed recalculation (call after tab becomes visible) */
  const recalcNow = useCallback(() => {
    if (!isRunning) return;
    setElapsed(Math.floor(accumulatedRef.current + (Date.now() - startTimeRef.current) / 1000));
  }, [isRunning]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor(accumulatedRef.current + (Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else if (intervalRef.current) clearInterval(intervalRef.current);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  const formatTime = useCallback((secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  /**
   * Phase B3 helper for the persistence write path. Exposes the
   * timer's internal accumulated seconds so Run.tsx can snapshot
   * the timer state without re-deriving from `elapsed` (which
   * floors every second and would drift on rehydrate).
   */
  const getAccumulatedSeconds = useCallback(() => {
    if (isRunning) {
      return accumulatedRef.current + (Date.now() - startTimeRef.current) / 1000;
    }
    return accumulatedRef.current;
  }, [isRunning]);

  return { elapsed, isRunning, start, pause, resume, reset, rehydrate, recalcNow, formatTime, getAccumulatedSeconds };
}
