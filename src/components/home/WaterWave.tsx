import { useEffect, useRef } from "react";
import { useMotionValue, useAnimationFrame } from "framer-motion";

interface WaterWaveProps {
  width: number;
  fillPercent: number;
  splash: number;
}

const prefersReducedMotion =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export default function WaterWave({ width, fillPercent, splash }: WaterWaveProps) {
  const phase = useMotionValue(0);
  const ampRef = useRef(3);

  // Splash effect — use exponential decay via RAF instead of 40ms setInterval
  useEffect(function () {
    ampRef.current = 8;
  }, [splash]);

  // Single RAF loop that drives both phase and amplitude decay
  useAnimationFrame(function (time) {
    if (prefersReducedMotion) return;
    phase.set(time * 0.001);
    // Decay amplitude toward resting value
    if (ampRef.current > 3.1) {
      ampRef.current = Math.max(ampRef.current * 0.98, 3);
    }
  });

  const height = 24;
  const points = 40;

  function buildPath(phaseVal: number, freqMult: number, ampMult: number): string {
    const amp = ampRef.current * ampMult;
    let d = "M 0 " + height;
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      const norm = i / points;
      const y1 = Math.sin(norm * Math.PI * 3 + phaseVal * freqMult) * amp;
      const y2 = Math.sin(norm * Math.PI * 5.3 - phaseVal * freqMult * 0.7) * amp * 0.4;
      const y = y1 + y2 + height / 2;
      d += " L " + x.toFixed(1) + " " + y.toFixed(1);
    }
    d += " L " + width + " " + height + " Z";
    return d;
  }

  const surfaceColor = fillPercent > 60
    ? "rgba(78, 195, 220, 0.35)"
    : "rgba(58, 153, 186, 0.30)";
  const backColor = fillPercent > 60
    ? "rgba(78, 195, 220, 0.18)"
    : "rgba(58, 153, 186, 0.14)";

  if (prefersReducedMotion) {
    const amp = 3;
    let staticPath = "M 0 " + height;
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      const norm = i / points;
      const y1 = Math.sin(norm * Math.PI * 3) * amp;
      const y2 = Math.sin(norm * Math.PI * 5.3) * amp * 0.4;
      const y = y1 + y2 + height / 2;
      staticPath += " L " + x.toFixed(1) + " " + y.toFixed(1);
    }
    staticPath += " L " + width + " " + height + " Z";
    return (
      <svg
        width={width}
        height={height}
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ transform: "translateY(-12px)" }}
        aria-hidden="true"
      >
        <path fill={surfaceColor} d={staticPath} />
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      className="absolute inset-x-0 top-0 pointer-events-none"
      style={{ transform: "translateY(-12px)" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="waveGrad1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      <WavePath
        phase={phase}
        freqMult={0.6}
        ampMult={0.7}
        fill={backColor}
        buildPath={buildPath}
      />

      <WavePath
        phase={phase}
        freqMult={1.0}
        ampMult={1.0}
        fill={surfaceColor}
        buildPath={buildPath}
      />

      <WavePath
        phase={phase}
        height={height}
        freqMult={1.0}
        ampMult={1.0}
        fill="url(#waveGrad1)"
        buildPath={buildPath}
        clipHeight={6}
      />
    </svg>
  );
}

function WavePath({
  phase, height, freqMult, ampMult, fill, buildPath, clipHeight
}: {
  phase: ReturnType<typeof useMotionValue<number>>;
  height?: number;
  freqMult: number;
  ampMult: number;
  fill: string;
  buildPath: (p: number, f: number, a: number) => string;
  clipHeight?: number;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const lastUpdateRef = useRef(0);

  // Throttle DOM writes to ~30fps instead of 60fps
  useAnimationFrame(function (time) {
    if (!pathRef.current) return;
    if (time - lastUpdateRef.current < 33) return; // ~30fps
    lastUpdateRef.current = time;
    pathRef.current.setAttribute("d", buildPath(phase.get(), freqMult, ampMult));
  });

  return (
    <path
      ref={pathRef}
      fill={fill}
      style={clipHeight && height ? { clipPath: "inset(0 0 " + (height - clipHeight) + "px 0)", willChange: "auto" } : { willChange: "auto" }}
    />
  );
}
