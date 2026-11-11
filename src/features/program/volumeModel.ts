/**
 * Weekly sets-per-muscle volume model (D-LIFT-1, read-only first).
 *
 * The lift engine programs volume per *day-template* but never accounts for it
 * at the muscle-group-week level — the primary hypertrophy driver
 * (Schoenfeld dose–response; RP MEV/MAV/MRV landmarks). This module computes
 * the weekly hard-set tally per canonical muscle group from a generated week,
 * and classifies each against a goal-driven landmark band. Pure + mirror-ready.
 *
 * Counting convention: the literature's 1:1 (ADR-0010, flip landed with the
 * taxonomy split) —
 *   - a set counts 1.0 toward the exercise's PRIMARY muscle group
 *   - and `SECONDARY_SET_WEIGHT` (1.0) toward each SECONDARY group it trains
 *   - once per muscle per exercise (strongest relationship; no intra-exercise
 *     double-count), and secondary "Core" credit only from core work
 * Exercises with no muscle attribution (Cardio / "Full Body" conditioning, or
 * too-coarse labels) are excluded — this is a *resistance* volume view.
 *
 * Three layers since the taxonomy split:
 *   - FINE (muscleTaxonomy.ts, 27 members) — attribution substrate;
 *   - CANONICAL ten — the DISPLAY roll-up the app has always published;
 *   - JUDGEMENT (14 groups) — what classification runs on, with per-group
 *     bands (`judgementLandmark`). The canonical Shoulders/Back/Core buckets
 *     are judged on their parts.
 *
 * It SURFACES the tally (WeeklyVolumeCard) and decides which muscles a week
 * works (`weeklyFrequency.ts`). It does not shape a plan's sets (Lift21,
 * ADR-0013): time sizes a day, and the bands judge what it holds.
 */
import { getExerciseById, type Exercise } from "@/lib/exercises";
import {
  CANONICAL_MUSCLE_ORDER,
  fineToCanonical,
  toFine,
  type CanonicalMuscle,
  type FineMuscle,
} from "./muscleTaxonomy";
import type { ProgramExercise, WorkoutDay } from "./programTypes";

// The taxonomy moved to `muscleTaxonomy.ts` in 13a so the fine layer and the
// canonical ten could live together without an import cycle. Re-exported here
// because every existing consumer imports them from this module, and moving a
// type is not a reason to touch ten call sites.
export {
  CANONICAL_MUSCLE_ORDER,
  fineToCanonical,
  toFine,
  type CanonicalMuscle,
  type FineMuscle,
};

// Fallback when an exercise isn't in the DB (custom exercise): attribute by its
// movement category so custom lifts still count. Category is a MOVEMENT, not a
// muscle, so it can only ever name a coarse bucket — which is why these resolve
// to the `*Unspecified` members rather than pretending to know a head.
const CATEGORY_TO_FINE: Record<string, FineMuscle> = {
  horizontal_push: "ChestUnspecified",
  vertical_push: "DeltsUnspecified",
  horizontal_pull: "BackUnspecified",
  vertical_pull: "BackUnspecified",
  knee_dominant: "Quads",
  hip_dominant: "Hamstrings",
  arms_biceps: "Biceps",
  arms_triceps: "Triceps",
  core: "CoreUnspecified",
};

export function toCanonical(name: string | undefined): CanonicalMuscle | null {
  return fineToCanonical(toFine(name));
}

/** The canonical PRIMARY muscle an exercise trains (DB primary, else movement
 *  category for custom lifts), or null when unattributable (cardio/whole-body). */
export function primaryCanonicalForExercise(ex: {
  exerciseId: string;
  movementCategory?: string;
}): CanonicalMuscle | null {
  const dbEx = getExerciseById(ex.exerciseId);
  if (dbEx) return toCanonical(dbEx.muscleGroup);
  const fine = ex.movementCategory
    ? CATEGORY_TO_FINE[ex.movementCategory]
    : undefined;
  return fineToCanonical(fine ?? null);
}

