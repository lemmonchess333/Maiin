import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStreaks } from "@/features/streaks/useStreaks";
import { BadgeEarnedContent } from "@/features/streaks/BadgeEarnedModal";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * The badge a session earned, sealed until it is tapped, on that
 * session's finish screen (FW1 (6)). Any other badge waits on Home as a
 * `NewBadgeRow`. The workout's finish screen shows it under the session's
 * new bests (Pol1); the run's, among its extras, above Done.
 *
 * Its dismissal folds it away, so the screen below closes the gap under
 * the finger rather than jumping up ~300 px in one frame.
 */
export default function SessionBadge() {
  const { newBadge, dismissNewBadge } = useStreaks();
  const reduce = useReducedMotion();
  const fold = useRef<HTMLDivElement>(null);
  return (
    <AnimatePresence initial={false}>
      {newBadge && (
        <motion.div
          key={newBadge.id}
          variants={{ folded: { height: 0, opacity: 0 } }}
          exit={reduce ? undefined : "folded"}
          transition={{ duration: 0.2, ease: "easeOut" }}
          /* Clipped only while it folds: the seal's rays and shards
             reach past its box while it is shown. */
          onAnimationStart={(definition) => {
            if (definition === "folded")
              fold.current?.style.setProperty("overflow", "hidden");
          }}
          ref={fold}
        >
          <BadgeEarnedContent
            badge={newBadge}
            onDismiss={dismissNewBadge}
            inline
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
