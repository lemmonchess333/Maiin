# Crews retirement — spec (LOCKED 2026-07-20)

**Trigger:** operator question reviewing the Together tab — "Do we
still need crews now we have spaces? Is it redundant?" The screenshots
made it unarguable: "Lifters" existed as BOTH a crew and a space on
the same tab; "Hybrid Athletes" duplicated the Hybrid Training space;
"Runners" duplicated the Runners space. Four group concepts (Circles,
Spaces, Challenges, Crews) shared one screen.

**Decision: crews are retired entirely.** Crews predate Spaces and
bundled three jobs, each of which now has a better owner:

| Crew job                         | Owner now                          |
| -------------------------------- | ---------------------------------- |
| Tribal identity + belonging      | Spaces (posts, photos, moderation) |
| Weekly competition (leaderboard) | Challenges (global, metric-based)  |
| A group you create yourself      | Circles (invite-only, 2–8, codes)  |

User-created PUBLIC groups ("+ Create a Crew") contradicted the Spc1
lock (no user-created public communities — S1's rejection stands).
Reference pattern: Strava has ONE group concept (Clubs); Runna has
Spaces + race events and nothing crew-like.

## Locked details (operator approved the recommendation wholesale;

## defaults recorded here)

1. **Share audiences lose the `crews` option.** It was composer-side
   sugar over the `followers` fan-out plus a crewId tag; audiences
   are now followers / public (Circle session-sharing is separate and
   unaffected).
2. **The gym promise moves to Spaces.** The SoloFirstFeed "Crews
   unlock when your gym's here" row re-words to point at gym
   communities arriving as location-kind Spaces (`SpaceKind =
"location"` has been schema-ready since Spc1). Gyms get photo
   pages, posts and moderation — a strictly better landing than a
   crew leaderboard.
3. **Legacy routing keeps working.** `?tab=crews` continues to map to
   the Together tab; `/crew/:id` route is removed.
4. **`profile.crewId` stops being read or written** but STAYS in the
   profile field registry/rules allow-list (documented as legacy) so
   existing docs never fail validation; a future registry sweep can
   drop it once prod data is confirmed clean.
5. **The account-deletion crew sweep STAYS.** Legacy crew membership
   docs may exist for early accounts; the executor keeps cleaning
   them (Admin SDK — needs no client rules). Everything else
   server-side goes: the weekly leaderboard rollup CF and the crews
   client rules blocks (collection becomes default-deny; inert seed
   docs remain harmlessly unreadable).

## Out of scope

- No data migration: pre-launch, no real members. This is exactly why
  the retirement happens NOW — after launch every crew surface grows
  user data and a migration story.
- Gym/location Spaces are NOT built here — this only reserves their
  future home in copy and plan.
