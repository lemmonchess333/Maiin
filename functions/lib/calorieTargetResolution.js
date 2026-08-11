/* ─────────────────────────────────────────────
   Which calorie target the SERVER should score adherence against.

   The problem this closes. `computeAdherenceScore` reads
   `profile.targetCalories` — the formula/override value written by the
   goal-weight persist recipe. For a Pro user whose adaptive-TDEE layer has
   engaged, that is NOT the number the app shows them: `useEffectiveTargets`
   replaces it with `adaptiveCapState.lastApplied`, and `profile.targetCalories`
   deliberately never moves (the adaptive estimator reads it as its own formula
   anchor, so writing the learned value back would feed the loop its own
   output).

   The learned value moves at most MAX_WEEKLY_STEP_KCAL (150) per 7-day
   cadence window, and nothing bounds the CUMULATIVE distance — four windows
   is 600 kcal. So a Pro user could eat exactly what the app asked of them and
   be scored against a target it stopped showing them weeks earlier. On a cut
   the calorie tolerance is ±10%, so a 400 kcal gap on a 2200 target scores 64
   instead of 100 — the same shape as the protein drift fixed in #1960, where
   complying with the plan cost adherence.

   Mirror discipline (ADR-0008): this is the RUNNING copy of the precedence in
   src/lib/adaptiveTarget.ts `resolveTargetSource`. The rules are duplicated
   because the two runtimes cannot share a module; the duplication is made
   safe by adaptiveTargetMirror.cross.test.ts, which drives BOTH copies over
   the same matrix and asserts they agree. Change one, change the other, or
   the cross-test fails.

   The one input the server cannot compute the same way is `ready` — the
   client's warmup gate counts days of intake + weigh-in data from Firestore
   reads. The server uses the marker the client's own status helper uses
   (`adaptiveStatus.ts`): a persisted, non-epoch `lastAppliedAt` means a
   learned value has actually been applied at least once. That is not a
   re-derivation of the gate, it is the record that the gate already opened.
   ───────────────────────────────────────────── */

const EPOCH = "1970-01-01T00:00:00.000Z";

/**
 * Precedence, mirroring src/lib/adaptiveTarget.ts resolveTargetSource.
 *
 * @param {object} input
 * @param {boolean} input.isPro
 * @param {boolean} input.ready
 * @param {number} input.formulaTarget
 * @param {number|null} input.learnedApplied
 * @param {boolean} input.isManualOverride
 * @returns {{ source: "formula"|"learned", value: number }}
 */
function resolveTargetSource(input) {
  const { isPro, ready, formulaTarget, learnedApplied, isManualOverride } =
    input;

  // Manual override: the user pinned a number — never override it.
  if (isManualOverride) return { source: "formula", value: formulaTarget };

  // Free users: plain formula.
  if (!isPro) return { source: "formula", value: formulaTarget };

  // Pro/trial but no applied value yet: still the formula.
  if (!ready || learnedApplied == null)
    return { source: "formula", value: formulaTarget };

  return { source: "learned", value: learnedApplied };
}

/**
 * Has a learned target actually been applied to this user?
 *
 * The client persists `adaptiveCapState` only from `applyWeeklyCap`, which
 * runs after the warmup gate clears, so a real (non-epoch) `lastAppliedAt` is
 * the record that the handoff happened. The epoch timestamp is the seed
 * anchor `applyWeeklyCap` uses on first engage and means "never applied".
 */
function hasAppliedLearnedTarget(capState) {
  if (!capState || typeof capState !== "object") return false;
  if (typeof capState.lastApplied !== "number") return false;
  if (!Number.isFinite(capState.lastApplied)) return false;
  const at = capState.lastAppliedAt;
  if (typeof at !== "string" || at === EPOCH) return false;
  return Number.isFinite(Date.parse(at));
}

/**
 * The calorie target to score this user's adherence against.
 *
 * Returns null when the profile carries no usable target at all, which is the
 * value `computeAdherenceScore` already treats as "skip the calorie factor" —
 * so an unknown target drops the factor rather than scoring against a guess.
 *
 * @param {object} userData          the user profile doc's data
 * @param {"free"|"pro"} effectiveTier  from helpers.computeEffectiveTier
 * @returns {{ source: "formula"|"learned", value: number }|null}
 */
function resolveScoringCalorieTarget(userData, effectiveTier) {
  const formulaTarget =
    userData && typeof userData.targetCalories === "number"
      ? userData.targetCalories
      : null;
  if (formulaTarget == null) return null;

  const capState = userData ? userData.adaptiveCapState : null;
  return resolveTargetSource({
    isPro: effectiveTier === "pro",
    ready: hasAppliedLearnedTarget(capState),
    formulaTarget,
    learnedApplied: hasAppliedLearnedTarget(capState)
      ? capState.lastApplied
      : null,
    isManualOverride: !!(userData && userData.customCalorieTarget),
  });
}

module.exports = {
  resolveTargetSource,
  hasAppliedLearnedTarget,
  resolveScoringCalorieTarget,
  EPOCH,
};
