/** SettingsNotifications — Notifications nested page (Set1.2). */
import {
  useMealReminders,
  useWorkoutReminders,
  useStreakReminder,
} from "@/hooks/RemindersProvider";
import SettingsSection from "@/components/settings/SettingsSection";
import NotificationsSection from "@/components/settings/NotificationsSection";

export default function SettingsNotifications() {
  const { reminders: mealReminders, updateReminders: updateMealReminders } = useMealReminders();
  const { reminders: workoutReminders, updateReminders: updateWorkoutReminders } = useWorkoutReminders();
  const { prefs: streakReminder, updatePrefs: updateStreakReminder } = useStreakReminder();

  return (
    <SettingsSection title="Notifications" subtitle="Meal, workout & streak reminders">
      <NotificationsSection
        inline
        mealReminders={mealReminders}
        updateMealReminders={updateMealReminders}
        workoutReminders={workoutReminders}
        updateWorkoutReminders={updateWorkoutReminders}
        streakReminder={streakReminder}
        updateStreakReminder={updateStreakReminder}
      />
    </SettingsSection>
  );
}
