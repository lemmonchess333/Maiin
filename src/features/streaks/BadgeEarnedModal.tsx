import { useEffect, useRef, useState, useCallback, useId } from "react";
import { THEME } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
const lazyConfetti = () => import("canvas-confetti").then((m) => m.default);
import type { EarnedBadge } from "./badges";
import { BADGE_ART, BADGE_ICONS, SEAL_ART, TIER_COLORS } from "./badges";
import { BadgeHex } from "./BadgeHex";
import { TIER_PALETTES } from "./tierPalettes";
import { SealFace, SealShards, SealSweep, SealDust } from "./BadgeSeal";
import { SEAL_CRACKS } from "./sealGeometry";
import { Trophy, Lock } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface BadgeEarnedModalProps {
  badge: EarnedBadge | null;
  onDismiss: () => void;
}

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.frequency.value = 523; // C5
    osc2.frequency.value = 659; // E5
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.15);
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.8);
  } catch {
    // AudioContext may not be available
  }
}

// A short rising "tick" per crack — escalating pitch builds anticipation as the
// seal weakens. Separate from the C/E reveal chime so the break reads as impact.
function playCrack(step: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 320 + step * 90; // rises each tap
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // AudioContext may not be available
  }
}

// Seal geometry, material and shards live in BadgeSeal.tsx — the same
// drawing the lab page renders, so what the owner reviews is what ships.
const TAPS_NEEDED = 3;

