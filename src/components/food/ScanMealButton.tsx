import { motion } from "framer-motion";
import { Camera } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { THEME } from "@/lib/theme";

interface ScanMealButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  /** Optional style override — used by quota-gated state to swap the coral gradient for a grey fill. */
  styleOverride?: CSSProperties;
  /** Optional status icon (e.g. lock when out of quota). Rendered in the top-right corner. */
  statusIcon?: ReactNode;
}

// Gradient stops. Base is THEME.semantic.nutrition; top stop is computed as
// +8% lightness in HSL from the base (H=27°, S=64%, L=58% → L=66%).
const GRADIENT_TOP = "#E0A371";
const GRADIENT_BOTTOM = THEME.semantic.nutrition;

export default function ScanMealButton({
  onClick,
  ariaLabel = "Scan your meal",
  styleOverride,
  statusIcon,
}: ScanMealButtonProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      aria-label={ariaLabel}
      className="relative w-full h-[60px] rounded-2xl flex items-center justify-center gap-[10px] text-white font-semibold text-base shadow-[var(--shadow-scan-button)]"
      style={{
        background: `linear-gradient(180deg, ${GRADIENT_TOP} 0%, ${GRADIENT_BOTTOM} 100%)`,
        ...styleOverride,
      }}
    >
      <Camera size={22} strokeWidth={2} />
      <span>Scan your meal</span>
      {statusIcon}
    </motion.button>
  );
}
