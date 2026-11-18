import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import {
  fasterFirst,
  fetchSegmentBoard,
  parseEffort,
  parseSegment,
  type BoardEntry,
  type Segment,
  type SegmentEffort,
} from "@/lib/segments";

export type SegmentStatus = "loading" | "ready" | "missing" | "failed";

export interface SegmentPageData {
  status: SegmentStatus;
  segment: Segment | null;
  /** The person's own efforts on it, fastest first. */
  efforts: SegmentEffort[];
  /** Whether the signed-in person made it: only its maker can read who
   *  did, so anyone else reads false. */
  mine: boolean;
  retry: () => void;
}

/**
 * A segment's page (Run26 call 3): the segment, the signed-in person's own
 * efforts on it (live, so a run timed while the page is open joins the
 * list) and whether they made it.
 */
export function useSegment(
  uid: string | null | undefined,
  segmentId: string | null | undefined
): SegmentPageData {
  const [attempt, setAttempt] = useState(0);
  const key = uid && segmentId ? `${uid}/${segmentId}/${attempt}` : null;
  const [head, setHead] = useState<{
    key: string;
    status: SegmentStatus;
    segment: Segment | null;
    mine: boolean;
  } | null>(null);
  const [own, setOwn] = useState<{
    key: string;
    efforts: SegmentEffort[];
  } | null>(null);

  useEffect(() => {
    if (!uid || !segmentId) return;
    const at = `${uid}/${segmentId}/${attempt}`;
    let live = true;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, "segments", segmentId));
        const segment = snap.exists()
          ? parseSegment(segmentId, snap.data())
          : null;
        // Read by its maker alone; anyone else is refused, which reads as
        // not theirs.
        const mine = await getDoc(doc(db, "segmentOwners", segmentId))
          .then((o) => o.exists() && o.data()?.uid === uid)
          .catch(() => false);
        if (live)
          setHead({
            key: at,
            status: segment ? "ready" : "missing",
            segment,
            mine,
          });
      } catch (err) {
        logger.warn("[segments] a segment could not be read", err);
        if (live)
          setHead({ key: at, status: "failed", segment: null, mine: false });
      }
    })();
    const unsubscribe = onSnapshot(
      query(
        collection(db, "users", uid, "segmentEfforts"),
        where("segmentId", "==", segmentId)
      ),
      (snap) => {
        if (!live) return;
        setOwn({
          key: at,
          efforts: snap.docs
            .map((d) => parseEffort(d.id, d.data()))
            .filter((e): e is SegmentEffort => e !== null)
            .sort(fasterFirst),
        });
      },
      (err) => {
        logger.warn("[segments] your efforts could not be read", err);
        if (live) setOwn({ key: at, efforts: [] });
      }
    );
    return () => {
      live = false;
      unsubscribe();
    };
  }, [uid, segmentId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = key && head?.key === key ? head : null;
  return {
    status: current?.status ?? "loading",
    segment: current?.segment ?? null,
    efforts: key && own?.key === key ? own.efforts : [],
    mine: current?.mine ?? false,
    retry,
  };
}

export type BoardStatus = "loading" | "ready" | "failed";

export interface SegmentBoard {
  status: BoardStatus;
  /** The people the signed-in person follows who have run it, fastest
   *  first, as the server allows them to be seen. */
  entries: BoardEntry[];
  retry: () => void;
}

/** A segment's board of the people the signed-in person follows, from the
 *  server (`getSegmentBoard`), read once and again on `retry`. */
export function useSegmentBoard(
  segmentId: string | null | undefined,
  enabled = true
): SegmentBoard {
  const [attempt, setAttempt] = useState(0);
  const key = segmentId && enabled ? `${segmentId}/${attempt}` : null;
  const [read, setRead] = useState<{
    key: string;
    status: BoardStatus;
    entries: BoardEntry[];
  } | null>(null);

  useEffect(() => {
    if (!segmentId || !enabled) return;
    const at = `${segmentId}/${attempt}`;
    let live = true;
    fetchSegmentBoard(segmentId)
      .then((entries) => {
        if (live) setRead({ key: at, status: "ready", entries });
      })
      .catch((err) => {
        logger.warn("[segments] a board could not be read", err);
        if (live) setRead({ key: at, status: "failed", entries: [] });
      });
    return () => {
      live = false;
    };
  }, [segmentId, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = key && read?.key === key ? read : null;
  return {
    status: current?.status ?? "loading",
    entries: current?.entries ?? [],
    retry,
  };
}
