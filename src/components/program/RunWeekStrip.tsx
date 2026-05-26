/**
 * Compact week strip — Programme Run section (Run7 Q3 + Q8).
 *
 * Replaces the legacy 7-row dropdown stack (~400pt tall) with a
 * 7-column compact strip (~60pt tall). Each column maps to a day of
 * the user's current week (Sunday-start, matching localWeekKey
 * convention). Templates render as label-only — the canonical edit
 * path is DayActionSheet (tap-through), per Pgm3.
 *
 * Cell content:
 *   - Day letter (3-char Sun/Mon/Tue/...)
 *   - Template name ("Easy 30", "Long 10K", or "—" for rest)
 *
 * Cell state:
 *   - today                   → coral text + coral dot under the day letter
 *   - completed_*             → strikethrough label + Check icon
 *   - skipped                 → strikethrough label + ChevronsRight icon
 *   - race_no_show            → coral AlertTriangle icon (warning, not error)
 *   - planned / default       → standard foreground colour
 *
 * Touch target: each column has min-h-[44px] so the whole cell is
 * tappable (iOS HIG floor). Tapping invokes onDayTap(dateKey) which
 * opens DayActionSheet.
 *
 * Width: the strip is laid out with `grid-cols-7` rather than
 * `flex-1 + min-width` so a long template name (e.g. "5×1K Intervals")
 * doesn't push other columns wider — labels truncate via `truncate`
 * on the inner span.
 */
import { useMemo } from "react";
import { Check, ChevronsRight, AlertTriangle } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { DAY_LABELS, DAY_LABELS_SHORT } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { getScheduledRunStatus } from "@/lib/scheduledRunStatus";
import {
  isRunDayComplete,
  type ClaimState,
} from "@/lib/scheduledRunCompletion";
import type { ScheduledRunDay } from "@/features/program/programTypes";

interface RunWeekStripProps {
  runDays: ScheduledRunDay[];
  /** PR-J Q3 chunk B3b — derived completion source of truth. The
   *  legacy `runDay.status === "completed_*"` read is gone; ✅
   *  surfaces when `isRunDayComplete(runDay.id, claimMap)` returns
   *  true (manual completion, saved-run claim, or legacy doc with
   *  status="completed_*" — the helper unifies all three). Wired
   *  via `useClaimMap` in the parent (ProgrammeRunSection). */
  claimMap: Map<string, ClaimState>;
  /** Tap handler — receives the YYYY-MM-DD date for that column.
   *  Caller routes to DayActionSheet. */
  onDayTap: (dateKey: string) => void;
}

interface ColumnData {
  dayIndex: number;
  dateKey: string;
  isToday: boolean;
  runDay: ScheduledRunDay | null;
  templateName: string;
}

function templateNameFor(templateId: string | undefined): string {
  if (!templateId) return "—";
  return RUN_TEMPLATES.find((t) => t.id === templateId)?.name ?? templateId;
}

export default function RunWeekStrip({
  runDays,
  claimMap,
  onDayTap,
}: RunWeekStripProps) {
  const columns = useMemo<ColumnData[]>(() => {
    // Anchor on the same week as the runDays array (so the strip
    // tracks "the week the user's plan is currently rendering for")
    // rather than literal `new Date()` which could drift past
    // midnight in the middle of a session.
    const anchorKey = runDays[0]?.weekKey ?? localWeekKey(new Date());
    const weekStart = parseLocalDate(anchorKey);
    const todayKey = localDateString(new Date());
    return Array.from({ length: 7 }, (_unused, dayIndex) => {
      const date = addLocalDays(weekStart, dayIndex);
      const dateKey = localDateString(date);
      const runDay = runDays.find((rd) => rd.dayIndex === dayIndex) ?? null;
      const templateName = templateNameFor(
        runDay?.userOverride ?? runDay?.templateId
      );
      return {
        dayIndex,
        dateKey,
        isToday: dateKey === todayKey,
        runDay,
        templateName,
      };
    });
  }, [runDays]);

  return (
    <ul
      aria-label="This week's runs"
      className="grid grid-cols-7 gap-1 rounded-xl bg-card p-2 list-none"
    >
      {columns.map((col) => {
        const status = col.runDay ? getScheduledRunStatus(col.runDay) : null;
        // PR-J Q3 chunk B3b — completion is derived from the claim
        // map, not from runDay.status. The helper unifies three
        // completion sources (manual, saved-run-claim, legacy
        // doc) so this component doesn't care which produced it.
        const isCompleted = !!(
          col.runDay?.id && isRunDayComplete(col.runDay.id, claimMap)
        );
        const isSkipped = status === "skipped";
        const isNoShow = status === "race_no_show";

        // Build the a11y label so SR users hear "Tuesday — Easy 30,
        // completed" rather than just the bare day letter.
        const stateSuffix = isCompleted
          ? ", completed"
          : isSkipped
            ? ", skipped"
            : isNoShow
              ? ", race no-show"
              : "";
        const ariaLabel = `${DAY_LABELS[col.dayIndex]} ${col.templateName}${stateSuffix}${col.isToday ? " (today)" : ""}`;

        return (
          <li key={col.dayIndex} className="contents">
            <button
              type="button"
              aria-label={ariaLabel}
              onClick={() => onDayTap(col.dateKey)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5",
                "min-h-[44px] rounded-lg px-1 py-1.5",
                "motion-safe:transition-colors motion-safe:active:scale-[0.97]",
                "hover:bg-muted/50"
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide leading-none",
                  col.isToday ? "" : "text-muted-foreground"
                )}
                style={col.isToday ? { color: THEME.running } : undefined}
              >
                {DAY_LABELS_SHORT[col.dayIndex]}
              </span>
              {col.isToday ? (
                <span
                  aria-hidden="true"
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: THEME.running }}
                />
              ) : (
                <span aria-hidden="true" className="w-1 h-1" />
              )}
              <span
                className={cn(
                  "text-[10px] leading-tight max-w-full truncate text-center",
                  isCompleted || isSkipped
                    ? "line-through text-muted-foreground"
                    : col.runDay
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                )}
              >
                {col.templateName}
              </span>
              {isCompleted ? (
                <Check aria-hidden="true" className="w-3 h-3 text-green-600" />
              ) : isSkipped ? (
                <ChevronsRight
                  aria-hidden="true"
                  className="w-3 h-3 text-muted-foreground"
                />
              ) : isNoShow ? (
                <AlertTriangle
                  aria-hidden="true"
                  className="w-3 h-3"
                  style={{ color: THEME.running }}
                />
              ) : (
                <span aria-hidden="true" className="w-3 h-3" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
