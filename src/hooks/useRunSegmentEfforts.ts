import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import {
  ownRank,
  parseEffort,
  parseSegment,
  type Segment,
  type SegmentEffort,
} from "@/lib/segments";

/** One of a run's segment efforts, with its place among the person's own
 *  efforts on that segment. */
export interface RunSegmentEffort {
  effort: SegmentEffort;
  segment: Segment;
  /** 1 for the person's fastest on the segment. */
  rank: number;
  /** How many efforts the person has on the segment. */
  of: number;
}

export interface RunSegmentEfforts {
  loading: boolean;
  failed: boolean;
  /** In the order they were run. */
  rows: RunSegmentEffort[];
}

const EMPTY: RunSegmentEfforts = { loading: true, failed: false, rows: [] };

/**
 * A saved run's segment efforts (Run26 call 3), live: the server times a
 * run on its segments a few seconds after it is saved, so a run opened
 * straight from the finish screen fills in as they land. Each effort comes
 * with its segment and its rank among the person's own efforts there. An
 * effort whose segment has been deleted is left out.
 */
export function useRunSegmentEfforts(
  uid: string | null | undefined,
  runId: string | null | undefined
): RunSegmentEfforts {
  const key = uid && runId ? `${uid}/${runId}` : null;
  const [read, setRead] = useState<{
    key: string;
    value: RunSegmentEfforts;
  } | null>(null);

  useEffect(() => {
    if (!uid || !runId) return;
    const at = `${uid}/${runId}`;
    let live = true;
    let generation = 0;
    const efforts = collection(db, "users", uid, "segmentEfforts");
    const fail = (err: unknown) => {
      logger.warn("[segments] a run's efforts could not be read", err);
      if (live)
        setRead({ key: at, value: { loading: false, failed: true, rows: [] } });
    };
    const unsubscribe = onSnapshot(
      query(efforts, where("runId", "==", runId)),
      (snap) => {
        const mine = ++generation;
        const found = snap.docs
          .map((d) => parseEffort(d.id, d.data()))
          .filter((e): e is SegmentEffort => e !== null);
        const segmentIds = [...new Set(found.map((e) => e.segmentId))];
        void Promise.all(
          segmentIds.map(async (segmentId) => {
            const [segmentSnap, ownSnap] = await Promise.all([
              getDoc(doc(db, "segments", segmentId)),
              getDocs(query(efforts, where("segmentId", "==", segmentId))),
            ]);
            const segment = segmentSnap.exists()
              ? parseSegment(segmentId, segmentSnap.data())
              : null;
            const own = ownSnap.docs
              .map((d) => parseEffort(d.id, d.data()))
              .filter((e): e is SegmentEffort => e !== null);
            return { segmentId, segment, own };
          })
        )
          .then((segments) => {
            if (!live || mine !== generation) return;
            const bySegment = new Map(segments.map((s) => [s.segmentId, s]));
            const rows = found
              .flatMap((effort) => {
                const known = bySegment.get(effort.segmentId);
                if (!known?.segment) return [];
                const own = known.own.some((e) => e.id === effort.id)
                  ? known.own
                  : [...known.own, effort];
                return [
                  {
                    effort,
                    segment: known.segment,
                    rank: ownRank(effort, own),
                    of: own.length,
                  },
                ];
              })
              .sort(
                (a, b) =>
                  a.effort.startedAtMs - b.effort.startedAtMs ||
                  a.effort.id.localeCompare(b.effort.id)
              );
            setRead({
              key: at,
              value: { loading: false, failed: false, rows },
            });
          })
          .catch(fail);
      },
      fail
    );
    return () => {
      live = false;
      unsubscribe();
    };
  }, [uid, runId]);

  if (!key) return { loading: false, failed: false, rows: [] };
  return read?.key === key ? read.value : EMPTY;
}
