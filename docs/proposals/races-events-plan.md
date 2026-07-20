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

## Amendment — two doors to one catalogue (LOCKED 2026-07-19)

Follow-up from the Runna workflow comparison (screens 4054-56): in
Runna, race selection lives ONLY in the Plan tab (their race database
feeds the plan — End Date = race date, Elevation Profile from the
event), and the Community race space is a parallel social layer that
never touches the plan. Our design already has the door Runna lacks
(the space-page "Train for this race" CTA); this amendment adds the
door Runna has and we lacked:

- **Door 1 — Social (already locked):** Races & Events directory →
  race space → "Train for this race" → prefilled `/settings/run-plan`.
- **Door 2 — Plan (NEW, part of PR3):** a **"Choose an upcoming
  race"** picker inside the race-goal editor (RaceGoalPlanner),
  listing the same race-kind SPACE_DEFS (name, date, distance chip,
  soonest-first, past dates hidden). Picking one prefills
  distance + date + eventName + `eventSpaceId` — the identical write
  path as Door 1. Manual distance/date/name entry stays for unlisted
  races (which simply carry no `eventSpaceId`).

Invariants:

- **One catalogue, two entrances.** Both doors read the same
  `spaceDefs` race entries; no duplicated event data.
- **Join never sets the race.** Space membership is community only;
  only the explicit CTA / picker writes `raceGoal`.

Noted for later (not built): Runna feeds the event's ELEVATION into
plan settings; our scheduler doesn't model elevation. If elevation-
aware training ever lands, `event.elevation` is already in the config
shape.

## Amendment — race photography (LOCKED 2026-07-19)

In-depth photo grill (Q7–Q10). Supersedes the Q5 clause
"fallback-band-first; editorial photos later": photos are now part of
this arc, not a later follow-up.

### What the codebase already settles (no decisions needed)

The editorial pipeline from PR #1631 carries races with ZERO new code:

- **Drop-in contract.** `src/lib/editorialImages.ts` resolves
  `src/assets/editorial/space-<spaceId>.webp` at build time
  (`import.meta.glob`). The moment a race space def exists, dropping
  its photo lights up BOTH the directory card and the space-page hero
  (one image does both jobs — Runna's card/hero pattern). Missing
  file → the designed fallback band, so partial batches are safe.
- **Weight is a non-issue.** ~75–170 KB WebP each; the hand-rolled
  `public/sw.js` caches hashed assets at REQUEST time, not install
  time — 12 photos add ~1.2 MB to dist but nothing to the
  install/update payload, and a photo only downloads when its card
  first renders. Constraint: the eager glob emits EVERYTHING in the
  folder into dist — no unused spares may sit there (the #1631
  46 MB-of-raw-JPGs lesson).
- **Art direction rules apply unchanged** (the editorial README):
  the renderer adds a sport-coded tint wash (coral for races) +
  bottom scrim + white text — so moody/golden-hour tone, meaningful
  detail in the upper two-thirds, no embedded text/logos.

### Locked decisions

7. **Course-landmark imagery (Q7 = a).** No official race photography
   ever — it's rights-managed, and start-line shots are full of
   trademarked gantries/bibs/sponsor banners. Each card is a
   recognisable landmark from the race's ACTUAL course (Runna's
   pattern: Big Half = Canary Wharf, NYC = Manhattan). UK freedom of
   panorama makes public building/street photography clean; frames
   must carry zero race furniture. The landmark map keeps the four
   London races distinct: London Marathon → Tower Bridge · The Big
   Half → Canary Wharf/Greenwich · Royal Parks Half → Hyde Park ·
   Vitality London 10,000 → The Mall · Great North Run → Tyne
   Bridge · Brighton Marathon → seafront/pier · Edinburgh Marathon →
   Arthur's Seat/Old Town · Cardiff Half → Cardiff Bay · Great
   Birmingham Run → city skyline · Manchester Marathon and Great
   Manchester Run → two DISTINCT Manchester shots · Leeds 10k →
   Leeds waterfront. (Guides, not mandates — swap a landmark if the
   available photography is weak.)
