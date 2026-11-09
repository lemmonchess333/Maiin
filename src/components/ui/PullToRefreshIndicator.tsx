import { motion, useTransform, type MotionValue } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The pull-to-refresh indicator, one for every page that has the gesture
 * (usePullToRefresh). A round chip comes down from under the status bar
 * with the finger, turning as it comes; it turns the brand colour once a
 * release would refresh, holds with a spinner while the refresh runs, and
 * springs away after.
 *
 * It moves by transform and opacity only, and it is a screen reader's
 * "Refreshing" status only while a refresh runs: the pull itself is a
 * gesture, not news.
 */
export default function PullToRefreshIndicator({
  pull,
  readyAt,
  refreshing,
  label = "Refreshing",
}: {
  pull: MotionValue<number>;
  readyAt: number;
  refreshing: boolean;
  label?: string;
}) {
  const opacity = useTransform(pull, (p) => Math.min(1, p / readyAt));
  const rotate = useTransform(pull, (p) => p * 3);
  const ready = useTransform(pull, (p) => (p >= readyAt ? 1 : 0));
  const notReady = useTransform(ready, (r) => 1 - r);

  return (
    <motion.div
      aria-hidden={refreshing ? undefined : "true"}
      data-pull-indicator
      className="pointer-events-none fixed left-1/2 z-40 -ml-5 flex size-10 items-center justify-center rounded-full bg-card shadow-md ring-1 ring-border"
      style={{ top: "calc(var(--safe-top) - 40px)", y: pull, opacity }}
    >
      {refreshing ? (
        <Spinner size="sm" label={label} />
      ) : (
        <motion.span className="relative size-4" style={{ rotate }}>
          <motion.span
            className="absolute inset-0 text-muted-foreground"
            style={{ opacity: notReady }}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </motion.span>
          <motion.span
            className="absolute inset-0 text-primary"
            style={{ opacity: ready }}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </motion.span>
        </motion.span>
      )}
    </motion.div>
  );
}
