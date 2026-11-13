/**
 * This morning's answer to "How do you feel today?" (readiness, Q41).
 *
 * Kept on this phone and for this day only: a feeling is a fact about one
 * morning, and nothing about it goes to the server, a post or analytics
 * (the easier session's only trace is `sessionVariant` on the private
 * workout, as before). Tomorrow the question is asked afresh.
 *
 * Storage can be missing or throw (private mode, a full disk); then the
 * answer lasts as long as the page and the card asks again next visit.
 */
import { readJson, scopedKey, writeJson, remove } from "./localStore";
import type { Feel } from "./readiness";

export const READINESS_FEEL_KEY = "tropos-readiness-feel";

interface Stored {
  dayKey: string;
  feel: Feel;
}

const FEELS: readonly Feel[] = ["good", "tired", "rough"];

/** Today's answer for this account, or null when not answered today. */
export function readFeel(uid: string, dayKey: string): Feel | null {
  const stored = readJson<Partial<Stored> | null>(
    scopedKey(READINESS_FEEL_KEY, uid),
    null
  );
  if (!stored || stored.dayKey !== dayKey) return null;
  return FEELS.includes(stored.feel as Feel) ? (stored.feel as Feel) : null;
}

/** Keep today's answer; null clears it so the card asks again. */
export function writeFeel(uid: string, dayKey: string, feel: Feel | null): void {
  const key = scopedKey(READINESS_FEEL_KEY, uid);
  if (feel === null) {
    remove(key);
    return;
  }
  writeJson(key, { dayKey, feel } satisfies Stored);
}
