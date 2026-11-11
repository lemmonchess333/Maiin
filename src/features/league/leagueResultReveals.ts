import { readJson, scopedKey, writeJson } from "@/lib/localStore";

/**
 * Which league results this device has revealed (Soc15 call 3): the weeks,
 * by their Monday's key. Per account, as every per-account key on the
 * device is (`scopedKey`).
 *
 * On the device rather than on the result, as the medal reveal keeps its
 * own (medalReveals.ts): the result is server-written and no client writes
 * it, and a second phone replaying one week's result once is the whole
 * cost. The reveal's window (RESULT_REVEAL_DAYS) bounds even that.
 */
const keyFor = (uid: string) => scopedKey("leagueReveals", uid);
/** A year of Mondays; the oldest go first. */
const KEEP = 52;
const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function revealedLeagueWeeks(uid: string): string[] {
  const stored = readJson<unknown>(keyFor(uid), []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (w): w is string => typeof w === "string" && WEEK_KEY.test(w)
  );
}

/** Record that this week's result has been revealed here. */
export function markLeagueResultRevealed(uid: string, weekKey: string): void {
  const rest = revealedLeagueWeeks(uid).filter((w) => w !== weekKey);
  writeJson(keyFor(uid), [...rest.slice(-(KEEP - 1)), weekKey]);
}
