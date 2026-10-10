import { motion } from "framer-motion";
import { Check, Ban } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { runStripLines } from "@/lib/runProgrammeViewModel";

/**
 * ProgrammeWeekSelector — the single day-selector primitive for the
 * Programme tabs. One visual language (circular day buttons, à la Home's
 * WeekStrip + the old DayStepper) shared across Lift and Run, sport-coloured
 * via `sport` (purple = lifting, coral = running).
 *
 * It is a SELECTED-DATE CONTROLLER, not a glance: tapping a cell calls
 * `onSelect(cell.key)` and the parent drives the content below from the new
 * selection. This is the fix for the "competing navigators" problem — both
 * Programme tabs now share this one selector in the same vertical position,
 * and it actually controls the card beneath it.
 *
 * Axis is owned by the parent, not this component (ADR-0002 dual-scheduling
 * ontology):
 *   - Lift cells are SPLIT-ORDERED — `key` is a session index, `center` the
 *     session number (Day 1..N). Rotation, weekday-agnostic.
 *   - Run cells are DATE-PINNED — `key` is a "YYYY-MM-DD" dateKey, `topLabel`
 *     the weekday letter, `center` the date number.
 * This component stays presentational so it can render either without knowing
 * which scheduling model it's drawing.
 */
export interface ProgrammeWeekSelectorCell {
  /** Stable selection key: a session-index string (lift) or dateKey (run). */
  key: string;
  /** Weekday letter shown above the circle (run scope); omitted for lift. */
  topLabel?: string;
  /** Circle content: session number (lift) or date-of-month number (run). */
  center: string;
  /** Sub-label below the circle: split name (lift) or the run's name (run). */
  bottomLabel: string;
  /** Day state. "rest" = a run-scope day with nothing scheduled. */
  status: "completed" | "skipped" | "upcoming" | "rest";
  isToday: boolean;
}

/* DS2 muted-text consolidation (owner-decided, 2026-08-22): the skipped
   identity is the theme-aware secondary token, not the old fixed #8E8E93 —
   its bottomLabel text sat at 2.77:1 on the light page. Alpha steps use
   hsl()/alpha rather than hex concatenation, same value, theme-aware. */
const SKIPPED = "hsl(var(--muted-foreground))";
/** Every day cell, today included, is this size — see the styling note in
 *  the cell loop. One constant so there is no second size to drift to. */
const CELL_PX = 40;
const SKIPPED_FILL = "hsl(var(--muted-foreground) / 0.2)";
const SKIPPED_BORDER = "hsl(var(--muted-foreground) / 0.33)";