/**
 * Canonical primary + secondary muscles for a DB exercise — the same
 * attribution `weeklyVolumeByMuscle` applies internally, exposed so sibling
 * views (muscle recovery) speak the identical muscle language as the volume
 * card. `primary: null` means the lift is unattributable (cardio/whole-body)
 * and should be skipped entirely, mirroring the volume tally's rule.
 */
export function canonicalMusclesForDbExercise(dbEx: Exercise): {
  primary: CanonicalMuscle | null;
  secondary: CanonicalMuscle[];
} {
  const primary = toCanonical(dbEx.muscleGroup);
  if (!primary) return { primary: null, secondary: [] };
  const secondary: CanonicalMuscle[] = [];
  for (const sec of dbEx.secondaryMuscles ?? []) {
    const m = toCanonical(sec);
    if (m && m !== primary && !secondary.includes(m)) secondary.push(m);
  }
  return { primary, secondary };
}

export interface MuscleVolume {
  muscle: CanonicalMuscle;
  /** Weekly hard sets (primary 1.0 + secondary `SECONDARY_SET_WEIGHT`,
   *  counted once per muscle per exercise), rounded to 0.5. */
  sets: number;
}

export interface FineMuscleVolume {
  muscle: FineMuscle;
  /**
   * Weekly hard sets (primary 1.0 + secondary `SECONDARY_SET_WEIGHT`),
   * UNROUNDED. This is substrate — the canonical view rounds once, at the
   * level it publishes, because rounding each part and adding the results is
   * a different number from rounding the sum.
   */
  sets: number;
  /** Where this rolls up in the published ten, or `null` when the ten-group
   *  taxonomy has no home for it (forearms, hip flexors). */
  canonical: CanonicalMuscle | null;
}

/**
 * What one set of an exercise contributes to a muscle it trains INDIRECTLY —
 * a secondary rather than the target.
 *
 * 1.0 — the literature's convention, landed with the judgement layer as
 * ADR-0010's second status addendum records: the canonical Shoulders/Core
 * buckets mispriced 1:1 cross-exercise credit at 292/750 readings
 * over-ceiling, and judging volume per head with per-group bands closed
 * exactly that. The D-VOL ratchet is denominated in this judged 1:1 unit.
 *
 * The primary is always 1.0; there is no constant for it because a convention
 * in which the target muscle earns anything else does not exist.
 */
export const SECONDARY_SET_WEIGHT = 1.0;

/**
 * The FINE-layer attribution pass. Since the intra-exercise dedupe this is
 * no longer the substrate `weeklyVolumeByMuscle` sums — the canonical view
 * applies its own per-exercise strongest-relationship rule (see its doc) —
 * but both read the SAME DB fields under the same skip rules, and the
 * dedupe regression test pins the one place they are allowed to differ:
 * an exercise whose primary and secondary roll up to one canonical bucket.
 */
function fineTally(workouts: WorkoutDay[]): Map<FineMuscle, number> {
  const tally = new Map<FineMuscle, number>();
  const add = (m: FineMuscle | null, n: number) => {
    if (!m) return;
    tally.set(m, (tally.get(m) ?? 0) + n);
  };

  for (const day of workouts) {
    if (day.skipped) continue;
    for (const ex of day.exercises) {
      const sets = ex.sets ?? 0;
      if (sets <= 0) continue;
      const dbEx: Exercise | undefined = getExerciseById(ex.exerciseId);
      if (dbEx) {
        // Cardio is not resistance volume at all — skip it outright, whatever
        // its secondaries say. A treadmill listing "Quads/Calves" must not
        // book leg sets.
        if (dbEx.category === "Cardio") continue;

        const primary = toFine(dbEx.muscleGroup);
        if (primary) add(primary, sets);
        // An unattributable PRIMARY used to discard the whole lift, so the
        // thirteen "Full Body" movements in the DB — Zercher squat, landmine
        // squat, thrusters, kettlebell swing, Turkish get-up, muscle-ups —
        // booked ZERO volume despite naming real muscles as secondaries. A
        // Zercher squat trained nothing, as far as the model was concerned.
        // Falling through to the secondaries understates them (0.5 each
        // rather than a primary's 1.0), but understating a squat's legs is a
        // great deal closer than pretending it never happened. Fixing the
        // underlying `muscleGroup: "Full Body"` labels is exercise-DB work
        // (handoff 11b), not this.
        for (const sec of dbEx.secondaryMuscles ?? []) {
          add(toFine(sec), sets * SECONDARY_SET_WEIGHT);
        }
      } else {
        // Custom exercise not in the DB — attribute by movement category.
        add(CATEGORY_TO_FINE[ex.movementCategory] ?? null, sets);
      }
    }
  }

  return tally;
}

