import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { getBodyDemo, renderBodyDemo } from "@/lib/bodyRig";

interface ExerciseRigDemoProps {
  exerciseId: string;
  /** Exercise name, for the accessible label. */
  name: string;
  /** When false the loop is paused (hidden sheets shouldn't burn rAF). */
  active?: boolean;
}

/* Real reps are asymmetric: the eccentric (lowering) is controlled and
 * SLOWER than the concentric (lifting) drive — symmetric timing is what
 * made earlier passes read mechanical. Holds at the turnarounds mirror a
 * controlled rep's pauses. (Tempo convention per the exercise-animation
 * research: ~3s down-ish, ~1s up, brief holds.) */
const DOWN_MS = 1650;
const UP_MS = 1050;
const HOLD_MS = 480;
const FPS_INTERVAL = 1000 / 30;

/**
 * Animated exercise demo built from the REAL muscle-map figure (bodyRig):
 * the exact react-body-highlighter polygons the Form view already renders,
 * moved by skeletal transforms. Working-muscle highlights BREATHE with the
 * effort phase — brightest through the lifting drive, softer on the way
 * down (the pro-anatomy convention). Reduced-motion users get a static
 * two-up of the extremes.
 */
export default function ExerciseRigDemo({
  exerciseId,
  name,
  active = true,
}: ExerciseRigDemoProps) {
  const reducedMotion = useReducedMotion();
  const [svg, setSvg] = useState(() => renderBodyDemo(exerciseId, 0, 0.7));
  const rafRef = useRef<number>(0);
  const lastDrawRef = useRef(0);
  const effortRef = useRef(0.7);

  useEffect(() => {
    if (reducedMotion || !active) return;
    // Which end of t is the concentric top decides the rep's shape:
    // squats/hinges DESCEND first (slow) then drive up (fast); presses,
    // curls and raises LIFT first (fast) then lower under control (slow).
    const liftsToOne = getBodyDemo(exerciseId)?.concentricTo === 1;
    const cycle = DOWN_MS + HOLD_MS + UP_MS + HOLD_MS;
    const start = performance.now();

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastDrawRef.current < FPS_INTERVAL) return;
      lastDrawRef.current = now;

      const m = (now - start) % cycle;
      let ecc: number; // eccentric progress 0→1 within the slow half
      let targetEffort: number;
      if (m < DOWN_MS) {
        ecc = m / DOWN_MS; // eccentric — controlled, softer highlight
        targetEffort = 0.45;
      } else if (m < DOWN_MS + HOLD_MS) {
        ecc = 1; // deep turnaround — loading up
        targetEffort = 0.8;
      } else if (m < DOWN_MS + HOLD_MS + UP_MS) {
        ecc = 1 - (m - DOWN_MS - HOLD_MS) / UP_MS; // concentric — full drive
        targetEffort = 1;
      } else {
        ecc = 0; // lockout reset
        targetEffort = 0.55;
      }
      const t = liftsToOne ? 1 - ecc : ecc;
      // Low-pass the effort so phase changes glow in, never flicker.
      effortRef.current += (targetEffort - effortRef.current) * 0.1;
      setSvg(renderBodyDemo(exerciseId, t, effortRef.current));
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [exerciseId, reducedMotion, active]);

  if (reducedMotion) {
    return (
      <div
        role="img"
        aria-label={`${name} demonstration — start and end positions`}
        className="bg-muted rounded-2xl p-4 mt-4 flex justify-center gap-3"
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

  return (
    <div
      role="img"
      aria-label={`${name} demonstration`}
      className="bg-muted rounded-2xl p-4 mt-4"
    >
      <div
        className="mx-auto max-w-[190px]"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
