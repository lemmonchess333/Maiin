import {
  readSessionJson,
  removeSessionKey,
  writeSessionJson,
} from "@/lib/sessionStore";

/**
 * The meal typed into Food's box and not yet logged, kept for the visit so
 * a tab switch does not throw it away. It belongs to the day it was typed
 * on: the page clears the box when the day changes, so text typed for
 * today is never logged against another day, and a kept draft comes back
 * only on that same day.
 */
const KEY = "tropos.food.draft";

interface FoodDraft {
  text: string;
  date: string;
}

function keyFor(uid: string): string {
  return `${KEY}:${uid}`;
}

/** The text kept for `date`, or "". */
export function keptFoodDraft(
  uid: string | null | undefined,
  date: string
): string {
  if (!uid) return "";
  const draft = readSessionJson<Partial<FoodDraft>>(keyFor(uid));
  return draft?.date === date && typeof draft.text === "string"
    ? draft.text
    : "";
}

/** Keep the box's text for `date`; an empty box keeps nothing. */
export function keepFoodDraft(
  uid: string | null | undefined,
  text: string,
  date: string
): void {
  if (!uid) return;
  if (text) writeSessionJson(keyFor(uid), { text, date });
  else removeSessionKey(keyFor(uid));
}
