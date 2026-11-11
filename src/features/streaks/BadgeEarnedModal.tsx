import { motion, AnimatePresence } from "framer-motion";
import type { EarnedBadge } from "./badges";
import {
  BADGE_ART,
  BADGE_ICONS,
  TIER_COLORS,
  badgeDescription,
} from "./badges";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { BadgeHex } from "./BadgeHex";
import { SealPrompt, SealStage } from "./SealCeremony";
import { useSealBreak } from "./useSealBreak";
import { Trophy } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface BadgeEarnedModalProps {
  badge: EarnedBadge | null;
  onDismiss: () => void;
}

// The ceremony itself — the seal, its taps, sounds, haptics and confetti —
// is shared with the medal reveal: SealCeremony.tsx draws it and
// useSealBreak.ts runs it. This file is the badge's card around it.

/* The ray fan's mask. `#000` is a MASK stop, not a colour: in a
   mask-image gradient the channel is alpha geometry and never renders, so
   no theme token would mean anything here — this IS the named home for
   the value, which is what the hex rule asks for. Naming it also beats
   two inline `eslint-disable-next-line`s, which bind to whichever line
   prettier happens to wrap the value onto: one of them silently became a
   wrong-line disable the moment the property wrapped. */
const RAY_MASK = "radial-gradient(circle, #000 0%, transparent 60%)";

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
  const liftUnit = useLiftUnit();
  const seal = useSealBreak({
    tier: badge.tier,
    opening: !inline,
    confetti: !inline,
    onDismiss,
  });
  const { reduce, revealed, tap: tapSeal } = seal;
  const tier = TIER_COLORS[badge.tier];

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
                maskImage: RAY_MASK,
                WebkitMaskImage: RAY_MASK,
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
        <SealStage seal={seal} prize={`new ${badge.tier} badge`}>
          <BadgeHex
            Icon={BADGE_ICONS[badge.lucideIcon] ?? Trophy}
            tier={badge.tier}
            earned
            size={120}
            imageSrc={BADGE_ART[badge.id]}
          />
        </SealStage>

        {/* The prompt sits over the words and Done, which are laid out
            from the start, as MedalReveal's are: mounting them at the
            break grew the centred card by ~120 px, so the seal, its shards
            and rays jumped ~60 px in the moment it shattered. Hidden from
            sight, reach and the accessibility tree until the break, and
            Done is disabled, so the focus trap counts only the seal. */}
        <div className="relative w-full space-y-4">
          <SealPrompt seal={seal} className="absolute inset-x-0 top-0" />
          <motion.div
            className="relative z-10 space-y-1"
            style={{ visibility: revealed ? "visible" : "hidden" }}
            aria-hidden={!revealed}
            initial={{ opacity: 0 }}
            animate={{ opacity: revealed ? 1 : 0 }}
            transition={{ delay: reduce ? 0 : 0.3, duration: 0.3 }}
          >
            <p className="text-xs font-semibold" style={{ color: tier }}>
              {badge.tier.charAt(0).toUpperCase() + badge.tier.slice(1)} badge
            </p>
            <p className="text-xl font-bold text-foreground">{badge.name}</p>
            <p className="text-sm text-muted-foreground">
              {badgeDescription(badge, liftUnit)}
            </p>
            {badge.id === "first_step" && (
              <p className="text-sm font-semibold pt-2" style={{ color: tier }}>
                Come back tomorrow to build your streak.
              </p>
            )}
          </motion.div>

          <motion.button
            data-motion-driven
            type="button"
            disabled={!revealed}
            style={{
              visibility: revealed ? "visible" : "hidden",
              backgroundColor: `${tier}20`,
              color: tier,
              border: `1px solid ${tier}30`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: revealed ? 1 : 0 }}
            transition={{ delay: reduce ? 0 : 0.45 }}
            onClick={onDismiss}
            className="relative z-10 w-full py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            Nice
          </motion.button>
        </div>
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
