import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface WaterWaveProps {
  fillPercent: number;
  splash: number;
}

/** One tile's width of wave, in the SVG's units. */
const TILE = 400;
const HEIGHT = 24;
const AMPLITUDE = 3;

/**
 * A wave that repeats every TILE units, drawn `tiles` wide: every
 * component has a whole number of cycles per tile, so a strip two tiles
 * wide slid left by one tile looks exactly as it started, and the loop
 * has no seam.
 */
function periodicPath(
  tiles: number,
  waves: { cycles: number; size: number; phase: number }[]
): string {
  const width = TILE * tiles;
  const points = 80 * tiles;
  let d = `M 0 ${HEIGHT}`;
  for (let index = 0; index <= points; index += 1) {
    const x = (index / points) * width;
    const y = waves.reduce(
      (sum, wave) =>
        sum +
        Math.sin((x / TILE) * Math.PI * 2 * wave.cycles + wave.phase) *
          AMPLITUDE *
          wave.size,
      HEIGHT / 2
    );
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d} L ${width} ${HEIGHT} Z`;
}

const FRONT = [
  { cycles: 2, size: 1, phase: 0 },
  { cycles: 3, size: 0.4, phase: 1.1 },
];
const BACK = [
  { cycles: 2, size: 0.7, phase: 2.1 },
  { cycles: 5, size: 0.28, phase: 0.4 },
];
const FRONT_STRIP = periodicPath(2, FRONT);
const BACK_STRIP = periodicPath(2, BACK);
const FRONT_AT_REST = periodicPath(1, FRONT);

/** How long each wave takes to travel one tile; different, so they drift. */
const FRONT_MS = 8000;
const BACK_MS = 13000;
const SLIDE: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-50%)" },
];
/** A splash: the surface stands taller, then settles back. */
const SPLASH: Keyframe[] = [
  { transform: "scaleY(2.4)" },
  { transform: "scaleY(1)" },
];
const SPLASH_OPTIONS: KeyframeAnimationOptions = {
  duration: 1400,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

function play(
  el: Element | null,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): Animation | null {
  if (!el || typeof el.animate !== "function") return null;
  return el.animate(keyframes, options);
}

/**
 * The water's surface. Each wave is drawn once, two tiles wide, and slid
 * sideways by the Web Animations API: a transform the compositor runs, so
 * the main thread does no work per frame. Do not go back to rebuilding the
 * paths' `d` on a loop: each rewrite costs a style, layout and paint pass,
 * and at thirty a second that is about a fifth of the main thread while
 * Home sits still (measured at 6x CPU slowdown). A splash is a one-off
 * scaleY of both waves.
 *
 * The slide pauses while the tile is off-screen or the app is in the
 * background, and Reduce Motion gets a still surface.
 */
export default function WaterWave({ fillPercent, splash }: WaterWaveProps) {
  const reducedMotion = useReducedMotion();
  const gradientId = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const slides = useRef<Animation[]>([]);
  const [active, setActive] = useState(() =>
    typeof document === "undefined"
      ? true
      : document.visibilityState === "visible"
  );

  const surfaceColor =
    fillPercent > 60 ? "rgba(78, 195, 220, 0.35)" : "rgba(58, 153, 186, 0.30)";
  const backColor =
    fillPercent > 60 ? "rgba(78, 195, 220, 0.18)" : "rgba(58, 153, 186, 0.14)";

  // Whether anyone can see it: on-screen and the app in the foreground.
  useEffect(() => {
    if (reducedMotion) return;
    const element = rootRef.current;
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

  // The two slides, started once and kept for the component's life.
  useEffect(() => {
    if (reducedMotion) return;
    const started = [
      play(backRef.current, SLIDE, {
        duration: BACK_MS,
        iterations: Infinity,
        easing: "linear",
      }),
      play(frontRef.current, SLIDE, {
        duration: FRONT_MS,
        iterations: Infinity,
        easing: "linear",
      }),
    ].filter((animation): animation is Animation => animation !== null);
    slides.current = started;
    return () => {
      for (const animation of started) animation.cancel();
      slides.current = [];
    };
  }, [reducedMotion]);

  useEffect(() => {
    for (const animation of slides.current) {
      if (active) animation.play();
      else animation.pause();
    }
  }, [active, reducedMotion]);

  // The surface stands up as the water arrives and on each new drink.
  useEffect(() => {
    if (reducedMotion) return;
    const animation = play(surfaceRef.current, SPLASH, SPLASH_OPTIONS);
    return () => animation?.cancel();
  }, [splash, reducedMotion]);

  if (reducedMotion) {
    return (
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${TILE} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ transform: "translateY(-12px)" }}
        aria-hidden="true"
      >
        <path fill={surfaceColor} d={FRONT_AT_REST} />
      </svg>
    );
  }

  return (
    <div
      ref={rootRef}
      data-water-wave
      className="absolute inset-x-0 top-0 pointer-events-none"
      style={{ height: HEIGHT, transform: "translateY(-12px)" }}
      aria-hidden="true"
    >
      <div ref={surfaceRef} className="absolute inset-0">
        <div
          ref={backRef}
          className="absolute inset-y-0 left-0 w-[200%] will-change-transform"
        >
          <svg
            width="100%"
            height={HEIGHT}
            viewBox={`0 0 ${TILE * 2} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="block"
          >
            <path fill={backColor} d={BACK_STRIP} />
          </svg>
        </div>
        <div
          ref={frontRef}
          className="absolute inset-y-0 left-0 w-[200%] will-change-transform"
        >
          <svg
            width="100%"
            height={HEIGHT}
            viewBox={`0 0 ${TILE * 2} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="block"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>
            <path fill={surfaceColor} d={FRONT_STRIP} />
            <path
              fill={`url(#${gradientId})`}
              d={FRONT_STRIP}
              style={{ clipPath: `inset(0 0 ${HEIGHT - 6}px 0)` }}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
