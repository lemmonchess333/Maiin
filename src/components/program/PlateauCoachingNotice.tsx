import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";

interface PlateauCoachingNoticeProps {
  exerciseName: string;
  onSwap: () => void;
  onDismiss: () => void;
}

/**
 * Calm, dismissible coaching note shown under a lift row once `plateauCount`
 * reaches 2+, linking directly into the existing muscle-group variation picker.
 */
export default function PlateauCoachingNotice({
  exerciseName,
  onSwap,
  onDismiss,
}: PlateauCoachingNoticeProps) {
  return (
    <div
      role="note"
      aria-label={`Plateau note for ${exerciseName}`}
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-muted/40 px-3 py-2"
    >
      <p className="text-xs text-muted-foreground">
        Stalled across a couple of cycles. A fresh variation often restarts
        progress.
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            haptic("light");
            onSwap();
          }}
        >
          Swap variation
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            haptic("light");
            onDismiss();
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
