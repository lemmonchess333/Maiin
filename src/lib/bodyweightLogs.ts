import {
  splitMacrosForTarget,
  proteinMultiplierForGoal,
  type FitnessGoal,
} from "./tdee";

export interface BodyweightLog {
  date: string;
  weight: number;
}

// Bounded read window shared by every bodyweightLogs consumer. Deliberately
// larger than every current calculation window (Home trend caps at 30, the
// adaptive-TDEE engine reads its own bounded window) so a duplicate-heavy day
// can't crowd distinct days out of the query before the collapse runs.
export const BODYWEIGHT_READ_LIMIT = 400;

export interface RawBodyweightLog {
  id: string;
  date: unknown;
  weight: unknown;
  source?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function timestampMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: unknown; toDate?: unknown };
    if (typeof candidate.toMillis === "function") {
      const millis = (candidate.toMillis as () => number)();
      return Number.isFinite(millis) ? millis : 0;
    }
    if (typeof candidate.toDate === "function") {
      const date = (candidate.toDate as () => Date)();
      return date instanceof Date && Number.isFinite(date.getTime())
        ? date.getTime()
        : 0;
    }
  }
  return 0;
}

function isPreferred(
  next: RawBodyweightLog,
  current: RawBodyweightLog
): boolean {
  // Historical Tropos rows have no source and were all manual. Treat every
  // non-HealthKit row as manual so an imported sample can never replace an
  // existing manual value for the same local day.
  const nextIsManual = next.source !== "healthkit";
  const currentIsManual = current.source !== "healthkit";
  if (nextIsManual !== currentIsManual) return nextIsManual;

  const nextIsDateKeyed = next.id === next.date;
  const currentIsDateKeyed = current.id === current.date;
  if (nextIsDateKeyed !== currentIsDateKeyed) return nextIsDateKeyed;

  const nextTimestamp = Math.max(
    timestampMillis(next.updatedAt),
    timestampMillis(next.createdAt)
  );
  const currentTimestamp = Math.max(
    timestampMillis(current.updatedAt),
    timestampMillis(current.createdAt)
  );
  if (nextTimestamp !== currentTimestamp) {
    return nextTimestamp > currentTimestamp;
  }

  return next.id > current.id;
}

/**
 * Collapse Firestore rows to one trustworthy observation per local day.
 * Precedence: manual over HealthKit, date-keyed over legacy auto-id, newest
 * timestamp, then stable id tie-break. Invalid rows are dropped at the read
 * boundary so trend engines never receive malformed points.
 *
 * The historical write path appended a fresh random-id doc per weigh-in, so
 * a single day could carry several rows. Only TrendWeight deduped (for
 * display); the adaptive-TDEE engine and the Home trend counted every row as
 * an independent observation — tripping the warm-up gate early and biasing
 * the least-squares slope. This collapse gives every calculation consumer the
 * same one-row-per-day guarantee the new date-keyed upsert enforces going
 * forward.
 */
