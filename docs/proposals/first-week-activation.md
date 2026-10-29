# First-week activation: from plan to first saved session

**Status:** Implemented in the working tree, 2026-10-29. Pending review and release. Deploy the callable before a client that requests version 2.

**Bundle budget:** Home's checked-in chunk limit moves from 95,863 to 103,988 bytes. The increase comes from the direct first-week actions, first-visit gates, and safe plan repair states. The new imports were already in Home's eager dependency graph; splitting the arrival card would add a fetch before its primary action. The total bundle remains within the existing size ratchet.

## Decision

For newly completed onboarding on a version 2 client, open **Today** after the plan is saved. Show the next safe training action on the existing Home session card. Do not open the Pro offer or the automatic Home tour before that action. Keep Pro available from its existing feature gates, Home offer after its delay, and Settings. Keep the tour available through **Settings → Support & legal → Show me around**.

Make the first-week card about the training the person chose. A runner sees a first run, a lifter a first workout, and a hybrid athlete both. Food logging and weigh-ins remain available on Home and in Food; they are no longer universal first-week completion tasks.

This is a placement hypothesis, not a claim that deferring the offer improves conversion. The release must measure both saved activity and trial starts.

## Why this project

The existing setup is already conditional: five screens for running, six for lifting, seven for both. The review already shows the generated first session and week. `Start my plan` then opens `/upgrade?from=onboarding`; leaving the offer reaches Home, where an automatic two- or three-stop tour takes the page before the session can be used. The first-week card includes a meal and three weigh-ins even for a runner. The direct **Start workout** and **Start run** buttons already launch their sessions in one tap after Home is available.

Mobbin's [Runna onboarding](https://mobbin.com/flows/1689d6d5-e245-4369-9dae-320bd863136b) ends on a plan calendar with **Record workout**. [adidas Running](https://mobbin.com/flows/2ba257a6-5bcf-499b-bcf8-e822534ddcb6) ends on its recording surface. [Centr](https://mobbin.com/flows/848ee3f1-7bc7-403d-a2ff-f58b178fadfe) puts a trial offer before its selected workout. These captured journeys support making the plan's next action obvious; they do not establish one universally best paywall position.

## Goals and boundaries

1. An athlete who successfully saves a plan can see and use their next safe action on Today without a mandatory sales or teaching surface.
2. The first-week task follows the selected training type and is marked complete from a saved session, including a session started from another tab or device.
3. A delayed setup still gets seven local calendar days of first-week guidance, starting on the day the plan was completed.
4. Existing accounts and older clients keep their current onboarding and first-visit behavior.
5. Trial eligibility, prices, purchase disclosures, free feature access, training prescriptions, and existing in-session safety checks keep their current contracts.

This project does not reduce the setup questions, regenerate the plan, add a workout, change billing, or redesign all of Home. A later Home project can reorganize ongoing metrics and navigation.

## Journey contract

| Moment          | Version 2 behavior                                                                                                                                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan review     | Keep the generated week, first session, editable answers, required body and injury inputs, optional reminder, and existing server-backed save. Change the final button to **Go to Today**, which names its destination even on a rest day.                                       |
| Successful save | Clear the draft and refresh the authoritative profile as today. Replace the onboarding route with `/`, at the top of the page. A reload after a refresh failure must reach the same destination without saving twice.                                                            |
| First Home view | Show the week strip, the existing session card and the shorter training-only first-week card. Do not auto-open `GuideWalk`, a Pro page, or a new arrival modal. Suppress the Home Pro strip for this entire first visit, even if the athlete returns days after saving the plan. |
| Session action  | Keep the card's direct Start or Resume route. The session and its training date still come from `todaySession`; the first-week card must not invent another prescription.                                                                                                        |
| Completion      | A saved lift or run updates the relevant first-week task. Starting, abandoning, skipping, or leaving a draft does not complete it.                                                                                                                                               |
| Later learning  | Existing one-time Train, first-set, Food composer and first-run hints remain available when that action is first used. The optional Home tour remains replayable from Settings.                                                                                                  |
| Pro entry       | Keep the existing contextual feature gates, Settings link, plan picker, seven-day trial rules, restore purchase, legal copy and renewal disclosure. The Home offer may resume only after its existing delay, measured from plan completion for version 2.                        |

### First-week card

