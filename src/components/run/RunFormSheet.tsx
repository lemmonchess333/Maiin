import { useId, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import ExerciseFormFrames from "@/components/ExerciseFormFrames";
import { RUN_FORM_BEATS } from "@/lib/runForm";

/**
 * The running form guide in a sheet, over Train's Run tab. It plays as an
 * exercise's form guide does: the drawings, and the cues beneath them with
 * the one the drawing shows lit; a cue's number shows its frame.
 */
export default function RunFormSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cueId = useId();
  const [activeStep, setActiveStep] = useState(0);
  const [stepRequest, setStepRequest] = useState<{
    index: number;
    serial: number;
  }>();

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Running form">
      <div className="px-4 pb-6">
        <ExerciseFormFrames
          key={stepRequest?.serial ?? 0}
          beats={RUN_FORM_BEATS}
          name="Running"
          active={open}
          onStep={setActiveStep}
          initialIndex={stepRequest?.index}
          autoPlay={!stepRequest}
        />
        <div className="mt-4 flex flex-col gap-4">
          {RUN_FORM_BEATS.map((beat, i) => {
            const live = i === activeStep;
            return (
              <div key={beat.label} className="flex gap-2.5">
                <Button
                  variant="ghost"
                  className="shrink-0 px-3 font-mono tabular-nums"
                  aria-label={`Show frame ${i + 1}: ${beat.label}`}
                  aria-describedby={`${cueId}-${i}`}
                  aria-current={live ? "step" : undefined}
                  onClick={() =>
                    setStepRequest((previous) => ({
                      index: i,
                      serial: (previous?.serial ?? 0) + 1,
                    }))
                  }
                >
                  {i + 1}
                </Button>
                <p
                  id={`${cueId}-${i}`}
                  className={
                    live
                      ? "text-body leading-relaxed text-foreground motion-safe:transition-colors"
                      : "text-body leading-relaxed text-foreground/80 motion-safe:transition-colors"
                  }
                >
                  {beat.cue}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}