export function BadgeEarnedContent({
  badge,
  onDismiss,
  inline = false,
}: {
  badge: EarnedBadge;
  onDismiss: () => void;
  inline?: boolean;
}) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(!inline);
  const sealBtnRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const [taps, setTaps] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const tier = TIER_COLORS[badge.tier];
  const sealId = `seal${useId().replace(/:/g, "")}`;
  const lockColor = TIER_PALETTES[badge.tier].icon;
  // The rendered seal carries its own wax medallion with the Tropos
  // chevron, so the HTML lock glyph is only for a tier without art.
  const sealArt: string | undefined = SEAL_ART[badge.tier];

  // Reduced motion collapses the ceremony to a single tap (no shake / shatter).
  const tapsNeeded = reduce ? 1 : TAPS_NEEDED;
  const stage = Math.min(taps, tapsNeeded);
  const glow = revealed ? 1 : stage / tapsNeeded; // 0..1 light building inside

  useEffect(() => {
    if (!inline) {
      haptic("light");
      sealBtnRef.current?.focus();
    }
  }, [inline]);

  const fireReveal = useCallback(() => {
    haptic("heavy");
    playChime();
    // Reduced motion: the ceremony is already collapsed to a single tap —
    // particle rain contradicts that intent, so the reveal is haptic +
    // chime + bloom only. (Previously still fired 60 particles.)
    if (reduce || inline) return;
    lazyConfetti().then((confetti) => {
      // Palette tells the badge's story: the earned tier + brand purples +
      // celebratory gold (tier token) — no off-palette green/amber.
      const colors = [tier, THEME.brand, THEME.brandLight, THEME.tier.gold];
      // Higher ticks + softer gravity = a slower, more graceful fall than
      // the old single hard pop.
      const defaults = { colors, ticks: 240, gravity: 0.85, decay: 0.92 };
      // Centre pop from the badge itself…
      confetti({
        ...defaults,
        particleCount: 110,
        spread: 100,
        startVelocity: 42,
        scalar: 1.05,
        origin: { y: 0.42 },
      });
      // …then two angled side volleys a beat apart (award-ceremony shape),
      // so the moment reads as a sequence rather than one flat burst.
      setTimeout(() => {
        confetti({
          ...defaults,
          particleCount: 40,
          angle: 60,
          spread: 55,
          startVelocity: 52,
          origin: { x: 0, y: 0.62 },
        });
      }, 160);
      setTimeout(() => {
        confetti({
          ...defaults,
          particleCount: 40,
          angle: 120,
          spread: 55,
          startVelocity: 52,
          origin: { x: 1, y: 0.62 },
        });
      }, 320);
    });
  }, [reduce, tier, inline]);

  // Each tap cracks the seal a little more; the last tap breaks it open and
  // blooms the badge. Idempotent once revealed (extra taps dismiss instead).
  const tapSeal = useCallback(() => {
    if (revealed) {
      onDismiss();
      return;
    }
    setTaps((prev) => {
      const next = prev + 1;
      if (next >= tapsNeeded) {
        setRevealed(true);
        fireReveal();
      } else {
        haptic(next === 1 ? "light" : "medium");
        playCrack(next);
      }
      return next;
    });
  }, [revealed, tapsNeeded, fireReveal, onDismiss]);

  const visibleCracks = revealed
    ? SEAL_CRACKS.length
    : Math.min(stage * 2, SEAL_CRACKS.length);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={
        inline
          ? "flex items-center justify-center"
          : "fixed inset-0 z-50 flex items-center justify-center px-6"
      }
      style={inline ? undefined : { background: "rgba(0,0,0,0.74)" }}
      // Pre-reveal: a backdrop tap counts as a seal tap (you can't accidentally
      // skip the moment). Post-reveal: a backdrop tap dismisses.
      onClick={revealed ? onDismiss : tapSeal}
    >
      <motion.div
        ref={focusTrapRef}
        role={inline ? "region" : "dialog"}
        aria-modal={inline ? undefined : true}
        aria-label={
          revealed
            ? `Badge earned: ${badge.name}`
            : `New ${badge.tier} badge — tap the seal to break it open`
        }
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        transition={{ type: "spring", damping: 16, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-3xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden"
        style={{
          background: "var(--glass-bg)",
          border: `1.5px solid ${tier}40`,
        }}
      >
        {/* Tier wash */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 32%, ${tier}, transparent 70%)`,
          }}
        />

        {/* Rotating light rays — bloom in on reveal, behind the badge. */}
        <AnimatePresence>
          {revealed && (
            <motion.div
              key="rays"
              aria-hidden="true"
              className="absolute left-1/2 top-[34%] pointer-events-none"
              style={{
                width: 340,
                height: 340,
                marginLeft: -170,
                marginTop: -170,
                background: `repeating-conic-gradient(from 0deg, ${tier}00 0deg, ${tier}26 7deg, ${tier}00 14deg)`,
                maskImage: "radial-gradient(circle, #000 0%, transparent 60%)",
                WebkitMaskImage:
                  "radial-gradient(circle, #000 0%, transparent 60%)",
              }}
              initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
              animate={{ opacity: 0.5, scale: 1, rotate: reduce ? 0 : 360 }}
              transition={{
                opacity: { duration: 0.4 },
                scale: { duration: 0.5 },
                rotate: { duration: 20, repeat: Infinity, ease: "linear" },
              }}
            />
          )}
        </AnimatePresence>

        {/* Badge stage — sealed → cracked → broken open. */}
        <div
          className="relative z-10 flex justify-center"
          style={{ minHeight: 150 }}
        >
          {/* The badge itself — sits behind the seal, dim until the break. */}
          <motion.div
            className="absolute"
            style={{ top: "50%", left: "50%", marginTop: -60, marginLeft: -60 }}
            initial={false}
            animate={
              revealed
                ? {
                    scale: reduce ? 1 : [0.6, 1.3, 1],
                    opacity: 1,
                    filter: "blur(0px)",
                  }
                : { scale: 0.86, opacity: 0.35, filter: "blur(2px)" }
            }
            transition={{
              duration: reduce ? 0.2 : 0.7,
              type: "spring",
              damping: 12,
            }}
          >
            <BadgeHex
              Icon={BADGE_ICONS[badge.lucideIcon] ?? Trophy}
              tier={badge.tier}
              earned
              size={120}
              imageSrc={BADGE_ART[badge.id]}
            />
            {/* One-shot white bloom flash on the break. */}
            {revealed && !reduce && (
              <motion.div
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{
                  inset: -34,
                  background:
                    "radial-gradient(circle, rgba(255,255,255,0.85), transparent 62%)",
                }}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.6] }}
                transition={{ duration: 0.55, ease: "easeOut" }}
              />
            )}
          </motion.div>

          {/* The seal — a frosted hexagon over the badge. Cracks accrue per tap,
              light builds behind the cracks, then it shatters into shards. */}
          {!revealed ? (
            <motion.button
              ref={sealBtnRef}
              type="button"
              onClick={tapSeal}
              aria-label={`Break the seal to reveal your new ${badge.tier} badge (tap ${stage} of ${tapsNeeded})`}
              className="relative rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              style={{ width: 132, height: 150 }}
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
                    inset: -10,
                    background: `radial-gradient(circle at 50% 48%, #fff 0%, ${tier} 40%, transparent 70%)`,
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
                  width={132}
                  height={150}
                  style={{ display: "block" }}
                >
                  <g transform="translate(0,8)">
                    <SealFace
                      tier={badge.tier}
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
                        top: 76,
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
                      style={{ top: 112 }}
                      aria-hidden="true"
                    >
                      {Array.from({ length: tapsNeeded }, (_, i) => (
                        <motion.span
                          key={i}
                          className="size-1.5 rounded-full"
                          style={{ background: tier }}
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
                  marginTop: -75,
                  marginLeft: -66,
                }}
              >
                <SealShards
                  tier={badge.tier}
                  idBase={sealId}
                  size={132}
                  imageSrc={sealArt}
                />
                <div className="absolute" style={{ left: 66, top: 66 }}>
                  <SealDust tier={badge.tier} />
                </div>
              </div>
            )
          )}
        </div>

        {/* Pre-reveal prompt — below the seal, full card width (it used to
            live inside the hexagon and overflow its edges). Keyed so the
            stage change gets a soft cross-fade. */}
        {!revealed && (
          <motion.p
            key={`prompt-${stage === 0 ? "start" : "more"}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="relative z-10 text-sm font-semibold"
            style={{ color: tier }}
          >
            {stage === 0 ? "Tap to break the seal" : "Keep tapping…"}
          </motion.p>
        )}

        {/* Copy — fades up only after the reveal so the moment leads. */}
        <AnimatePresence>
          {revealed && (
            <motion.div
              key="copy"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.3, duration: 0.3 }}
              className="relative z-10 space-y-1"
            >
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: tier }}
              >
                {badge.tier} badge
              </p>
              <p className="text-xl font-bold text-foreground">{badge.name}</p>
              <p className="text-sm text-muted-foreground">
                {badge.description}
              </p>
              {badge.id === "first_step" && (
                <p
                  className="text-sm font-semibold pt-2"
                  style={{ color: tier }}
                >
                  Come back tomorrow to build your streak.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dismiss appears only post-reveal — pre-reveal the action is "break". */}
        <AnimatePresence>
          {revealed && (
            <motion.button
              key="done"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : 0.45 }}
              onClick={onDismiss}
              className="relative z-10 w-full py-3 rounded-xl text-sm font-semibold transition-colors"
              style={{
                backgroundColor: `${tier}20`,
                color: tier,
                border: `1px solid ${tier}30`,
              }}
            >
              Nice
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export function BadgeEarnedModal({ badge, onDismiss }: BadgeEarnedModalProps) {
  return (
    <AnimatePresence>
      {badge && <BadgeEarnedContent badge={badge} onDismiss={onDismiss} />}
    </AnimatePresence>
  );
}
