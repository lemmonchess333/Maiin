import type { NotificationType } from "@/hooks/useNotifications";
/** SettingsNotifications — Notifications nested page (Set1.2). */
import {
  useMealReminders,
  useWorkoutReminders,
  useStreakReminder,
} from "@/hooks/RemindersProvider";
import SettingsSection from "@/components/settings/SettingsSection";
import NotificationsSection from "@/components/settings/NotificationsSection";

const TRAY_LABELS: Record<NotificationType, string> = {
  kudos: "Kudos",
  comment: "Comments",
  follow: "New followers",
  challenge_milestone: "Challenge milestones",
  circle_focus_backed: "Circle focus support",
  circle_milestone: "Circle milestones",
  circle_needs_support: "Circle support requests",
  circle_joined: "Circle members joining",
  circle_routine_shared: "Shared Circle routines",
  space_post_like: "Space post likes",
  space_post_comment: "Space post comments",
};

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
      subtitle="Meal, workout & streak reminders"
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
      <section
        className="ds-card p-4 mt-3 space-y-2"
        aria-label="In-app activity notifications"
      >
        <h3 className="text-sm font-bold text-foreground">In-app activity</h3>
        <p className="text-sm text-muted-foreground">
          These appear in your activity tray. Individual controls are not
          available yet.
        </p>
        <ul className="text-sm text-muted-foreground space-y-2">
          {Object.entries(TRAY_LABELS).map(([type, label]) => (
            <li key={type}>{label}</li>
          ))}
        </ul>
      </section>
    </SettingsSection>
  );
}
