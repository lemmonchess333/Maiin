/**
 * Cold-start starting loads (D-LIFT-5).
 *
 * The procedural builders hardcode absolute starting weights (bench 60kg, squat
 * 80kg, …) for EVERY user, so a 55kg beginner and a 95kg advanced lifter both
 * start identically — unrealistic for the most-seen state (every new user).
 * This derives a bodyweight-relative starting WORKING weight per movement
 * pattern from data onboarding already captures: bodyweight, experience, sex.
 * No new persisted field — the bodyweight-relative option from the audit.
 *
 * The multiples are deliberately CONSERVATIVE working weights for the goal rep
 * range (~8 reps), not 1RMs — a slightly-light start is self-correcting (the
 * progression engine ramps load fast), whereas too-heavy risks failed first
 * sessions. Pure + mirror-ready.
 */
import { EXERCISES, getExerciseById } from "@/lib/exercises";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";

import type {
  Experience,
  MovementCategory,
  ProgramExercise,
  WorkoutDay,
} from "./programTypes";
import {
  loadFactorFor,
  movementCategoryForExerciseId,
  rescaleForSwap,
} from "./variationBank";

// Re-exported, not redeclared. This was a hand-written duplicate of the union
// `programTypes.VALID_EXPERIENCE` already derives — a second copy of one
// vocabulary, which is the drift hazard the repo's own rules call out, and it
// is what made the import cycle look reasonable in the first place.
export type { Experience };

export interface StartingLoadContext {
  bodyweightKg: number;
  experience: Experience;
  /** Lowers the estimate for female lifters (relative strength differs most on
   *  upper-body pressing); anything non-female is treated as the male/default. */
  sex?: string;
}

// Working-weight as a fraction of bodyweight, by movement pattern × experience.
// Every pattern seeds a LOADED figure; whether a given lift is bodyweight is
// decided per exercise in `startingWeightForExercise`, never per category.
const BW_MULTIPLE: Record<MovementCategory, Record<Experience, number>> = {
  horizontal_push: { beginner: 0.45, intermediate: 0.7, advanced: 0.95 },
  vertical_push: { beginner: 0.3, intermediate: 0.45, advanced: 0.6 },
  horizontal_pull: { beginner: 0.45, intermediate: 0.65, advanced: 0.85 },
  // Both of these read 0 until 2026-08-01, on the reasoning that the category
  // PRIMARY is bodyweight (pull-ups) or near enough (core). That confused the
  // primary with the category: `startingWeightForExercise` short-circuits on
  // `base <= 0`, so a zero here made EVERY member unseedable — including the
  // loaded ones, whose `loadFactor` in the bank (lat-pulldown 0.6,
  // single-arm 0.25, pallof-press 0.5) was dead code it could never reach.
  // A beginner with a shoulder injury was substituted off pull-ups onto
  // "Lat Pulldown 4×8 @ 0 kg" in 12 of the 216 audited configs.
  // The per-EXERCISE guards already zero what should be zero — `BODYWEIGHT_IDS`
  // catches pull-ups / chin-ups / leg-raise / russian-twist by catalog
  // equipment, and `loadFactor: 0` catches ab-wheel — so the category seed is
  // free to describe the loaded members. It is the notional full-range pull
  // (lat-pulldown lands at 0.6× of it), not a pull-up's load.
  vertical_pull: { beginner: 0.75, intermediate: 0.95, advanced: 1.15 },
  knee_dominant: { beginner: 0.7, intermediate: 1.05, advanced: 1.4 },
  hip_dominant: { beginner: 0.85, intermediate: 1.25, advanced: 1.65 },
  arms_biceps: { beginner: 0.12, intermediate: 0.18, advanced: 0.24 },
  arms_triceps: { beginner: 0.12, intermediate: 0.18, advanced: 0.24 },
  // Anchored on the category primary, cable crunch, which IS loaded.
  core: { beginner: 0.35, intermediate: 0.45, advanced: 0.55 },
};

function sexFactor(sex: string | undefined): number {
  return sex === "female" ? 0.75 : 1;
}

/**
 * Build a StartingLoadContext from a profile-like object, or `undefined` when
 * there's no usable bodyweight (→ generateProgram skips seeding and keeps the
 * hardcoded fallbacks). Centralises the experience coercion + the bodyweight
 * guard for every call site.
 */
export function loadContextFrom(
  p: { weightKg?: number; experience?: string; sex?: string } | null | undefined
): StartingLoadContext | undefined {
  if (!p || !p.weightKg || p.weightKg <= 0) return undefined;
  const experience: Experience =
    p.experience === "intermediate" || p.experience === "advanced"
      ? p.experience
      : "beginner";
  return { bodyweightKg: p.weightKg, experience, sex: p.sex };
}

