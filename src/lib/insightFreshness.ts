/**
 * Insight freshness (quick-fix from the 2026-07 improvement audit).
 *
 * Problem: Home's insight slot always showed `insights[0]` — the
 * highest-priority insight from analyzeNutritionPatterns. The generator's
 * ids are stable and its inputs move on a slow 7-day window, so the same
 * insight ("Low protein intake") could squat the slot for WEEKS. Repetition
 * reads as nagging, and a nagging coach gets ignored — the opposite of the
 * calm-brand register.
 *
 * Rule: an insight id may hold the slot for at most MAX_CONSECUTIVE_DAYS
 * consecutive days; it then enters a COOLDOWN_DAYS cooldown during which
 * the next-freshest insight (by priority) takes over. If every candidate
 * is cooling down, the slot goes EMPTY — silence beats nagging, and the
 * surrounding card has other content.
 *
 * The ledger is a small device-local record (uid-scoped localStorage —
 * same class of nicety as the Weekly Review viewed state). Losing it just
 * means an insight can repeat once; nothing sync-worthy.
 */

export interface InsightLedgerEntry {
  /** Local "YYYY-MM-DD" the id last held the slot. */
  lastShown: string;
  /** Consecutive days (ending at lastShown) the id has held the slot. */
  consecutiveDays: number;
}

export type InsightLedger = Record<string, InsightLedgerEntry>;

export const MAX_CONSECUTIVE_DAYS = 2;
export const COOLDOWN_DAYS = 5;

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) /
      86_400_000
  );
}

/** Is this id cooling down as of `todayKey`? */
export function isCoolingDown(
  entry: InsightLedgerEntry | undefined,
  todayKey: string
): boolean {
  if (!entry) return false;
  if (entry.consecutiveDays < MAX_CONSECUTIVE_DAYS) return false;
  const since = daysBetween(entry.lastShown, todayKey);
  return since >= 0 && since < COOLDOWN_DAYS;
}

/**
 * Pick the freshest insight: first (highest-priority, as ordered by the
 * caller) candidate not in cooldown. Null when all are cooling down.
 */
export function selectFreshInsight<T extends { id: string }>(
  insights: T[],
  ledger: InsightLedger,
  todayKey: string
): T | null {
  for (const insight of insights) {
    if (!isCoolingDown(ledger[insight.id], todayKey)) return insight;
  }
  return null;
}

/**
 * Record that `id` held the slot on `todayKey`. Consecutive-day counting:
 * shown yesterday too → increment; any gap → reset to 1. Same-day repeat
 * calls are idempotent. Returns a NEW ledger (pure).
 */
export function recordInsightShown(
  ledger: InsightLedger,
  id: string,
  todayKey: string
): InsightLedger {
  const prev = ledger[id];
  if (prev?.lastShown === todayKey) return ledger;
  const consecutiveDays =
    prev && daysBetween(prev.lastShown, todayKey) === 1
      ? prev.consecutiveDays + 1
      : 1;
  return { ...ledger, [id]: { lastShown: todayKey, consecutiveDays } };
}

/** Drop entries stale beyond any behavioural relevance (ledger hygiene). */
export function pruneLedger(
  ledger: InsightLedger,
  todayKey: string
): InsightLedger {
  const keep: InsightLedger = {};
  for (const [id, entry] of Object.entries(ledger)) {
    if (daysBetween(entry.lastShown, todayKey) <= COOLDOWN_DAYS * 2) {
      keep[id] = entry;
    }
  }
  return keep;
}
