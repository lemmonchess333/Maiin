import { localDateString, parseLocalDate } from "./dateHelpers";
import { isVolumeEligible } from "./runStatsEligibility";

export interface RunExecutionTarget {
  unit: "seconds" | "metres";
  value: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isRunDateKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    localDateString(parseLocalDate(value)) === value
  );
}

/** The recorded start day owns history; old records fall back to completion. */
export function runEvidenceDate(run: {
  date?: string;
  completedAt: Date;
}): string {
  return isRunDateKey(run.date) ? run.date : localDateString(run.completedAt);
}

/** Read only the actual saved launch target. Never reconstruct an old
 * prescription from today's template or infer duration from average pace.
 * A customised/extra session is not evidence of falling short of a plan. */
export function readRunExecutionTarget(
  data: Record<string, unknown>
): RunExecutionTarget | null {
  const config = record(data.runConfig);
  if (
    !config ||
    data.planMode !== "race_prep" ||
    !["today_plan", "url_template"].includes(String(data.planSource)) ||
    data.matchedPlanExact !== true ||
    data.offPlan !== false ||
    typeof data.scheduledRunId !== "string" ||
    !data.scheduledRunId ||
    !["easy", "long", "tempo", "intervals"].includes(String(data.activityType))
  )
    return null;

  // Programme and Home use a URL to launch their exact planned template.
  // That is still planned work; matchedPlanExact/offPlan qualify the source.
  if (config.segments != null && !Array.isArray(config.segments)) return null;
  if (Array.isArray(config.segments) && config.segments.length > 0) {
    let seconds = 0;
    for (const segment of config.segments) {
      const target = record(record(segment)?.target);
      if (target?.kind !== "duration" || !positive(target.seconds)) return null;
      seconds += target.seconds;
    }
    return positive(seconds) ? { unit: "seconds", value: seconds } : null;
  }
  // Older interval configs may omit the canonical segments. Their target
  // alone cannot describe warm-up, rests and work; leave them unknown.
  if (config.intervals) return null;
  const target = record(config.target);
  if (!target || !positive(target.value)) return null;
  if (target.type === "time") return { unit: "seconds", value: target.value };
  if (target.type === "distance")
    return { unit: "metres", value: target.value };
  return null;
}

/** Coaching uses the same validity floor as volume, with finite values.
 * Missing measurements stay unknown even if a legacy rating is present. */
export function isRunCoachingEligible(run: {
  distance?: number;
  duration?: number;
  isInvalid?: boolean;
  savedAnyway?: boolean;
}): boolean {
  return (
    isVolumeEligible(run) &&
    Number.isFinite(run.distance) &&
    Number.isFinite(run.duration)
  );
}
