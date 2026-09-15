import { useEffect, useState } from "react";

export function elapsedSecondsSince(
  startedAt: number,
  now = Date.now()
): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** A paint pulse, never the source of elapsed time. Hidden iOS WebViews do
 * not need repaints; returning to the app immediately reads the real clock. */
export function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const refresh = () => setNow(Date.now());
    const onVisibility = () => {
      clearInterval(interval);
      interval = undefined;
      if (!document.hidden) {
        refresh();
        interval = setInterval(refresh, 1000);
      }
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return elapsedSecondsSince(startedAt, now);
}
