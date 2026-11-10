import { useId, type ReactNode } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { CircleSummary } from "@/features/goalSpace/useGoalSpaces";

/**
 * One of the person's Circles on Together, as a compact row: the Circle's
 * name and one line under it, and the one next step beside it ("Invite
 * someone" while the owner is its only member, the check-in otherwise).
 * The name opens the Circle's sheet. The step is a quiet text button, so
 * a list of Circles does not read as a stack of calls to action, and it
 * takes its Circle's name as its description, since every row's step can
 * read the same.
 *
 * `children` sits under the row, for a decision the Circle is waiting on
 * (its target date has passed).
 */
export default function CircleRow({
  circle,
  title,
  meta,
  onOpen,
  actionLabel,
  actionIcon,
  onAction,
  children,
}: {
  circle: CircleSummary;
  title: ReactNode;
  /** One line, cut short rather than wrapped. */
  /** The line under the title; none for a Circle of one with no date. */
  meta?: ReactNode;
  /** Opens the Circle's sheet. */
  onOpen: (circle: CircleSummary) => unknown;
  /** The next step's words; without them the row has no step. */
  actionLabel?: string;
  actionIcon?: ReactNode;
  onAction?: (circle: CircleSummary) => unknown;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <li className="p-3 space-y-3">
      {/* The step drops under the name, at the right, once the name would
          be narrower than 10em beside it (larger text on a narrow phone). */}
      <div className="flex flex-wrap items-center justify-end gap-x-[8px] gap-y-1">
        <button
          type="button"
          onClick={() => void onOpen(circle)}
          className="min-w-[min(10em,100%)] flex-1 min-h-[44px] flex items-center gap-[12px] text-left rounded-xl active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            aria-hidden
            className="flex size-[40px] items-center justify-center rounded-xl bg-primary/10 shrink-0"
          >
            <Users className="size-5 text-primary-strong" />
          </span>
          <span className="min-w-0 flex-1">
            <span
              id={titleId}
              className="block text-sm font-semibold text-foreground leading-snug truncate"
            >
              {title}
            </span>
            {meta && (
              <span className="block text-xs text-muted-foreground leading-snug truncate">
                {meta}
              </span>
            )}
          </span>
        </button>
        {actionLabel && (
          <Button
            variant="ghost"
            className="shrink-0 px-[12px] text-primary-strong"
            leftIcon={actionIcon}
            aria-describedby={titleId}
            onClick={() => void onAction?.(circle)}
          >
            {actionLabel}
          </Button>
        )}
      </div>
      {children}
    </li>
  );
}
