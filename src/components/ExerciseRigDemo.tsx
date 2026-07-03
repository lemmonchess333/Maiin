import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { renderBodyDemo } from "@/lib/bodyRig";

interface ExerciseRigDemoProps {
  exerciseId: string;
  /** Exercise name, for the accessible label. */
  name: string;
  /** When false the loop is paused (hidden sheets shouldn't burn rAF). */
  active?: boolean;
}

/* One rep = descend + hold + ascend + hold. Continuous interpolation —
 * no discrete frames, so the motion is genuinely smooth. Holds at the
 * extremes mirror a controlled rep's cadence. */
const TRAVEL_MS = 1400;
const HOLD_MS = 520;
const FPS_INTERVAL = 1000 / 30;

/**
 * Animated exercise demo built from the REAL muscle-map figure (bodyRig):
 * the exact react-body-highlighter polygons the Form view already renders,
 * moved by skeletal transforms, working muscles in the same two purples.
 * Reduced-motion users get a static two-up of the extremes.
 */
export default function ExerciseRigDemo({
  exerciseId,
  name,
  active = true,
}: ExerciseRigDemoProps) {
  const reducedMotion = useReducedMotion();
  const [svg, setSvg] = useState(() => renderBodyDemo(exerciseId, 0));
  const rafRef = useRef<number>(0);
  const lastDrawRef = useRef(0);

  useEffect(() => {
    if (reducedMotion || !active) return;
    const cycle = 2 * (TRAVEL_MS + HOLD_MS);
    const start = performance.now();

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastDrawRef.current < FPS_INTERVAL) return;
      lastDrawRef.current = now;

      const m = (now - start) % cycle;
      let t: number;
      if (m < TRAVEL_MS) t = m / TRAVEL_MS;
      else if (m < TRAVEL_MS + HOLD_MS) t = 1;
      else if (m < 2 * TRAVEL_MS + HOLD_MS)
        t = 1 - (m - TRAVEL_MS - HOLD_MS) / TRAVEL_MS;
      else t = 0;
      setSvg(renderBodyDemo(exerciseId, t));
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
