/**
 * Commit the soft-deletes behind the diary's undo window.
 *
 * Deleting a meal row hides it and takes its calories out of the day's
 * total straight away, then writes the soft-delete once the undo window
 * closes. Nothing un-hides the row on the way out — the `onSnapshot`
 * carrying the now-deleted meal is what makes the hide moot — so a write
 * that REJECTS left the row hidden and the day's total short for the rest
 * of the session, with the meal still there on the next load.
 *
 * The rule this owns: every id is attempted, one rejection does not
 * abandon its siblings, and exactly the ids that failed come back. Offline
 * is a different case and deliberately not handled here: the SDK applies
 * the write to its local cache and the promise stays pending until it
 * syncs, so nothing resolves and nothing is restored.
 */
import { logger } from "@/lib/logger";

export interface MealDeleteCommitDeps {
  /** The soft-delete itself. Rejects when the write is refused. */
  deleteMeal: (mealId: string) => Promise<void>;
  /** Put these ids back on screen — they are still in the diary. */
  restore: (mealIds: string[]) => void;
  /** Say the delete did not land, so the user can try it again. */
  report: (foodName: string) => void;
}

export async function commitMealDeletes(
  mealIds: readonly string[],
  foodName: string,
  deps: MealDeleteCommitDeps
): Promise<void> {
  const failed: string[] = [];
  /* Settled, not `Promise.all` — a rejection must not cancel the report on
     the ids that did land, and every id deserves its attempt. */
  await Promise.all(
    mealIds.map(async (id) => {
      try {
        await deps.deleteMeal(id);
      } catch (err) {
        logger.error("[mealDeleteCommit] soft-delete failed", err);
        failed.push(id);
      }
    })
  );
  if (failed.length === 0) return;
  deps.restore(failed);
  deps.report(foodName);
}
