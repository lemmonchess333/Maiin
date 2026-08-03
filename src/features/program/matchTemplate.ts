import type { UserProfile } from "@/lib/auth";
import type { ProgramTemplate, TemplateExercise } from "./templates";
import { PROGRAM_TEMPLATES } from "./templates";
import type { WorkoutDay, ProgramExercise } from "./programTypes";
import { EXERCISES, getExerciseById } from "@/lib/exercises";
import { findSafeSubstitute } from "./injurySubstitutions";
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

/**
 * Result of a `matchTemplate` call.
 *
 * `isGoalMatch` is true only when the returned template's declared goal
 * equals the user's requested goal. A false value signals that no perfect
 * template existed for the combination of `daysPerWeek + equipment + goal`
 * and the caller should decide whether to (a) use the template anyway,
 * (b) warn the user, or (c) fall back to the procedural engine via
 * `generateProgram()` with `primaryGoal` threaded through. Pre-W1a
 * `matchTemplate` returned the best-available template without any such
 * signal, so e.g. a 4-day strength user silently received a hypertrophy
 * program.
 */
export interface MatchTemplateResult {
  template: ProgramTemplate;
  isGoalMatch: boolean;
}

// Real exercise-ID lookup, built once per module load. Used by
// `applyInjuryFilters` so contraindication alternatives resolve to IDs
// that actually exist in the EXERCISES database rather than string-
// transformed guesses ("Lat Pulldown" → "lat-pulldown") which often
// diverged from reality and left downstream consumers (MET calculator,
// demo links, 1RM estimator) unable to look the exercise up.
const EXERCISE_ID_BY_NAME = new Map<string, string>(
  EXERCISES.map((ex) => [ex.name.toLowerCase(), ex.id])
);

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
  };
}

function resolveExerciseId(name: string): string | null {
  return EXERCISE_ID_BY_NAME.get(name.toLowerCase()) ?? null;
}

export function matchTemplate(
  profile: UserProfile,
  templates: ProgramTemplate[]
): MatchTemplateResult {
  const days = profile.daysPerWeek || 4;
  const equip = profile.equipment || "full_gym";
  const split = profile.preferredSplit || "auto";
  const goal =
    profile.primaryGoal === "running"
      ? "general"
      : profile.primaryGoal || "general";
  const exp = profile.experience || "intermediate";
  const runFreq = profile.runFrequency || "none";

  const scored = templates.map(function (t) {
    let score = 0;

    // Hard filters
    if (t.daysPerWeek !== days)
      return { template: t, score: -1, goalMatched: false };
    if (t.equipment !== equip)
      return { template: t, score: -1, goalMatched: false };

    // Split preference
    if (split !== "auto" && t.split === split) score += 10;

    // Goal match — tracked separately so the caller can detect downgrades
    const goalMatched = t.goal === goal;
    if (goalMatched) score += 10;

    // Experience match
    if (t.experience.includes(exp)) score += 5;

    // Gender removed from matchTemplate scoring in W1a. Gender stays on
    // UserProfile as an identity field (used for biologically meaningful
    // BMR/TDEE math) but no longer silently alters the template a user
    // receives — men and women with the same goal + days + experience get
    // the same program. See `templates.ts` where `gender` array now lists
    // all values to stay compatible with pre-W1a programState docs.

    // Run integration
    if (runFreq === "regular" && t.runIntegration) score += 5;
    if (runFreq === "none" && !t.runIntegration) score += 2;

    return { template: t, score, goalMatched };
  });

  const valid = scored
    .filter(function (s) {
      return s.score >= 0;
    })
    .sort(function (a, b) {
      return b.score - a.score;
    });

  if (valid.length > 0) {
    const best = valid[0];
    return { template: best.template, isGoalMatch: best.goalMatched };
  }

  // Fallback: first full_body template or first template — caller still
  // sees `isGoalMatch: false` so it can branch on the miss.
  const fallback =
    templates.find(function (t) {
      return t.split === "full_body";
    }) || templates[0];
  return { template: fallback, isGoalMatch: false };
}

/**
 * Build the index of which exercise IDs are contraindicated for which
 * injuries, derived from the template data itself. Used by the
 * alternatives-validation pass so we never swap a user OUT of a
 * contraindicated exercise INTO another one that's also
 * contraindicated for them — the Barbell Squat → Leg Press trap for
 * `knee` users.
 */
export function buildContraIndex(
  templates: readonly ProgramTemplate[]
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const t of templates) {
    for (const week of t.weeks) {
      for (const day of week.days) {
        for (const ex of day.exercises) {
          if (ex.contraindicated && ex.contraindicated.length > 0) {
            if (!index.has(ex.exerciseId)) index.set(ex.exerciseId, new Set());
            const set = index.get(ex.exerciseId)!;
            for (const c of ex.contraindicated) set.add(c);
          }
        }
      }
    }
  }
  return index;
}

