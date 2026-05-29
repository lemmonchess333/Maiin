/**
 * Run9 phase 2 — the Programme Run tab's persistent RACE HEADER.
 *
 * Lock Run9b + (k): the PERSISTENT race-plan attributes — the race-goal
 * one-liner, week N-of-M + phase + progress, the taper line, and the
 * compressed-plan note — live here, always visible while a race is set. They
 * are explicitly NOT banners competing for the single contextual-prompt slot
 * (no-show / recovery-complete / fell-behind). Pre-Run9 the compressed note
 * was an amber WARNING banner stacked at the top with the actionable prompts;
 * here it's a calm informational note inside the header (Run9f: name the
 * effect plainly, no alarm chrome), so an actionable prompt is never buried.
 *
 * Pure presentational — all state is derived by the caller and passed in.
 */

import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { THEME } from "@/lib/theme";
import { parseLocalDate } from "@/lib/dateHelpers";
import {
  getRacePhaseLabel,
  isCurrentWeekInTaper,
} from "@/features/program/runScheduler";

type RaceDistance = "5k" | "10k" | "half" | "marathon";

interface RaceHeaderProps {
  raceGoal: { distance: string; targetDate: string };
  currentWeek?: number;
  totalWeeks?: number;
  /** runPlan.compressed — shown as a calm note, not a warning banner. */
  compressed?: boolean;
  /** Local "YYYY-MM-DD" today key for the countdown. */
  todayKey: string;
  /** Deeplink to the race-goal editor (/settings/training). */
  onEdit: () => void;
}

export default function RaceHeader({
  raceGoal,
  currentWeek,
  totalWeeks,
  compressed,
  todayKey,
  onEdit,
}: RaceHeaderProps) {
  const distance = raceGoal.distance as RaceDistance;
  const inTaper = isCurrentWeekInTaper(currentWeek, totalWeeks, distance);
  const daysToRace = (() => {
    try {
      const target = parseLocalDate(raceGoal.targetDate);
      const today = parseLocalDate(todayKey);
      return Math.max(
        0,
        Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      );
    } catch {
      return null;
    }
  })();
  const hasProgress = totalWeeks != null && currentWeek != null;

  return (
    <>
      {/* Run9f / PR-K Q9d — taper week is named in plain copy near race day,
          NOT a phase badge. 10px uppercase tracking matches the section-label
          convention; pairs with the countdown so it reads as a calendar
          anchor. */}
      {inTaper && (
        <p
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: THEME.running }}
          aria-label={
            daysToRace != null
              ? `Taper week, race in ${daysToRace} day${daysToRace === 1 ? "" : "s"}`
              : "Taper week"
          }
        >
          Taper week
          {daysToRace != null && (
            <>
              {" · "}
              race in {daysToRace} day{daysToRace === 1 ? "" : "s"}
            </>
          )}
        </p>
      )}

      <div className="p-3 rounded-xl bg-card space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Race goal: </span>
            <span className="font-medium">
              {raceGoal.distance.toUpperCase()}
              {" · "}
              {(() => {
                try {
                  return format(parseLocalDate(raceGoal.targetDate), "d MMM yyyy");
                } catch {
                  return raceGoal.targetDate;
                }
              })()}
            </span>
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-0.5 min-h-[44px] px-2 -my-1 -mr-1 text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97] transition-transform rounded-md"
            aria-label="Edit race goal"
          >
            Edit
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        {hasProgress && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Week
              </span>
              <span className="text-sm font-medium text-foreground">
                {currentWeek! + 1} / {totalWeeks!}
                {" · "}
                {getRacePhaseLabel(currentWeek!, totalWeeks!, distance)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: ((currentWeek! + 1) / totalWeeks!) * 100 + "%",
                }}
              />
            </div>
          </>
        )}

        {/* Run9 (k)/(f): compressed is a persistent note here, not an amber
            banner competing with the contextual slot. */}
        {compressed && (
          <p className="text-xs text-muted-foreground">
            Compressed plan — your target date is sooner than the ideal build
            for this distance, so interval work is trimmed and the long-run
            progression shortened to keep it safe.
          </p>
        )}
      </div>
    </>
  );
}