/**
 * Weekly sets per FINE muscle — the layer the attribution actually runs on.
 *
 * `weeklyVolumeByMuscle` rolls this up, so there is one attribution pass and
 * the two views cannot drift. Ordered by descending volume, then name; callers
 * that need a fixed display order should impose their own.
 *
 * Includes fine muscles with no canonical home (forearms, hip flexors). They
 * carry `canonical: null` and are dropped by the roll-up, which is why making
 * them visible here moved no published number.
 */
export function weeklyVolumeByFineMuscle(
  workouts: WorkoutDay[]
): FineMuscleVolume[] {
  return [...fineTally(workouts)]
    .filter(([, sets]) => sets > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([muscle, sets]) => ({
      muscle,
      sets,
      canonical: fineToCanonical(muscle),
    }));
}

/**
 * Weekly sets per canonical muscle group across a week's workouts. Skipped days
 * are excluded (no stimulus); completed/planned days count. Returns only
 * muscles with non-zero volume, in CANONICAL_MUSCLE_ORDER.
 *
 * NOT a plain sum of `weeklyVolumeByFineMuscle` since the 1:1 flip
 * (ADR-0010): a set counts ONCE toward a canonical muscle, at the strongest
 * relationship the exercise has with it. Summing fine credits double-counted
 * whenever an exercise's primary and a secondary rolled up to the SAME
 * canonical bucket — a barbell row (Lats primary, Lower Back secondary)
 * booked 2.0 Back sets per physical set at 1:1, and the 2026-08-03
 * measurement showed exactly that shape driving Back to 46 vs a ceiling of
 * 20 at 6 days: 14 of those sets were rows and deadlifts counted twice.
 * The literature's convention this module cites counts a row as one set for
 * the back. The FINE view is untouched — lats and lower back are different
 * muscles, and crediting both is the fine layer's whole point.
 */
export function weeklyVolumeByMuscle(workouts: WorkoutDay[]): MuscleVolume[] {
  const tally = new Map<CanonicalMuscle, number>();
  const add = (m: CanonicalMuscle | null, n: number) => {
    if (!m) return;
    tally.set(m, (tally.get(m) ?? 0) + n);
  };

  for (const day of workouts) {
    if (day.skipped) continue;
    for (const ex of day.exercises) {
      const sets = ex.sets ?? 0;
      if (sets <= 0) continue;
      const dbEx: Exercise | undefined = getExerciseById(ex.exerciseId);
      if (!dbEx) {
        // Custom exercise — attribute by movement category, same as fineTally.
        const fine = CATEGORY_TO_FINE[ex.movementCategory] ?? null;
        add(fine ? fineToCanonical(fine) : null, sets);
        continue;
      }
      if (dbEx.category === "Cardio") continue;

      // Strongest relationship per canonical muscle: primary → 1.0,
      // secondaries-only → SECONDARY_SET_WEIGHT (once, however many fine
      // secondaries roll up to the same bucket).
      const weightByCanonical = new Map<CanonicalMuscle, number>();
      const primaryFine = toFine(dbEx.muscleGroup);
      const primaryCanonical = primaryFine
        ? fineToCanonical(primaryFine)
        : null;
      if (primaryCanonical) weightByCanonical.set(primaryCanonical, 1);
      for (const sec of dbEx.secondaryMuscles ?? []) {
        const fine = toFine(sec);
        const canonical = fine ? fineToCanonical(fine) : null;
        if (!canonical) continue;
        if (!weightByCanonical.has(canonical)) {
          weightByCanonical.set(canonical, SECONDARY_SET_WEIGHT);
        }
      }
      for (const [muscle, weight] of weightByCanonical) {
        add(muscle, sets * weight);
      }
    }
  }

  return CANONICAL_MUSCLE_ORDER.filter((m) => (tally.get(m) ?? 0) > 0).map(
    (m) => ({ muscle: m, sets: Math.round((tally.get(m) ?? 0) * 2) / 2 })
  );
}