/**
 * Conservative starting WORKING weight (kg, rounded to 2.5) for a movement
 * pattern given the user's bodyweight / experience / sex. This is the
 * category's notional LOADED figure — bodyweight lifts are excluded by
 * identity in `startingWeightForExercise`, not by zeroing a whole pattern.
 */
export function startingWeightForCategory(
  category: MovementCategory,
  ctx: StartingLoadContext
): number {
  const bw = ctx.bodyweightKg;
  if (!Number.isFinite(bw) || bw <= 0) return 0;
  const mult = BW_MULTIPLE[category]?.[ctx.experience] ?? 0;
  if (mult <= 0) return 0;
  const raw = bw * mult * sexFactor(ctx.sex);
  return Math.max(0, Math.round(raw / 2.5) * 2.5);
}

const BODYWEIGHT_IDS: ReadonlySet<string> = new Set(
  EXERCISES.filter((e) => e.equipment === "Bodyweight").map((e) => e.id)
);

/**
 * Starting working weight for a SPECIFIC lift — the category seed scaled by
 * the variation's `loadFactor`, and 0 for anything the catalog calls
 * bodyweight.
 *
 * The category seed alone was only ever right for the category's primary
 * compound. Everything else in the bank inherited it: a beginner's Romanian
 * deadlift, hip thrust and leg curl were all handed the deadlift's 68 kg.
 */
/**
 * Fallback scale for an ACCESSORY the variation bank has never heard of.
 *
 * `BW_MULTIPLE` is calibrated on the category's compound — a squat, a bench, a
 * row — and `loadFactorFor` is what scales an isolation down from it. An
 * exercise absent from the bank has no factor, so it used to take the
 * compound's multiple at full strength. That is where the template path's
 * infamous seeds came from: an 80 kg intermediate was handed a **35 kg
 * dumbbell lateral raise**, a **52.5 kg face pull**, and an **85 kg leg
 * extension** and **85 kg seated calf raise** (the knee-dominant compound's
 * own seed, unscaled).
 *
 * 0.3 sits at the conservative end of the real factors in the bank (which run
 * 0.25–1.6) and matches this module's stated principle: a light start
 * self-corrects on the first session, a heavy one costs a failed one.
 *
 * The gate is **absence from the bank**, not the `isAccessory` flag alone.
 * That flag is a VOLUME role, not a load claim — `buildFullBody` legitimately
 * uses the deadlift in an accessory slot, and a deadlift is a deadlift
 * whatever role it plays that day. Keying on the flag alone dropped it from
 * 100 kg to 30 kg, which the existing "the flag is a volume role, not a load
 * claim" test caught. So both conditions must hold: the slot is assistance
 * work AND the bank has no load metadata for it at all.
 */
const UNKNOWN_ACCESSORY_FACTOR = 0.3;

/**
 * The rep target `BW_MULTIPLE` is calibrated against — see the module header,
 * "conservative working weights for the goal rep range (~8 reps)".
 */
const SEED_REP_ANCHOR = 8;

/**
 * How far the rep-aware seed is allowed to move the table's figure.
 *
 * The anchor assumption is approximate, so compounding it with an unbounded
 * Epley term would let an odd rep value produce a seed the table never
 * intended. ±25% covers the whole prescribed range in practice (4 reps is
 * +11.8%, 15 reps is −15.6%) and makes a garbage input harmless.
 */
const SEED_REP_SCALE_MIN = 0.75;
const SEED_REP_SCALE_MAX = 1.25;

/**
 * Scale a seeded working weight from the ~8-rep anchor to the rep target the
 * slot is actually prescribed at.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * The seed was entirely rep-blind: `startingWeightForExercise` took no rep
 * argument, so a 5-rep `strength` main, an 8-rep `hypertrophy` main and a
 * 12-rep `fat_loss` main were all seeded at the same weight. The rep number
 * was a label with no effect on the load, which meant a goal's prescribed
 * INTENSITY was not delivered by anything.
 *
 * That is not a cosmetic gap. It is the reason a rep-range change cannot, on
 * its own, make training heavier: `represcribe.scaleLoadForReps` deliberately
 * refuses to raise load when reps fall (`toReps <= fromReps` returns the
 * weight unchanged — the right call there, because silently adding weight to
 * an existing prescription is unsafe), and the generator carries an existing
 * weight verbatim on regenerate. So without this, prescribing fewer reps
 * hands the user a strictly EASIER session.
 *
 * Uses the same Epley form as `scaleLoadForReps`, so the two agree about what
 * a rep change is worth. This is a COLD-START seed, not a rescale of earned
 * load, which is why raising is legitimate here and not there: there is no
 * prior performance to preserve, and the table is explicitly conservative.
 *
 * Timed work is excluded outright — a 45-second plank is not 45 reps, and
 * running the ratio on it would read as a 5.6x rep target.
 */
