import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface WaterWaveProps {
  fillPercent: number;
  splash: number;
}

const PATH_WIDTH = 400;
const HEIGHT = 24;
const POINTS = 40;

function buildPath(
  phase: number,
  frequency: number,
  amplitudeMultiplier: number,
  amplitude: number
): string {
  let d = `M 0 ${HEIGHT}`;
  for (let index = 0; index <= POINTS; index += 1) {
    const x = (index / POINTS) * PATH_WIDTH;
    const normal = index / POINTS;
    const first =
      Math.sin(normal * Math.PI * 3 + phase * frequency) *
      amplitude *
      amplitudeMultiplier;
    const second =
      Math.sin(normal * Math.PI * 5.3 - phase * frequency * 0.7) *
      amplitude *
      amplitudeMultiplier *
      0.4;
    d += ` L ${x.toFixed(1)} ${(first + second + HEIGHT / 2).toFixed(1)}`;
  }
  return `${d} L ${PATH_WIDTH} ${HEIGHT} Z`;
}

/**
 * Water surface wave. ONE visibility-paused RAF loop drives all three wave
 * paths. Previously this ran one parent `useAnimationFrame` PLUS three
 * per-`WavePath` animation-frame callbacks — four loops rewriting SVG paths
 * on the Home tree perpetually, even when the water card was off-screen or the
 * tab was hidden. Mirrors WaterBubbles' IntersectionObserver +
 * visibilitychange pause pattern; throttled to ~30fps; schedules NO frame
 * while hidden / off-screen / reduced-motion. Framer Motion is gone from this
 * component and `WavePath` is removed.
 */
export default function WaterWave({ fillPercent, splash }: WaterWaveProps) {
  const reducedMotion = useReducedMotion();
  const gradientId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const backRef = useRef<SVGPathElement>(null);
  const frontRef = useRef<SVGPathElement>(null);
  const highlightRef = useRef<SVGPathElement>(null);
  const amplitudeRef = useRef(3);
  const phaseRef = useRef(0);
  const [active, setActive] = useState(() =>
    typeof document === "undefined"
      ? true
      : document.visibilityState === "visible"
  );

  const surfaceColor =
    fillPercent > 60 ? "rgba(78, 195, 220, 0.35)" : "rgba(58, 153, 186, 0.30)";
  const backColor =
    fillPercent > 60 ? "rgba(78, 195, 220, 0.18)" : "rgba(58, 153, 186, 0.14)";

  useEffect(() => {
    amplitudeRef.current = reducedMotion ? 3 : 8;
  }, [splash, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const element = svgRef.current;
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

  useEffect(() => {
    if (reducedMotion || !active) return;
    let frame = 0;
    let lastUpdate = 0;
    let cancelled = false;

    const tick = (time: number) => {
      if (time - lastUpdate >= 33) {
        lastUpdate = time;
        const phase = time * 0.001;
        phaseRef.current = phase;
        const amplitude = amplitudeRef.current;
        backRef.current?.setAttribute(
          "d",
          buildPath(phase, 0.6, 0.7, amplitude)
        );
        frontRef.current?.setAttribute("d", buildPath(phase, 1, 1, amplitude));
        highlightRef.current?.setAttribute(
          "d",
          buildPath(phase, 1, 1, amplitude)
        );
        if (amplitudeRef.current > 3.1) {
          amplitudeRef.current = Math.max(amplitudeRef.current * 0.98, 3);
        }
      }
      if (!cancelled) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [active, reducedMotion]);

  if (reducedMotion) {
    return (
      <svg
        ref={svgRef}
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${PATH_WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ transform: "translateY(-12px)" }}
        aria-hidden="true"
      >
        <path fill={surfaceColor} d={buildPath(0, 1, 1, 3)} />
      </svg>
    );
  }

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={HEIGHT}
      viewBox={`0 0 ${PATH_WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="absolute inset-x-0 top-0 pointer-events-none"
      style={{ transform: "translateY(-12px)" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <path
        ref={backRef}
        fill={backColor}
        d={buildPath(phaseRef.current, 0.6, 0.7, amplitudeRef.current)}
      />
      <path
        ref={frontRef}
        fill={surfaceColor}
        d={buildPath(phaseRef.current, 1, 1, amplitudeRef.current)}
      />
      <path
        ref={highlightRef}
        fill={`url(#${gradientId})`}
        d={buildPath(phaseRef.current, 1, 1, amplitudeRef.current)}
        style={{ clipPath: `inset(0 0 ${HEIGHT - 6}px 0)` }}
      />
    </svg>
  );
}
