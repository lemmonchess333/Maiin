import { useId, useState } from "react";
import { TIER_PALETTES, type Palette } from "@/features/streaks/tierPalettes";
import { SPORT_ACCENT, SPORT_TAG, type ChallengeSport } from "./challengeSport";
import type { MedalTier } from "./medals";

/*
 * Font stacks written out, not taken from a class: the share card is
 * rasterised by html-to-image, whose clone does not reliably resolve the
 * app's classes (ShareCardRenderer says why), and the medal is drawn on it.
 */
const ARCHIVO = "'Archivo Variable', ui-sans-serif, system-ui, sans-serif";
const JAKARTA =
  "'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, sans-serif";

/** The drawing's own space: a ribbon over a round medal. */
const W = 120;
const H = 160;
const CX = 60;
const CY = 104;
/** The medal's radius. An illustration's coin fills 96% of its square
 *  (key-hexagon.py's `coin` frame), so its square is drawn this much
 *  wider than the medal for the two rims to meet. */
const R = 50;
const ART_BOX = (2 * R) / 0.96;

/* The two straps of the ribbon, each a band from the top edge down
   behind the medal, crossing into a V above it, with a stripe of the
   tier's metal down its middle. */
const BACK_STRAP = "72,0 98,0 76,66 50,66";
const FRONT_STRAP = "22,0 48,0 70,66 44,66";
const BACK_STRIPE = "81,0 89,0 67,66 59,66";
const FRONT_STRIPE = "31,0 39,0 61,66 53,66";
/** The scroll the edition is written on, notched at both ends. */
const SCROLL = `14,${CY + 24} 106,${CY + 24} 100,${CY + 31} 106,${CY + 38} 14,${CY + 38} 20,${CY + 31}`;

/** The figure's size by its length, so "25:00" and "15k" both fit the
 *  face. */
function figureSize(figure: string): number {
  if (figure.length <= 3) return 22;
  if (figure.length === 4) return 19;
  if (figure.length === 5) return 16;
  return 13;
}

/** The width the scroll leaves its words, inside the notches. */
const SCROLL_TEXT_MAX = 76;

/** The edition's type by its length, so "NOV 2026" and "SEPT–NOV 2026"
 *  both sit inside the scroll. A width past the estimate is held to the
 *  scroll (`textLength`) as a last resort. */
function editionType(edition: string): {
  size: number;
  spacing: number;
  fit?: number;
} {
  const n = edition.length;
  const size = n <= 10 ? 7.2 : n <= 13 ? 6.4 : 5.6;
  const spacing = n <= 10 ? 0.6 : 0.3;
  const estimate = n * (size * 0.7 + spacing);
  return {
    size,
    spacing,
    ...(estimate > SCROLL_TEXT_MAX ? { fit: SCROLL_TEXT_MAX } : {}),
  };
}

/**
 * A challenge medal (Soc15): a round medal in its tier's metal on a
 * ribbon in its sport's colour, carrying the goal the tier stood for and
 * the edition. Drawn from the same metals as the badges (`TIER_PALETTES`,
 * which the badge hexagon and the seal use) so a medal belongs with them,
 * and from the sport colours a challenge card wears (`SPORT_ACCENT`).
 *
 * Two medals, one layout. With `imageSrc` (a definition's Gemini
 * illustration, medalDefinitions.ts) the coin is the art, in the badges' material
 * (black enamel face, the emblem in tier-metal relief), and the goal is
 * struck over its lower face in the metal's light. Without it, or while
 * the art loads, or if it fails, the coin is drawn here: a metal face
 * with the sport's icon over the goal in the metal's ink. The ribbon, the
 * scroll and the edition on it are always drawn here, so one image serves
 * every edition of its definition.
 *
 * It looks the same in both themes: the metal and the ribbon are the
 * medal's own colours, not the page's.
 *
 * Drawn in px: it is a picture, and keeps its size at larger text. The
 * words on it are repeated in text beside it wherever it is shown, so
 * it is hidden from assistive technology unless given a `label`.
 */
