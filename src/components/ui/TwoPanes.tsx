import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Two panes side by side where the screen has room for two (`split`: the
 * iPhone Duo's inner display open on its side), the gap on the fold, and
 * one column on every phone (DESIGN_GUIDE §14r).
 *
 * - Both panes are always mounted, so a fold re-flows the same elements
 *   rather than mounting new ones: a half-typed meal or an open sheet
 *   survives it.
 * - The wrapper and each pane carry the page's own rhythm, PageShell's
 *   16 px (`space-y-4`) unless the page has another (`className`, as Home's
 *   placeholder's 24 px), so a phone draws exactly the column it did, and
 *   the reading order is the phone's: the first pane, then the second.
 * - Every other class is `split:`, keyed to `data-two-panes`. Layout
 *   widens its column for a page holding one (`has-[[data-two-panes]]`),
 *   so `panes={false}` keeps a single centred column on the inner display
 *   too (Progress for an account with nothing logged yet) without
 *   remounting either pane.
 */
export default function TwoPanes({
  panes = true,
  className,
  children,
}: {
  panes?: boolean;
  /** The page's rhythm, when it is not PageShell's `space-y-4`. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-two-panes={panes ? "" : undefined}
      className={cn(
        "space-y-4 split:data-two-panes:grid split:data-two-panes:grid-cols-2 split:data-two-panes:items-start split:data-two-panes:gap-x-8",
        className
      )}
    >
      {children}
    </div>
  );
}

/** One of the two panes: a column in the page's rhythm. */
export function Pane({
  className,
  children,
}: {
  /** The page's rhythm, when it is not PageShell's `space-y-4`. */
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("space-y-4 min-w-0", className)}>{children}</div>;
}