export function repScaledSeed(
  weight: number,
  targetReps: number | undefined,
  repUnit?: string
): number {
  if (repUnit === "seconds") return weight;
  if (!Number.isFinite(targetReps) || (targetReps ?? 0) <= 0) return weight;
  const ratio = (1 + SEED_REP_ANCHOR / 30) / (1 + (targetReps as number) / 30);
  const clamped = Math.min(
    SEED_REP_SCALE_MAX,
    Math.max(SEED_REP_SCALE_MIN, ratio)
  );
  return weight * clamped;
}

export function startingWeightForExercise(
  exerciseId: string | undefined,
  category: MovementCategory,
  ctx: StartingLoadContext,
  /** Whether this slot is assistance work. Templates author it directly; the
   *  generator sets it from the builders. Absent = treat as a main. */
  isAccessory?: boolean,
  /** The rep target this slot is prescribed at. Omitted → the ~8-rep anchor,
   *  i.e. the historical rep-blind behaviour, so existing callers are
   *  byte-identical. */
  targetReps?: number,
  /** `"seconds"` for timed holds, which are excluded from rep scaling. */
  repUnit?: string
): number {
  if (exerciseId && BODYWEIGHT_IDS.has(exerciseId)) return 0;

  // Prefer the bank's own category over the caller's. The two disagree
  // whenever the caller's came from name inference — `Leg Curl` infers
  // `knee_dominant` while the bank files `seated-leg-curl` under
  // `hip_dominant` with `loadFactor: 0.25`. Looking up the factor under the
  // inferred category found nothing, returned the default 1, and seeded the
  // curl at the SQUAT's 85 kg instead of 25 kg. The bank is where the load
  // metadata lives, so it is the authority on which category to scale from.
  const bankCategory = movementCategoryForExerciseId(exerciseId);
  const seedCategory = bankCategory ?? category;
  const base = startingWeightForCategory(seedCategory, ctx);
  if (base <= 0) return 0;

  // Unknown to the bank AND flagged as assistance → no load metadata exists,
  // so scale down rather than hand it the compound's multiple.
  const factor =
    bankCategory === undefined && isAccessory === true
      ? UNKNOWN_ACCESSORY_FACTOR
      : loadFactorFor(exerciseId, seedCategory);

  const raw = repScaledSeed(base * factor, targetReps, repUnit);
  if (raw <= 0) return 0;
  return Math.max(2.5, Math.round(raw / 2.5) * 2.5);
}

/**
 * Safe working load when an exercise identity changes.
 *
 * Same-category loaded swaps preserve earned strength through the variation
 * ratio. Bodyweight boundaries and cross-category substitutions have no valid
 * ratio, so they are freshly seeded when profile context exists and otherwise
 * remain explicitly uncalibrated at 0 kg.
 */
export function weightAfterExerciseSwap(
  ex: Pick<
    ProgramExercise,
    "weight" | "exerciseId" | "movementCategory" | "reps" | "repUnit"
  >,
  toExerciseId: string,
  ctx?: StartingLoadContext
): { weight: number; movementCategory: MovementCategory } {
  const catalogTarget = getExerciseById(toExerciseId);
  const targetCategory =
    movementCategoryForExerciseId(toExerciseId) ??
    (catalogTarget
      ? inferMovementCategory(catalogTarget.name, catalogTarget.id)
      : ex.movementCategory);
  const sameCategory = targetCategory === ex.movementCategory;
  const scaled = sameCategory
    ? rescaleForSwap(
        ex.weight ?? 0,
        ex.exerciseId,
        toExerciseId,
        ex.movementCategory
      )
    : 0;
  const weight =
    scaled > 0 || !ctx
      ? scaled
      : startingWeightForExercise(
          toExerciseId,
          targetCategory,
          ctx,
          undefined,
          // A cross-category swap re-seeds from scratch, and the slot keeps
          // its rep target — so the fresh seed has to answer to it too.
          // Leaving this path rep-blind would put the same number on two
          // paths with different meanings, which is how they drift.
          ex.reps,
          ex.repUnit
        );
  return { weight, movementCategory: targetCategory };
}

