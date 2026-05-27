import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const DEFAULT_THRESHOLD_MS = 30_000;

interface SustainedOfflineBannerProps {
  /** Page-specific copy explaining what degrades offline. Caller
   *  owns the wording so each page can be specific (Food: image AI
   *  + barcode unavailable; History: viewing cached data; etc.). */
  children: ReactNode;
  /** Overrides the 30s threshold. Exposed for tests; production
   *  call sites should leave the default. */
  thresholdMs?: number;
  /** Unique AnimatePresence key so multiple banners on the same
   *  page (e.g. nested layouts) don't collide. */
  bannerKey?: string;
}

/**
 * Generic "you've been offline a while" banner primitive. The
 * global Layout banner fires immediately on disconnect; this one
 * is additive — it surfaces ONLY after the disconnect has lasted
 * 30s, with page-specific copy explaining what's degraded.
 *
 * The 30s threshold prevents the banner from firing on brief
 * network blips. By the time it appears the user has already seen
 * the global banner; this adds page context, not signal duplication.
 *
 * `thresholdPassed` is set inside the timer and reset in the
 * effect's cleanup so each fresh offline cycle re-waits the full
 * threshold — no instant-flash bug from stale state across multiple
 * offline cycles in one session.
 */
export default function SustainedOfflineBanner({
  children,
  thresholdMs = DEFAULT_THRESHOLD_MS,
  bannerKey = "sustained-offline",
}: SustainedOfflineBannerProps) {
  const { isOnline } = useOnlineStatus();
  const prefersReducedMotion = useReducedMotion();
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
            key={bannerKey}
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={
              prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
            }
            transition={
              prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }
            }
            className="overflow-hidden"
          >
            <div className="flex items-start gap-2 px-3 py-2 mt-2 rounded-lg bg-muted/60 text-xs text-muted-foreground">
              <WifiOff
                aria-hidden="true"
                className="size-3.5 shrink-0 mt-0.5"
              />
              <p className="leading-snug">{children}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
