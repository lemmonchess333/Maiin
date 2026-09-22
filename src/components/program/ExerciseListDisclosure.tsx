import { Fragment } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

/**
 * The lift session's exercise list, as the command card's footer.
 *
 * WHY THE LIST IS BEHIND A TAP. The Train tab met the same session
 * twice: `SessionCommandCard` states the day and offers Start, and the
 * full editable list then rendered beneath it anyway, sets, reps, load
 * and a per-row overflow each. Measured at 393 px wide, that was 657 px
 * of a 1690 px page spent saying one workout in two registers.
 *
 * WHY IT IS THE CARD'S FOOTER RATHER THAN A ROW BENEATH IT. The first
 * cut made it a standalone row, which left the page ending on a small
 * detached strip once the block and volume cards went — and a row that
 * says only "Exercises 6" answers none of "what am I doing today?".
 * Folded into the card it costs 8 px LESS than the row did, shows the
 * names, and puts the trigger against the panel it opens. It is the
 * shape Hevy and Strong both use, reached from the other direction.
 *
 * The names are a PREVIEW, not the control's name: a screen reader is
 * given "Exercises, 6" so the button announces its purpose, and the
 * list itself is read from the panel.
 *
 * WHY THE PREVIEW RESERVES TWO LINES. The day pager animates the whole
 * card on swipe, so a footer that grew and shrank between days would
 * show as a jitter mid-transition. Two lines is the cap and the floor.
 *
 * WHY `forceOpen` EXISTS, and it is not defensive. "Reorder exercises"
 * lives in the PAGE HEADER's overflow sheet, not on the card — so a
 * user can collapse the list, tap it, and be put into a drag mode with
 * nothing on screen to drag. The mode opens the panel itself. While it
 * holds the panel open the chevron is not rendered: the mode's exit is
 * the header's "Done", and a chevron that visibly does nothing is worse
 * than no chevron.
 *
 * The panel lives in `Program.tsx` directly under the card and mounts
 * plainly, with no height animation. It holds a `DndContext` and rows
 * carrying their own swipe and long-press handlers; animating the
 * height of that is jank on the one surface where a mis-timed frame
 * costs a drag.
 */

/** Shared between the footer's `aria-controls` and the panel it opens.
 *  One lift card is on screen at a time, so a constant is honest here
 *  and lets the panel live in a different component from its trigger. */
export const EXERCISE_PANEL_ID = "lift-exercise-panel";

/** Names shown before the tail. Three fits two lines at 393 px with the
 *  longest names in the library ("Incline dumbbell press"). */
export const PREVIEW_NAMES = 3;

interface ExerciseListFooterProps {
  /** Every exercise in the day, in plan order. */
  names: string[];
  /** The user's own choice. Held by the page so it survives a day swipe. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hold the panel open regardless of `open` (see the header note). */
  forceOpen?: boolean;
}

export default function ExerciseListFooter({
  names,
  open,
  onOpenChange,
  forceOpen = false,
}: ExerciseListFooterProps) {
  const expanded = open || forceOpen;
  const shown = names.slice(0, PREVIEW_NAMES);
  const rest = names.length - shown.length;

  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={EXERCISE_PANEL_ID}
      aria-label={`Exercises, ${names.length}`}
      onClick={() => {
        haptic("light");
        onOpenChange(!expanded);
      }}
      className={cn(
        "w-full min-h-[44px] px-4 py-2.5",
        "flex items-center justify-between gap-3 text-left",
        "border-t border-lifting/20",
        "active:scale-[0.99] motion-safe:transition-transform"
      )}
    >
      <p className="flex-1 min-w-0 text-xs text-muted-foreground line-clamp-2 min-h-[2.125rem]">
        {names.length === 0 ? (
          "No exercises yet"
        ) : (
          <>
            <span className="font-medium text-foreground">{shown[0]}</span>
            {shown.slice(1).map((name, i) => (
              <Fragment key={i}>{` · ${name}`}</Fragment>
            ))}
            {rest > 0 && (
              <>
                {" · "}
                <span className="font-mono tabular-nums">{rest}</span> more
              </>
            )}
          </>
        )}
      </p>
      {!forceOpen && (
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground motion-safe:transition-transform",
            expanded && "rotate-180"
          )}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
