import { useState, useEffect, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import {
  scheduleNotification,
  cancelNotification,
  requestNotificationPermission,
} from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/errorReporting";

export interface MealReminders {
  enabled: boolean;
  breakfast: { enabled: boolean; time: string };
  lunch: { enabled: boolean; time: string };
  dinner: { enabled: boolean; time: string };
}

const DEFAULT_REMINDERS: MealReminders = {
  enabled: false,
  breakfast: { enabled: true, time: "08:00" },
  lunch: { enabled: true, time: "12:30" },
  dinner: { enabled: true, time: "18:30" },
};

// Stable notification IDs across all Tropos scheduled notifications.
// Reserve 1000–1999 for meal reminders, 2000–2999 for workout reminders,
// 3000+ for event-driven notifications added in v1.2.
const MEAL_NOTIFICATION_IDS = {
  breakfast: 1001,
  lunch: 1002,
  dinner: 1003,
} as const;

/**
 * Given a "HH:MM" time string, return a Date for the next occurrence —
 * today if the time is still in the future, otherwise tomorrow.
 * Returns null if the input is malformed.
 */
function computeNextOccurrence(timeHHMM: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(timeHHMM);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

/**
 * Heavy-lifting internal hook — run once per authenticated session by
 * <RemindersProvider>. Public callers use `useMealReminders` from
 * RemindersProvider.tsx which reads this hook's output from context.
 */
export function useMealRemindersInternal() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<MealReminders>(DEFAULT_REMINDERS);
  const [loading, setLoading] = useState(true);

  // Load from Firestore
  useEffect(() => {
    if (!user) {
      const reset = () => {
        setLoading(false);
      };
      reset();
      return;
    }
    const ref = doc(db, "users", user.uid, "settings", "mealReminders");
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          setReminders({
            ...DEFAULT_REMINDERS,
            ...(snap.data() as MealReminders),
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        logger.error("[MealReminders] load failed", err);
        setLoading(false);
      });
  }, [user]);

  // Save to Firestore. Errors are reported via captureError (Firestore
  // writes are CRITICAL_KEYWORDS-tagged so they persist to users/{uid}/errors)
  // but not re-thrown — the UI already did an optimistic setReminders, a
  // background write failure shouldn't crash the toggle flow.
  const updateReminders = useCallback(
    async (updates: Partial<MealReminders>) => {
      if (!user) return;
      const updated = { ...reminders, ...updates };
      setReminders(updated);
      const ref = doc(db, "users", user.uid, "settings", "mealReminders");
      try {
        await setDocGuarded(ref, updated);
      } catch (err) {
        logger.error("[MealReminders] save failed", err);
        captureError(
          err instanceof Error ? err : new Error(String(err)),
          "network",
          {
            surface: "mealReminders.save",
          }
        );
      }
    },
    [user, reminders]
  );

  // Schedule / reschedule the next occurrence of each enabled meal reminder
  useEffect(() => {
    let cancelled = false;

    const rescheduleAll = async () => {
      await cancelNotification(MEAL_NOTIFICATION_IDS.breakfast);
      await cancelNotification(MEAL_NOTIFICATION_IDS.lunch);
      await cancelNotification(MEAL_NOTIFICATION_IDS.dinner);

      if (cancelled || !reminders.enabled) return;

      const mealConfigs: Array<{
        key: keyof typeof MEAL_NOTIFICATION_IDS;
        config: { enabled: boolean; time: string };
        title: string;
      }> = [
        {
          key: "breakfast",
          config: reminders.breakfast,
          title: "Time for breakfast",
        },
        { key: "lunch", config: reminders.lunch, title: "Time for lunch" },
        { key: "dinner", config: reminders.dinner, title: "Time for dinner" },
      ];

      for (const { key, config, title } of mealConfigs) {
        if (!config.enabled) continue;
        const nextAt = computeNextOccurrence(config.time);
        if (!nextAt) continue;
        await scheduleNotification({
          id: MEAL_NOTIFICATION_IDS[key],
          title,
          body: "Quick log keeps your day accurate.",
          scheduleAt: nextAt,
          // Daily-repeating so the reminder doesn't silently stop
          // after the first fire. The OS re-arms it for the same
          // wall-clock time each subsequent day. Cancel-on-toggle
          // (and the rescheduleAll call above) still handles the
          // disable / time-edit cases.
          repeats: true,
        });
      }
    };

    rescheduleAll();

    return () => {
      cancelled = true;
    };
  }, [reminders]);

  // Permission request is a stable module-level function — no wrapper needed.
  return {
    reminders,
    loading,
    updateReminders,
    requestPermission: requestNotificationPermission,
  };
}
