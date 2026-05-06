import { useEffect, type ReactElement, type ReactNode } from "react";
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
  children,
}: CoachmarkProps) {
  const { showCoachMarks, dismiss } = useCoachMarks(storageKey);

  /* Auto-dismiss runs only while the coachmark is currently shown.
     Once dismissed (by any path), the timer is cleared and won't
     re-fire — useCoachMarks is single-shot per key. */
  useEffect(() => {
    if (!showCoachMarks) return;
    const t = window.setTimeout(() => dismiss(), autoDismissMs);
    return () => window.clearTimeout(t);
  }, [showCoachMarks, autoDismissMs, dismiss]);

  return (
    <Tooltip
      content={content}
      placement={placement}
      open={showCoachMarks}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      {children}
    </Tooltip>
  );
}
