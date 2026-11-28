import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import {
  EXERCISE_REST_PRESETS,
  formatRestChipLabel,
} from "@/lib/exerciseRestOverrides";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

interface ExerciseRestSheetProps {
  open: boolean;
  exerciseName: string;
  defaultSeconds: number;
  overrideSeconds: number | null;
  onSelect: (seconds: number | null) => void;
  onClose: () => void;
}

export default function ExerciseRestSheet({
  open,
  exerciseName,
  defaultSeconds,
  overrideSeconds,
  onSelect,
  onClose,
}: ExerciseRestSheetProps) {
  const choose = (seconds: number | null) => {
    haptic("light");
    onSelect(seconds);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`Rest for ${exerciseName}`}
      description="Saved for this exercise on this device."
    >
      <div className="space-y-4 px-4">
        <Button
          variant="outline"
          fullWidth
          onClick={() => choose(null)}
          aria-pressed={overrideSeconds === null}
          className={cn(
            "justify-between rounded-xl px-4 text-left text-sm",
            overrideSeconds === null
              ? "border-primary/40 bg-primary/10 font-semibold text-foreground"
              : "font-normal text-foreground"
          )}
        >
          <span>Plan default</span>
          <span className="font-mono tabular-nums text-muted-foreground">
            {formatRestChipLabel(defaultSeconds)}
          </span>
        </Button>

        <div className="grid grid-cols-4 gap-2">
          {EXERCISE_REST_PRESETS.map((seconds) => {
            const active = overrideSeconds === seconds;
            return (
              <Button
                key={seconds}
                variant="outline"
                onClick={() => choose(seconds)}
                aria-pressed={active}
                className={cn(
                  "rounded-xl px-2 text-sm font-mono tabular-nums",
                  active
                    ? "border-primary/40 bg-primary/10 font-semibold text-foreground"
                    : "font-normal text-foreground"
                )}
              >
                {formatRestChipLabel(seconds)}
              </Button>
            );
          })}
        </div>

        <Button variant="ghost" fullWidth onClick={onClose}>
          Done
        </Button>
      </div>
    </BottomSheet>
  );
}
