import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { localWeekKey } from "@/lib/dateHelpers";
import { logger } from "@/lib/logger";
import { parseSpaceWeek, type SpaceWeek } from "./spaceWeek";

/**
 * A Space's figures for the viewer's current week,
 * `spaces/{spaceId}/weeks/{weekKey}` (Run27 call 11), read once per Space
 * and week. Null while it loads, when it could not be read, and while too
 * few members trained for the server to store any figure: the page then
 * says nothing about the week.
 */
export function useSpaceWeek(spaceId: string | undefined): SpaceWeek | null {
  const weekKey = localWeekKey();
  const key = spaceId ? `${spaceId}:${weekKey}` : null;
  const [read, setRead] = useState<{
    key: string;
    week: SpaceWeek | null;
  } | null>(null);

  useEffect(() => {
    if (!spaceId || !key) return;
    let live = true;
    getDoc(doc(db, "spaces", spaceId, "weeks", weekKey))
      .then((snap) => {
        if (live)
          setRead({
            key,
            week: snap.exists() ? parseSpaceWeek(snap.data()) : null,
          });
      })
      .catch((err) => {
        logger.warn("[spaceWeek] read failed", err);
        if (live) setRead({ key, week: null });
      });
    return () => {
      live = false;
    };
  }, [spaceId, weekKey, key]);

  return read?.key === key ? read.week : null;
}
