/**
 * What a lifter's EXPERIENCE changes about the programme they receive.
 *
 * `profile.experience` has been captured, persisted, allow-listed and read by
 * three call sites for a long time, and a 2026-07-28 audit found that none of
 * it reached the user:
 *
 *   - onboarding never asked — `Onboarding.tsx` hardcoded `"intermediate"`
 *     for every user, so `"beginner"` was a value the app could store and
 *     never produce;
 *   - `generateProgram` took no experience argument at all, so a beginner and
 *     an advanced lifter received the same exercises, the same split, the same
 *     sets and the same reps — only the seeded starting WEIGHT differed;
 *   - the `experience` array on every `ProgramTemplate` is provably inert:
 *     no hard-filter bucket has two same-goal templates with different
 *     arrays, so the `+5` it scores can never break a tie. At 3 days / full
 *     gym, an advanced lifter is handed a template named "Full Body
 *     Beginner".
 *
 * This module is the discriminator, kept pure and separate so the engine, the
 * bank and the session UI all answer the question the same way.
 *
 * The operator framing it implements, verbatim: novices get "a more
 * simplified program"; experienced lifters get "access to all this other
 * stuff"; "we don't want super duper complex stuff with all their bells and
 * whistles on for someone as a novice."
 *
 * Note what is deliberately NOT gated: VOLUME. A beginner's week is not
 * shorter or lighter — the sources are consistent that novices respond to
 * ordinary training, and cutting their sets would be a different (and worse)
 * intervention than the one asked for. What experience gates is COMPLEXITY:
 * which movements are chosen, whether the week undulates, and whether
 * advanced technique surfaces at all.
 */
// `Experience` comes from `programTypes` — the module that owns the vocabulary
// (`VALID_EXPERIENCE`) and imports nothing from this feature — NOT from
// `startingLoads`. Taking it from there created a circular dependency that
// `npm run check:cycles` caught in CI and my local tsc/vitest/lint pass did
// not: experienceModel → startingLoads → variationBank → experienceModel.
import type { Experience } from "./programTypes";

export type { Experience };

/**
 * How much technique a movement demands before it is worth prescribing.
 *
 *   simple    — the pattern is the point; a first-timer can be coached into
 *               it from the app's own form content in one session
 *   technical — a real skill acquisition cost: a rack position, a balance
 *               demand, a joint-stress consideration, or a unilateral setup
 *   advanced  — only earns its place once the lifter has a weak point to
 *               target and the base to target it with (Green's job-per-variant
 *               framing, Jenkins's "tools in the arsenal")
 *
 * Two movements were tagged `technical` on the first pass and untagged after
 * measuring: the hip thrust and the overhead extension are setup-heavy, not
 * skill-heavy, and tagging them left a beginner with NO eligible accessory in
 * `hip_dominant` and `arms_triceps` respectively — at which point the gate
 * falls back to keeping what is there and silently does nothing. A tier that
 * empties a category is a mis-tag, not a strict standard.
 *
 * Absent = `simple`. Being the category PRIMARY does not imply simple: a
 * barbell squat is the primary and is genuinely technical, and that is fine
 * — a primary is always allowed, because it is the lift the programme is
 * built around and the one the form content covers most thoroughly. The tier
 * governs which VARIATIONS a lifter is offered instead.
 */
export type MovementComplexity = "simple" | "technical" | "advanced";

const ALLOWED: Record<Experience, ReadonlySet<MovementComplexity>> = {
  beginner: new Set<MovementComplexity>(["simple"]),
  intermediate: new Set<MovementComplexity>(["simple", "technical"]),
  advanced: new Set<MovementComplexity>(["simple", "technical", "advanced"]),
};

/**
 * May this lifter be offered a movement of this complexity?
 *
 * Coerces through `toExperience` rather than indexing `ALLOWED` directly. The
 * direct index threw a TypeError on ANY out-of-vocabulary string — `"novice"`,
 * `"Beginner"`, `""` — and the value reaching here is not guaranteed to be in
 * the vocabulary: the server sanitizer stored `experience` with
 * `cleanString(v, 30)`, i.e. any string at all. That made a casing slip or a
 * legacy value a hard crash of programme generation rather than a silent
 * fallback. The sanitizer is fixed too; this is the defence at the read site.
 */
export function allowsComplexity(
  experience: Experience | undefined,
  complexity: MovementComplexity | undefined
): boolean {
  return ALLOWED[toExperience(experience)].has(complexity ?? "simple");
}

