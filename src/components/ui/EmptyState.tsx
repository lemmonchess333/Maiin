import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  buttonClasses,
  type ButtonVariant,
} from "@/components/ui/buttonClasses";
import { THEME } from "@/lib/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Design-system empty-state primitive built around the brand hexagon
 * (DESIGN_GUIDE §7). One headline, an optional sub, and at most ONE action.
 *
 * The hexagon is the brand signature's first in-app appearance outside the
 * streak badges. It is drawn fresh as stroke vector here — NOT the raster app
 * icon (which is the legacy "ADAPT" barbell mark, pre-Tropos rebrand; the
 * documented purple-hexagon-with-upward-chevron brand mark has no committed
 * vector asset, so geometry is derived from the pointy-top hexagon already
 * used by `features/streaks/BadgeHex` + the chevron from CLAUDE.md's logo
 * description). Hexagon usage rule: empty-states and badges ONLY — never
 * decoration on a populated surface.
 *
 * Distinct from the older `src/components/EmptyState.tsx` (a square-icon
 * variant still used by Crew / ExerciseHistory); this is the canonical
 * hexagon primitive. Those surfaces can migrate post-launch.
 */

// Pointy-top hexagon, inset from the 100×100 viewBox so the ~2px stroke
// isn't clipped. Same family as BadgeHex's geometry for a consistent mark.
const HEX_POINTS = "50,6 89,28 89,72 50,94 11,72 11,28";
// Upward chevron (the brand cutout) — shown when no context icon is supplied.
const CHEVRON = "35,57 50,41 65,57";

interface EmptyStateProps {
  /** One-line headline (text-h3). */
  headline: string;
  /** Optional one-line supporting sentence (text-small). */
  sub?: string;
  /** Optional lucide icon centred inside the hexagon for context
   *  (e.g. Activity for performance, Users for social). When omitted the
   *  hexagon shows its upward-chevron brand cutout. */
  icon?: LucideIcon;
  /** At most one action. `href` routes via <Link>; `onClick` is a button.
   *  `variant` picks the canonical Button look (defaults to `primary`);
   *  set it to `sport` / `nutrition` so the CTA colour matches the page
   *  domain rather than always reading brand-purple. */
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
    variant?: ButtonVariant;
  };
  /** Page domain accent — tints the hexagon stroke + inner icon at low
   *  opacity. Defaults to brand purple. */
  accent?: string;
  /** Compact treatment for empty states that live INSIDE a card (e.g. the
   *  Performance hero on Home / Analytics) rather than filling a page —
   *  smaller hexagon + tighter rhythm so the empty card doesn't dominate
   *  the screen. Defaults to the full page-level size. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  headline,
  sub,
  icon: Icon,
  action,
  accent = THEME.brand,
  compact = false,
  className,
}: EmptyStateProps) {
  const reduced = useReducedMotion();
  const size = compact ? 52 : 72;

  // Draw-in: hexagon strokes on once, inner content fades in after. Fully
  // static under prefers-reduced-motion.
  const hexAnim = reduced
    ? {}
    : {
        initial: { pathLength: 0, opacity: 0 },
        animate: { pathLength: 1, opacity: 1 },
        transition: { duration: 0.6, ease: "easeInOut" as const },
      };
  const innerAnim = reduced
    ? {}
    : {
        initial: { opacity: 0, scale: 0.8 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.3, delay: 0.45 },
      };

  return (
    <div
      className={`text-center px-6 ${compact ? "py-6 space-y-2.5" : "py-10 space-y-4"} ${className ?? ""}`}
      role="status"
    >
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          fill="none"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          <motion.polygon
            points={HEX_POINTS}
            stroke={accent}
            strokeOpacity={0.5}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            {...hexAnim}
          />
          {!Icon && (
            <motion.polyline
              points={CHEVRON}
              stroke={accent}
              strokeOpacity={0.7}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              {...innerAnim}
            />
          )}
        </svg>
        {Icon && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            {...innerAnim}
          >
            <Icon
              size={Math.round(size * 0.34)}
              style={{ color: accent }}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </motion.div>
        )}
      </div>
      <div className="space-y-1.5">
        <p className="text-h3 font-bold text-foreground">{headline}</p>
        {sub && (
          <p className="text-small text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
            {sub}
          </p>
        )}
      </div>
      {action &&
        (action.href ? (
          <Link
            to={action.href}
            className={buttonClasses({ variant: action.variant })}
          >
            {action.label}
          </Link>
        ) : (
          <Button variant={action.variant} onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}

export default EmptyState;
