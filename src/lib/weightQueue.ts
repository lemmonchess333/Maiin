import { auth } from "@/lib/firebase";
import { readJson, writeJson, scopedKey } from "@/lib/localStore";
import { saveWeightEntry, restoreWeightEntry, validWeightDate } from "@/lib/weightEntry";
import { logger } from "@/lib/logger";

type WeightAction = { id: string; date: string; kg: number; undoOf?: string };
const key = (uid: string) => scopedKey("tropos-weight-queue", uid);
const pending = (uid: string) => readJson<WeightAction[]>(key(uid), []);
const running = new Map<string, Promise<void>>();
function persist(uid: string, actions: WeightAction[]) {
  if (!writeJson(key(uid), actions)) throw new Error("Couldn't save on this phone. Free device storage and retry.");
}
function append(uid: string, action: WeightAction) {
  if (auth.currentUser?.uid !== uid) throw new Error("Sign in again before logging weight.");
  persist(uid, [...pending(uid), action]);
  void flushQueuedWeights(uid);
}

/** Accept a durable intent now; the existing atomic row/profile writer syncs it. */
export function queueWeightEntry(uid: string, date: string, kg: number) {
  if (!validWeightDate(date) || !Number.isFinite(kg) || kg < 20 || kg > 350) throw new Error("Check the weight and date.");
  const id = crypto.randomUUID();
  append(uid, { id, date, kg });
  return async () => append(uid, { id: crypto.randomUUID(), date, kg, undoOf: id });
}

export function flushQueuedWeights(uid: string): Promise<void> {
  const existing = running.get(uid);
  if (existing) return existing;
  const work = (async () => {
    while (navigator.onLine && auth.currentUser?.uid === uid) {
      const action = pending(uid)[0];
      if (!action) break;
      try {
        if (action.undoOf) await restoreWeightEntry(uid, action.date, action.kg, action.undoOf);
        else await saveWeightEntry(uid, action.date, action.kg, action.id);
        persist(uid, pending(uid).filter((item) => item.id !== action.id));
        window.dispatchEvent(new Event("tropos:weight-changed"));
      } catch (error) {
        logger.warn("[WeightQueue] Retained weight for retry", error);
        break;
      }
    }
  })();
  running.set(uid, work);
  void work.finally(() => running.delete(uid));
  return work;
}
