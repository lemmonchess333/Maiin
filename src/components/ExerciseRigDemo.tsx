import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { getBodyDemo, renderBodyDemo } from "@/lib/bodyRig";
import { repTimingFor } from "@/lib/exerciseTempo";
import IconButton from "@/components/ui/IconButton";
import { haptic } from "@/lib/haptic";

interface ExerciseRigDemoProps {
  exerciseId: string;
  /** Exercise name, for the accessible label. */
  name: string;
  /** When false the rep is paused (hidden sheets shouldn't burn rAF). */
  active?: boolean;
  /** Authored "down-pause-up" tempo (seconds) — drives the rep's phase
   *  durations via lib/exerciseTempo; absent → the calm defaults. */
  tempo?: string;
}

const FPS_INTERVAL = 1000 / 30;

/** The rep's phase sequence, cued to the user (Demo1). Labels are generic and
 *  direction-derived — the eccentric is always "lower under control" and the
 *  concentric always the drive, whichever end of t the exercise locks out at.
 *  Per-exercise authored cues are future content work. */
type RepPhase = "eccentric" | "pause" | "drive" | "done";
const PHASE_LABEL: Record<RepPhase, string> = {
  eccentric: "Lower under control",
  pause: "Pause",
  drive: "Drive up",
  done: "Rep complete",
};

/**
 * Exercise demo built from the REAL muscle-map figure (bodyRig): the exact
 * react-body-highlighter polygons the Form view already renders, moved by
 * skeletal transforms. Working-muscle highlights BREATHE with the effort
 * phase — brightest through the lifting drive, softer on the way down.
 *
 * Demo1 lock: plays ONE phase-cued teaching rep
 * (start → eccentric → pause → drive → lockout), then SETTLES at the lockout
 * frame behind a replay control — a bounded teaching rep, not ambient media
 * (and no more 30fps work after it ends). Real reps are asymmetric: the
 * eccentric is controlled and slower than the concentric drive; authored
 * tempo ("D-P-U" seconds) refines the phase durations when present.
 * Reduced-motion users get the static two-up of the extremes, unchanged.
 */
export default function ExerciseRigDemo({
  exerciseId,
  name,
  active = true,
  tempo,
}: ExerciseRigDemoProps) {
  const reducedMotion = useReducedMotion();
  // Which end of t is the concentric top decides the rep's shape AND the
  // settle frame: squats/hinges lock out at t=0 (standing), presses/curls at
  // t=1. The rep starts and ends at lockout.
  const liftsToOne = getBodyDemo(exerciseId)?.concentricTo === 1;
  const lockoutT = liftsToOne ? 1 : 0;

  const [svg, setSvg] = useState(() =>
    renderBodyDemo(exerciseId, lockoutT, 0.7)
  );
  const [phase, setPhase] = useState<RepPhase>("eccentric");
  // Bumped by Replay; each value plays exactly one rep.
  const [repNonce, setRepNonce] = useState(0);
  const rafRef = useRef<number>(0);
  const lastDrawRef = useRef(0);
  const effortRef = useRef(0.7);

  useEffect(() => {
    if (reducedMotion || !active) return;
    const { downMs, holdMs, upMs } = repTimingFor(tempo);
    // One rep: eccentric → bottom pause → concentric drive → settle at
    // lockout (with a brief lockout beat folded into the tail).
    const total = downMs + holdMs + upMs + holdMs;
    const start = performance.now();
    setPhase("eccentric");

    const tick = (now: number) => {
      const m = now - start;
      if (m >= total) {
        // Rep over — settle on the lockout frame at a calm effort and STOP
        // (no further rAF; the replay control owns any next rep).
        setSvg(renderBodyDemo(exerciseId, lockoutT, 0.7));
        setPhase("done");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastDrawRef.current < FPS_INTERVAL) return;
      lastDrawRef.current = now;

      let ecc: number; // eccentric progress 0→1 within the slow half
      let targetEffort: number;
      let p: RepPhase;
      if (m < downMs) {
        ecc = m / downMs; // eccentric — controlled, softer highlight
        targetEffort = 0.45;
        p = "eccentric";
      } else if (m < downMs + holdMs) {
        ecc = 1; // deep turnaround — loading up
        targetEffort = 0.8;
        p = "pause";
      } else if (m < downMs + holdMs + upMs) {
        ecc = 1 - (m - downMs - holdMs) / upMs; // concentric — full drive
        targetEffort = 1;
        p = "drive";
      } else {
        ecc = 0; // lockout beat before settling
        targetEffort = 0.55;
        p = "drive";
      }
      const t = liftsToOne ? 1 - ecc : ecc;
      // Low-pass the effort so phase changes glow in, never flicker.
      effortRef.current += (targetEffort - effortRef.current) * 0.1;
      setSvg(renderBodyDemo(exerciseId, t, effortRef.current));
      setPhase(p);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    exerciseId,
    reducedMotion,
    active,
    tempo,
    liftsToOne,
    lockoutT,
    repNonce,
  ]);

  const replay = useCallback(() => {
    haptic();
    setRepNonce((n) => n + 1);
  }, []);

  /* The demo renders on a fixed DARK stage in both themes (like any
   * media viewer): the figure's facet gaps read as the dark surface
   * showing through — the exact contrast the muscle-map art was
   * designed against. A light backing would wash the gaps out. */
  if (reducedMotion) {
    return (
      <div
        role="img"
        aria-label={`${name} demonstration — start and end positions`}
        className="bg-stage rounded-2xl p-4 mt-4 flex justify-center gap-3"
      >
        <div
          className="w-1/2 max-w-[150px]"
          dangerouslySetInnerHTML={{ __html: renderBodyDemo(exerciseId, 0) }}
        />
        <div
          className="w-1/2 max-w-[150px]"
          dangerouslySetInnerHTML={{ __html: renderBodyDemo(exerciseId, 1) }}
        />
      </div>
    );
  }

  const done = phase === "done";
  return (
    // The replay control is interactive, so it lives OUTSIDE the role="img"
    // figure (an img role may not contain a button).
    <div className="bg-stage rounded-2xl p-4 mt-4 relative">
      <div role="img" aria-label={`${name} demonstration — one guided rep`}>
        <div
          className="mx-auto max-w-[190px]"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      {/* Phase cue — the teaching half of the rep. aria-live=polite reads the
          phase to screen-reader users without interrupting. */}
      <p
        aria-live="polite"
        className="mt-2 text-center text-micro uppercase tracking-wider text-muted-foreground"
      >
        {PHASE_LABEL[phase]}
      </p>
      {done && (
        <div className="absolute bottom-3 right-3">
          <IconButton
            aria-label="Replay demonstration"
            icon={<RotateCcw className="size-5" aria-hidden="true" />}
            variant="secondary"
            size="md"
            onClick={replay}
          />
        </div>
      )}
    </div>
  );
}
