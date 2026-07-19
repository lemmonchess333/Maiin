# Home / Daily-Coaching / Programme-Adaptation audit — verification status

**Source:** operator upload `20260717homecoachingaudit.md` (2545 lines,
"verified against `main` at `ed22a618`"). **Re-verified against `main`
2026-07-18** (three parallel agents, one per cluster).

## Trust verdict: the implementation ledger is VOID

Same failure mode as the Form-rig and social-audit packets. The audit's
_product analysis_ is strong, but its **25 "implemented locally / N,000
tests passing" checkpoints describe an uncommitted worktree that never
reached this repo**. Every checkpoint literally says "No commit or push
was made," and the header admits the local checkout was "dirty and
behind main."

Confirmed absent on `main`: `src/lib/todayDecision.ts`,
`src/components/home/TodayPlanCard.tsx`, `resolveTodayDecision`,
`resolveEasierLiftSessionOffer`, `restoreWorkoutDay` / `restoreRunDay`,
`moveRunDay`, `sourceUid`, `resume=1`. Home still renders the legacy
`StackedCTACards`.

**Treat the design content as a backlog and every status/verification
claim as void.** Where the audit says "shipped," it usually shipped as a
_different design_ (see below) — its implementation details are not a
spec for main.

## Already shipped this session — do NOT rebuild

| Audit finding               | Shipped as                                                                 |
| --------------------------- | -------------------------------------------------------------------------- |
| CIRCLE-PULSE-01             | SOCIAL-FOCUS-01 — server-owned weekly check-in + closed `weeklyFocus` enum |
| CIRCLE-RESPONSE-01          | `backGoalSpaceCheckIn` — bounded anonymous supporter backing loop          |
| EASIER-TODAY-01 (lift half) | PROGRAM-ADAPT-01 (#1648) — Express-30 easier lift session                  |

## Needs a design decision before code (conflicts with a shipped lock)

- **CIRCLE-WEEK-01 / CIRCLE-COMMITMENT-01** — the audit's per-member
  "week board" + status/target design conflicts with the SOCIAL-FOCUS-01
  lock ("counts, not rankings"; closed focus enum). Only the week
  roll-off read gap (early check-ins aging out of the `limit(30)` feed)
  is uncontroversial.

## Genuinely open work — three tracks

### Track A — small trust/correctness fixes (recommended first)

Each ~1 PR, low risk, no Functions, no design calls. Several fix bugs
live on `main` today.

| Finding            | State on main | Bug it fixes                                                                                               | Size |
| ------------------ | ------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| RUN-RACE-GUARD-01  | OPEN          | Race can be overridden to easy + manual-completed → race identity erased                                   | S    |
| HOME-MEALS-01      | OPEN          | Home totals include soft-deleted meals → Home/Food diverge after delete                                    | S    |
| HOME-TARGET-01     | PARTIAL       | Hardcoded "+300/−500" chip; breakdown uses `targetCalories` not `finalTarget`; "protein for recovery" copy | S    |
| REVIEW-ROUTE-01    | PARTIAL       | Every Weekly-Review focus routes to `/program` (food/weigh-in go to the wrong area)                        | S    |
| HOME-ACTION-01     | OPEN          | "Done"/terminal sessions still launchable; lift CTA routes bare `/program` not `?day=N`                    | S    |
| HYBRID-GUIDANCE-01 | PARTIAL       | Claims "Fresh legs today." with zero logged data; field name `readiness`→`tone`                            | S    |

### Track B — account-isolation hardening (shared-browser privacy)

Build two shared helpers once (a `{uid, generation}` ownership token +
`socialPreferenceKey(uid, family)`; precedents: `pushNotifications.ts`,
`useRunningStats` account-switch test), then apply. Genuinely
pre-launch-valuable.

Order: `SOCIAL-CREW-READS-01` (S) + `SOCIAL-RECAP-READS-01` (S/M, read
cost) → `CIRCLE-INDEX-TRUST-01` (S, half-guarded already) →
`NOTIFICATION-TRUST-01` (M) → `SOCIAL-ATTENTION-01` (M/L, swaps the badge
query to `feeds/{uid}/items`) → `SOCIAL-PRIVACY-01` (L, biggest blast
radius) → `HOME-ACCOUNT-01` (M, uid-remount root boundary; shares the
`sourceUid` contract with HOME-DATA-01).

### Track C — Programme + "Today's Plan" wave (the audit's headline bet)

Session quick wins first: `SESSION-RESTORE-01` (S, real dead end) →
`RUN-RESCHEDULE-01` (M) → `BLOCK-CONTINUITY-01` (S/M, Continue-prefill) →
`SESSION-DATA-01` (S/M, drop duplicate in-session queries). Engine work:
`PROGRESSION-TRUST-01` (M, apply progression once on Save) →
`LIFT-EFFORT-01` (M, optional private post-lift effort). Product wave:
`SESSION-RESUME-01` → `HOME-COACH-01` (`todayDecision` engine +
`TodayPlanCard`) → `HOME-IA-01` (action-first reorder) → **`HOME-DATA-01`
/ `CLAIM-MAP-01`** (keystone read-graph consolidation, L, high-risk).
`COACH-TRUTH-01` (truthful performance copy + server mirror, M) runs in
parallel.

### Dependencies worth respecting

- Do RUN-RACE-GUARD-01 **before** SESSION-RESTORE-01 / RUN-RESCHEDULE-01
  — the guard hardens the exact writers (`overrideRunDay`,
  `markManualComplete`) those extend.
- HOME-DATA-01 is the keystone; ship the cheap Home truth fixes
  (MEALS/TARGET) first, then the read-graph PR _deletes_ the duplicate
  query rather than fixing it twice.
- PROGRESSION-TRUST → SESSION-DATA → LIFT-EFFORT touch the same
  `WorkoutSession` completion path; sequence them to avoid three
  overlapping rewrites.
- HOME-ACTION-01 semantics + SESSION-RESUME-01 summary feed HOME-COACH-01;
  the IA reorder is trivial _after_ TodayPlanCard exists (reordering the
  legacy stack first is throwaway).

## Recommendation

Start with **Track A** (six small independent PRs, several fixing live
bugs) — highest value-per-effort and exactly the "correct misleading /
unsafe actions first" the audit's own executive decision prioritises.
Then Track B (privacy hardening), with Track C's "Today's Plan" wave as
the deliberate big bet once the cheap wins are banked.

## Verification method (for future reference)

This status was produced by three parallel agents, each verifying a
cluster's findings against real `main` (never the doc's status claims):
Home+coaching, account-isolation+social, Circles+programme. Re-run the
same "verify against main, ignore the ledger" method if the audit is
revised.

