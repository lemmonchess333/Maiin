import { useEffect, useState } from "react";
import { AlertTriangle, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/Toggle";
import { haptic } from "@/lib/haptic";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import AccordionSection from "@/components/AccordionSection";
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  getPendingNotifications,
  sendTestNotification,
  type NotificationPermissionState,
  type PendingNotification,
  type TestNotificationKind,
} from "@/lib/notifications";
import { toast } from "@/lib/toast";
import type { MealReminders } from "@/hooks/useMealReminders";
import type { WorkoutReminders } from "@/hooks/useWorkoutReminders";
import type { StreakReminderPrefs } from "@/hooks/useStreakReminder";
import { useAuth } from "@/lib/auth";
import { usePushSettings } from "@/hooks/usePushSettings";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import {
  registerDeviceToken,
  unregisterDeviceToken,
} from "@/lib/pushNotifications";

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
  // Push (server-side FCM) consent — #969. Separate from the on-device
  // reminders above: this is the global kill-switch + per-type consent the
  // server senders read, plus token register/revoke on the global toggle.
  const { user } = useAuth();
  const { consent: pushConsent, update: updatePushConsent } = usePushSettings();

  // #965 — fire a server→device test push to this user's registered tokens.
  const handleTestPush = async () => {
    haptic("light");
    try {
      const fn = httpsCallable<unknown, { ok: boolean; reason?: string }>(
        functions,
        "sendTestPush"
      );
      const { data } = await fn();
      if (data.ok) {
        toast.success("Test push sent — should arrive in a few seconds.");
      } else if (data.reason === "no-registered-device") {
        toast.error("No device registered yet — toggle push off and on again.");
      } else {
        toast.error("Couldn't send the test push.");
      }
    } catch {
      toast.error("Couldn't send the test push.");
    }
  };

  // Permission state for the inline denied-banner. Re-poll on every toggle
  // action below so if the user opts in, hits the OS prompt, and denies,
  // the banner appears without them needing to close/reopen Settings.
  const [permission, setPermission] =
    useState<NotificationPermissionState>("default");
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
  const nextForCategory = (
    kind: TestNotificationKind
  ): PendingNotification | null => {
    if (kind === "generic") return null;
    const titleNeedles: Record<
      Exclude<TestNotificationKind, "generic">,
      string[]
    > = {
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
    <AccordionSection
      inline={inline}
      icon={<Bell className="size-5 text-primary" />}
      title="Notifications"
      subtitle="Meal, workout & streak reminders"
    >
      {/* Permission-denied banner — only shown when the user has at least one
          reminder turned on AND the OS is blocking delivery. Silent failure
          is confusing: the toggle says "on" but nothing fires. Surfacing the
          root cause with a direct fix path is the minimum UX. */}
      {permission === "denied" && anyReminderOn && (
        <div
          role="alert"
          className="flex items-start gap-3 p-3 rounded-lg border border-amber-400/50 bg-amber-50 text-amber-900"
        >
          <AlertTriangle className="size-4 mt-[2px] shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Notifications are blocked</p>
            <p className="text-xs leading-snug opacity-80">
              Reminders won&apos;t fire until you enable notifications for
              Tropos in your device settings.
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
            <p className="text-xs text-muted-foreground">
              Get notified when it&apos;s time to eat
            </p>
          </div>
          <Toggle
            checked={mealReminders.enabled}
            label="Toggle meal reminders"
            onChange={async () => {
              haptic("light");
              const next = !mealReminders.enabled;
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "meal_reminders",
                value: next,
              });
              if (next && permission === "default") {
                /* Route via lib/notifications.requestNotificationPermission
                   so iOS Capacitor triggers a native LocalNotifications
                   prompt rather than the WebView Notification API
                   (which doesn't surface an iOS system prompt). */
                await requestNotificationPermission();
                refreshPermission();
              }
              await updateMealReminders({ enabled: next });
            }}
          />
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
              <div
                key={meal}
                className="flex items-center justify-between p-4 rounded-lg bg-muted"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      haptic("light");
                      updateMealReminders({
                        [meal]: {
                          ...mealReminders[meal],
                          enabled: !mealReminders[meal].enabled,
                        },
                      });
                    }}
                    className={cn(
                      "w-8 h-5 rounded-full transition-colors relative",
                      mealReminders[meal].enabled
                        ? "bg-primary"
                        : "bg-muted border border-border"
                    )}
                  >
                    <div
                      className={cn(
                        "size-3.5 rounded-full bg-white absolute top-[3px] transition-transform shadow-sm",
                        mealReminders[meal].enabled
                          ? "translate-x-[14px]"
                          : "translate-x-[3px]"
                      )}
                    />
                  </button>
                  <span className="text-sm text-foreground capitalize">
                    {meal}
                  </span>
                </div>
                <input
                  type="time"
                  value={mealReminders[meal].time}
                  onChange={(e) =>
                    updateMealReminders({
                      [meal]: { ...mealReminders[meal], time: e.target.value },
                    })
                  }
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
            <p className="text-xs text-muted-foreground">
              Get notified when it&apos;s time to train
            </p>
          </div>
          <Toggle
            checked={workoutReminders.enabled}
            label="Toggle workout reminders"
            onChange={async () => {
              haptic("light");
              const next = !workoutReminders.enabled;
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "workout_reminders",
                value: next,
              });
              if (next && permission === "default") {
                /* Route via lib/notifications.requestNotificationPermission
                   so iOS Capacitor triggers a native LocalNotifications
                   prompt rather than the WebView Notification API
                   (which doesn't surface an iOS system prompt). */
                await requestNotificationPermission();
                refreshPermission();
              }
              await updateWorkoutReminders({ enabled: next });
            }}
          />
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
          <Toggle
            checked={streakReminder.enabled}
            label="Toggle streak reminder"
            onChange={async () => {
              haptic("light");
              const next = !streakReminder.enabled;
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "streak_reminder",
                value: next,
              });
              if (next && permission === "default") {
                /* Route via lib/notifications.requestNotificationPermission
                   so iOS Capacitor triggers a native LocalNotifications
                   prompt rather than the WebView Notification API
                   (which doesn't surface an iOS system prompt). */
                await requestNotificationPermission();
                refreshPermission();
              }
              // Toggling via Settings also counts as the user having
              // decided about priming — otherwise a user who opts in via
              // Settings would still see the modal later.
              await updateStreakReminder({ enabled: next, primingShown: true });
            }}
          />
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

        {/* Push notifications (#969) — the server-side delivery channel. The
            global toggle requests OS permission + registers/revokes this
            device's FCM token; per-type toggles gate which senders may target
            the user (each sender checks the flag via mayTargetUser). */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div className="pr-3">
            <p className="text-sm text-foreground">Push notifications</p>
            <p className="text-xs text-muted-foreground">
              Get nudges and recaps even when the app is closed
            </p>
          </div>
          <Toggle
            checked={pushConsent.enabled}
            label="Toggle push notifications"
            onChange={async () => {
              haptic("light");
              const next = !pushConsent.enabled;
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "push_notifications",
                value: next,
              });
              if (next) {
                const granted = await requestNotificationPermission();
                refreshPermission();
                if (!granted) {
                  toast.error(
                    "Allow notifications in your browser settings to turn this on."
                  );
                  return;
                }
                await updatePushConsent({ enabled: true });
                if (user) await registerDeviceToken(user.uid);
              } else {
                await updatePushConsent({ enabled: false });
                if (user) await unregisterDeviceToken(user.uid);
              }
            }}
          />
        </div>

        {pushConsent.enabled &&
          (
            [
              ["streak", "Streak nudges"],
              ["recap", "Weekly recap"],
              ["badge", "Badge unlocked"],
            ] as const
          ).map(([type, label]) => (
            <div
              key={type}
              className="flex items-center justify-between p-4 rounded-lg bg-muted"
            >
              <span className="text-sm text-foreground">{label}</span>
              <Toggle
                checked={pushConsent[type]}
                label={`Toggle ${label} push`}
                onChange={() => {
                  haptic("light");
                  const next = !pushConsent[type];
                  trackSettingsEvent("settings_toggle_changed", {
                    toggle: `push_${type}`,
                    value: next,
                  });
                  void updatePushConsent({ [type]: next });
                }}
              />
            </div>
          ))}

        {/* #965 — on-demand test push so the user can confirm end-to-end
            server→device delivery (works with the app closed in PWA mode). */}
        {pushConsent.enabled && (
          <button
            type="button"
            onClick={handleTestPush}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-muted active:scale-[0.99] transition-transform"
          >
            <span className="text-sm text-foreground">Send a test push</span>
            <span className="text-sm font-medium text-primary">Send test</span>
          </button>
        )}
      </div>
    </AccordionSection>
  );
}

/**
 * Per-reminder diagnostics strip. Surfaces:
 *   - "Next: <relative time>" when an OS-scheduled notification
 *     matches the category (or a tab-open caveat when on web).
 *   - "Send test" button — fires a notification in +3s with stable
 *     ID per category so repeated taps replace rather than queue.
 *
 * Lives at the top of each enabled-reminder block so users can
 * verify their device-level setup without waiting for the real
 * reminder fire-time.
 */
export function ReminderDiagnostics({
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
            Next:{" "}
            <span className="font-medium text-foreground">{relative}</span>
          </>
        ) : (
          // Empty pending list on web is the default state — explain
          // the actual behaviour so users don't think the reminder
          // is broken.
          <span>Reminders fire while this tab is open.</span>
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
