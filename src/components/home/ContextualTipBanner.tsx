import { m as motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { useEducationCard } from "@/components/EducationLaneProvider";

/** localStorage key prefix for per-tip dismissal flags. */
const DISMISSED_STORAGE_PREFIX = "tropos-home-tip-dismissed";

interface ContextualTipBannerProps {
  /** Stable identifier — drives the dismiss-once localStorage key.
   *  Version the suffix (eg. `body-metrics-v1`) so a redesign can
   *  re-surface the tip for users who already dismissed it. */
  tipKey: string;
  /** Headline copy (1-line, sentence case). */
  title: string;
  /** Supporting copy (1-2 lines). */
  description: string;
  /** When false the banner is hidden regardless of dismissal state.
   *  Drive this from the underlying condition (eg. profile.age is
   *  missing). When the condition resolves the banner stays
   *  dismissed even if the user later re-introduces the gap —
   *  re-showing dismissed tips is hostile. */
  visible: boolean;
  /** CTA target route. The CTA caption is auto-generated as "Open
   *  Settings" / "Open Profile" etc. — supply the explicit label to
   *  override. */
  ctaLabel?: string;
  ctaHref?: string;
  /** Priority within the #995 education lane (≤1 inline card at a time).
   *  Higher wins. Omit (0) for banners not competing for the lane. */
  lanePriority?: number;
}

/**
 * A1 contextual tip banner. Renders ONCE per dismissal lifetime
 * (per-tip localStorage flag) and only while the underlying
 * `visible` condition holds. Designed for Home-page surfaces that
 * want to nudge the user about an incomplete profile state.
 *
 * Pattern mirrors the Hist4 / Food6 sustained-offline banners —
 * subtle bg-muted background, small icon, dismiss X, optional CTA.
 * No haptic on appearance (it's passive); haptic fires on dismiss
 * + CTA tap.
 */
export default function ContextualTipBanner({
  tipKey,
  title,
  description,
  visible,
  ctaLabel = "Open Settings",
  ctaHref = "/settings",
  lanePriority = 0,
}: ContextualTipBannerProps) {
  const { dismissed, dismiss } = useDismissOnce(
    `${DISMISSED_STORAGE_PREFIX}:${tipKey}`
  );
  const prefersReducedMotion = useReducedMotion();

  // Compete in the education lane: this banner only renders when it is the
  // single winning card. When dismissed, `eligible` flips false and the next
  // card takes the slot. Fails open outside the provider (visible === eligible).
  const eligible = visible && !dismissed;
  const { visible: isLaneWinner } = useEducationCard({
    id: `tip:${tipKey}`,
    priority: lanePriority,
    eligible,
  });

  const shouldRender = eligible && isLaneWinner;

  const handleDismiss = () => {
    haptic("light");
    dismiss();
  };

  return (
    <AnimatePresence>
      {shouldRender && (
        <motion.div
          initial={
            prefersReducedMotion ? false : { opacity: 0, y: -6, height: 0 }
          }
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={
            prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -6, height: 0 }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.25, ease: "easeOut" }
          }
          className="overflow-hidden"
        >
          <div
            role="status"
            className="flex items-start gap-3 p-3 rounded-xl bg-muted/60 border border-border/40"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                {description}
              </p>
              <Link
                to={ctaHref}
                onClick={() => haptic("light")}
                className="inline-flex items-center gap-0.5 mt-1 -mb-1 min-h-[44px] text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                {ctaLabel}
                <ChevronRight aria-hidden="true" className="size-3" />
              </Link>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={`Dismiss tip: ${title}`}
              className="size-11 -m-2 rounded-lg flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] active:scale-90 transition-all shrink-0"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
