/**
 * Shared active-meal predicate for meal documents.
 *
 * Mirror of `src/lib/mealTotals.ts:isActiveMealDoc`. Deletion in Tropos
 * is SOFT (`deletedAt` + a 24h restore window), so a "deleted" meal is
 * still a document that any raw read hands back. Truthy `deletedAt` =
 * deleted; `null` (the post-restore value) and absent = active.
 *
 * Same consolidation, and the same reason, as
 * `functions/lib/runEligibility.js` next door: the runs sibling was
 * pulled out of `performanceEngine.js` when a third inline copy of the
 * rule appeared. The MEALS rule never got that treatment, so the PI's
 * adherence pass — `avgDailyCalories`, `avgDailyProtein`,
 * `mealDaysLogged` — counted soft-deleted meals. A user correcting a
 * mis-scanned meal was scored on the intake they had already retracted.
 *
 * `functions/` is plain CommonJS so we can't import the TS module
 * directly. Kept in lockstep by `mealActiveDoc.cross.test.js`, which
 * drives BOTH copies over the same fixtures — including the `null`
 * restore value, which is the case a naive `"deletedAt" in doc` or a
 * bare truthiness flip on the client would get wrong in opposite
 * directions.
 */

function isActiveMealDoc(data) {
  return !(data && data.deletedAt);
}

module.exports = { isActiveMealDoc };
