/**
 * Express Sessions (PROGRAM-FLEX-01) — time-budgeted execution of an
 * existing programme day.
 *
 * The retention gap this closes: the programme was binary — do the
 * full session or skip it. "I have 30 minutes" had no path. An Express
 * Session is a ONE-SESSION execution option: it deterministically trims
 * the day down to a time budget while preserving what the session is
 * for, and it never touches the stored programme, progression state or
 * future weeks.
 *
 * Policy (deliberately conservative — no fake AI programming):
 *   1. Primary/compound movements (`isAccessory === false`) are NEVER
 *      dropped. Exercises with `isAccessory === undefined` (legacy
 *      plans predate the flag; `normalizeExercise` doesn't backfill
 *      it) are treated as compounds — ambiguity protects, never trims.
 *   2. Whole ACCESSORY exercises are dropped from the END of the
 *      session first (the engine orders mains first, so end-first is
 *      also least-valuable-first).
 *   3. Still over budget → remaining accessory sets are reduced from
 *      the end, floor {@link ACCESSORY_MIN_SETS}.
 *   4. Still over budget → compound sets are reduced from the end,
 *      floor {@link COMPOUND_MIN_SETS} — EXCEPT the first exercise,
 *      the day's primary anchor, which always keeps its full
 *      prescription.
 *   5. Whatever still doesn't fit stays: the plan runs honestly over
 *      budget rather than gutting the session. No substitutions, no
 *      supersets, no intensity inventions.
 *
 * Time model: {@link MINUTES_PER_SET} minutes per set — the same
 * 2.5 min/set basis as the SessionCommandCard estimate in
 * Program.tsx. `ProgramExercise` carries no per-exercise rest data,
 * so the budget is set-count-based by construction.
 */

import type { ProgramExercise, WorkoutDay } from "./programTypes";

export type SessionVariant = "full" | "express45" | "express30";

/** Mirrors the `~min` estimate shown on the lift SessionCommandCard. */
export const MINUTES_PER_SET = 2.5;

export const EXPRESS_BUDGET_MINUTES: Record<
  Exclude<SessionVariant, "full">,
  number
> = {
  express45: 45,
  express30: 30,
};

/** An accessory never goes below 2 sets — below that, drop it instead. */
export const ACCESSORY_MIN_SETS = 2;
/** A compound never goes below 3 sets (and is never dropped). */
export const COMPOUND_MIN_SETS = 3;

export interface ExpressTrim {
  /** Names of accessory exercises removed, in original day order. */
  droppedExercises: string[];
  /** Set reductions applied, in the order they were applied. */
  reducedSets: Array<{ name: string; from: number; to: number }>;
}

export interface ExpressPlan {
  variant: SessionVariant;
  /** The executable exercise list — fresh objects, input day untouched. */
  exercises: ProgramExercise[];
  /**
   * Maps each plan position to its index in the ORIGINAL day
   * (`sourceIndexes[planIdx] === dayIdx`). The live session logs sets
   * positionally over the trimmed list, but progression
   * (`logExercise`) and the completion write index into the STORED
   * programme day — callers must realign through this mapping or a
   * dropped exercise shifts every later log onto the wrong lift.
   */
  sourceIndexes: number[];
  /** Estimate for THIS plan (post-trim), rounded like the UI's. */
  estimatedMinutes: number;
  trim: ExpressTrim;
}

export function estimateSessionMinutes(
  exercises: ReadonlyArray<Pick<ProgramExercise, "sets">>
): number {
  return Math.round(
    exercises.reduce((s, ex) => s + ex.sets, 0) * MINUTES_PER_SET
  );
}

function isAccessoryExercise(ex: ProgramExercise): boolean {
  // undefined = legacy/unflagged → treated as compound (protected).
  return ex.isAccessory === true;
}

/**
 * Build the execution plan for a programme day at a time budget.
 * Pure + deterministic: same day + variant always yields the same plan.
 */
