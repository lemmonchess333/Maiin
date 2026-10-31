import { useLayoutEffect, useRef, useState } from "react";
import { HISTORY_PAGE_SIZE } from "@/lib/trainingHistory";

interface Position {
  y: number;
  count: number;
}
// Position only, never session records. Account-scoped and bounded for long app sessions.
const positions = new Map<string, Position>();

export function useTrainingHistoryPosition(
  uid: string | null | undefined,
  filters: string,
  ready: boolean,
  rowCount: number,
  provisional: boolean
) {
  const key = `${uid ?? ""}:${filters}`;
  const [pagination, setPagination] = useState(() => ({
    key,
    count: positions.get(key)?.count ?? HISTORY_PAGE_SIZE,
  }));
  const count =
    pagination.key === key
      ? pagination.count
      : (positions.get(key)?.count ?? HISTORY_PAGE_SIZE);
  const restored = useRef<{
    key: string;
    needsFinalRestore: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    if (
      restored.current?.key === key &&
      (!restored.current.needsFinalRestore || provisional)
    )
      return;
    const position = positions.get(key);
    if (position && !ready) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: position?.y ?? 0, behavior: "instant" });
      // A cached answer can be shorter than the live period. Retry once
      // more rows arrive instead of accepting the browser's early clamp.
      if (Math.abs(window.scrollY - (position?.y ?? 0)) < 2)
        restored.current = {
          key,
          // A provisional sync banner sits above the rows. When it leaves,
          // restore once more so its height does not shift the return spot.
          needsFinalRestore: Boolean(position && provisional),
        };
    });
    return () => cancelAnimationFrame(frame);
  }, [key, ready, count, rowCount, provisional]);

  function remember() {
    if (!uid) return;
    positions.delete(key);
    positions.set(key, { y: window.scrollY, count });
    if (positions.size > 40) positions.delete(positions.keys().next().value!);
  }

  function reset(nextFilters: string) {
    positions.delete(`${uid ?? ""}:${nextFilters}`);
    restored.current = null;
    setPagination({
      key: `${uid ?? ""}:${nextFilters}`,
      count: HISTORY_PAGE_SIZE,
    });
  }

  return {
    count,
    remember,
    reset,
    showMore: () => setPagination({ key, count: count + HISTORY_PAGE_SIZE }),
  };
}