/**
 * Does this lifter's week vary its rep targets day to day (backlog #3, N9's
 * daily undulation)?
 *
 * Not for a novice. Undulation is an intermediate tool — it exists because
 * an intermediate can no longer add load every session, so the stimulus has
 * to be varied instead. A novice CAN add load every session, and giving them
 * a heavy day and a pump day muddies the one signal their programme runs on:
 * did today beat last time? Every source in the review that discusses novice
 * programming says the same thing in different words, and it is also the
 * plainest reading of "we don't want super duper complex stuff with all their
 * bells and whistles on for someone as a novice" — a beginner's three
 * sessions now read the same, which is the point.
 */
export function usesUndulation(experience: Experience | undefined): boolean {
  return (experience ?? "intermediate") !== "beginner";
}

/**
 * Does this lifter see effort/RPE detail in a session?
 *
 * RPE is the canonical example of earned complexity in the presentation
 * policy: it is a genuinely useful tool for someone who can calibrate it, and
 * noise-plus-jargon for someone who cannot. A novice's job is to complete the
 * prescription; asking them to rate proximity to failure asks for a judgement
 * they have no reference for yet.
 */
export function showsRpeByDefault(experience: Experience | undefined): boolean {
  return experience === "advanced";
}

/** Coerce any stored/legacy value to a known level. */
export function toExperience(value: string | undefined): Experience {
  return value === "beginner" ||
    value === "advanced" ||
    value === "intermediate"
    ? value
    : "intermediate";
}

/**
 * Re-point any slot whose movement is above this lifter's level to the
 * simplest allowed option in the SAME movement category.
 *
 * A post-pass rather than a parameter threaded through five builders and
 * forty `makeExercise` calls — the same shape as the overlap caps and the
 * repeat cap, for the same reasons. It composes with them: each pass changes
 * only `exerciseId`/`name`, never a slot's category, position, sets or load.
 *
 * WHAT IT DOES NOT COVER, stated plainly because an earlier version of this
 * comment claimed the opposite and a sweep measured it false:
 *
 *   - INJURY substitutions. `applyInjuryFiltersToWorkouts` runs after this and
 *     is deliberately ungated — safety outranks simplicity, so an injured
 *     novice can receive a technical movement if that is the safe one.
 *   - EQUIPMENT substitutions. `applyEquipmentFilterToWorkouts` also runs
 *     after this and is deliberately ungated, because gating it was measured
 *     to leave users holding equipment they do not own (see that function).
 *   - Anything the exercise BANK cannot supply. When a category has no
 *     level-appropriate option that isn't already in the day, this keeps what
 *     is there. On `home_gym`/`minimal` that is the common case, not the edge
 *     case, and it is a bank-coverage problem rather than a gate bug.
 *
 * So the honest guarantee is narrow: on the paths this runs on, and where the
 * bank has an alternative, no slot is above the lifter's level. It is a bias,
 * not an invariant.
 *
 * The category PRIMARY is never re-pointed. It is the lift the programme is
 * built around, the progression anchor, and the one the form content covers
 * most thoroughly — a beginner's squat is a barbell squat.
 */
export function applyComplexityGate<
  E extends {
    exerciseId: string;
    name: string;
    movementCategory: string;
  },
  D extends { exercises: E[] },
>(
  workouts: D[],
  experience: Experience | undefined,
  bank: Record<
    string,
    ReadonlyArray<{
      id: string;
      name: string;
      primary: boolean;
      complexity?: MovementComplexity;
    }>
  >
): D[] {
  if (allowsComplexity(experience, "advanced")) return workouts; // nothing gated
  let changed = false;
  const out = workouts.map((day) => {
    const idsInDay = new Set(day.exercises.map((e) => e.exerciseId));
    const exercises = day.exercises.map((ex) => {
      const options = bank[ex.movementCategory] ?? [];
      const self = options.find((o) => o.id === ex.exerciseId);
      if (!self || self.primary) return ex; // primaries and unknowns stand
      if (allowsComplexity(experience, self.complexity)) return ex;
      const swap = options.find(
        (o) =>
          !o.primary &&
          o.id !== ex.exerciseId &&
          !idsInDay.has(o.id) &&
          allowsComplexity(experience, o.complexity)
      );
      // Nothing simple enough left in the category that isn't already in the
      // day — keep what is there. A slot the lifter can at least attempt
      // beats a hole or a duplicate.
      if (!swap) return ex;
      changed = true;
      idsInDay.delete(ex.exerciseId);
      idsInDay.add(swap.id);
      return { ...ex, exerciseId: swap.id, name: swap.name };
    });
    return { ...day, exercises };
  });
  return changed ? out : workouts;
}
