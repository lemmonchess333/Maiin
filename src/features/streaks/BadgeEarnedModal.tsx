import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { X } from "lucide-react";
import type { EarnedBadge } from "./badges";

interface BadgeEarnedModalProps {
  badge: EarnedBadge | null;
  onDismiss: () => void;
}

export function BadgeEarnedModal({ badge, onDismiss }: BadgeEarnedModalProps) {
  useEffect(() => {
    if (badge) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.5 },
        colors: ["#8b5cf6", "#a78bfa", "#fbbf24", "#34d399"],
      });
    }
  }, [badge]);

  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs bg-card rounded-3xl border border-border/50 p-8 text-center space-y-4 shadow-2xl"
          >
            <button
              onClick={onDismiss}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-muted"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>

            <motion.p
              animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
              transition={{ duration: 0.6 }}
              className="text-6xl"
            >
              {badge.icon}
            </motion.p>

            <div>
              <p className="text-lg font-bold text-foreground">{badge.name}</p>
              <p className="text-sm text-muted-foreground mt-1">{badge.description}</p>
            </div>

            <p className="text-xs text-primary font-medium">Badge Earned!</p>

            <button
              onClick={onDismiss}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              Awesome!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
