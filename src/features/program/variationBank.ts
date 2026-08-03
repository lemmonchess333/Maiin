import { getExerciseById } from "@/lib/exercises";

import type { MovementCategory } from "./programTypes";
import {
  allowsComplexity,
  type Experience,
  type MovementComplexity,
} from "./experienceModel";

/* ================================
   EXERCISE BANK BY MOVEMENT CATEGORY
   Maps movement categories to exercise IDs from src/lib/exercises.ts
================================ */

/**
 * What the GENERATOR knows about an exercise, on top of what the exercise
 * catalogue already says about it.
 *
 * ── One exercise record (11b) ────────────────────────────────────────────
 *
 * This used to duplicate `name` and the lengthened-position flag from
 * `src/lib/exercises.ts`, and the duplication had drifted in every way it
 * could:
 *
 *   - **`name` disagreed on one row.** The bank said "Chest-Supported DB Row",
 *     the catalogue said "Chest-Supported Dumbbell Row" — and the bank's copy
 *     is the one written into the user's programme, so the exercise guide and
 *     the programme card named the same lift differently.
 *   - **`lengthened` and `Exercise.lengthenedBias` are the same fact under two
 *     names, and all the data was on one side.** Fifteen bank entries carried
 *     it; ZERO catalogue rows did. `lengthenedBias` was a documented field with
 *     no data and no reader, so anything consulting the catalogue for it got
 *     `false` for every exercise in the app.
 *   - **The bank's category grouping disagreed with `STORED_CATEGORY`** on
 *     `tricep-dips` (`arms_triceps` here, `horizontal_push` there). The bank
 *     seeds loads and the stored table stamps `movementCategory` onto the
 *     programme, so one exercise was two different movements depending on which
 *     module asked.
 *
 * So: the fields that describe the EXERCISE live in the catalogue and are read
 * from there. The fields below are the ones that describe how this GENERATOR
 * uses it — its category grouping and order, which entry is the category's
 * anchor lift, what job a variation does, how heavy it loads relative to the
 * anchor, and how much technique it demands. Those are properties of the
 * programme, not of the movement, and they stay here.
 *
 * `variationBank.test.ts` pins every bank id present in the catalogue and every
 * bank grouping equal to `STORED_CATEGORY`, so neither can drift back.
 */
interface ExerciseOption {
  id: string;
  primary: boolean;
  /**
   * What job this variation does when it replaces the category's main
   * (training-book backlog #11 — B6). Three sources categorise by ROLE
   * rather than by muscle: Hayes splits "exercises that teach me how to
   * lift" from brute-strength ones, Jenkins frames non-competition lifts as
   * "tools in the arsenal", and Green assigns each bench variant an explicit
   * job (paused = technique, wide-grip paused = bottom range, slingshot =
   * lockout, incline/OHP = size and base).
   *
   *   technique  — reinforces position and control; improves the parent lift
   *   weak_point — targets a sticking point (bottom range or lockout)
   *   size       — hypertrophy and base building
   *
   * Absent on the category primary, which is the lift being substituted FOR.
   */
  role?: "technique" | "weak_point" | "size";
  /**
   * Working weight relative to the category's PRIMARY lift, used to seed a
   * cold-start load (`startingWeightForExercise`). Absent = 1 (loads like the
   * primary).
   *
   * Added 2026-07-28 after an audit measured the cost of not having it: the
   * seed table is per-CATEGORY, so every variation inherited the compound's
   * number. A Romanian deadlift, a hip thrust and a leg curl are all
   * `hip_dominant`, and a beginner was handed the deadlift's 68 kg on all
   * three. That was tolerable while the builders only ever emitted the
   * primary; it stopped being tolerable once #10's overlap caps started
   * re-pointing slots to variations.
   *
   * These are conservative working-weight ratios, deliberately erring light —
   * the module's existing stance is that a light start self-corrects in a
   * session or two whereas a heavy one costs a failed first workout.
   */
  loadFactor?: number;
  /**
   * How much technique the movement demands (`experienceModel.ts`). Absent =
   * `simple`. Gates which VARIATIONS a lifter is offered — a category primary
   * is always allowed regardless, because it is the lift the programme is
   * built around and the one the form content covers most thoroughly.
   */
  complexity?: MovementComplexity;
}

