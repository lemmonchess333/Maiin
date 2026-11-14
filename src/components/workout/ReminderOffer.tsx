import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { daysSinceStart, startDayKey } from "@/lib/startDay";
import { useWorkoutReminders } from "@/hooks/RemindersProvider";
import { usePushSettings } from "@/hooks/usePushSettings";
import {
  isRemotePushOffered,
  registerDeviceToken,
  requestRemotePushPermission,
} from "@/lib/pushNotifications";
import { logger } from "@/lib/logger";
import { useFirstSessionReturnChoice } from "@/hooks/useFirstSessionReturnChoice";
import {
  reminderPreview,
  SETUP_REMINDER_TIME,
} from "@/lib/workoutReminderCopy";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import InlineNumerals from "@/components/ui/InlineNumerals";

/**
 * The app's one ask for notifications (owner, Q66, 13 Nov 2026): on a saved
 * session's finish screen, the training-day reminder, offered by naming the
 * next session ("Remind you before Pull B?") with the day and time it would
 * go off, and Not now. Asked once, account-wide, of every account, the
 * first time a session is saved without an answer on file.
 *
 * One yes turns on everything that needs the phone's permission, since on
 * an iPhone one permission covers both: the training-day reminder, scheduled
 * on the phone, and the server's pushes (the streak nudge, the weekly recap,
 * a badge), which until then were asked for only from a switch in Settings,
 * so almost no one had them. It replaces setup's reminder row (Mob1 call 3)
 * and the evening-reminder switch on the finish screen, and widens XB1 call
 * 8's first-week, new-journey-only offer. Fitbod and Hevy remind on training
 * days and name the workout; asking after the first session is when the next
 * one is real.
 */
export default function ReminderOffer({ kind }: { kind: "lift" | "run" }) {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const todayKey = useLocalDateKey();
  const day = daysSinceStart(
    startDayKey(profile?.onboardingCompletedAt),
    todayKey
  );
  const reminders = useWorkoutReminders();
  const push = usePushSettings();
  const pushOffered = isRemotePushOffered();
  const choice = useFirstSessionReturnChoice();
  const [busy, setBusy] = useState(false);
  const [refusedUid, setRefusedUid] = useState<string | null>(null);
  // Answered on this screen: the card goes at once, and a second tap
  // while the answer saves sends nothing again.
  const [answeredUid, setAnsweredUid] = useState<string | null>(null);
  const answering = useRef<string | null>(null);
  const viewed = useRef<string | null>(null);
  // Setup's time: the person has not chosen one, and Settings changes it.
  const time = SETUP_REMINDER_TIME;
  // The first reminder it would send, or null when it would never go off.
  const preview = reminderPreview(
    time,
    profile?.weekSchedule,
    reminders.liftName,
    new Date(),
    reminders.doneDay
  );
  const ready =
    !!uid &&
    !reminders.loading &&
    // A yes writes the push switch too, so wait until it has been read.
    (!pushOffered || !push.loading) &&
    !reminders.failed &&
    !reminders.reminders.enabled &&
    !!preview &&
    !choice.loading &&
    !choice.failed &&
    !choice.response;
  const refused = !!uid && refusedUid === uid;
  const answered = !!uid && answeredUid === uid;

  // The event keeps its first-week name so the funnel reads on; the day is
  // the account's own and may now be past its first week.
  const channel = pushOffered ? "push" : "local";
  useEffect(() => {
    if (!ready) return;
    const key = `${uid}:${kind}:${todayKey}`;
    if (viewed.current === key) return;
    viewed.current = key;
    trackLifecycle("first_week_reminder_offered", {
      kind,
      ...(day !== null ? { firstWeekDay: day } : {}),
      reminderChannel: channel,
    });
  }, [ready, uid, kind, todayKey, day, channel]);

  const answer = async (outcome: "enabled" | "later" | "denied") => {
    if (!uid || answering.current === uid) return;
    answering.current = uid;
    setAnsweredUid(uid);
    trackLifecycle("first_week_reminder_choice", {
      kind,
      ...(day !== null ? { firstWeekDay: day } : {}),
      reminderChannel: channel,
      reminderOutcome: outcome,
    });
    await choice
      .record(outcome === "enabled" ? "accepted" : outcome)
      .catch(() => {});
  };

  const enable = async () => {
    if (busy || !ready) return;
    setBusy(true);
    try {
      if (!(await reminders.requestPermission())) {
        setRefusedUid(uid);
        await answer("denied");
        return;
      }
      await reminders.updateReminders({ enabled: true, time });
      // The server's pushes ride on the same yes. The permission is already
      // granted (one covers both on an iPhone), so this asks nothing more;
      // a failure leaves the reminder on and push for Settings.
      if (pushOffered) await turnOnPush(uid);
      await answer("enabled");
      toast.success("Reminders are on");
    } catch {
      toast.error("Couldn’t turn on reminders. Try again.");
    } finally {
      setBusy(false);
    }
  };

  async function turnOnPush(forUid: string | null) {
    if (!forUid) return;
    try {
      if (!(await requestRemotePushPermission())) return;
      if (!(await push.update({ enabled: true }))) return;
      const registered = await registerDeviceToken(forUid);
      if (!registered.ok)
        logger.warn("[ReminderOffer] push registration failed", registered);
    } catch (err) {
      logger.warn("[ReminderOffer] push could not be turned on", err);
    }
  }

  if (refused)
    return (
      <Card size="compact" as="section" aria-label="Reminder permission">
        <p role="status" className="text-sm text-muted-foreground">
          Notifications are off for Tropos. Allow them in your phone’s Settings,
          then turn reminders on in Settings → Notifications.
        </p>
      </Card>
    );
  if (!ready || answered) return null;
  const next = reminders.liftName ?? "your next session";
  return (
    <Card size="compact" as="section" aria-label="Training-day reminder">
      <h3 className="text-base font-bold text-foreground">
        Remind you before {next}?
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        <InlineNumerals>{preview}</InlineNumerals>, then on each training day.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => void enable()} loading={busy}>
          Remind me
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void answer("later")}
        >
          Not now
        </Button>
      </div>
    </Card>
  );
}
