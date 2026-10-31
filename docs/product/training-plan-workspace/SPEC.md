# Tropos training-plan workspace

Status: implemented and verified locally. Authorised by the owner after reviewing the specification and prototype. Deployment is pending.

Requested by the owner on 28 October 2026, following the Mobbin comparison and training-plan mock. This specification resolves the mock against Tropos's existing scheduling rules. The prototype uses an illustrative account, not the owner's stored plan.

## 1. Job and scope

A person opens Train to understand the shape of their week, see their next lift, and move an eligible planned run after reviewing the effect.

The first release contains:

- A combined agenda for the current local Monday-to-Sunday week.
- Actual completed activity alongside planned lift day-types and dated run sessions.
- A separate next-lift action driven by the existing rotation cursor.
- A one-off run-move flow: choose a run, choose a destination, review, confirm.
- A clearly separate entry to the existing recurring weekly-layout editor.

Success means the agenda agrees with saved activity and the existing Train surfaces; a confirmed move changes exactly the reviewed run instance; lifting order and recurring preferences keep their existing semantics.

## 2. Decisions that refine the first mock

| First mock                                    | Specified Tropos behaviour                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Future named lifts appear on particular dates | Future calendar rows say **Lift day · Planned**. **Next lift: Lower A** comes from the rotation cursor. Named completed lifts appear only on their actual recorded dates.                                    |
| Week / Lift / Run inside Your plan            | Your plan is a separate workspace under Train. The existing Lift / Run tabs remain the execution surfaces, each with its current selector. The workspace contains one agenda and no duplicate day navigator. |
| A run and a rest day appear to swap           | Persist one run move. The old date becoming empty is a derived display consequence, not a second rest-day mutation.                                                                                          |
| Purple Confirm changes for a run move         | A run-specific confirmation uses the existing coral `sport` button variant.                                                                                                                                  |
| All week changes appear interchangeable       | This-week run moves and the usual recurring weekly layout have separate labels and save paths.                                                                                                               |

These are deliberate corrections to the illustrative image. [ADR-0002](../../adr/0002-dual-scheduling-ontology.md) remains authoritative: runs are date-pinned, lifts are split-ordered.

## 3. Placement and navigation

### Refinements before implementation

The owner requested improvements before implementation. The production flow refines the prototype as follows:

- Put the next lift or real Resume action above the seven-day agenda, so the primary training action is reachable before scrolling the week.
- Name the current-week action **Move a run**. This accurately describes the one-off operation; **Usual weekly layout** continues to set the recurring pattern.
- Use a two-step editing sheet over the agenda: select the source and destination, then review the change and acknowledge any spacing warning. Back from review preserves the draft; dismissing a dirty selection asks before discarding it.
- Use the full canonical destination rules for all seven dates, including acknowledged lift-day/adjacent-hard-run choices, rather than the prototype's rest-day-only demonstration.

These refinements supersede the illustrative prototype's placement and generic editing labels below. Its files remain the original review artefacts.

Route: **`/program/plan`**, inside the existing authenticated Layout with Train selected in the bottom navigation.

- Add a neutral **Your plan** header action on Train, with a 44px touch target. At narrow widths or large text, wrap the header instead of shrinking labels or targets.
- Back returns to the originating Lift or Run tab and its selected session/date. A direct entry falls back to Train's existing remembered-tab rule.
- Keep Home's layout and the five bottom-navigation destinations.
- The workspace's top bar is **Back to Train**, **Your plan**, and the current programme context. The calendar title states the actual date range; label a training-week number **Lift week N** where needed so it cannot be mistaken for an ISO calendar-week number.
- Use the current generated week in the first release. Do not add arrows that imply future weeks are generated when they are not. Past activity remains available through existing history routes.
- The footer row **Usual weekly layout** opens the existing `ScheduleLayoutSheet`. Programme setup continues through the existing focused Lift plan / Run plan / Programme settings routes.