- Show the card only on local days 1 through 7 after `onboardingCompletedAt`, unless dismissed or all training tasks are complete. If that server timestamp has not resolved yet, wait rather than briefly using the older account date. Legacy profiles retain their existing `createdAt` clock.
- **Lifter:** one task, finish the first saved workout.
- **Runner:** one task, finish the first saved run.
- **Hybrid:** two tasks, one saved workout and one saved run. Put the first session card that is startable today first, preserving the existing lift-then-run order when both are due. A resumable session takes precedence over either new start. After one sport is complete, the other is first. A later Home redesign may revisit the order by goal.
- The session card is the primary Start affordance. An incomplete first-week row uses that card's Start or Resume destination when the session is startable, or opens its plan details when it is not. It must not open a spotlight tour before the action or claim completion before a valid session save succeeds. Use the same run and workout validity rules for the card and the cohort measure below.
- For version 2, calculate training-task readiness from the loaded programme and relevant workout/run counts. Do not wait for meals, weight or other Home data before showing a training-only card. Refresh run completion on focus or use a live source so a run saved on another device can tick the card while Home stays open.
- Do not list a meal or three weigh-ins as required tasks. Keep the existing Food energy card, weight tile, and first-meal rest-day fallback. Nutrition prompts can be designed as a separate contextual project if evidence shows they are needed.
- Keep the card dismissible. A dismissed card stays dismissed for that account on the device; a saved session still counts toward activation. Do not reset an existing account's dismissal.

### Session and rest-day rules

Reuse `todaySession`, `StackedCTACards`, the workout rotation, scheduled-run claims and in-flight resume handling.

| State                                  | Home result                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startable workout or run today         | Show its existing Start button and card order. If both are due, keep lift then run; the first-week tasks follow the same order.                                                  |
| Workout or run already in progress     | Show Resume first, including when the draft belongs to a different day. Do not start a second session automatically.                                                             |
| New lifter on a rest day               | Preserve the current first-workout offer, since lifting follows the programme rotation rather than a pinned date.                                                                |
| Freeform runner on a rest day          | Preserve the current free-run offer.                                                                                                                                             |
| Race-prep runner on a rest day         | Show scheduled rest and the next session when the existing plan can name it. Do not replace rest with a first-meal lead card or launch an unscheduled run to satisfy activation. |
| Plan missing, loading, or inconsistent | Show the existing loading or repair state. Do not display a fabricated Start button or mark a first-week task complete.                                                          |

The first run may still need its one-time explanation or device permission after the Home Start tap. That contextual step is allowed. Preserve the checks in `startOnArrival` for an interrupted run, a route to follow, and first-run guidance. The Home action should take the athlete to the appropriate run surface; it must not bypass those checks to force recording.

## Technical contract and rollout

1. **Server-owned cohort marker.** A new client requests `activationJourneyVersion: 2` as a top-level `completeOnboarding` argument, outside `profileData`. The callable validates it and stamps the field alongside `onboardingCompletedAt` only on the first successful onboarding commit. A repeat call preserves both original values and returns the stored version. Add the field to the profile type, server-managed field registry and rules parity checks; the client cannot set it with a profile write. An old client sends no version and retains the old path. No migration or backfill is needed for existing profiles. Deploy the callable before clients that request version 2.
2. **Branch on the server response.** The callable returns the accepted, persisted journey version after its commit. A version 2 response goes directly to Home after the existing profile refresh; an unmarked response follows `/upgrade?from=onboarding`. `refreshProfile()` currently resolves `void`, so awaiting it and then reading the captured React `profile` is not a valid way to choose the route. If profile refresh fails after a successful commit, the existing reload-to-Home recovery path must still work; Home reads the marker from the server profile. Never use route state as the sole source of cohort identity.
3. **Separate clocks.** For version 2, first-week day count, cold-start session framing, lifetime-run read gate and Home offer delay use `onboardingCompletedAt`. Account age and historical week accounting continue to use `createdAt`. Audit each existing `createdAt` consumer before changing it; do not replace the field globally. The Home Pro strip is additionally gated on a previously completed Home visit: record that visit in a UID-scoped local marker after the page settles, and evaluate the marker as it stood when the visit began. Its three-day delay alone does not guarantee a clear first visit if setup finished days earlier.
4. **Keep teaching at point of use.** `useGuideHint` currently requires `WALK_SEEN_KEY`. Version 2 hints must be eligible without the automatic walk while retaining each hint's existing once-per-account dismissal, education-lane arbitration, and automation guard. Unmarked profiles retain current eligibility. Settings replay still opens `GuideWalk`.
5. **Keep the change reversible.** Treat the version 2 branch as a release switch in the client. If its presentation must be disabled, saved plans, trial state and profile version remain valid; Home can fall back to its established cards. Do not overwrite a user's onboarding or purchase data during rollback.

### Delivery slices

1. **Server and cohort safety:** add and test the server-only version field, first-commit timestamp behavior, accepted-version response and old-client fallback. Deploy this before any version 2 client.
2. **Direct handoff:** route a successful version 2 save to Today; remove its automatic walk and first-view sales interruption; keep the manual tour and contextual hints. Check refresh failure and reload.
3. **First-week tasks and clocks:** make the card training-specific, separate account and activation clocks, preserve the session resolver, and refresh the run task after cross-device saves.
4. **Measurement and release:** establish the server-time cohort query, add the small first-week event pair, update emulator journeys and visual captures, then review first activity and paid guardrails together.

