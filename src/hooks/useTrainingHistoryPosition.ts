import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { HISTORY_PAGE_SIZE } from "@/lib/trainingHistory";

interface Position {
  /** Where the page was scrolled, measured from the top of the rows. */
  offset: number;
  count: number;
}
// Position only, never session records. Account-scoped and bounded for long app sessions.
const positions = new Map<string, Position>();

/** How many rows the period shows (thirty at a time), and where the reader
 *  was. The page reads that many sessions, so this comes before its reads;
 *  `useTrainingHistoryRestore` scrolls back once they arrive.
 *
 *  The place is kept against the top of the rows, not the page:
 *  what sits above them changes height between leaving and coming back (the
 *  sync banner, "Updating this period…"), and a page offset would then land
 *  on a different row. */
export function useTrainingHistoryPosition(
  uid: string | null | undefined,
  filters: string
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

  /** `rows` is the element that holds the rows. */
  function remember(rows: HTMLElement | null) {
    if (!uid) return;
    const top = rowsTop(rows);
    positions.delete(key);
    positions.set(key, {
      offset: window.scrollY - (top ?? 0),
      count,
    });
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
    key,
    count,
    restored,
    remember,
    reset,
    showMore: () => setPagination({ key, count: count + HISTORY_PAGE_SIZE }),
  };
}

/** The rows' top, measured from the top of the page. */
function rowsTop(rows: HTMLElement | null) {
  return rows ? rows.getBoundingClientRect().top + window.scrollY : null;
}

export function useTrainingHistoryRestore(
  { key, count, restored }: ReturnType<typeof useTrainingHistoryPosition>,
  rows: RefObject<HTMLElement | null>,
  ready: boolean,
  rowCount: number,
  provisional: boolean
) {
  useLayoutEffect(() => {
    if (
      restored.current?.key === key &&
      (!restored.current.needsFinalRestore || provisional)
    )
      return;
    const position = positions.get(key);
    if (position && !ready) return;
    const frame = requestAnimationFrame(() => {
      const top = position ? rowsTop(rows.current) : 0;
      // The rows aren't drawn yet: wait for the render that draws them.
      if (top === null) return;
      const y = position ? top + position.offset : 0;
      window.scrollTo({ top: y, behavior: "instant" });
      // A cached answer can be shorter than the live period. Retry once
      // more rows arrive instead of accepting the browser's early clamp.
      if (Math.abs(window.scrollY - y) < 2)
        restored.current = {
          key,
          // A provisional sync banner sits above the rows. When it leaves,
          // restore once more so its height does not shift the return spot.
          needsFinalRestore: Boolean(position && provisional),
        };
    });
    return () => cancelAnimationFrame(frame);
  }, [key, ready, count, rowCount, provisional, restored, rows]);
}