/* ================================
   JUDGEMENT LAYER (taxonomy split)
================================ */

/**
 * The groups weekly volume is JUDGED on, by landmark classification. The
 * canonical ten stay the DISPLAY layer.
 *
 * Why a third layer (ADR-0010 status addendum): the canonical Shoulders
 * bucket averages a lateral raise and a rear-delt flye into one number the
 * module's own comments call incoherent, and at the literature's 1:1
 * counting it absorbs every press AND every pull — 8 primary + 27 secondary
 * weekly sets at 6 days against one ceiling of 20. No reconciliation can fix
 * a mispriced bucket. Schoenfeld pp.186–187 is the direct source for the
 * delt split (the press trains "the anterior head … the middle and
 * posterior heads are substantially less active"); the v8 evaluation §3.9
 * names the Back lumping (lats / upper back / erectors do not share a
 * stimulus); and RP's counting convention for abs (direct work only — a
 * squat does not book ab sets) is the Core rule.
 *
 * Seven groups pass through unchanged; Shoulders, Back and Core are judged
 * on their parts:
 */
export type JudgementMuscle =
  | "Chest"
  | "FrontDelts"
  | "SideDelts"
  | "RearDelts"
  | "Lats"
  | "UpperBack"
  | "LowerBack"
  | "Biceps"
  | "Triceps"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Calves"
  | "Abs";

export const JUDGEMENT_MUSCLE_ORDER: JudgementMuscle[] = [
  "Chest",
  "FrontDelts",
  "SideDelts",
  "RearDelts",
  "Triceps",
  "Lats",
  "UpperBack",
  "LowerBack",
  "Biceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Abs",
];

/** Display names for the judgement groups: the lift plan's volume card
 *  and Analytics' sets per muscle name them alike. */
export const JUDGEMENT_MUSCLE_LABEL: Record<JudgementMuscle, string> = {
  Chest: "Chest",
  FrontDelts: "Front delts",
  SideDelts: "Side delts",
  RearDelts: "Rear delts",
  Lats: "Lats",
  UpperBack: "Upper back",
  LowerBack: "Lower back",
  Biceps: "Biceps",
  Triceps: "Triceps",
  Quads: "Quads",
  Hamstrings: "Hamstrings",
  Glutes: "Glutes",
  Calves: "Calves",
  Abs: "Abs",
};

/** Which canonical (display) group a judgement group reports under. */
export const JUDGEMENT_TO_CANONICAL: Record<JudgementMuscle, CanonicalMuscle> =
  {
    Chest: "Chest",
    FrontDelts: "Shoulders",
    SideDelts: "Shoulders",
    RearDelts: "Shoulders",
    Lats: "Back",
    UpperBack: "Back",
    LowerBack: "Back",
    Biceps: "Biceps",
    Triceps: "Triceps",
    Quads: "Quads",
    Hamstrings: "Hamstrings",
    Glutes: "Glutes",
    Calves: "Calves",
    Abs: "Core",
  };

/**
 * Fine → judgement, with the exercise's MOVEMENT disambiguating the
 * `*Unspecified` buckets the data cannot resolve:
 *
 *   - `DeltsUnspecified` on a PUSH movement is the anterior head doing the
 *     pressing (Schoenfeld pp.186–187); on a PULL it is the posterior head.
 *     The nine generic "Deltoids" primaries in the DB are all presses, so
 *     this lands them exactly where the citation puts them. Anything
 *     neither pushing nor pulling defaults to SideDelts — the only head
 *     trained by the isolation movements that carry generic labels.
 *   - `BackUnspecified` follows the movement the same way: vertical pulls
 *     are lat work, horizontal pulls mid-back, hinges erectors.
 *   - `RotatorCuff` judges with RearDelts: its two DB occurrences are
 *     external-rotation prehab counted with the rear-delt pool it trains
 *     alongside.
 *   - `Traps` judge as UpperBack (the shrug/row pool), `Obliques` and
 *     `CoreUnspecified` as Abs — one direct-core group.
 */
