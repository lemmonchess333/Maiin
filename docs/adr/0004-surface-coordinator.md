# ADR 0004 — Surface coordinator & notification-tier taxonomy

Status: accepted (2026-06-03) · Issue: #995

## Context

Home — and the globally-mounted `StreakReminderPrimingModal` — accumulated
several independently-triggered attention surfaces. Each feature decided on its
own to pop something; nothing knew anything else existed. On a returning user's
visit they could all fire at once, and **z-index was the only arbiter**:
`BadgeEarnedModal` (`z-[60]`) simply painted over the sheets at `z-50`, which
stayed mounted underneath. The result is the "noisy / cluttered / feels broken"
report.

The canonical pile-up — a lapsed Pro-trial user returning on a Monday:

- Trial expired over the weekend → **TrialExpiredModal**
- `weeklyFellBehindCheck` ran Mon 05:00 UTC → **FellBehindSheet**
- A comeback badge was earned → **BadgeEarnedModal** (paints on top)
- 2-day streak, never primed → **StreakReminderPrimingModal** (global)

Four blocking surfaces, four _different_ persistence stores (Firestore profile
flag, Firestore `programState`, in-memory, Firestore prefs), zero shared gate —
and an emotional whiplash of a celebration stacked on a reprimand.

### Root cause

1. **N independent decision-makers** — every feature self-triggers.
2. **N independent stores** — nothing can ask "has _anything_ shown this visit?"
3. **z-index ≠ scheduling** — layering stacks; it does not choose.

## Tier taxonomy (classification for every current surface)

Match the surface to the message. Clutter happens when state/education are shown
as popups and when everything pops independently.

