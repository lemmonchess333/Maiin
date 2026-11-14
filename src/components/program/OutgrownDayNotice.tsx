import { useState } from "react";
import { Clock } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * A lift day that runs well past the session length its plan is fitted to,
 * said under the day's card on Train (slice 4; the owner chose this notice,
 * B, on 12 November 2026, over a row at the top of the list with one
 * button and no way to say no). Two choices: rebuild the lift days for the
 * length, behind a confirmation since it remakes every day, or keep this
 * day as it is, which hides the notice until the day or the length changes.
 */
export default function OutgrownDayNotice({
  dayName,
  minutes,
  length,
  rebuilding,
  onRebuild,
  onKeep,
}: {
  dayName: string;
  /** The day as the app prices it. */
  minutes: number;
  /** The session length the plan is fitted to. */
  length: number;
  rebuilding: boolean;
  onRebuild: () => void;
  onKeep: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Banner
        variant="warning"
        icon={<Clock className="size-5" />}
        title={`${dayName} takes about ${String(minutes)} min`}
        description={`Your sessions are ${String(length)} min. Rebuild your plan to fit them, or keep this day as it is.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={rebuilding}
              onClick={() => setConfirming(true)}
            >
              {`Rebuild for ${String(length)} min`}
            </Button>
            <Button size="sm" variant="ghost" onClick={onKeep}>
              Keep this day
            </Button>
          </div>
        }
      />
      <ConfirmDialog
        open={confirming}
        title={`Rebuild your lift days for ${String(length)} min?`}
        description={`Each day is built again from your setup to fit ${String(length)} minutes. Your week and history stay, and each lift keeps its weight where a new day holds it. Lifts you added yourself may go.`}
        confirmLabel="Rebuild"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirming(false);
          onRebuild();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
