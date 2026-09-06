import { useEffect, useState } from "react";
import { localDateString } from "@/lib/dateHelpers";

/** Refresh date-derived state across midnight and a suspended app's return. */
export function useLocalDateKey(): string {
  const [today, setToday] = useState(localDateString);
  useEffect(() => {
    const refresh = () => setToday(localDateString());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
