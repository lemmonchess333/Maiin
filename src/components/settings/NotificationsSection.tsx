import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { subscribeNotificationScheduleChanges } from "@/lib/notificationScheduleEvents";
import { Toggle } from "@/components/ui/Toggle";
import Select from "@/components/ui/Select";
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
import { REVIEW_NOTIFICATION_ID } from "@/lib/reviewReminder";
import {
  FIRST_WEEK_NOTIFICATION_ID,
  STREAK_NOTIFICATION_ID,
} from "@/hooks/streakNotificationId";
import {
  reminderDelivery,
  STREAK_REMINDER_HOURS,
  type ReminderDelivery,
  type ReviewReminderChoice,
  type StreakReminderChoice,
} from "@/lib/reminderChoices";
import { pushTurnedOn, type PushOnlyType } from "@/lib/pushConsent";
import { useUid } from "@/lib/auth";
import { usePushSettings } from "@/hooks/usePushSettings";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import {
  isPushSupported,
  isRemotePushOffered,
  requestRemotePushPermission,
  registerDeviceToken,
} from "@/lib/pushNotifications";
import { logger } from "@/lib/logger";
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

/** The kinds only the server can send, each with no time and no phone
 *  copy, so each is one switch that needs push. */
const PUSH_ONLY_ROWS: readonly [PushOnlyType, string, string | null][] = [
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
];

interface ReminderStatus {
  loading: boolean;
  failed: boolean;
  saving: boolean;
  retry: () => void;
}

interface NotificationsSectionProps {
  mealStatus?: ReminderStatus;
  workoutStatus?: ReminderStatus;
  mealReminders: MealReminders;
  updateMealReminders: (data: Partial<MealReminders>) => Promise<void>;
  workoutReminders: WorkoutReminders;
  updateWorkoutReminders: (data: Partial<WorkoutReminders>) => Promise<void>;
  /** The evening reminder's one switch and time (`streakReminderChoice`). */
  streakReminder: StreakReminderChoice;
  updateStreakReminder: (data: Partial<StreakReminderChoice>) => Promise<void>;
  /** The streak's and review's choices are still being read. */
  remindersLoading?: boolean;
  /** Monday's "Your week, reviewed" (useReviewReminder). */
  reviewReminder?: ReviewReminderChoice;
  updateReviewReminder?: (data: Partial<ReviewReminderChoice>) => Promise<void>;
  inline?: boolean;
}

/**
 * Settings → Notifications: one switch and one time per reminder (App1
 * Q26). Which channel a reminder goes by is the app's call
 * (`reminderDelivery`, `lib/reminderChoices.ts`), so there is no push
 * switch: turning on a reminder push can carry, on a device that can take
 * push, sets push up (`setUpPush`), and the server then sends it at the
 * same time instead of the phone. The kinds only the server can send
 * (badges, monthly challenges) keep a switch each.
 */
