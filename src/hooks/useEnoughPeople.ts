import { useEffect, useSyncExternalStore } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  communityGoalIds,
  hasEnoughPeople,
  peopleTrainingLately,
} from "@/lib/enoughPeople";

/* One read shared by every mounted copy (the league card, the challenges,
   the Spaces directory, the Feed and People are open at once). It empties
   when the last copy unmounts, so coming back to Social reads afresh, as
   the Spaces directory's reads do. */
let people: number | null = null;
let reading = false;
let mounted = 0;
/** Bumped when the share empties, so a read still out for an earlier
 *  generation lands nowhere. */
let generation = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const current = () => people;

function publish(value: number | null): void {
  people = value;
  for (const listener of listeners) listener();
}

/** The counts the server keeps (see enoughPeople.ts), the largest of them.
 *  A count that cannot be read counts as none, so a failed read keeps the
 *  rooms quiet rather than offering them on a guess. */
async function readPeople(): Promise<number> {
  const [thisMonth, lastMonth] = communityGoalIds(new Date());
  const reads = await Promise.allSettled([
    getDoc(doc(db, "challenges", thisMonth)),
    getDoc(doc(db, "challenges", lastMonth)),
    getDoc(doc(db, "leagueStatus", "current")),
  ]);
  const counts = reads.map((read, i) => {
    if (read.status === "rejected") {
      logger.warn("[enoughPeople] read failed", read.reason);
      return 0;
    }
    const data = read.value.exists() ? read.value.data() : undefined;
    return i < 2 ? data?.collectiveRunners : data?.joined;
  });
  return peopleTrainingLately(counts);
}

/**
 * Whether Tropos has enough people training for leagues, challenges and
 * Spaces to be offered (App1 Q6; the rule and its counts are in
 * `src/lib/enoughPeople.ts`): null until the counts have been read. Read
 * once while any copy is mounted and signed in.
 */
export function useEnoughPeople(): boolean | null {
  const uid = useUid();
  const value = useSyncExternalStore(subscribe, current, current);

  useEffect(() => {
    mounted += 1;
    return () => {
      mounted -= 1;
      if (mounted === 0) {
        generation += 1;
        reading = false;
        people = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!uid || reading || people !== null) return;
    reading = true;
    const mine = generation;
    void readPeople()
      .catch((err) => {
        logger.warn("[enoughPeople] read failed", err);
        return 0;
      })
      .then((count) => {
        if (mine !== generation) return;
        reading = false;
        publish(count);
      });
  }, [uid]);

  if (!uid || value === null) return null;
  return hasEnoughPeople(value);
}
