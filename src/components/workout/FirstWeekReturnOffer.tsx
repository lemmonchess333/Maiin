import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { isActivationJourneyV2 } from "@/lib/activationJourney";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { daysSinceStart, startDayKey } from "@/lib/startDay";
import { FIRST_WEEK_DAYS } from "@/lib/firstWeek";
import { usePushSettings } from "@/hooks/usePushSettings";
import {
  useStreakReminder,
  useWorkoutReminders,
} from "@/hooks/RemindersProvider";
import { useFirstSessionReturnChoice } from "@/hooks/useFirstSessionReturnChoice";
import {
  getRemotePushPermissionState,
  isPushSupported,
  registerDeviceToken,
  requestRemotePushPermission,
  unregisterDeviceToken,
} from "@/lib/pushNotifications";
import { getNotificationPermissionState } from "@/lib/notifications";
import { isNativePlatform } from "@/lib/platform";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import Card from "@/components/ui/Card";

type Channel = "push" | "local" | "none" | "loading";

/** An optional return prompt after a persisted lift or run, never on mount. */
export default function FirstWeekReturnOffer({
  kind,
}: {
  kind: "lift" | "run";
}) {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const todayKey = useLocalDateKey();
  const day = daysSinceStart(
    startDayKey(profile?.onboardingCompletedAt),
    todayKey
  );
  const inFirstWeek =
    isActivationJourneyV2(profile) &&
    day !== null &&
    day >= 1 &&
    day <= FIRST_WEEK_DAYS;
  const navigate = useNavigate();
  const {
    consent,
    update,
    loading: pushLoading,
    configured,
    failed: pushFailed,
  } = usePushSettings();
  const {
    prefs,
    loading: localLoading,
    updatePrefs,
    requestPermission,
  } = useStreakReminder();
  // Setup's reminder row turns training-day reminders on: someone who said
  // yes there has already answered this.
  const { reminders: workoutReminders, loading: workoutRemindersLoading } =
    useWorkoutReminders();
  const choice = useFirstSessionReturnChoice();
  const [support, setSupport] = useState<{
    uid: string | null;
    channel: Channel;
  }>({
    uid: null,
    channel: "loading",
  });
  const channel = support.uid === uid ? support.channel : "loading";
  const [busy, setBusy] = useState(false);
  const [deniedUid, setDeniedUid] = useState<string | null>(null);
  const [error, setError] = useState<{ uid: string; message: string } | null>(
    null
  );
  const errorMessage = error?.uid === uid ? error.message : null;
  const viewedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!inFirstWeek || !uid) return;
    let cancelled = false;
    void isPushSupported().then((supported) => {
      if (cancelled) return;
      setSupport({
        uid,
        channel: supported ? "push" : isNativePlatform() ? "local" : "none",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [inFirstWeek, uid]);

  const ready =
    !!uid &&
    inFirstWeek &&
    channel !== "loading" &&
    channel !== "none" &&
    !pushLoading &&
    !pushFailed &&
    !configured &&
    !consent.enabled &&
    !localLoading &&
    !prefs.primingShown &&
    !workoutRemindersLoading &&
    !workoutReminders.enabled &&
    !choice.loading &&
    !choice.failed &&
    !choice.response;
  const deniedHere = !!uid && deniedUid === uid;
  const visible = ready || deniedHere;

  useEffect(() => {
    if (!ready || !uid || day === null) return;
    const key = `${uid}:${kind}:${todayKey}`;
    if (viewedRef.current === key) return;
    viewedRef.current = key;
    trackLifecycle("first_week_reminder_offered", {
      kind,
      firstWeekDay: day,
      reminderChannel: channel === "push" ? "push" : "local",
    });
  }, [ready, uid, kind, todayKey, day, channel]);

  const trackChoice = (
    outcome: "enabled" | "later" | "denied" | "setup_failed"
  ) => {
    if (day === null) return;
    trackLifecycle("first_week_reminder_choice", {
      kind,
      firstWeekDay: day,
      reminderChannel: channel === "push" ? "push" : "local",
      reminderOutcome: outcome,
    });
  };

  const handleDenied = async () => {
    setDeniedUid(uid);
    setError(null);
    trackChoice("denied");
    try {
      await choice.record("denied");
    } catch (cause) {
      logger.warn("[return-reminder] denied answer save failed", cause);
    }
  };

  const handleEnable = async () => {
    if (!uid || busy || !ready) return;
    const ownerUid = uid;
    setBusy(true);
    setError(null);
    try {
      const permissionFailed = () => {
        setError({
          uid: ownerUid,
          message: "Couldn't request notification permission. Try again.",
        });
        trackChoice("setup_failed");
      };
      if (channel === "push") {
        if (!(await requestRemotePushPermission())) {
          if ((await getRemotePushPermissionState()) === "denied") {
            await handleDenied();
          } else {
            permissionFailed();
          }
          return;
        }
        if (auth.currentUser?.uid !== ownerUid) return;
        const registration = await registerDeviceToken(ownerUid);
        if (!registration.ok) {
          if (registration.reason === "account-changed") return;
          setError({
            uid: ownerUid,
            message: "Couldn't connect this device. Try again.",
          });
          trackChoice("setup_failed");
          return;
        }
        if (auth.currentUser?.uid !== ownerUid) return;
        try {
          // This entry opts in to evening nudges only. Recap and badge
          // notifications remain a separate choice in Settings.
          if (
            !(await update({
              enabled: true,
              streak: true,
              recap: false,
              badge: false,
            }))
          ) {
            return;
          }
        } catch (cause) {
          await unregisterDeviceToken(ownerUid).catch((releaseError) => {
            logger.warn(
              "[return-reminder] device release failed",
              releaseError
            );
          });
          throw cause;
        }
      } else if (channel === "local") {
        if (!(await requestPermission())) {
          if ((await getNotificationPermissionState()) === "denied") {
            await handleDenied();
          } else {
            permissionFailed();
          }
          return;
        }
        if (auth.currentUser?.uid !== ownerUid) return;
        await updatePrefs({ enabled: true, primingShown: true });
        if (auth.currentUser?.uid !== ownerUid) return;
      } else {
        return;
      }
      trackChoice("enabled");
      try {
        await choice.record("accepted");
      } catch (cause) {
        // The confirmed consent still hides this offer on every device.
        logger.warn("[return-reminder] accepted answer save failed", cause);
      }
      toast.success("Evening reminders are on.");
    } catch (cause) {
      logger.error("[return-reminder] setup failed", cause);
      setError({
        uid: ownerUid,
        message: "Couldn't turn on reminders. Check your connection and retry.",
      });
      trackChoice("setup_failed");
    } finally {
      setBusy(false);
    }
  };

  const handleLater = async () => {
    if (!uid || busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      if (await choice.record("later")) trackChoice("later");
    } catch (cause) {
      logger.error("[return-reminder] later answer save failed", cause);
      setError({ uid, message: "Couldn't save your choice. Try again." });
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;
  if (deniedHere) {
    return (
      <Card size="compact" as="section" aria-label="Reminder permission">
        <p className="text-base font-bold text-foreground">
          Notifications are blocked
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Reminders are still off. You can enable them later in Settings.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => navigate("/settings/notifications")}
        >
          Open notification settings
        </Button>
      </Card>
    );
  }
  return (
    <Card size="compact" as="section" aria-label="Evening reminders">
      <h3 className="text-base font-bold text-foreground">
        Keep the next day going
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Get an evening nudge tomorrow if you haven&apos;t logged. Reminders can
        continue as your streak grows. Change this in Settings.
      </p>
      {errorMessage && (
        <p role="alert" className="mt-2 text-sm text-destructive-strong">
          {errorMessage}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => void handleEnable()} loading={busy}>
          Turn on reminders
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void handleLater()}
        >
          Not now
        </Button>
      </div>
    </Card>
  );
}
