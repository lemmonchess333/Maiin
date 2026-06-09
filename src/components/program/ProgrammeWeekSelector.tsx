import { motion } from "framer-motion";
import { Check, Ban } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { THEME } from "@/lib/theme";

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
  /** Sub-label below the circle: split name (lift) or compact run label (run). */
  bottomLabel: string;
  /** Day state. "rest" = a run-scope day with nothing scheduled. */
  status: "completed" | "skipped" | "upcoming" | "rest";
  isToday: boolean;
}

const GREEN = THEME.success;
const SKIPPED = THEME.text.muted;

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

        // First-match-wins circle styling. Mirrors DayStepper's rule order
        // (today = 48px + glow; peers = 40px) so the two tabs are visually
        // interchangeable.
        let diameter: number;
        let fill: string;
        let bColor: string;
        let bWidth: number;
        let labelColor: string;
        let glow: string | undefined;
        let content: React.ReactNode;

        if (isSkipped) {
          diameter = 40;
          fill = SKIPPED + "33";
          bWidth = 1;
          bColor = SKIPPED + "55";
          content = (
            <Ban
              className="size-4"
              style={{ color: SKIPPED }}
              strokeWidth={2.25}
            />
          );
          labelColor = SKIPPED;
        } else if (isToday && isCompleted) {
          diameter = 48;
          fill = GREEN;
          bWidth = 0;
          bColor = "transparent";
          glow = `0 0 0 4px ${GREEN}1A, 0 4px 14px ${GREEN}33`;
          content = <Check className="size-5 text-white" strokeWidth={3} />;
          labelColor = GREEN;
        } else if (isCompleted) {
          diameter = 40;
          fill = GREEN;
          bWidth = 0;
          bColor = "transparent";
          content = <Check className="size-4 text-white" strokeWidth={3} />;
          labelColor = GREEN;
        } else if (isToday && isSelected) {
          diameter = 48;
          fill = SPORT;
          bWidth = 0;
          bColor = "transparent";
          glow = `0 0 0 4px ${SPORT}1A, 0 4px 14px ${SPORT}40`;
          content = (
            <span className="text-base font-bold text-white">
              {cell.center}
            </span>
          );
          labelColor = SPORT;
        } else if (isToday) {
          diameter = 48;
          fill = "transparent";
          bWidth = 2;
          bColor = SPORT;
          glow = `0 0 0 4px ${SPORT}1A`;
          content = (
            <span className="text-base font-bold" style={{ color: SPORT }}>
              {cell.center}
            </span>
          );
          labelColor = SPORT;
        } else if (isSelected) {
          diameter = 40;
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
          diameter = 40;
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
              <motion.div
                className="flex items-center justify-center rounded-full"
                animate={{
                  width: diameter,
                  height: diameter,
                  backgroundColor: fill,
                  borderColor: bColor,
                  borderWidth: bWidth,
                  boxShadow: glow ?? "0 0 0 0 transparent",
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ borderStyle: "solid" }}
              >
                {content}
              </motion.div>
            </button>
            <span
              className="text-caption font-semibold text-center line-clamp-1 leading-tight max-w-full mt-1"
              style={{ color: labelColor }}
            >
              {cell.bottomLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
