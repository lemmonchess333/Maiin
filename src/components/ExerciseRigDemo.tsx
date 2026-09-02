import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { getBodyDemo, renderBodyDemo } from "@/lib/bodyRig";
import {
  repTimingFor,
  repSampleLoopedAt,
  type RepPhase,
  type RepStart,
} from "@/lib/exerciseTempo";

const FPS_INTERVAL = 1000 / 30;

/**
 * The figure div, isolated from the player's React re-renders.
 *
 * The one-frame "spaz" (owner device recording, 2026-09-02): the cue
 * line is React state, so every PHASE change re-rendered the player,
 * and the figure div carried `dangerouslySetInnerHTML={{ __html }}` as
 * a fresh object literal. React 19 re-applies that prop whenever its
 * identity changes — it does not compare the strings — so each phase
 * change overwrote the live frame with the INITIAL lockout SVG until the
 * next rAF tick drew over it: a lockout pose flashing for a frame or two,
 * four times per rep, on every demo.
 *
 * Two layers of defence, either sufficient alone: the html prop is a
 * memoised object (same identity → React skips the prop entirely), and
 * the div lives in a memo'd child with stable props (the parent's
 * re-render never reaches it). After the mount paint, only the rAF loop
 * ever writes this div's innerHTML.
 */
const Figure = memo(function Figure({
  html,
  figureRef,
}: {
  html: { __html: string };
  figureRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={figureRef}
      className="mx-auto max-w-[190px]"
      dangerouslySetInnerHTML={html}
    />
  );
});

/** Phase cues for the looping rep. Labels are generic and direction-
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
 * The rep LOOPS continuously while the surface is active — the
 * gym-placard demo model (owner feedback 2026-07-27: "the reps don't
 * repeat properly"; the reference is the looping demo screens on gym
 * equipment). This supersedes the Demo1 single-rep-then-settle player
 * and its replay control. A short "Set" lead-in still holds the lockout
 * frame so the eye finds the figure before anything moves, then the
 * phase-cued cycle (lower → pause → drive → lockout) repeats until the
 * sheet closes or `active` goes false. Reduced-motion users get the
 * static two-up of the extremes, unchanged.
 *
 * Rendering is IMPERATIVE inside the rAF loop: frames write the figure
 * div's innerHTML directly instead of going through setState, so the
 * 30fps sweep costs zero React reconciliations — the difference is
 * visible on older phones inside WKWebView. React only re-renders on
 * PHASE changes (four per cycle) for the cue line.
 *
 * The 30fps throttle advances its clock in WHOLE intervals: re-anchoring
 * to `now` on every draw made draw spacing alternate ~33/50ms against a
 * 60Hz rAF — a visible judder the device feedback called reps that
 * "spaz out". Quantized stepping keeps the spacing even.
 */
export default function ExerciseRigDemo({
  exerciseId,
  name,
  active = true,
  tempo,
}: {
  exerciseId: string;
  /** Exercise name, for the accessible label. */
  name: string;
  /** When false the loop is stopped (hidden sheets shouldn't burn rAF). */
  active?: boolean;
  /** Authored "down-pause-up" tempo (seconds) — drives the cycle's phase
   *  durations via lib/exerciseTempo; absent → the calm defaults. */
  tempo?: string;
}) {
  const reducedMotion = useReducedMotion();
  // Which end of t is the concentric top decides the cycle's shape AND
  // the opening frame: squats/hinges lock out at t=0 (standing),
  // presses/curls at t=1. The loop starts from lockout.
  const demo = getBodyDemo(exerciseId);
  const liftsToOne = demo?.concentricTo === 1;
  const lockoutT = liftsToOne ? 1 : 0;
  /* Where the rep BEGINS, which is not the same question as which end
     locks out. A squat and a deadlift both finish standing; the squat
     starts there and the deadlift starts with the bar on the floor.
     The player opened every demo at lockout, so a deadlift began with
     the lift already done. */
  const startsAt: RepStart = demo?.startsAt ?? "lockout";
  const stretchT = liftsToOne ? 0 : 1;
  const openingT = startsAt === "stretch" ? stretchT : lockoutT;

  // First paint = the lockout frame. Stable per instance (the parent keys
  // this component by exercise), so React never rewrites the figure div
  // after mount — the rAF loop owns its innerHTML from then on.
  const initialHtml = useMemo(
    () => ({ __html: renderBodyDemo(exerciseId, openingT, 0.7) }),
    [exerciseId, openingT]
  );
  const figureRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<RepPhase>("set");
  const rafRef = useRef<number>(0);
  const lastDrawRef = useRef(0);
  const effortRef = useRef(0.7);
  const phaseRef = useRef<RepPhase>("set");

  useEffect(() => {
    if (reducedMotion || !active) return;
    // Deterministic restart: the draw-throttle clock and the effort
    // low-pass start every run from the same calm state — not from
    // wherever a previous mount left them.
    lastDrawRef.current = 0;
    effortRef.current = 0.7;
    const timing = repTimingFor(tempo);
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
    draw(renderBodyDemo(exerciseId, openingT, 0.7));

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      // The 1ms tolerance matters: an exact `< FPS_INTERVAL` check
      // flips on float noise right at the boundary (a 33.3333…−ε delta
      // reads as "too soon"), which skips a frame and produces the very
      // 33/50ms alternation this throttle exists to prevent.
      if (now - lastDrawRef.current < FPS_INTERVAL - 1) return;
      // Advance the throttle clock in WHOLE intervals on a fixed
      // lattice (catching up after hitches without re-anchoring to the
      // noisy rAF timestamp) — even spacing, no 33/50ms alternation.
      lastDrawRef.current +=
        FPS_INTERVAL *
        Math.max(1, Math.round((now - lastDrawRef.current) / FPS_INTERVAL));

      const sample = repSampleLoopedAt(now - start, timing, startsAt);
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
    openingT,
    startsAt,
  ]);

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
        {/* START position first, then the far end — so a deadlift reads
            floor-then-standing rather than the reverse. */}
        <div
          className="w-1/2 max-w-[150px]"
          dangerouslySetInnerHTML={{
            __html: renderBodyDemo(exerciseId, openingT),
          }}
        />
        <div
          className="w-1/2 max-w-[150px]"
          dangerouslySetInnerHTML={{
            __html: renderBodyDemo(exerciseId, openingT === 0 ? 1 : 0),
          }}
        />
      </div>
    );
  }

  return (
    <div className="bg-stage rounded-2xl p-4 mt-4">
      <div role="img" aria-label={`${name} demonstration — looping reps`}>
        <Figure html={initialHtml} figureRef={figureRef} />
      </div>
      {/* Phase cue — the teaching half of the loop. aria-live=polite reads
          the phase to screen-reader users without interrupting. */}
      <p
        aria-live="polite"
        className="mt-2 text-center text-micro uppercase tracking-wider text-muted-foreground"
      >
        {PHASE_LABEL[phase]}
      </p>
    </div>
  );
}
