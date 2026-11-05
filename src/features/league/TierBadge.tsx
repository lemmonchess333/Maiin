import { useId } from "react";
import type { LeagueTier } from "./leagueRules";
import { LEAGUE_PALETTES } from "./leaguePalettes";

/*
 * The shield every tier shares, in a 64 × 72 box: a flat top with rounded
 * shoulders, straight sides and a point. The body sits inside the rim, and
 * the shine is the body's upper part.
 */
const RIM =
  "M32 2 L58 10 Q61 11 61 14 L61 36 C61 52 49 64 32 70 C15 64 3 52 3 36 L3 14 Q3 11 6 10 Z";
const BODY =
  "M32 7 L55 14 L56 15 L56 36 C56 49 46 59 32 64.5 C18 59 8 49 8 36 L8 15 L9 14 Z";
const SHINE = "M32 7 L55 14 L56 15 L56 30 Q32 22 8 30 L8 15 L9 14 Z";

/** A chevron pointing up, centred on x = 32 at height `y`. */
function chevron(y: number) {
  return `M20 ${y + 6} L32 ${y} L44 ${y + 6} L44 ${y + 11} L32 ${y + 5} L20 ${y + 11} Z`;
}

/** Each tier's mark: one, two and three chevrons for Bronze, Silver and
 *  Gold, a star for Platinum and a cut stone for Diamond. Shape as well as
 *  metal, so the tiers stay apart for someone who cannot tell the metals
 *  apart, and in a greyscale screenshot. */
function Emblem({ tier, ink }: { tier: LeagueTier; ink: string }) {
  if (tier === "platinum") {
    return (
      <path
        fill={ink}
        d="M32 21 L35.9 29.6 L45.3 30.6 L38.3 36.9 L40.2 46.1 L32 41.4 L23.8 46.1 L25.7 36.9 L18.7 30.6 L28.1 29.6 Z"
      />
    );
  }
  if (tier === "diamond") {
    return (
      <g>
        <path fill={ink} d="M22 30 L27 23 L37 23 L42 30 L32 46 Z" />
        <path
          fill="none"
          stroke={LEAGUE_PALETTES.diamond.highlight}
          strokeWidth="1.2"
          strokeLinejoin="round"
          d="M22 30 L42 30 M27 23 L30 30 L32 46 L34 30 L37 23"
          opacity="0.7"
        />
      </g>
    );
  }
  const count = tier === "gold" ? 3 : tier === "silver" ? 2 : 1;
  const top = 34 - (count * 8 + 3) / 2;
  return (
    <g fill={ink}>
      {Array.from({ length: count }, (_, i) => (
        <path key={i} d={chevron(top + i * 8)} />
      ))}
    </g>
  );
}

/**
 * A league tier, drawn (Soc15 call 3): a shield in the tier's metal, with
 * the tier's mark on it. SVG, so the metal reads the same on every screen
 * and in light and dark: the rim is the metal's dark edge, which holds the
 * shape against a white card, and the shine lifts it off a dark one.
 * Decorative: the words beside it name the tier.
 */
export default function TierBadge({
  tier,
  size = 40,
  className,
}: {
  tier: LeagueTier;
  /** The badge's width in px; it is 9:8 tall. */
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const p = LEAGUE_PALETTES[tier];
  return (
    <svg
      width={size}
      height={Math.round((size * 72) / 64)}
      viewBox="0 0 64 72"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-tier={tier}
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.highlight} />
          <stop offset="45%" stopColor={p.base} />
          <stop offset="100%" stopColor={p.edge} />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.highlight} stopOpacity="0.75" />
          <stop offset="100%" stopColor={p.highlight} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={RIM} fill={p.edge} />
      <path d={BODY} fill={`url(#${id}-body)`} />
      <path d={SHINE} fill={`url(#${id}-shine)`} />
      <Emblem tier={tier} ink={p.icon} />
    </svg>
  );
}
