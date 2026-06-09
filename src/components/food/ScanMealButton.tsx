import { motion } from "framer-motion";
import { Camera, Lock } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ScanMealButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  /** Quota-exhausted state. Reads as an upgrade-GATED action, not a second
   *  primary CTA: a soft coral-tinted surface + hairline border + a plain
   *  (un-badged) coral lock + value-led label that opens the paywall on
   *  tap. Deliberately lower-presence than the active gradient+glow hero so
   *  the locked scan doesn't compete with the Food logging flow (composer,
   *  quick-add, meal pills). Coral is retained as the scan affordance's
   *  identity — only the *weight* is dialled down, not the colour. */
  locked?: boolean;
}

// Gradient stops read from THEME.food.scan (+ its paired light variant,
// which is the same hue at +8% lightness). Swapping the token propagates here.
const GRADIENT_TOP = THEME.food.scanLight;
const GRADIENT_BOTTOM = THEME.food.scan;

export default function ScanMealButton({
  onClick,
  ariaLabel,
  locked = false,
}: ScanMealButtonProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      aria-label={
        ariaLabel ?? (locked ? "Unlock unlimited scans" : "Scan your meal")
      }
      className={cn(
        "relative w-full h-[60px] rounded-2xl flex items-center justify-center gap-3 font-semibold text-base",
        // Active = full scan gradient + glow (the deliberate scan signature).
        // Locked = soft coral-tinted surface + hairline border + coral text.
        // No glow, no filled badge — the locked state reads as gated, not as
        // a second primary CTA. Coral-on-tint stays legible (white-on-bright-
        // coral fails contrast, so coral text is also the correct choice).
        locked ? "border" : "text-white shadow-[var(--shadow-scan)]"
      )}
      style={
        locked
          ? {
              // scan colour at ~10% bg / ~18% border via hex-alpha on the
              // THEME token. Lighter than the prior 15%/33% "conversion CTA"
              // weight so the locked state recedes to gated/unavailable —
              // present and tappable, but not loud. (Not the washed-out 8%
              // either; a clean coral lock + value copy keeps it intentional.)
              background: `${THEME.food.scan}1A`,
              borderColor: `${THEME.food.scan}2E`,
              color: THEME.food.scan,
            }
          : {
              background: `linear-gradient(180deg, ${GRADIENT_TOP} 0%, ${GRADIENT_BOTTOM} 100%)`,
            }
      }
    >
      {locked ? (
        <>
          {/* Plain coral lock (inherits the button's coral `color`) — no
              filled badge. The badge was the element that made the locked
              state read as a primary CTA; a bare lock reads as "gated". */}
          <Lock size={18} strokeWidth={2.25} className="shrink-0" />
          <span>Unlock unlimited scans</span>
        </>
      ) : (
        <>
          <Camera size={22} strokeWidth={2} />
          <span>Scan your meal</span>
        </>
      )}
    </motion.button>
  );
}
