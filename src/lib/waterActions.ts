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

/**
 * Actions the server has ALREADY accepted, held until the snapshot that
 * proves it arrives.
 *
 * The queue entry has to be dropped the moment the transaction commits,
 * or the flush loop would spin on it forever. But the listener is a
 * separate round-trip: for the 15-20ms between the commit and the
 * snapshot, the card had a fresh server total nowhere to read and no
 * pending action left to add, so it rendered the figure from BEFORE the
 * tap and then jumped forward again. Measured over four taps: three
 * dips, 15/16/18ms, each one the previous value. The fill is a spring,
 * so a dip that short still reads as the whole card flashing.
 *
 * Keeping the action here bridges exactly that gap. Re-applying it is
 * free: `applyWaterAction` returns the state untouched once a receipt
 * for the id exists, so the instant the snapshot lands the overlay
 * becomes a no-op and `retireSettled` drops it.
 */
const settledPrefix = (uid: string) =>
  `${scopedKey("tropos-water-settled", uid)}:`;

/** Committed actions still awaiting their snapshot, oldest first. */
export function settledWater(uid: string): WaterAction[] {
  return keysWithPrefix(settledPrefix(uid))
    .flatMap((uidKey) => {
      const a = readJson<WaterAction | null>(uidKey, null);
      return a && typeof a.id === "string" && Number.isFinite(a.delta)
        ? [a]
        : [];
    })
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

/**
 * Drop settled actions the given receipts now account for. The age cap
 * is a backstop, not the mechanism: a receipt normally arrives within a
 * frame or two, and an entry that outlives one is already a no-op
 * against any snapshot carrying it.
 */
export function retireSettled(
  uid: string,
  receipts: Record<string, WaterReceipt>
): void {
  const now = Date.now();
  for (const uidKey of keysWithPrefix(settledPrefix(uid))) {
    const a = readJson<WaterAction | null>(uidKey, null);
    if (!a || receipts[a.id] || now - a.queuedAt >= 60_000) remove(uidKey);
  }
}

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
        // Committed, but the listener has not said so yet. Best-effort:
        // if storage refuses the entry the total stays correct and only
        // the pre-snapshot frame flashes.
        writeJson(`${settledPrefix(uid)}${action.id}`, action);
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