export function fineToJudgement(
  fine: FineMuscle | null,
  movementCategory?: string
): JudgementMuscle | null {
  if (!fine) return null;
  switch (fine) {
    case "UpperChest":
    case "LowerChest":
    case "ChestUnspecified":
      return "Chest";
    case "FrontDelts":
      return "FrontDelts";
    case "SideDelts":
      return "SideDelts";
    case "RearDelts":
    case "RotatorCuff":
      return "RearDelts";
    case "DeltsUnspecified":
      if (
        movementCategory === "horizontal_push" ||
        movementCategory === "vertical_push"
      ) {
        return "FrontDelts";
      }
      if (
        movementCategory === "horizontal_pull" ||
        movementCategory === "vertical_pull"
      ) {
        return "RearDelts";
      }
      return "SideDelts";
    case "Lats":
      return "Lats";
    case "UpperBack":
    case "Traps":
      return "UpperBack";
    case "LowerBack":
      return "LowerBack";
    case "BackUnspecified":
      if (movementCategory === "vertical_pull") return "Lats";
      if (movementCategory === "hip_dominant") return "LowerBack";
      return "UpperBack";
    case "Biceps":
      return "Biceps";
    case "Triceps":
      return "Triceps";
    case "Quads":
      return "Quads";
    case "Hamstrings":
    case "PosteriorChainUnspecified":
      return "Hamstrings";
    case "Glutes":
    case "Adductors":
      return "Glutes";
    case "Gastrocnemius":
    case "Soleus":
      return "Calves";
    case "Abs":
    case "Obliques":
    case "CoreUnspecified":
      return "Abs";
    case "Forearms":
    case "HipFlexors":
      return null;
  }
}

export interface VolumeLandmark {
  /**
   * Maintenance volume — the least that RETAINS the muscle. Below it the
   * muscle is being lost, which is a different failure from "not growing" and
   * the reason 13a added it.
   *
   * Without MV, "redistribute volume" is unimplementable: specialisation works
   * by dropping non-target muscles to MV, *not* to MEV. RP Ch7 P155 — "an
   * advanced lifter might have a weekly back MEV of 10 sets, but a weekly back
   * MV of four … that difference grows across the adaptive window." Park a
   * deprioritised muscle between the two and you get "more fatigue than four
   * sets by a long shot, but no additional benefit" (Ch8 P30 / Ch7 P159).
   */
  mv: number;
  /** Below this = under-dosed (under MEV). */
  low: number;
  /** Above this = high (approaching MRV). */
  high: number;
}

/**
 * Goal-driven weekly set landmarks per muscle (simplified RP MV–MEV–MAV bands).
 * `primaryGoal` is the training intent. Hypertrophy carries the highest target,
 * and Lose fat trains as Build muscle (Lift4 (4)): the cut is in the
 * nutrition targets. Strength is lower-volume/higher-intensity; running
 * leans lower.
 *
 * ── Where the MV numbers come from ───────────────────────────────────────
 *
 * The corpus gives two worked MV↔MEV pairs and no table: back MEV 10 / MV 4
 * (Ch7 P155, 0.40) and the hypocaloric example's MV/MEV/MRV 2/4/7 (Ch7
 * P147–149, 0.50). So MV sits at roughly 0.4–0.5 of MEV, and the values below
 * are each written out rather than computed so they can be argued with
 * individually. `volumeModel.test.ts` pins the ratio inside that range, which
 * is the part the sources actually support.
 *
 * They scale with the goal because `low` does. In the sources MV is a property
 * of the muscle and the athlete, not of what you are training for — but our
 * `low` is a goal-scaled proxy for a per-muscle MEV we do not have, so an
 * MV that did NOT scale with it would sit at a different fraction of the band
 * for every goal and the ladder would stop meaning the same thing. Per-muscle
 * landmarks (§3.8's displaceable priors) are the real fix, and they need the
 * response data 13b is waiting on.
 */
