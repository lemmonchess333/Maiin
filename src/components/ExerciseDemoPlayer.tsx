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
  /** Fired when every frame 404s / fails to load (or there are none usable)
   *  so the caller can fall back to the muscle diagram rather than leave a
   *  dead empty box where the demo would be. */
  onUnavailable?: () => void;
}

// Crossfade duration. Overlaps the per-frame hold so consecutive frames
// dissolve into each other rather than hard-cutting — reads as motion from
// discrete keyframes, and keeps the loop calm (design system: calm > flashy).
const FADE_MS = 400;
// Turnaround pause: the range-of-motion extremes hold this multiple of the
// per-frame interval. A real rep decelerates into the top/bottom and pauses
// before reversing — equal holds everywhere read mechanical (visual audit
// Phase 5 W1).
const TURNAROUND_HOLD = 1.8;

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
 *
 * Frames that fail to load are dropped so a broken source never renders as an
 * empty grey box; if they ALL fail, onUnavailable fires so the caller can show
 * the muscle diagram instead. Pass a `key` (e.g. the exercise name) so a new
 * exercise gets a fresh instance.
 */
export default function ExerciseDemoPlayer({
  frames,
  name,
  active = true,
  intervalMs = 700,
  onUnavailable,
}: ExerciseDemoPlayerProps) {
  const reduce = useReducedMotion();
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const dirRef = useRef<1 | -1>(1);

  const usable = frames.filter((s) => !failed.has(s));
  const animated = !reduce && active && usable.length >= 2;

  useEffect(() => {
    if (!animated) return;
    dirRef.current = 1;
    // Timeout chain instead of a fixed interval so the extremes can hold
    // longer than mid-range frames (the turnaround pause).
    let id = 0;
    const tick = () => {
      setFrame((prev) => {
        let next = prev + dirRef.current;
        if (next >= usable.length - 1) {
          next = usable.length - 1;
          dirRef.current = -1;
        } else if (next <= 0) {
          next = 0;
          dirRef.current = 1;
        }
        const atExtreme = next === 0 || next === usable.length - 1;
        id = window.setTimeout(
          tick,
          atExtreme ? intervalMs * TURNAROUND_HOLD : intervalMs
        );
        return next;
      });
    };
    id = window.setTimeout(tick, intervalMs * TURNAROUND_HOLD);
    return () => window.clearTimeout(id);
  }, [animated, usable.length, intervalMs]);

  // Hand off to the muscle diagram when there's nothing left to show.
  useEffect(() => {
    if (frames.length > 0 && usable.length === 0) onUnavailable?.();
  }, [frames.length, usable.length, onUnavailable]);

  const onImgError = (src: string) =>
    setFailed((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));

  if (usable.length === 0) return null;

  // Clamp the displayed index so a frame dropping out mid-loop can never point
  // past the shortened array before the interval self-corrects.
  const current = Math.min(frame, usable.length - 1);

  // Single frame → static image.
  if (usable.length === 1) {
    return (
      <div className="mt-4 rounded-2xl overflow-hidden bg-muted">
        <img
          src={usable[0]}
          alt={`${name} demonstration`}
          loading="lazy"
          onError={() => onImgError(usable[0])}
          className="w-full h-auto aspect-square object-cover"
        />
      </div>
    );
  }

  // Reduced motion → static 2-up of the range-of-motion extremes (first +
  // last). Preserves a Start/Finish reference for users who opt out of motion.
  if (reduce) {
    const ends = [usable[0], usable[usable.length - 1]];
    return (
      <div className="mt-4 grid grid-cols-2 gap-2">
        {ends.map((src, i) => (
          <figure key={src} className="rounded-2xl overflow-hidden bg-muted">
            <img
              src={src}
              alt={`${name} — ${i === 0 ? "start position" : "finish position"}`}
              loading="lazy"
              onError={() => onImgError(src)}
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
      {usable.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          decoding="async"
          onError={() => onImgError(src)}
          data-frame-index={i}
          data-active={i === current ? "true" : "false"}
          className={cn(
            // ease-in-out so the incoming and outgoing frames dissolve
            // symmetrically — ease-out faded the outgoing frame faster
            // than the incoming one appeared (a brief brightness dip).
            "absolute inset-0 w-full h-full object-cover transition-opacity ease-in-out",
            i === current ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDuration: `${FADE_MS}ms` }}
        />
      ))}
    </div>
  );
}
