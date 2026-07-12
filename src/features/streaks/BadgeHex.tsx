import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import type { BadgeTier } from "./badges";
import { THEME } from "@/lib/theme";

// Tier hue for the earned-art glow. Reads THEME.tier directly (same values
// TIER_COLORS re-exports) — a ./badges import here would be circular-ish
// (badges.ts is a data module that many surfaces pull in).
const TIER_GLOW: Record<BadgeTier, string> = THEME.tier;

/**
 * Hex-shaped achievement badge. SVG-based so the metallic gradient + shine
 * look the same on every browser and scale cleanly at any size.
 *
 * Visual anatomy (bottom → top):
 *   1. Outer polygon in `edge` — acts as a darker rim / shadow.
 *   2. Inset body polygon filled with a radial gradient from `highlight`
 *      (top-left) through `base` (centre) to `edge` (bottom-right) — gives
 *      the "polished coin" look.
 *   3. Top-half polygon with a white→transparent linear gradient — the
 *      specular highlight across the upper face.
 *   4. Lucide icon centred on top at ~42% of the badge size.
 *
 * Locked state reuses the same three-layer structure but with a cool-grey
 * palette so the shape reads the same while signalling "not earned yet."
 * The original category icon still shows (Cal AI convention) rather than a
 * lock — colour is the earned/locked signal.
 */

interface Palette {
  edge: string;
  base: string;
  highlight: string;
  icon: string;
}

const TIER_PALETTES: Record<BadgeTier, Palette> = {
  bronze: {
    edge: "#7a3d0e",
    base: THEME.tier.bronze,
    highlight: "#f4b07a",
    icon: "#ffffff",
  },
  silver: {
    edge: "#6e6e6e",
    base: THEME.tier.silver,
    highlight: "#ffffff",
    icon: "#3a3a3a",
  },
  gold: {
    edge: "#a8740a",
    base: THEME.tier.gold,
    highlight: "#fff6c7",
    icon: "#4a2c00",
  },
  platinum: {
    edge: "#8a8a8a",
    base: THEME.tier.platinum,
    highlight: "#ffffff",
    icon: "#3a3a3a",
  },
};

// Cool-grey "not earned yet" palette. Darkened from the original near-white
// greys (base #cfcfcf / highlight #ebebeb) which vanished on the WHITE
// light-mode card — a light-grey hex on white read as an empty ring (worst on
// the Home Next-badge nudge). These mid-greys register on white while staying
// clearly "off" on the dark card, and sitting further below earned-silver
// (#c0c0c0) they also read as MORE distinct from an earned silver badge.
const LOCKED_PALETTE: Palette = {
  edge: "#83838a",
  base: "#b4b4bb",
  highlight: "#d3d3d9",
  icon: "#6b6b72",
};

// Pointy-top hexagon fits the badge aesthetic better than flat-top. Same
// shape used by Apple Fitness and most achievement systems.
const OUTER = "50,2 95,27 95,73 50,98 5,73 5,27";
const BODY = "50,7 90,30 90,70 50,93 10,70 10,30";
const SHINE = "50,7 90,30 90,48 50,32 10,48 10,30";

interface BadgeHexProps {
  Icon: LucideIcon;
  tier: BadgeTier;
  earned: boolean;
  size?: number;
  className?: string;
  /** Optional pre-rendered badge artwork (e.g. AI-generated, committed to
   *  public/badges/<id>.webp). When set, the image IS the badge — the SVG
   *  hex + lucide icon are the fallback for badges without bespoke art, so
   *  the catalogue can adopt artwork incrementally. Locked badges desaturate
   *  + dim the artwork to keep the earned/locked read. */
  imageSrc?: string;
}

export function BadgeHex({
  Icon,
  tier,
  earned,
  size = 56,
  className,
  imageSrc,
}: BadgeHexProps) {
  // useId so multiple BadgeHexes on the same page get unique gradient ids —
  // without this the last-rendered instance's gradient would overwrite all
  // siblings with the same id.
  const id = useId().replace(/:/g, "");
  const p = earned ? TIER_PALETTES[tier] : LOCKED_PALETTE;
  const iconSize = Math.round(size * 0.42);

  if (imageSrc) {
    /* Phase-4 render-site fix (visual audit):
       — Earned art carries a tier-tinted glow ON the badge itself (the old
         card-level box-shadow barely registered at grid size). Static,
         size-dependent filter, so it stays inline.
       — LOCKED art contrast is theme-dependent, so its opacity + filter live
         in the `.badge-art-locked` CSS class (light/dark split). The bespoke
         silver art grayscales to a light grey that WASHED OUT on the white
         light-mode card (running/nutrition locked badges read as near-blank);
         light mode now darkens it so it registers on white, while dark keeps
         the original faint treatment (silver on the dark card already reads).
         Locked still keeps a trace of its metal (grayscale <1) so the grid
         doesn't become a wall of grey ghosts. */
    return (
      <div
        className={
          earned
            ? className
            : [className, "badge-art-locked"].filter(Boolean).join(" ")
        }
        style={{
          width: size,
          height: size,
          ...(earned
            ? {
                opacity: 1,
                filter: `drop-shadow(0 2px 6px rgba(0,0,0,0.22)) drop-shadow(0 0 ${Math.max(6, Math.round(size * 0.14))}px ${TIER_GLOW[tier]}59)`,
              }
            : null),
        }}
        aria-hidden="true"
      >
        <img
          src={imageSrc}
          alt=""
          width={size}
          height={size}
          style={{
            width: size,
            height: size,
            objectFit: "contain",
            display: "block",
          }}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        position: "relative",
        // Locked hexes fade back so they read as unambiguously "off"
        // even when the tier palette would otherwise look close to the
        // locked grey (silver in particular — silver base #c0c0c0 sits
        // right next to locked base #cfcfcf, which made earned silver
        // badges look indistinguishable from locked ones on the grid).
        opacity: earned ? 1 : 0.65,
        filter: earned
          ? "drop-shadow(0 2px 4px rgba(0,0,0,0.18))"
          : "drop-shadow(0 1px 2px rgba(0,0,0,0.08))",
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ display: "block" }}
      >
        <defs>
          <radialGradient id={`bh-body-${id}`} cx="35%" cy="28%" r="78%">
            <stop offset="0%" stopColor={p.highlight} />
            <stop offset="55%" stopColor={p.base} />
            <stop offset="100%" stopColor={p.edge} />
          </radialGradient>
          <linearGradient
            id={`bh-shine-${id}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={OUTER} fill={p.edge} />
        <polygon points={BODY} fill={`url(#bh-body-${id})`} />
        <polygon points={SHINE} fill={`url(#bh-shine-${id})`} />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <Icon
          style={{ color: p.icon, width: iconSize, height: iconSize }}
          strokeWidth={2.5}
        />
      </div>
    </div>
  );
}
