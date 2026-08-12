/**
 * Whether the user's daily calorie target is engine-ADAPTED, a MANUAL override,
 * or the plain FORMULA estimate (D6 — surface engine-adapted vs user-set).
 *
 * Pure + deterministic (`now` injected). Reads only fields that already exist on
 * the profile — no engine re-run. The "adapting" detection mirrors the adaptive-
 * TDEE engine's own marker: a real (non-epoch) `adaptiveCapState.lastAppliedAt`
 * means the learned target has been applied at least once. A manual
 * `customCalorieTarget` always wins (the user pinned it).
 */
const EPOCH = "1970-01-01T00:00:00.000Z";

export type AdaptiveCalorieStatus =
  | { kind: "adapting"; retunedDaysAgo: number }
  | { kind: "manual" }
  | { kind: "formula" };

interface AdaptiveStatusProfile {
  customCalorieTarget?: number | null;
  adaptiveCapState?: { lastAppliedAt?: string | null } | null;
}

export function adaptiveCalorieStatus(
  profile: AdaptiveStatusProfile | null | undefined,
  now: number = Date.now()
): AdaptiveCalorieStatus {
  if (profile?.customCalorieTarget) return { kind: "manual" };
  const at = profile?.adaptiveCapState?.lastAppliedAt;
  if (typeof at === "string" && at !== EPOCH) {
    const parsed = Date.parse(at);
    if (Number.isFinite(parsed)) {
      const retunedDaysAgo = Math.max(
        0,
        Math.floor((now - parsed) / 86_400_000)
      );
      return { kind: "adapting", retunedDaysAgo };
    }
  }
  return { kind: "formula" };
}

/**
 * One-line human label for the status.
 *
 * `appliedTarget` is the LEARNED value (`adaptiveCapState.lastApplied`) — the
 * number Home and Food actually show. Pass it wherever the label sits beneath
 * a FORMULA figure, which is the case on Settings → Nutrition: that screen is
 * the plan editor, so the calories and the macro split beside them are both
 * the pre-adaptive baseline, deliberately.
 *
 * Without it the "adapting" copy read "Adapting — retuned 3d ago from your
 * real intake + weight" directly under 2500 while every other surface showed
 * 2919. The line asserted the number above it was the adapted one; it never
 * was. Naming both is the honest fix and leaves the editor's own figures
 * internally consistent — swapping the headline to the learned value would
 * strand the macro row, which is split at the baseline.
 *
 * Omitted (or non-finite), the copy stays as it was, so callers that already
 * render the learned number are unaffected.
 */
export function adaptiveCalorieStatusLabel(
  s: AdaptiveCalorieStatus,
  appliedTarget?: number | null
): string {
  switch (s.kind) {
    case "manual":
      return "Manual target — you set this; adaptive learning is paused.";
    case "adapting": {
      const when =
        s.retunedDaysAgo === 0 ? "today" : `${s.retunedDaysAgo}d ago`;
      const base = `Adapting — retuned ${when} from your real intake + weight.`;
      return typeof appliedTarget === "number" && Number.isFinite(appliedTarget)
        ? `${base} This is your baseline; today's target is ${Math.round(
            appliedTarget
          ).toLocaleString()} cal.`
        : base;
    }
    case "formula":
      return "Formula estimate — adapts to your real expenditure once you track for a while.";
  }
}
