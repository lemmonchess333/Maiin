import { collection, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { addDocGuarded } from "@/lib/firestoreWrite";
import { flushQueue, queueDurableWrite } from "@/lib/offlineQueue";
import { toast } from "@/lib/toast";
import { track as trackFoodEvent, type FoodLogPath } from "@/lib/foodAnalytics";

/**
 * B0 effort telemetry for one logging attempt. `path` is required because
 * a save whose entry route is unknown cannot answer the question the event
 * exists for — whether the remembered-meal routes are cheaper than typing.
 * `taps` and `durationMs` are optional: only the Food page counts them,
 * and a save from ManualFoodLogger or FoodAnalyzer is still worth knowing
 * about without them.
 */
export interface MealLogTelemetry {
  path: FoodLogPath;
  taps?: number;
  durationMs?: number;
}

export async function createMealEntry(
  uid: string,
  data: Record<string, unknown>,
  id?: string
) {
  if (auth.currentUser?.uid !== uid)
    throw new Error("Sign in again to log food.");
  return addDocGuarded(collection(db, "users", uid, "meals"), data, {
    id,
    enqueue: (ref, clean) => {
      queueDurableWrite(uid, `users/${uid}/meals`, ref.id, clean);
      void flushQueue(db, uid).catch(() => {});
    },
  });
}

export async function undoMealEntries(uid: string, ids: readonly string[]) {
  if (auth.currentUser?.uid !== uid)
    throw new Error("Sign in again before undoing.");
  for (const id of new Set(ids)) {
    queueDurableWrite(
      uid,
      `users/${uid}/meals`,
      id,
      { deletedAt: Timestamp.now() },
      true
    );
  }
  void flushQueue(db, uid).catch(() => {});
}

export function notifyMealsLogged(
  uid: string,
  ids: readonly string[],
  message: string,
  telemetry?: MealLogTelemetry
) {
  // Emitted here rather than at each caller: this function already runs on
  // every successful log, so the event cannot drift out of step with the
  // toast the user actually sees, and a new logging route gets measured by
  // the same line that gives it its confirmation.
  if (telemetry) {
    trackFoodEvent("food_log_saved", {
      path: telemetry.path,
      ...(telemetry.taps !== undefined ? { taps: telemetry.taps } : {}),
      ...(telemetry.durationMs !== undefined
        ? { durationMs: telemetry.durationMs }
        : {}),
    });
  }
  let undone = false;
  toast.success(
    navigator.onLine
      ? message
      : "Saved on this phone — syncs when you're back online",
    {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: async () => {
          if (undone) return;
          undone = true;
          if (telemetry)
            trackFoodEvent("food_log_undo", { path: telemetry.path });
          try {
            await undoMealEntries(uid, ids);
          } catch (error) {
            undone = false;
            toast.error(
              error instanceof Error
                ? error.message
                : "Couldn't undo this entry."
            );
          }
        },
      },
    }
  );
}
