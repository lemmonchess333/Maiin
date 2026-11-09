import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { sheetPosition, type HeroMotionSheet } from "@/lib/heroMotion";
import { cn } from "@/lib/utils";

const sheetUrl = (src: string) =>
  `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/${src.replace(/^\//, "")}`;

/**
 * Home's hero picture, moving: the runner running on the spot, the day's
 * lead lift doing its rep, drawn frame by frame from one sheet like a
 * flipbook. It plays `cycles` times round once it is on screen, then rests
 * on its first frame, which is the still the card showed before
 * (DESIGN_GUIDE §14h: one ambient loop per screen, and Home's water glass
 * is already one). It counts only time on screen with the app open, and
 * under Reduce Motion it never moves.
 */
export default function HeroMotion({
  sheet,
  cycles,
  className,
}: {
  sheet: HeroMotionSheet;
  /** Times round before it rests; Infinity loops while on screen. */
  cycles: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const total = sheet.frames * cycles;

  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    const image = new Image();
    image.src = sheetUrl(sheet.src);
    image
      .decode()
      .then(() => !cancelled && setLoaded(true))
      .catch(() => {
        /* The still stays: the sheet is a nicety, not the picture. */
      });
    return () => {
      cancelled = true;
    };
  }, [sheet.src, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const element = ref.current;
    if (!element) return;
    let onScreen = true;
    const sync = () =>
      setActive(onScreen && document.visibilityState === "visible");
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            onScreen = entries[0]?.isIntersecting ?? true;
            sync();
          });
    observer?.observe(element);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [reducedMotion]);

  // Frames shown so far, kept across pauses so a scroll away and back
  // carries on rather than starting again.
  const shown = useRef(0);
  useEffect(() => {
    if (reducedMotion || !active || !loaded || shown.current >= total) return;
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    let last: number | null = null;
    let carry = 0;
    const step = 1000 / sheet.fps;
    const tick = (now: number) => {
      if (last !== null) carry += now - last;
      last = now;
      while (carry >= step && shown.current < total) {
        carry -= step;
        shown.current += 1;
      }
      const done = shown.current >= total;
      element.style.backgroundPosition = sheetPosition(
        sheet,
        done ? 0 : shown.current % sheet.frames
      );
      if (!done) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, loaded, reducedMotion, sheet, total]);

  const rows = Math.ceil(sheet.frames / Math.max(1, sheet.cols));
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-hero-motion={reducedMotion ? "still" : "moving"}
      className={cn("relative h-full max-w-full", className)}
      style={{
        aspectRatio: `${sheet.frameWidth} / ${sheet.frameHeight}`,
        backgroundImage: `url("${sheetUrl(sheet.src)}")`,
        backgroundSize: `${sheet.cols * 100}% ${rows * 100}%`,
        backgroundPosition: sheetPosition(sheet, 0),
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
