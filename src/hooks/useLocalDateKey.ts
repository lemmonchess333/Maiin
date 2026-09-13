import { useSyncExternalStore } from "react";
import { localDateString } from "@/lib/dateHelpers";

const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stop) {
    let observed = localDateString();
    const refresh = () => {
      const today = localDateString();
      if (today === observed) return;
      observed = today;
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

/** All date-derived consumers advance together, including on app resume. */
export function useLocalDateKey(): string {
  return useSyncExternalStore(subscribe, localDateString, localDateString);
}