export const exerciseBank: Record<MovementCategory, ExerciseOption[]> = {
  horizontal_push: [
    { id: "bench-press", primary: true },
    {
      id: "incline-bench",
      loadFactor: 0.8,
      primary: false,
      role: "size",
    },
    {
      id: "db-bench",
      loadFactor: 0.35,
      primary: false,
      role: "size",
    },
    {
      id: "incline-db-press",
      loadFactor: 0.3,
      primary: false,
      role: "size",
    },
    {
      id: "close-grip-bench",
      complexity: "technical",
      loadFactor: 0.8,
      primary: false,
      role: "weak_point",
    },
    {
      id: "barbell-floor-press",
      loadFactor: 0.85,
      primary: false,
      complexity: "advanced",
      role: "weak_point",
    },
    // HOME / MINIMAL COVERAGE (2026-07-28). Appended, deliberately, at the END
    // of the category: `pickAccessory` takes pool[0] of the LENGTHENED options
    // and the complexity gate takes the first allowed non-primary, so adding
    // here cannot change what a full-gym user receives — measured before and
    // after to confirm.
    //
    // A 216-config audit found 462 slots prescribing equipment the user does
    // not own. The cause was not the equipment FILTER (gating that was tried
    // twice and made things worse or nothing); it was that the bank had
    // nothing to swap TO. `hip_dominant` had ZERO home-gym-available options
    // and `knee_dominant` had exactly one, and it was technical — so a
    // home-gym beginner kept a barbell deadlift and a machine hack squat.
    // Every id here was already in the catalog and already used by the
    // TEMPLATES; only the generator's bank lacked them.
    {
      id: "push-ups",
      loadFactor: 0,
      primary: false,
      role: "size",
    },
  ],
  vertical_push: [
    { id: "overhead-press", primary: true },
    {
      id: "db-shoulder-press",
      loadFactor: 0.35,
      primary: false,
      role: "size",
    },
    {
      id: "arnold-press",
      complexity: "technical",
      loadFactor: 0.3,
      primary: false,
      role: "size",
    },
    {
      id: "landmine-press",
      complexity: "technical",
      loadFactor: 0.5,
      primary: false,
      role: "technique",
    },
  ],
  horizontal_pull: [
    { id: "barbell-row", primary: true },
    {
      id: "db-row",
      loadFactor: 0.4,
      primary: false,
      role: "size",
    },
    {
      id: "t-bar-row",
      loadFactor: 0.8,
      primary: false,
      role: "size",
    },
    {
      id: "seated-row",
      loadFactor: 0.9,
      primary: false,
      role: "size",
    },
    {
      id: "chest-supported-db-row",
      complexity: "technical",
      loadFactor: 0.35,
      primary: false,
      role: "technique",
    },
    // ADVANCED (2026-07-28). Already in the catalog, never reachable from the
    // bank — the PR that added exercise ROLES noted these were "the natural
    // weak_point entries later". Later is now: they are what "experienced
    // lifters get access to all this other stuff" means concretely, and they
    // are gated so a novice never meets them.
    {
      id: "pendlay-row",
      loadFactor: 0.85,
      primary: false,
      complexity: "advanced",
      role: "technique",
    },
    // HOME / MINIMAL COVERAGE (2026-07-28). Appended, deliberately, at the END
    // of the category: `pickAccessory` takes pool[0] of the LENGTHENED options
    // and the complexity gate takes the first allowed non-primary, so adding
    // here cannot change what a full-gym user receives — measured before and
    // after to confirm.
    //
    // A 216-config audit found 462 slots prescribing equipment the user does
    // not own. The cause was not the equipment FILTER (gating that was tried
    // twice and made things worse or nothing); it was that the bank had
    // nothing to swap TO. `hip_dominant` had ZERO home-gym-available options
    // and `knee_dominant` had exactly one, and it was technical — so a
    // home-gym beginner kept a barbell deadlift and a machine hack squat.
    // Every id here was already in the catalog and already used by the
    // TEMPLATES; only the generator's bank lacked them.
    {
      id: "inverted-row",
      loadFactor: 0,
      primary: false,
      role: "technique",
    },
  ],
  vertical_pull: [
    { id: "pull-ups", primary: true },
    {
      id: "lat-pulldown",
      loadFactor: 0.6,
      primary: false,
      role: "size",
    },
    {
      id: "chin-ups",
      loadFactor: 0,
      primary: false,
      role: "size",
    },
    {
      id: "single-arm-lat-pulldown",
      complexity: "technical",
      loadFactor: 0.25,
      primary: false,
      role: "technique",
    },
  ],
  knee_dominant: [
    { id: "squat", primary: true },
    {
      id: "front-squat",
      complexity: "technical",
      loadFactor: 0.75,
      primary: false,
      role: "technique",
    },
    {
      id: "leg-press",
      loadFactor: 1.6,
      primary: false,
      role: "size",
    },
    {
      id: "hack-squat",
      loadFactor: 0.9,
      primary: false,
      role: "size",
    },
    {
      id: "bulgarian-split",
      complexity: "technical",
      loadFactor: 0.25,
      primary: false,
      role: "technique",
    },
    // HOME / MINIMAL COVERAGE (2026-07-28). Appended, deliberately, at the END
    // of the category: `pickAccessory` takes pool[0] of the LENGTHENED options
    // and the complexity gate takes the first allowed non-primary, so adding
    // here cannot change what a full-gym user receives — measured before and
    // after to confirm.
    //
    // A 216-config audit found 462 slots prescribing equipment the user does
    // not own. The cause was not the equipment FILTER (gating that was tried
    // twice and made things worse or nothing); it was that the bank had
    // nothing to swap TO. `hip_dominant` had ZERO home-gym-available options
    // and `knee_dominant` had exactly one, and it was technical — so a
    // home-gym beginner kept a barbell deadlift and a machine hack squat.
    // Every id here was already in the catalog and already used by the
    // TEMPLATES; only the generator's bank lacked them.
    {
      id: "goblet-squat",
      loadFactor: 0.3,
      primary: false,
      role: "technique",
    },
    {
      id: "bodyweight-squat",
      loadFactor: 0,
      primary: false,
      role: "technique",
    },
  ],
  hip_dominant: [
    { id: "deadlift", primary: true },
    {
      id: "romanian-deadlift",
      complexity: "technical",
      loadFactor: 0.65,
      primary: false,
      role: "size",
    },
    {
      id: "hip-thrust",
      loadFactor: 0.9,
      primary: false,
      role: "size",
    },
    {
      id: "sumo-deadlift",
      complexity: "technical",
      loadFactor: 0.95,
      primary: false,
      role: "technique",
    },
    {
      id: "trap-bar-deadlift",
      complexity: "technical",
      loadFactor: 1.0,
      primary: false,
      role: "technique",
    },
    // The only HAMSTRING-primary option in the whole bank, and the only hinge
    // with no spinal load at all. Added 2026-07-28: an audit measured the
    // 4-day and 6-day builds losing HALF their hamstring volume once #10's
    // per-session hinge cap demoted the Romanian deadlift, because there was
    // nothing back-sparing in the category to demote it TO — the cap had to
    // leave the category entirely. It also gives `balanceWeeklyVolume` an
    // accessory it can grow for hamstrings, which it previously never had.
    {
      id: "seated-leg-curl",
      loadFactor: 0.25,
      primary: false,
      role: "size",
    },
    {
      id: "rack-pull",
      loadFactor: 1.15,
      primary: false,
      complexity: "advanced",
      role: "weak_point",
    },
    // HOME / MINIMAL COVERAGE (2026-07-28). Appended, deliberately, at the END
    // of the category: `pickAccessory` takes pool[0] of the LENGTHENED options
    // and the complexity gate takes the first allowed non-primary, so adding
    // here cannot change what a full-gym user receives — measured before and
    // after to confirm.
    //
    // A 216-config audit found 462 slots prescribing equipment the user does
    // not own. The cause was not the equipment FILTER (gating that was tried
    // twice and made things worse or nothing); it was that the bank had
    // nothing to swap TO. `hip_dominant` had ZERO home-gym-available options
    // and `knee_dominant` had exactly one, and it was technical — so a
    // home-gym beginner kept a barbell deadlift and a machine hack squat.
    // Every id here was already in the catalog and already used by the
    // TEMPLATES; only the generator's bank lacked them.
    {
      id: "db-rdl",
      loadFactor: 0.25,
      primary: false,
      role: "size",
    },
    {
      id: "glute-bridge",
      loadFactor: 0,
      primary: false,
      role: "size",
    },
    // The last of the 12 residual equipment violations, and a precise one: a
    // lower-back-injured HOME-GYM user needs two hinge slots, and had exactly
    // one option that was both available and safe (the glute bridge) — the
    // dumbbell RDL is contraindicated for that injury and everything else in
    // the category is a barbell or a machine. So a machine leg curl stayed in
    // a plan for someone with no machine. Nordic curls are bodyweight,
    // hamstring-primary and load no spine, which is exactly the gap.
    // `technical` because most beginners cannot do one unassisted — the
    // equipment filter still falls back to it over prescribing a machine
    // they do not own.
    {
      id: "nordic-hamstring-curl",
      loadFactor: 0,
      primary: false,
      complexity: "technical",
      role: "technique",
    },
  ],
  arms_biceps: [
    { id: "barbell-curl", primary: true },
    {
      id: "db-curl",
      loadFactor: 0.4,
      primary: false,
      role: "size",
    },
    {
      id: "hammer-curl",
      loadFactor: 0.4,
      primary: false,
      role: "size",
    },
    {
      id: "preacher-curl",
      loadFactor: 0.7,
      primary: false,
      role: "size",
    },
    {
      id: "cable-curl",
      loadFactor: 0.8,
      primary: false,
      role: "size",
    },
  ],
  arms_triceps: [
    { id: "rope-tricep-pushdown", primary: true },
    {
      id: "skull-crushers",
      complexity: "technical",
      loadFactor: 0.6,
      primary: false,
      role: "size",
    },
    {
      id: "overhead-extension",
      loadFactor: 0.6,
      primary: false,
      role: "size",
    },
    {
      id: "tricep-dips",
      complexity: "technical",
      loadFactor: 0,
      primary: false,
      role: "size",
    },
  ],
  core: [
    { id: "cable-crunch", primary: true },
    {
      id: "leg-raise",
      loadFactor: 0,
      primary: false,
      role: "size",
    },
    {
      id: "ab-wheel",
      complexity: "technical",
      loadFactor: 0,
      primary: false,
      role: "size",
    },
    {
      id: "pallof-press",
      complexity: "technical",
      loadFactor: 0.5,
      primary: false,
      role: "technique",
    },
    {
      id: "russian-twist",
      complexity: "technical",
      loadFactor: 0.3,
      primary: false,
      role: "size",
    },
  ],
};

