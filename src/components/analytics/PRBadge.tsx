import { useEffect } from "react";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";

interface PRBadgeProps {
  isNew?: boolean;
}

export default function PRBadge({ isNew = false }: PRBadgeProps) {
  useEffect(() => {
    /* lib/haptic routes through Capacitor on iOS where the pure
       navigator.vibrate path was a no-op — the PR-celebration
       buzz now fires on iPhone. */
    if (isNew) haptic(40);
  }, [isNew]);

  if (!isNew) {
    return (
      <div className="size-5 flex items-center justify-center opacity-40">
        <Zap size={14} color={THEME.warning} fill={THEME.warning} />
      </div>
    );
  }

  return (
    <div className="relative size-6 flex items-center justify-center">
      {/* Glow on landing */}
      <motion.div
        className="absolute inset-[-2px] rounded-full"
        style={{ backgroundColor: "#facc15" }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.7, 0], scale: [0.5, 1.3, 1] }}
        transition={{ duration: 0.5, delay: 0.25 }}
      />
      {/* Bolt drops in */}
      <motion.div
        initial={{ y: -20, scale: 0, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 12 }}
      >
        <Zap size={14} color={THEME.warning} fill={THEME.warning} />
      </motion.div>
    </div>
  );
}
