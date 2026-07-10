/**
 * Adjust-this-week — the "take it easier" planner (Run13 lock, RUN-02).
 *
 * Pure: computes the per-day template swaps the AdjustWeekSheet previews and
 * applies. Deliberately a THIN composition over the existing per-day override
 * writer — zero new scheduler math (the lock's core constraint):
 *
 *   - only THIS week's remaining days move (programState.runDays is the
 *     current week; past days keep their history)
 *   - only still-PLANNED days move (completed / skipped / missed / race
 *     outcomes are terminal facts, not adjustable prescriptions)
 *   - only QUALITY sessions ease (tempo / intervals / long → easy_30, the
 *     same template the recovery week emits); easy days are already easy and
 *     RACE DAY IS NEVER TOUCHED
 *
 * The race date, plan weeks, and every other runDay field stay put — the
 * apply step routes each swap through overrideRunDay ("changes this day
 * only"), so next week regenerates from the plan as normal.
 */
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  getScheduledRunStatus,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";
import type { ScheduledRunDay } from "@/features/program/programTypes";

/** The eased target — one convention, shared with the recovery week. */
export const EASY_TEMPLATE_ID = "easy_30";

const QUALITY_TYPES = new Set<string>(["tempo", "intervals", "long"]);

export interface EasySwap {
  /** overrideRunDay key — the stable runDay id when present, else dayIndex. */
  key: string | number;
  /** Local "YYYY-MM-DD" when the day carries one (drives the preview label). */
  date?: string;
  fromTemplateId: string;
  fromName: string;
  toTemplateId: string;
  toName: string;
}

export function planEasierWeek(
  runDays: ScheduledRunDay[],
  todayKey: string
): EasySwap[] {
  const easyName =
    RUN_TEMPLATES.find((t) => t.id === EASY_TEMPLATE_ID)?.name ?? "Easy 30";
  const swaps: EasySwap[] = [];
  for (const rd of runDays) {
    // Terminal / completed / skipped days are facts, not prescriptions.
    if (!isScheduledRunStartable(getScheduledRunStatus(rd))) continue;
    // Past days keep their history (missed handling is the server's job).
    if (rd.date && rd.date < todayKey) continue;
    const resolvedId = rd.userOverride ?? rd.templateId;
    const tpl = RUN_TEMPLATES.find((t) => t.id === resolvedId);
    // Type-based gate (never id string matching — race ids are `5k_race` etc):
    // quality eases; easy stays; race day is NEVER swapped.
    if (!tpl || !QUALITY_TYPES.has(tpl.type)) continue;
    swaps.push({
      key: rd.id ?? rd.dayIndex,
      date: rd.date,
      fromTemplateId: tpl.id,
      fromName: tpl.name,
      toTemplateId: EASY_TEMPLATE_ID,
      toName: easyName,
    });
  }
  return swaps;
}
