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

/** One-line human label for the status. */
export function adaptiveCalorieStatusLabel(s: AdaptiveCalorieStatus): string {
  switch (s.kind) {
    case "manual":
      return "Manual target — you set this; adaptive learning is paused.";
    case "adapting":
      return s.retunedDaysAgo === 0
        ? "Adapting — retuned today from your real intake + weight."
        : `Adapting — retuned ${s.retunedDaysAgo}d ago from your real intake + weight.`;
    case "formula":
      return "Formula estimate — adapts to your real expenditure once you track for a while.";
  }
}
