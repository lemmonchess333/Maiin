import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { useStreakReminder } from "@/hooks/RemindersProvider";
import { toast } from "@/lib/toast";
import FirstWeekReturnOffer from "@/components/workout/FirstWeekReturnOffer";

/** The saved-session reminder control, loaded only on the completion view. */
export default function CompletionReminderChoice({
  kind,
  activationJourneyV2,
}: {
  kind: "lift" | "run";
  activationJourneyV2: boolean;
}) {
  const { prefs, loading, updatePrefs, requestPermission } =
    useStreakReminder();
  const [pending, setPending] = useState(false);
  const enabled = prefs.enabled && prefs.primingShown;
  const changeReminder = async () => {
    if (pending) return;
    setPending(true);
    try {
      if (!enabled && !(await requestPermission())) {
        toast.error(
          "Allow notifications in your device settings to turn this on."
        );
        return;
      }
      await updatePrefs({ enabled: !enabled, primingShown: true });
    } catch {
      toast.error("Couldn't update the reminder. Try again.");
    } finally {
      setPending(false);
    }
  };

  if (activationJourneyV2) return <FirstWeekReturnOffer kind={kind} />;
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">
        Evening reminder if you haven't logged
      </span>
      <Toggle
        label="Evening reminder if you haven't logged"
        checked={enabled}
        disabled={loading || pending}
        onChange={() => {
          void changeReminder();
        }}
      />
    </div>
  );
}