export function volumeLandmark(
  primaryGoal: string | undefined
): VolumeLandmark {
  switch (primaryGoal) {
    case "hypertrophy":
    case "fat_loss":
      return { mv: 5, low: 12, high: 20 };
    case "strength":
      return { mv: 4, low: 8, high: 14 };
    case "running":
      return { mv: 3, low: 6, high: 14 };
    case "general":
    default:
      return { mv: 4, low: 8, high: 16 };
  }
}

/**
 * The four-band ladder, MV included.
 *
 * `junk` is RP's term and it is the DEFAULT reading of the MV–MEV band: enough
 * work to cost recovery, not enough to grow. The one legitimate occupant of
 * that band is a muscle deliberately parked at MV during a specialisation
 * block — and telling those two apart needs a per-muscle priority the model
 * has no input for yet, so a caller that has one must override rather than
 * trust the label.
 *
 * `high` is a separate failure, not more junk: above the ceiling the volume is
 * unrecoverable rather than merely unproductive.
 */
export type VolumeDose = "below_maintenance" | "junk" | "optimal" | "high";

export function classifyVolumeDose(
  sets: number,
  landmark: VolumeLandmark
): VolumeDose {
  if (sets < landmark.mv) return "below_maintenance";
  if (sets < landmark.low) return "junk";
  if (sets > landmark.high) return "high";
  return "optimal";
}

export type VolumeStatus = "low" | "optimal" | "high";

/**
 * The three-band view every existing consumer reads. Derived from the ladder
 * above rather than reimplementing the comparisons, so the two cannot disagree
 * about where a boundary sits — the sub-MEV bands both fold back to `low`,
 * which is exactly what they were before MV existed.
 */
export function classifyVolume(
  sets: number,
  landmark: VolumeLandmark
): VolumeStatus {
  const dose = classifyVolumeDose(sets, landmark);
  return dose === "below_maintenance" || dose === "junk" ? "low" : dose;
}

/**
 * Per-exercise judgement credits — the strongest-relationship rule at the
 * judgement layer, plus the one sourced counting exception:
 *
 * SECONDARY credit into Abs is dropped unless the exercise IS core work
 * (primary judges as Abs). The DB lists "Core" as a secondary on 38
 * compounds — squats, deadlifts, presses, pull-ups — and RP's counting
 * convention is explicit that stabilisation is not ab-training volume: ab
 * volume is DIRECT ab work. Counting it made canonical Core read 22–39
 * weekly "sets" on plans containing two crunch slots, which is how the
 * 2026-08-03 flip measurement found it. This is applying the sources'
 * counting rule, not inventing an exchange rate (same class as the Cardio
 * exclusion above it).
 */
/**
 * What the judgement tally reads of a day: whether it was skipped, and
 * each exercise's id, movement and set count. A programme `WorkoutDay` is
 * one; so is a performed session mapped to this shape, which is how
 * Analytics judges the sets a user actually did against the same bands
 * the programme plans to (`performedVolume.ts`).
 */
export interface VolumeDay {
  skipped?: boolean;
  exercises: readonly Pick<
    ProgramExercise,
    "exerciseId" | "movementCategory" | "sets"
  >[];
}

function judgementCreditsFor(
  ex: Pick<ProgramExercise, "exerciseId" | "movementCategory">
): Map<JudgementMuscle, number> | null {
  const credits = new Map<JudgementMuscle, number>();
  const dbEx: Exercise | undefined = getExerciseById(ex.exerciseId);
  if (!dbEx) {
    const fine = CATEGORY_TO_FINE[ex.movementCategory] ?? null;
    const jm = fineToJudgement(fine, ex.movementCategory);
    if (jm) credits.set(jm, 1);
    return credits;
  }
  if (dbEx.category === "Cardio") return null;

  const primary = fineToJudgement(
    toFine(dbEx.muscleGroup),
    ex.movementCategory
  );
  if (primary) credits.set(primary, 1);
  for (const sec of dbEx.secondaryMuscles ?? []) {
    const jm = fineToJudgement(toFine(sec), ex.movementCategory);
    if (!jm) continue;
    if (jm === "Abs" && primary !== "Abs") continue; // direct-work counting
    if (!credits.has(jm)) credits.set(jm, SECONDARY_SET_WEIGHT);
  }
  return credits;
}

