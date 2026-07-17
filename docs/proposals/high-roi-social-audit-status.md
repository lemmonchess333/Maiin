# High-ROI Programme/Body/Social audit — verification status

**Source:** operator packet `high-roi-programme-body-composition-social-audit.md`
(2026-07-10 audit + a ledger of items "implemented locally, pending
commit" dated up to 2026-07-17). **Verified against `main` 2026-07-16.**

Same failure mode as the Form-rig packets: the audit's _product
analysis_ is sound, but its _implementation ledger_ describes an
uncommitted worktree that never reached this repo. Treat the design
content as a backlog and the status content as void.

## Verified ON main (do not rebuild)

| Audit item                           | Evidence on main                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GOALS-CORE-01 (Circles/goalSpaces)   | `src/features/goalSpace/*`, `functions/lib/goalSpaceMembership.js`, rules + deletion inventory                                           |
| PROGRAM-BLOCK-01 (Training Blocks)   | `users/{uid}/trainingBlocks` in PROTECTED_PATHS, `useTrainingBlock.ts`, TrainingBlockCard                                                |
| PROGRAM-FLEX-01 (Express Sessions)   | `src/features/program/expressSession.ts`                                                                                                 |
| CHECKIN-01 (Momentum Check-in)       | `src/components/review/MomentumCheckinCard.tsx`, `users/{uid}/checkins/{weekKey}`                                                        |
| BODY-VAULT-00/01 (Progress Vault)    | `users/{uid}/progressCheckins`, vault links                                                                                              |
| NUTR-CONSISTENCY-01                  | `users/{uid}/nutritionCommitments/{weekKey}`                                                                                             |
| ROUTINE-EXCHANGE-01 foundation       | `savedRoutines.ts` blueprint/weight-redaction contract, `routine_shared` event kind                                                      |
| LIFT-01 (draft identity)             | `useWorkoutDraft.ts` identity/fingerprint scope                                                                                          |
| PROGRAM-SESSION-ORDER-01 **backend** | `nextWorkoutOverride` field + `setNextWorkout` writer + reducer command + sanitizer allowlist — **UI was never wired; wired in this PR** |

## Orphaned (claimed local, NOT on main) — ranked backlog

| Rank     | Item                                                                          | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shipped  | PROGRAM-SESSION-ORDER-01 UI ("Make This Next" / "Follow Programme Order")     | Closed by this PR — pure wiring onto the existing tested writer.                                                                                                                                                                                                                                                                                                                                                                                               |
| 1        | SOCIAL-CIRCLE-DEFAULT-01                                                      | Small client routing fix: sparse account with an active Circle should default to Circles, not Find.                                                                                                                                                                                                                                                                                                                                                            |
| 2        | CIRCLE-INVITE-ACTIVATION-01 (+ its CIRCLE-PULSE-01 dependency)                | Client-only activation loop for one-person Circles.                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3        | RACE-EVENT-IDENTITY-01 (optional race name)                                   | Nested `raceGoal` metadata + sanitizer; nice identity win.                                                                                                                                                                                                                                                                                                                                                                                                     |
| 4        | RACE/BLOCK "Train together" handoffs + CIRCLE-CONTEXT-01 + the two link items | Circle-creation prefill wave; client + light callable reuse.                                                                                                                                                                                                                                                                                                                                                                                                   |
| shipped  | SOCIAL-FOCUS-01 (Circle Weekly Focus — operator handout 2026-07-17)           | Server-owned weekly check-in (`goalSpaceWeeklyCheckIn`, deterministic `${uid}_${weekKey}` event) + optional closed-enum `weeklyFocus` + `backGoalSpaceCheckIn` response loop with the generic `circle_focus_backed` notification. Delivers the SUPPORT-ACK-class acknowledgement mechanic (rank 6) scoped to focus check-ins; rank 6's remaining items (target lifecycle, activity notifications) stay open. The GsPb1 plan-file row carries the STATUS entry. |
| 5        | CIRCLE-SESSION-01 / CIRCLE-RUN-SESSION-01                                     | Explicit summary-only share after planned sessions.                                                                                                                                                                                                                                                                                                                                                                                                            |
| 6        | CIRCLE-TARGET-LIFECYCLE/CONTINUATION, SUPPORT-ACK, ACTIVITY-NOTIFICATIONS     | Functions work — **hold until the #1636 deploy pipeline is fixed**; merging more undeployable functions code widens the stranded window.                                                                                                                                                                                                                                                                                                                       |
| deferred | ROUTE-PLANNING-01 (Mapbox `planRunningRoute`)                                 | **Operator decision required first**: the audit picked Mapbox, but CLAUDE.md's cost model locked ORS (free tier + straight-line fallback + self-host path). Also adds a new bound secret (`MAPBOX_DIRECTIONS_TOKEN`) — the exact failure class that stranded deploys (#1636). Do not add any new bound secret until the pipeline is green and the provider decision is made.                                                                                   |

## Operator decisions queued

1. **Routing provider: ORS (per CLAUDE.md cost model) vs Mapbox (per this
   audit).** Conflicting locked-ish positions — needs an explicit call
   before any route-planning callable is built.
2. Circle-wave sequencing: confirm the rank above or reorder.
3. The audit's "Founder Decisions" table (naming, templates, entitlement,
   moderation) remains open where not already superseded by shipped work.
