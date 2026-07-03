import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  renderRigSvg,
  samplePose,
  type RigDemo,
} from "@/lib/demoRig";

interface ExerciseRigDemoProps {
  demo: RigDemo;
  /** Exercise name, for the accessible label. */
  name: string;
  /** When false the loop is paused (hidden sheets shouldn't burn rAF). */
  active?: boolean;
}

/* One rep = descend + hold + ascend + hold. Continuous interpolation —
 * unlike the photo flipbook there are no discrete frames to cut between,
 * so the motion is genuinely smooth. Holds at the range-of-motion extremes
 * mirror the real cadence of a controlled rep (and the photo player's
 * turnaround holds). */
const TRAVEL_MS = 1400;
const HOLD_MS = 520;
const FPS_INTERVAL = 1000 / 30; // 30fps is plenty for a calm demo

/**
 * The code-built exercise demo (Rev of D-LIFT-20): the app's own faceted
 * vector figure performing the movement — same visual language as the
 * muscle map, purple fills assigned per exercise by us. Deterministic,
 * zero assets, theme-static like the reference art.
 *
 * Reduced-motion users get a static 2-up of the range-of-motion extremes
 * (same convention as ExerciseDemoPlayer's fallback).
 */
export default function ExerciseRigDemo({
  demo,
  name,
  active = true,
}: ExerciseRigDemoProps) {
  const reducedMotion = useReducedMotion();
  const [svg, setSvg] = useState(() =>
    renderRigSvg(samplePose(demo.keyframes, 0), demo.tint, demo.equipment)
  );
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
      if (m < TRAVEL_MS) {
        t = m / TRAVEL_MS; // descending
      } else if (m < TRAVEL_MS + HOLD_MS) {
        t = 1; // bottom hold
      } else if (m < 2 * TRAVEL_MS + HOLD_MS) {
        t = 1 - (m - TRAVEL_MS - HOLD_MS) / TRAVEL_MS; // ascending
      } else {
        t = 0; // top hold
      }
      setSvg(
        renderRigSvg(samplePose(demo.keyframes, t), demo.tint, demo.equipment)
      );
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [demo, reducedMotion, active]);

  if (reducedMotion) {
    const top = renderRigSvg(
      samplePose(demo.keyframes, 0),
      demo.tint,
      demo.equipment
    );
    const bottom = renderRigSvg(
      samplePose(demo.keyframes, 1),
      demo.tint,
      demo.equipment
    );
    return (
      <div
        role="img"
        aria-label={`${name} demonstration — start and end positions`}
        className="bg-muted rounded-2xl p-4 mt-4 flex justify-center gap-3"
      >
        <div
          className="w-1/2 max-w-[180px]"
          dangerouslySetInnerHTML={{ __html: top }}
        />
        <div
          className="w-1/2 max-w-[180px]"
          dangerouslySetInnerHTML={{ __html: bottom }}
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
        className="mx-auto max-w-[230px]"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
