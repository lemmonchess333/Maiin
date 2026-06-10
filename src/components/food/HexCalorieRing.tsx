import { useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeftRight } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import { getCalorieRingDisplay } from "@/lib/calorieRingDisplay";
import { THEME } from "@/lib/theme";
import type { CalorieRingMode } from "./CalorieRing";

/**
 * BAKE-OFF CANDIDATE — hexagon calorie ring (Experiment 2).
 *
 * A drop-in alternative to CalorieRing: identical props, centre content,
 * gradient/track treatment, no-red-over-target rule, over-100% overshoot
 * arc, dark-mode behaviour, and the `glowing` celebration hook. The ONLY
 * change is the geometry — a rounded (squircle) flat-bottom hexagon whose
 * perimeter the progress stroke sweeps via `pathLength=100` + dasharray,
 * starting top-centre and going clockwise like the circle.
 *
 * Not wired into any production surface — rendered only by the dev-only
 * /dev/brand-bakeoff route for the circle-vs-hexagon comparison.
 */

interface HexCalorieRingProps {
  consumed: number;
  target: number;
  mode: CalorieRingMode;
  onToggleMode: () => void;
  trajectoryLabel: string | null;
  glowing?: boolean;
  ringDurationMs?: number;
}

const SIZE = 160;
const CENTER = 80;
const R = 74; // centre→vertex
const STROKE = 10;
const TRIM = 26; // ~0.35 × side length → squircle-hex corners, not sharp

// Same brand-purple palette + treatment as CalorieRing.
const COLOR_RING = THEME.brand;
const COLOR_RING_LIGHT = "#A8A2EF";
const COLOR_RING_DEEP = "#5D55C9";
const COLOR_TRACK = "rgba(123, 114, 233, 0.10)";
const RING_EASE = [0.32, 0.72, 0, 1] as [number, number, number, number];

// Flat-top / flat-bottom hexagon, vertices clockwise starting upper-right.
// svg y is down, so y = CENTER − R·sinθ.
const ANGLES_DEG = [60, 0, -60, -120, 180, 120];
type Pt = { x: number; y: number };
const VERTS: Pt[] = ANGLES_DEG.map((d) => {
  const t = (d * Math.PI) / 180;
  return { x: CENTER + R * Math.cos(t), y: CENTER - R * Math.sin(t) };
});

function lerpToward(from: Pt, to: Pt, dist: number): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist };
}
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const f = (n: number) => Math.round(n * 100) / 100;

// Build the rounded path STARTING at the midpoint of the top edge (between
// the last vertex = upper-left and the first = upper-right) so the dash
// sweep begins top-centre and runs clockwise — matching the circle's 12
// o'clock start without needing a rotation.
function buildHexPath(): string {
  const n = VERTS.length;
  const topMid = mid(VERTS[n - 1], VERTS[0]); // upper-left ↔ upper-right
  let d = `M ${f(topMid.x)} ${f(topMid.y)}`;
  for (let i = 0; i < n; i++) {
    const v = VERTS[i];
    const prev = VERTS[(i - 1 + n) % n];
    const next = VERTS[(i + 1) % n];
    const inPt = lerpToward(v, prev, TRIM); // approach v
    const outPt = lerpToward(v, next, TRIM); // leave v
    d += ` L ${f(inPt.x)} ${f(inPt.y)} Q ${f(v.x)} ${f(v.y)} ${f(outPt.x)} ${f(outPt.y)}`;
  }
  d += ` L ${f(topMid.x)} ${f(topMid.y)} Z`;
  return d;
}
const HEX_PATH = buildHexPath();

