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
  /** Set only on a SETTLED record: the moment the transaction returned.
   *  The bridge's age cap is measured from this, never from `queuedAt`.
   *  A tap that waited two minutes in the queue on a weak connection
   *  commits already older than the cap, so ageing from the tap retired
   *  its bridge entry on the very next snapshot — one that predates the
   *  commit and carries no receipt for it. The total then fell by a
   *  whole drink until the receipt-bearing snapshot landed, on exactly
   *  the connection the bridge exists to cover. */
  committedAt?: number;
}
export interface WaterReceipt {
  delta: number;
  undone?: boolean;
  rejected?: boolean;
  /** When the tap happened, ms. Taken from the action's own `queuedAt`,
   *  so the optimistic pass and the transaction write the same value and
   *  re-applying is still a no-op. Receipts written before this field
   *  existed have none — `drinksFromReceipts` sorts those to the bottom
   *  and the sheet shows them without a time rather than dropping them. */
  at?: number;
}

/** One drink in the day's log: a receipt that added water and still
 *  stands. */
export interface WaterDrink {
  id: string;
  ml: number;
  at?: number;
}

/**
 * The day's drinks, newest first.
 *
 * A receipt is a drink when it ADDED water and has not been taken back.
 * Undo receipts are negative and carry the correction, so they are not
 * drinks themselves; the entry they reverse is marked `undone` by
 * `applyWaterAction` and drops out here. `rejected` is an undo that
 * could not apply (it would have taken the day below zero) and is
 * bookkeeping, not a drink.
 *
 * A raw negative delta — the full-width card's minus, which is the only
 * caller that still sends one — reduces the total without marking any
 * receipt undone, so after one the listed drinks sum higher than the
 * total. The compact tile no longer has that path (its removals all go
 * through `undoOf`), and the sheet shows the total from the document
 * rather than from this list, so the number a user reads stays right.
 */
export function drinksFromReceipts(
  receipts: Record<string, WaterReceipt>
): WaterDrink[] {
  return Object.entries(receipts ?? {})
    .filter(
      ([, receipt]) =>
        receipt &&
        Number.isFinite(receipt.delta) &&
        receipt.delta > 0 &&
        !receipt.undone &&
        !receipt.rejected
    )
    .map(([id, receipt]) => ({ id, ml: receipt.delta, at: receipt.at }))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
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
 * against any snapshot carrying it. It ages from `committedAt` — see
 * that field for why the tap time is the wrong clock.
 *
 * Call this only once the snapshot carrying `receipts` has been
 * committed to the state the card renders from. Dropping an entry
 * before its replacement lands leaves a render with neither, which is
 * the flash this whole mechanism exists to prevent.
 */
export function retireSettled(
  uid: string,
  receipts: Record<string, WaterReceipt>
): void {
  const now = Date.now();
  for (const uidKey of keysWithPrefix(settledPrefix(uid))) {
    const a = readJson<WaterAction | null>(uidKey, null);
    const since = a?.committedAt ?? a?.queuedAt ?? 0;
    if (!a || receipts[a.id] || now - since >= 60_000) remove(uidKey);
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
  nextReceipts = {
    ...nextReceipts,
    [action.id]: { delta: next - ml, at: action.queuedAt },
  };
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
        writeJson(`${settledPrefix(uid)}${action.id}`, {
          ...action,
          committedAt: Date.now(),
        });
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