Existing links into weekly-layout editing may continue to deep-link to that same editor. Do not create a second recurring editor or remove the existing controls as part of the workspace build.

## 4. Screen A: Your plan

### Content order

1. Back, page title and current programme context.
2. **Next lift: Lower A**, its dose if known, and **Start Lower A** or the appropriate Resume action.
3. Current calendar date range and one **Move a run** action.
4. A short truthful summary, e.g. **3 lift days · 2 planned runs · 2 rest days**.
5. The seven-day grouped agenda, Monday first.
6. **Usual weekly layout** and **Programme settings** as quiet rows.

Do not add a large dashboard hero, another week strip, coaching cards or a second set of day selectors.

### Day-row anatomy

| Part               | Behaviour                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date column        | Day name and local date; today is marked in text as well as visually.                                                                                                                                                            |
| Planned lift       | Purple marker and **Lift day · Planned**. Tapping opens the existing lift surface with the actual rotation cursor. It does not select a workout by weekday.                                                                      |
| Completed lift     | Actual saved session name, duration and status on its recorded local date. Tapping opens that saved workout. A completed rotation flag alone is insufficient evidence for a dated completion.                                    |
| Planned run        | Coral marker, stored session title, date-appropriate dose and status. Tapping opens the existing run/day details for that stable run ID.                                                                                         |
| Completed run      | Use canonical claim/manual/saved-run completion truth. Link to the saved run when available; do not show Start or Move.                                                                                                          |
| Both day           | Stack lift and run rows under one date. Each keeps its own status, action and sport colour.                                                                                                                                      |
| Extra activity     | Show actual off-plan activity on its recorded date; do not silently assign it to a planned slot.                                                                                                                                 |
| Empty/rest date    | **Rest day** only when the plan and activity resolution support that description. Offer **Add activity** through existing logging/free-run routes. A planned lift day with no completed session is not automatically a rest day. |
| Skipped/missed run | Preserve the canonical status and existing restore/detail actions. A missed dated run does not become the next day's run.                                                                                                        |

Keep the list grouped by date, with dividers between dates and no card around every nested item. Day rows grow when they contain multiple activities or longer text.

### Summary arithmetic

- Label planned quantities as planned/day-type counts, separately from completion counts.
- A Both day contributes to both sport counts. Lifts + runs + rest need not equal seven; do not present them as mutually exclusive portions of a seven-day total.
- Derive rest/empty dates from the resolved instance agenda after one-off moves, including planned lifts and recorded activities. A moved run must not remain in both dates' totals.
- Preserve explicit zero runs and zero lifts. A weekly run target alone does not create dated run sessions for a freeform runner.

## 5. Sheet step B: Move a run

Scope label: **This week only**.

1. List eligible, uncompleted scheduled runs by their current dates.
2. Selecting one reveals seven destination rows with full day/date labels. Use a single-select control with a selected state that does not rely on colour.
3. Display unavailable destinations with a specific reason. Do not rely on disabled opacity or an inaccessible tooltip to convey it.
4. Show **Review change** only after the draft differs from the current saved schedule. It is disabled while no legal destination is selected.
5. **Cancel** returns to the unchanged agenda. Back from Review returns to this draft.

No editable scheduled runs: show **No planned runs to move this week**, with a useful existing route such as **Start a free run** or **Edit run plan**, selected from the person's actual setup. Keep **Usual weekly layout** available as a distinct action.

### Destination rules

Reuse `resolveRunMoveOptions` and canonical completion truth. Do not reimplement a looser calendar picker.

