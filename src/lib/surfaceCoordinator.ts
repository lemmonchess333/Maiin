/**
 * Surface coordinator — pure core (#995).
 *
 * The problem: Home (and the globally-mounted StreakReminderPrimingModal)
 * accumulated four independently-triggered BLOCKING surfaces, each with its
 * own persistence store and no shared gate. On a returning user's visit they
 * could all mount at once; z-index was the only arbiter, so they stacked
 * (BadgeEarnedModal's z-[60] just painted over the rest). See
 * docs/adr/0004-surface-coordinator.md for the full taxonomy.
 *
 * This module is the pure decision logic — no React, no I/O — so the policy
 * (priority, per-open budget, suppression, defer-vs-drop) is unit-testable in
 * isolation. The React wiring (settle window, app-open boundary, render slot)
 * lives in SurfaceCoordinatorProvider; it delegates every decision here.
 *
 * v1 coordinates tier-4 (blocking modals/sheets) only. Tier 1 (ambient),
 * tier 2 (toasts) and tier 3 (inline education) are governed by simpler rules
 * documented in the ADR and are not routed through this core.
 */

export interface SurfaceRegistration {
  /** Stable id, e.g. "trial-expired", "fell-behind", "badge", "priming". */
  id: string;
  /** Higher wins. Trial 40 > FellBehind 30 > Badge 20 > Priming 10. */
  priority: number;
  /** Does this surface currently want to show (its own gate is satisfied)? */
  eligible: boolean;
  /**
   * Ids that, if also eligible THIS open, suppress this surface entirely —
   * even if this one outranks them. Encodes the emotional-sequencing rule:
   * the Badge celebration declares `suppressedBy: ["fell-behind"]` so a
   * "you earned a badge" moment never lands in the same visit as a
   * "you fell behind" reprimand.
   */
  suppressedBy?: string[];
  /**
   * Marks this surface as a CELEBRATION rather than a DECISION. When the
   * per-open budget is spent without this surface showing (it lost, or was
   * suppressed), a celebration is DROPPED (the provider calls the surface's
   * drop side-effect, e.g. dismissNewBadge) rather than DEFERRED — a stale
   * celebration shown a session late reads as a bug. Decisions omit this and
   * naturally re-register next open via their own persistence.
   */
  dropWhenMissed?: boolean;
}

export interface CoordinatorState {
  /** Ids shown OR consumed (dropped) this app-open, newest last. */
  consumed: string[];
  /** The id currently displayed, or null. */
  active: string | null;
  /** ≤1 blocking surface per app-open — true once one has been shown. */
  budgetSpent: boolean;
}

export function initialState(): CoordinatorState {
  return { consumed: [], active: null, budgetSpent: false };
}

/**
 * Among the registrations, the single id that should show next — highest
 * priority, eligible, not already consumed, not suppressed by an eligible
 * peer. Null if nothing qualifies.
 */
export function pickNext(
  regs: SurfaceRegistration[],
  consumed: string[]
): string | null {
  const eligibleIds = new Set(
    regs.filter((r) => r.eligible).map((r) => r.id)
  );
  const consumedSet = new Set(consumed);
  const candidates = regs
    .filter((r) => r.eligible && !consumedSet.has(r.id))
    .filter(
      (r) => !(r.suppressedBy ?? []).some((s) => eligibleIds.has(s))
    )
    .sort((a, b) => b.priority - a.priority);
  return candidates.length > 0 ? candidates[0].id : null;
}

/**
 * Eligible celebration ids that will NOT get to show this open and must be
 * dropped: budget is spent (or about to be), they're not the active surface,
 * they haven't been consumed, and they're flagged dropWhenMissed. Returned so
 * the provider can fire each one's drop side-effect exactly once.
 */
export function celebrationsToDrop(
  regs: SurfaceRegistration[],
  state: CoordinatorState
): string[] {
  return regs
    .filter(
      (r) =>
        r.eligible &&
        r.dropWhenMissed &&
        r.id !== state.active &&
        !state.consumed.includes(r.id)
    )
    .map((r) => r.id);
}

/**
 * Resolve the next active surface given the budget. If the budget is already
 * spent or something is active, nothing changes. Otherwise pick the winner
 * (if any) and spend the budget on it.
 */
export function resolve(
  regs: SurfaceRegistration[],
  state: CoordinatorState
): CoordinatorState {
  if (state.budgetSpent || state.active) return state;
  const next = pickNext(regs, state.consumed);
  if (!next) return state;
  return {
    consumed: [...state.consumed, next],
    active: next,
    budgetSpent: true,
  };
}

/** The active surface was dismissed. It stays consumed; budget stays spent. */
export function dismissActive(state: CoordinatorState): CoordinatorState {
  if (!state.active) return state;
  return { ...state, active: null };
}

/** A new app-open (mount or foreground after background) resets the budget. */
export function beginAppOpen(): CoordinatorState {
  return initialState();
}
