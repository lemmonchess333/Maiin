/**
 * The days a person chose to keep though they run past their session length
 * ("Keep this day" on Train, slice 4), on this device. A notice does not
 * earn a Firestore write, as the ease-week nudge's markers do not; scoped to
 * the account, so another account on the phone starts with none. A day kept
 * on one phone still shows the notice on another, once.
 */
import { readJson, scopedKey, writeJson } from "@/lib/localStore";

const KEPT_PREFIX = "tropos:longDayKept";
/** The most remembered: a day's key changes whenever the day does, so old
 *  keys go stale and the oldest are dropped. */
const MOST_KEPT = 40;

function keptKey(uid: string): string {
  return scopedKey(KEPT_PREFIX, uid);
}

function kept(uid: string): string[] {
  const value = readJson<unknown>(keptKey(uid), []);
  return Array.isArray(value)
    ? value.filter((key): key is string => typeof key === "string")
    : [];
}

export function isLongDayKept(
  uid: string | undefined,
  dayKey: string
): boolean {
  return !!uid && kept(uid).includes(dayKey);
}

export function keepLongDay(uid: string | undefined, dayKey: string): void {
  if (!uid) return;
  const next = [...kept(uid).filter((key) => key !== dayKey), dayKey];
  writeJson(keptKey(uid), next.slice(-MOST_KEPT));
}