| Destination/source condition                                                          | Result                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current destination                                                                   | No-op; does not enable Review or send a command.                                                                                                                                                                     |
| Earlier than today                                                                    | Unavailable: **That date has passed**.                                                                                                                                                                               |
| Another scheduled run occupies the date, including a completed/claimed scheduled slot | Unavailable under the existing `runDays` occupancy rule: **A run is already here**. Do not silently replace it. An extra saved off-plan run remains visible but does not introduce a new hard block in this release. |
| Race date or after that week's race                                                   | Unavailable with a race-specific reason.                                                                                                                                                                             |
| Outside the run's generated Monday-start week                                         | Unavailable. No cross-week moves in this release.                                                                                                                                                                    |
| Missing stable ID or week/date anchor                                                 | Unavailable: reload/recover the plan through the existing error path.                                                                                                                                                |
| Completed, skipped/terminal or race source                                            | No Move action. Use the canonical status/claim resolution, not just `status === planned`.                                                                                                                            |
| Active run or pending finish for this run                                             | No Move action until that activity is resolved.                                                                                                                                                                      |
| Demanding run on a lift day or beside another demanding run                           | Selectable with the existing specific spacing warning. Carry that warning into Review and require explicit acknowledgement there.                                                                                    |

## 6. Sheet step C: Review changes

Review is a draft; reaching it does not save.

- Title **Review changes**; scope **This week only**.
- Show the run name and full **From** and **To** dates, plus unchanged dose.
- Show relevant spacing warnings and any required acknowledgement beside the change.
- Show **1 run moved**. If true, an optional consequence says **Thursday has no planned session**. Do not describe a persisted rest-day swap.
- Show **Next lift: Lower A** and **Your lifting order stays the same** when the current draft leaves it unchanged.
- Show **Completed sessions stay as logged**.
- Primary **Confirm change**, coral `sport` variant. Secondary **Keep current week** discards the draft and returns to the agenda. Back restores the editor with its selected destination.

Illustrative fixture: Wednesday 28 October 2026; Tempo run moves from Thursday 29 October to Saturday 31 October. Its ID, prescription, duration and original scheduling identity survive. Only that instance's date and move metadata change.

### Confirmation outcomes

| Outcome                        | Visible result                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Applied                        | Return to the agenda with one run on the new date. Announce **Tempo run moved to Sat 31 Oct**. Reopen/details expose its existing move history/original date. |
| Queued                         | Reflect the existing optimistic state with **Waiting to sync**. Do not call it server-confirmed. Pending/retry treatment follows the existing command queue.  |
| Declined/stale                 | Refresh the canonical plan, keep the attempted change understandable, and say **Your plan changed. Review the latest week.** Require a fresh preview.         |
| Failed without durable queuing | Keep the draft and show a specific error with **Try again** and **Keep current week**.                                                                        |
| Busy                           | Suppress duplicate submission. The primary button announces its pending state.                                                                                |

Do not introduce unconditional Undo: an inverse move may no longer be legal after completion, a date change or another device's edit. Existing move history and another validated move are the correction path.

## 7. Recurring weekly layout

**Usual weekly layout** opens the existing editor with a clear recurring-scope explanation: it sets the usual Lift / Run / Both / Rest pattern and can change future generated sessions.

- Reuse `ScheduleLayoutSheet` and `useProgrammeScheduleEditor`.
- Same lift-day count: existing schedule-save/refresh path.
- Changed positive lift-day count: show the existing programme-rebuild confirmation and its actual consequences. Maximum six lifting days. Preserve the existing zero-lift path rather than forcing a rebuild.
- Preserve zero running days, race phase/recovery handling, existing completion history and the editor's save/recovery behaviour.
- Open a fresh editor from the latest profile. Do not hydrate over a draft while the person edits or while a save is pending.
- Respect active lifting sessions and pending finishes; do not restructure the plan underneath them.

The one-off run-move flow never calls `regenerateProgram`, `refreshRunSchedule` or `updateProfile({ weekSchedule: ... })`.

## 8. Source integration and data contracts