export function buildExpressSession(
  day: WorkoutDay,
  variant: SessionVariant
): ExpressPlan {
  // Fresh objects throughout — the caller feeds this straight into the
  // live session, which must never alias the stored programme state.
  // Each entry carries its ORIGINAL day index so drops don't desync
  // progression / completion writes (see ExpressPlan.sourceIndexes).
  let items = day.exercises.map((ex, src) => ({ ex: { ...ex }, src }));
  const trim: ExpressTrim = { droppedExercises: [], reducedSets: [] };

  const finish = (): ExpressPlan => ({
    variant,
    exercises: items.map((it) => it.ex),
    sourceIndexes: items.map((it) => it.src),
    estimatedMinutes: estimateSessionMinutes(items.map((it) => it.ex)),
    trim,
  });

  if (variant === "full") return finish();

  const budget = EXPRESS_BUDGET_MINUTES[variant];
  const totalSets = () => items.reduce((s, it) => s + it.ex.sets, 0);
  const overBudget = () => totalSets() * MINUTES_PER_SET > budget;

  const overageSets = () =>
    Math.ceil((totalSets() * MINUTES_PER_SET - budget) / MINUTES_PER_SET);

  // Pass 1 — trim accessories from the end. Prefer the least
  // destructive action that still fits: if reducing THIS accessory's
  // sets (floor ACCESSORY_MIN_SETS) absorbs the whole remaining
  // overage, reduce it; otherwise drop it whole. Dropping whole
  // accessories is deliberately preferred over spreading thin 2-set
  // remnants across many stations — the 2.5 min/set model carries no
  // setup/equipment-change overhead, and fewer stations is the honest
  // 30-minute session.
  for (let i = items.length - 1; i >= 0 && overBudget(); i--) {
    const { ex } = items[i];
    if (!isAccessoryExercise(ex)) continue;
    const excess = overageSets();
    if (excess <= ex.sets - ACCESSORY_MIN_SETS) {
      const to = ex.sets - excess;
      trim.reducedSets.push({ name: ex.name, from: ex.sets, to });
      items[i] = { ex: { ...ex, sets: to }, src: items[i].src };
    } else {
      trim.droppedExercises.unshift(ex.name);
      items = [...items.slice(0, i), ...items.slice(i + 1)];
    }
  }

  // Pass 2 — reduce compound sets from the end, never the first
  // exercise (the day's primary anchor keeps its full prescription).
  // Reached only when every accessory has been dropped/reduced and the
  // day still doesn't fit (compound-heavy or legacy unflagged days).
  for (let i = items.length - 1; i >= 1 && overBudget(); i--) {
    const { ex } = items[i];
    if (isAccessoryExercise(ex) || ex.sets <= COMPOUND_MIN_SETS) continue;
    const to = Math.max(COMPOUND_MIN_SETS, ex.sets - overageSets());
    trim.reducedSets.push({ name: ex.name, from: ex.sets, to });
    items[i] = { ex: { ...ex, sets: to }, src: items[i].src };
  }

  return finish();
}

/**
 * Which variants are worth OFFERING for this day. Only budgets that
 * actually change the session are surfaced — a day that already fits
 * in 30 minutes gets `["full"]`, and the chooser sheet is skipped
 * entirely (the primary action stays one tap when there's nothing to
 * choose).
 */
export function expressChoices(day: WorkoutDay): SessionVariant[] {
  const est = estimateSessionMinutes(day.exercises);
  const choices: SessionVariant[] = ["full"];
  if (est > EXPRESS_BUDGET_MINUTES.express45) choices.push("express45");
  if (est > EXPRESS_BUDGET_MINUTES.express30) choices.push("express30");
  return choices;
}

/** Short human summary of a trim, for the chooser sheet copy. */
export function summarizeTrim(trim: ExpressTrim): string {
  const parts: string[] = [];
  if (trim.droppedExercises.length > 0) {
    parts.push(
      trim.droppedExercises.length === 1
        ? "1 accessory trimmed"
        : `${trim.droppedExercises.length} accessories trimmed`
    );
  }
  if (trim.reducedSets.length > 0) {
    parts.push(
      trim.reducedSets.length === 1
        ? "sets reduced on 1 exercise"
        : `sets reduced on ${trim.reducedSets.length} exercises`
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "no changes needed";
}
