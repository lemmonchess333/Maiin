import type { WorkoutDay, ProgramExercise } from "./programTypes";
import { getExerciseById } from "@/lib/exercises";
import {
  CONTRAINDICATED,
  contraindicatedFor,
  findSafeSubstitute,
} from "./injurySubstitutions";
import { offerableTo, toExperience, type Experience } from "./experienceModel";
import {
  exerciseBank,
  exerciseDisplayName,
  CATALOGUE_PINNED_ACCESSORY_IDS,
  PINNED_EQUIPMENT_FALLBACK,
} from "./variationBank";
import {
  weightAfterExerciseSwap,
  type StartingLoadContext,
} from "./startingLoads";

function replaceExercise(
  ex: ProgramExercise,
  exerciseId: string,
  name: string,
  loadCtx: StartingLoadContext | undefined,
  notes: string
): ProgramExercise {
  if (exerciseId === ex.exerciseId) return { ...ex, notes };
  const calibrated = weightAfterExerciseSwap(ex, exerciseId, loadCtx);
  return {
    ...ex,
    exerciseId,
    name,
    movementCategory: calibrated.movementCategory,
    weight: calibrated.weight,
    lastSuccessfulWeight: calibrated.weight,
    lastAttemptedWeight: calibrated.weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    notes,
    // The way back (Lift4 (11)): the lift the plan had before any swap,
    // kept through a second one.
    swappedFrom: ex.swappedFrom ?? { exerciseId: ex.exerciseId },
  };
}

/**
 * Removing a limitation brings the original lifts back as part of saving
 * (Lift4 (11)). A lift a swap put in place of another (`swappedFrom`) goes
 * back to it once the person's injuries no longer name the original and
 * their equipment has it, unless the day holds it already. Its load is
 * recalibrated and its history starts again, as any swap's; the builder then
 * gives it its role's numbers. Runs before the filters, which swap anything
 * still ruled out.
 */
export function restoreSwappedLifts(
  workouts: readonly WorkoutDay[],
  injuries: readonly string[],
  equipment: string,
  loadCtx?: StartingLoadContext
): WorkoutDay[] {
  const allowed = EQUIPMENT_AVAILABILITY[equipment];
  const usable = (id: string) => {
    const eq = getExerciseById(id)?.equipment;
    return !allowed || eq === undefined || allowed.has(eq);
  };
  return workouts.map((day) => {
    const ids = new Set(day.exercises.map((e) => e.exerciseId));
    return {
      ...day,
      exercises: day.exercises.map((ex) => {
        const back = ex.swappedFrom?.exerciseId;
        if (
          !back ||
          ids.has(back) ||
          contraindicatedFor(back, injuries).length > 0 ||
          !usable(back)
        ) {
          return ex;
        }
        ids.delete(ex.exerciseId);
        ids.add(back);
        const restored = replaceExercise(
          ex,
          back,
          exerciseDisplayName(back),
          loadCtx,
          ""
        );
        delete restored.swappedFrom;
        delete restored.notes;
        return restored;
      }),
    };
  });
}

/**
 * Pgm5 follow-up — injury-aware in-place re-swap for an EXISTING programme.
 *
 * `buildPlan` runs this on every plan it builds, onboarding's included.
 * Structure-preserving regeneration calls it so that when a user changes their
 * injuries in Programme Settings, ONLY the now-contraindicated exercises in
 * their current workouts are swapped. The slot keeps its place, and
 * movement-specific load and performance history are recalibrated/reset so a
 * deadlift record can never be relabelled as its substitute; the builder
 * then gives the new lift its role's numbers (`represcribeSwapped`).
 *
 * Over-swap guard: an exercise is swapped only when `CONTRAINDICATED` (the
 * lifts each injury's promise names) flags it for one of the user's CURRENT
 * injuries. A safe exercise that merely *has* a substitution entry (e.g. a
 * squat for a shoulder-only user) is left untouched. No safe substitute →
 * keep the exercise with a warning note.
 *
 * Idempotent (re-running with the same injuries is a no-op); healthy users /
 * "none" → unchanged clone. Removing an injury brings the swapped lift back
 * on the next save (`restoreSwappedLifts`, which reads the `swappedFrom`
 * each swap records).
 */
/**
 * NOT experience-gated, deliberately (2026-07-28). Its sibling
 * `applyEquipmentFilterToWorkouts` IS, because an equipment swap has many
 * candidates and no safety stake. An injury swap has neither property: the
 * substitute is chosen from a curated safety map, and if the only movement
 * that spares an injured knee happens to be a technical one, an injured
 * novice still needs it. Safety outranks simplicity, so a beginner CAN
 * receive an above-level movement by this route — the one documented
 * exception to the complexity gate.
 */
