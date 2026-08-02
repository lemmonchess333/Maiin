"use strict";

/**
 * Server mirror of the "easing back in" progression hold.
 *
 * WHY THIS EXISTS. `logExercise`'s server reducer had two branches — progress,
 * or don't-progress-because-the-user-turned-autoProgression-off — while the
 * client had THREE. The missing one is Blk2's hold: an "easing" block holds
 * load for its first two weeks so a returning lifter's numbers cannot go
 * backwards while they find their feet, and a miss in that window cannot be
 * read as a stall. Migrating `logExercise` to the boundary without this would
 * have progressed a returning lifter through the exact window designed to hold
 * them — a silent regression, since both paths write a plausible-looking
 * exercise and nothing downstream would flag it.
 *
 * WHAT THE CLIENT SUPPLIES, AND WHY ONLY THAT. The block itself
 * (`state.trainingBlock`) is already on programState, so the server holds the
 * policy inputs. The one thing it cannot derive is what day it is *for this
 * user*: programState carries no timezone, and CLAUDE.md's standing rule
 * forbids mixing local-date and UTC in one calculation. So the command carries
 * `today` as a plain YYYY-MM-DD local date string and the server does
 * everything else. The client asserts a date; it does not get to assert
 * whether it is held, nor which block week it is in.
 *
 * The precedent is `replaceExercise`'s calibrated weight: the client supplies
 * the fact only it can know, the server keeps the decision.
 *
 * TIMEZONE NOTE. `blockWeekOf` is a DIFFERENCE between two plain date strings
 * (`today` and `block.startDate`). As long as both are parsed the same way the
 * difference is identical in any zone, which is why parsing as UTC here agrees
 * with the client parsing as local. This is not the local/UTC mixing the rule
 * warns about — there is no wall-clock instant involved, only two calendar
 * days.
 *
 * TESTED-COPY RULE: pinned against the client copies
 * (`trainingBlock.ts` blockWeekOf, `represcribe.ts` isProgressionHeld /
 * EASING_HOLD_WEEKS) by `src/features/program/__tests__/progressionHold.cross.test.ts`.
 */

/** Mirror of represcribe.ts EASING_HOLD_WEEKS. */
const EASING_HOLD_WEEKS = 2;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD calendar day. See the timezone note above. */
function dateMs(date) {
  if (typeof date !== "string") return NaN;
  const parts = date.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return NaN;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Mirror of trainingBlock.ts blockWeekOf — 1-based week within the block, or
 * null before it starts / after it ends.
 */
function blockWeekOf(block, today) {
  if (!block || typeof block !== "object") return null;
  const elapsed = dateMs(today) - dateMs(block.startDate);
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const week = Math.floor(elapsed / WEEK_MS) + 1;
  return week > block.durationWeeks ? null : week;
}

/** Mirror of represcribe.ts isProgressionHeld. */
function isProgressionHeld(block, blockWeek) {
  if (!block || block.pace !== "easing") return false;
  return blockWeek !== null && blockWeek <= EASING_HOLD_WEEKS;
}

/** Convenience for the reducer: is this state's block holding load today? */
function holdsProgression(block, today) {
  return isProgressionHeld(block, blockWeekOf(block, today));
}

module.exports = {
  EASING_HOLD_WEEKS,
  blockWeekOf,
  isProgressionHeld,
  holdsProgression,
};
