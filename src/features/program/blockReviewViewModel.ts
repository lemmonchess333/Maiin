/**
 * Block review view model (PROGRAM-BLOCK-01, slice 3) — pure.
 *
 * Builds the end-of-block "calm coach checkpoint" from evidence the
 * app already owns: saved workout docs inside the block window, the
 * block's weekly lift target, and (optionally) the user's anchor
 * movements. No new analytics warehouse, no new subscriptions.
 *
 * Locked constraints (GsPb1):
 *   - success = CONSISTENCY (planned vs completed) + an optional
 *     anchor-movement metric — never a universal weight-loss target,
 *     and no bodyweight number ever appears here (hideWeightNumber
 *     is moot because weight is simply not a block metric)
 *   - thin data degrades gracefully: missing weeks, skipped
 *     sessions, deload weeks and zero-workout blocks all produce a
 *     usable review, never an error state or a guilt trip
 */

import type { TrainingBlock } from "./trainingBlock";
import { blockEndDate, blockWeekOf } from "./trainingBlock";

/** The slice of a saved workout doc the review consumes. */
export interface ReviewWorkoutDoc {
  /** Local YYYY-MM-DD. */
  date: string;
  exercises: Array<{
    exerciseId: string;
    exerciseName: string;
    sets: Array<{ reps: number; weightKg: number }>;
  }>;
}

export interface AnchorProgress {
  exerciseId: string;
  exerciseName: string;
  /** Best single-set load (kg) in the FIRST half of the block. */
  startBestKg: number | null;
  /** Best single-set load (kg) in the SECOND half of the block. */
  endBestKg: number | null;
  /** endBestKg - startBestKg when both halves have data. */
  deltaKg: number | null;
}

export interface BlockReview {
  /** Sessions completed inside the block window. */
  completedLifts: number;
  /** weeklyLiftTarget × durationWeeks. */
  plannedLifts: number;
  /** 0..1, capped at 1 (over-achieving reads as 100%, not 110%). */
  consistency: number;
  /** Per-week completed counts, index 0 = week 1. */
  weeklyCounts: number[];
  /** Anchor progress rows — only anchors with ANY block data appear. */
  anchors: AnchorProgress[];
  /** True when the block window contains no workouts at all. */
  isEmpty: boolean;
  /** Calm one-liner for the header — never shaming. */
  verdict: string;
}

function bestSetKg(
  workouts: ReviewWorkoutDoc[],
  exerciseId: string
): number | null {
  let best: number | null = null;
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets) {
        if (s.weightKg > (best ?? -Infinity)) best = s.weightKg;
      }
    }
  }
  return best;
}

function verdictFor(consistency: number, isEmpty: boolean): string {
  if (isEmpty)
    return "A quiet block — it happens. The next one is a fresh start.";
  if (consistency >= 0.85) return "You showed up. That was the whole job.";
  if (consistency >= 0.5)
    return "A solid block — more sessions landed than not.";
  return "Some weeks got away — the work you did still counts.";
}

/**
 * Build the review from the workouts INSIDE the block window
 * (startDate inclusive → blockEndDate exclusive). Callers pass every
 * workout doc they have for the range; filtering is done here so the
 * function stays safe against over-fetching.
 */
export function buildBlockReview(
  block: TrainingBlock,
  workouts: ReviewWorkoutDoc[]
): BlockReview {
  const end = blockEndDate(block);
  const inWindow = workouts.filter(
    (w) => w.date >= block.startDate && w.date < end
  );

  const weeklyCounts = Array.from({ length: block.durationWeeks }, () => 0);
  for (const w of inWindow) {
    const week = blockWeekOf(block, w.date);
    if (week !== null) weeklyCounts[week - 1] += 1;
  }

  const completedLifts = inWindow.length;
  const plannedLifts = Math.max(
    1,
    block.weeklyLiftTarget * block.durationWeeks
  );
  const consistency = Math.min(1, completedLifts / plannedLifts);

  // Anchor metric: best single-set load, first half vs second half of
  // the block. Deliberately coarse — a direction signal, not a lab
  // report. Anchors with zero block data are omitted entirely.
  const midWeek = Math.ceil(block.durationWeeks / 2);
  const firstHalf = inWindow.filter(
    (w) => (blockWeekOf(block, w.date) ?? Infinity) <= midWeek
  );
  const secondHalf = inWindow.filter(
    (w) => (blockWeekOf(block, w.date) ?? 0) > midWeek
  );
  const anchors: AnchorProgress[] = [];
  for (const anchorId of block.anchorExerciseIds) {
    const startBestKg = bestSetKg(firstHalf, anchorId);
    const endBestKg = bestSetKg(secondHalf, anchorId);
    if (startBestKg === null && endBestKg === null) continue;
    const name =
      inWindow
        .flatMap((w) => w.exercises)
        .find((e) => e.exerciseId === anchorId)?.exerciseName ?? anchorId;
    anchors.push({
      exerciseId: anchorId,
      exerciseName: name,
      startBestKg,
      endBestKg,
      deltaKg:
        startBestKg !== null && endBestKg !== null
          ? Math.round((endBestKg - startBestKg) * 10) / 10
          : null,
    });
  }

  const isEmpty = completedLifts === 0;
  return {
    completedLifts,
    plannedLifts,
    consistency,
    weeklyCounts,
    anchors,
    isEmpty,
    verdict: verdictFor(consistency, isEmpty),
  };
}
