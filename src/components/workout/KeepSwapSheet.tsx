/**
 * The one question Finish asks about today's swaps (Lift4 (11)): keep them
 * in the plan, or not. Kept, each takes the planned lift's place from the
 * next session, starting from today's sets; not kept, the plan keeps its
 * lifts, which today's sets say nothing about. Closing it without an answer
 * saves nothing, and Finish asks again.
 */
import SectionLabel from "@/components/ui/SectionLabel";
import { ChoiceSheet, type Choice } from "@/components/ui/ChoiceSheet";

export interface SwapToKeep {
  /** The exercise done today. */
  today: string;
  /** The planned lift it stood in for. */
  planned: string;
}

interface KeepSwapSheetProps {
  open: boolean;
  swaps: SwapToKeep[];
  onDecide: (keep: boolean) => Promise<void>;
  onClose: () => void;
}

export default function KeepSwapSheet({
  open,
  swaps,
  onDecide,
  onClose,
}: KeepSwapSheetProps) {
  const one = swaps.length === 1 ? swaps[0] : null;
  const choices: Choice[] = [
    {
      id: "keep",
      label: one ? "Keep it in my plan" : "Keep them in my plan",
      sublabel: "From your next session, starting from today's sets",
      pendingLabel: "Saving…",
      variant: "primary",
      onSelect: () => onDecide(true),
    },
    {
      id: "today",
      label: "Just for today",
      sublabel: one
        ? `Your plan keeps ${one.planned}`
        : "Your plan keeps its lifts",
      pendingLabel: "Saving…",
      variant: "secondary",
      onSelect: () => onDecide(false),
    },
  ];
  return (
    <ChoiceSheet
      open={open}
      onClose={onClose}
      title={
        one ? `Keep ${one.today} in your plan?` : "Keep these in your plan?"
      }
      description="Today's swaps"
      hideHeader
      choices={choices}
      logTag="keepSwap"
    >
      <div>
        <SectionLabel>{one ? "Today's swap" : "Today's swaps"}</SectionLabel>
        <p className="text-base font-semibold text-foreground mt-0.5">
          {one ? `Keep ${one.today} in your plan?` : "Keep these in your plan?"}
        </p>
      </div>
      {one ? (
        <p className="text-sm text-muted-foreground">
          {`It would take ${one.planned}'s place from your next session.`}
        </p>
      ) : (
        <ul className="text-sm text-muted-foreground space-y-1">
          {swaps.map((swap) => (
            <li key={`${swap.today}-${swap.planned}`}>
              {`${swap.today} in place of ${swap.planned}`}
            </li>
          ))}
        </ul>
      )}
    </ChoiceSheet>
  );
}
