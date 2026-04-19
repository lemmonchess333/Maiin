import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import AccordionSection from "@/components/AccordionSection";
import type { MealReminders } from "@/hooks/useMealReminders";
import type { WorkoutReminders } from "@/hooks/useWorkoutReminders";
import type { StreakReminderPrefs } from "@/hooks/useStreakReminder";

interface NotificationsSectionProps {
  mealReminders: MealReminders;
  updateMealReminders: (data: Partial<MealReminders>) => Promise<void>;
  workoutReminders: WorkoutReminders;
  updateWorkoutReminders: (data: Partial<WorkoutReminders>) => Promise<void>;
  streakReminder: StreakReminderPrefs;
  updateStreakReminder: (data: Partial<StreakReminderPrefs>) => Promise<void>;
}

export default function NotificationsSection({
  mealReminders,
  updateMealReminders,
  workoutReminders,
  updateWorkoutReminders,
  streakReminder,
  updateStreakReminder,
}: NotificationsSectionProps) {
  return (
    <AccordionSection icon={<Bell className="w-5 h-5 text-primary" />} title="Notifications" subtitle="Meal, workout & streak reminders">
      {/* Meal Reminders */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Meal Reminders</p>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Enable meal reminders</p>
            <p className="text-xs text-muted-foreground">Get notified when it&apos;s time to eat</p>
          </div>
          <button
            onClick={async () => {
              haptic("light");
              const next = !mealReminders.enabled;
              if (next && 'Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission();
              }
              await updateMealReminders({ enabled: next });
            }}
            role="switch"
            aria-checked={mealReminders.enabled}
            className={cn("w-10 h-6 rounded-full transition-colors relative", mealReminders.enabled ? "bg-primary" : "bg-muted border border-border")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", mealReminders.enabled ? "translate-x-5" : "translate-x-1")} />
          </button>
        </div>

        {mealReminders.enabled && (
          <>
            {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
              <div key={meal} className="flex items-center justify-between p-4 rounded-lg bg-muted">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { haptic("light"); updateMealReminders({ [meal]: { ...mealReminders[meal], enabled: !mealReminders[meal].enabled } }); }}
                    className={cn("w-8 h-5 rounded-full transition-colors relative", mealReminders[meal].enabled ? "bg-primary" : "bg-muted border border-border")}
                  >
                    <div className={cn("w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform shadow-sm", mealReminders[meal].enabled ? "translate-x-[14px]" : "translate-x-[3px]")} />
                  </button>
                  <span className="text-sm text-foreground capitalize">{meal}</span>
                </div>
                <input
                  type="time"
                  value={mealReminders[meal].time}
                  onChange={(e) => updateMealReminders({ [meal]: { ...mealReminders[meal], time: e.target.value } })}
                  className="bg-card rounded-lg px-2 py-1 text-sm border border-border/50"
                  disabled={!mealReminders[meal].enabled}
                />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Workout Reminders */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Workout Reminders</p>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Enable workout reminders</p>
            <p className="text-xs text-muted-foreground">Get notified when it&apos;s time to train</p>
          </div>
          <button
            onClick={async () => {
              haptic("light");
              const next = !workoutReminders.enabled;
              if (next && 'Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission();
              }
              await updateWorkoutReminders({ enabled: next });
            }}
            role="switch"
            aria-checked={workoutReminders.enabled}
            className={cn("w-10 h-6 rounded-full transition-colors relative", workoutReminders.enabled ? "bg-primary" : "bg-muted border border-border")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", workoutReminders.enabled ? "translate-x-5" : "translate-x-1")} />
          </button>
        </div>

        {workoutReminders.enabled && (
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <span className="text-sm text-foreground">Reminder time</span>
            <input
              type="time"
              value={workoutReminders.time}
              onChange={(e) => updateWorkoutReminders({ time: e.target.value })}
              className="bg-card rounded-lg px-2 py-1 text-sm border border-border/50"
            />
          </div>
        )}

        {workoutReminders.enabled && (
          <p className="text-xs text-muted-foreground">
            Reminders fire on scheduled workout days only (Lift, Run, or Both)
          </p>
        )}
      </div>

      {/* Streak Reminders */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Streak Reminders</p>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div className="pr-3">
            <p className="text-sm text-foreground">Streak reminder</p>
            <p className="text-xs text-muted-foreground">
              Remind me if I haven&apos;t logged today
            </p>
          </div>
          <button
            onClick={async () => {
              haptic("light");
              const next = !streakReminder.enabled;
              if (next && 'Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission();
              }
              // Toggling via Settings also counts as the user having
              // decided about priming — otherwise a user who opts in via
              // Settings would still see the modal later.
              await updateStreakReminder({ enabled: next, primingShown: true });
            }}
            role="switch"
            aria-checked={streakReminder.enabled}
            className={cn("w-10 h-6 rounded-full transition-colors relative shrink-0", streakReminder.enabled ? "bg-primary" : "bg-muted border border-border")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", streakReminder.enabled ? "translate-x-5" : "translate-x-1")} />
          </button>
        </div>

        {streakReminder.enabled && (
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <span className="text-sm text-foreground">Reminder time</span>
            <input
              type="time"
              value={streakReminder.time}
              onChange={(e) => updateStreakReminder({ time: e.target.value })}
              className="bg-card rounded-lg px-2 py-1 text-sm border border-border/50"
            />
          </div>
        )}
      </div>

      {/* Shared footer */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <span className="text-sm text-foreground">Timezone</span>
          <p className="text-xs text-muted-foreground">{mealReminders.timezone}</p>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Notifications work best when installed as an app
        </p>
      </div>
    </AccordionSection>
  );
}
