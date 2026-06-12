# Cold-start payoff audit (D9)

> Cold-start is one of the most-seen states across the user base (every new user
> lives in it, and edge segments re-enter it). CLAUDE.md: "design it as carefully
> as the steady state." This is the systematic guarantee that every primary
> surface's pre-data state is a **payoff, not a void**.

## The bar

Every primary surface's pre-data (cold-start) state must have all three:

1. **An icon or the brand hexagon** — a visual anchor, not bare text.
2. **A one-line value/headline** — what this surface will give you.
3. **Exactly one concrete next action** — a single CTA, not zero (a void) and
   not a wall of competing buttons.

The canonical vehicle is the `EmptyState` hexagon primitive
(`src/components/ui/EmptyState.tsx`): headline + optional sub + at most one
action. New cold-start surfaces should use it unless there's a locked reason not
to.

## Sweep result (2026-06-12)

| Surface             | Where                                      | Verdict                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home · Performance  | `PerformanceHeroCard.tsx` (`!currentWeek`) | **PASS** — `EmptyState` (Activity icon · "No sessions logged yet" · "Start a workout" → /program)                                                                                                                                                                                                                       |
| History · Analytics | `History.tsx` (`isAnalyticsColdStart`)     | **FIXED (D9)** — had icon + headline + sub but **no CTA**; added "Start a workout" → /program                                                                                                                                                                                                                           |
| Food · pre-log      | `Food.tsx` + `FoodMealSection.tsx`         | **PASS by design (Food6d lock)** — the NL composer is the always-present primary log surface (with cold-start example placeholders); per-slot "+ Add to X" empties are a _locked_ intentional design ("breakfast logged, lunch empty reads as intentional, not half-broken"). Not a void.                               |
| Program · pre-plan  | `Program.tsx` (`!programState`)            | **PASS / not reachable** — `App.tsx:350` routes any user with `!onboardingComplete` to Onboarding, so a `/program` visitor always has a programState (onboarding creates it). The `!programState` branch is a load-FAILURE fallback (`ErrorState`: icon + value + Retry — meets the bar). No reachable cold-start void. |
| Social · solo       | `SoloFirstFeed.tsx` (0 follows)            | **PASS by design (Soc8 lock)** — curated stack: PartnerStreak hero + global challenge + share-your-training + "Crews unlock…" — each card icon + value + action.                                                                                                                                                        |
| Crews               | `Crew.tsx` (`!crewDoc`)                    | **PASS** — `EmptyState` (Users icon · "Crew not found" · "Go back").                                                                                                                                                                                                                                                    |

## Outcome

The sweep found **one** genuine strict-bar laggard — the History analytics
cold-start card, which set expectations but offered no next action. Fixed by
adding the single "Start a workout" CTA (mirroring the Home Performance card).
Every other primary surface either already passes or is a **deliberately locked
design** (Food6d composer-first, Soc8 solo-first) that meets the bar through
composition — confirmed, not assumed. Program's apparent gap is an unreachable
state, not a void.

When adding a NEW primary surface, run it against the three-part bar above and
prefer the `EmptyState` primitive; record any locked deviation here.