export default function MedalArt({
  tier,
  sport,
  figure,
  unit,
  edition,
  imageSrc,
  size = 96,
  label,
  className,
}: {
  tier: MedalTier;
  sport: ChallengeSport;
  /** The goal's figure, "50" or "25:00". */
  figure: string;
  /** The word under it, "km" or "5K". */
  unit: string;
  /** "Nov 2026", written in capitals on the scroll. */
  edition: string;
  /** The definition's illustration (MEDAL_ART), when one has been made. */
  imageSrc?: string;
  /** Width in px; the height follows (3 wide to 4 tall). */
  size?: number;
  /** An accessible name, when nothing beside the medal says what it is. */
  label?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const p = TIER_PALETTES[tier];
  const ribbon = SPORT_ACCENT[sport];
  const height = Math.round((size * H) / W);
  const type = editionType(edition);
  // The art that failed to load, so the drawn coin takes over for it.
  const [failed, setFailed] = useState<string | null>(null);
  const art = imageSrc && failed !== imageSrc ? imageSrc : undefined;

  return (
    <div
      className={className}
      style={{
        width: size,
        height,
        filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.28))",
      }}
      data-medal-tier={tier}
      data-medal-art={art ? "image" : "drawn"}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={size}
        height={height}
        style={{ display: "block" }}
        {...(label
          ? { role: "img", "aria-label": label }
          : { "aria-hidden": true })}
      >
        <defs>
          <linearGradient id={`md-rim-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={p.highlight} />
            <stop offset="50%" stopColor={p.base} />
            <stop offset="100%" stopColor={p.edge} />
          </linearGradient>
          <radialGradient id={`md-face-${id}`} cx="36%" cy="30%" r="80%">
            <stop offset="0%" stopColor={p.highlight} />
            <stop offset="55%" stopColor={p.base} />
            <stop offset="100%" stopColor={p.edge} />
          </radialGradient>
          <radialGradient id={`md-enamel-${id}`} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={p.edge} />
            <stop offset="100%" stopColor="black" />
          </radialGradient>
          <linearGradient id={`md-sheen-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.55" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The ribbon: the back strap a shade deeper than the front. */}
        <polygon points={BACK_STRAP} fill={ribbon} />
        <polygon points={BACK_STRAP} fill="black" opacity={0.22} />
        <polygon points={BACK_STRIPE} fill={p.base} opacity={0.85} />
        <polygon points={FRONT_STRAP} fill={ribbon} />
        <polygon points={FRONT_STRIPE} fill={p.base} />

        {art ? (
          <IllustratedCoin
            id={id}
            p={p}
            src={art}
            figure={figure}
            unit={unit}
            onError={() => setFailed(art)}
          />
        ) : (
          <DrawnCoin id={id} p={p} sport={sport} figure={figure} unit={unit} />
        )}

        {/* The edition on a scroll across the foot of the medal, in the
            ribbon's colour. */}
        <polygon points={SCROLL} fill={ribbon} />
        <polygon points={SCROLL} fill="black" opacity={0.12} />
        <text
          x={CX}
          y={CY + 33.6}
          textAnchor="middle"
          fill="white"
          fontFamily={JAKARTA}
          fontWeight={800}
          fontSize={type.size}
          letterSpacing={type.spacing}
          {...(type.fit
            ? { textLength: type.fit, lengthAdjust: "spacingAndGlyphs" }
            : {})}
        >
          {edition.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}

/** The coin drawn in code: a milled metal rim, the face, an engraved
 *  ring, the light across its upper half, the sport's icon and the goal
 *  in the metal's own ink. */
function DrawnCoin({
  id,
  p,
  sport,
  figure,
  unit,
}: {
  id: string;
  p: Palette;
  sport: ChallengeSport;
  figure: string;
  unit: string;
}) {
  const { Icon } = SPORT_TAG[sport];
  return (
    <>
      <circle cx={CX} cy={CY} r={R} fill={`url(#md-rim-${id})`} />
      <circle
        cx={CX}
        cy={CY}
        r={46}
        fill="none"
        stroke={p.edge}
        strokeWidth={1.4}
        strokeDasharray="1.4 2.2"
        opacity={0.6}
      />
      <circle cx={CX} cy={CY} r={42} fill={`url(#md-face-${id})`} />
      <circle
        cx={CX}
        cy={CY}
        r={37}
        fill="none"
        stroke={p.edge}
        strokeOpacity={0.45}
        strokeWidth={0.9}
      />
      <path
        d={`M ${CX - 40} ${CY - 4} A 40 40 0 0 1 ${CX + 40} ${CY - 4} Q ${CX} ${CY - 16} ${CX - 40} ${CY - 4} Z`}
        fill={`url(#md-sheen-${id})`}
      />
      <Icon
        x={CX - 10}
        y={CY - 31}
        width={20}
        height={20}
        color={p.icon}
        strokeWidth={2.4}
      />
      <text
        x={CX}
        y={CY + 8}
        textAnchor="middle"
        fill={p.icon}
        fontFamily={ARCHIVO}
        fontWeight={800}
        fontSize={figureSize(figure)}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {figure}
      </text>
      {unit && (
        <text
          x={CX}
          y={CY + 19}
          textAnchor="middle"
          fill={p.icon}
          fillOpacity={0.85}
          fontFamily={JAKARTA}
          fontWeight={700}
          fontSize={8.5}
        >
          {unit}
        </text>
      )}
    </>
  );
}

/**
 * The coin as its illustration: a metal rim and black enamel drawn under
 * it, so the medal reads the same while the image loads, then the image,
 * with the goal struck over the plain lower face the art leaves for it
 * (docs/badges/MEDAL_ART_BRIEF.md), in the metal's light on the enamel.
 */
function IllustratedCoin({
  id,
  p,
  src,
  figure,
  unit,
  onError,
}: {
  id: string;
  p: Palette;
  src: string;
  figure: string;
  unit: string;
  onError: () => void;
}) {
  return (
    <>
      <circle cx={CX} cy={CY} r={R} fill={`url(#md-rim-${id})`} />
      <circle cx={CX} cy={CY} r={42} fill={`url(#md-enamel-${id})`} />
      <image
        href={src}
        x={CX - ART_BOX / 2}
        y={CY - ART_BOX / 2}
        width={ART_BOX}
        height={ART_BOX}
        preserveAspectRatio="xMidYMid meet"
        onError={onError}
      />
      <text
        x={CX}
        y={CY + 17}
        textAnchor="middle"
        fill={p.highlight}
        fontFamily={ARCHIVO}
        fontWeight={800}
        fontSize={Math.min(figureSize(figure), 14)}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {figure}
        {unit && (
          <tspan
            dx={2}
            fontFamily={JAKARTA}
            fontWeight={700}
            fontSize={7}
            fillOpacity={0.85}
          >
            {unit}
          </tspan>
        )}
      </text>
    </>
  );
}