export function collapseBodyweightLogs(
  rows: RawBodyweightLog[]
): BodyweightLog[] {
  const byDate = new Map<string, RawBodyweightLog>();

  for (const row of rows) {
    if (!isValidDateKey(row.date)) continue;
    if (
      typeof row.weight !== "number" ||
      !Number.isFinite(row.weight) ||
      row.weight <= 0
    ) {
      continue;
    }

    const current = byDate.get(row.date);
    if (!current || isPreferred(row, current)) byDate.set(row.date, row);
  }

  return [...byDate.values()]
    .map((row) => ({ date: row.date as string, weight: row.weight as number }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * The profile patch a fresh weigh-in should carry, or null for no write.
 *
 * `profile.weightKg` is the anchor every nutrition consumer reads —
 * `calculateTDEE`'s BMR, `getAdjustedTargets`' protein/fat scaling, and
 * `resolveGoalWeightPlan`'s direction — and until 2026-08-05 its ONLY
 * writer was the Settings → Profile edit. The advertised daily flow
 * ("Log daily weight from Home") wrote `bodyweightLogs` and left the
 * profile scalar to go stale for months. Probe-measured on a 90 → 78 kg
 * cut with daily weigh-ins: +26 g/day protein and a 186 kcal/day target
 * overshoot, both anchored to the 90 that no longer existed — and the
 * goal-crossed direction check read "lose" against the same stale 90
 * even after the user passed their goal. This is CLAUDE.md's
 * persist-every-mirrored-field rule: the consumers read a different
 * location from the one the write path updated.
 *
 * Sub-0.05 kg deltas return null — re-logging the same weight should not
 * burn a profile write. One decimal, matching what the profile edit
 * surface displays. ADR-0007's point-in-time hold is untouched: that is
 * about HISTORICAL budget recomputes; this keeps the forward-looking
 * anchor honest.
 */
export function weighInProfileMirror(
  prevProfileKg: number | null | undefined,
  loggedKg: number
): { weightKg: number } | null {
  if (!Number.isFinite(loggedKg) || loggedKg <= 0) return null;
  const rounded = Math.round(loggedKg * 10) / 10;
  if (
    typeof prevProfileKg === "number" &&
    Math.abs(prevProfileKg - rounded) < 0.05
  ) {
    return null;
  }
  return { weightKg: rounded };
}

/** The profile slice the weigh-in patch reads. Structural, so tests and
 *  callers pass plain objects. */
export interface WeighInProfileInputs {
  weightKg?: number | null;
  targetCalories?: number | null;
  program?: { goal?: string };
}

export interface WeighInProfilePatch {
  weightKg: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
}

/**
 * The COMPLETE profile patch a fresh weigh-in should carry.
 *
 * `weighInProfileMirror` above fixed the anchor; this fixes what the anchor
 * feeds. Two of the three stored macros are functions of bodyweight —
 * protein is `multiplier × kg` outright, and the essential-fat floor is
 * `0.6 × kg`, with carbs balancing whatever those leave — so a weigh-in
 * changes them by definition. Nothing recomputed them: `targetProtein` is
 * written only by onboarding, the Settings → Nutrition reactive effect, and
 * the goal-reached prompt, none of which a weigh-in triggers. A user
 * following the advertised daily-weigh-in flow and never reopening Settings
 * kept the macros of the body they had at signup.
 *
 * Measured on a 90 → 78 kg cut with the calorie target held: stored protein
 * stays 198 g while the Food page shows 172 g — so Home's post-workout
 * "Ng protein for recovery" nudge, which reads the stored scalar, asks for
 * 26 g more than the Food page does on the same day. That disagreement is
 * the real defect; the adherence effect is milder, because the scorer's
 * protein rule is `ratio >= 0.9 → 100` and a 12 kg cut only reaches 0.87
 * (96 instead of 100). Reported at its true size rather than inflated —
 * but two screens quoting different targets needs no tolerance analysis to
 * be wrong.
 *
 * The CALORIE target is deliberately not recomputed. Protein and fat are
 * defined per kilogram, so following the weight is arithmetic; the calorie
 * target is a training decision (as you shrink, the same absolute intake is
 * a smaller deficit — the plateau the adaptive-TDEE layer exists to answer)
 * and silently re-cutting it on every weigh-in would be a policy change made
 * by a mirror function. The split is therefore recomputed AT the existing
 * target, which is exactly what `getAdjustedTargets` renders.
 *
 * Returns null on no meaningful weight change (delegating that gate) or when
 * the profile carries no calorie target to split.
 */
export function weighInProfilePatch(
  profile: WeighInProfileInputs | null | undefined,
  loggedKg: number
): WeighInProfilePatch | { weightKg: number } | null {
  const mirror = weighInProfileMirror(profile?.weightKg, loggedKg);
  if (!mirror) return null;

  const targetCalories = profile?.targetCalories;
  if (typeof targetCalories !== "number" || !Number.isFinite(targetCalories)) {
    // No stored target to split — the anchor still gets fixed, which is
    // strictly better than skipping the write entirely.
    return mirror;
  }

  const split = splitMacrosForTarget(
    targetCalories,
    mirror.weightKg,
    proteinMultiplierForGoal(
      (profile?.program?.goal as FitnessGoal) ?? "recomp"
    )
  );
  return {
    ...mirror,
    targetProtein: split.protein,
    targetCarbs: split.carbs,
    targetFat: split.fat,
  };
}