/**
 * Working weight of a variation relative to its category's primary lift.
 *
 * Unknown ids return 1 — that is exactly today's behaviour (the seed table is
 * per-category), so an exercise arriving from outside the bank (an injury or
 * equipment substitution) is no worse off than before.
 */
/**
 * Rescale a carried working weight when a slot's EXERCISE changes but its
 * movement category does not.
 *
 * Every in-place swap in the codebase is `{...ex, exerciseId, name}` — it
 * carries the previous movement's load onto a different one. Measured on an
 * 80 kg beginner, that produced loads wrong in both directions:
 *
 *   Bench Press 35 kg  -> Dumbbell Bench Press @35 kg   (per hand; want 12.5)
 *   Barbell Squat      -> Bulgarian Split Squat @55 kg  (want 15)
 *   Hack Squat 50 kg   -> Leg Press @50 kg              (want 87.5)
 *   Seated Leg Curl 17.5 -> Hip Thrust @17.5            (want 60)
 *
 * Too heavy is a failed set or an injury; too light is a wasted session.
 *
 * The ratio of the two variations' `loadFactor` is the whole answer, and it
 * needs no bodyweight, no profile and no context — which matters, because the
 * swap sites include `advanceWeek`, which has none of those. It also beats
 * re-seeding from scratch: a lifter who has already worked a lift up keeps
 * that earned level, scaled to the new movement, instead of being reset to a
 * novice's starting number.
 *
 * Returns 0 for a bodyweight boundary, an unknown/cross-category id, or a
 * factor of 0. In each case there is no safe ratio; callers with profile
 * context may replace that uncalibrated 0 with a target-specific seed.
 */
