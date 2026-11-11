import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { parseCohortCount } from "./planGroup";

export interface RaceCohort {
  /** The read for this race has not settled. */
  loading: boolean;
  /** How many people are training for the race, the viewer included; null
   *  when there is no count yet or it could not be read. */
  count: number | null;
}

/**
 * A race's plan-group size, `raceCohorts/{spaceId}`, read once per race.
 * `null` reads nothing. A failed read settles as no count: the card then
 * says only what is true of the viewer, and the hero says nothing.
 */
export function useRaceCohort(spaceId: string | null): RaceCohort {
  const [read, setRead] = useState<{
    spaceId: string;
    count: number | null;
  } | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    let live = true;
    getDoc(doc(db, "raceCohorts", spaceId))
      .then((snap) => {
        if (live)
          setRead({
            spaceId,
            count: snap.exists() ? parseCohortCount(snap.data()) : null,
          });
      })
      .catch((err) => {
        logger.warn("[raceCohort] read failed", err);
        if (live) setRead({ spaceId, count: null });
      });
    return () => {
      live = false;
    };
  }, [spaceId]);

  if (!spaceId) return { loading: false, count: null };
  if (read?.spaceId !== spaceId) return { loading: true, count: null };
  return { loading: false, count: read.count };
}
