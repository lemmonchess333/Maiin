import { useEffect, useRef, useState, useCallback } from "react";
import { THEME } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
const lazyConfetti = () => import("canvas-confetti").then((m) => m.default);
import type { EarnedBadge } from "./badges";
import { BADGE_ART, BADGE_ICONS, TIER_COLORS } from "./badges";
import { BadgeHex } from "./BadgeHex";
import { Sparkles, Trophy } from "lucide-react";
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

function BadgeEarnedContent({
  badge,
  onDismiss,
}: {
  badge: EarnedBadge;
  onDismiss: () => void;
}) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>();
  const revealBtnRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const tier = TIER_COLORS[badge.tier];

  // Land with a soft anticipatory tick + focus the reveal control so the
  // gesture is discoverable by keyboard too (Enter/Space fires the reveal).
  useEffect(() => {
    haptic("light");
    revealBtnRef.current?.focus();
  }, []);

  // THE moment. Tap (or Enter/Space, or backdrop pre-reveal) blooms the badge:
  // heavy haptic + chime + particle burst, while the rays + flash animate in.
  const reveal = useCallback(() => {
    setRevealed((already) => {
      if (already) return already;
      haptic("heavy");
      playChime();
      lazyConfetti().then((confetti) =>
        confetti({
          particleCount: reduce ? 60 : 150,
          spread: 95,
          startVelocity: 45,
          origin: { y: 0.42 },
          colors: [tier, THEME.brand, "#fbbf24", "#34d399"],
          scalar: 1.1,
        })
      );
      return true;
    });
  }, [reduce, tier]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.74)" }}
      // Pre-reveal: a backdrop tap REVEALS (you can't accidentally skip the
      // moment). Post-reveal: a backdrop tap dismisses.
      onClick={revealed ? onDismiss : reveal}
    >
      <motion.div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          revealed
            ? `Badge earned: ${badge.name}`
            : `New ${badge.tier} badge — tap to reveal`
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
              animate={{
                opacity: 0.5,
                scale: 1,
                rotate: reduce ? 0 : 360,
              }}
              transition={{
                opacity: { duration: 0.4 },
                scale: { duration: 0.5 },
                rotate: { duration: 20, repeat: Infinity, ease: "linear" },
              }}
            />
          )}
        </AnimatePresence>

        {/* Badge stage — shrouded → revealed. */}
        <div
          className="relative z-10 flex justify-center"
          style={{ minHeight: 140 }}
        >
          {!revealed ? (
            <button
              ref={revealBtnRef}
              type="button"
              onClick={reveal}
              aria-label={`Reveal your new ${badge.tier} badge`}
              className="relative flex flex-col items-center justify-center rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              style={{ minHeight: 140, width: "100%" }}
            >
              {/* Pulsing shroud: the badge sits dimmed + blurred behind a glow. */}
              <motion.div
                animate={
                  reduce
                    ? undefined
                    : { scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }
                }
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ filter: "blur(6px) saturate(0.6)", opacity: 0.55 }}
              >
                <BadgeHex
                  Icon={BADGE_ICONS[badge.lucideIcon] ?? Trophy}
                  tier={badge.tier}
                  earned={true}
                  size={120}
                  imageSrc={BADGE_ART[badge.id]}
                />
              </motion.div>
              <span
                className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 text-sm font-semibold"
                style={{ color: tier }}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                Tap to reveal
              </span>
            </button>
          ) : (
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{
                scale: reduce ? 1 : [0.4, 1.35, 1],
                opacity: 1,
                rotate: reduce ? 0 : [0, 12, -10, 0],
              }}
              transition={{ duration: reduce ? 0.2 : 0.75, type: "spring" }}
              className="relative"
            >
              {/* One-shot bloom flash over the badge on reveal. */}
              {!reduce && (
                <motion.div
                  aria-hidden="true"
                  className="absolute pointer-events-none"
                  style={{
                    inset: -30,
                    background:
                      "radial-gradient(circle, rgba(255,255,255,0.75), transparent 62%)",
                  }}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: [0, 0.85, 0], scale: [0.4, 1.5] }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              )}
              <BadgeHex
                Icon={BADGE_ICONS[badge.lucideIcon] ?? Trophy}
                tier={badge.tier}
                earned={true}
                size={120}
                imageSrc={BADGE_ART[badge.id]}
              />
            </motion.div>
          )}
        </div>

        {/* Copy — fades up only after the reveal so the moment leads. */}
        <AnimatePresence>
          {revealed && (
            <motion.div
              key="copy"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.2, duration: 0.3 }}
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
              {/* Forward streak hook (#974): the First Step moment celebrates,
                  but the D1→D2 lever is telling the user WHY to return. Only on
                  the first-activity badge; calm-brand, encouraging (not guilt). */}
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

        {/* Dismiss appears only post-reveal — pre-reveal the action is "reveal". */}
        <AnimatePresence>
          {revealed && (
            <motion.button
              key="done"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : 0.35 }}
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