| Responsibility                      | Existing source / proposed addition                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programme state and commands        | [`useProgram`](../../../src/features/program/useProgram.ts); use its existing outcomes and `moveRunDay`.                                                                           |
| Canonical per-date resolution       | [`trainingResolver`](../../../src/lib/trainingResolver.ts), with claim map and actual dated activity.                                                                              |
| Move eligibility, dates and spacing | [`runReschedule`](../../../src/lib/runReschedule.ts) and scheduled-run status helpers.                                                                                             |
| Local dates and Monday anchoring    | [`dateHelpers`](../../../src/lib/dateHelpers.ts). No UTC-string parsing or raw weekday addition.                                                                                   |
| Session actions/details             | [`DayActionSheet`](../../../src/components/program/DayActionSheet.tsx), saved-activity and existing run/lift routes.                                                               |
| Recurring editing                   | [`ScheduleLayoutSheet`](../../../src/components/program/ScheduleLayoutSheet.tsx), [`useProgrammeScheduleEditor`](../../../src/features/program/useProgrammeScheduleEditor.ts).     |
| Existing selectors to retain        | [`ProgrammeWeekSelector`](../../../src/components/program/ProgrammeWeekSelector.tsx) on the original Lift/Run surfaces.                                                            |
| Proposed read model                 | `trainingPlanWorkspace`: seven resolved local dates, per-day activity instances/day-types, separate next-lift cursor, summary and action eligibility. No copied scheduling engine. |
| Proposed local draft                | Source run ID/week/date, destination, source signature, captured local date and warning acknowledgement. Derive preview; do not store a second plan.                               |

### Write integrity requirements

Before confirmation, refresh/revalidate the source, target occupancy, derived completion, active-session status and current local date/week. A changed source, completed activity, rollover or occupied target invalidates the preview.

The accepted command must enforce those conditions at the server boundary as well as in the client. Extend the existing run-move contract with narrowly scoped source/target preconditions as needed; do not assume a client check prevents a concurrent edit.

**Implemented:** server `moveRunDay` repeats the past/post-race restrictions and validates the reviewed source/date. The transaction reads authoritative saved-run evidence and compares its freshness snapshot with the reviewed evidence, alongside the active plan signatures. Canonical soft-claim calculation stays in the existing client helper; a second server claim engine is not introduced. Changed saved activity rejects the stale review, while unchanged unrelated activity remains eligible.

Generate one `commandId` per confirmed intent and reuse it for retry/replay; preserve the run's stable ID. Reuse the existing durable replay semantics. No second whole-document plan writer, client-owned authoritative completion map or scheduling-engine migration. [ADR-0011](../../adr/0011-command-boundary-scope.md) still applies.

## 9. States and accessibility

| State                                    | Required treatment                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                  | Shape-matched placeholders; do not show zero counts or a rest week while data is unknown. Keep previously known content during refresh. |
| No programme                             | Existing `EmptyState` primitive and setup action appropriate to that account.                                                           |
| Lift-only / run-only                     | Show the actual discipline; omit irrelevant next-lift/run-move actions.                                                                 |
| Freeform runner                          | Actual runs and honest unscheduled dates. Offer free-run entry; do not invent planned workouts from a target.                           |
| Both day / extra sessions                | Multiple independent rows, wrapping without overlap or double-counting.                                                                 |
| In-progress session                      | Resume the real active session. Suppress conflicting move/rebuild actions.                                                              |
| Offline                                  | Show known data and the actual queued/failed outcome. Do not promise offline durability before the command reports queuing.             |
| Stale draft / midnight / Monday rollover | Revalidate against local dates; request a new preview rather than applying a stale one.                                                 |
| Reconnect rejection                      | Reconcile optimistic display to canonical state, announce the rejected change and retain a recovery route.                              |

Use Tropos tokens and primitives: `PageShell`, `Card`, `Button`, `IconButton`, `BottomSheet`, `Dialog`, `SectionHeading`, `MetaLine` and existing navigation icons. Purple means lifting/brand; coral means running; neutral means rest. Use Plus Jakarta Sans for text and inline numbers, Archivo for standalone figures. No new palette, typeface, gradient or decoration.