8. **Agent-shortlist sourcing (Q8 = a).** The agent searches Unsplash
   for each course landmark and presents one candidate per race
   (photo ID + preview link); the operator approves or swaps; the
   agent fetches, converts to ≤1600 px WebP, and records provenance
   (Unsplash photo ID + photographer) in the commit message — the
   #1631 provenance discipline, with the operator's role compressed
   to one review pass. Unsplash/Pexels licence or owned only; never
   watermarked, editorial-only, or scraped.
9. **Photos are part of the arc (Q9 = a).** The batch is sourced in
   parallel with PR1/PR2 so the Races & Events row launches WITH
   photography — this row is THE photo surface. The fallback band
   remains the safety state for any photo not yet approved; it is no
   longer the launch plan.
10. **Real names + disclaimer (Q10 = a).** Race spaces use real event
    names (nominative use — Runna/Strava precedent) with zero logos,
    zero official imagery, zero brand assets; `websiteUrl` links to
    the official site. One small line on race space pages:
    "Community space — not affiliated with the event" (rendered once
    in the PR3 event header for all race-kind spaces).

STATUS 2026-07-20 — arc fully shipped: PR1 #1689 (config+rules),
photos #1690, PR2 #1691 (directory), PR3 #1693 (event header + two
doors), PR4 #1694 (cross-links). Annual-duty tripwire added:
`race-date-check.yml` runs `scripts/check-race-dates.ts` monthly and
files/updates a GitHub issue (assigned to the operator,
`ready-for-agent`) listing races whose `dateKey` has lapsed. The date
LOOKUP stays agent/operator work per Q5 — automation only does the
noticing; no scraping, no guessed dates.

## Amendment — RACE-EVENTS-REMOTE (LOCKED 2026-07-20)

Operator-raised gap: event dates shipped only in the app bundle, so a
native binary that isn't updated watches races vanish one by one as
bundled dates pass, and every annual date-paste secretly required an
App Store release. Grilled and locked (all recommended options):

1. **CI auto-sync, git stays the source of truth (Q1 = a).** On merge
   to main, when `spaceDefs.ts` changed, `sync-race-events.yml` runs
   `scripts/sync-race-events.ts` (Admin credentials — the same
   `FIREBASE_SERVICE_ACCOUNT` the deploy workflows use) to mirror the
   race event blocks into the Firestore doc `config/raceEvents`.
   Rules deny ALL client writes (the existing `config/{doc}` block:
   authed read, write false — zero rules changes); nothing but CI
   ever writes it, so config↔doc drift is structurally impossible.
   Date changes keep their PR review trail and the tripwire keeps
   watching the config copy.
2. **Whole event block is overridable (Q2 = a).** dateKey,
   websiteUrl, elevation, city, countryFlag — under CI sync the doc
   just mirrors validated config, so the wider surface costs nothing.
   The client validates every field on the way in (dateKey shape,
   https URLs, enum elevation, bounded strings; unknown ids dropped)
   so a corrupt doc can only ever lose to the bundled value.
3. **Lazy fetch, once per session (Q3 = a).** The first race surface
   a session touches kicks one cached `getDoc`; users who never open
   race surfaces never pay the read. Bundled config renders
   immediately; surfaces re-derive together when the fetch lands
   (`useSyncExternalStore`). Offline/failure → bundled values, and
   the Firestore SDK cache serves the last-known doc for free.
4. **Adding a race still rides an app release (Q4 = a).** New races
   need a name, photo, and rules-allowlist entry anyway; the remote
   path exists so EXISTING races never rot on stale binaries.
   Consumers on resolved events: directory row, space event header
   (and therefore Door 1 deep-links), Door 2 picker.
