# Marathon catalogue expansion

Status: approved for implementation, 14 September 2026. This extends the
12-race scope in `races-events-plan.md`; its evergreen Spaces, membership,
training-save and date-expiry contracts continue to apply.

## Outcome and scope

Expand from 12 to 26 named races, including 18 full marathons. Retain the
eight interest Spaces. Add eight UK marathons and a deliberately limited
six-race international collection. UK is the initial browse filter, with
all countries available in one action. Social and the training picker use
the same catalogue, distance labels, country definitions and filter logic.

Do not imply that a listing guarantees entry or that joining a community
creates a training plan. Preserve manual race entry and the existing
training editor's save/replacement confirmation. Native apps require a new
binary to discover new Space IDs; remote metadata updates only refresh IDs
already known to a client.

## Verified additions

Dates below are the next upcoming editions as of 2026-09-14, verified from
organiser sources. Keep an imminent 2026 edition until it has passed even
if a 2027 date is already available. All additions are 42.195 km marathons;
Chester's separate 26.2 km Metric Marathon is not included.

| Evergreen ID           | Display name              | City          | Country | Date       | Official source                                                                                                                                                |
| ---------------------- | ------------------------- | ------------- | ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| yorkshire-marathon     | Yorkshire Marathon        | York          | GB      | 2026-10-18 | [Run For All](https://www.runforall.com/events/marathon/yorkshire-marathon/)                                                                                   |
| chester-marathon       | Chester Marathon          | Chester       | GB      | 2026-10-11 | [Active Leisure Events](https://www.activeleisureevents.co.uk/)                                                                                                |
| loch-ness-marathon     | Loch Ness Marathon        | Inverness     | GB      | 2026-09-27 | [Organiser](https://www.lochnessmarathon.com/event/loch-ness-marathon/)                                                                                        |
| newport-marathon       | Newport Marathon          | Newport       | GB      | 2027-04-18 | [Organiser registration](https://newportwalesmarathon.co.uk/register-marathon/)                                                                                |
| belfast-marathon       | Belfast City Marathon     | Belfast       | GB      | 2027-05-02 | [Organiser](https://belfastcitymarathon.com/)                                                                                                                  |
| leeds-marathon         | Rob Burrow Leeds Marathon | Leeds         | GB      | 2027-05-09 | [Run For All](https://www.runforall.com/events/marathon/leeds-marathon/)                                                                                       |
| milton-keynes-marathon | Milton Keynes Marathon    | Milton Keynes | GB      | 2027-05-03 | [Marathon event](https://mkmarathon.com/mk-marathon/)                                                                                                          |
| southampton-marathon   | Southampton Marathon      | Southampton   | GB      | 2027-04-11 | [Organiser](https://www.southamptonmarathon.co.uk/)                                                                                                            |
| new-york-city-marathon | New York City Marathon    | New York City | US      | 2026-11-01 | [New York Road Runners](https://www.nyrr.org/tcsnycmarathon)                                                                                                   |
| chicago-marathon       | Chicago Marathon          | Chicago       | US      | 2026-10-11 | [Organiser](https://www.chicagomarathon.com/)                                                                                                                  |
| boston-marathon        | Boston Marathon           | Boston        | US      | 2027-04-19 | [B.A.A. announcement, 14 September 2026](https://www.baa.org/news/qualifier-registration-for-131st-boston-marathon-presented-by-bank-of-america-begins-today/) |
| paris-marathon         | Paris Marathon            | Paris         | FR      | 2027-04-04 | [New official English site](https://www.asicsmarathondeparis.com/en)                                                                                           |
| berlin-marathon        | Berlin Marathon           | Berlin        | DE      | 2026-09-27 | [Organiser](https://www.bmw-berlin-marathon.com/en/)                                                                                                           |
| dublin-marathon        | Dublin Marathon           | Dublin        | IE      | 2026-10-25 | [Organiser](https://irishlifedublinmarathon.ie/)                                                                                                               |

Only include an elevation descriptor if explicitly supported by the
organiser. Photos depict the destination; they do not certify a future
course. In particular, Paris's 2027 route is not yet announced. Do not
include volatile entry prices, availability or sponsor names in evergreen
Space names.

## Browse and training behaviour

- Social's full directory shows country and distance controls above the
  race cards. Initial country: United Kingdom; initial distance: all.
  Compact Feed suggestions remain interest-only.
- Country values are GB, US, FR, DE and IE; use full country names in
  controls. Scottish and Welsh display flags remain valid within GB.
  Options derive from the unfiltered catalogue, not the current result.
- The training picker initially matches the draft goal's distance and
  defaults to GB, or the selected race's country when a race is already
  bound. Its controls only change browsing; they never clear the selected
  event, alter manual inputs or save a plan. Manual date or distance edits
  remove the catalogue binding; editing only the event label preserves it,
  following the existing editor contract.
- Use the existing 44 px input grammar, visible labels and keyboard-native
  selects. Keep a recoverable no-results state with one Clear filters
  action. Clearing selects all countries and all distances.
- Resolve remote dates, remove past editions, then filter, retaining
  soonest-first order. Race day itself remains visible. Date keys stay
  local calendar dates, without UTC conversion. Preserve the existing
  short-build training guards.
- Cards show the actual distance rather than a generic Race chip, and
  allow long race names to wrap without obscuring the date.
- Filter before Firestore membership reads. Race cards do not display a
  member count, so do not request race count aggregates. Preserve interest
  counts, user isolation, cancellation and refresh behaviour.

At the verification date, the existing Big Half and Great North Run are
past: 26 catalogue entries means 24 upcoming cards, of which 18 are UK.
All 18 marathons are upcoming; 12 are UK. These are audit expectations,
not hard-coded UI counts. Annual roll-forward remains a reviewed source
change supported by the existing expiry reminder.

## Data and permissions

1. Extend `SpaceEventInfo` with a validated country code; populate all
   existing race events as GB and the additions as above.
2. Mirror it through `config/raceEvents`, preserving bundled fallback for
   older payloads and rejecting unknown country values. Unknown Space IDs
   remain rejected; remote data cannot create a public community.
3. Keep client IDs, Firestore `isKnownSpaceId`, and the Functions
   account-deletion allowlist identical. Verify new IDs are accepted by
   membership and race-goal rules while arbitrary IDs remain rejected.
4. Extend deployed Functions source verification to check the deletion
   function's actual `lib/spaceIds.js`. Preserve deletion ordering,
   kill switches and all other account-deletion semantics.
5. Verify the race-event sync write by reading back the expected payload.

## Photo acceptance

Provide one distinct, real, legally reusable destination photo per new
race, downloaded and shipped as `src/assets/editorial/space-<id>.webp`.
Use verified free Unsplash assets, with source page, photographer,
location evidence, licence, download URL, dimensions and hashes recorded
in the editorial source documentation. No hotlinks, Unsplash+ assets,
generated landmarks, race sponsors or official race photography.

Preserve natural colour and architectural detail. Target 1200 px width
and at most 120 KB per shipped cover. Inspect every image and its crop in
both the 236 × 148 directory card and responsive Space header, in light
and dark themes. Check an additionally brightened view for hidden logos
or defects. Both surfaces use the same existing editorial resolver.

## Verification and release gates

- Meaningful unit coverage for filtering, country override validation,
  date-only sorting, selection preservation, no-results recovery and
  catalogue/permissions/deletion parity.
- Review all 14 photos, actual rendered cards and headers, long titles,
  country/distance controls and the manual training path on a phone-sized
  viewport in both themes.
- Run `npm run verify`; review the exact diff and image manifest. Require
  all four PR checks: unit, audit, emulator-tests and capture-specs.
- Merge the reviewed PR, confirm Pages and Firebase Hosting deployment,
  Firestore rules deployment, Functions deployment/source readback and
  race metadata sync/readback. Verify live Pages build and asset hashes.
- Record actual results below. Web deployment does not claim a native
  TestFlight release.

## Implementation and verification record

Implemented in the marathon expansion branch:

- All 14 organiser-verified additions and GB country codes for the original
  12 races; 26 total races, 18 full marathons, 34 Spaces including interests.
- Shared native-select filters in Social and the training picker, explicit
  distance chips, wrapping titles, recoverable empty results, and bounded
  membership reads with account-safe caching.
- Client, Firestore rules and account-deletion allowlists updated together.
  Race metadata sync now reads back its payload; Functions deployment
  verification checks the deletion function's shipped Space IDs.
- Fourteen unique licensed WebP photographs, 1040–1200 px wide, each under
  120,000 bytes (1,593,336 bytes combined). Provenance and processing details:
  `src/assets/editorial/sources-marathon-expansion-2026-09-14.json`.
- `npm run verify` passed: 795 test files / 9,192 tests; 8 emulator-gated
  files were skipped in that non-emulator run. Production build and audits
  passed. The changed UI modules also passed lint without warnings.
- Local Firestore emulator verification passed for the profile and Spaces
  rules, including every catalogue race's membership/posting and goal
  binding, plus existing rejection cases.
- Reviewed all 14 cards and 14 headers in light and dark themes (56
  captures), the country/distance controls and US picker. The phone audit
  also exercises no-results recovery, joining without creating a goal,
  international training drafts and manual date entry in a US timezone.

PR gates and deployed builds are verified before release; their immutable
run links and final commit are recorded in the pull request. Native release
remains the ordinary separate build process.
