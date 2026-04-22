import type { UserProfile } from "@/lib/auth";
import type { ProgramTemplate } from "./templates";
import { EXERCISES } from "@/lib/exercises";

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
  EXERCISES.map((ex) => [ex.name.toLowerCase(), ex.id]),
);

function resolveExerciseId(name: string): string | null {
  return EXERCISE_ID_BY_NAME.get(name.toLowerCase()) ?? null;
}

export function matchTemplate(
  profile: UserProfile,
  templates: ProgramTemplate[],
): MatchTemplateResult {
  const days = profile.daysPerWeek || 4;
  const equip = profile.equipment || "full_gym";
  const split = profile.preferredSplit || "auto";
  const goal = profile.primaryGoal === "running" ? "general" : (profile.primaryGoal || "general");
  const exp = profile.experience || "intermediate";
  const runFreq = profile.runFrequency || "none";

  const scored = templates.map(function (t) {
    let score = 0;

    // Hard filters
    if (t.daysPerWeek !== days) return { template: t, score: -1, goalMatched: false };
    if (t.equipment !== equip) return { template: t, score: -1, goalMatched: false };

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
    .filter(function (s) { return s.score >= 0; })
    .sort(function (a, b) { return b.score - a.score; });

  if (valid.length > 0) {
    const best = valid[0];
    return { template: best.template, isGoalMatch: best.goalMatched };
  }

  // Fallback: first full_body template or first template — caller still
  // sees `isGoalMatch: false` so it can branch on the miss.
  const fallback =
    templates.find(function (t) { return t.split === "full_body"; }) || templates[0];
  return { template: fallback, isGoalMatch: false };
}

export function applyInjuryFilters(
  template: ProgramTemplate,
  injuries: string[],
): ProgramTemplate {
  if (!injuries.length || injuries.includes("none")) return template;

  const filtered = structuredClone(template);

  for (const week of filtered.weeks) {
    for (const day of week.days) {
      day.exercises = day.exercises.map(function (ex) {
        const isContraindicated = ex.contraindicated?.some(function (c) {
          return injuries.includes(c);
        });
        if (isContraindicated && ex.alternatives?.length) {
          const altName = ex.alternatives[0];
          // Resolve against the real EXERCISES database instead of
          // guessing the ID from the name. If the alternative isn't in
          // the DB, leave the exercise untouched with a note — silent
          // rename to a bogus ID is how downstream MET/demo lookups
          // used to break.
          const altId = resolveExerciseId(altName);
          if (!altId) {
            return {
              ...ex,
              notes:
                "Contraindicated for " + injuries.join(", ") +
                " — suggested alternative '" + altName +
                "' is not in the exercise database. Please swap manually.",
            };
          }
          return {
            ...ex,
            name: altName,
            exerciseId: altId,
            notes: "Swapped from " + ex.name + " (" + injuries.join(", ") + " limitation)",
          };
        }
        return ex;
      });
    }
  }

  return filtered;
}