/** The judgement group an exercise's sets count 1.0 toward, or null when
 *  unattributable (cardio/whole-body). */
export function primaryJudgementForExercise(
  ex: Pick<ProgramExercise, "exerciseId" | "movementCategory">
): JudgementMuscle | null {
  const dbEx: Exercise | undefined = getExerciseById(ex.exerciseId);
  if (!dbEx) {
    return fineToJudgement(
      CATEGORY_TO_FINE[ex.movementCategory] ?? null,
      ex.movementCategory
    );
  }
  if (dbEx.category === "Cardio") return null;
  return fineToJudgement(toFine(dbEx.muscleGroup), ex.movementCategory);
}

/** Weekly sets per JUDGEMENT group — the tally classification runs on. */
export function weeklyVolumeByJudgementMuscle(
  workouts: readonly VolumeDay[]
): Array<{ muscle: JudgementMuscle; sets: number }> {
  const tally = new Map<JudgementMuscle, number>();
  for (const day of workouts) {
    if (day.skipped) continue;
    for (const ex of day.exercises) {
      const sets = ex.sets ?? 0;
      if (sets <= 0) continue;
      const credits = judgementCreditsFor(ex);
      if (!credits) continue;
      for (const [muscle, weight] of credits) {
        tally.set(muscle, (tally.get(muscle) ?? 0) + sets * weight);
      }
    }
  }
  return JUDGEMENT_MUSCLE_ORDER.filter((m) => (tally.get(m) ?? 0) > 0).map(
    (m) => ({ muscle: m, sets: Math.round((tally.get(m) ?? 0) * 2) / 2 })
  );
}

/**
 * Hypertrophy-anchor bands for the judgement groups the canonical ten could
 * not price. The split groups' numbers are DECLARED PRIORS anchored to RP's
 * published per-muscle landmark table; the remaining kept groups delegate to
 * `volumeLandmark` so their numbers stay checkable against Schoenfeld
 * pp.183–184 exactly as before.
 *
 *   FrontDelts {0, 0, 22} — pressing is front-delt training (Schoenfeld
 *     pp.186–187), so there is no direct-work floor at all: low = 0 means
 *     this group can never read under-dosed, only over. RP's table carries
 *     MV 0 / MEV 0 for anyone with pressing volume.
 *   SideDelts {0, 8, 26} — grows only from direct work; RP MEV 8, MRV 25+.
 *   RearDelts {0, 6, 26} — pulls contribute; RP MEV 6 with pulling volume.
 *   Lats / UpperBack {4, 8, 18} each — a region split of RP's whole-back
 *     10/25; the halves are priors, the whole stays comparable.
 *   LowerBack {0, 2, 10} — the erectors are isometrically loaded by every
 *     hinge and squat; direct extension work is small and fatigue-expensive,
 *     so the ceiling is deliberately low.
 *   Abs {0, 4, 16} — direct work only (see judgementCreditsFor); RP MEV in
 *     the 0–6 band for lifters doing compounds, MRV well above the ceiling
 *     any generated plan authors.
 *   Calves {6, 8, 20} — direct work only (no secondary credit exists); RP
 *     MV ~6 / MEV 8 / MRV ~20. The generic low of 12 over-flagged every
 *     real calf prescription.
 *
 * Goal scaling mirrors `volumeLandmark`'s own shape: each goal's bands are
 * the hypertrophy anchor scaled by that goal's generic-band ratios, so the
 * two ladders cannot drift apart in spirit. mv of 0 stays 0 at every goal.
 */