export function rescaleForSwap(
  weight: number,
  fromExerciseId: string | undefined,
  toExerciseId: string | undefined,
  category: MovementCategory
): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (fromExerciseId === toExerciseId) return weight;

  const options = exerciseBank[category] ?? [];
  const fromOption = options.find((option) => option.id === fromExerciseId);
  const toOption = options.find((option) => option.id === toExerciseId);
  // An unknown/cross-category id has no meaningful ratio. Returning the old
  // load here is dangerous (for example deadlift kilograms on a glute bridge);
  // callers with profile context can seed the target, otherwise 0 is the only
  // honest uncalibrated value.
  if (!fromOption || !toOption) return 0;

  const from = fromOption.loadFactor ?? 1;
  const to = toOption.loadFactor ?? 1;
  // A zero target factor is bodyweight. A zero source factor cannot calibrate
  // a newly loaded movement without bodyweight/profile context.
  if (from <= 0 || to <= 0) return 0;
  if (from === to) return weight;
  return Math.max(2.5, Math.round((weight * (to / from)) / 2.5) * 2.5);
}

/**
 * Generator slots pinned to a CATALOGUE exercise the bank's category pools
 * do not contain — currently the two calf raises the leg-day builders author
 * directly (`makeNamedAccessory`), because calves have no movement category
 * of their own and putting them in the `knee_dominant` pool would offer a
 * calf raise as a squat swap.
 *
 * Every pass that reasons "re-point this slot within its bank category" must
 * skip these ids: the category pool is squat-pattern lifts, so any re-point
 * silently converts the programme's only direct calf work into a fourth quad
 * slot. Measured before the guard existed: `rotateUntrainedAccessories`
 * rotated the calf slot into `squat` at the first mesocycle restart, and the
 * equipment filter's swap did the same for home-gym users (cascading a
 * complexity violation as it drained the category pool).
 *
 * Deliberately NOT a general "skip anything outside the bank" rule: template
 * imports carry many non-bank ids whose equipment swaps are load-bearing
 * (the 2026-07-28 462-slot audit), and their meso rotation is long-standing
 * behaviour. Only ids listed here opt out.
 */