| Tier                          | Meaning                                     | Rule                                                                                   | Examples                                                                                                                   |
| ----------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **1 — Ambient/inline**        | persistent state that is _part of the page_ | never a popup                                                                          | streak-at-risk line, post-workout protein nudge (`TodayEnergy`), day-tap hint, adaptive-TDEE warmup (#981), `InsightStrip` |
| **2 — Toast**                 | transient confirmation                      | auto-dismiss; **never** for anything requiring action                                  | sonner "Meal logged", save/error toasts                                                                                    |
| **3 — Inline education card** | calm one-time teaching, in the scroll       | **≤1 visible at a time**; dismisses forever                                            | `ContextualTipBanner`, `useCoachMarks` explainers                                                                          |
| **4 — Blocking modal/sheet**  | a genuine decision                          | **≤1 per app-open**, priority-ordered; rest defer/drop; routed through the coordinator | `TrialExpiredModal`, `FellBehindSheet`, `BadgeEarnedModal`, `StreakReminderPrimingModal`                                   |

### Per-surface classification (audit result)

| Surface                        | Mounted          | Today's trigger                        | Tier | Action                                                            |
| ------------------------------ | ---------------- | -------------------------------------- | ---- | ----------------------------------------------------------------- |
| TrialExpiredModal              | Home             | `useEffect`, `expiresAt<now`           | 4    | route through coordinator (priority 40)                           |
| FellBehindSheet                | Home             | `programState.pendingFellBehindPrompt` | 4    | coordinator (30)                                                  |
| BadgeEarnedModal               | Home             | `newBadge` from `useStreaks`           | 4\*  | coordinator (20), `suppressedBy: [fell-behind]`, `dropWhenMissed` |
| StreakReminderPrimingModal     | **App (global)** | `visibilitychange`, streak≥2           | 4    | coordinator (10); becomes Home-scoped via the provider            |
| ProModal                       | Home/Food        | **click only**                         | —    | not in the auto-pile; shares the modal layer                      |
| ContextualTipBanner            | Home             | inline, versioned localStorage         | 3    | keep inline; enforce ≤1 education card                            |
| InsightStrip                   | Home             | inline                                 | 1/3  | keep inline                                                       |
| Coachmarks                     | Home/Food        | first-run overlay                      | 3    | gate behind "no tier-4 active"                                    |
| Day-tap hint                   | Home             | until first tap                        | 1    | keep ambient                                                      |
| Streak-at-risk / protein nudge | Home             | inline                                 | 1    | keep ambient                                                      |
| Toasts                         | global           | imperative                             | 2    | unchanged                                                         |

\* Badge is a _celebration_: it stays a blocking moment but never co-shows with
a reprimand, and a missed one is dropped rather than deferred a session late.

## Decision

A pure decision core (`src/lib/surfaceCoordinator.ts`) plus a React provider
(`src/components/SurfaceCoordinatorProvider.tsx`). Surfaces declare intent via
`useSurface({ id, priority, eligible, suppressedBy?, dropWhenMissed?, onDrop? })`
and render only when `active`.

Locked policy (#995 design pass, 2026-06-03):

- **Scope: app-global.** Only this catches the globally-mounted priming modal.
- **Budget: ≤1 blocking per app-open** (mount + foreground-after-hidden).
- **Priority: Trial (40) > FellBehind (30) > Badge (20) > Priming (10).**
- **Suppression:** Badge `suppressedBy: ["fell-behind"]` — no celebration in the
  same visit as a reprimand.
- **Losers: decisions defer** (re-register next open via their own persistence);
  **celebrations drop** (fire `onDrop`, e.g. `dismissNewBadge`).
- **Settle window (~400ms)** before picking — mirrors the `onAuthStateChanged`
  multi-fire rule; don't pick on the first eligibility signal.
- **No preemption:** a higher-priority surface arriving while one is open waits;
  never yank a sheet out from under a tap.
- **Tier-3 education:** a separate lightweight "≤1 card at a time" lane, not the
  tier-4 core.
- **Persistence:** keep each surface's existing store via the `eligible` flag
  (adapter); a unified `users/{uid}/uiState` doc is a later optional step.

## Consequences

- New blocking features have a documented home: add a `useSurface` registration
  with a priority, instead of self-triggering.
- The `z-[60]` `BadgeEarnedModal` special-case is retired once the provider owns
  the render slot (PR3).
- `useSurface` **fails open** outside a provider (`active === eligible`), so the
  per-surface migration is safe one commit at a time.

## Phasing

1. **PR1 (this)** — taxonomy (this ADR) + pure core + tests + inert provider/hook.
2. **PR2** — mount the provider; migrate the four tier-4 surfaces (one commit each).
3. **PR3** — education ≤1 lane + coachmark gating + retire `z-[60]`.
4. **PR4 (optional)** — cooldowns + unified `uiState` doc.

## Invariants (from CLAUDE.md)

- uid-scope any session/localStorage coordinator state (shared-device switch).
- Route new persisted flags through `firestoreWrite.ts`; allow-list new profile
  fields in `functions/profileSanitizer.js`.
- Design for the user base: the worst-case pile is a _returning-user_ state —
  among the most-seen states across 1000 users, not an edge case.

## Amendment 2026-10-02 — the badge leaves tier 4

Owner call from the first-week pass. A waiting badge no longer opens over
Home on its own: Home shows it as one row, "New badge · <name>"
(`NewBadgeRow`), and the reveal opens when that row is tapped. A badge a
session earns still opens inline on that session's finish screen
(`CompletionExtras`), as before. Filmed on a new account, badges opened
over Home four times in the first four days, each needing a seal tap and
then Nice before the day's session could be seen.

So `BadgeEarnedModal` is no longer a coordinator surface, and the
priority line above reads Trial (40) > FellBehind (30) > LiftReturn (28) >
GoalReached (25) for Home. The Badge-under-FellBehind suppression has
nothing left to guard: nothing about a badge opens unasked.
`homeSurfaceRegistry.test.ts` pins that Home registers no `badge` surface.

## Amendment 2026-10-04 — the first-visit walk

Owner call from the first-visit guide decision page (FV1). A new account's
first visit to Home gets a three-stop walk: the page dims around today's
session, the first-week card and the Food card in turn (`GuideWalk`).

- **It is a tier-4 surface**, `first-visit-guide`, priority 45, above
  Trial (40). Home's order is FirstVisitGuide (45), Trial (40), FellBehind
  (30), LiftReturn (28), GoalReached (25). It is eligible only in an
  account's first seven days and only until it has been seen
  (`walkOffered`, `firstGuide.ts`), and only once its first card is drawn
  and the launch animation has left the screen (`useGuideWalkReady`), so it
  never spends the visit's budget on a page that isn't there yet.
- **Replays are click-only**, like ProModal: Settings → Support & legal →
  Show me around, and the one stop a first-week row opens, render directly
  and are not routed through the coordinator.
- **The Health steps prompt waits for it.** `StepsPrimingModal` is outside
  the coordinator (native only, once ever); it now opens only when no walk
  is showing or due, so a new account meets the app before it is asked
  for anything.
- **The hints are tier 3.** The guide's one-time hints (Train's order, the
  first set, the food composer, the first run) are anchored bubbles rather
  than inline cards, but they go through the education lane at priority
  35, so they never show beside another tip (`GuideHint`).

`homeSurfaceRegistry.test.ts` pins the registration and that the walk
outranks every other Home surface.

## Amendment 2026-10-04 — what the guide made unnecessary (FV2)

Owner call from the tips-and-coach-marks decision page (FV2), made the
same day as FV1. The tables above describe the system as #995 left it;
read them with this amendment.

- **The streak-reminder priming prompt is gone.** It opened on window
  events (`tropos:workout-completed`, `tropos:run-completed`) that nothing
  in the app sent, so it never showed. The finish screen's reminder
  switch and Settings ask for the same consent (`primingShown`). The
  coordinator stays app-wide, wrapping the routes; its tier-4 set is now
  Home's alone: FirstVisitGuide (45), Trial (40), FellBehind (30),
  LiftReturn (28), GoalReached (25).
- **Tier 3 lost three tips and its coach marks.** The lane holds the
  guide's hints (35), the first-week card (30) and the "Still on track?"
  check-in (12). Removed: the age-and-sex nudge (setup records both, and
  no Settings screen can change sex), the experience nudge (setup asks
  now), the race-goal invitation (Train's Run tab carries the same card),
  and `Coachmark` with `useCoachMarks`. The coach mark's one wire-up, the
  People invite mark, drew behind the People overlay (z-40 under z-50)
  and saved itself as seen after six seconds. The guide's hint is the one
  kind of one-time hint.
- **The Health steps prompt waits for its saved answer** (`useSteps`
  `ready`). It used to decide from default flags before the account's
  answer had loaded, so it could open and close again for someone who had
  already answered. A failed read leaves it unasked on that visit.
- **Food's Pro line takes its turn** with the guide's food-composer hint:
  it waits while that hint is due.
