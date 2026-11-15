/**
 * What Pro did, read for the weekly review's month card (App1 Q56). The
 * rules are `src/lib/proReport.ts`'s; this reads the two things they need
 * from Firestore, once, when the review opens on a month's first Monday
 * for a Pro account: the month's meals (how each was logged) and the plan
 * (a race plan's week). A free account, and every other review, reads
 * nothing.
 */
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { isActiveMealDoc } from "@/lib/mealTotals";
import { logger } from "@/lib/logger";
import {
  proMonthFor,
  proRacePlan,
  proReportLines,
  type ProLine,
  type ProMonth,
  type ProPeriod,
  type ProRacePlan,
} from "@/lib/proReport";

/** The period's active meals, by day and by how each was logged. */
export async function fetchProPeriodMeals(
  uid: string,
  period: ProPeriod
): Promise<{ date: string; confidence: string }[]> {
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "meals"),
      where("date", ">=", period.start),
      where("date", "<=", period.end)
    )
  );
  const meals: { date: string; confidence: string }[] = [];
  for (const d of snap.docs) {
    const m = d.data() as Record<string, unknown>;
    if (!isActiveMealDoc(m) || typeof m.date !== "string") continue;
    meals.push({
      date: m.date,
      confidence: typeof m.confidence === "string" ? m.confidence : "",
    });
  }
  return meals;
}

/** The race plan Pro is building, from the stored plan. */
export async function fetchProRacePlan(
  uid: string,
  raceDistance: string | null | undefined
): Promise<ProRacePlan | null> {
  const snap = await getDoc(doc(db, "users", uid, "programState", "current"));
  if (!snap.exists()) return null;
  const runPlan = (
    snap.data() as { runPlan?: Parameters<typeof proRacePlan>[0] }
  ).runPlan;
  return proRacePlan(runPlan, raceDistance);
}

export interface ProMonthReport {
  month: ProMonth;
  /** Empty when Pro did nothing this month; the card says so. */
  lines: ProLine[];
}

/**
 * The month card for the review of `reviewedWeekKey`: null for a free
 * account, for a review that is not the month's first, and when the read
 * failed (the card is left out rather than shown with numbers missing).
 */
export function useProMonthReport(reviewedWeekKey: string): {
  loading: boolean;
  report: ProMonthReport | null;
} {
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();
  const uid = user?.uid ?? null;
  const month = isPro ? proMonthFor(reviewedWeekKey) : null;
  const monthKey = month?.start ?? null;
  const [state, setState] = useState<{
    key: string | null;
    report: ProMonthReport | null;
  }>({ key: null, report: null });
  const want = uid && monthKey ? `${uid}:${monthKey}` : null;

  useEffect(() => {
    if (!want || !uid || !month) return;
    let cancelled = false;
    (async () => {
      try {
        const [meals, racePlan] = await Promise.all([
          fetchProPeriodMeals(uid, month),
          fetchProRacePlan(uid, profile?.raceGoal?.distance),
        ]);
        if (cancelled) return;
        setState({
          key: want,
          report: {
            month,
            lines: proReportLines({
              ...month,
              changes: profile?.proChanges,
              meals,
              racePlan,
            }),
          },
        });
      } catch (err) {
        logger.warn("[useProMonthReport] read failed", err);
        if (!cancelled) setState({ key: want, report: null });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The profile is read as the card opens; its identity churns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  if (!want) return { loading: false, report: null };
  const ready = state.key === want;
  return { loading: !ready, report: ready ? state.report : null };
}
