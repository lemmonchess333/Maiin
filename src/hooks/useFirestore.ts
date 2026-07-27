/* Barrel only — no Firestore access of its own.
 *
 * `useDailyLogs`, `useWeeklyStats`, `useMonthlyStats` and `useWeeklyDayMap`
 * used to live here, each owning its own `onSnapshot(users/{uid}/logs, ...)`.
 * They collapsed into a single subscription behind <DailyLogsProvider>;
 * re-exporting from this barrel keeps every existing call site
 * (`import { ... } from "@/hooks/useFirestore"`) working untouched.
 *
 * A `useHistoryData` also lived here — a one-shot getDocs of the last N
 * days "for the History page". The History page never called it, and
 * nothing else did either; it was removed 2026-07-27 when the reachability
 * gate started scanning src/hooks. That deletion is why this file no longer
 * imports the Firestore SDK, which in turn is why it dropped out of the
 * Firestore-hook coverage gate and off its EXEMPT list — the `@untested:`
 * marker it carried was describing a gap that only existed because of the
 * dead export.
 */

/* DailyLog's canonical home is DailyLogsProvider.tsx (the module that
   owns the subscription) — re-exported here for existing importers.
   Audit batch 3: the provider imported this type while this file
   re-exports the provider's hooks, a two-file cycle. */
export type { DailyLog } from "@/hooks/DailyLogsProvider";

export {
  useDailyLogs,
  useWeeklyStats,
  useMonthlyStats,
  useWeeklyDayMap,
} from "@/hooks/DailyLogsProvider";
