// The display register's wide italic cut, as the rest band loads it.
import "@fontsource-variable/archivo/wdth-italic.css";
import { Volume2, VolumeX, X } from "lucide-react";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import {
  CIRCUIT_SIDED_LINE,
  circuitPlaceLine,
  circuitStepEyebrow,
  circuitStepHeading,
} from "@/features/circuit/circuitCopy";
import type { CircuitStep } from "@/features/circuit/circuitSteps";
import type { Circuit } from "@/features/circuit/circuitTypes";
import { formatClock } from "@/utils/formatters";
import { cn } from "@/lib/utils";

/**
 * A circuit under way (Circ1 (10)): the step's countdown as the live
 * screen's one display figure, in the rest band's cut (DS4 rule 6), the
 * move worked or the one next with its drawing, and where you are in the
 * circuit. Work is lifting's purple; a rest and the count in stay neutral.
 */
export default function CircuitRunner({
  circuit,
  step,
  secondsLeft,
  stepDone,
  paused,
  voice,
  onPause,
  onResume,
  onSkip,
  onEnd,
  onToggleVoice,
}: {
  circuit: Circuit;
  step: CircuitStep;
  secondsLeft: number;
  /** How much of the step has run, 0 to 1. */
  stepDone: number;
  paused: boolean;
  voice: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onEnd: () => void;
  onToggleVoice: () => void;
}) {
  const work = step.kind === "work";
  const heading = circuitStepHeading(step);
  return (
    <div
      className="flex min-h-dvh flex-col bg-background px-[16px]"
      style={{
        paddingTop: "calc(var(--safe-top) + 8px)",
        paddingBottom: "calc(var(--safe-bottom) + 16px)",
      }}
    >
      <header className="flex items-center justify-between gap-[8px]">
        <IconButton
          aria-label="End circuit"
          variant="ghost"
          icon={<X className="size-5" />}
          onClick={onEnd}
        />
        <p className="min-w-0 text-center text-sm text-muted-foreground">
          {circuitPlaceLine(circuit, step)}
        </p>
        {/* One name, its state in aria-pressed: a name that changes with
            the state reads as two buttons. */}
        <IconButton
          aria-label="Voice"
          aria-pressed={voice}
          variant="ghost"
          icon={
            voice ? (
              <Volume2 className="size-5" />
            ) : (
              <VolumeX className="size-5" />
            )
          }
          onClick={onToggleVoice}
        />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-[16px] py-[16px] text-center">
        <p
          className={cn(
            "text-sm font-semibold",
            work ? "text-lifting-strong" : "text-muted-foreground"
          )}
        >
          {paused ? "Paused" : circuitStepEyebrow(step.kind)}
        </p>
        <p
          className="ds-display-figure ds-display-rest whitespace-nowrap text-foreground"
          role="timer"
        >
          {formatClock(secondsLeft)}
        </p>
        <div
          className="h-[4px] w-full max-w-[280px] overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-1000 ease-linear",
              work ? "bg-lifting" : "bg-muted-foreground/40"
            )}
            style={{ width: `${Math.round(Math.min(1, stepDone) * 100)}%` }}
          />
        </div>
        <ExerciseThumb
          exerciseId={step.move.exerciseId}
          className="size-[160px] rounded-3xl"
        />
        <h1 className="text-h1 max-w-full break-words leading-tight font-extrabold text-foreground">
          {heading}
        </h1>
        {step.move.sided && (
          <p className="-mt-[8px] text-sm text-muted-foreground">
            {CIRCUIT_SIDED_LINE}
          </p>
        )}
        {/* The step as the voice says it, for a screen reader. */}
        <p className="sr-only" aria-live="polite">
          {`${circuitStepEyebrow(step.kind)}. ${heading}`}
        </p>
      </main>

      <footer className="mx-auto flex w-full max-w-lg flex-wrap gap-[12px]">
        <Button
          variant="neutral"
          size="lg"
          className="min-w-[120px] flex-1"
          onClick={paused ? onResume : onPause}
        >
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="min-w-[120px] flex-1"
          onClick={onSkip}
          disabled={paused}
        >
          Skip
        </Button>
      </footer>
    </div>
  );
}
