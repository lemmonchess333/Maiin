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
