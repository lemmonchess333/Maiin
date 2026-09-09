import { auth } from "@/lib/firebase";
import { readJson, writeJson, scopedKey } from "@/lib/localStore";
import {
  saveWeightEntry,
  restoreWeightEntry,
  validWeightDate,
} from "@/lib/weightEntry";
import { logger } from "@/lib/logger";

export type WeightAction = {
  id: string;
  date: string;
  kg: number;
  undoOf?: string;
};
const key = (uid: string) => scopedKey("tropos-weight-queue", uid);
export const pendingWeights = (uid: string) =>
  readJson<WeightAction[]>(key(uid), []);
const errors = new Set<string>();
export const weightSyncFailed = (uid: string) => errors.has(uid);
const notify = () => window.dispatchEvent(new Event("tropos:weight-changed"));
const running = new Map<string, Promise<void>>();
function persist(uid: string, actions: WeightAction[]) {
  if (!writeJson(key(uid), actions))
    throw new Error(
      "Couldn't save on this phone. Free device storage and retry."
    );
}
function append(uid: string, action: WeightAction) {
  if (auth.currentUser?.uid !== uid)
    throw new Error("Sign in again before logging weight.");
  persist(uid, [...pendingWeights(uid), action]);
  errors.delete(uid);
  notify();
  void flushQueuedWeights(uid);
}

/** Accept a durable intent now; the existing atomic row/profile writer syncs it. */
export function queueWeightEntry(uid: string, date: string, kg: number) {
  if (!validWeightDate(date) || !Number.isFinite(kg) || kg < 20 || kg > 350)
    throw new Error("Check the weight and date.");
  const id = crypto.randomUUID();
  append(uid, { id, date, kg });
  return async () => queueWeightCorrection(uid, date, kg, id);
}

/** A correction can be reopened after closing the sheet or reloading. */
export function queueWeightCorrection(
  uid: string,
  date: string,
  kg: number,
  editId: string
) {
  append(uid, { id: crypto.randomUUID(), date, kg, undoOf: editId });
}

export function flushQueuedWeights(uid: string): Promise<void> {
  const existing = running.get(uid);
  if (existing) return existing;
  const work = (async () => {
    while (navigator.onLine && auth.currentUser?.uid === uid) {
      const action = pendingWeights(uid)[0];
      if (!action) break;
      try {
        if (action.undoOf)
          await restoreWeightEntry(uid, action.date, action.kg, action.undoOf);
        else await saveWeightEntry(uid, action.date, action.kg, action.id);
        persist(
          uid,
          pendingWeights(uid).filter((item) => item.id !== action.id)
        );
        errors.delete(uid);
        notify();
      } catch (error) {
        errors.add(uid);
        notify();
        logger.warn("[WeightQueue] Retained weight for retry", error);
        break;
      }
    }
  })();
  running.set(uid, work);
  void work.finally(() => running.delete(uid));
  return work;
}