All targets are at least 44px. Status has text/icon equivalents. Light/dark themes, 320px width, 200% text, screen-reader labels, keyboard selection, focus return and reduced motion are release requirements. On a small phone the agenda scrolls; primary controls must not obscure the final rows. Warn before discarding a changed draft through navigation; explicit Cancel/Keep current week can discard immediately.

## 10. Delivery slices and acceptance

### Slice 1: read-only workspace

Ship the route, Train entry, canonical agenda, truthful summary, next-lift action and links to existing editors. Verify no disagreement with Home/Train/saved history for completion and next-up state.

### Slice 2: one-off move with preview

Ship draft selection/review, warning acknowledgement, concurrency preconditions, server validation parity and outcome-specific feedback. Reuse the existing command and queue.

### Slice 3: integration and release checks

Verify both themes, large text, sparse/freeform accounts, active sessions, offline replay and week rollover. Run the repository's `npm run verify` gate and the targeted browser journeys before production handback.

### Acceptance scenarios

1. Missing Monday's lift does not discard it or make Friday's named lift authoritative; Start still follows the real rotation.
2. A completed off-plan lift appears on its actual date once, and the rotation remains consistent with Train.
3. A derived-completed run with a still-planned stored status offers neither Start nor Move.
4. Thu-to-Sat run move previews once, confirms once, preserves ID/prescription/origin/completion, and leaves recurring profile/week layout unchanged.
5. Editor → Review → Back preserves the draft; Cancel/Keep current week discards it without a write.
6. Race, past, occupied, post-race and cross-week destinations are rejected by both UI and server, including stale/offline commands replayed later.
7. A hard-run/lift or adjacent-hard-run warning survives into Review and requires acknowledgement.
8. Completion, another device's move, destination occupancy or Monday rollover after preview prevents stale application.
9. Applied, queued, declined and failed each produce truthful, distinct feedback; repeated Confirm creates no duplicate operation.
10. A Both day counts in both sport totals, is not called rest, and keeps independent activity status/actions.
11. Freeform running and explicit zero-run preferences produce no synthetic scheduled runs.
12. Changing the usual lift-day count invokes the existing rebuild flow; moving one dated run does not.

## 11. Visual prototype and evidence

- [Interactive prototype](prototype.html): Week → Edit this week → Review → Confirm, using example data; includes a theme switch and reset. No account writes.
- [Dark preview](preview-dark.png) and [light preview](preview-light.png): captures of the prototype, not production screenshots.
- [Single-screen dark overview](overview-dark.png): the same workspace at a readable phone scale.

The prototype demonstrates local rest-day selection, review and confirmation. Its seven-date picker explains unavailable past dates and marks the lift-day warning review as outside this demo. The production spec allows those lift-day destinations after a warning acknowledgement. Server validation, durable offline queuing, live completion reconciliation, race-specific states and actual programme-editor handoffs remain requirements for production implementation.

The weekly agenda/editable-schedule structure is informed by these inspected iOS Mobbin examples:

| Reference                                                                        | Visible evidence used                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Apple Fitness](https://mobbin.com/screens/fc377805-7b0a-4357-bf4d-8d22caf32074) | Weekly schedule with per-day activities and Edit/Add Activity controls.              |
| [Runna](https://mobbin.com/screens/be9b0bcc-6c28-4abf-bde0-6b046df1207d)         | Strength and run sessions on a selected date, with recorded results beside the plan. |

The dedicated change-preview flow, exact placement, copy and source-precondition requirements are proposals for Tropos. These references do not establish that exact flow or prove a user-outcome improvement.

## 12. Specification and prototype checks

Checked on 28 October 2026:

- Source review against the accepted scheduling/command ADRs and current programme helpers; independent review corrected calendar lift identity, derived rest-day display and scheduled-run occupancy wording.
- Chromium demo checks: cancellation leaves the saved example unchanged; Review → Edit retains the draft; confirmation updates the example agenda and message; completed activities have a read-only handoff; reset, keyboard choices and dialog focus return work. No page errors; no horizontal overflow at 320px; rendered button targets meet 44px. Both themes were inspected.
- All local specification links resolve. Production source files were not modified.
- Repository `npm run verify`: lint, art checks and build passed; unit run reported 1,327 passed files / 15,513 passed tests, with 28 failures in six files caused by sandbox `spawnSync ... EPERM` restrictions. All six affected files were rerun with child-process permissions: **6 files / 128 tests passed**. This is a full sandbox run plus a focused permitted rerun, not a claim that the original full command exited successfully.

The demo checks validate the illustrative prototype. Acceptance scenarios in §10 are implementation/release requirements, not claims of completed production behaviour.

## 13. Implementation, 29 October 2026

The implemented route is `/program/plan`, reached through **Your plan** in Train. It preserves the originating tab/date parameters. The original prototype files above are retained as the design record; these are captures of the actual implemented app:

- [Dark workspace](../../visual-audit/training-plan-workspace-2026-10-28/workspace-phone-dark.png)
- [Light workspace](../../visual-audit/training-plan-workspace-2026-10-28/workspace-phone-light.png)
- [Review sheet](../../visual-audit/training-plan-workspace-2026-10-28/move-review-dark.png)
- [Browser evidence](../../visual-audit/training-plan-workspace-2026-10-28/browser-metrics.json)

Implementation details:

- `TrainingPlan.tsx` reads the programme, a week-scoped workout window and canonical saved-run claims. It handles next-lift/resume actions, unknown/failed evidence, programme readiness, week rollover and recurring editor handoff.
- `trainingPlanWorkspace.ts` composes the seven-date read model. Completed names come from dated records; future lift rows name day-types; the next-lift cursor remains independent.
- `MoveRunSheet.tsx` owns one draft and its two steps. Review snapshots stay fixed while saving. Source/evidence/date/spacing changes invalidate the preview or its acknowledgement. Browser Back and dirty-discard handling preserve the draft appropriately.
- The existing run-move command accepts optional review preconditions. The new workspace always sends a source signature, reviewed local date and completion-evidence snapshot. Server transactions compare current plan and saved-run evidence, retain existing command deduplication and reject changed reviews. No duplicate server claim engine is introduced, and unrelated unchanged saved activity is not permanently blocked.
- Claim-map freshness now includes date/distance/quality/template corrections and manual-completion content. A corrected run cannot remain incorrectly movable merely because its ID and original timestamp stayed unchanged.
- The command outbox publishes live changes and account-scoped replay outcomes. The page refreshes canonical programme state after replay and distinguishes waiting from a refused change.

### Release boundary

The backend and web changes must be released together through Tropos's existing backend-before-hosting production workflow. Older deployed handlers do not recognise the new review precondition payload. No new callable export, rule or composite-index migration is introduced. Deployment is not part of this local implementation.

An unsynced active draft on another device has no server record to validate. Current-device active-run storage is rechecked at invocation; saved/completed evidence arriving on the server is checked transactionally.

### Final verification

- `npm run verify` exited successfully: lint, verifier tests, art/draft checks, dependency cycles, production build, bundle-size ratchet and unit suite all passed.
- Unit suite: **1,335 files / 15,578 tests passed**; 13 files / 484 tests skipped by the existing suite configuration.
- Backend focused checks: 215 pure command tests and 16 real local-Firestore transaction tests passed.
- The authenticated Chromium journey passed using the actual handler and emulator writes, including a valid selected-date return, warning acknowledgement, cancellation, repeated browser Back/discard recovery and a persisted run move.
- Actual renders were checked in both themes at 393px, 320px and 200% root text. WebKit/physical-device testing was not available; see the linked browser report for that boundary.
