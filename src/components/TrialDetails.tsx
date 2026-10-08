/**
 * The store trial on the Upgrade page's Pro card (Sub1, STATUS 2026-10-06):
 * when it ends, what it costs after, the last moment to cancel, and a way
 * to have this phone remind them.
 *
 * Right after a purchase the page swaps its offer for this card, so this is
 * where the reminder is offered "right after the trial starts". The offer
 * asks for notification permission once; saying no changes nothing else.
 * The phone's reminder goes at the instant the server chose for the email
 * (`trialPhoneReminder`), and useTrialReminder keeps it scheduled after
 * that. Nothing here promises the email: the paywall and this card say so
 * once a live reminder has reached a Hide My Email address.
 */
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import type { SubscriptionTrial } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import {
  cancelByText,
  trialEndDayText,
  trialPhoneReminder,
  trialPriceText,
} from "@/lib/subscriptionTrial";
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  scheduleNotification,
  type NotificationPermissionState,
} from "@/lib/notifications";
import { TRIAL_NOTIFICATION_ID } from "@/hooks/useTrialReminder";
import { formatTimeOfDay, formatWeekdayDayMonth } from "@/utils/formatters";

export default function TrialDetails({ trial }: { trial: SubscriptionTrial }) {
  const endDay = trialEndDayText(trial);
  const deadline = cancelByText(trial);
  if (!endDay || !deadline) return null;
  if (!trial.willRenew) {
    return (
      <p className="text-sm text-muted-foreground">
        You&apos;ve turned off renewal, so nothing will be charged. Pro stays on
        until {endDay}.
      </p>
    );
  }
  const price = trialPriceText(trial);
  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground">Free trial until {endDay}.</p>
      <p className="text-sm text-muted-foreground">
        {price
          ? `Then ${price}, unless you cancel by ${deadline}.`
          : `Then your subscription starts, unless you cancel by ${deadline}.`}
      </p>
      <PhoneReminderOffer trial={trial} />
    </div>
  );
}

function PhoneReminderOffer({ trial }: { trial: SubscriptionTrial }) {
  const [permission, setPermission] =
    useState<NotificationPermissionState | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let live = true;
    void getNotificationPermissionState().then((state) => {
      if (live) setPermission(state);
    });
    return () => {
      live = false;
    };
  }, []);

  const reminder = trialPhoneReminder(trial, new Date());
  if (!reminder || permission === null) return null;

  if (permission === "granted") {
    return (
      <p className="text-xs text-muted-foreground">
        You&apos;ll get a reminder on this phone at{" "}
        {formatTimeOfDay(reminder.fireAt)} on{" "}
        {formatWeekdayDayMonth(reminder.fireAt)}.
      </p>
    );
  }
  // Declined before, or no notifications here: the system will not ask
  // again, so there is nothing to offer.
  if (permission !== "default") return null;

  const ask = async () => {
    setAsking(true);
    const granted = await requestNotificationPermission();
    if (granted) {
      // useTrialReminder schedules on its next pass; this one is now.
      await scheduleNotification({
        id: TRIAL_NOTIFICATION_ID,
        title: reminder.title,
        body: reminder.body,
        scheduleAt: reminder.fireAt,
      });
    }
    setPermission(granted ? "granted" : "denied");
    setAsking(false);
  };

  return (
    <Button
      variant="secondary"
      fullWidth
      onClick={() => void ask()}
      disabled={asking}
    >
      <Bell className="size-4" aria-hidden="true" />
      Remind me before the trial ends
    </Button>
  );
}