export default function ProgrammeWeekSelector({
  sport,
  cells,
  selectedKey,
  onSelect,
  ariaLabel,
}: {
  sport: "lift" | "run";
  cells: ProgrammeWeekSelectorCell[];
  selectedKey: string;
  onSelect: (key: string) => void;
  ariaLabel?: string;
}) {
  if (cells.length === 0) return null;
  // Sport colour drives the today/selected circle — purple for lifting,
  // coral for running — so the selector reads as belonging to its tab.
  const SPORT = sport === "run" ? THEME.running : THEME.brand;
  /* A done day is filled with its sport at 30%, the way Home's week strip
     fills a logged day (DS3), not the success green: the strips read as
     one control, and green is kept for status that is not a sport. The
     check takes the foreground, which reads on the tint in both themes. */
  const DONE_FILL = `hsl(var(--${sport === "run" ? "running" : "lifting"}) / 0.3)`;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel ?? `${sport === "run" ? "Run" : "Lift"} week`}
      className="flex px-1 pt-1 pb-2 gap-1"
    >
      {cells.map((cell) => {
        const isSelected = cell.key === selectedKey;
        const isToday = cell.isToday;
        const isCompleted = cell.status === "completed";
        const isSkipped = cell.status === "skipped";
        const isRest = cell.status === "rest";

        // First-match-wins circle styling. Every cell is the same size:
        // today is a colour and a soft halo, never a geometry — a taller
        // cell pushes its own weekday letter and bottom label off the
        // row's baselines on the one day a user looks at most. Same rule
        // as Home's WeekStrip, so the three strips read as one control.
        // (This enlarged today after a `DayStepper` that no longer
        // exists.)
        let fill: string;
        let bColor: string;
        let bWidth: number;
        let labelColor: string;
        let glow: string | undefined;
        let content: React.ReactNode;

        if (isSkipped) {
          fill = SKIPPED_FILL;
          bWidth = 1;
          bColor = SKIPPED_BORDER;
          content = (
            <Ban
              className="size-4"
              style={{ color: SKIPPED }}
              strokeWidth={2.25}
            />
          );
          labelColor = SKIPPED;
        } else if (isToday && isCompleted) {
          fill = DONE_FILL;
          bWidth = 0;
          bColor = "transparent";
          glow = `0 0 0 4px ${SPORT}1A`;
          content = (
            <Check className="size-4 text-foreground" strokeWidth={3} />
          );
          labelColor = "hsl(var(--muted-foreground))";
        } else if (isCompleted) {
          fill = DONE_FILL;
          bWidth = 0;
          bColor = "transparent";
          content = (
            <Check className="size-4 text-foreground" strokeWidth={3} />
          );
          labelColor = "hsl(var(--muted-foreground))";
        } else if (isToday && isSelected) {
          fill = SPORT;
          bWidth = 0;
          bColor = "transparent";
          glow = `0 0 0 4px ${SPORT}1A`;
          content = (
            <span className="text-sm font-bold text-white">{cell.center}</span>
          );
          labelColor = SPORT;
        } else if (isToday) {
          fill = "transparent";
          bWidth = 2;
          bColor = SPORT;
          glow = `0 0 0 4px ${SPORT}1A`;
          content = (
            <span className="text-sm font-bold" style={{ color: SPORT }}>
              {cell.center}
            </span>
          );
          labelColor = SPORT;
        } else if (isSelected) {
          fill = SPORT;
          bWidth = 0;
          bColor = "transparent";
          content = (
            <span className="text-sm font-bold text-white">{cell.center}</span>
          );
          labelColor = SPORT;
        } else {
          // Upcoming + rest share the calm outline; rest fades a touch more
          // so a run-scope empty day reads as "nothing here" not "to do".
          fill = "transparent";
          bWidth = 2;
          bColor = "hsl(var(--border))";
          content = (
            <span
              className="text-sm font-bold text-muted-foreground"
              style={isRest ? { opacity: 0.55 } : undefined}
            >
              {cell.center}
            </span>
          );
          labelColor = "hsl(var(--muted-foreground))";
        }

        return (
          <div
            key={cell.key}
            className="flex flex-col items-center flex-1 min-w-0"
          >
            {cell.topLabel !== undefined && (
              <span className="text-caption text-muted-foreground mb-0.5">
                {cell.topLabel}
              </span>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-label={
                `${cell.bottomLabel || cell.center}` +
                (isCompleted
                  ? ", completed"
                  : isSkipped
                    ? ", skipped"
                    : isToday
                      ? ", today"
                      : "")
              }
              onClick={() => {
                haptic("light");
                onSelect(cell.key);
              }}
              className="flex items-center justify-center min-w-[44px] min-h-[44px]"
              style={{ width: 52, height: 52 }}
            >
              {/* Colour/border props live in `style`, not `animate`
                  (audit batch 4): Motion cannot tween "transparent" ↔
                  hsl(var(--…)) or the implicit "medium" borderWidth ↔ a
                  number, and warned at runtime on every state change.
                  The discrete swap is imperceptible under the glow tween
                  that remains, and CSS variables stay theme-correct in
                  both light and dark. Size is not tweened because it no
                  longer changes: every cell is `CELL_PX`. */}
              <motion.div
                className="flex items-center justify-center rounded-full"
                animate={{
                  boxShadow: glow ?? "0 0 0 0 transparent",
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{
                  width: CELL_PX,
                  height: CELL_PX,
                  borderStyle: "solid",
                  borderWidth: bWidth,
                  borderColor: bColor,
                  backgroundColor: fill,
                }}
              >
                {content}
              </motion.div>
            </button>
            {/* The row is reserved whether or not this cell has a label.
                Rest days render an empty span, so without a floor the
                strip's height changed with the week's shape and a lone
                "12K" under one day hung off a row nothing else occupied.
                Home's indicator row has had a fixed height for the same
                reason. A lift's split name ends in "…" when it does not fit
                (at larger text on the phone): clamped by line, a single
                word was cut off bare ("Deadlif"), and wrapped it broke
                mid-word. A run's name takes two lines (Run21 (2)): one held
                "Easy 30" but cut "Easy 30 + strides" to "Easy 3…". Each
                line ends in "…" on its own, for the same reason: wrapped
                and clamped, "Intervals" was cut off bare in a narrow cell.
                The lines may take half the gap on either side, 4px in all,
                so "Medium-" fits a cell on a 390px phone; neighbouring
                lines can meet but never overlap. Either way the full name
                is in the tab's label and on the session card. */}
            <span
              data-cell-label
              className={cn(
                "text-caption font-semibold text-center leading-tight mt-1 block",
                sport === "run"
                  ? "max-w-[calc(100%_+_0.25rem)] min-h-7"
                  : "max-w-full truncate min-h-4"
              )}
              style={{ color: labelColor }}
            >
              {sport === "run"
                ? runStripLines(cell.bottomLabel).map((line, i) => (
                    <span key={i} className="block truncate">
                      {line}
                    </span>
                  ))
                : cell.bottomLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
