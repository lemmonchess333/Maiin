import {
  doc,
  runTransaction,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { lbToKg } from "@/lib/weightUnits";
import { localDateString } from "@/lib/dateHelpers";
import {
  weighInProfilePatch,
  type WeighInProfileInputs,
} from "@/lib/bodyweightLogs";
import { readString, writeString, remove, scopedKey } from "@/lib/localStore";

export function parseWeightEntry(
  value: string,
  unit: "kg" | "lbs"
): number | null {
  if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return null;
  const amount = Number(value.trim().replace(",", "."));
  const kg = unit === "lbs" ? lbToKg(amount) : amount;
  return Number.isFinite(kg) && kg >= 20 && kg <= 350 ? kg : null;
}
export function validWeightDate(date: string, today = localDateString()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return false;
  const d = new Date(`${date}T12:00:00`);
  return Number.isFinite(d.getTime()) && localDateString(d) === date;
}
interface WeightReceipt {
  before: Record<string, unknown> | null;
  profileBefore: Record<string, unknown>;
  mirror: Record<string, number> | null;
  targetCalories: number | null;
  goal: string | null;
}
/** The retry receipt is bounded: retain the previous row, without nesting
 * its own receipt. An uncertain response can then recover the original undo. */
export async function saveWeightEntry(uid: string, date: string, kg: number, queuedId?: string) {
  if (!validWeightDate(date) || !Number.isFinite(kg) || kg < 20 || kg > 350)
    throw new Error("Check the weight and date.");
  const key = scopedKey(`tropos-weight-retry:${date}:${kg}`, uid);
  const editId = queuedId ?? readString(key) ?? crypto.randomUUID();
  if (!writeString(key, editId))
    throw new Error(
      "Couldn't keep this entry for retry. Check device storage."
    );
  const ref = doc(db, "users", uid, "bodyweightLogs", date);
  const profileRef = doc(db, "users", uid);
  const receipt = await runTransaction(db, async (tx) => {
    if (auth.currentUser?.uid !== uid)
      throw new Error("Sign in again before logging weight.");
    const [row, profile] = await Promise.all([tx.get(ref), tx.get(profileRef)]);
    if (row.data()?.editId === editId)
      return row.data()!.editReceipt as WeightReceipt;
    const before = row.exists() ? { ...row.data() } : null;
    if (before) delete before.editReceipt;
    const current = profile.data() ?? {};
    const patch =
      date === localDateString() && profile.exists()
        ? weighInProfilePatch(current as WeighInProfileInputs, kg)
        : null;
    const mirror = patch ? { ...patch } : null;
    const profileBefore = Object.fromEntries(
      Object.keys(mirror ?? {}).map((k) => [k, current[k] ?? null])
    );
    const editReceipt: WeightReceipt = {
      before,
      profileBefore,
      mirror,
      targetCalories: current.targetCalories ?? null,
      goal: current.program?.goal ?? null,
    };
    tx.set(ref, {
      ...before,
      date,
      weight: kg,
      source: "manual",
      editId,
      editReceipt,
      updatedAt: serverTimestamp(),
    });
    if (mirror) tx.update(profileRef, mirror);
    return editReceipt;
  });
  if (!receipt)
    throw new Error("This entry has changed. Review your weight history.");
  if (!remove(key))
    throw new Error("Weight saved. Free device storage before retrying.");
  return () => restoreWeightEntry(uid, date, kg, editId, receipt);
}

/** A queued Undo recovers the original receipt after reload. A newer edit
 * is preserved; replaying an already-landed Undo is harmless. */
export async function restoreWeightEntry(uid: string, date: string, kg: number, editId: string, expectedReceipt?: WeightReceipt) {
  const ref = doc(db, "users", uid, "bodyweightLogs", date);
  const profileRef = doc(db, "users", uid);
  await runTransaction(db, async (tx) => {
      if (auth.currentUser?.uid !== uid)
        throw new Error("Sign in again before undoing.");
      const [row, profile] = await Promise.all([
        tx.get(ref),
        tx.get(profileRef),
      ]);
      if (
        row.data()?.editId !== editId ||
        row.data()?.weight !== kg ||
        row.data()?.source !== "manual"
      ) {
        if (!expectedReceipt) return;
        throw new Error("A newer weight is saved. Open your history to correct it.");
      }
      const receipt = expectedReceipt ?? row.data()?.editReceipt as WeightReceipt | undefined;
      if (!receipt) throw new Error("The previous weight could not be recovered.");
      if (receipt.before) tx.set(ref, receipt.before);
      else tx.delete(ref);
      const current = profile.data() ?? {};
      if (
        receipt.mirror &&
        Object.entries(receipt.mirror).every(([k, v]) => current[k] === v)
      ) {
        const restore: Record<string, unknown> = {};
        for (const k of Object.keys(receipt.mirror))
          restore[k] = receipt.profileBefore[k] ?? deleteField();
        // If nutrition settings changed, restore the anchor but recompute its
        // dependent macros using today's settings rather than an old split.
        if (
          (current.targetCalories ?? null) !== receipt.targetCalories ||
          (current.program?.goal ?? null) !== receipt.goal
        ) {
          for (const k of ["targetProtein", "targetCarbs", "targetFat"])
            delete restore[k];
          if (typeof receipt.profileBefore.weightKg === "number")
            Object.assign(
              restore,
              weighInProfilePatch(
                current as WeighInProfileInputs,
                receipt.profileBefore.weightKg
              )
            );
        }
        tx.update(profileRef, restore);
      }
    });
}