export const CATALOGUE_PINNED_ACCESSORY_IDS: ReadonlySet<string> = new Set([
  "standing-calf-raise",
  "seated-calf-raise",
  "single-leg-calf-raise",
]);

/**
 * Equipment fallback for pinned slots: when the user's equipment tier can't
 * provide the machine, the slot re-points HERE — a calf raise stays a calf
 * raise — instead of taking the generic within-category swap (which would
 * hand the slot to a squat variation). Bodyweight, so it is available at
 * every tier; `rescaleForSwap` correctly returns 0 (uncalibrated) for it.
 */
export const PINNED_EQUIPMENT_FALLBACK: Readonly<Record<string, string>> = {
  "standing-calf-raise": "single-leg-calf-raise",
  "seated-calf-raise": "single-leg-calf-raise",
};

/** The bank category that owns an exercise id, if it is a bank movement. */
export function movementCategoryForExerciseId(
  exerciseId: string | undefined
): MovementCategory | undefined {
  if (!exerciseId) return undefined;
  for (const category of Object.keys(exerciseBank) as MovementCategory[]) {
    if (exerciseBank[category].some((option) => option.id === exerciseId)) {
      return category;
    }
  }
  return undefined;
}

export function loadFactorFor(
  exerciseId: string | undefined,
  category: MovementCategory
): number {
  if (!exerciseId) return 1;
  const opt = (exerciseBank[category] ?? []).find((o) => o.id === exerciseId);
  return opt?.loadFactor ?? 1;
}