const JUDGEMENT_HYPERTROPHY_BANDS: Partial<
  Record<JudgementMuscle, VolumeLandmark>
> = {
  // PRESS-INCLUSIVE, because the tally counts presses toward this head
  // (Schoenfeld pp.186–187). A band authored from RP's direct-raise table
  // (MRV ~14) against a press-counting tally would repeat the exact
  // currency mismatch this layer exists to end — measured: normal 5-6 day
  // pressing weeks tally 15–17 front-delt sets and are not overtraining.
  // 22 ≈ the chest ceiling plus overhead work, the realistic press budget.
  FrontDelts: { mv: 0, low: 0, high: 22 },
  SideDelts: { mv: 0, low: 8, high: 26 },
  RearDelts: { mv: 0, low: 6, high: 26 },
  Lats: { mv: 4, low: 8, high: 18 },
  UpperBack: { mv: 4, low: 8, high: 18 },
  LowerBack: { mv: 0, low: 2, high: 10 },
  Abs: { mv: 0, low: 4, high: 16 },
  // HINGE-INCLUSIVE for the same reason: every squat, deadlift and RDL
  // credits the glutes, which is why RP's glute MRV sits at 25+ — they are
  // trained by everything. The generic ceiling of 20 read normal leg weeks
  // as violations (55/75 configs at 1:1).
  Glutes: { mv: 3, low: 10, high: 25 },
  // DIRECT-ONLY, the opposite condition from the two press/hinge-inclusive
  // entries: nothing in the catalogue credits calves secondarily, so this
  // tally is pure raise work. The generic low of 12 prices a big
  // compound-fed group; RP's calf table sits at MV ~6 / MEV 8 / MRV ~20,
  // and against the generic band the 2026-08-03 coach-read audit showed
  // every hypertrophy plan's real 8–10 direct calf sets flagged sub-MEV.
  // Per-muscle pricing, not a discount.
  Calves: { mv: 6, low: 8, high: 20 },
};

export function judgementLandmark(
  primaryGoal: string | undefined,
  muscle: JudgementMuscle,
  /** The lifter's level: a beginner's bands are the lower tier. */
  experience?: string
): VolumeLandmark {
  const scale = (n: number, num: number, den: number) =>
    n === 0 ? 0 : Math.max(1, Math.round((n * num) / den));
  const tier = (band: VolumeLandmark): VolumeLandmark =>
    experience === "beginner"
      ? {
          mv: scale(band.mv, BEGINNER_TIER.num, BEGINNER_TIER.den),
          low: scale(band.low, BEGINNER_TIER.num, BEGINNER_TIER.den),
          high: scale(band.high, BEGINNER_TIER.num, BEGINNER_TIER.den),
        }
      : band;
  const generic = volumeLandmark(primaryGoal);
  const anchor = JUDGEMENT_HYPERTROPHY_BANDS[muscle];
  if (!anchor) return tier(generic); // the kept groups (Chest, Triceps, Biceps, Quads, Hamstrings)
  const hyp = volumeLandmark("hypertrophy");
  return tier({
    mv: scale(anchor.mv, generic.mv, hyp.mv),
    low: scale(anchor.low, generic.low, hyp.low),
    high: scale(anchor.high, generic.high, hyp.high),
  });
}

/**
 * The weekly bands come in two tiers (Lift4 (5)): a beginner's are two
 * thirds of everyone else's. A beginner grows on less, and the grill's
 * weekly figures by level (8 sets against 12 for Build muscle, 8 against 10
 * for Get stronger) put the beginner near two thirds of the intermediate.
 * Time decides a plan's volume; these are only its ceiling.
 */
const BEGINNER_TIER = { num: 2, den: 3 };

/**
 * Working sets one session may hold; a long one a few more (`sessionFit.ts`,
 * which sizes a day to it as well as to its minutes).
 *
 * At roughly 2.5–3 minutes per working set including rest, 18 sets is an hour
 * of work plus warm-up — the session length both Helms and Meadows treat as
 * the practical ceiling, and past which the last exercises are performed
 * tired rather than well.
 */
export const MAX_SETS_PER_SESSION = 18;
