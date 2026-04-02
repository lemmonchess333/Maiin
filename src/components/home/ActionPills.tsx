import { THEME } from "@/lib/theme";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
const MotionLink = motion.create(Link);
import { Activity, UtensilsCrossed } from "lucide-react";
import { haptic } from "@/lib/haptic";

export default function ActionPills({ showRun = false }: { showRun?: boolean }) {
  return (
    <div className="flex gap-2">
      {!showRun && (
        <MotionLink to="/run" onClick={function() { haptic(); }} whileTap={{ scale: 0.95 }}
          className="flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-xl transition-transform"
          style={{ backgroundColor: THEME.running + "20", border: `1px solid ${THEME.running}12`, boxShadow: `0 1px 4px ${THEME.running}18` }}>
          <Activity className="w-4 h-4" style={{ color: THEME.running }} />
          <span className="text-sm font-semibold text-foreground">Start Run</span>
        </MotionLink>
      )}
      <MotionLink to="/food" onClick={function() { haptic(); }} whileTap={{ scale: 0.95 }}
        className="flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-xl transition-transform"
        style={{ backgroundColor: THEME.semantic.nutrition + "20", border: `1px solid ${THEME.semantic.nutrition}12`, boxShadow: `0 1px 4px ${THEME.semantic.nutrition}18` }}>
        <UtensilsCrossed className="w-4 h-4" style={{ color: THEME.semantic.nutrition }} />
        <span className="text-sm font-semibold text-foreground">Log Food</span>
      </MotionLink>
    </div>
  );
}
