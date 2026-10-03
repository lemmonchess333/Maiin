/**
 * The diary's delete: hide now, undo for a few seconds, then commit.
 *
 * Deleting a meal row hides it and takes its calories out of the day's
 * total straight away, then writes the soft-delete once the undo window
 * closes (`deleteAfterUndoWindow`). Nothing un-hides the row on the way out — the `onSnapshot`
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

/** How long a deleted meal can be put back: the Undo toast's life. */
export const MEAL_UNDO_WINDOW_MS = 3000;

export interface UndoWindowDeps {
  /** Take these meals off the screen and out of the day's total. */
  hide: (mealIds: readonly string[]) => void;
  /** Put them back: the delete was undone. */
  show: (mealIds: readonly string[]) => void;
  /** Write the delete (`commitMealDeletes`). */
  commit: (mealIds: readonly string[]) => void;
}

/**
 * Hide meals now and delete them when the undo window closes. Returns the
 * undo, for the toast's Undo: it cancels the delete and shows the meals
 * again, and does nothing once the delete has started, so a late tap
 * cannot show a meal that is on its way out.
 *
 * The diary has two ways to remove entries, deleting a row and stepping its
 * servings down, and both come here, so they share one window.
 */
export function deleteAfterUndoWindow(
  mealIds: readonly string[],
  deps: UndoWindowDeps,
  windowMs: number = MEAL_UNDO_WINDOW_MS
): () => void {
  deps.hide(mealIds);
  let committed = false;
  const timer = setTimeout(() => {
    committed = true;
    deps.commit(mealIds);
  }, windowMs);
  return () => {
    if (committed) return;
    clearTimeout(timer);
    deps.show(mealIds);
  };
}
