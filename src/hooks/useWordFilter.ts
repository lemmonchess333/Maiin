import { useEffect, useState } from "react";
import {
  loadedWordFilter,
  loadWordFilter,
  type WordFilter,
} from "@/lib/wordFilter";

/**
 * The word filter for a composer or a list of names, or null while it
 * loads. It starts loading when `active` turns true (a sheet opening),
 * and a screen that mounts after it has loaded gets it on the first
 * render. Null means "not checked yet": hold the send, and draw no name
 * the filter has not seen.
 */
export function useWordFilter(active = true): WordFilter | null {
  const [filter, setFilter] = useState<WordFilter | null>(loadedWordFilter);
  useEffect(() => {
    if (!active || filter) return;
    let live = true;
    loadWordFilter().then(
      (loaded) => {
        if (live) setFilter(loaded);
      },
      // Not loaded: the send stays held, and the next open tries again.
      () => {}
    );
    return () => {
      live = false;
    };
  }, [active, filter]);
  return filter;
}
