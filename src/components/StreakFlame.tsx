import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreakFlameProps {
  streak: number;
  /** Entrance bounce on mount / streak change. */
  bounce?: boolean;
  /** Celebration scale-pop (1 → 1.2 → 1 over ~300ms). */
  celebrate?: boolean;
  /** The display string for the number — defaults to `streak`. Override
   *  to animate the counting via a parent-managed motion value. */
  display?: React.ReactNode;
}

/**
 * Orange flame pill used in Home's top-right and the Food hero card.
 * Extracted from Home.tsx so both surfaces share one component.
 */
export function StreakFlame({
  streak,
  bounce,
  celebrate,
  display,
}: StreakFlameProps) {
  // Hide entirely at zero — a flame labelled "0" reads as a failure
  // indicator. This early return is safe because the component uses no
  // React hooks; only framer-motion's motion.div/motion.span.
  if (streak <= 0) return null;

  const active = streak > 0;

  return (
    <motion.div
      key={streak}
      initial={bounce ? { scale: 1.15 } : undefined}
      animate={celebrate ? { scale: [1, 1.2, 1] } : { scale: 1 }}
      transition={
        celebrate
          ? { duration: 0.3, ease: "easeOut" }
          : { type: "spring", stiffness: 300 }
      }
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-full",
        active ? "" : "bg-muted",
      )}
      style={active ? { background: "rgba(251,146,60,0.06)" } : undefined}
    >
      <motion.span
        animate={
          active
            ? { opacity: [0.7, 1, 0.7], scale: 1 }
            : { opacity: 0.4, scale: 1 }
        }
        transition={
          active
            ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        <Flame
          className={cn(
            "w-4 h-4",
            active ? "text-orange-500" : "text-muted-foreground",
          )}
        />
      </motion.span>
      <span
        className={cn(
          "text-sm font-semibold",
          active
            ? "text-orange-600 dark:text-orange-400"
            : "text-muted-foreground",
        )}
      >
        {display ?? streak}
      </span>
    </motion.div>
  );
}
