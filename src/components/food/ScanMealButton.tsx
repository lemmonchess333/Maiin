import { motion } from "framer-motion";
import { Camera, Lock } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ScanMealButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  /** Quota-exhausted upsell state. Instead of a dead grey disable (with the
   *  scan glow contradictorily left on), this renders a calm scan-tinted
   *  "locked" treatment — readable coral text + a lock — that still opens the
   *  paywall on tap. The action isn't disabled; it's a "tap to unlock". */
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
        ariaLabel ?? (locked ? "Unlock meal scanning" : "Scan your meal")
      }
      className={cn(
        "relative w-full h-[60px] rounded-2xl flex items-center justify-center gap-[10px] font-semibold text-base",
        // Active = full scan gradient + the scan glow. Locked = calm tinted
        // surface, no glow (the glow on a disabled fill read as a glitch).
        locked ? "border" : "text-white shadow-[var(--shadow-scan)]"
      )}
      style={
        locked
          ? {
              // scan colour at ~8% / 20% via hex-alpha on the THEME token —
              // a coral-tinted "locked" pill, readable coral text + icon.
              background: `${THEME.food.scan}14`,
              borderColor: `${THEME.food.scan}33`,
              color: THEME.food.scan,
            }
          : {
              background: `linear-gradient(180deg, ${GRADIENT_TOP} 0%, ${GRADIENT_BOTTOM} 100%)`,
            }
      }
    >
      {locked ? (
        <Lock size={20} strokeWidth={2} />
      ) : (
        <Camera size={22} strokeWidth={2} />
      )}
      <span>{locked ? "Unlock meal scanning" : "Scan your meal"}</span>
    </motion.button>
  );
}
