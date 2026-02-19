import { Flame } from "lucide-react";
import { motion } from "framer-motion";

interface StreakCounterProps {
  streak: number;
}

export function StreakCounter({ streak }: StreakCounterProps) {
  if (streak <= 0) return null;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20"
    >
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
      >
        <Flame className="w-5 h-5 text-orange-500" />
      </motion.div>
      <div>
        <p className="text-sm font-semibold text-foreground">
          {streak} day streak
        </p>
        <p className="text-xs text-muted-foreground">
          {streak >= 30
            ? "Legendary!"
            : streak >= 14
            ? "On fire!"
            : streak >= 7
            ? "Crushing it!"
            : "Keep it going!"}
        </p>
      </div>
    </motion.div>
  );
}
