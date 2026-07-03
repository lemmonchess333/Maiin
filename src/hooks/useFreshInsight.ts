import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { localDateString } from "@/lib/dateHelpers";
import {
  selectFreshInsight,
  recordInsightShown,
  pruneLedger,
  type InsightLedger,
} from "@/lib/insightFreshness";
import { logger } from "@/lib/logger";

function storageKey(uid: string): string {
  return `tropos.insight.ledger:${uid}`;
}

function readLedger(uid: string): InsightLedger {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as InsightLedger;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Freshness-gated insight selection (see src/lib/insightFreshness.ts for
 * the rotation/cooldown policy). Give it the caller's priority-ordered
 * candidate list; it returns the one to show today — or null when
 * everything has been said recently enough (silence beats nagging).
 * Marks the shown insight in the uid-scoped device ledger once per day.
 */
export function useFreshInsight<T extends { id: string }>(
  insights: T[]
): T | null {
  const { user } = useAuth();
  const todayKey = localDateString();
  // Ledger read once per (uid, day) — the same-day record write is
  // idempotent, so a stale in-memory copy can't inflate streaks.
  const [ledger, setLedger] = useState<InsightLedger | null>(null);

  useEffect(() => {
    if (!user) return;
    setLedger(readLedger(user.uid));
  }, [user, todayKey]);

  const selected = useMemo(() => {
    if (!user || ledger === null) return null;
    return selectFreshInsight(insights, ledger, todayKey);
  }, [user, ledger, insights, todayKey]);

  useEffect(() => {
    if (!user || !selected || ledger === null) return;
    const next = pruneLedger(
      recordInsightShown(ledger, selected.id, todayKey),
      todayKey
    );
    if (next === ledger) return;
    try {
      localStorage.setItem(storageKey(user.uid), JSON.stringify(next));
    } catch (err) {
      logger.warn("[useFreshInsight] ledger persist failed", err);
    }
    setLedger(next);
  }, [user, selected, ledger, todayKey]);

  return selected;
}