/**
 * The exercise's display NAME, from the catalogue — the one place it is
 * written down. A bank id with no catalogue row would be a broken reference
 * rather than a naming question, so it falls back to the id: visibly wrong in
 * the UI, rather than an empty string that reads as a rendering bug.
 * `variationBank.test.ts` pins that no such id exists.
 */
export function exerciseDisplayName(id: string): string {
  return getExerciseById(id)?.name ?? id;
}

/** `{id, name}` as the callers want it, with the name resolved once. */
function picked(option: ExerciseOption): { id: string; name: string } {
  return { id: option.id, name: exerciseDisplayName(option.id) };
}

/**
 * Trains the target muscle at a LONG muscle length (deep stretch under load) —
 * more hypertrophy per set (Maeo 2021/2023; Pedrosa 2022). Accessory selection
 * biases toward these (D-LIFT-2); mains stay the canonical compound (the
 * progression anchor) regardless.
 *
 * A property of the movement, so it reads from the catalogue rather than being
 * restated here. It carried fifteen entries in the bank and none in the
 * catalogue until 11b moved the data across.
 */
function isLengthened(option: ExerciseOption): boolean {
  return getExerciseById(option.id)?.lengthenedBias === true;
}

/**
 * Pick the primary exercise for a movement category,
 * or rotate to a different variation if plateaued.
 */
export function pickExercise(
  category: MovementCategory,
  plateauCount: number,
  currentExerciseId?: string,
  experience?: Experience
): { id: string; name: string } {
  // The category PRIMARY is always allowed — it is the lift the programme is
  // built around and the one the form content covers most thoroughly. What
  // experience gates is which VARIATIONS a lifter is offered instead of it.
  const options = exerciseBank[category].filter(
    (e) => e.primary || allowsComplexity(experience, e.complexity)
  );

  // No plateau — return primary or current
  if (plateauCount < 3) {
    if (currentExerciseId) {
      const current = options.find((e) => e.id === currentExerciseId);
      if (current) return picked(current);
    }
    const primary = options.find((e) => e.primary) ?? options[0];
    return picked(primary);
  }

  // Plateau >= 3 — rotate to a PURPOSEFUL variation (backlog #11 — P4/B6/N5).
  //
  // This was `others[Math.floor(Math.random() * others.length)]`, which had
  // two problems. It picked an arbitrary sibling, when three sources say the
  // substitute should have a job (B6); and being random, it re-rolled on
  // every regenerate, so a plateaued main churned to a different exercise
  // each time the user changed a setting. Nippard (N5) is the third argument:
  // changing exercises flattens the progression curve, so when you DO change,
  // change to something that improves the parent lift.
  //
  // Ranked, deterministic, tie-broken by bank order. Technique first —
  // Hayes's "exercises that teach me how to lift", and a stall is more often
  // a position problem than a missing sticking-point. `weak_point` moves
  // ahead of it once the user can say WHERE the lift fails, which is the
  // other half of P4 and needs a UI question this doesn't have yet.
  //
  // Within a role, the MORE SPECIALISED tool wins for a lifter who can use it
  // (added 2026-07-28). Ties previously broke on bank order, which is
  // arbitrary — whichever entry happened to be appended last always lost — and
  // that is why the `advanced` variations were unreachable in practice: a
  // stalled advanced lifter got the same substitute as an intermediate.
  //
  // The tie has to break somewhere, and this is the direction the sources
  // point. Green assigns each variant an explicit job and Jenkins frames the
  // non-competition lifts as "tools in the arsenal"; the advanced tier IS the
  // specialised-tool tier. The moment a specialised tool is warranted is
  // exactly this one — the standard variation has not resolved the stall, and
  // the lifter has the base to use something sharper. `allowsComplexity`
  // already filtered the pool, so a novice can never reach this branch.
  const others = options.filter((e) => e.id !== currentExerciseId);
  if (others.length === 0) return picked(options[0]);
  const rank = (o: ExerciseOption) =>
    o.role === "technique" ? 0 : o.role === "weak_point" ? 1 : 2;
  const specialisation = (o: ExerciseOption) =>
    o.complexity === "advanced" ? 2 : o.complexity === "technical" ? 1 : 0;
  let pick = others[0];
  for (const o of others.slice(1)) {
    if (rank(o) < rank(pick)) pick = o;
    else if (rank(o) === rank(pick) && specialisation(o) > specialisation(pick))
      pick = o;
  }
  return picked(pick);
}

