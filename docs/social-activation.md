# Social activation runbook

The Social tab is **solo-first**: it must look designed for a user with no
partners, no crew, and an empty feed — because that's the state 100% of
launch users start in. Network features stay **dormant** (kept in the
codebase, not deleted) and **activate** as density arrives.

All thresholds live in one place: [`src/lib/socialGates.ts`](../src/lib/socialGates.ts),
pinned by `src/lib/__tests__/socialGates.test.ts`. Tune them there — never
inline at a call site.

## What activates at which threshold

| Surface                                                      | Dormant state (below threshold)            | Activates at                                                            | Gate function                                     |
| ------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------- |
| **Solo-first layout**                                        | — (this IS the dormant-network experience) | shown while user has **0 partners AND no activated crew**               | `isSoloUser({ partnerCount, crewMemberCount })`   |
| **Following feed**                                           | hidden (not an empty list)                 | user follows **≥3 active accounts**                                     | `shouldShowFollowingFeed(activeFollowCount)`      |
| **Crew surfaces** (member list, crew feed, crew leaderboard) | single aspirational invite row             | user's crew has **≥3 members**                                          | `shouldShowCrewSurface(crewMemberCount)`          |
| **vs-others leaderboard**                                    | hidden                                     | cohort has **≥20 members** — and ALWAYS percentile/neighbourhood-framed | `shouldShowLeaderboard(cohortSize)`               |
| **Challenge percentile line** ("top 40% this month")         | personal progress vs target only           | challenge has **≥50 participants**                                      | `shouldShowChallengePercentile(participantCount)` |

## Solo-first layout (the always-designed state)

For a solo user the Social feed renders a curated stack — never an empty
feed:

1. **PartnerStreak invite hero** — the S3 partner-streak entry.
2. **"This month on Tropos" global challenge card** — solo-viable (you
   compete against a target number, not friends); one-tap join; progress
   derives from existing logged sessions (no new logging).
3. **Share-your-training card** — entry into the S1 share flow with the
   user's latest session preloaded.
4. **Aspirational crew row** — the hexagon `EmptyState` primitive: "Crews
   unlock when your gym's here — invite them."

## Kept dormant, not deleted

These activate as density arrives — do not remove them:

- **Kudos / comments** — already wired; surface in the feed once there are
  activities to react to.
- **Progress photos** — on the profile; not gated by density.
- **Existing challenges code** — the global monthly challenge is built ON
  this system (`challenges` collection + `syncChallengeProgress`).
- **Crew internals** — member list, crew feed, crew leaderboard; gated by
  `shouldShowCrewSurface`.

## Design note

"Dormant" is a render decision, not a data decision: the underlying data
keeps flowing (follows recorded, challenge progress synced server-side) so a
surface lights up the instant its threshold is crossed, with no backfill.