export function applyInjuryFiltersToWorkouts(
  workouts: readonly WorkoutDay[],
  injuries: readonly string[],
  /** Equipment tier — a PREFERENCE for the substitute, never a hard filter. */
  equipment?: string,
  loadCtx?: StartingLoadContext
): WorkoutDay[] {
  const cloneDay = (d: WorkoutDay): WorkoutDay => ({
    ...d,
    exercises: d.exercises.map((e) => ({ ...e })),
  });
  if (!injuries.length || injuries.includes("none")) {
    return workouts.map(cloneDay);
  }

  // A substitute must be safe for every injury the person has, not only the
  // ones its original is named for, or the next save swaps it again.
  const unsafe = Object.keys(CONTRAINDICATED).filter(
    (id) => contraindicatedFor(id, injuries).length > 0
  );

  return workouts.map((day) => {
    // Seed the day's used-ids with every exercise that is NOT being swapped,
    // so a swap can't land on one already present on the day.
    const usedIds = new Set<string>();
    for (const ex of day.exercises) {
      if (contraindicatedFor(ex.exerciseId, injuries).length === 0)
        usedIds.add(ex.exerciseId);
    }

    const exercises: ProgramExercise[] = day.exercises.map((ex) => {
      const relevant = contraindicatedFor(ex.exerciseId, injuries);
      if (relevant.length === 0) return { ...ex };

      const allowedEq = equipment
        ? EQUIPMENT_AVAILABILITY[equipment]
        : undefined;
      const safe = findSafeSubstitute(
        ex.exerciseId,
        relevant,
        new Set([...usedIds, ...unsafe]),
        allowedEq
          ? (id) => {
              const eq = getExerciseById(id)?.equipment;
              return eq === undefined || allowedEq.has(eq);
            }
          : undefined
      );
      if (safe) {
        usedIds.add(safe.id);
        return replaceExercise(
          ex,
          safe.id,
          safe.name,
          loadCtx,
          `Swapped from ${ex.name} (${relevant.join(", ")}): ${safe.rationale}.`
        );
      }
      // No safe substitute — keep the exercise but flag it (tier 4).
      return {
        ...ex,
        notes:
          `No safe substitute for ${ex.name} given your ${relevant.join(" + ")} ` +
          `limitation — consider replacing it manually or reducing load.`,
      };
    });

    return { ...day, exercises };
  });
}

/**
 * Which `Exercise.equipment` values each equipment tier can train with.
 * Derived from the EQUIPMENT_OPTIONS copy in ProgrammeSettings:
 *   full_gym  "Barbells, dumbbells, cables, machines"  → everything (no filter)
 *   home_gym  "Dumbbells, bench, pull-up bar"          → DB + bodyweight (+ KB)
 *   minimal   "Bands, bodyweight, maybe dumbbells"     → DB + bodyweight
 * home/minimal both EXCLUDE Barbell / Machine / Cable — the meaningful "no
 * barbell or machines" distinction the coarse equipment vocab supports. Bands
 * have no DB-vocab equivalent and are treated as bodyweight-adjacent.
 * REVERSIBLE product-data decision — adjust these sets if the tiers change.
 */
const EQUIPMENT_AVAILABILITY: Record<string, ReadonlySet<string>> = {
  home_gym: new Set(["Dumbbells", "Bodyweight", "Kettlebell"]),
  minimal: new Set(["Dumbbells", "Bodyweight"]),
};

/**
 * Pgm5 follow-up — equipment-aware in-place re-pick for an existing programme.
 *
 * When a user changes their equipment (e.g. full_gym → minimal while
 * travelling), structure-preserving regeneration calls this to swap any
 * exercise whose equipment the user no longer has for a same-movement-category
 * alternative that fits. The slot keeps its place; the target load is
 * recalibrated, movement-specific history is reset, and the builder gives the
 * new lift its role's numbers (`represcribeSwapped`). full_gym (or any
 * unrecognised tier) is a no-op (everything available). An exercise whose id
 * we can't resolve in EXERCISES is left untouched. No fitting alternative is
 * kept with a warning note.
 *
 * Composes after `applyInjuryFiltersToWorkouts`: the candidate picker also
 * excludes injury-contraindicated ids, so an equipment swap never reintroduces
 * an injury risk. Idempotent (already-available exercises don't match).
 */
