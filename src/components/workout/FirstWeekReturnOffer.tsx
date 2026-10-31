import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isActivationJourneyV2 } from "@/lib/activationJourney";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { daysSinceStart, startDayKey } from "@/lib/startDay";
import { FIRST_WEEK_DAYS } from "@/lib/firstWeek";
import { useWorkoutReminders } from "@/hooks/RemindersProvider";
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
 * A v2 account's one reminder ask in its first week (XB1 call 8): the
 * training-day reminder, offered on a saved session's finish screen by
 * naming the next session ("Remind you before Pull B?") with the day and
 * time it would go off, and Not now. Asked once, account-wide. Nothing is
 * asked when setup's reminder row already turned it on. The streak-style
 * evening nudge is not offered to a v2 account; Fitbod and Hevy remind on
 * training days and name the workout.
 */
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
  const reminders = useWorkoutReminders();
  const choice = useFirstSessionReturnChoice();
  const [busy, setBusy] = useState(false);
  const [refusedUid, setRefusedUid] = useState<string | null>(null);
  const viewed = useRef<string | null>(null);
  // Setup's time: the person has not chosen one, and Settings changes it.
  const time = SETUP_REMINDER_TIME;
  // The first reminder it would send, or null when it would never go off.
  const preview = reminderPreview(
    time,
    profile?.weekSchedule,
    reminders.liftName
  );
  const ready =
    !!uid &&
    isActivationJourneyV2(profile) &&
    day !== null &&
    day >= 1 &&
    day <= FIRST_WEEK_DAYS &&
    !reminders.loading &&
    !reminders.reminders.enabled &&
    !!preview &&
    !choice.loading &&
    !choice.failed &&
    !choice.response;
  const refused = !!uid && refusedUid === uid;

  useEffect(() => {
    if (!ready || day === null) return;
    const key = `${uid}:${kind}:${todayKey}`;
    if (viewed.current === key) return;
    viewed.current = key;
    trackLifecycle("first_week_reminder_offered", {
      kind,
      firstWeekDay: day,
      reminderChannel: "local",
    });
  }, [ready, uid, kind, todayKey, day]);

  const answer = async (outcome: "enabled" | "later" | "denied") => {
    if (day !== null)
      trackLifecycle("first_week_reminder_choice", {
        kind,
        firstWeekDay: day,
        reminderChannel: "local",
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
      await answer("enabled");
      toast.success("Training-day reminders are on");
    } catch {
      toast.error("Couldn't turn on reminders. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (refused)
    return (
      <Card size="compact" as="section" aria-label="Reminder permission">
        <p role="status" className="text-sm text-muted-foreground">
          Notifications are off for Tropos. Allow them in your phone&apos;s
          Settings, then turn reminders on in Settings → Notifications.
        </p>
      </Card>
    );
  if (!ready) return null;
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
