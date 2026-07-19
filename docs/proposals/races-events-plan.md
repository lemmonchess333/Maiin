# Races & Events in Social — plan (2026-07-19)

**Source:** operator walkthrough of Runna's Community tab (12 screenshots,
2026-07-19): Spaces photo carousel, race space pages (The Big Half, NYC
Marathon), the race _event_ metadata page, the Spaces directory's
"Races & Events" + "Location" sections, the race _plan_ page (B-races),
Instant Workouts onboarding, and their Support hub.

**Goal:** let users browse upcoming real-world races (e.g. London
Marathon, The Big Half, Great Birmingham Run) inside Social, join the
race's community, and — the Tropos differentiator — turn "I'm running
this" into a race-prep training plan in one tap.

## Why this is cheap for Tropos

The Spaces layer (Spc1, locked 2026-07-12) already anticipated this:

- `SpaceKind = "interest" | "race" | "location"` — race/location are
  marked schema-ready; v1 shipped interest-only.
- Spaces are **Tropos-curated config** (`spaceDefs.ts` + the
  `isKnownSpaceId` rules allowlist, pinned equal by the parity test).
  Adding a race is a config edit, not a schema migration.
- The directory already renders Runna-style full-bleed photo cards with
  a designed fallback band; space detail already has join/leave,
  member counts, posts, photo posts.
- `profile.raceGoal` = `{ distance, targetDate, eventName? }`
  (RACE-EVENT-IDENTITY-01) + `runMode: "race_prep"` drive the whole
  race-prep engine (RaceCockpitCard, taper, recovery).

A race is therefore: **a Space of kind `"race"` + an event-metadata
block + one CTA into the existing race-goal flow.**

## PR slices

### PR1 — event metadata + first race defs (config + rules)

- Extend `SpaceDef` with an optional `event` block:
  `{ dateKey: "YYYY-MM-DD", distance: "5k"|"10k"|"half"|"marathon",
 city, countryFlag, elevation?: "flat"|"rolling"|"hilly",
 websiteUrl }`.
- Starter UK catalogue as config, kind `"race"`: London Marathon,
  The Big Half, Great Birmingham Run, Manchester Marathon (editorial
  photos or fallback band).
- Update `isKnownSpaceId` in firestore.rules + the spaceDefs parity
  test (both files or the test fails — by design).

### PR2 — "Races & Events" directory section

- `SpacesDirectory` groups by kind: interest carousel as-is, then a
  **Races & Events** row — RACE badge chip on the photo card, date +
  city under the name (Runna's exact card anatomy), sorted
  soonest-first, past `dateKey` hidden from the directory (the space
  itself stays readable — history/posts persist).

### PR3 — event header on the race space page + the training link

- For `kind === "race"`: JOIN prominent in the header (Runna's NYC
  layout), then the event block — distance chip, date, city + flag,
  elevation, member facepile ("N training for this"), description,
  Visit website (external link).
- CTA: **"Train for this race"** — prefills the existing race-goal
  flow with distance + date + eventName (`raceGoal` +
  `runMode: "race_prep"` via existing writers; no new engine). If the
  event is already the user's race goal, render a "Your race · <date>"
  badge instead.

### PR4 (later, optional) — cross-links

- RaceCockpitCard deep-links to the matching race space (eventName ↔
  space match).
- Post-race share offers to post into that race's space.

## Locked decisions (proposed)

1. **Races stay Tropos-curated config.** The Spc1 "no user-created
   public spaces" lock holds; races are added like challenges.
2. **Evergreen spaces, dated metadata.** One "London Marathon" space
   forever; `event.dateKey` updates each edition. Members and posts
   compound year over year (Runna's model). Per-edition ids rejected —
   they reset community every year.
3. **The training link is the point.** Joining an event and training
   for it must be one motion; a races directory without the
   "Train for this race" CTA is just a noticeboard.

## Out of scope (noted from the same walkthrough)

- **Location spaces** ("5 km away" map cards) — needs geolocation +
  privacy design; separate proposal when wanted.
- **B-races** (tune-up race inside a race-prep build-up, Runna's
  "Add a B-race") — a _Programme_ feature, not Social; worth its own
  Run-arc item later.
- **Instant Workouts** — Tropos already has the equivalent
  (RunTilePicker / RunLaunchCard + distance/time targets); no action.
- **Support/education hub** — separate concept; skip.

## Grill outcomes — LOCKED 2026-07-19 (operator session)

Six decisions resolved in a /grill-me pass; these supersede the
corresponding "proposed" items above and refine the PR slices.

1. **CTA mechanics (Q1 = b).** "Train for this race" deep-links to
   `/settings/run-plan` with `distance`, `date`, `eventName`, and
   `spaceId` as query params — the existing editor (RunPlanSettings /
   RaceGoalPlanner) owns prefill, the replace-existing-goal decision,
   and plan regeneration. No one-tap write, no inline modal — the
   Set1.2 "deep-link out, don't edit inline" lock applies.
2. **Stale dates are derived, never operated (Q2 = b).** Everything
   keys off `event.dateKey < today`: the card drops from the directory,
   the CTA hides, the header renders the date as passed — while join
   and posts stay fully alive (post-race chat is the best week of a
   race community). The only annual config duty is pasting the next
   edition's date; forgetting degrades gracefully, never lies.
3. **Honest facepile copy (Q3 = b).** The count is space MEMBERSHIP —
   copy reads "N runners here", never "N training for this" (that
   claim requires a server-side counter of matching race goals; a
   later, optional follow-up once the goal↔space link exists).
4. **`raceGoal.eventSpaceId` (Q4 = a), landed in PR3.** The deep-link
   carries `spaceId`; the editor writes it alongside
   distance/date/eventName. Follow the eventName precedent
   (RACE-EVENT-IDENTITY-01): add to the `functions/profileSanitizer.js`
   allow-list or the CF write silently drops it. Manually-set goals
   simply lack the field — cross-links don't render, nothing breaks.
   This makes PR4 an exact-id lookup and unlocks the future training
   counter.
5. **v1 catalogue = twelve UK races (Q5).** Marathon: London,
   Manchester, Brighton, Edinburgh. Half: Great North Run, The Big
   Half, Royal Parks Half, Cardiff Half. 10k: Vitality London 10,000,
   Great Birmingham Run (10k), Great Manchester Run, Leeds 10k.
   No 10-mile events (no matching engine distance; Great South Run
   excluded). Fallback-band-first; editorial photos later; dates
   verified against each race's official site at build time — never
   guessed.
6. **Directory placement (Q6 = b).** The Races & Events section lives
   in the FULL SpacesDirectory only (Together tab / CommunityView).
   The Feed's compact "Spaces for you" row stays interest-only — the
   calm-feed doctrine holds; promote races into the feed only if join
   data later argues for it.
