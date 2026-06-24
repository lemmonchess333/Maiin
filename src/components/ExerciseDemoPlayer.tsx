import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface ExerciseDemoPlayerProps {
  /** Ordered frame URLs along the movement's range of motion (already
   *  resolved to full URLs by getExerciseDemo). 1 frame → static image;
   *  2+ → an auto-playing crossfade loop. The frames are the Nano-Banana
   *  ("gemini-2.5-flash-image") coach keyframes (or borrowed free-exercise-db
   *  start/finish photos) — see scripts/generate-exercise-demos.mjs. */
  frames: string[];
  /** Exercise name, for the accessible label. */
  name: string;
  /** When false the loop is paused (drawer consumers set this on open
   *  state so a hidden player doesn't burn a timer). */
  active?: boolean;
  /** Hold per frame in ms; the crossfade overlaps the hold. */
  intervalMs?: number;
}

// Crossfade duration. Overlaps the per-frame hold so consecutive frames
// dissolve into each other rather than hard-cutting — reads as motion from
// discrete keyframes, and keeps the loop calm (design system: calm > flashy).
const FADE_MS = 400;

/**
 * Auto-playing exercise demonstration.
 *
 * Nano Banana produces still keyframes, not video, so "animation" here is a
 * crossfaded flipbook of the ordered range-of-motion frames. Playback is
 * PING-PONG: it walks to the last frame then reverses back to the first. A rep
 * is a concentric + eccentric phase, so bouncing the one-way keyframes yields a
 * full down-up-down cycle that always returns cleanly to the start — and means
 * the generator only has to produce one-way frames.
 *
 * It plays automatically (no Start/Finish toggle, no play button). Reduced-
 * motion users instead get a static 2-up of the range-of-motion extremes so
 * they keep the same reference the old Start/Finish boxes gave them.
 */
export default function ExerciseDemoPlayer({
  frames,
  name,
  active = true,
  intervalMs = 700,
}: ExerciseDemoPlayerProps) {
  const reduce = useReducedMotion();
  const [frame, setFrame] = useState(0);
  const dirRef = useRef<1 | -1>(1);

  const animated = !reduce && active && frames.length >= 2;

  useEffect(() => {
    if (!animated) return;
    dirRef.current = 1;
    const id = window.setInterval(() => {
      setFrame((prev) => {
        let next = prev + dirRef.current;
        if (next >= frames.length - 1) {
          next = frames.length - 1;
          dirRef.current = -1;
        } else if (next <= 0) {
          next = 0;
          dirRef.current = 1;
        }
        return next;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [animated, frames.length, intervalMs]);

  // Clamp the displayed index so a frame-count change (switching exercises)
  // can never point past the new array before the interval self-corrects.
  const current = Math.min(frame, Math.max(0, frames.length - 1));

  if (frames.length === 0) return null;

  // Single frame → static image.
  if (frames.length === 1) {
    return (
      <div className="mt-4 rounded-2xl overflow-hidden bg-muted">
        <img
          src={frames[0]}
          alt={`${name} demonstration`}
          loading="lazy"
          className="w-full h-auto aspect-square object-cover"
        />
      </div>
    );
  }

  // Reduced motion → static 2-up of the range-of-motion extremes (first +
  // last). Preserves the pre-animation Start/Finish reference for users who
  // opt out of motion, rather than collapsing to a single still.
  if (reduce) {
    const ends = [frames[0], frames[frames.length - 1]];
    return (
      <div className="mt-4 grid grid-cols-2 gap-2">
        {ends.map((src, i) => (
          <figure key={src} className="rounded-2xl overflow-hidden bg-muted">
            <img
              src={src}
              alt={`${name} — ${i === 0 ? "start position" : "finish position"}`}
              loading="lazy"
              className="w-full h-auto aspect-square object-cover"
            />
            <figcaption className="text-caption uppercase tracking-wide text-muted-foreground text-center py-1">
              {i === 0 ? "Start" : "Finish"}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  // Animated: stack every frame, crossfade to the active one. Auto-plays.
  return (
    <div
      className="mt-4 relative rounded-2xl overflow-hidden bg-muted aspect-square"
      role="img"
      aria-label={`${name} demonstration`}
    >
      {frames.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          decoding="async"
          data-frame-index={i}
          data-active={i === current ? "true" : "false"}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity ease-out",
            i === current ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDuration: `${FADE_MS}ms` }}
        />
      ))}
    </div>
  );
}