/**
 * Check whether a template-declared alternative (identified by name)
 * is itself contraindicated for any of the user's injuries, using the
 * per-template contra index. Returns true if the alternative clears
 * every relevant injury.
 */
function altClearsInjuries(
  altName: string,
  injuries: readonly string[],
  contraIndex: Map<string, Set<string>>
): boolean {
  const altId = resolveExerciseId(altName);
  if (!altId) return false;
  const contras = contraIndex.get(altId);
  if (!contras) return true; // no contraindications recorded → assumed safe
  for (const injury of injuries) {
    if (contras.has(injury)) return false;
  }
  return true;
}

/**
 * Swap-or-annotate pass for a single exercise.
 *
 * Strategy (in priority order):
 *   1. If the exercise isn't contraindicated for any of the user's
 *      injuries, return it untouched.
 *   2. Try the global INJURY_SUBSTITUTIONS table — its substitutes are
 *      hand-picked per-injury by PT research, resolve to real exercise
 *      IDs, and explicitly declare `safeFor` coverage.
 *   3. Otherwise iterate the template's own `alternatives` array and
 *      return the first alt that isn't itself contraindicated for any
 *      of the user's injuries (per the contraIndex).
 *   4. If nothing clears, keep the original exercise with a
 *      user-visible note explaining no safe swap was found — the
 *      caller should render this so the user can manually replace
 *      rather than silently training through a contraindication.
 */
function swapContraExercise(
  ex: TemplateExercise,
  injuries: readonly string[],
  contraIndex: Map<string, Set<string>>,
  /**
   * IDs already present on the day being filtered — used so multiple
   * contra exercises on the same day (e.g. Barbell Squat + Leg Press
   * for a knee user) resolve to different substitutes rather than
   * stacking onto the same pick.
   */
  usedIds: ReadonlySet<string>
): TemplateExercise {
  const contras = ex.contraindicated;
  if (!contras || contras.length === 0) return ex;

  // Which of the user's injuries does this exercise flag?
  const relevant = injuries.filter((i) => contras.includes(i));
  if (relevant.length === 0) return ex;

  // (2) Global substitution table — PT-curated safe alternatives.
  const safe = findSafeSubstitute(ex.exerciseId, relevant, usedIds);
  if (safe) {
    return {
      ...ex,
      name: safe.name,
      exerciseId: safe.id,
      notes: `Swapped from ${ex.name} (${relevant.join(", ")}): ${safe.rationale}.`,
    };
  }

  // (3) Template-declared alternatives, validated against the contra
  // index so we can't swap into another contraindicated exercise, and
  // against `usedIds` so we don't pick an alt already on the day.
  if (ex.alternatives && ex.alternatives.length > 0) {
    for (const altName of ex.alternatives) {
      if (!altClearsInjuries(altName, relevant, contraIndex)) continue;
      const altId = resolveExerciseId(altName);
      if (!altId) continue;
      if (usedIds.has(altId)) continue;
      return {
        ...ex,
        name: altName,
        exerciseId: altId,
        notes: `Swapped from ${ex.name} (${relevant.join(", ")} limitation).`,
      };
    }
  }

  // (4) No safe swap found — leave the original in place but flag it so
  // the UI can render a clear warning rather than silently letting the
  // user train a contraindicated pattern. This is the no-alternative
  // case the council reviewer called out (Deadlift / Romanian Deadlift
  // with no alt and lower_back flagged).
  return {
    ...ex,
    notes:
      `No safe substitute found for ${ex.name} given your ${relevant.join(" + ")} ` +
      `limitation. Consider replacing manually or reducing load. ` +
      `If this is a post-surgery or acute injury, skip this exercise until cleared.`,
  };
}

