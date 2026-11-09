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
import { MAX_WEEKLY_LIFT_EXPOSURES } from "./overlapModel";
import { primaryJudgementForExercise } from "./volumeModel";
import {
  HOLD_START_SECONDS,
  MAX_HOLD_SECONDS,
  repUnitForExerciseId,
} from "./repUnits";
import {
  NO_EQUIPMENT_EXERCISE_IDS,
  NO_EQUIPMENT_LAST_RESORT,
  NO_EQUIPMENT_STAND_INS,
} from "./noEquipment";
import { hasPullUpBar } from "./programLabels";

/**
 * How many times the week has each lift, kept as a filter swaps them, so a
 * swap doesn't give a lift a third day (`MAX_WEEKLY_LIFT_EXPOSURES`) and two
 * swaps in one pass can't both land on the same lift.
 *
 * The filters run after `capRepeatedLifts`, and its picker knows nothing of
 * the person's kit or injuries, so running it again would hand back lifts
 * they can't do. The filters' pickers keep the cap themselves instead: of
 * the lifts they would choose from, they take the first the week has fewer
 * than twice. What they choose from doesn't change: the person's kit, their
 * injuries and, for the equipment picker, their level all rank above the
 * cap.
 *
 * When every lift a slot may take is in the week twice already, it takes
 * the one it took before, and the week has that lift three times. Measured
 * over 14,400 plans (five focuses, 1–6 days, five kits, four session
 * lengths, three levels, with no injury and with seven sets of them), that
 * happens only with an injury, in three-day plans at home or with minimal
 * kit and no barbell, where the bank has too few lifts that are safe and in
 * the kit: a sore shoulder's incline dumbbell press, a sore back's Bulgarian
 * split squat and, for a beginner, its glute bridge (the Nordic curl is
 * above their level). For a sore shoulder alone it is a greedy choice: the
 * overhead press takes the incline press while the week has room, though
 * push-ups were on its list, and the bench press that comes after has
 * nothing else. With a sore wrist as well, push-ups are out too.
 */
function weekLifts(workouts: readonly WorkoutDay[]) {
  const times = new Map<string, number>();
  for (const ex of workouts.flatMap((d) => d.exercises)) {
    times.set(ex.exerciseId, (times.get(ex.exerciseId) ?? 0) + 1);
  }
  return {
    underCap: (id: string): boolean =>
      (times.get(id) ?? 0) < MAX_WEEKLY_LIFT_EXPOSURES,
    swapped(from: string, to: string): void {
      times.set(from, (times.get(from) ?? 1) - 1);
      times.set(to, (times.get(to) ?? 0) + 1);
    },
  };
}

/**
 * The order a filter swaps a week's slots in, as `[day, slot]`: main lifts
 * first, then the earlier day, then the earlier slot, which is the order
 * `capRepeatedLifts` keeps a lift in. When the week can take a lift only
 * once more, a main lift gets it and a supporting slot takes the next one.
 * In a beginner's three days at home, both deadlift days keep the dumbbell
 * RDL as their main, and the squat day's supporting hinge becomes a glute
 * bridge.
 */
function swapOrder(workouts: readonly WorkoutDay[]): Array<[number, number]> {
  return workouts
    .flatMap((day, d) =>
      day.exercises.map((ex, e) => ({ d, e, main: ex.isAccessory !== true }))
    )
    .sort((a, b) =>
      a.main !== b.main ? (a.main ? -1 : 1) : a.d - b.d || a.e - b.e
    )
    .map(({ d, e }) => [d, e]);
}

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
    ...inUnitOf(ex, exerciseId),
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
 * A slot's target in the unit of the lift taking it. A hold counts seconds
 * (`repUnits.ts`): one swapped in for a lift starts at 30 seconds and climbs
 * five at a time to a minute, as the engine's time axis does, and a lift
 * swapped in for a hold starts at 10 reps for the role table to set. The
 * role table leaves holds as they are, so without this a plank in a
 * crunch's place read "2 × 12": twelve reps of a hold. In the same unit
 * nothing changes.
 */
