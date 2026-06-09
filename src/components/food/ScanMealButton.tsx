import { motion } from "framer-motion";
import { Camera, Lock } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ScanMealButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  /** Quota-exhausted upsell state. Renders a confident scan-coral "unlock"
   *  CTA — a filled coral lock badge + value-led label on a coral-tinted
   *  surface — that opens the paywall on tap. Distinct from the active
   *  gradient+glow hero (no glow, lock not camera), but not faded: it's a
   *  conversion CTA, so it keeps real presence. */
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
        // Active = full scan gradient + glow. Locked = coral-tinted surface with
        // a defined border + readable coral text (no glow — that read as a
        // glitch on a disabled fill; white-on-bright-coral also fails contrast,
        // so coral-on-tint is the legible + good-looking choice).
        locked ? "border" : "text-white shadow-[var(--shadow-scan)]"
      )}
      style={
        locked
          ? {
              // scan colour at ~15% bg / ~33% border via hex-alpha on the THEME
              // token — confident coral presence, not the washed-out 8% tint.
              background: `${THEME.food.scan}26`,
              borderColor: `${THEME.food.scan}55`,
              color: THEME.food.scan,
            }
          : {
              background: `linear-gradient(180deg, ${GRADIENT_TOP} 0%, ${GRADIENT_BOTTOM} 100%)`,
            }
      }
    >
      {locked ? (
        <>
          {/* filled coral lock badge — a premium accent, echoes the active
              button's icon weight without the loud full-width glow */}
          <span
            className="inline-flex size-7 items-center justify-center rounded-lg shrink-0"
            style={{ background: THEME.food.scan }}
          >
            <Lock size={15} strokeWidth={2.5} className="text-white" />
          </span>
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
