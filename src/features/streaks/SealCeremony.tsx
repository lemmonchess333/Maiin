import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEAL_ART, TIER_COLORS } from "./badges";
import { TIER_PALETTES } from "./tierPalettes";
import { SealFace, SealShards, SealSweep, SealDust } from "./BadgeSeal";
import { SEAL_CRACKS } from "./sealGeometry";
import type { SealBreak } from "./useSealBreak";

/*
 * The seal ceremony's drawing, shared by a new badge (BadgeEarnedModal)
 * and a new medal (MedalReveal) so the two open the same way. The taps,
 * sounds and haptics are `useSealBreak`; the seal's material and shards
 * are BadgeSeal.tsx, the same drawing the lab page renders, so what the
 * owner reviews is what ships.
 *
 * The badge's seal is the unit: 132 by 150 px, every offset below scaled
 * from it, so a larger seal is the same object drawn bigger.
 */
const UNIT_W = 132;
const UNIT_H = 150;

/**
 * The stage a prize waits on: the prize behind the seal, the seal over it
 * (cracks accruing per tap, light building behind them), then the shatter
 * and the prize blooming out of it.
 */
export function SealStage({
  seal,
  prize,
  sealWidth = UNIT_W,
  prizeWidth = 120,
  prizeHeight = prizeWidth,
  prizeHidden = false,
  children,
}: {
  seal: SealBreak;
  /** What the seal holds, in its accessible name: "new gold medal". */
  prize: string;
  /** The seal's width in px; its height follows. */
  sealWidth?: number;
  /** The prize's box, which the stage centres and makes room for. */
  prizeWidth?: number;
  prizeHeight?: number;
  /** A prize larger than the seal would show round it while it waits, so
   *  it waits unseen rather than dim behind it. */
  prizeHidden?: boolean;
  /** The prize, drawn at `prizeWidth` by `prizeHeight`. */
  children: ReactNode;
}) {
  const { tier, reduce, taps, stage, tapsNeeded, revealed, tap, buttonRef } =
    seal;
  const color = TIER_COLORS[tier];
  const sealId = `seal${useId().replace(/:/g, "")}`;
  const lockColor = TIER_PALETTES[tier].icon;
  // The rendered seal carries its own wax medallion with the Tropos
  // chevron, so the HTML lock glyph is only for a tier without art.
  const sealArt: string | undefined = SEAL_ART[tier];
  const glow = revealed ? 1 : stage / tapsNeeded; // 0..1 light building inside
  const visibleCracks = revealed
    ? SEAL_CRACKS.length
    : Math.min(stage * 2, SEAL_CRACKS.length);

  const k = sealWidth / UNIT_W;
  const sealHeight = Math.round(UNIT_H * k);
  const at = (px: number) => Math.round(px * k);

  return (
    <div
      className="relative z-10 flex justify-center"
      style={{ minHeight: Math.max(sealHeight, prizeHeight) }}
    >
      {/* The prize itself — sits behind the seal, dim until the break.
          Its pop is the spring's own overshoot from 0.6: a spring takes
          two keyframes, first and last, so the 1.3 once written between
          them was never drawn in a build and threw in development. */}
      <motion.div
        className="absolute"
        style={{
          top: "50%",
          left: "50%",
          marginTop: -prizeHeight / 2,
          marginLeft: -prizeWidth / 2,
        }}
        initial={false}
        animate={
          revealed
            ? {
                scale: reduce ? 1 : [0.6, 1],
                opacity: 1,
              }
            : {
                // No blur: an animated filter stutters in WKWebView
                // (DESIGN_GUIDE §14h). The faint, smaller prize reads as
                // waiting behind the seal without it.
                scale: 0.86,
                opacity: prizeHidden ? 0 : 0.35,
              }
        }
        transition={{
          duration: reduce ? 0.2 : 0.7,
          type: "spring",
          damping: 12,
        }}
      >
        {children}
        {/* One-shot white bloom flash on the break. */}
        {revealed && !reduce && (
          <motion.div
            aria-hidden="true"
            className="absolute pointer-events-none"
            style={{
              inset: -Math.round((prizeWidth * 34) / 120),
              background:
                "radial-gradient(circle, rgba(255,255,255,0.85), transparent 62%)",
            }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.6] }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        )}
      </motion.div>

      {/* The seal — a frosted hexagon over the prize. Cracks accrue per tap,
          light builds behind the cracks, then it shatters into shards. */}
      {!revealed ? (
        <motion.button
          data-motion-driven
          ref={buttonRef}
          type="button"
          onClick={(e) => {
            // The surface round the seal counts a tap on itself too; this
            // one is the seal's, counted once.
            e.stopPropagation();
            tap();
          }}
          aria-label={`Break the seal to reveal your ${prize} (tap ${stage} of ${tapsNeeded})`}
          className="relative rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          style={{ width: sealWidth, height: sealHeight }}
          /* The tap had no press feedback at all — the single biggest
             "feels dead" factor. A firm compress makes each hit land. */
          whileTap={reduce ? undefined : { scale: 0.9 }}
          transition={{ type: "spring", stiffness: 500, damping: 24 }}
        >
          {/* Inner jolt wrapper — keyed on taps so it re-fires per crack,
              while the button stays mounted (keyboard focus kept). The
              jolt is now an impact: recoil-compress + shake + a touch of
              rotation, not just a horizontal wiggle. */}
          <motion.div
            key={`shake-${taps}`}
            className="absolute inset-0"
            animate={
              reduce
                ? undefined
                : {
                    x: [0, -6, 6, -3, 2, 0],
                    rotate: [0, -1.6, 1.4, -0.8, 0],
                    scale: [1, 0.965, 1.02, 1],
                  }
            }
            transition={{ duration: 0.34 }}
          >
            {/* Light leaking from inside, growing with each crack — and
                SPIKING on the tap itself (keyed flash → settle) so every
                hit visibly forces more light through the seal. */}
            <motion.div
              key={`glow-${taps}`}
              aria-hidden="true"
              className="absolute pointer-events-none"
              style={{
                inset: -at(10),
                /* The specular hot centre of the medal's glint,
                   blurred and aria-hidden. It is white because light
                   is white, not because a theme says so — the tier
                   colour beside it is the themed half. */
                // eslint-disable-next-line no-restricted-syntax
                background: `radial-gradient(circle at 50% 48%, #fff 0%, ${color} 40%, transparent 70%)`,
                filter: "blur(4px)",
              }}
              initial={false}
              animate={{
                opacity:
                  reduce || taps === 0
                    ? glow
                    : [Math.min(1, glow + 0.35), glow],
              }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
            <svg
              viewBox="0 0 100 114"
              width={sealWidth}
              height={sealHeight}
              style={{ display: "block" }}
            >
              <g transform="translate(0,8)">
                <SealFace
                  tier={tier}
                  idBase={sealId}
                  visibleCracks={visibleCracks}
                  imageSrc={sealArt}
                />
              </g>
            </svg>
            {/* A band of light crosses the seal on each hit (keyed on
                taps so it re-fires); nothing on the first paint. */}
            {!reduce && taps > 0 && (
              <SealSweep key={`sweep-${taps}`} boxUnitsTall={114} dy={8} />
            )}
            {/* Centre lock + tap-progress dots. The prompt TEXT moved
                OUT of the hexagon (device QA 2026-08-09): "Tap to break
                the seal" at its narrowest fit ran wider than the hex's
                mid-band and overflowed its slanted edges. The seal face
                keeps only what fits — lock + dots — and the words sit
                below the stage where they have the card's full width. */}
            <span
              className="absolute inset-0 pointer-events-none"
              style={{ color: lockColor }}
            >
              {/* On the medallion: the hexagon's centre is viewBox y=58
                  of 114 → 76px of the 150px box; the dots sit on the
                  face below it. */}
              {!sealArt && (
                <Lock
                  className="size-5 absolute"
                  style={{
                    left: "50%",
                    top: at(76),
                    marginLeft: -10,
                    marginTop: -10,
                    opacity: 0.92,
                  }}
                  strokeWidth={2.4}
                  aria-hidden="true"
                />
              )}
              {tapsNeeded > 1 && (
                <span
                  className="absolute left-0 right-0 flex items-center justify-center gap-1.5"
                  style={{ top: at(112) }}
                  aria-hidden="true"
                >
                  {Array.from({ length: tapsNeeded }, (_, i) => (
                    <motion.span
                      key={i}
                      className="size-1.5 rounded-full"
                      style={{ background: color }}
                      initial={false}
                      animate={{
                        opacity: i < stage ? 1 : 0.25,
                        scale: i === stage - 1 ? [1.6, 1] : 1,
                      }}
                      transition={{ duration: 0.3 }}
                    />
                  ))}
                </span>
              )}
            </span>
          </motion.div>
        </motion.button>
      ) : (
        // Shatter: the six shards fly outward + fade once on the break.
        !reduce && (
          <div
            aria-hidden="true"
            className="absolute pointer-events-none"
            style={{
              top: "50%",
              left: "50%",
              marginTop: -sealHeight / 2,
              marginLeft: -sealWidth / 2,
            }}
          >
            <SealShards
              tier={tier}
              idBase={sealId}
              size={sealWidth}
              imageSrc={sealArt}
            />
            <div
              className="absolute"
              style={{ left: sealWidth / 2, top: sealWidth / 2 }}
            >
              <SealDust tier={tier} />
            </div>
          </div>
        )
      )}
    </div>
  );
}

/**
 * The words under the seal until it breaks — below the stage, at the
 * surface's full width (they used to live inside the hexagon and overflow
 * its edges). Keyed so the stage change gets a soft cross-fade.
 */
export function SealPrompt({
  seal,
  className,
}: {
  seal: SealBreak;
  className?: string;
}) {
  if (seal.revealed) return null;
  return (
    <motion.p
      key={`prompt-${seal.stage === 0 ? "start" : "more"}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={cn("relative z-10 text-sm font-semibold", className)}
      style={{ color: TIER_COLORS[seal.tier] }}
    >
      {seal.stage === 0 ? "Tap to break the seal" : "Keep tapping…"}
    </motion.p>
  );
}
