import { createContext, use, type ReactNode } from "react";
import { useMealRemindersInternal } from "@/hooks/useMealReminders";
import { useWorkoutRemindersInternal } from "@/hooks/useWorkoutReminders";
import { useStreakReminderInternal } from "@/hooks/useStreakReminder";

/**
 * Reminders (meal / workout / streak) share three characteristics that
 * motivate a single provider at the authenticated root:
 *
 *   1. Each hook runs a `cancel → maybe schedule` effect whose firing
 *      depends on device-local time and current Firestore prefs. If the
 *      hook is only mounted inside Settings (the pre-provider pattern),
 *      the schedule never refreshes for a user who doesn't visit the
 *      Settings page on a given session — reminders silently drift out
 *      of sync with their configured state.
 *   2. Settings and the streak-priming modal both need READ access to
 *      the same prefs / updaters. Without a provider, each consumer
 *      would spin up an independent Firestore subscription for the same
 *      settings doc, then race each other on writes.
 *   3. The three reminder types share the permission flow. Keeping them
 *      in one place makes it easier to layer permission-denied UX on
 *      later.
 *
 * The internal hooks live in their own files and stay focused on their
 * individual scheduling logic. This provider just runs each one once and
 * exposes their returns via context.
 */

type MealValue = ReturnType<typeof useMealRemindersInternal>;
type WorkoutValue = ReturnType<typeof useWorkoutRemindersInternal>;
type StreakValue = ReturnType<typeof useStreakReminderInternal>;

interface RemindersValue {
  meal: MealValue;
  workout: WorkoutValue;
  streak: StreakValue;
}

const RemindersContext = createContext<RemindersValue | null>(null);

export function RemindersProvider({ children }: { children: ReactNode }) {
  const meal = useMealRemindersInternal();
  const workout = useWorkoutRemindersInternal();
  const streak = useStreakReminderInternal();
  return (
    <RemindersContext.Provider value={{ meal, workout, streak }}>
      {children}
    </RemindersContext.Provider>
  );
}

function useRemindersContext(): RemindersValue {
  const ctx = use(RemindersContext);
  if (!ctx) {
    throw new Error(
      "Reminder hooks must be used inside <RemindersProvider> (authenticated routes only)"
    );
  }
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMealReminders(): MealValue {
  return useRemindersContext().meal;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkoutReminders(): WorkoutValue {
  return useRemindersContext().workout;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStreakReminder(): StreakValue {
  return useRemindersContext().streak;
}
