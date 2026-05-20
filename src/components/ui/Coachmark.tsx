import { useCallback, useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { useCoachMarks } from "@/hooks/useCoachMarks";
import Tooltip, { type TooltipPlacement } from "./Tooltip";

interface CoachmarkProps {
  /** Forwarded to useCoachMarks. Version the suffix (e.g. `-v1`) so a
   *  redesign can re-trigger the explainer for users who saw the
   *  previous version. */
  storageKey: string;
  content: ReactNode;
  placement?: TooltipPlacement;
  /** Auto-dismiss after this many ms. Default 6000. The dismissal
   *  persists so the user only sees it once even if they didn't
   *  actively interact. */
  autoDismissMs?: number;
  /** Optional callback fired exactly once on the first dismissal —
   *  whether via the user (tap-outside, escape, close button) or
   *  the auto-dismiss timer. Lets call sites emit telemetry without
   *  reaching past the primitive into useCoachMarks. */
  onDismiss?: () => void;
  children: ReactElement;
}

/**
 * One-shot dismissible explainer pointing at an anchor. Composes
 * `Tooltip` (rendering / positioning / a11y) with `useCoachMarks`
 * (persistence / dismissal state) — see Tooltip's docstring for the
 * "when to use" rule.
 */
export default function Coachmark({
  storageKey,
  content,
  placement = "top",
  autoDismissMs = 6000,
  onDismiss,
  children,
}: CoachmarkProps) {
  const { showCoachMarks, dismiss } = useCoachMarks(storageKey);

  // Wrap dismiss so onDismiss fires exactly once per session, on the
  // first dismissal regardless of path (manual close, tap-outside,
  // escape, auto-timer). Subsequent dismiss() calls are no-ops at the
  // hook level — showCoachMarks becomes false and the wrapper's guard
  // prevents duplicate onDismiss invocations.
  const dismissedFiredRef = useRef(false);
  const dismissAndNotify = useCallback(() => {
    if (!dismissedFiredRef.current) {
      dismissedFiredRef.current = true;
      onDismiss?.();
    }
    dismiss();
  }, [dismiss, onDismiss]);

  /* Auto-dismiss runs only while the coachmark is currently shown.
     Once dismissed (by any path), the timer is cleared and won't
     re-fire — useCoachMarks is single-shot per key. */
  useEffect(() => {
    if (!showCoachMarks) return;
    const t = window.setTimeout(() => dismissAndNotify(), autoDismissMs);
    return () => window.clearTimeout(t);
  }, [showCoachMarks, autoDismissMs, dismissAndNotify]);

  return (
    <Tooltip
      content={content}
      placement={placement}
      open={showCoachMarks}
      onOpenChange={(next) => {
        if (!next) dismissAndNotify();
      }}
    >
      {children}
    </Tooltip>
  );
}