export default function NotificationsSection({
  mealStatus,
  workoutStatus,
  mealReminders,
  updateMealReminders,
  workoutReminders,
  updateWorkoutReminders,
  streakReminder,
  updateStreakReminder,
  remindersLoading = false,
  reviewReminder,
  updateReviewReminder,
  inline = false,
}: NotificationsSectionProps) {
  // The push settings at `users/{uid}/settings/push` (#969): whether push
  // carries the streak and review reminders (`enabled`), and the push-only
  // kinds' switches, which each server sender reads through
  // `mayTargetUserConsent` (functions/lib/pushConsent.js).
  const uid = useUid();
  const {
    consent: pushConsent,
    update: updatePushConsent,
    loading: pushLoading,
  } = usePushSettings();
  const [pushBusy, setPushBusy] = useState(false);
  // Old native binaries without FirebaseMessaging keep every reminder on
  // the phone; push is set up only where the delivery channel exists.
  const pushOffered = isRemotePushOffered();
  const streakDelivery: ReminderDelivery = reminderDelivery(
    "streak",
    streakReminder.enabled,
    pushConsent
  );
  const reviewDelivery: ReminderDelivery = reminderDelivery(
    "review",
    !!reviewReminder?.enabled,
    pushConsent
  );

  /**
   * The app's own move to push (App1 Q26), when a reminder push can carry,
   * or a push-only kind, is turned on and this device can take push. True
   * when push is on afterwards.
   *
   * The streak's and review's choices are written in their new shape
   * first, as they read now: their old fields read the push switch, so
   * push coming on must not turn either of them on by itself. The
   * push-only kinds stay off unless one of them is what was asked for
   * (`pushTurnedOn`). A device that cannot take push keeps the reminder on
   * the phone, and nothing is said: it still arrives.
   */
  const setUpPush = async (
    asked: Partial<Record<PushOnlyType, boolean>> = {}
  ): Promise<boolean> => {
    if (!uid || !pushOffered || pushLoading) return false;
    if (pushConsent.enabled) {
      if (Object.keys(asked).length === 0) return true;
      return await updatePushConsent(asked);
    }
    try {
      if (!(await isPushSupported())) return false;
      if (!(await requestRemotePushPermission())) return false;
      const registered = await registerDeviceToken(uid);
      if (!registered.ok) {
        logger.warn("[Notifications] push could not be set up", registered);
        return false;
      }
      await updateStreakReminder({
        enabled: streakReminder.enabled,
        time: streakReminder.time,
      });
      if (reviewReminder && updateReviewReminder)
        await updateReviewReminder({ enabled: reviewReminder.enabled });
      return await updatePushConsent(pushTurnedOn(asked));
    } catch (err) {
      logger.warn("[Notifications] push could not be set up", err);
      return false;
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
        toast.error(
          "This device isn’t set up for push yet. Turn the reminder off and on again."
        );
      } else {
        // Surface the FCM reason/detail so a non-delivering send is diagnosable
        // (e.g. send-failed: messaging/third-party-auth-error).
        const why = data.detail
          ? `${data.reason ?? "failed"}: ${data.detail}`
          : (data.reason ?? "unknown");
        toast.error(`Couldn’t send the test push (${why}).`);
      }
    } catch (err) {
      const code =
        (err as { code?: string; message?: string })?.code ??
        (err as { message?: string })?.message ??
        "error";
      toast.error(`Couldn’t send the test push (${code}).`);
    }
  };

  const [permission, setPermission] =
    useState<NotificationPermissionState>("default");
  const [pending, setPending] = useState<PendingNotification[]>([]);
  const active = useRef(false);
  const pendingRead = useRef(0);
  const permissionRead = useRef(0);
  const refreshPermission = useCallback(() => {
    const mine = ++permissionRead.current;
    void getNotificationPermissionState().then((next) => {
      if (active.current && mine === permissionRead.current)
        setPermission(next);
    });
  }, []);
  const refreshPending = useCallback(() => {
    const mine = ++pendingRead.current;
    void getPendingNotifications().then((next) => {
      if (active.current && mine === pendingRead.current) setPending(next);
    });
  }, [setPending]);
  useEffect(() => {
    active.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      refreshPermission();
      refreshPending();
    };
    // Coalesce a cancel/rebuild pass, but listen to completed OS mutations
    // rather than racing the reminder effects after a preference write.
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(refreshPending, 0);
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const stop = subscribeNotificationScheduleChanges(changed);
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active.current = false;
      clearTimeout(timer);
      stop();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshPending, refreshPermission]);

  const saveMeal = async (update: Partial<MealReminders>) => {
    try {
      await updateMealReminders(update);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t save reminder settings. Try again."
      );
    }
  };
  const saveWorkoutReminders = async (update: Partial<WorkoutReminders>) => {
    try {
      await updateWorkoutReminders(update);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t save reminder settings. Try again."
      );
    }
  };
  const mealDisabled = !!(
    mealStatus?.loading ||
    mealStatus?.failed ||
    mealStatus?.saving
  );
  const workoutDisabled = !!(
    workoutStatus?.loading ||
    workoutStatus?.failed ||
    workoutStatus?.saving
  );

  const handleTestNotification = async (kind: TestNotificationKind) => {
    haptic("light");
    const ok = await sendTestNotification(kind);
    if (ok) {
      toast.success(
        "Test notification sent. It should arrive in a few seconds."
      );
      // Refresh pending so the test notification appears in the list
      // (and disappears once it fires).
      refreshPending();
    } else {
      toast.error("Couldn’t send test. Check notification permission.");
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
   * The soonest pending notification of a reminder: meals by their
   * titles, the rest by their ids. The workout reminder's title names its
   * session ("Upper A today") and the streak's says "An evening reminder",
   * so no title search could find either.
   */
  const nextForCategory = (
    kind: TestNotificationKind
  ): PendingNotification | null => {
    if (kind === "generic") return null;
    const ids: Partial<Record<TestNotificationKind, readonly number[]>> = {
      workout: WORKOUT_REMINDER_IDS,
      streak: [STREAK_NOTIFICATION_ID, FIRST_WEEK_NOTIFICATION_ID],
      review: [REVIEW_NOTIFICATION_ID],
    };
    const known = ids[kind];
    const needles = ["meal", "breakfast", "lunch", "dinner", "eat"];
    const candidates = pending.filter((p) => {
      if (known) return known.includes(p.id);
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

  const streakReminderOn = streakReminder.enabled;
  const anyReminderOn =
    mealReminders.enabled || workoutReminders.enabled || streakReminderOn;
  /* The review's notification is on by default for anyone who has allowed
     notifications (Mob2 call 10), so its switch reads on only once they
     have: a switch never shows on while nothing can arrive. It stays out
     of the blocked banner, which is for reminders the person turned on. */
  const reviewReminderOn =
    !!reviewReminder?.enabled && permission === "granted";

  return (
    <AccordionSection
      inline={inline}
      icon={<Bell className="size-5 text-primary" />}
      title="Notifications"
      subtitle="Meal, workout, review and streak reminders"
    >
      {(mealStatus?.failed || workoutStatus?.failed) && (
        <Banner
          variant="neutral"
          title="Reminder settings unavailable"
          description="Try again to change meal or workout reminders."
          action={
            <Button
              variant="ghost"
              onClick={() => {
                if (mealStatus?.failed) mealStatus.retry();
                if (workoutStatus?.failed) workoutStatus.retry();
              }}
            >
              Try again
            </Button>
          }
        />
      )}
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
              Reminders won’t fire until you enable notifications for Tropos in
              your device settings.
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
              When it’s time to eat
            </p>
          </div>
          <Toggle
            className="ml-auto"
            checked={mealReminders.enabled}
            label="Toggle meal reminders"
            disabled={
              mealStatus?.loading ||
              mealStatus?.failed ||
              (mealStatus?.saving && !mealReminders.enabled)
            }
            onChange={async () => {
              haptic("light");
              const next = !mealReminders.enabled;
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "meal_reminders",
                value: next,
              });
              if (next) {
                /* Route via lib/notifications.requestNotificationPermission
                   so iOS Capacitor triggers a native LocalNotifications
                   prompt rather than the WebView Notification API
                   (which doesn't surface an iOS system prompt). */
                const granted = await requestNotificationPermission();
                refreshPermission();
                if (!granted) {
                  toast.error(
                    "Allow notifications in your device settings to turn this on."
                  );
                  return;
                }
              }
              await saveMeal({ enabled: next });
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
                    disabled={mealDisabled}
                    onChange={() => {
                      haptic("light");
                      saveMeal({
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
                    saveMeal({
                      [meal]: { ...mealReminders[meal], time: e.target.value },
                    })
                  }
                  className="ds-input ml-auto w-auto min-w-0 max-w-full text-sm"
                  disabled={mealDisabled || !mealReminders[meal].enabled}
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
            disabled={
              workoutStatus?.loading ||
              workoutStatus?.failed ||
              (workoutStatus?.saving && !workoutReminders.enabled)
            }
            onChange={async () => {
              haptic("light");
              const next = !workoutReminders.enabled;
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "workout_reminders",
                value: next,
              });
              if (next) {
                /* Route via lib/notifications.requestNotificationPermission
                   so iOS Capacitor triggers a native LocalNotifications
                   prompt rather than the WebView Notification API
                   (which doesn't surface an iOS system prompt). */
                const granted = await requestNotificationPermission();
                refreshPermission();
                if (!granted) {
                  toast.error(
                    "Allow notifications in your device settings to turn this on."
                  );
                  return;
                }
              }
              await saveWorkoutReminders({ enabled: next });
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
              disabled={workoutDisabled}
              value={workoutReminders.time}
              onChange={(e) => saveWorkoutReminders({ time: e.target.value })}
              className="ds-input ml-auto w-auto min-w-0 max-w-full text-sm"
            />
          </div>
        )}
      </div>

      {/* The Monday review (Mob2 call 10): on unless turned off, and
          only sent when a review is waiting. One switch: from the phone,
          or by push when push carries it, at the same 09:00 (App1 Q26). */}
      {reviewReminder && updateReviewReminder && (
        <div className="space-y-3">
          <div className={ROW}>
            <div className={LABEL}>
              <p className="text-sm text-foreground">Weekly review</p>
              <p className="text-xs text-muted-foreground">
                Monday at 09:00, when last week’s review is ready
              </p>
            </div>
            <Toggle
              className="ml-auto"
              checked={reviewReminderOn}
              label="Toggle weekly review notification"
              disabled={remindersLoading}
              onChange={async () => {
                haptic("light");
                const next = !reviewReminderOn;
                try {
                  if (next) {
                    // As the streak's switch: never on after a refusal.
                    const granted = await requestNotificationPermission();
                    refreshPermission();
                    if (!granted) {
                      toast.error(
                        "Allow notifications in your device settings to turn this on."
                      );
                      return;
                    }
                    // Push carries it where this device can take push.
                    await setUpPush();
                  }
                  await updateReviewReminder({ enabled: next });
                  trackSettingsEvent("settings_toggle_changed", {
                    toggle: "review_reminder",
                    value: next,
                  });
                } catch {
                  toast.error("Couldn’t save reminder settings. Try again.");
                }
              }}
            />
          </div>
          {reviewReminderOn && (
            <ReminderDiagnostics
              next={nextForCategory("review")}
              formatNextFire={formatNextFire}
              delivery={reviewDelivery}
              onTest={() =>
                reviewDelivery === "push"
                  ? void handleTestPush()
                  : void handleTestNotification("review")
              }
            />
          )}
        </div>
      )}

      {/* Streak: one switch and one time (App1 Q26). From the phone, or by
          push when push carries it, at the same hour. */}
      <div className="space-y-3">
        <div className={ROW}>
          <div className={LABEL}>
            <p className="text-sm text-foreground">Streak</p>
            <p className="text-xs text-muted-foreground">
              If you haven’t logged today
            </p>
          </div>
          <Toggle
            className="ml-auto"
            checked={streakReminderOn}
            label="Toggle streak reminder"
            disabled={remindersLoading}
            onChange={async () => {
              haptic("light");
              const next = !streakReminderOn;
              try {
                if (next) {
                  /* The native LocalNotifications permission is the one
                     an iPhone also uses for push. Never show an enabled
                     switch after a denied system request. */
                  const granted = await requestNotificationPermission();
                  refreshPermission();
                  if (!granted) {
                    toast.error(
                      "Allow notifications in your device settings to turn this on."
                    );
                    return;
                  }
                  // Push carries it where this device can take push.
                  await setUpPush();
                }
                await updateStreakReminder({ enabled: next });
                trackSettingsEvent("settings_toggle_changed", {
                  toggle: "streak_reminder",
                  value: next,
                });
              } catch {
                toast.error("Couldn’t save reminder settings. Try again.");
              }
            }}
          />
        </div>

        {streakReminderOn && (
          <ReminderDiagnostics
            next={nextForCategory("streak")}
            formatNextFire={formatNextFire}
            delivery={streakDelivery}
            onTest={() =>
              streakDelivery === "push"
                ? void handleTestPush()
                : void handleTestNotification("streak")
            }
          />
        )}

        {streakReminderOn && (
          <div className={ROW}>
            <span className="text-sm text-foreground">Reminder time</span>
            {/* Whole hours, 08:00 to 21:00: the same time by either
                channel (STREAK_REMINDER_HOURS). */}
            <Select
              aria-label="Streak reminder time"
              value={streakReminder.time}
              disabled={remindersLoading}
              onChange={(e) => {
                void updateStreakReminder({ time: e.target.value }).catch(
                  () => {
                    toast.error("Couldn’t save reminder time. Try again.");
                  }
                );
              }}
              className="ml-auto w-auto min-w-0 max-w-full"
              fieldClassName="text-sm font-mono tabular-nums"
            >
              {STREAK_REMINDER_HOURS.map((hour) => {
                const time = `${String(hour).padStart(2, "0")}:00`;
                return (
                  <option key={time} value={time}>
                    {time}
                  </option>
                );
              })}
            </Select>
          </div>
        )}
      </div>

      {/* The kinds only the server can send (#969): a switch each, shown
          where this device can take push. Turning one on sets push up;
          each sender checks its flag (mayTargetUserConsent in
          functions/lib/pushConsent.js). */}
      {pushOffered && (
        <div className="space-y-3">
          <SectionHeading size="compact" className="px-1">
            Badges and challenges
          </SectionHeading>
          {PUSH_ONLY_ROWS.map(([type, label, description]) => (
            <div key={type} className={ROW}>
              <div className={LABEL}>
                <p className="text-sm text-foreground">{label}</p>
                {description && (
                  <p className="text-xs text-muted-foreground">{description}</p>
                )}
              </div>
              <Toggle
                className="ml-auto"
                checked={pushConsent.enabled && pushConsent[type]}
                label={`Toggle ${label} push`}
                disabled={pushLoading || pushBusy || remindersLoading}
                onChange={async () => {
                  if (pushBusy || pushLoading) return;
                  haptic("light");
                  setPushBusy(true);
                  const next = !(pushConsent.enabled && pushConsent[type]);
                  try {
                    const saved = pushConsent.enabled
                      ? await updatePushConsent({ [type]: next })
                      : await setUpPush({ [type]: true });
                    if (saved) {
                      trackSettingsEvent("settings_toggle_changed", {
                        toggle: `push_${type}`,
                        value: next,
                      });
                    } else if (!pushConsent.enabled) {
                      refreshPermission();
                      toast.error(
                        "Allow notifications for Tropos in your device settings, then try again."
                      );
                    }
                  } catch {
                    toast.error(
                      "Couldn’t save notification settings. Try again when you’re online."
                    );
                  } finally {
                    setPushBusy(false);
                  }
                }}
              />
            </div>
          ))}
          {!isNativePlatform() && (
            <p className="px-1 text-xs text-muted-foreground">
              On iPhone, add Tropos to your Home Screen in Safari, then open it
              from that icon to get these.
            </p>
          )}
        </div>
      )}
    </AccordionSection>
  );
}

/**
 * Per-reminder diagnostics strip. Surfaces:
 *   - "Next: <relative time>" when an OS-scheduled notification
 *     matches the category (or a tab-open caveat when on web).
 *   - For a reminder push carries (`delivery` "push"), that it arrives
 *     with the app closed: the server sends it, so the phone holds no
 *     schedule to show, and "No reminder is scheduled" would be false.
 *   - "Send test" button — fires a notification in +3s with stable
 *     ID per category so repeated taps replace rather than queue (a test
 *     push, for a reminder push carries).
 *
 * Lives at the top of each enabled-reminder block so users can
 * verify their device-level setup without waiting for the real
 * reminder fire-time.
 */
export function ReminderDiagnostics({
  next,
  formatNextFire,
  onTest,
  delivery = "local",
}: {
  next: PendingNotification | null;
  formatNextFire: (iso: string | null) => string | null;
  onTest: () => void;
  delivery?: ReminderDelivery;
}) {
  const relative =
    delivery === "local" && next ? formatNextFire(next.scheduleAt) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-lg bg-muted/60 border border-border/40">
      <div className={cn(LABEL, "text-xs text-muted-foreground")}>
        {delivery === "push" ? (
          <span>Arrives even with the app closed.</span>
        ) : relative ? (
          <>
            Next:{" "}
            <span className="font-medium text-foreground">{relative}</span>
          </>
        ) : (
          // Empty pending list on web is the default state — explain
          // the actual behaviour so users don't think the reminder
          // is broken.
          <span>
            {isNativePlatform()
              ? "No reminder is scheduled."
              : "Reminders fire while this tab is open."}
          </span>
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
