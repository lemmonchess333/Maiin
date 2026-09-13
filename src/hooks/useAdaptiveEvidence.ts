import { useCallback, useSyncExternalStore } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  localDateString,
  parseLocalDate,
  addLocalDays,
} from "@/lib/dateHelpers";
import { ADAPTIVE_TDEE_DEFAULTS } from "@/lib/adaptiveTdee";
import {
  BODYWEIGHT_READ_LIMIT,
  collapseBodyweightLogs,
} from "@/lib/bodyweightLogs";
import { isActiveMealDoc } from "@/lib/mealTotals";

interface Evidence {
  intakeByDay: { dateKey: string; kcal: number }[];
  weighIns: { dateKey: string; weightKg: number }[];
  loaded: boolean;
}
const EMPTY: Evidence = { intakeByDay: [], weighIns: [], loaded: false };
interface Entry {
  value: Evidence;
  listeners: Set<() => void>;
  stop: () => void;
}
// Home, Food and the daily snapshot share one pair of bounded subscriptions.
// No evidence outlives its last consumer or crosses an account/date boundary.
const entries = new Map<string, Entry>();

function subscribe(uid: string, today: string, notify: () => void): () => void {
  const key = `${uid}/${today}`;
  let entry = entries.get(key);
  if (!entry) {
    entry = { value: EMPTY, listeners: new Set(), stop: () => {} };
    entries.set(key, entry);
    const owner = entry;
    let live = true;
    let mealsReady = false;
    let weightsReady = false;
    const publish = (patch: Partial<Evidence>) => {
      if (!live) return;
      owner.value = {
        ...owner.value,
        ...patch,
        loaded: mealsReady && weightsReady,
      };
      owner.listeners.forEach((listener) => listener());
    };
    const start = localDateString(
      addLocalDays(parseLocalDate(today), -ADAPTIVE_TDEE_DEFAULTS.windowDays)
    );
    const stopMeals = onSnapshot(
      query(
        collection(db, "users", uid, "meals"),
        where("date", ">=", start),
        where("date", "<=", today)
      ),
      (snapshot) => {
        const byDay = new Map<string, number>();
        for (const document of snapshot.docs) {
          const row = document.data();
          if (typeof row.date !== "string" || !isActiveMealDoc(row)) continue;
          const kcal =
            typeof row.totalCalories === "number" &&
            Number.isFinite(row.totalCalories)
              ? row.totalCalories
              : 0;
          byDay.set(row.date, (byDay.get(row.date) ?? 0) + kcal);
        }
        mealsReady = true;
        publish({
          intakeByDay: Array.from(byDay, ([dateKey, kcal]) => ({
            dateKey,
            kcal,
          })),
        });
      },
      () => {
        mealsReady = false;
        publish({ intakeByDay: [] });
      }
    );
    const stopWeights = onSnapshot(
      query(
        collection(db, "users", uid, "bodyweightLogs"),
        where("date", ">=", start),
        where("date", "<=", today),
        orderBy("date", "desc"),
        limit(BODYWEIGHT_READ_LIMIT)
      ),
      (snapshot) => {
        const rows = collapseBodyweightLogs(
          snapshot.docs.map((document) => {
            const row = document.data();
            return {
              id: document.id,
              date: row.date,
              weight: row.weight,
              source: row.source,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            };
          })
        );
        weightsReady = true;
        publish({
          weighIns: rows.map((row) => ({
            dateKey: row.date,
            weightKg: row.weight,
          })),
        });
      },
      () => {
        weightsReady = false;
        publish({ weighIns: [] });
      }
    );
    owner.stop = () => {
      live = false;
      stopMeals();
      stopWeights();
    };
  }
  entry.listeners.add(notify);
  const owner = entry;
  return () => {
    owner.listeners.delete(notify);
    if (!owner.listeners.size) {
      owner.stop();
      entries.delete(key);
    }
  };
}

export function useAdaptiveEvidence(
  uid: string | null,
  today: string
): Evidence {
  const listen = useCallback(
    (notify: () => void) => (uid ? subscribe(uid, today, notify) : () => {}),
    [uid, today]
  );
  const snapshot = useCallback(
    () => (uid ? (entries.get(`${uid}/${today}`)?.value ?? EMPTY) : EMPTY),
    [uid, today]
  );
  return useSyncExternalStore(listen, snapshot, () => EMPTY);
}