function inUnitOf(ex: ProgramExercise, exerciseId: string): ProgramExercise {
  const timed = repUnitForExerciseId(exerciseId) === "seconds";
  if (timed === (ex.repUnit === "seconds")) return ex;
  const { repUnit: _unit, repRangeMax: _top, ...rest } = ex;
  return timed
    ? {
        ...rest,
        repUnit: "seconds",
        reps: HOLD_START_SECONDS,
        baseReps: HOLD_START_SECONDS,
        repRangeMax: MAX_HOLD_SECONDS,
        progressionType: "double",
      }
    : { ...rest, reps: 10, baseReps: 10 };
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
  loadCtx?: StartingLoadContext,
  barbellAtHome?: boolean,
  /** A pull-up bar at home (`hasPullUpBar`). */
  pullUpBar?: boolean
): WorkoutDay[] {
  const owned = ownedKit(equipment, barbellAtHome, pullUpBar);
  const usable = (id: string) => !owned || owned(id);
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
  loadCtx?: StartingLoadContext,
  /** A barbell and a rack at home, beside the tier's kit. */
  barbellAtHome?: boolean,
  /** A pull-up bar at home (`hasPullUpBar`). */
  pullUpBar?: boolean
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
  const isAvailable = ownedKit(equipment, barbellAtHome, pullUpBar);

  const out = workouts.map(cloneDay);
  const week = weekLifts(out);
  // Seed each day's used-ids with every exercise that is NOT being swapped,
  // so a swap can't land on one already present on the day.
  const usedByDay = out.map(
    (day) =>
      new Set(
        day.exercises
          .filter(
            (ex) => contraindicatedFor(ex.exerciseId, injuries).length === 0
          )
          .map((ex) => ex.exerciseId)
      )
  );

  for (const [d, e] of swapOrder(out)) {
    const ex = out[d].exercises[e];
    const relevant = contraindicatedFor(ex.exerciseId, injuries);
    if (relevant.length === 0) continue;

    const usedIds = usedByDay[d];
    const safe = findSafeSubstitute(
      ex.exerciseId,
      relevant,
      new Set([...usedIds, ...unsafe]),
      isAvailable,
      week.underCap
    );
    if (safe) {
      usedIds.add(safe.id);
      week.swapped(ex.exerciseId, safe.id);
      out[d].exercises[e] = replaceExercise(
        ex,
        safe.id,
        safe.name,
        loadCtx,
        `Swapped from ${ex.name} (${relevant.join(", ")}): ${safe.rationale}.`
      );
      continue;
    }
    // No safe substitute — keep the exercise but flag it (tier 4).
    out[d].exercises[e] = {
      ...ex,
      notes:
        `No safe substitute for ${ex.name} given your ${relevant.join(" + ")} ` +
        `limitation — consider replacing it manually or reducing load.`,
    };
  }
  return out;
}

/**
 * Which `Exercise.equipment` values each equipment tier can train with.
 * Derived from the EQUIPMENT_OPTIONS copy in ProgrammeSettings:
 *   full_gym  "Barbells, dumbbells, cables, machines"  → everything (no filter)
 *   home_gym  "Dumbbells, bench"                       → DB + bodyweight (+ KB)
 *   minimal   "Bands, bodyweight, maybe dumbbells"     → DB + bodyweight
 * home/minimal both EXCLUDE Barbell / Machine / Cable — the meaningful "no
 * barbell or machines" distinction the coarse equipment vocab supports. Bands
 * have no DB-vocab equivalent and are treated as bodyweight-adjacent.
 * REVERSIBLE product-data decision — adjust these sets if the tiers change.
 *
 * `no_equipment` is not a set of these values: "Bodyweight" takes in the
 * pull-up bar, the dip bars and the bench, so that setup names its
 * exercises instead (`noEquipment.ts`).
 */
const EQUIPMENT_AVAILABILITY: Record<string, ReadonlySet<string>> = {
  home_gym: new Set(["Dumbbells", "Bodyweight", "Kettlebell"]),
  minimal: new Set(["Dumbbells", "Bodyweight"]),
};