## Measurement

The read-only cohort report is `functions/scripts/report-first-week-activation.js`. Run it with `--project=ID --since=YYYY-MM-DD --until=YYYY-MM-DD`; `until` is exclusive and must be at least 168 hours in the past. It reports aggregate saved-activity outcomes using Firestore document creation times. It does not currently report verified trial or paid starts by onboarding cohort: purchase event history has no immutable account-linked start record, and the current profile only carries mutable subscription state. Onboarding platform is not persisted reliably either. Add a privacy-reviewed authoritative source for those dimensions before using the report to claim activation or revenue improvement by cohort or platform.

**Cohort:** distinct accounts whose server-side onboarding commit stamped `activationJourneyVersion: 2`. Segment by runner, lifter and hybrid. A plan-save attempt that fails is outside the denominator.

**Primary outcome:** at least one valid session document first persisted within 168 hours of `onboardingCompletedAt`. Use Firestore's server-side document creation time, not the client-supplied workout `createdAt` or run `completedAt`, for this window. An offline session counts when it syncs; report sync lag separately where available. Count a hybrid's first valid saved session of either sport for the primary outcome and report first lift and first run separately. Runs must meet the existing `isVolumeEligible` rule; workouts must contain at least one completed set or a recorded timed exercise. Deleted, invalid, saved-anyway, and empty sessions do not count. Verify this validity rule against the existing workout save paths before shipping the metric.

**Supporting signals:** time from onboarding completion to first Home Start/Resume tap, first valid saved activity on local days 1 through 7, first-week card impression and row selection, setup completion, guide replay, contextual hint views, paywall views by source, verified trial starts, and paid subscriptions. Derive trial starts from verified subscription state or a server payment event, not a checkout click or success-return alone. Read trial and paid outcomes after enough follow-up time; report by sport and platform.

**Event work:** `onboarding_completed`, `session_started`, `workout_completed`, `run_completed`, and paywall events already have emit sites. The declared `first_*`, `trial_started` and `subscription_started` lifecycle events are not all wired. Add `first_week_card_viewed` once per Home visit and `first_week_task_selected` per row tap, with only sport, task and first-week day as dimensions. Extend `home_card_tapped` to distinguish Start from Resume. Do not call a resumed lift a first start merely because `WorkoutSession` mounted. Firebase Analytics can miss events before initialization, so treat client funnels as directional and verify the authoritative saved-activity result separately. Do not add a user identifier to analytics without a privacy review.

**Decision rule:** compare version 2 with recent legacy onboardings over the same 168-hour window, segmented by sport and platform, where there are enough accounts to make the comparison meaningful. Review first saved activity and trial starts together. If traffic is too small for a dependable rate comparison, use recorded path completion and moderated usability sessions; do not claim a conversion improvement from screenshots or a handful of users.

## Acceptance and verification

- Runner, lifter and hybrid accounts complete setup, arrive at Today without a forced offer or Home tour, and see the correct training task and direct session action.
- A hybrid both-day preserves both cards in their existing order; the first-week tasks follow the same order and a resumable session still wins.
- A race-prep runner on rest sees the next planned session without an off-plan auto-start. A freeform runner and a first-time lifter keep their existing safe rest-day actions.
- A saved workout/run completes the right task; an abandoned draft, skipped session, failed save, or merely opened screen does not.
- An account that signs up and completes setup days later still sees day 1 of the first week. Existing and old-client accounts do not have their guide, checklist or offer reset.
- Settings tour replay and first-use hints work without the automatic tour. The first run's permission and resume safeguards remain in place.
- Free feature access, contextual Pro purchase, monthly and yearly choices, seven-day trial, localized App Store prices, purchase restoration and legal disclosures work as before.
- Review the first Home view and first-week card in dark and light themes, small phone width, large text and reduced motion. Touch targets remain at least 44 px.
- Update the existing first-week, first-visit and Home-start tests. Add emulator end-to-end paths from plan save through a saved activity for each athlete type, delayed setup, race rest day, interrupted session, and legacy-client fallback. Run `npm run verify` and the relevant emulator suites before implementation handoff.

## Source map

- Setup branching and plan save: `src/lib/onboardingPlan.ts`, `src/pages/Onboarding.tsx`, `functions/index.js`.
- Home first visit and actions: `src/pages/Home.tsx`, `src/lib/todaySession.ts`, `src/components/home/StackedCTACards.tsx`, `src/lib/firstWeek.ts`.
- Guide dependency: `src/lib/firstGuide.ts`, `src/hooks/useGuideHint.ts`, `src/components/guide/GuideWalk.tsx`.
- Offer and trial: `src/pages/Upgrade.tsx`, `src/lib/homeProStrip.ts`, `src/lib/proPlans.ts`.
- Measurement: `src/lib/lifecycleAnalytics.ts`, `src/lib/activationTracker.ts`, `src/lib/analyticsProvider.ts`.
