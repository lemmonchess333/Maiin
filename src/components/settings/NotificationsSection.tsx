import { useEffect, useState } from "react";
import { AlertTriangle, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import AccordionSection from "@/components/AccordionSection";
import {
  getNotificationPermissionState,
  getPendingNotifications,
  sendTestNotification,
  type NotificationPermissionState,
  type PendingNotification,
  type TestNotificationKind,
} from "@/lib/notifications";
import { toast } from "sonner";
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
  inline?: boolean;
}

export default function NotificationsSection({
  mealReminders,
  updateMealReminders,
  workoutReminders,
  updateWorkoutReminders,
  streakReminder,
  updateStreakReminder,
  inline = false,
}: NotificationsSectionProps) {
  // Permission state for the inline denied-banner. Re-poll on every toggle
  // action below so if the user opts in, hits the OS prompt, and denies,
  // the banner appears without them needing to close/reopen Settings.
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  useEffect(() => {
    let alive = true;
    getNotificationPermissionState().then((state) => {
      if (alive) setPermission(state);
    });
    return () => {
      alive = false;
    };
  }, []);
  const refreshPermission = () => {
    getNotificationPermissionState().then(setPermission);
  };

  // PR I (audit P1 #10): pending-notifications snapshot. Re-polled on
  // every reminder toggle / time change so the "Next reminder"
  // display stays in sync with what the OS will actually fire. Empty
  // array on web (setTimeout fallback isn't queryable).
  const [pending, setPending] = useState<PendingNotification[]>([]);
  const refreshPending = () => {
    getPendingNotifications().then(setPending);
  };
  useEffect(() => {
    let alive = true;
    getPendingNotifications().then((list) => {
      if (alive) setPending(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleTestNotification = async (kind: TestNotificationKind) => {
    haptic("light");
    const ok = await sendTestNotification(kind);
    if (ok) {
      toast.success("Test notification sent — should arrive in a few seconds.");
      // Refresh pending so the test notification appears in the list
      // (and disappears once it fires).
      setTimeout(refreshPending, 500);
    } else {
      toast.error("Couldn't send test. Check notification permission.");
    }
  };

  // Display helper: turn a pending notification's scheduleAt ISO into
  // a friendly relative-time label ("Tomorrow at 8:00 AM", "In 12
  // minutes", etc.). Kept simple — we don't need date-fns for this.
  const formatNextFire = (iso: string | null): string | null => {
    if (!iso) return null;
    const at = new Date(iso);
    if (isNaN(at.getTime())) return null;
    const now = new Date();
    const diffMs = at.getTime() - now.getTime();
    if (diffMs < 0) return null;
    const mins = Math.round(diffMs / 60_000);
    if (mins < 60) return `in ${mins} min${mins === 1 ? "" : "s"}`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `in ${hours} hr${hours === 1 ? "" : "s"}`;
    const days = Math.round(hours / 24);
    return `in ${days} day${days === 1 ? "" : "s"}`;
  };

  /**
   * Find the soonest pending notification whose ID matches the
   * supplied prefix. Each reminder hook (useMealReminders,
   * useWorkoutReminders, useStreakReminder) generates IDs from
   * predictable bands (meal = 100s, workout = 200s, streak = 300s
   * by convention). The actual prefix mapping is best-effort because
   * the schedule code currently uses small integers — we approximate
   * by scanning the title.
   */
  const nextForCategory = (kind: TestNotificationKind): PendingNotification | null => {
    if (kind === "generic") return null;
    const titleNeedles: Record<Exclude<TestNotificationKind, "generic">, string[]> = {
      meal: ["meal", "breakfast", "lunch", "dinner", "eat"],
      workout: ["workout", "training", "lift", "session"],
      streak: ["streak", "log"],
    };
    const needles = titleNeedles[kind];
    const candidates = pending.filter((p) => {
      const text = (p.title || "").toLowerCase();
      return needles.some((n) => text.includes(n));
    });
    if (candidates.length === 0) return null;
    const sorted = [...candidates].sort((a, b) => {
      const at = a.scheduleAt ? new Date(a.scheduleAt).getTime() : Infinity;
      const bt = b.scheduleAt ? new Date(b.scheduleAt).getTime() : Infinity;
      return at - bt;
    });
    return sorted[0];
  };

  const anyReminderOn =
    mealReminders.enabled || workoutReminders.enabled || streakReminder.enabled;

  return (
    <AccordionSection inline={inline} icon={<Bell className="w-5 h-5 text-primary" />} title="Notifications" subtitle="Meal, workout & streak reminders">
      {/* Permission-denied banner — only shown when the user has at least one
          reminder turned on AND the OS is blocking delivery. Silent failure
          is confusing: the toggle says "on" but nothing fires. Surfacing the
          root cause with a direct fix path is the minimum UX. */}
      {permission === "denied" && anyReminderOn && (
        <div
          role="alert"
          className="flex items-start gap-3 p-3 rounded-lg border border-amber-400/50 bg-amber-50 text-amber-900"
        >
          <AlertTriangle className="w-4 h-4 mt-[2px] shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Notifications are blocked</p>
            <p className="text-xs leading-snug opacity-80">
              Reminders won&apos;t fire until you enable notifications for Tropos
              in your device settings.
            </p>
          </div>
        </div>
      )}

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
                refreshPermission();
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
            {/* PR I: per-category diagnostics strip. Lets the user
                verify their device-level setup without waiting for
                the actual reminder fire. */}
            <ReminderDiagnostics
              next={nextForCategory("meal")}
              formatNextFire={formatNextFire}
              onTest={() => handleTestNotification("meal")}
            />
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
                refreshPermission();
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
          <ReminderDiagnostics
            next={nextForCategory("workout")}
            formatNextFire={formatNextFire}
            onTest={() => handleTestNotification("workout")}
          />
        )}

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
                refreshPermission();
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
          <ReminderDiagnostics
            next={nextForCategory("streak")}
            formatNextFire={formatNextFire}
            onTest={() => handleTestNotification("streak")}
          />
        )}

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
      <p className="text-xs text-muted-foreground text-center">
        Notifications work best when installed as an app
      </p>
    </AccordionSection>
  );
}

/**
 * PR I (audit P1 #10): per-reminder diagnostics strip. Surfaces:
 *   - "Next: <relative time>" when an OS-scheduled notification
 *     matches the category (or "Web reminders fire only while the
 *     app is open" when on web).
 *   - "Send test" button — fires a notification in +3s with stable
 *     ID per category so repeated taps replace rather than queue.
 *
 * Lives at the top of each enabled-reminder block so users can
 * verify their device-level setup without waiting for the real
 * reminder fire-time. Cheap to add visibly because the pre-PR-I
 * surface had no diagnostics at all.
 */
function ReminderDiagnostics({
  next,
  formatNextFire,
  onTest,
}: {
  next: PendingNotification | null;
  formatNextFire: (iso: string | null) => string | null;
  onTest: () => void;
}) {
  const relative = next ? formatNextFire(next.scheduleAt) : null;
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/60 border border-border/40">
      <div className="text-xs text-muted-foreground">
        {relative ? (
          <>
            Next: <span className="font-medium text-foreground">{relative}</span>
          </>
        ) : (
          // Empty pending list on web is the default state — explain
          // why so users don't think the reminder is broken.
          <span>
            Web reminders fire while the app is open. Install Tropos for
            durable native delivery.
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onTest}
        className="shrink-0 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
      >
        Send test
      </button>
    </div>
  );
}