export function applyEquipmentFilterToWorkouts(
  workouts: readonly WorkoutDay[],
  equipment: string,
  injuries: readonly string[] = [],
  experience?: Experience,
  loadCtx?: StartingLoadContext
): WorkoutDay[] {
  const cloneDay = (d: WorkoutDay): WorkoutDay => ({
    ...d,
    exercises: d.exercises.map((e) => ({ ...e })),
  });

  const allowed = EQUIPMENT_AVAILABILITY[equipment];
  if (!allowed) return workouts.map(cloneDay); // full_gym / unknown → no filter

  const isInjuryContra = (id: string): boolean =>
    contraindicatedFor(id, injuries).length > 0;
  // Unknown id (custom exercise) → can't assess equipment, leave it be.
  const isAvailable = (id: string): boolean => {
    const eq = getExerciseById(id)?.equipment;
    return eq === undefined || allowed.has(eq);
  };

  return workouts.map((day) => {
    const usedIds = new Set(day.exercises.map((e) => e.exerciseId));
    const exercises: ProgramExercise[] = day.exercises.map((ex) => {
      if (isAvailable(ex.exerciseId)) return { ...ex };
      // Catalogue-pinned slots (direct calf work): their bank category pool
      // is squat-pattern lifts, so the generic swap below would replace the
      // programme's only calf coverage with a fourth quad slot — and, by
      // draining the pool, push LATER slots onto technical variations a
      // beginner shouldn't get (measured: home_gym/2d handed a beginner a
      // Bulgarian split squat). These re-point to their own bodyweight
      // fallback instead, so a calf raise stays a calf raise at every
      // equipment tier. Falls through to the generic swap only if the
      // fallback is itself unusable, keeping the equipment promise absolute.
      const pinnedFallback = PINNED_EQUIPMENT_FALLBACK[ex.exerciseId];
      if (
        CATALOGUE_PINNED_ACCESSORY_IDS.has(ex.exerciseId) &&
        pinnedFallback &&
        isAvailable(pinnedFallback) &&
        !usedIds.has(pinnedFallback) &&
        !isInjuryContra(pinnedFallback)
      ) {
        usedIds.delete(ex.exerciseId);
        usedIds.add(pinnedFallback);
        return replaceExercise(
          ex,
          pinnedFallback,
          exerciseDisplayName(pinnedFallback),
          loadCtx,
          `Swapped from ${ex.name} — not available with your equipment.`
        );
      }

      const options = exerciseBank[ex.movementCategory] ?? [];
      // NOT complexity-gated, and that is a measured decision rather than an
      // oversight (2026-07-28). Adding `allowsComplexity` to this predicate
      // was tried twice and neither form helps:
      //
      //   AND-ed into the find  → complexity violations 603 → 315, but
      //                           equipment violations 462 → 798. It does not
      //                           find simpler movements; it finds NOTHING and
      //                           leaves the slot holding a barbell the user
      //                           does not own. Strictly worse.
      //   preferred, then fall  → identical to no gate at all on both counts
      //   back to any available   (603 / 462), because in every failing case
      //                           there IS no simple, equipment-available
      //                           option in that category.
      //
      // The residue is exercise-BANK COVERAGE, not filter logic: on
      // `home_gym`/`minimal`, `knee_dominant` has exactly one non-primary the
      // user owns and it is `bulgarian-split` (technical) — front squat is a
      // barbell, leg press and hack squat are machines. No predicate can
      // conjure an option that is not in the bank. See the backlog entry.
      const eligible = (o: (typeof options)[number]) =>
        o.id !== ex.exerciseId &&
        !usedIds.has(o.id) &&
        isAvailable(o.id) &&
        !isInjuryContra(o.id);
      // Preferred pick honours `offerableTo` (complexity + the beginner
      // bodyweight-floor rule): without the floor half, a beginner at
      // home/minimal whose gated lat pulldown lost its cable would be handed
      // straight back the pull-up the gate just removed.
      let pick =
        options.find((o) => eligible(o) && offerableTo(experience, o)) ??
        undefined;
      // Vertical-pull coverage floor: at home/minimal every pull a beginner
      // may be offered is a cable (pulldowns), and every pull an elbow
      // injury leaves is one too, so nothing survives the equipment check;
      // for a beginner the ungated fallback below would restore the
      // pull-up. The honest coaching answer at that tier is the inverted
      // row — bodyweight, difficulty scaled by foot position, THE reference
      // novice pull regression, and a neutral-grip pull that spares the
      // elbow. It is a horizontal_pull by category (which is why it cannot
      // live in the vertical_pull pool), so it re-points here the same way
      // the pinned calf fallback does, and the slot's category follows the
      // movement honestly.
      const invertedRowFits =
        ex.movementCategory === "vertical_pull" &&
        isAvailable("inverted-row") &&
        !usedIds.has("inverted-row") &&
        !isInjuryContra("inverted-row");
      if (
        invertedRowFits &&
        (toExperience(experience) === "beginner"
          ? !pick
          : !pick && !options.some(eligible))
      ) {
        usedIds.delete(ex.exerciseId);
        usedIds.add("inverted-row");
        return replaceExercise(
          ex,
          "inverted-row",
          exerciseDisplayName("inverted-row"),
          loadCtx,
          `Swapped from ${ex.name} — not available with your equipment.`
        );
      }
      pick = pick ?? options.find(eligible);
      if (pick) {
        usedIds.delete(ex.exerciseId);
        usedIds.add(pick.id);
        return replaceExercise(
          ex,
          pick.id,
          exerciseDisplayName(pick.id),
          loadCtx,
          `Swapped from ${ex.name} — not available with your equipment.`
        );
      }
      // No fitting alternative — keep but flag.
      return {
        ...ex,
        notes:
          `${ex.name} needs equipment you don't have — replace it manually ` +
          `or use a bodyweight variation.`,
      };
    });
    return { ...day, exercises };
  });
}
