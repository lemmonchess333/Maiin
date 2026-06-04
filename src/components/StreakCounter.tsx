import { Flame } from "lucide-react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface StreakCounterProps {
  streak: number;
}

export function StreakCounter({ streak }: StreakCounterProps) {
  // Sprint 6: the infinite flame scale+rotate loop bypasses
  // Framer Motion's MotionConfig because it's a `repeat: Infinity`
  // transition on a custom path, which the global reducedMotion
  // setting downgrades to "first state only" rather than disabling
  // outright — the flame still pulses in pos 1 forever. Explicit
  // guard skips the loop entirely when the user opts out.
  const reducedMotion = useReducedMotion();
  if (streak <= 0) {
    return (
      <div
        className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-muted/50 border border-border/50"
        role="status"
        aria-label="No active streak"
      >
        <Flame className="size-6 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            No streak yet
          </p>
          <p className="text-xs text-muted-foreground">
            Log a workout today to start your fire
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      role="status"
      aria-label={`${streak} day streak`}
      className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/10 border border-orange-500/30 shadow-sm"
    >
      <motion.div
        aria-hidden="true"
        animate={
          reducedMotion
            ? undefined
            : {
                scale: [1, 1.25, 1],
                rotate: [0, 8, -8, 0],
              }
        }
        transition={
          reducedMotion
            ? undefined
            : { repeat: Infinity, duration: 2.2, ease: "easeInOut" }
        }
      >
        <Flame className="size-7 text-orange-500 drop-shadow-sm" />
      </motion.div>

      <div className="flex-1">
        <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 tracking-tighter tabular-nums">
          {streak} day streak
        </p>
        <p className="text-xs text-orange-600/80 dark:text-orange-400/80 font-medium">
          {streak >= 30
            ? "Legendary — you're unstoppable"
            : streak >= 14
              ? "On absolute fire — keep this momentum"
              : streak >= 7
                ? "Crushing it — you're in the zone"
                : "Building strong — one more day!"}
        </p>
      </div>

      {/* Subtle streak badge */}
      <div className="px-3 py-1 text-xs font-bold tracking-widest bg-orange-500 text-white rounded-full self-start">
        <Flame size={12} className="inline" /> HOT
      </div>
    </motion.div>
  );
}
