import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { haptic } from "@/lib/haptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";

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
}: ContextualTipBannerProps) {
  const storageKey = `${DISMISSED_STORAGE_PREFIX}:${tipKey}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!window.localStorage.getItem(storageKey);
    } catch {
      return false;
    }
  });
  const prefersReducedMotion = useReducedMotion();

  const shouldRender = visible && !dismissed;

  const handleDismiss = () => {
    haptic("light");
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* private mode — in-memory dismissal still applies */
    }
  };

  return (
    <AnimatePresence>
      {shouldRender && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25, ease: "easeOut" }}
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
                className="inline-flex items-center gap-0.5 mt-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                {ctaLabel}
                <ChevronRight aria-hidden="true" className="w-3 h-3" />
              </Link>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={`Dismiss tip: ${title}`}
              className="w-7 h-7 -m-1 rounded-lg flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] active:scale-90 transition-all shrink-0"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
