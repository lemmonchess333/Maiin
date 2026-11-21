/**
 * The one confirmation before a sport comes off the plan (TrainWk1 step 6;
 * the 18 November call 7): what stays, what goes, and the way back. Lift
 * plan's Stop lifting and Run plan's Stop running both ask it.
 *
 * What stays is everything the person logged: those sessions are saved
 * outside the plan, and a plan change never touches them.
 */
import { useId } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { Sport } from "@/lib/sportChange";

const WORDS: Record<
  Sport,
  { title: string; stays: string; goes: string; back: string; button: string }
> = {
  lifting: {
    title: "Stop lifting?",
    stays: "Your saved workouts and best lifts stay in Progress.",
    goes: "Your plan’s lift days come off your week.",
    back: "Add lifting here any time.",
    button: "Stop lifting",
  },
  running: {
    title: "Stop running?",
    stays: "Your saved runs, routes and bests stay in Progress.",
    goes: "Your plan’s run days come off your week.",
    back: "Add running here any time.",
    button: "Stop running",
  },
};

export default function StopSportDialog({
  sport,
  open,
  ends,
  busy,
  ready,
  onCancel,
  onConfirm,
}: {
  sport: Sport;
  open: boolean;
  /** A goal that ends with the sport, as a sentence ("Your 30-minute goal
   *  ends."), when there is one. */
  ends?: string | null;
  /** The save is under way. */
  busy: boolean;
  /** The programme has loaded: the change is built on it. */
  ready: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const words = WORDS[sport];
  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onCancel}
      role="alertdialog"
      labelledBy={titleId}
      size="md"
      overlayClassName="bg-black/60 z-[60]"
      className="z-[61] p-4 max-w-sm"
    >
      <div className="space-y-3">
        <h3 id={titleId} className="text-sm font-semibold text-foreground">
          {words.title}
        </h3>
        <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p>{words.stays}</p>
          <p>
            {words.goes}
            {ends ? ` ${ends}` : ""}
          </p>
          <p>{words.back}</p>
        </div>
        {/* Side by side, then stacked with the action on top once the two
            no longer fit (larger text), as setup's footer does. */}
        <div className="@container pt-1">
          <div className="flex gap-2 @max-[15em]:flex-col-reverse">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!ready}
              loading={busy}
              onClick={onConfirm}
            >
              {words.button}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
