import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** Progress from 0 to 1. Values outside are clamped. */
  value: number;
  /** Outer diameter in CSS pixels. */
  size: number;
  /** Stroke width in CSS pixels. */
  stroke: number;
  /** The arc's colour: a token expression or a THEME value. */
  color: string;
  /** The unfilled track. Defaults to a neutral groove that reads on the
   *  card in both themes (`bg-muted` measures 1.06:1 against the card,
   *  which is why the macro rings moved off it). */
  trackColor?: string;
  /** Centre content — the number the ring is about. */
  children?: ReactNode;
  className?: string;
}

/**
 * A full-circle progress ring with rounded ends (DS3).
 *
 * One construction for the rings Home draws: the food card's calories and
 * the week's performance score. The arc starts at twelve o'clock and fills
 * clockwise. It is decorative: the number it frames, and the sentence
 * beside it, carry the reading, so the SVG is hidden from assistive tech.
 * The fill draws in from empty, and under Reduce Motion it is simply
 * there. That gate is this component's own: the app's
 * `MotionConfig reducedMotion="user"` settles only positional values
 * (x, y, scale, width, height), and a stroke offset is not one, so this
 * ring drew in for everyone until it asked the preference itself.
 */
export default function ProgressRing({
  value,
  size,
  stroke,
  color,
  trackColor = "hsl(var(--muted-foreground) / 0.22)",
  children,
  className,
}: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const reduce = useReducedMotion();
  return (
    <div
      className={cn("relative flex-shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {clamped > 0 && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={reduce ? false : { strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - clamped) }}
            transition={
              reduce ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }
            }
          />
        )}
      </svg>
      {children !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
