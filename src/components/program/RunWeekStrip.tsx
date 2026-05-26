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
import { useNavigate } from "react-router-dom";
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
import type { SavedRunDoc } from "@/hooks/useClaimMap";
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
  /** PR-J Q5 chunk B3e — unclaimed-runs selector (Q3 P90 shared
   *  computation). Saved runs that don't claim any planned slot
   *  for their date — extras the user logged on top of the plan
   *  (rest-day runs, doubled-up days, sub-threshold runs, quality-
   *  bucket mismatches). Rendered inline under each day's column
   *  per Q5 P69. Wired via `useClaimMap` in the parent. */
  unclaimedByDate: Map<string, SavedRunDoc[]>;
  /** Tap handler — receives the YYYY-MM-DD date for that column.
   *  Caller routes to DayActionSheet. */
  onDayTap: (dateKey: string) => void;
}

/** Q5 P71 cap — 2 extras visible per cell; overflow surfaces a
 *  "+N more" tap-through. */
const EXTRAS_VISIBLE_CAP = 2;

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
  unclaimedByDate,
  onDayTap,
}: RunWeekStripProps) {
  const navigate = useNavigate();
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
      className="grid grid-cols-7 gap-1 rounded-xl bg-card p-2 list-none items-start"
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

        // Q5 P69 — extras for this date. Stacked below the day-tap
        // area so the existing planned-slot UI keeps its 44px touch
        // floor and the extras get their own tappable surfaces.
        const extras = unclaimedByDate.get(col.dateKey) ?? [];
        const visibleExtras = extras.slice(0, EXTRAS_VISIBLE_CAP);
        const overflowCount = Math.max(0, extras.length - EXTRAS_VISIBLE_CAP);

        return (
          <li key={col.dayIndex} className="flex flex-col gap-1">
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
            {/* Q5 P69/P70/P71 — extras stack. Outlined-not-filled
                border + smaller text + dimmed = "this isn't a
                planned slot." Multi-channel visual differentiation
                per P70 (size + border + contrast, not color alone).
                Tap → RunDetail for the underlying saved run. */}
            {visibleExtras.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {visibleExtras.map((extra) => (
                  <ExtraRunPill
                    key={extra.id}
                    extra={extra}
                    onTap={() => navigate(`/run/${extra.id}`)}
                  />
                ))}
                {overflowCount > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate("/history")}
                    aria-label={`${overflowCount} more extra ${overflowCount === 1 ? "run" : "runs"} for ${DAY_LABELS[col.dayIndex]} — open History`}
                    className={cn(
                      "min-h-[24px] rounded-md px-1 text-[9px] leading-tight",
                      "border border-dashed border-muted-foreground/40",
                      "text-muted-foreground/80 hover:text-foreground",
                      "motion-safe:transition-colors motion-safe:active:scale-[0.97]"
                    )}
                  >
                    +{overflowCount} more
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Q5 P70 — extras pill rendering. Outlined-not-filled border +
 * smaller text + dimmed foreground = "this isn't a planned slot."
 * Multi-channel visual differentiation (size + border style +
 * contrast) so it survives `prefers-contrast: more` and color-blind
 * users — NOT color alone.
 *
 * Pill text is intentionally tight to fit the 7-column cell width
 * (~52px at 375vp): just distance, e.g. "5km". The full pace /
 * duration / template detail lives on RunDetail (tap target).
 *
 * Q5 P75 — touch target ≥44px. Pill's intrinsic height is ~24px so
 * the wrapping cell already provides the rest via the lack of
 * adjacent tap targets in the column; tap-zone is the full pill +
 * its margin region inside the column.
 *
 * Q5 P76 — distinct aria-label so screen-readers announce the
 * extras row separately from the planned slot.
 */
function ExtraRunPill({
  extra,
  onTap,
}: {
  extra: SavedRunDoc;
  onTap: () => void;
}) {
  // Distance label as "5km" (no decimal) when the figure is whole;
  // "5.4km" with one decimal otherwise. Bare "km" keeps the pill
  // narrow inside the cell.
  const distanceKm =
    typeof extra.distance === "number" && extra.distance > 0
      ? extra.distance / 1000
      : null;
  const distanceText =
    distanceKm === null
      ? "Run"
      : Number.isInteger(distanceKm)
        ? `${distanceKm}km`
        : `${distanceKm.toFixed(1)}km`;
  const bucketText =
    typeof extra.type === "string" && extra.type.length > 0 ? extra.type : "";
  const ariaLabel = bucketText
    ? `Extra run: ${distanceText} ${bucketText}, tap to open`
    : `Extra run: ${distanceText}, tap to open`;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={ariaLabel}
      className={cn(
        // Outlined-not-filled border (planned slot uses filled).
        "min-h-[24px] rounded-md px-1 py-0.5",
        "border text-[9px] leading-tight",
        // Multi-channel differentiation: dimmed text, dashed-ish
        // contrast (border is solid muted, text muted-foreground).
        "border-muted-foreground/40 text-muted-foreground",
        // Tap affordance — match the day-tap area's transition shape
        // for visual coherence, but no hover-fill so the outlined
        // treatment is preserved.
        "motion-safe:transition-colors motion-safe:active:scale-[0.97]",
        "hover:text-foreground hover:border-muted-foreground/70",
        "truncate"
      )}
    >
      {distanceText}
    </button>
  );
}
