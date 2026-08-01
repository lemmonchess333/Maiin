/**
 * Training Block data hook (PROGRAM-BLOCK-01, slice 4).
 *
 * ARCHIVE ONLY as of Blk2. The ACTIVE block moved onto
 * `programState.trainingBlock`, which is what makes start and release
 * atomic — block, focus and workouts are one document, so Firestore's
 * own single-document guarantee replaces a transaction and two active
 * blocks became structurally impossible rather than merely guarded by a
 * `find` over a createdAt-sorted list.
 *
 * What is left here is the history of FINISHED blocks: the list read, one
 * archive write, and the lazy review-workout fetch (only when the review
 * actually opens — no standing subscription over historical workouts).
 *
 * All writes go through the guarded wrappers (repo rule: never raw
 * setDoc — undefined stripping + offline-queue survival).
 */

import { useCallback, useEffect, useState } from "react";
import { collection, doc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";
import {
  blockDocPath,
  blocksCollectionPath,
  parseTrainingBlock,
  type TrainingBlock,
} from "./trainingBlock";
import { blockEndDate } from "./trainingBlock";
import type { ReviewWorkoutDoc } from "./blockReviewViewModel";

export function useTrainingBlock(uid: string | undefined) {
  // null = loading; [] = loaded, none
  const [blocks, setBlocks] = useState<TrainingBlock[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDocs(collection(db, blocksCollectionPath(uid)));
        if (cancelled) return;
        const parsed = snap.docs
          .map((d) => parseTrainingBlock(d.data()))
          .filter((b): b is TrainingBlock => b !== null)
          .sort((a, b) => b.createdAt - a.createdAt);
        setBlocks(parsed);
      } catch (err) {
        logger.error("trainingBlock: load failed", err);
        if (!cancelled) setBlocks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  /**
   * Write a finished block to the history collection.
   *
   * Idempotent by doc id, and deliberately called BEFORE the programState
   * write that clears the live block: if the second write fails the user
   * still has their block and a harmless duplicate archive row, whereas the
   * reverse order can lose the record of what was trained.
   */
  const archiveBlock = useCallback(
    async (block: TrainingBlock): Promise<boolean> => {
      if (!uid) return false;
      try {
        await setDocGuarded(doc(db, blockDocPath(uid, block.id)), block);
        setBlocks((prev) => [
          block,
          ...(prev ?? []).filter((b) => b.id !== block.id),
        ]);
        return true;
      } catch (err) {
        logger.error("trainingBlock: archive failed", err);
        return false;
      }
    },
    [uid]
  );

  /** Lazy fetch of the block window's workouts for the review. */
  const loadReviewWorkouts = useCallback(
    async (block: TrainingBlock): Promise<ReviewWorkoutDoc[]> => {
      if (!uid) return [];
      try {
        const snap = await getDocs(
          query(
            collection(db, "users", uid, "workouts"),
            where("date", ">=", block.startDate),
            where("date", "<", blockEndDate(block))
          )
        );
        return snap.docs.map((d) => {
          const data = d.data() as {
            date?: unknown;
            exercises?: Array<{
              exerciseId?: unknown;
              exerciseName?: unknown;
              sets?: Array<{ reps?: unknown; weightKg?: unknown }>;
            }>;
          };
          return {
            date: typeof data.date === "string" ? data.date : "",
            exercises: (data.exercises ?? []).map((ex) => ({
              exerciseId:
                typeof ex.exerciseId === "string" ? ex.exerciseId : "",
              exerciseName:
                typeof ex.exerciseName === "string" ? ex.exerciseName : "",
              sets: (ex.sets ?? []).map((s) => ({
                reps: typeof s.reps === "number" ? s.reps : 0,
                weightKg: typeof s.weightKg === "number" ? s.weightKg : 0,
              })),
            })),
          };
        });
      } catch (err) {
        logger.error("trainingBlock: review workouts load failed", err);
        return [];
      }
    },
    [uid]
  );

  return {
    loading: uid !== undefined && blocks === null,
    blocks: blocks ?? [],
    archiveBlock,
    loadReviewWorkouts,
  };
}