export default function HexCalorieRing({
  consumed,
  target,
  mode,
  onToggleMode,
  trajectoryLabel,
  glowing = false,
  ringDurationMs = 1500,
}: HexCalorieRingProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const ringGradientId = `hex-ring-gradient${id}`;
  const overflowGradientId = `hex-overflow-gradient${id}`;

  const hasTarget = target > 0;
  const remaining = hasTarget ? target - consumed : 0;
  const isLeftMode = mode === "left";
  const progress = hasTarget ? Math.min(consumed / target, 1) : 0;

  const { displayValue, labelMode, isOver } = getCalorieRingDisplay({
    consumed,
    target,
    isLeftMode,
  });

  const numberColor = hasTarget ? COLOR_RING : THEME.neutral[300];

  // pathLength=100 normalises the perimeter so the dash math is identical to
  // the circle's: full = 100, drained/filled by fillRatio.
  const fillRatio = isLeftMode ? 1 - progress : progress;
  const dashOffset = 100 * (1 - fillRatio);

  const overshoot = isOver ? consumed - target : 0;
  const overshootRatio =
    isOver && target > 0 ? Math.min(overshoot / target, 1) : 0;
  const overlapOffset = 100 * (1 - overshootRatio);

  const ringDurationSec = ringDurationMs / 1000;

  const ariaLabel = hasTarget
    ? isOver
      ? `${consumed} of ${target} calories consumed, ${Math.abs(remaining)} over target`
      : isLeftMode
        ? `${consumed} of ${target} calories consumed, ${remaining} remaining`
        : `${consumed} of ${target} calories eaten`
    : `${consumed} calories consumed, no target set`;

  return (
    <button
      type="button"
      onClick={onToggleMode}
      aria-label={
        ariaLabel + ". Tap to toggle between calories left and calories eaten."
      }
      className="relative size-40 aspect-square mx-auto block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl"
      style={{
        filter: glowing
          ? "drop-shadow(0 0 16px rgba(123, 114, 233, 0.4))"
          : undefined,
        transition: "filter 800ms ease-in-out",
      }}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full">
        <defs>
          <linearGradient
            id={ringGradientId}
            x1="0"
            y1="0"
            x2="0"
            y2={SIZE}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={COLOR_RING_LIGHT} />
            <stop offset="100%" stopColor={COLOR_RING} />
          </linearGradient>
          <linearGradient
            id={overflowGradientId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor={COLOR_RING} />
            <stop offset="100%" stopColor={COLOR_RING_DEEP} />
          </linearGradient>
        </defs>

        {/* Track */}
        <path
          d={HEX_PATH}
          fill="none"
          stroke={COLOR_TRACK}
          strokeWidth={STROKE}
          strokeLinejoin="round"
        />
        {/* Progress */}
        {hasTarget && (
          <motion.path
            d={HEX_PATH}
            pathLength={100}
            fill="none"
            stroke={`url(#${ringGradientId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={100}
            initial={{ strokeDashoffset: reduce ? dashOffset : 100 }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{
              duration: reduce ? 0 : ringDurationSec,
              ease: RING_EASE,
              delay: reduce ? 0 : 0.1,
            }}
          />
        )}
        {/* Overshoot overlap arc — over target, both modes (matches circle) */}
        {isOver && (
          <motion.path
            d={HEX_PATH}
            pathLength={100}
            fill="none"
            stroke={`url(#${overflowGradientId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={100}
            initial={{ strokeDashoffset: reduce ? overlapOffset : 100 }}
            animate={{ strokeDashoffset: overlapOffset }}
            transition={{
              duration: reduce ? 0 : 1.5,
              ease: RING_EASE,
              delay: reduce ? 0 : 0.6,
            }}
          />
        )}
      </svg>

      {/* Centre text — identical to CalorieRing */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        {hasTarget ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center"
            >
              <p
                className="text-4xl font-extrabold font-mono tabular-nums leading-none tracking-tight"
                style={{
                  color: numberColor,
                  opacity: displayValue === 0 ? 0.4 : 1,
                }}
              >
                <AnimatedNumber
                  value={displayValue}
                  duration={ringDurationSec}
                  ease={RING_EASE}
                />
              </p>
              <span
                className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold uppercase tracking-wider tabular-nums"
                style={{ color: COLOR_RING_DEEP, backgroundColor: COLOR_TRACK }}
              >
                {CALORIE_UNIT} {labelMode}
                <ArrowLeftRight className="size-2.5" aria-hidden="true" />
              </span>
              {trajectoryLabel && (
                <p className="text-caption mt-1 text-muted-foreground/70 font-mono tabular-nums">
                  {trajectoryLabel}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <span className="text-4xl font-extrabold text-muted-foreground/40">
            &mdash;
          </span>
        )}
      </div>
    </button>
  );
}
