/** SettingsNotifications — Notifications nested page (Set1.2). */
import {
  useMealReminders,
  useWorkoutReminders,
  useStreakReminder,
  useReviewReminder,
} from "@/hooks/RemindersProvider";
import SettingsSection from "@/components/settings/SettingsSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import ActivityNotificationsGroup from "@/components/settings/ActivityNotificationsGroup";
import LiveActivitiesGroup from "@/components/settings/LiveActivitiesGroup";

export default function SettingsNotifications() {
  const meal = useMealReminders();
  const { reminders: mealReminders, updateReminders: updateMealReminders } =
    meal;
  const workout = useWorkoutReminders();
  const {
    reminders: workoutReminders,
    updateReminders: updateWorkoutReminders,
  } = workout;
  const streak = useStreakReminder();
  const review = useReviewReminder();

  return (
    <SettingsSection
      title="Notifications"
      /* No push switch: the app picks how each reminder goes (App1 Q26). */
      subtitle="Reminders and activity"
      section="notifications"
    >
      <NotificationsSection
        inline
        mealStatus={meal}
        workoutStatus={workout}
        mealReminders={mealReminders}
        updateMealReminders={updateMealReminders}
        workoutReminders={workoutReminders}
        updateWorkoutReminders={updateWorkoutReminders}
        streakReminder={streak.prefs}
        updateStreakReminder={streak.updatePrefs}
        remindersLoading={streak.loading || review.loading}
        reviewReminder={review.prefs}
        updateReviewReminder={review.updatePrefs}
      />
      <ActivityNotificationsGroup />
      {/* Wid2 call 6: a run's and a lift's card outside the app. */}
      <LiveActivitiesGroup />
    </SettingsSection>
  );
}