## Session outcome — 2026-07-19 (execution status)

Tracks A + B were executed in full, plus the two Programme Track-C
dead-ends. Every item shipped as its own PR (tsc + eslint + madge +
focused tests green; device/web QA left as unchecked boxes in each PR
body for on-device verification).

**Shipped (merged to main):**

- **Track A (trust/correctness):** RUN-RACE-GUARD-01, HOME-MEALS-01,
  REVIEW-ROUTE-01, HOME-TARGET-01, HYBRID-GUIDANCE-01, HOME-ACTION-01.
- **Track B (account-isolation):** SOCIAL-CREW-READS-01,
  SOCIAL-RECAP-READS-01, CIRCLE-INDEX-TRUST-01, NOTIFICATION-TRUST-01,
  SOCIAL-ATTENTION-01 (new `src/lib/socialPreferenceKeys.ts`),
  HOME-ACCOUNT-01 (new `src/components/AuthSessionBoundary.tsx`),
  SOCIAL-PRIVACY-01 (`useBlockedUsers.ready` + feed uid/generation
  ownership).
- **Track C (Programme dead-ends):** SESSION-RESTORE-01 (`restoreRunDay`
  / `restoreWorkoutDay` + DayActionSheet "Restore to plan");
  RUN-RESCHEDULE-01 (new `src/lib/runReschedule.ts` + `moveRunDay` +
  DayActionSheet 7-day move picker).

**Deliberately NOT built — decision locked 2026-07-19:**

- **HOME-COACH-01 / TodayPlanCard** (the audit's "headline bet"). After
  Track A/C, Home's "today" surface is already complete: the Lift/Run CTA
  cards answer "what do I do" (terminal-aware + day-deep-linked via
  HOME-ACTION-01, reschedule/restore in the day sheet), `TodayGuidanceCard`
  gives the honest coaching line (HYBRID-GUIDANCE-01), `TodayEnergy` gives
  the truthful target (HOME-TARGET-01), and MomentumCheckin + InsightStrip
  cover "on track this week?". A new `todayDecision` engine + coach card
  re-consolidating those same signals reads as clutter, not clarity —
  against the "breathing room over density" / "progressive disclosure"
  principles, and the audit ledger for it was void anyway. Do not build it
  without an explicit, documented product reason that these existing pieces
  don't already cover.

**Genuinely open (all optional; none a new surface):**

- **SESSION-DATA-01 / HOME-DATA-01 / CLAIM-MAP-01** — read-graph tidy (drop
  a duplicate in-session query; keystone claim-map consolidation). Invisible
  perf/plumbing, not UX. The keystone is L / high-risk; ship only if Home
  read-cost is worth a careful refactor.
- **PROGRESSION-TRUST-01, LIFT-EFFORT-01** — lift-session correctness (apply
  progression once on Save; optional private post-lift effort). On the lift
  path, not Home. Sequence them together — they touch the same
  `WorkoutSession` completion path.
- **PERFORMANCE-TRUST-02** — IA nudge only (move the Performance hero below
  the daily actions; don't use PI for a "today" decision). Small reorder,
  no engine.
- **SESSION-RESUME-01, BLOCK-CONTINUITY-01** — session quick-wins from the
  audit's Track-C prelude; low risk if picked up, but not blocking.

Verdict: the high-value audit work (real trust bugs, shared-browser
isolation gaps, Programme dead-ends) is done. The remainder is optional
plumbing / lift-path correctness / IA polish.
