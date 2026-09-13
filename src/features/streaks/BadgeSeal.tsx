import { motion } from "framer-motion";
import type { BadgeTier } from "./badges";
import { TIER_PALETTES } from "./tierPalettes";
import {
  SEAL_HEX,
  SEAL_SHARDS,
  SEAL_CRACKS,
  SEAL_MEDALLION_R,
  FACE,
  BEVEL,
  SHEEN,
  FACETS,
  pts,
} from "./sealGeometry";

/**
 * The seal — the sealed hexagon a new badge arrives inside, tapped open in
 * BadgeEarnedModal. One material, drawn once here and reused by the shards
 * it breaks into, so the break reads as THIS object coming apart rather
 * than a grey plate being swapped for six grey triangles.
 *
 * Anatomy (bottom → top), all in the 100×100 hexagon space:
 *   1. A bevelled rim in the badge's tier metal — a light-to-dark metal
 *      gradient on the outer hexagon with a dark bevel ring inside it.
 *   2. An obsidian face: deep radial gradient, cut into six facets whose
 *      alternating tints give it the read of a dark cut stone, and a hair
 *      of tier light along its inner edge.
 *   3. A wax-seal medallion in the centre, the tier metal again, glossy —
 *      the thing the lock sits on and the thing the taps are breaking.
 *   4. Cracks, drawn progressively: each is a wide blurred stroke of the
 *      tier's highlight (light leaking through) under a thin white line.
 *
 * WKWebView-safe: the blur is a STATIC filter on the leak stroke; what
 * animates is pathLength and opacity, never the filter.
 *
 * Nano Banana art for the seal is a possible later step (the prompt is in
 * docs/badges/ART_BRIEF.md); until an asset exists this SVG is the seal.
 */

