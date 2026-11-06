import { readString, remove, scopedKey, writeString } from "./localStore";

type ReminderKind = "meal" | "workout";

/** A phone's explicit off choice survives a failed account save. Only an
 *  explicit, successfully saved opt-in on this phone removes it. */
export function isReminderLocallyOff(uid: string, kind: ReminderKind): boolean {
  const uidKey = scopedKey(`tropos.reminders.off.${kind}`, uid);
  return readString(uidKey) === "1";
}

export function setReminderLocallyOff(
  uid: string,
  kind: ReminderKind,
  off: boolean
): boolean {
  const uidKey = scopedKey(`tropos.reminders.off.${kind}`, uid);
  return off ? writeString(uidKey, "1") : remove(uidKey);
}
