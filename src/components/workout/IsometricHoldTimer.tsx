import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface IsometricHoldTimerProps {
  /** Target hold duration in seconds for the current set. */
  targetSeconds: number;
  /** Called when the lifter applies the timed hold to the active set row. */
  onApplySeconds: (seconds: number) => void;
}

function formatHoldClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

/**
 * Live stopwatch for timed isometric holds (`repUnit === "seconds"`), anchored
 * on wall-clock time so screen-locking never drifts the hold. Fires a single
 * haptic cue when the target hold duration is reached and fills the elapsed
 * seconds into the active set with one tap.
 */
export default function IsometricHoldTimer({
  targetSeconds,
  onApplySeconds,
}: IsometricHoldTimerProps) {
  const reducedMotion = useReducedMotion();
  const safeTarget = Math.max(5, Math.round(targetSeconds || 30));
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const baseMsRef = useRef(0);
  const targetHitRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (startedAtRef.current === null) return;
      const nextMs = baseMsRef.current + (Date.now() - startedAtRef.current);
      setElapsedMs(nextMs);
      if (!targetHitRef.current && nextMs >= safeTarget * 1000) {
        targetHitRef.current = true;
        haptic("medium");
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [running, safeTarget]);

  const elapsedSec = Math.floor(elapsedMs / 1000);
  const progress = Math.min(1, elapsedMs / (safeTarget * 1000));
  const reachedTarget = elapsedSec >= safeTarget;

  const toggle = () => {
    haptic("light");
    if (running) {
      if (startedAtRef.current !== null) {
        baseMsRef.current += Date.now() - startedAtRef.current;
        setElapsedMs(baseMsRef.current);
      }
      startedAtRef.current = null;
      setRunning(false);
    } else {
      startedAtRef.current = Date.now();
      setRunning(true);
    }
  };

  const reset = () => {
    haptic("light");
    startedAtRef.current = null;
    baseMsRef.current = 0;
    targetHitRef.current = false;
    setRunning(false);
    setElapsedMs(0);
  };

  const apply = () => {
    const finalSec = Math.max(1, elapsedSec);
    if (running) {
      startedAtRef.current = null;
      baseMsRef.current = finalSec * 1000;
      setRunning(false);
    }
    haptic("light");
    onApplySeconds(finalSec);
  };

  return (
    <Card
      as="section"
      aria-label="Hold timer"
      size="compact"
      tone="flat"
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Hold timer · Target{" "}
            <span className="font-mono tabular-nums">{safeTarget}s</span>
          </p>
          <p
            data-testid="hold-timer-readout"
            className={cn(
              "mt-0.5 text-2xl font-extrabold font-figure tabular-nums leading-none",
              reachedTarget ? "text-primary" : "text-foreground"
            )}
          >
            {formatHoldClock(elapsedSec)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant={running ? "secondary" : "primary"}
            size="sm"
            leftIcon={
              running ? (
                <Pause className="size-4" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )
            }
            onClick={toggle}
          >
            {running ? "Pause" : elapsedSec > 0 ? "Resume" : "Start hold"}
          </Button>
          {elapsedSec > 0 && (
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Check className="size-4" aria-hidden="true" />}
                onClick={apply}
              >
                Use {elapsedSec}s
              </Button>
              <IconButton
                variant="ghost"
                aria-label="Reset hold timer"
                icon={<RotateCcw className="size-4" aria-hidden="true" />}
                onClick={reset}
              />
            </>
          )}
        </div>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        <div
          className={cn(
            "h-full rounded-full",
            "bg-primary",
            !reducedMotion && "transition-[width] duration-200 ease-out"
          )}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </Card>
  );
}