/**
 * Pick an accessory (non-primary) exercise. Biases toward LENGTHENED-position
 * options when the category has any (D-LIFT-2) — accessories are
 * isolation/hypertrophy work, where training at long muscle length yields more
 * growth per set. Falls back to the full non-primary pool when none are tagged.
 *
 * DETERMINISTIC as of 2026-07-28. This was
 * `pool[Math.floor(Math.random() * pool.length)]`, and it made the whole
 * generator nondeterministic: twelve `generateProgram` calls with byte-identical
 * inputs produced EIGHT different programmes. That is the same defect backlog
 * #11 already fixed one function up in this file (`pickExercise`'s plateau
 * rotation), for the same reasons, and it was left here:
 *
 *   - Nippard (N5): changing exercises flattens the progression curve.
 *     Novelty belongs at block boundaries, which is what
 *     `rotateUntrainedAccessories` is for — not at every build.
 *   - A regenerate is what a settings change triggers. Before any history
 *     exists to carry, changing days-per-week re-rolled the user's accessories
 *     into different exercises for no reason they could see.
 *   - Every claim in this arc about the pipeline being deterministic (#10,
 *     #11, #17) was false while this stood, and every measurement taken
 *     against generated output was a sample rather than a fact.
 *
 * Variety across the week is not lost: `dedupeDayExercises` removes in-day
 * duplicates, `capRepeatedLifts` re-points anything appearing more than twice,
 * and `excludeId` keeps an accessory off its own category primary.
 *
 * `experience` gates the pool by movement COMPLEXITY (`experienceModel.ts`) —
 * a novice is not handed a Bulgarian split squat as their leg accessory.
 */
export function pickAccessory(
  category: MovementCategory,
  excludeId?: string,
  experience?: Experience
): { id: string; name: string } {
  const eligible = exerciseBank[category].filter(
    (e) => !e.primary && e.id !== excludeId
  );
  // Experience gates the pool, but never empties it: a level with nothing
  // left falls back to the full non-primary list rather than returning the
  // category primary, which would duplicate the day's main lift.
  const allowed = eligible.filter((e) =>
    allowsComplexity(experience, e.complexity)
  );
  const options = allowed.length > 0 ? allowed : eligible;
  const lengthened = options.filter(isLengthened);
  const pool = lengthened.length > 0 ? lengthened : options;
  const pick = pool[0] ?? exerciseBank[category][0];
  return picked(pick);
}
