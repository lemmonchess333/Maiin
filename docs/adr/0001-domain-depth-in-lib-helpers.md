# 0001 — Domain depth lives in `src/lib/` helpers, not in hook surface area

A 2026-05-28 architecture audit (via `/improve-codebase-architecture`) initially flagged five candidates as "shallow modules": `useEffectiveTargets` (360 LOC hook), `useClaimMap`, `getRunHeroState`, the `UserProfile` intersection type, and `runStatsEligibility`. Stress-testing each one against the actual import graph showed all five are already deep — the depth lives in named `src/lib/` modules that the hook/component layer composes. The audit produced no architectural deepening work; the only finding was a 4-line drift in `useHomeData` (workout-burn sum duplicated against `useEffectiveTargets.actualLiftBurn`).

We're recording the **pattern that earned the depth** so the next audit doesn't re-investigate:

- **Pure domain rules live in `src/lib/*` modules with one concern per file.** Examples: `effectiveTargets.ts` (max-of-strategy-vs-reality math), `runStatsEligibility.ts` (three sibling eligibility predicates with intentional policy divergence documented at the top), `runHeroState.ts` (the operational-slot discriminator, with explicit out-of-scope disclaimers in the docstring), `subscription.ts` (the `resolveSubscription` pure function).
- **Hooks compose those modules** plus Firestore subscription + windowing + memoisation. They are deep by virtue of hiding the subscription lifecycle from callers, not by inlining domain logic. The pure logic remains independently importable + testable.
- **Components consume the hooks** and don't re-derive. When they do, that's a real friction signal — but it's the exception, not the rule.

**Heuristic for future audits**: before flagging a hook or component as shallow, follow its imports. If the domain logic it appears to own actually lives in a `src/lib/*` module with named exports + tests, the seam is already in the right place. File size is not a depth signal in this codebase — the orchestration layer (hooks composing 4–5 lib helpers + subscription) is intentionally fatter than the pure-math layer.

**Implication for new code**: when adding domain logic, default to a new (or extended) `src/lib/*` module with pure functions + colocated `__tests__/`. Only let logic live in a hook when it genuinely requires React state, subscriptions, or refs. This keeps the architecture pattern uniform and makes future audits return "already deep" again, fast.
