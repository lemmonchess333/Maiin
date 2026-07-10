/**
 * Training Block data hook (PROGRAM-BLOCK-01, slice 4).
 *
 * Owns the owner-only `users/{uid}/trainingBlocks` subcollection:
 * loads the block list once per uid, exposes the single ACTIVE block
 * (a UI constraint — the schema keeps full history), and provides the
 * three writes: create, finish-with-explicit-outcome, and the lazy
 * review-workout fetch (only when the review actually opens — no
 * standing subscription over historical workouts).
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
  makeBlockId,
  parseTrainingBlock,
  presetLabel,
  type BlockDurationWeeks,
  type BlockOutcomeChoice,
  type BlockPreset,
  type TrainingBlock,
} from "./trainingBlock";
import { blockEndDate } from "./trainingBlock";
import type { ReviewWorkoutDoc } from "./blockReviewViewModel";

export interface CreateBlockInput {
  preset: BlockPreset;
  durationWeeks: BlockDurationWeeks;
  /** Local YYYY-MM-DD start. */
  startDate: string;
  weeklyLiftTarget: number;
  /** ≤3 exerciseIds; v1 derives these from the programme's main
   *  compounds at creation (no picker yet). */
  anchorExerciseIds: string[];
  why: string;
}

export function useTrainingBlock(uid: string | undefined) {
  // null = loading; [] = loaded, none
  const [blocks, setBlocks] = useState<TrainingBlock[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDocs(
          collection(db, "users", uid, "trainingBlocks")
        );
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

  const activeBlock = blocks?.find((b) => b.status === "active") ?? null;

  const createBlock = useCallback(
    async (input: CreateBlockInput): Promise<TrainingBlock | null> => {
      if (!uid) return null;
      const block: TrainingBlock = {
        id: makeBlockId(input.startDate, input.preset),
        preset: input.preset,
        title: presetLabel(input.preset),
        startDate: input.startDate,
        durationWeeks: input.durationWeeks,
        weeklyLiftTarget: Math.max(1, input.weeklyLiftTarget),
        anchorExerciseIds: input.anchorExerciseIds.slice(0, 3),
        why: input.why,
        status: "active",
        createdAt: Date.now(),
      };
      try {
        await setDocGuarded(
          doc(db, "users", uid, "trainingBlocks", block.id),
          block
        );
        setBlocks((prev) => [block, ...(prev ?? [])]);
        return block;
      } catch (err) {
        logger.error("trainingBlock: create failed", err);
        return null;
      }
    },
    [uid]
  );

  /** Records the EXPLICIT end-of-block choice. Never touches the
   *  programme — "adjust"/"new" navigation is the caller's job. */
  const finishBlock = useCallback(
    async (
      block: TrainingBlock,
      outcome: BlockOutcomeChoice
    ): Promise<boolean> => {
      if (!uid) return false;
      const finished: TrainingBlock = {
        ...block,
        status: "completed",
        outcome,
        endedAt: Date.now(),
      };
      try {
        await setDocGuarded(
          doc(db, "users", uid, "trainingBlocks", block.id),
          finished
        );
        setBlocks((prev) =>
          (prev ?? []).map((b) => (b.id === block.id ? finished : b))
        );
        return true;
      } catch (err) {
        logger.error("trainingBlock: finish failed", err);
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
    activeBlock,
    createBlock,
    finishBlock,
    loadReviewWorkouts,
  };
}
