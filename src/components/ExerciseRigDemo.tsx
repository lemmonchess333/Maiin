import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { getBodyDemo, renderBodyDemo } from "@/lib/bodyRig";
import {
  repTimingFor,
  repSampleAt,
  repTotalMs,
  type RepPhase,
} from "@/lib/exerciseTempo";
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

/** Phase cues for the teaching rep. Labels are generic and direction-
 *  derived — the eccentric is always "lower under control" and the
 *  concentric always the drive, whichever end of t the exercise locks
 *  out at. Per-exercise authored cues are future content work. */
const PHASE_LABEL: Record<RepPhase, string> = {
  set: "Set",
  eccentric: "Lower under control",
  pause: "Pause",
  drive: "Drive up",
  lockout: "Lockout",
  done: "Rep complete",
};

/**
 * Exercise demo built from the REAL muscle-map figure (bodyRig): the exact
 * react-body-highlighter polygons the Form view already renders, moved by
 * skeletal transforms. Working-muscle highlights BREATHE with the effort
 * phase — brightest through the lifting drive, softer on the way down.
 *
 * Demo1 lock: plays ONE phase-cued teaching rep
 * (set → eccentric → pause → drive → lockout), then SETTLES at the lockout
 * frame behind a replay control — a bounded teaching rep, not ambient media
 * (and no more 30fps work after it ends). The phase timeline is the pure
 * repSampleAt in lib/exerciseTempo: a short "Set" lead-in holds the lockout
 * frame so the eye finds the figure before anything moves, the eccentric is
 * controlled and slower than the concentric drive (authored "D-P-U" tempo
 * refines the durations), and the post-drive beat cues "Lockout".
 * Reduced-motion users get the static two-up of the extremes, unchanged.
 *
 * Rendering is IMPERATIVE inside the rAF loop: frames write the figure
 * div's innerHTML directly instead of going through setState, so the
 * 30fps sweep costs zero React reconciliations — the difference is
 * visible on older phones inside WKWebView. React only re-renders on
 * PHASE changes (six per rep) for the cue line and the replay control.
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

  // First paint = the lockout frame. Stable per instance (the parent keys
  // this component by exercise), so React never rewrites the figure div
  // after mount — the rAF loop owns its innerHTML from then on.
  const initialSvg = useMemo(
    () => renderBodyDemo(exerciseId, lockoutT, 0.7),
    [exerciseId, lockoutT]
  );
  const figureRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<RepPhase>("set");
  // Bumped by Replay; each value plays exactly one rep.
  const [repNonce, setRepNonce] = useState(0);
  const rafRef = useRef<number>(0);
  const lastDrawRef = useRef(0);
  const effortRef = useRef(0.7);
  const phaseRef = useRef<RepPhase>("set");

  useEffect(() => {
    if (reducedMotion || !active) return;
    const timing = repTimingFor(tempo);
    const total = repTotalMs(timing);
    const start = performance.now();
    const draw = (svg: string) => {
      if (figureRef.current) figureRef.current.innerHTML = svg;
    };
    const cue = (p: RepPhase) => {
      if (phaseRef.current === p) return;
      phaseRef.current = p;
      setPhase(p);
    };
    cue("set");
    draw(renderBodyDemo(exerciseId, lockoutT, 0.7));

    const tick = (now: number) => {
      const m = now - start;
      if (m >= total) {
        // Rep over — settle on the lockout frame at a calm effort and STOP
        // (no further rAF; the replay control owns any next rep).
        draw(renderBodyDemo(exerciseId, lockoutT, 0.7));
        cue("done");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastDrawRef.current < FPS_INTERVAL) return;
      lastDrawRef.current = now;

      const sample = repSampleAt(m, timing);
      const t = liftsToOne ? 1 - sample.ecc : sample.ecc;
      // Low-pass the effort so phase changes glow in, never flicker.
      effortRef.current += (sample.targetEffort - effortRef.current) * 0.1;
      draw(renderBodyDemo(exerciseId, t, effortRef.current));
      cue(sample.phase);
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
          ref={figureRef}
          className="mx-auto max-w-[190px]"
          dangerouslySetInnerHTML={{ __html: initialSvg }}
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
