import type { UserProfile } from "@/lib/auth";
import type { ProgramTemplate, TemplateExercise } from "./templates";
import { PROGRAM_TEMPLATES } from "./templates";
import type { WorkoutDay, ProgramExercise } from "./programTypes";
import { EXERCISES } from "@/lib/exercises";
import { findSafeSubstitute } from "./injurySubstitutions";

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
 * their current workouts are swapped — carrying sets / reps / weight / history
 * — without touching the day structure or any safe exercise.
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
export function applyInjuryFiltersToWorkouts(
  workouts: readonly WorkoutDay[],
  injuries: readonly string[]
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

      const safe = findSafeSubstitute(ex.exerciseId, relevant, usedIds);
      if (safe) {
        usedIds.add(safe.id);
        return {
          ...ex, // carry sets / reps / weight / progression / history
          exerciseId: safe.id,
          name: safe.name,
          notes: `Swapped from ${ex.name} (${relevant.join(", ")}): ${safe.rationale}.`,
        };
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
