import type { WordFilter } from "@/lib/wordFilter";
import { LAUNCH_TEMPLATES, type GoalSpace } from "./goalSpaceTypes";

/**
 * A Circle's name as the app shows it.
 *
 * `createGoalSpace` refuses a name the word filter refuses, but only from
 * the day each word joined the filter: a Circle named before then keeps
 * its name in Firestore, and members read the document directly. A name
 * that fails the filter today is shown as the Circle's kind instead
 * ("Strength Block"), so a word added to the list later reaches the names
 * saved before it.
 *
 * The caller passes the filter (`useWordFilter`), so its word lists load
 * with the first Circle drawn rather than with every screen that can draw
 * one. Until it has, the kind stands in too: no name is shown the filter
 * has not seen. The Circle lists wait for the filter before they draw, so
 * that is a guard rather than something a person sees.
 *
 * Every place a Circle's name is drawn goes through here; the source pin
 * in `circleTitle.test.ts` fails on a `space.title` read anywhere else.
 */
export function circleTitle(
  space: Pick<GoalSpace, "title" | "type">,
  wordFilter: WordFilter | null
): string {
  if (wordFilter && !wordFilter.containsProfanity(space.title))
    return space.title;
  return LAUNCH_TEMPLATES.find((t) => t.type === space.type)?.label ?? "Circle";
}
