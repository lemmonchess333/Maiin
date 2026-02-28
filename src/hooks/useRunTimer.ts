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

  return { elapsed, isRunning, start, pause, resume, reset, formatTime };
}