/** Whether a person can do an exercise with the kit they have. */
type KitCheck = (exerciseId: string) => boolean;

/** The bodyweight lifts that hang from a pull-up bar: what "A pull-up bar"
 *  allows at home (Lift4 (11)). */
export const PULL_UP_BAR_EXERCISE_IDS: ReadonlySet<string> = new Set([
  "pull-ups",
  "chin-ups",
  "leg-raise",
]);

/**
 * What a person can do with their kit: their equipment tier's, a barbell
 * with a rack when they said they have one at home, and the pull-ups,
 * chin-ups and hanging leg raise only with a pull-up bar (Lift4 (11): "what
 * do you have?"); or, with no equipment, the floor moves that setup names.
 * Undefined means everything (a full gym, or an unknown tier). An exercise
 * the catalogue doesn't know (a custom one) can't be judged, so it passes.
 */
function ownedKit(
  equipment: string | undefined,
  barbellAtHome?: boolean,
  pullUpBar?: boolean
): KitCheck | undefined {
  if (equipment === "no_equipment") {
    return (id) =>
      getExerciseById(id) === undefined || NO_EQUIPMENT_EXERCISE_IDS.has(id);
  }
  const tier = equipment ? EQUIPMENT_AVAILABILITY[equipment] : undefined;
  if (!tier) return undefined;
  const kit = barbellAtHome ? new Set([...tier, "Barbell"]) : tier;
  const bar = hasPullUpBar(equipment, pullUpBar);
  return (id) => {
    if (!bar && PULL_UP_BAR_EXERCISE_IDS.has(id)) return false;
    const eq = getExerciseById(id)?.equipment;
    return eq === undefined || kit.has(eq);
  };
}

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
  loadCtx?: StartingLoadContext,
  /** A barbell and a rack at home, beside the tier's kit. */
  barbellAtHome?: boolean,
  /** A pull-up bar at home (`hasPullUpBar`). */
  pullUpBar?: boolean
): WorkoutDay[] {
  const cloneDay = (d: WorkoutDay): WorkoutDay => ({
    ...d,
    exercises: d.exercises.map((e) => ({ ...e })),
  });

  // Unknown id (custom exercise) → can't assess equipment, leave it be.
  const isAvailable = ownedKit(equipment, barbellAtHome, pullUpBar);
  if (!isAvailable) return workouts.map(cloneDay); // full_gym / unknown → no filter

  const isInjuryContra = (id: string): boolean =>
    contraindicatedFor(id, injuries).length > 0;
  // With no equipment the bank's pools run short (a pull has one lift), so
  // the setup's own stand-ins come next (`noEquipment.ts`).
  const standIns =
    equipment === "no_equipment" ? NO_EQUIPMENT_STAND_INS : undefined;

  const out = workouts.map(cloneDay);
  const week = weekLifts(out);
  const usedByDay = out.map(
    (day) => new Set(day.exercises.map((e) => e.exerciseId))
  );

  const swapFor = (
    ex: ProgramExercise,
    usedIds: Set<string>
  ): ProgramExercise => {
    const swapTo = (id: string): ProgramExercise => {
      usedIds.delete(ex.exerciseId);
      usedIds.add(id);
      week.swapped(ex.exerciseId, id);
      return replaceExercise(
        ex,
        id,
        exerciseDisplayName(id),
        loadCtx,
        `Swapped from ${ex.name} — not available with your equipment.`
      );
    };
    // Catalogue-pinned slots (direct calf work): their bank category pool
    // is squat-pattern lifts, so the generic swap below would replace the
    // programme's only calf coverage with a fourth quad slot — and, by
    // draining the pool, push LATER slots onto technical variations a
    // beginner shouldn't get (measured: home_gym/2d handed a beginner a
    // Bulgarian split squat). These re-point to their own bodyweight
    // fallback instead, so a calf raise stays a calf raise at every
    // equipment tier. Falls through to the generic swap only if the
    // fallback is itself unusable, keeping the equipment promise absolute.
    // The week's cap doesn't move it either: the only other choice is a
    // squat in the calf raise's place.
    const pinnedFallback = PINNED_EQUIPMENT_FALLBACK[ex.exerciseId];
    if (
      CATALOGUE_PINNED_ACCESSORY_IDS.has(ex.exerciseId) &&
      pinnedFallback &&
      isAvailable(pinnedFallback) &&
      !usedIds.has(pinnedFallback) &&
      !isInjuryContra(pinnedFallback)
    ) {
      return swapTo(pinnedFallback);
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
    const eligible = (o: { id: string }) =>
      o.id !== ex.exerciseId &&
      !usedIds.has(o.id) &&
      isAvailable(o.id) &&
      !isInjuryContra(o.id);
    // No lift more than twice a week (`weekLifts`): of the options a pick
    // chooses from, the first the week has fewer than twice, and the first
    // only when the week has every one of them twice. The level gate ranks
    // above the cap: a beginner isn't given a technical lift to keep it.
    const firstUnderCap = (
      pool: typeof options
    ): (typeof options)[number] | undefined =>
      pool.find((o) => week.underCap(o.id)) ?? pool[0];
    // Preferred pick honours `offerableTo` (complexity + the beginner
    // bodyweight-floor rule): without the floor half, a beginner at
    // home/minimal whose gated lat pulldown lost its cable would be handed
    // straight back the pull-up the gate just removed.
    let pick: { id: string } | undefined = firstUnderCap(
      options.filter((o) => eligible(o) && offerableTo(experience, o))
    );
    // At home a beginner's scalable vertical pulls need a cable. Prefer
    // the inverted row, then another available row if it already occupies
    // this day. With only the inverted-row fallback, a five/six-day plan
    // whose pull day already held it restored unassisted pull-ups through
    // the ungated fallback below. A row's load/angle can be reduced; a
    // pull-up's whole-body minimum cannot. Injury and equipment checks
    // still apply, and the replacement's category and load follow its ID.
    const beginner = toExperience(experience) === "beginner";
    if (
      ex.movementCategory === "vertical_pull" &&
      !pick &&
      (beginner || !options.some(eligible))
    ) {
      const rows = [
        ...exerciseBank.horizontal_pull.filter((o) => o.id === "inverted-row"),
        ...exerciseBank.horizontal_pull.filter((o) => o.id !== "inverted-row"),
      ].filter(eligible);
      const row =
        rows.find((o) => offerableTo(experience, o)) ??
        rows.find((o) => !o.bodyweightFloor);
      if (row) return swapTo(row.id);
    }
    // With no equipment, the setup's stand-ins for the movement, at the
    // person's level (`noEquipment.ts`): a plank for a cable crunch, a pike
    // push-up for a lateral raise, a superman for a second hinge.
    const fits = (standIns?.[ex.movementCategory] ?? []).filter(eligible);
    const atLevel = fits.filter((o) => offerableTo(experience, o));
    pick = pick ?? atLevel.find((o) => week.underCap(o.id)) ?? atLevel[0];
    // Complexity can give way when kit has no simpler choice, but never
    // reintroduce the bodyweight floor a beginner's level gate removed.
    pick =
      pick ??
      firstUnderCap(
        options.filter((o) => eligible(o) && !(beginner && o.bodyweightFloor))
      );
    // A main lift takes a stand-in above the person's level rather than
    // none: the day is built around it. A supporting lift with none at
    // their level goes instead (`dropUnavailableAccessories`).
    if (!pick && ex.isAccessory !== true) {
      pick = fits.find((o) => week.underCap(o.id)) ?? fits[0];
    }
    if (pick) return swapTo(pick.id);
    // No fitting alternative — keep but flag.
    return {
      ...ex,
      notes:
        `${ex.name} needs equipment you don't have — replace it manually ` +
        `or use a bodyweight variation.`,
    };
  };

  for (const [d, e] of swapOrder(out)) {
    const ex = out[d].exercises[e];
    if (isAvailable(ex.exerciseId)) continue;
    out[d].exercises[e] = swapFor(ex, usedByDay[d]);
  }
  return out;
}

/**
 * Lift14 — a new plan drops a supporting lift the person's kit can't do when
 * its day already trains the same muscle with one it can.
 *
 * The equipment filter keeps a lift with no fitting alternative and flags it
 * ("needs equipment you don't have — replace it manually"). With an injury
 * and home or minimal kit that happens where the one safe lift the kit
 * allows is already on the day: an elbow keeps a cable pushdown beside its
 * kickbacks and a cable pulldown beside its inverted rows, a knee and back a
 * barbell hip thrust beside a glute bridge. A lift the person can't do is no
 * part of the session, and the day's other lift already gives the muscle its
 * work. A main lift, or a supporting lift whose muscle nothing else on the
 * day trains, keeps the flag.
 *
 * With no equipment a supporting lift goes whatever the day trains: the
 * equipment filter has tried the setup's stand-ins, so nothing in the
 * catalogue does its job without kit (a curl, a lateral raise, a second row
 * beside the inverted row). A main lift stays for `standInForMissingKit`.
 *
 * New plans only (`generateProgram`): a plan the person has is matched to
 * its saved state slot by slot, so a kit change there keeps the flag rather
 * than move every later lift's history up a place.
 */
export function dropUnavailableAccessories(
  workouts: readonly WorkoutDay[],
  equipment: string | undefined,
  barbellAtHome?: boolean,
  /** A pull-up bar at home (`hasPullUpBar`). */
  pullUpBar?: boolean
): WorkoutDay[] {
  const owned = ownedKit(equipment, barbellAtHome, pullUpBar);
  if (!owned) return [...workouts];
  const nothing = equipment === "no_equipment";
  return workouts.map((day) => {
    const kept = day.exercises.filter((ex) => {
      if (!ex.isAccessory || owned(ex.exerciseId)) return true;
      if (nothing) return false;
      const muscle = primaryJudgementForExercise(ex);
      return !day.exercises.some(
        (other) =>
          other !== ex &&
          owned(other.exerciseId) &&
          muscle !== null &&
          primaryJudgementForExercise(other) === muscle
      );
    });
    return kept.length === day.exercises.length
      ? day
      : { ...day, exercises: kept };
  });
}

/**
 * With no equipment, a lift still left needing kit after the swaps takes
 * the setup's last resort (`NO_EQUIPMENT_LAST_RESORT`): the first hold or
 * floor lift that isn't on its day and that the person's injuries allow.
 * That is a main lift whose whole movement the injuries rule out (a sore
 * shoulder, elbow and wrist leave a push day no push), or, in a plan the
 * person has, any lift with nothing in its movement to stand in for it.
 *
 * In a plan the person has, this stands where Lift14's drop does in a new
 * one: the slot keeps its place, the lift its swap came from is recorded
 * (`swappedFrom`), and a save with the kit back brings it back
 * (`restoreSwappedLifts`), so a week away from the gym costs no lifts.
 * A lift with no last resort left keeps the equipment filter's flag.
 */
export function standInForMissingKit(
  workouts: readonly WorkoutDay[],
  equipment: string | undefined,
  injuries: readonly string[] = [],
  loadCtx?: StartingLoadContext
): WorkoutDay[] {
  if (equipment !== "no_equipment") return [...workouts];
  const owned = ownedKit(equipment);
  if (!owned) return [...workouts];
  const out = workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((e) => ({ ...e })),
  }));
  const week = weekLifts(out);
  for (const [d, e] of swapOrder(out)) {
    const ex = out[d].exercises[e];
    if (owned(ex.exerciseId)) continue;
    const onDay = new Set(out[d].exercises.map((x) => x.exerciseId));
    const fits = NO_EQUIPMENT_LAST_RESORT.filter(
      (id) => !onDay.has(id) && contraindicatedFor(id, injuries).length === 0
    );
    const id = fits.find((f) => week.underCap(f)) ?? fits[0];
    if (!id) continue;
    week.swapped(ex.exerciseId, id);
    out[d].exercises[e] = replaceExercise(
      ex,
      id,
      exerciseDisplayName(id),
      loadCtx,
      `Swapped from ${ex.name} — not available with your equipment.`
    );
  }
  return out;
}
