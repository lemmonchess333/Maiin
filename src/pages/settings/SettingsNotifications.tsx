/** SettingsNotifications — Notifications nested page (Set1.2). */
import {
  useMealReminders,
  useWorkoutReminders,
  useStreakReminder,
} from "@/hooks/RemindersProvider";
import SettingsSection from "@/components/settings/SettingsSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import ActivityNotificationsGroup from "@/components/settings/ActivityNotificationsGroup";
import { isRemotePushOffered } from "@/lib/pushNotifications";

export default function SettingsNotifications() {
  const { reminders: mealReminders, updateReminders: updateMealReminders } =
    useMealReminders();
  const {
    reminders: workoutReminders,
    updateReminders: updateWorkoutReminders,
  } = useWorkoutReminders();
  const { prefs: streakReminder, updatePrefs: updateStreakReminder } =
    useStreakReminder();

  return (
    <SettingsSection
      title="Notifications"
      /* The native app has no push switch (isRemotePushOffered). */
      subtitle={
        isRemotePushOffered()
          ? "Reminders, push and activity"
          : "Reminders and activity"
      }
      section="notifications"
    >
      <NotificationsSection
        inline
        mealReminders={mealReminders}
        updateMealReminders={updateMealReminders}
        workoutReminders={workoutReminders}
        updateWorkoutReminders={updateWorkoutReminders}
        streakReminder={streakReminder}
        updateStreakReminder={updateStreakReminder}
      />
      <ActivityNotificationsGroup />
    </SettingsSection>
  );
}