/**
 * Seed cold-start starting weights on a generated week. Reweights every lift
 * that has NEVER been trained (`performanceHistory` empty) and resolves to a
 * loaded exercise — including template rows that arrive uncalibrated at 0 kg
 * — so a fresh program reflects the user's size/level,
 * while any lift with logged history keeps its progressed weight. Pure;
 * returns a new workouts array.
 *
 * CORRECTED 2026-07-28 — this used to skip `isAccessory` slots, which sounded
 * conservative and was not. The flag says what ROLE a slot plays in the
 * session, not whether its hardcoded weight is right for this user, and an
 * audit measured what that conflation cost:
 *
 *   - backlog #15 marked the full-body builder's slots 2-4 as accessories
 *     (correct metadata), and silently switched cold-start seeding OFF for
 *     the entire full-body segment as a side effect. A 80 kg beginner was
 *     then prescribed `Bench Press 35 kg` as the day-0 main and
 *     `Bench Press 60 kg` as a day-2 accessory — the same lift, twice, with
 *     the accessory copy heavier;
 *   - `Barbell Row` sat at its hardcoded 50 kg where the bodyweight-relative
 *     seed is 36 kg.
 *
 * Seeding accessories is only safe now that the weight is derived per
 * EXERCISE (`startingWeightForExercise`) rather than per category — that is
 * what stops a leg curl being seeded like a deadlift.
 *
 * Back-compat: callers without a context don't invoke this, so existing
 * behaviour (hardcoded weights) is unchanged where no profile data exists.
 */
export function seedStartingLoads(
  workouts: WorkoutDay[],
  ctx: StartingLoadContext,
  /** The goal profile's MAIN rep target, so the seed reflects the intensity
   *  the programme prescribes. Omitted → the historical ~8-rep anchor, i.e.
   *  byte-identical to the rep-blind behaviour. */
  repAnchor?: number
): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex: ProgramExercise) => {
      // "Has history" was the whole calibration test, and it let an
      // UNCALIBRATED lift become permanently uncalibrated: a slot that
      // reaches the user at 0 kg gets logged at 0 kg, history is now
      // non-empty, and this pass refuses to touch it ever again. The
      // operator's own plan showed the endgame — a Barbell Curl and an
      // Overhead Press prescribed at 0 kg, a session totalling "0kg VOLUME",
      // and a plateau modal reporting "you've been at 0kg for 3 sessions".
      //
      // History only proves calibration if some of it carried LOAD. Zeroes
      // are the sentinel repeated back, not evidence. Bodyweight movements
      // need no exception here: `startingWeightForExercise` returns 0 for
      // them and the `seed <= 0` guard below already leaves them alone.
      if ((ex.performanceHistory?.length ?? 0) > 0) {
        const carriedLoad =
          (ex.weight ?? 0) > 0 ||
          (ex.performanceHistory ?? []).some((r) => (r.weight ?? 0) > 0);
        if (carriedLoad) return ex; // genuinely calibrated — never touch it
      }
      const seed = startingWeightForExercise(
        ex.exerciseId,
        ex.movementCategory,
        ctx,
        ex.isAccessory === true,
        // One anchor for the whole PROGRAMME — not `ex.reps`, and not a
        // per-slot main/accessory split.
        //
        // Two things force this. Seeding runs after `applyDayRoles`, so
        // `ex.reps` is the undulated per-DAY target (heavy -2, pump +2) with
        // `baseReps` overwritten to match; and some builders prescribe
        // accessory reps on slots they do not flag `isAccessory`, so
        // `bench-press` is a main on one hypertrophy/3d day and an accessory
        // on another. Either input gives the same lift two different loads in
        // one week, which `generatorAudit`'s "prescribes ONE load per lift
        // across the week" catches — rightly, since a lifter has one working
        // weight per lift and the rep target is what makes a day hard or easy.
        //
        // The mains carry the goal's intensity claim (and are what the
        // running-economy evidence is about), so they set the anchor and
        // accessories inherit it. That over-loads a high-rep accessory
        // slightly on a low-rep goal — ~12% at a 4-rep anchor — which the
        // table's deliberate conservatism absorbs, and which the progression
        // engine corrects within a session or two either way.
        repAnchor,
        ex.repUnit
      );
      if (seed <= 0) return ex; // bodyweight pattern — leave as-is
      return {
        ...ex,
        weight: seed,
        lastSuccessfulWeight: seed,
        lastAttemptedWeight: seed,
        // The rotation anchor: meso rotation scales future variations of
        // this slot from THIS calibration, never from a prior rotation's
        // output — the fix for the documented compounding decay.
        rotationAnchor: { exerciseId: ex.exerciseId, weight: seed },
      };
    }),
  }));
}
