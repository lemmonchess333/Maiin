import { useEffect, useRef, useState, useCallback } from "react";
import { THEME } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
const lazyConfetti = () => import("canvas-confetti").then((m) => m.default);
import type { EarnedBadge } from "./badges";
import { BADGE_ART, BADGE_ICONS, TIER_COLORS } from "./badges";
import { BadgeHex } from "./BadgeHex";
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

// ── Seal geometry (pointy-top hexagon matching the badge silhouette) ────────
const HEX = "50,3 93,28 93,72 50,97 7,72 7,28";
const V = [
  [50, 3],
  [93, 28],
  [93, 72],
  [50, 97],
  [7, 72],
  [7, 28],
] as const;
// Six triangular shards (centre → each edge) + the px direction each flies on
// the break. Directions are the outward normal of each shard's outer edge.
const SHARDS = V.map((v, i) => {
  const next = V[(i + 1) % V.length];
  const points = `50,50 ${v[0]},${v[1]} ${next[0]},${next[1]}`;
  const mx = (v[0] + next[0]) / 2 - 50;
  const my = (v[1] + next[1]) / 2 - 50;
  const len = Math.hypot(mx, my) || 1;
  return {
    points,
    dx: (mx / len) * 86,
    dy: (my / len) * 86,
    spin: (i % 2 ? 1 : -1) * (24 + i * 6),
  };
});
// Jagged crack lines from the centre outward — revealed two-per-tap.
const CRACKS = [
  "M50,50 L57,38 L53,29 L60,17 L57,5",
  "M50,50 L66,53 L78,47 L93,51",
  "M50,50 L55,65 L51,77 L58,95",
  "M50,50 L39,61 L29,58 L13,67",
  "M50,50 L43,41 L30,43 L16,33",
  "M50,50 L49,35 L40,27 L43,12",
];
const TAPS_NEEDED = 3;

function BadgeEarnedContent({
  badge,
  onDismiss,
}: {
  badge: EarnedBadge;
  onDismiss: () => void;
}) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
  const sealBtnRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const [taps, setTaps] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const tier = TIER_COLORS[badge.tier];

  // Reduced motion collapses the ceremony to a single tap (no shake / shatter).
  const tapsNeeded = reduce ? 1 : TAPS_NEEDED;
  const stage = Math.min(taps, tapsNeeded);
  const glow = revealed ? 1 : stage / tapsNeeded; // 0..1 light building inside

  useEffect(() => {
    haptic("light");
    sealBtnRef.current?.focus();
  }, []);

  const fireReveal = useCallback(() => {
    haptic("heavy");
    playChime();
    // Reduced motion: the ceremony is already collapsed to a single tap —
    // particle rain contradicts that intent, so the reveal is haptic +
    // chime + bloom only. (Previously still fired 60 particles.)
    if (reduce) return;
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
  }, [reduce, tier]);

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
    ? CRACKS.length
    : Math.min(stage * 2, CRACKS.length);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.74)" }}
      // Pre-reveal: a backdrop tap counts as a seal tap (you can't accidentally
      // skip the moment). Post-reveal: a backdrop tap dismisses.
      onClick={revealed ? onDismiss : tapSeal}
    >
      <motion.div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
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
            <button
              ref={sealBtnRef}
              type="button"
              onClick={tapSeal}
              aria-label={`Break the seal to reveal your new ${badge.tier} badge (tap ${stage} of ${tapsNeeded})`}
              className="relative rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              style={{ width: 132, height: 150 }}
            >
              {/* Inner shake wrapper — keyed on taps so the jolt re-fires per
                  crack, while the button stays mounted (keyboard focus kept). */}
              <motion.div
                key={`shake-${taps}`}
                className="absolute inset-0"
                animate={reduce ? undefined : { x: [0, -5, 5, -3, 2, 0] }}
                transition={{ duration: 0.32 }}
              >
                {/* Light leaking from inside, growing with each crack. */}
                <div
                  aria-hidden="true"
                  className="absolute pointer-events-none"
                  style={{
                    inset: -10,
                    opacity: glow,
                    background: `radial-gradient(circle at 50% 48%, #fff 0%, ${tier} 40%, transparent 70%)`,
                    filter: "blur(4px)",
                    transition: "opacity 0.25s ease",
                  }}
                />
                <svg
                  viewBox="0 0 100 114"
                  width={132}
                  height={150}
                  style={{ display: "block" }}
                >
                  <defs>
                    <radialGradient id="seal-face" cx="38%" cy="30%" r="80%">
                      <stop offset="0%" stopColor="#4a4a55" />
                      <stop offset="55%" stopColor="#2b2b33" />
                      <stop offset="100%" stopColor="#17171c" />
                    </radialGradient>
                  </defs>
                  <g transform="translate(0,8)">
                    {/* Frosted metallic seal face + tier-tinted rim. */}
                    <polygon
                      points={HEX}
                      fill="url(#seal-face)"
                      stroke={tier}
                      strokeWidth={2.5}
                      strokeOpacity={0.55}
                    />
                    <polygon points={HEX} fill={tier} opacity={0.12} />
                    {/* Specular sheen across the top. */}
                    <polygon
                      points="50,3 93,28 93,46 50,30 7,46 7,28"
                      fill="#ffffff"
                      opacity={0.07}
                    />
                    {/* Cracks — drawn progressively as the seal weakens. */}
                    {CRACKS.slice(0, visibleCracks).map((d, i) => (
                      <motion.path
                        key={i}
                        d={d}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={1.4}
                        strokeLinecap="round"
                        strokeOpacity={0.85}
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.25 }}
                      />
                    ))}
                  </g>
                </svg>
                {/* Centre lock + prompt. */}
                <span
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 font-semibold pointer-events-none"
                  style={{ color: "#fff" }}
                >
                  <Lock
                    className="size-6"
                    style={{ opacity: 0.9 }}
                    aria-hidden="true"
                  />
                  <span className="text-xs" style={{ color: tier }}>
                    {stage === 0 ? "Tap to break the seal" : "Keep tapping…"}
                  </span>
                </span>
              </motion.div>
            </button>
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
                {SHARDS.map((s, i) => (
                  <motion.svg
                    key={i}
                    viewBox="0 0 100 100"
                    width={132}
                    height={132}
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
                    <polygon
                      points={s.points}
                      fill="#2b2b33"
                      stroke={tier}
                      strokeWidth={1.5}
                      strokeOpacity={0.5}
                    />
                  </motion.svg>
                ))}
              </div>
            )
          )}
        </div>

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
              <p className="text-xl font-bold text-white">{badge.name}</p>
              <p className="text-sm text-white/60">{badge.description}</p>
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
