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

/** The time-budgeted express variants this module builds. */
export type ExpressVariant = "express45" | "express30";

/** Every way a programme day can be EXECUTED. "easier_today"
 *  (PROGRAM-ADAPT-01) is built by easierToday.ts — same
 *  execution-clone contract, different policy (one set less +
 *  deload-policy loads instead of a time budget). */
export type SessionVariant = "full" | ExpressVariant | "easier_today";

/**
 * Draft namespace for a session variant (PROGRAM-ADAPT-01 follow-up).
 * The workout-draft identity fingerprints the exercise layout
 * (ids × sets) but NOT loads — an easier clone whose set-floors all
 * bind shares a layout with the full session, so without a per-variant
 * scope a mid-session kill could restore one variant's logs into the
 * other and complete under the wrong sessionVariant label. Scoping the
 * namespace makes restore deterministic: a draft only ever resumes the
 * variant that created it.
 */
export function draftScopeForVariant(variant: SessionVariant): string {
  return variant === "full" ? "programme" : `programme:${variant}`;
}

/** Mirrors the `~min` estimate shown on the lift SessionCommandCard. */
export const MINUTES_PER_SET = 2.5;

export const EXPRESS_BUDGET_MINUTES: Record<ExpressVariant, number> = {
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

/**
 * Time a session will actually take, in minutes.
 *
 * The previous model was `totalWorkingSets × 2.5` and nothing else. It
 * omitted three real costs, which is why the operator reported sessions
 * estimated at ~20 minutes running an hour or more:
 *
 *   - WARM-UP SETS. `warmupRamp` generates 1-3 ramp sets for every loaded
 *     exercise and the logger shows them as "W" rows, so the user performs
 *     them — but the estimate counted none of them.
 *   - REST. 2.5 min/set is a blend that only holds at one rest length. A
 *     lift prescribing `restSeconds: 180` costs nearly twice a lift resting
 *     60s, and the model could not tell them apart.
 *   - SETUP. Walking to the rack, loading plates, adjusting a machine.
 *     Small per exercise, but it is per EXERCISE, so a 6-lift day pays it
 *     six times.
 *
 * Constants come from what the app itself prescribes, not from invented
 * numbers: the logger's own rest default and rest options, and the ramp
 * `warmupRamp` actually emits.
 */

/** Executing one working set — the reps themselves, plus racking. */
const WORK_SECONDS_PER_SET = 45;
/** Rest when the exercise prescribes none — the logger's own default. */
const DEFAULT_REST_SECONDS = 90;
/** A warm-up set is light and briefly rested; it is not free. */
const WARMUP_SECONDS_PER_SET = 60;
/** Getting to the equipment and setting it up, once per exercise. */
const SETUP_SECONDS_PER_EXERCISE = 90;

export function estimateSessionMinutes(
  exercises: ReadonlyArray<
    Pick<ProgramExercise, "sets"> &
      Partial<Pick<ProgramExercise, "restSeconds" | "weight" | "exerciseId">>
  >
): number {
  const seconds = exercises.reduce((total, ex) => {
    const rest = ex.restSeconds ?? DEFAULT_REST_SECONDS;
    const working = ex.sets * (WORK_SECONDS_PER_SET + rest);
    // Loaded lifts ramp; bodyweight and uncalibrated ones do not (the same
    // condition `warmupRamp` itself applies). Counted as a flat 2 rather
    // than by calling warmupRamp, so this stays a pure function of the
    // prescription and does not need the catalogue.
    const warmup = (ex.weight ?? 0) > 0 ? 2 * WARMUP_SECONDS_PER_SET : 0;
    return total + SETUP_SECONDS_PER_EXERCISE + warmup + working;
  }, 0);
  return Math.round(seconds / 60);
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
  variant: "full" | ExpressVariant
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
  // DELIBERATE SEAM, not drift: the trim loop measures the budget in WORKING
  // SETS at the historical 2.5 min/set blend, while `estimatedMinutes`
  // reports the rest-aware wall-clock. They are allowed to disagree because
  // they answer different questions — "how much should I cut?" versus "how
  // long will this take?" — and unifying them is a PRODUCT decision, not a
  // refactor: measured 2026-08-04, an express30 priced at true wall-clock
  // drops 3 of 5 exercises where it used to drop 2, because 30 real minutes
  // is only ~10 working sets once rest is counted. That may well be the right
  // answer (a 30-minute session genuinely is short) but it changes what the
  // feature does, so it needs deciding rather than falling out of an estimate
  // fix. Until then the budget stays on the set-count basis it was tuned for
  // and the label tells the truth.
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
 * Which variants are worth OFFERING for this day. Only budgets whose
 * TRIM actually changes the session are surfaced.
 *
 * The gate asks the builder, not the clock. It used to compare the
 * rest-aware wall-clock estimate against the budget, but the trim loop
 * measures in working sets at 2.5 min/set (the deliberate seam
 * documented in `buildExpressSession`) — so a 17-set day could read
 * 56 wall-clock minutes, clear the 45 gate, and then trim NOTHING,
 * producing a "45 min · no changes needed" row in the chooser. A row
 * that admits it does nothing is noise (operator screenshot,
 * 2026-08-05). Building the trim to decide the offer makes the gate
 * agree with the outcome by construction, whichever side of the seam
 * a future product decision lands on.
 *
 * Two identical trims collapse to the tighter budget: if the same cut
 * satisfies both 45 and 30, offering it twice under two labels is the
 * same choice dressed as two.
 */
export function expressChoices(
  day: WorkoutDay
): Array<"full" | ExpressVariant> {
  const changes = (t: ExpressTrim) =>
    t.droppedExercises.length > 0 || t.reducedSets.length > 0;
  const key = (t: ExpressTrim) => JSON.stringify(t);

  const t45 = buildExpressSession(day, "express45").trim;
  const t30 = buildExpressSession(day, "express30").trim;

  const choices: Array<"full" | ExpressVariant> = ["full"];
  if (changes(t45) && key(t45) !== key(t30)) choices.push("express45");
  if (changes(t30)) choices.push("express30");
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
