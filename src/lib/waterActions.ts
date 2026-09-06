import { doc, runTransaction, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  readJson,
  writeJson,
  scopedKey,
  keysWithPrefix,
  remove,
} from "@/lib/localStore";
import { clampMl, resolveConsumedMl } from "@/lib/waterUnits";

export interface WaterAction {
  id: string;
  date: string;
  delta: number;
  targetMl: number;
  undoOf?: string;
  queuedAt: number;
}
export interface WaterReceipt {
  delta: number;
  undone?: boolean;
  rejected?: boolean;
}
export const WATER_CHANGED = "tropos:water-actions";
const queuePrefix = (uid: string) =>
  `${scopedKey("tropos-water-action", uid)}:`;
const notify = () => window.dispatchEvent(new Event(WATER_CHANGED));
const errors = new Map<string, string>();
const running = new Map<string, Promise<void>>();
export function pendingWater(uid: string): WaterAction[] {
  return keysWithPrefix(queuePrefix(uid))
    .flatMap((uidKey) => {
      const a = readJson<WaterAction | null>(uidKey, null);
      return a &&
        typeof a.id === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(a.date) &&
        Number.isFinite(a.delta)
        ? [a]
        : [];
    })
    .sort((a, b) => a.queuedAt - b.queuedAt);
}
export const waterSyncError = (uid: string) => errors.get(uid);

/** Receipts make retries idempotent and undo invert the actual clamped change. */
export function applyWaterAction(
  ml: number,
  receipts: Record<string, WaterReceipt>,
  action: WaterAction
) {
  if (receipts[action.id]) return { ml, receipts };
  let delta = action.delta;
  let nextReceipts = { ...receipts };
  if (action.undoOf) {
    const previous = receipts[action.undoOf];
    if (previous?.undone)
      return { ml, receipts: { ...receipts, [action.id]: { delta: 0 } } };
    if (!previous || ml - previous.delta < 0)
      return {
        ml,
        receipts: { ...receipts, [action.id]: { delta: 0, rejected: true } },
      };
    delta = -previous.delta;
    nextReceipts[action.undoOf] = { ...previous, undone: true };
  }
  const next = clampMl(ml + delta);
  nextReceipts = { ...nextReceipts, [action.id]: { delta: next - ml } };
  return { ml: next, receipts: nextReceipts };
}
export function queueWater(uid: string, action: WaterAction): boolean {
  if (auth.currentUser?.uid !== uid) return false;
  // Separate keys prevent one tab overwriting another tab's accepted taps.
  // Monotonic ordering keeps an undo behind its drink even within one ms.
  action = {
    ...action,
    queuedAt: Math.max(
      Date.now(),
      ...pendingWater(uid).map((a) => a.queuedAt + 1)
    ),
  };
  if (!writeJson(`${queuePrefix(uid)}${action.id}`, action)) return false;
  errors.delete(uid);
  notify();
  void flushWater(uid);
  return true;
}
/** Persistence outlives Home. No accepted tap depends on a debounce timer. */
export function flushWater(uid: string): Promise<void> {
  const existing = running.get(uid);
  if (existing) return existing;
  const task = (async () => {
    errors.delete(uid);
    while (navigator.onLine && auth.currentUser?.uid === uid) {
      const action = pendingWater(uid)[0];
      if (!action) break;
      try {
        const result = await runTransaction(db, async (tx) => {
          if (auth.currentUser?.uid !== uid)
            throw new Error("Sign in again to sync water.");
          const ref = doc(db, "users", uid, "waterLog", action.date);
          const snap = await tx.get(ref);
          const data = snap.data() ?? {};
          const next = applyWaterAction(
            resolveConsumedMl(data),
            data.waterReceipts ?? {},
            action
          );
          tx.set(
            ref,
            {
              ml: next.ml,
              waterReceipts: next.receipts,
              targetMl: action.targetMl,
              updatedAt: Timestamp.now(),
            },
            { merge: true }
          );
          return next;
        });
        // Preserve taps queued while the transaction awaited.
        if (!remove(`${queuePrefix(uid)}${action.id}`))
          throw new Error("Water synced, but local storage needs space.");
        if (result.receipts[action.id]?.rejected) {
          const { toast } = await import("@/lib/toast");
          toast.error(
            "Water changed since that drink. Review the total to correct it."
          );
        }
        notify();
      } catch (error) {
        errors.set(
          uid,
          error instanceof Error ? error.message : "Couldn't sync water."
        );
        notify();
        break;
      }
    }
  })().finally(() => {
    running.delete(uid);
    notify();
  });
  running.set(uid, task);
  return task;
}
