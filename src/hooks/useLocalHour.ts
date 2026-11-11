import { useSyncExternalStore } from "react";

const hourNow = () => new Date().getHours();

const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stop) {
    let observed = hourNow();
    const refresh = () => {
      const hour = hourNow();
      if (hour === observed) return;
      observed = hour;
      listeners.forEach((notify) => notify());
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    stop = () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stop?.();
      stop = undefined;
    }
  };
}

/**
 * The clock's hour, kept current while a page stays mounted, as
 * `useLocalDateKey` keeps the day: it is read again every half minute
 * and on a return to the app.
 *
 * Food files a log under the meal the hour says, and nothing on the
 * page shows which meal that is. An hour read once when the page opened
 * would file the lunch of someone who left Food open since breakfast as
 * breakfast, and a phone keeps a page open for hours.
 */
export function useLocalHour(): number {
  return useSyncExternalStore(subscribe, hourNow, hourNow);
}
