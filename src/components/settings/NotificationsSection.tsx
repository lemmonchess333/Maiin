import { useEffect, useState } from "react";
import { AlertTriangle, Bell } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { haptic } from "@/lib/haptic";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import AccordionSection from "@/components/AccordionSection";
import SectionHeading from "@/components/ui/SectionHeading";
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
import { WORKOUT_REMINDER_IDS } from "@/lib/workoutReminderCopy";
import type { StreakReminderPrefs } from "@/hooks/useStreakReminder";
import { useUid } from "@/lib/auth";
import { usePushSettings } from "@/hooks/usePushSettings";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import {
  isRemotePushOffered,
  requestRemotePushPermission,
  registerDeviceToken,
  unregisterDeviceToken,
} from "@/lib/pushNotifications";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { isNativePlatform } from "@/lib/platform";

/* A row's control (switch, time field, button) drops under its label,
   at the right, once the label would be narrower than 8em: at double
   text on a 320px phone a switch beside it left a column too narrow for
   one word, and a time field ran off the screen. At the designed size
   every row is one line, as before. */
const ROW =
  "flex flex-wrap items-center gap-x-3 gap-y-2 p-4 rounded-lg bg-muted";
const LABEL = "min-w-[min(100%,8em)] flex-1";

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
  const uid = useUid();
  const {
    consent: pushConsent,
    update: updatePushConsent,
    loading: pushLoading,
  } = usePushSettings();
  const [pushBusy, setPushBusy] = useState(false);
  // Old native binaries without FirebaseMessaging keep local reminders;
  // remote permission is offered only when the delivery channel exists.
  const pushOffered = isRemotePushOffered();

  const handleTogglePush = async () => {
    if (pushBusy || pushLoading || !uid) return;
    haptic("light");
    setPushBusy(true);
    const next = !pushConsent.enabled;
    try {
      if (next && !(await requestRemotePushPermission())) {
        refreshPermission();
        toast.error(
          "Allow notifications in your device or browser settings to turn this on."
        );
        return;
      }
      refreshPermission();
      if (!(await updatePushConsent({ enabled: next }))) return;
      trackSettingsEvent("settings_toggle_changed", {
        toggle: "push_notifications",
        value: next,
      });
      if (next) {
        const result = await registerDeviceToken(uid);
        if (result.ok) {
          toast.success("Push on. This device is registered.");
        } else if (result.reason !== "account-changed") {
          toast.error(
            `Couldn't register for push (${result.reason}${result.detail ? `: ${result.detail}` : ""}).`
          );
        }
      } else {
        try {
          await unregisterDeviceToken(uid);
        } catch {
          toast.error(
            "Push was turned off, but this device could not be unregistered. Toggle it on and off once you are online to retry."
          );
        }
      }
    } catch {
      toast.error("Couldn't save push settings. Try again when you're online.");
    } finally {
      setPushBusy(false);
    }
  };

  // #965 — fire a server→device test push to this user's registered tokens.
  const handleTestPush = async () => {
    haptic("light");
    try {
      const fn = httpsCallable<
        unknown,
        { ok: boolean; reason?: string; detail?: string; sent?: number }
      >(functions, "sendTestPush");
      const { data } = await fn();
      if (data.ok) {
        toast.success("Test push sent. It should arrive in a few seconds.");
      } else if (data.reason === "no-registered-device") {
        toast.error("No device registered yet. Toggle push off and on again.");
      } else {
        // Surface the FCM reason/detail so a non-delivering send is diagnosable
        // (e.g. send-failed: messaging/third-party-auth-error).
        const why = data.detail
          ? `${data.reason ?? "failed"}: ${data.detail}`
          : (data.reason ?? "unknown");
        toast.error(`Couldn't send the test push (${why}).`);
      }
    } catch (err) {
      const code =
        (err as { code?: string; message?: string })?.code ??
        (err as { message?: string })?.message ??
        "error";
      toast.error(`Test push failed (${code}).`);
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
      toast.success(
        "Test notification sent. It should arrive in a few seconds."
      );
      // Refresh pending so the test notification appears in the list
      // (and disappears once it fires).
      setTimeout(refreshPending, 500);
    } else {
      toast.error("Couldn't send test. Check notification permission.");
    }
  };

  // Display helper: how long until a pending notification fires, from
  // its scheduleAt ISO ("in 12 mins", "in 3 hrs", "in 2 days"); null
  // when that is missing, unreadable or already past. A relative label,
  // never a clock time.
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
      workout: [], // found by its ids below
      streak: ["streak", "log"],
    };
    const needles = titleNeedles[kind];
    const candidates = pending.filter((p) => {
      // A workout reminder's title names its session ("Upper A today"),
      // so it is known by its weekday ids instead.
      if (kind === "workout")
        return (WORKOUT_REMINDER_IDS as readonly number[]).includes(p.id);
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

  const streakReminderOn =
    streakReminder.enabled && streakReminder.primingShown;
  const anyReminderOn =
    mealReminders.enabled || workoutReminders.enabled || streakReminderOn;

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
          className="flex items-start gap-3 p-3 rounded-lg border border-warning/15 bg-warning-bg"
        >
          <AlertTriangle className="size-4 mt-[2px] shrink-0 text-warning-strong" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Notifications are blocked
            </p>
            <p className="text-xs leading-snug text-muted-foreground">
              Reminders won&apos;t fire until you enable notifications for
              Tropos in your device settings.
            </p>
          </div>
        </div>
      )}

      {/* One Reminders group: a row each for meals, workouts and the
          streak, each with its times under it once it is on. A heading
          over each one repeated its only switch. */}
      <SectionHeading size="compact" className="px-1">
        Reminders
      </SectionHeading>

      {/* Meals */}
      <div className="space-y-3">
        <div className={ROW}>
          <div className={LABEL}>
            <p className="text-sm text-foreground">Meals</p>
            <p className="text-xs text-muted-foreground">
              When it&apos;s time to eat
            </p>
          </div>
          <Toggle
            className="ml-auto"
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
              <div key={meal} className={ROW}>
                {/* Wraps too: at double text on a 320px phone the switch
                    and "Breakfast" together are wider than the row. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Toggle
                    checked={mealReminders[meal].enabled}
                    label={`${meal} reminder`}
                    onChange={() => {
                      haptic("light");
                      updateMealReminders({
                        [meal]: {
                          ...mealReminders[meal],
                          enabled: !mealReminders[meal].enabled,
                        },
                      });
                    }}
                  />
                  <span className="text-sm text-foreground capitalize">
                    {meal}
                  </span>
                </div>
                <input
                  type="time"
                  aria-label={`${meal} reminder time`}
                  value={mealReminders[meal].time}
                  onChange={(e) =>
                    updateMealReminders({
                      [meal]: { ...mealReminders[meal], time: e.target.value },
                    })
                  }
                  className="ds-input ml-auto w-auto min-w-0 max-w-full text-sm"
                  disabled={!mealReminders[meal].enabled}
                />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Workouts */}
      <div className="space-y-3">
        <div className={ROW}>
          <div className={LABEL}>
            <p className="text-sm text-foreground">Workouts</p>
            <p className="text-xs text-muted-foreground">
              On the days you train
            </p>
          </div>
          <Toggle
            className="ml-auto"
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
          <div className={ROW}>
            <span className="text-sm text-foreground">Reminder time</span>
            <input
              type="time"
              aria-label="Workout reminder time"
              value={workoutReminders.time}
              onChange={(e) => updateWorkoutReminders({ time: e.target.value })}
              className="ds-input ml-auto w-auto min-w-0 max-w-full text-sm"
            />
          </div>
        )}
      </div>

      {/* Streak */}
      <div className="space-y-3">
        <div className={ROW}>
          <div className={LABEL}>
            <p className="text-sm text-foreground">Streak</p>
            <p className="text-xs text-muted-foreground">
              If you haven&apos;t logged today
            </p>
          </div>
          <Toggle
            className="ml-auto"
            checked={streakReminderOn}
            label="Toggle streak reminder"
            onChange={async () => {
              haptic("light");
              const next = !streakReminderOn;
              try {
                if (next) {
                  /* The native LocalNotifications permission is distinct
                     from remote push. Never show an enabled switch after a
                     denied system request. */
                  const granted = await requestNotificationPermission();
                  refreshPermission();
                  if (!granted) {
                    toast.error(
                      "Allow notifications in your device settings to turn this on."
                    );
                    return;
                  }
                }
                await updateStreakReminder({
                  enabled: next,
                  primingShown: true,
                });
                trackSettingsEvent("settings_toggle_changed", {
                  toggle: "streak_reminder",
                  value: next,
                });
              } catch {
                toast.error("Couldn't save reminder settings. Try again.");
              }
            }}
          />
        </div>

        {streakReminderOn && (
          <ReminderDiagnostics
            next={nextForCategory("streak")}
            formatNextFire={formatNextFire}
            onTest={() => handleTestNotification("streak")}
          />
        )}

        {streakReminderOn && (
          <div className={ROW}>
            <span className="text-sm text-foreground">Reminder time</span>
            <input
              type="time"
              aria-label="Streak reminder time"
              value={streakReminder.time}
              onChange={(e) => {
                void updateStreakReminder({ time: e.target.value }).catch(
                  () => {
                    toast.error("Couldn't save reminder time. Try again.");
                  }
                );
              }}
              className="ds-input ml-auto w-auto min-w-0 max-w-full text-sm"
            />
          </div>
        )}

        {/* Push notifications (#969) — the server-side delivery channel. The
            global toggle requests OS permission + registers/revokes this
            device's FCM token; per-type toggles gate which senders may target
            the user (each sender checks the flag via the server-side
            mayTargetUserConsent in functions/lib/pushConsent.js). */}
        {pushOffered && (
          <>
            <div className={ROW}>
              <div className={LABEL}>
                <p className="text-sm text-foreground">Push notifications</p>
                <p className="text-xs text-muted-foreground">
                  Get reminders and challenge alerts when the app is closed
                </p>
              </div>
              <Toggle
                className="ml-auto"
                checked={pushConsent.enabled}
                label="Toggle push notifications"
                disabled={pushLoading || pushBusy}
                onChange={() => void handleTogglePush()}
              />
            </div>

            {!isNativePlatform() && (
              <p className="px-1 text-xs text-muted-foreground">
                On iPhone, add Tropos to your Home Screen in Safari, then open
                it from that icon to enable push notifications.
              </p>
            )}

            {pushConsent.enabled &&
              (
                [
                  ["streak", "Streak nudges", null],
                  ["recap", "Weekly recap", null],
                  ["badge", "Badge unlocked", null],
                  [
                    "challenges",
                    "Monthly challenges",
                    "One alert near the start of each month, around 09:00 in your time zone. Tap it to see the new challenges.",
                  ],
                  [
                    "challengeReminders",
                    "Monthly challenge reminders",
                    "One reminder in the final three days, around 09:00 in your time zone, for joined monthly goals still in progress.",
                  ],
                ] as const
              ).map(([type, label, description]) => (
                <div key={type} className={ROW}>
                  <div className={LABEL}>
                    <p className="text-sm text-foreground">{label}</p>
                    {description && (
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    )}
                  </div>
                  <Toggle
                    className="ml-auto"
                    checked={pushConsent[type]}
                    label={`Toggle ${label} push`}
                    disabled={pushLoading || pushBusy}
                    onChange={async () => {
                      if (pushBusy || pushLoading) return;
                      haptic("light");
                      setPushBusy(true);
                      const next = !pushConsent[type];
                      try {
                        if (await updatePushConsent({ [type]: next })) {
                          trackSettingsEvent("settings_toggle_changed", {
                            toggle: `push_${type}`,
                            value: next,
                          });
                        }
                      } catch {
                        toast.error(
                          "Couldn't save push settings. Try again when you're online."
                        );
                      } finally {
                        setPushBusy(false);
                      }
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
                <span className="text-sm text-foreground">
                  Send a test push
                </span>
                <span className="text-sm font-medium text-lifting-strong">
                  Send test
                </span>
              </button>
            )}
          </>
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-lg bg-muted/60 border border-border/40">
      <div className={cn(LABEL, "text-xs text-muted-foreground")}>
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
      <Button
        variant="ghost"
        size="sm"
        onClick={onTest}
        className="ml-auto shrink-0"
      >
        Send test
      </Button>
    </div>
  );
}
