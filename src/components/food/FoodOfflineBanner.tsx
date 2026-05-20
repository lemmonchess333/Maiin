import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const SUSTAINED_OFFLINE_MS = 30_000;

interface FoodOfflineBannerProps {
  /** Overrides the 30s threshold. Exposed for tests. */
  thresholdMs?: number;
}

/**
 * Food6 cc2: page-level offline notice with Food-specific implications.
 *
 * The global Layout banner ("You're offline — changes will sync when
 * reconnected") fires immediately on disconnect for app-wide awareness.
 * This banner is additive — it surfaces ONLY after the disconnect has
 * lasted 30s, and explains which Food features specifically degrade
 * offline (image AI + barcode lookup both require network; text NL
 * logging keeps working via offlineQueue and hero data is cached).
 *
 * The 30s threshold prevents the banner from firing on brief network
 * blips. By the time it appears the user has already seen the global
 * banner and knows they're offline; this adds context, doesn't
 * duplicate the signal.
 */
export default function FoodOfflineBanner({
  thresholdMs = SUSTAINED_OFFLINE_MS,
}: FoodOfflineBannerProps) {
  const { isOnline } = useOnlineStatus();
  const prefersReducedMotion = useReducedMotion();
  // `thresholdPassed` is set inside the 30s timer callback and reset
  // in the effect's cleanup. The cleanup runs both on online→offline
  // → online transitions AND when the dep changes, so every fresh
  // offline cycle starts with thresholdPassed=false and re-waits the
  // full threshold — no instant-flash bug from stale state across
  // multiple offline cycles in one session.
  const [thresholdPassed, setThresholdPassed] = useState(false);

  useEffect(() => {
    if (isOnline) return;
    const id = window.setTimeout(() => setThresholdPassed(true), thresholdMs);
    return () => {
      window.clearTimeout(id);
      setThresholdPassed(false);
    };
  }, [isOnline, thresholdMs]);

  const sustained = !isOnline && thresholdPassed;

  return (
    <div aria-live="polite">
      <AnimatePresence>
        {sustained && (
          <motion.div
            key="food-offline"
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-2 px-3 py-2 mt-2 rounded-lg bg-muted/60 text-xs text-muted-foreground">
              <WifiOff aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p className="leading-snug">
                Image AI and barcode scanner are unavailable offline. Text
                logging keeps working — entries sync when you reconnect.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
