/**
 * Nutrition consistency commitments (NUTR-CONSISTENCY-01) — pure model.
 *
 * The right social object for food is NOT a calorie score — it's a
 * voluntary, privacy-preserving consistency signal. A member sets one
 * small weekly logging intent; progress derives from meal-day dates
 * the app already owns; and the ONLY thing a Circle can ever receive
 * is an opt-in constant-status line — never calories, macros, meals,
 * deficits, counts or bodyweight (pinned in tests; the Goal Space
 * event fence + rules field allowlist enforce it structurally too).
 *
 * Storage: users/{uid}/nutritionCommitments/{weekKey} — owner-only,
 * keyed by the CURRENT week (idempotent by construction, same posture
 * as Momentum Check-ins). Missing a target yields a calm line, never
 * a punitive state.
 */

import { inWeek } from "@/lib/weeklyReviewViewModel";

export type NutritionIntent = "log_3_days" | "log_5_days" | "log_daily";

export const INTENT_OPTIONS: Array<{
  value: NutritionIntent;
  label: string;
}> = [
  { value: "log_3_days", label: "Log food on 3 days" },
  { value: "log_5_days", label: "Log food on 5 days" },
  { value: "log_daily", label: "Log something every day" },
];

export function targetDaysFor(intent: NutritionIntent): number {
  switch (intent) {
    case "log_3_days":
      return 3;
    case "log_5_days":
      return 5;
    case "log_daily":
      return 7;
  }
}

export interface NutritionCommitment {
  /** Current week key (Monday-anchored YYYY-MM-DD) — also the doc id. */
  weekKey: string;
  intent: NutritionIntent;
  /** Set once the met-status has been shared to a Circle, so the
   *  share is one-shot (no spam on re-render). */
  sharedMet?: boolean;
  createdAt: number;
}

export interface NutritionProgress {
  target: number;
  /** Distinct in-week days with at least one logged meal. Deleted
   *  meals simply stop contributing — no special casing. */
  done: number;
  met: boolean;
  /** Calm status line — supportive at every stage, never shaming. */
  line: string;
}

export function deriveProgress(
  intent: NutritionIntent,
  mealDates: string[],
  weekKey: string
): NutritionProgress {
  const target = targetDaysFor(intent);
  const done = new Set(mealDates.filter((d) => inWeek(d, weekKey))).size;
  const met = done >= target;
  const line = met
    ? "Commitment met — that's the habit working."
    : done === 0
      ? "The week's open — one logged meal starts it."
      : `${target - done} more ${target - done === 1 ? "day" : "days"} to go. No rush.`;
  return { target, done: Math.min(done, target), met, line };
}

/** The ONLY text a Circle may receive for nutrition — constant,
 *  number-free, meal-free. */
export const SHARED_MET_TEXT = "Met my logging commitment this week";

export function commitmentDocPath(uid: string, weekKey: string): string {
  return `users/${uid}/nutritionCommitments/${weekKey}`;
}

/** Boundary guard for Firestore reads. */
export function parseCommitment(data: unknown): NutritionCommitment | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const intentValid =
    d.intent === "log_3_days" ||
    d.intent === "log_5_days" ||
    d.intent === "log_daily";
  if (
    typeof d.weekKey !== "string" ||
    !intentValid ||
    typeof d.createdAt !== "number"
  ) {
    return null;
  }
  return {
    weekKey: d.weekKey,
    intent: d.intent as NutritionIntent,
    ...(d.sharedMet === true ? { sharedMet: true } : {}),
    createdAt: d.createdAt,
  };
}