function SealDefs({ idBase, tier }: { idBase: string; tier: BadgeTier }) {
  const p = TIER_PALETTES[tier];
  return (
    <defs>
      <linearGradient id={`${idBase}-rim`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={p.highlight} />
        <stop offset="48%" stopColor={p.base} />
        <stop offset="100%" stopColor={p.edge} />
      </linearGradient>
      <radialGradient id={`${idBase}-face`} cx="38%" cy="28%" r="82%">
        <stop offset="0%" stopColor="#474754" />
        <stop offset="55%" stopColor="#24242c" />
        <stop offset="100%" stopColor="#0d0d11" />
      </radialGradient>
      <radialGradient id={`${idBase}-wax`} cx="36%" cy="30%" r="76%">
        <stop offset="0%" stopColor={p.highlight} />
        <stop offset="52%" stopColor={p.base} />
        <stop offset="100%" stopColor={p.edge} />
      </radialGradient>
      <filter
        id={`${idBase}-leak`}
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
      >
        <feGaussianBlur stdDeviation="1.4" />
      </filter>
    </defs>
  );
}

interface SealFaceProps {
  tier: BadgeTier;
  /** Unique per instance — gradient ids are document-global. */
  idBase: string;
  /** How many of the six cracks are showing. */
  visibleCracks: number;
}

/** The intact seal. Render inside an `<svg>` whose user space is the
 *  100×100 hexagon box (a `<g transform>` around it is fine). */
export function SealFace({ tier, idBase, visibleCracks }: SealFaceProps) {
  const p = TIER_PALETTES[tier];
  return (
    <>
      <SealDefs idBase={idBase} tier={tier} />
      {/* 1. Tier-metal rim, bevelled by the dark ring inside it. */}
      <polygon points={SEAL_HEX} fill={`url(#${idBase}-rim)`} />
      <polygon points={pts(BEVEL)} fill={p.edge} opacity={0.92} />
      {/* 2. The obsidian face, cut into facets. */}
      <polygon points={pts(FACE)} fill={`url(#${idBase}-face)`} />
      {/* The bevel catches the key light along its top-left edges and
          falls into shadow along the bottom-right — what makes the rim
          read as a raised frame rather than a flat border. */}
      <polyline
        points={pts([FACE[4], FACE[5], FACE[0], FACE[1]])}
        fill="none"
        stroke={p.highlight}
        strokeOpacity={0.55}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      <polyline
        points={pts([FACE[1], FACE[2], FACE[3], FACE[4]])}
        fill="none"
        stroke="#000000"
        strokeOpacity={0.45}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      {FACETS.map((f, i) => (
        <polygon key={i} points={f.points} fill="#ffffff" opacity={f.tint} />
      ))}
      <polygon
        points={pts(FACE)}
        fill="none"
        stroke={p.base}
        strokeOpacity={0.35}
        strokeWidth={0.8}
      />
      <polygon points={SHEEN} fill="#ffffff" opacity={0.07} />
      {/* 3. The wax-seal medallion. */}
      <circle
        cx={50}
        cy={50}
        r={SEAL_MEDALLION_R + 1.6}
        fill={p.edge}
        opacity={0.9}
      />
      <circle
        cx={50}
        cy={50}
        r={SEAL_MEDALLION_R}
        fill={`url(#${idBase}-wax)`}
      />
      {/* Stamped ring: a shadow line with a lit line just above it, so the
          centre reads as pressed into wax, not a ball. The lock sits in it. */}
      <circle
        cx={50}
        cy={50.6}
        r={SEAL_MEDALLION_R - 4}
        fill="none"
        stroke={p.edge}
        strokeOpacity={0.55}
        strokeWidth={1}
      />
      <circle
        cx={50}
        cy={49.6}
        r={SEAL_MEDALLION_R - 4}
        fill="none"
        stroke={p.highlight}
        strokeOpacity={0.45}
        strokeWidth={0.7}
      />
      <circle
        cx={50}
        cy={50}
        r={SEAL_MEDALLION_R - 4.6}
        fill={p.edge}
        opacity={0.28}
      />
      <ellipse
        cx={44.5}
        cy={42.5}
        rx={6}
        ry={3.2}
        fill="#ffffff"
        opacity={0.26}
        transform="rotate(-28 44.5 42.5)"
      />
      {/* 4. Cracks — light leaks through the tier's highlight, then the
          break line itself. */}
      {SEAL_CRACKS.slice(0, visibleCracks).map((d, i) => (
        <g key={i} data-seal-crack="">
          <motion.path
            d={d}
            fill="none"
            stroke={p.highlight}
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeOpacity={0.6}
            filter={`url(#${idBase}-leak)`}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
          />
          <motion.path
            d={d}
            fill="none"
            stroke="#ffffff"
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeOpacity={0.9}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
          />
        </g>
      ))}
    </>
  );
}

interface SealShardsProps {
  tier: BadgeTier;
  idBase: string;
  /** Rendered size of the 100-unit hexagon box, in px. */
  size: number;
}

/** The six pieces, flying outward once. Each carries the seal's own
 *  material — face gradient inside, the metal rim along its outer edge. */
export function SealShards({ tier, idBase, size }: SealShardsProps) {
  const p = TIER_PALETTES[tier];
  return (
    <>
      {SEAL_SHARDS.map((s, i) => {
        const id = `${idBase}-s${i}`;
        return (
          <motion.svg
            key={i}
            viewBox="0 0 100 100"
            width={size}
            height={size}
            className="absolute"
            style={{ top: 0, left: 0 }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{
              x: s.dx,
              y: s.dy,
              opacity: 0,
              rotate: s.spin,
              scale: 0.7,
            }}
            transition={{
              duration: 0.6,
              ease: [0.2, 0.8, 0.3, 1],
              delay: i * 0.015,
            }}
          >
            <SealDefs idBase={id} tier={tier} />
            <polygon points={s.points} fill={`url(#${id}-face)`} />
            <polygon points={s.rim} fill={`url(#${id}-rim)`} />
            <polygon
              points={s.points}
              fill="none"
              stroke={p.base}
              strokeOpacity={0.45}
              strokeWidth={0.8}
            />
          </motion.svg>
        );
      })}
    </>
  );
}
