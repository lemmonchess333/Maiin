import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

/**
 * The lift session's exercise list, behind one row.
 *
 * WHY. The Train tab met the same session twice. `SessionCommandCard`
 * states the day, "5 exercises · ~43 min" and a primary Start workout —
 * and the full editable list then rendered directly beneath it anyway,
 * sets, reps, load and a per-row overflow each. Measured off the captured
 * frame at 393 px wide: command card 313 px, list ~300 px, Add exercise
 * 44 px, so 657 px of a 1690 px page — 39% — spent saying one workout in
 * two registers. Folding the list is the only lever on that page that
 * removes a DUPLICATION rather than hiding something the page only says
 * once.
 *
 * WHY IT FOLDS IN PLACE, rather than moving into the day sheet. The
 * inline list is the ONLY route to reordering, replacing or removing an
 * exercise — checked, not assumed: `DayActionSheet` is day-scoped
 * throughout (run template swap, move run day, skip/restore the lift) and
 * offers nothing exercise-level, so the string "exercise" does not appear
 * in it. Moving the list anywhere would take those three actions with it.
 * A disclosure keeps every one of them exactly one tap away, which is
 * also why the panel holds "Add exercise" as well as the rows: collapsed
 * should mean one row, not one row plus an orphan button.
 *
 * WHY `forceOpen` EXISTS, and it is not defensive. "Reorder exercises"
 * lives in the PAGE HEADER's overflow sheet, not on a row — so a user can
 * collapse the list, tap it, and be put into a drag mode with nothing on
 * screen to drag. The mode opens the panel itself. While it holds the
 * panel open the collapse control is not rendered at all: the mode's exit
 * is the header's "Done", and a chevron that visibly does nothing is worse
 * than no chevron.
 *
 * The panel mounts and unmounts plainly, with no height animation. Its
 * children include a `DndContext` and rows carrying their own swipe and
 * long-press handlers; animating the height of that is jank on the one
 * surface where a mis-timed frame costs a drag.
 */
interface ExerciseListDisclosureProps {
  /** Exercises inside the panel — the figure the collapsed row shows. */
  count: number;
  /** The user's own choice. Held by the page so it survives a day swipe. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hold the panel open regardless of `open` (see the header note above). */
  forceOpen?: boolean;
  children: ReactNode;
}

export default function ExerciseListDisclosure({
  count,
  open,
  onOpenChange,
  forceOpen = false,
  children,
}: ExerciseListDisclosureProps) {
  const panelId = useId();
  const expanded = open || forceOpen;

  const row = (
    <>
      <span className="text-sm font-semibold text-foreground">Exercises</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="text-sm font-mono tabular-nums">{count}</span>
        {!forceOpen && (
          <ChevronDown
            className={cn(
              "size-4 motion-safe:transition-transform",
              expanded && "rotate-180"
            )}
            aria-hidden="true"
          />
        )}
      </span>
    </>
  );

  return (
    <div className="space-y-2">
      {forceOpen ? (
        <div className="w-full min-h-[44px] px-3 rounded-xl bg-card flex items-center justify-between gap-3">
          {row}
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => {
            haptic("light");
            onOpenChange(!expanded);
          }}
          className={cn(
            "w-full min-h-[44px] px-3 rounded-xl bg-card",
            "flex items-center justify-between gap-3 text-left",
            "active:scale-[0.97] motion-safe:transition-transform"
          )}
        >
          {row}
        </button>
      )}
      {expanded && (
        <div id={panelId} className="space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}