export function applyInjuryFilters(
  template: ProgramTemplate,
  injuries: string[],
  /**
   * Other templates used to build the per-exercise contra index. Callers
   * pass `PROGRAM_TEMPLATES` here (it's the source of truth for which
   * IDs carry which contraindications). Optional — defaults to the
   * template being filtered, which covers the common case where a
   * user's alt is declared within the same template.
   */
  allTemplates?: readonly ProgramTemplate[]
): ProgramTemplate {
  if (!injuries.length || injuries.includes("none")) return template;

  const filtered = structuredClone(template);
  const contraIndex = buildContraIndex(allTemplates ?? [template]);

  for (const week of filtered.weeks) {
    for (const day of week.days) {
      // Seed the day's used-id set with the ids of every exercise that
      // is NOT getting swapped (i.e. the user has no relevant injury
      // for it). This prevents a subsequent swap from landing on one
      // of those — e.g. Bulgarian Split Squat already present on
      // Lower B means Leg Extension's swap should pick Hip Thrust,
      // not stack a second BSS.
      const usedIds = new Set<string>();
      for (const ex of day.exercises) {
        const contras = ex.contraindicated ?? [];
        const isBeingSwapped = contras.some((c) => injuries.includes(c));
        if (!isBeingSwapped) usedIds.add(ex.exerciseId);
      }

      const out: TemplateExercise[] = [];
      for (const ex of day.exercises) {
        const swapped = swapContraExercise(ex, injuries, contraIndex, usedIds);
        const wasSwapped = swapped.exerciseId !== ex.exerciseId;
        // If every safe candidate is already on the day and we fell
        // through to tier 4 (warning), swapped.exerciseId === ex.id
        // — we still append it so the warning surfaces. Only drop
        // when a real swap would produce a duplicate.
        if (wasSwapped && usedIds.has(swapped.exerciseId)) continue;
        usedIds.add(swapped.exerciseId);
        out.push(swapped);
      }
      day.exercises = out;
    }
  }

  return filtered;
}

/**
 * Pgm5 follow-up — injury-aware in-place re-swap for an EXISTING programme.
 *
 * The `WorkoutDay`/`ProgramExercise` sibling of `applyInjuryFilters` (which
 * runs on `ProgramTemplate`s at onboarding). Structure-preserving
 * regeneration (planBuilder) calls this so that when a user changes their
 * injuries in Programme Settings, ONLY the now-contraindicated exercises in
 * their current workouts are swapped. The slot's sets/reps/role survive, but
 * movement-specific load and performance history are recalibrated/reset so a
 * deadlift record can never be relabelled as its substitute.
 *
 * Over-swap guard: an exercise is swapped only when the contra index (built
 * from the template library, keyed by exerciseId) flags it for one of the
 * user's CURRENT injuries. A safe exercise that merely *has* a substitution
 * entry (e.g. a squat for a shoulder-only user) is left untouched. No safe
 * substitute → keep the exercise with a warning note (mirrors tier 4 above).
 *
 * Idempotent (re-running with the same injuries is a no-op); healthy users /
 * "none" → unchanged clone. Removing an injury does NOT restore a previously
 * swapped exercise (no pre-swap id is stored) — safe + acceptable; un-swap is
 * a future enhancement.
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

  const contraIndex = buildContraIndex(PROGRAM_TEMPLATES);

  return workouts.map((day) => {
    // Seed the day's used-ids with every exercise that is NOT being swapped,
    // so a swap can't land on one already present on the day.
    const usedIds = new Set<string>();
    for (const ex of day.exercises) {
      const contras = contraIndex.get(ex.exerciseId);
      const swapping = !!contras && injuries.some((i) => contras.has(i));
      if (!swapping) usedIds.add(ex.exerciseId);
    }

    const exercises: ProgramExercise[] = day.exercises.map((ex) => {
      const contras = contraIndex.get(ex.exerciseId);
      const relevant = contras ? injuries.filter((i) => contras.has(i)) : [];
      if (relevant.length === 0) return { ...ex };

      const allowedEq = equipment
        ? EQUIPMENT_AVAILABILITY[equipment]
        : undefined;
      const safe = findSafeSubstitute(
        ex.exerciseId,
        relevant,
        usedIds,
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
 * alternative that fits. The slot's sets/reps/role survive; the target load is
 * recalibrated and movement-specific history is reset. full_gym (or any
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

  const relevantInjuries = injuries.filter((i) => i !== "none");
  const contraIndex = relevantInjuries.length
    ? buildContraIndex(PROGRAM_TEMPLATES)
    : null;
  const isInjuryContra = (id: string): boolean => {
    const c = contraIndex?.get(id);
    return !!c && relevantInjuries.some((i) => c.has(i));
  };
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
      // Beginner vertical-pull coverage floor: at home/minimal every
      // offerable option is a cable (pulldowns), so nothing survives the
      // equipment check and the ungated fallback below would restore the
      // pull-up. The honest coaching answer at that tier is the inverted
      // row — bodyweight, difficulty scaled by foot position, THE reference
      // novice pull regression. It is a horizontal_pull by category (which
      // is why it cannot live in the vertical_pull pool), so it re-points
      // here the same way the pinned calf fallback does, and the slot's
      // category follows the movement honestly.
      if (
        !pick &&
        ex.movementCategory === "vertical_pull" &&
        toExperience(experience ?? "intermediate") === "beginner" &&
        isAvailable("inverted-row") &&
        !usedIds.has("inverted-row") &&
        !isInjuryContra("inverted-row")
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
