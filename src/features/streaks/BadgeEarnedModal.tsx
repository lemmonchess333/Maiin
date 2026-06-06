import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
const lazyConfetti = () => import("canvas-confetti").then((m) => m.default);
import type { EarnedBadge } from "./badges";
import { BADGE_ICONS, TIER_COLORS } from "./badges";
import { BadgeHex } from "./BadgeHex";
import { Trophy } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

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
  const autoDismissRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const focusTrapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const tierColor = TIER_COLORS[badge.tier];
    lazyConfetti().then((confetti) =>
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.4 },
        colors: [tierColor, "#7B72E9", "#fbbf24", "#34d399"],
      })
    );
    playChime();

    autoDismissRef.current = setTimeout(onDismiss, 3500);
    return () => clearTimeout(autoDismissRef.current);
  }, [badge, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onDismiss}
    >
      <motion.div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Badge earned: ${badge.name}`}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        transition={{ type: "spring", damping: 15, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-3xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden"
        style={{
          background: "var(--glass-bg)",
          border: `1.5px solid ${TIER_COLORS[badge.tier]}40`,
        }}
      >
        {/* Tier glow */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 30%, ${TIER_COLORS[badge.tier]}, transparent 70%)`,
          }}
        />

        {/* Auto-dismiss progress bar */}
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: 3.5, ease: "linear" }}
          className="absolute top-0 left-0 right-0 h-0.5 origin-left"
          style={{ backgroundColor: TIER_COLORS[badge.tier] }}
        />

        <motion.div
          animate={{ scale: [0.5, 1.4, 1], rotate: [0, 15, -15, 0] }}
          transition={{ duration: 0.7, type: "spring" }}
          className="relative z-10 flex justify-center"
        >
          <BadgeHex
            Icon={BADGE_ICONS[badge.lucideIcon] ?? Trophy}
            tier={badge.tier}
            earned={true}
            size={120}
          />
        </motion.div>

        <div className="relative z-10">
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-1"
            style={{ color: TIER_COLORS[badge.tier] }}
          >
            {badge.tier} badge
          </p>
          <p className="text-xl font-bold text-white">{badge.name}</p>
          <p className="text-sm text-white/60 mt-1">{badge.description}</p>
          {/* Forward streak hook (#974): the First Step moment celebrates,
              but the D1→D2 lever is telling the user WHY to return. Only on
              the first-activity badge; calm-brand, encouraging (not guilt) —
              aligns with the streak-forgiveness model. Reuses this modal, so
              no second celebration surface mounts. */}
          {badge.id === "first_step" && (
            <p
              className="text-sm font-semibold mt-3"
              style={{ color: TIER_COLORS[badge.tier] }}
            >
              Come back tomorrow to build your streak.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="relative z-10 w-full py-3 rounded-xl text-sm font-semibold transition-colors"
          style={{
            backgroundColor: `${TIER_COLORS[badge.tier]}20`,
            color: TIER_COLORS[badge.tier],
            border: `1px solid ${TIER_COLORS[badge.tier]}30`,
          }}
        >
          Done
        </button>
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
