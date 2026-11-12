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
  /** Cut the groove into the card the ring sits on (DESIGN_GUIDE §14o).
   *  In the dark theme the track is then darker than the card, with a
   *  hairline of light under it; the light theme draws the same groove
   *  as without it. For a ring on a card: on the page there is no darker
   *  to cut to. A `trackColor` wins over it. */
  cut?: boolean;
  /** Size the ring in rem, so it grows with the reader's text size and
   *  the number inside it still fits at larger text. `size` and `stroke`
   *  are then the ring's size at the default 16px. For a ring that holds
   *  a large figure; a ring among fixed-size controls stays in pixels. */
  scaleWithText?: boolean;
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
  trackColor,
  cut = false,
  scaleWithText = false,
  children,
  className,
}: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const reduce = useReducedMotion();
  const cutIn = cut && trackColor === undefined;
  return (
    <div
      className={cn("relative flex-shrink-0", className)}
      style={
        scaleWithText
          ? { width: `${size / 16}rem`, height: `${size / 16}rem` }
          : { width: size, height: size }
      }
    >
      <svg
        width={scaleWithText ? "100%" : size}
        height={scaleWithText ? "100%" : size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn("-rotate-90", cutIn && "overflow-visible")}
        aria-hidden="true"
      >
        {cutIn && (
          /* The light a cut groove catches: the track's own shape one
             pixel lower, under it, so it shows only below the ring's
             outer edge and along the top of the island inside. The svg
             is turned a quarter, which makes its -x the screen's down,
             and the lowest pixel falls outside the viewBox, hence the
             visible overflow. */
          <circle
            data-ring-lip=""
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--ds-ring-lip)"
            strokeWidth={stroke}
            transform="translate(-1 0)"
          />
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={
            trackColor ??
            (cutIn
              ? "var(--ds-ring-track)"
              : "hsl(var(--muted-foreground) / 0.22)")
          }
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
