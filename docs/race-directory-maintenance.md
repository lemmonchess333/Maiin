# Race directory and automatic dates

Updated 4 October 2026. This implements the owner's request to keep recurring
races visible and refresh organiser dates without repeatedly using ChatGPT.
It supersedes the hidden-card and manual-only date-update rules in the older
race proposals.

## What ships

The catalogue contains 57 races: 27 marathons, 12 half marathons, 10 10Ks,
5 5Ks and 3 ultras. The first expansion added Sydney, Amsterdam, Rotterdam and Copenhagen marathons;
Oxford Half; Great Bristol Run 10K; Edinburgh Marathon Festival 5K; River Ness
5K. Australia, the Netherlands and Denmark join the country filter.

Berlin, Loch Ness and London 10,000 now use their confirmed 26 September 2027
dates. Each organiser announced this date:

- https://www.bmw-berlin-marathon.com/en/press
- https://www.lochnessmarathon.com/event-info/faqs/
- https://www.londonmarathonevents.co.uk/london-10000

The eight new dates were checked against the event URLs in `spaceDefs.ts`;
Amsterdam's 18 October 2026 date is also stated in the organiser's
[FAQ](https://www.tcsamsterdammarathon.eu/frequently-asked-questions).
Keep imminent editions until they pass, even if a later year is announced.

All 57 races have a shipped destination photograph. The first 16 added photographs
and their licences, photographers, source links, hashes and processing details
are recorded in `src/assets/editorial/sources-race-expansion-2026-10-04.json`.
These are location photographs, not official event images or course promises.

### Shorter races and ultras

The next 15 additions balance the marathon-heavy catalogue:

- Half marathons: Edinburgh, Bournemouth, Sheffield and Valencia.
- 10Ks: Edinburgh Marathon Festival, Bournemouth Supersonic, City of Lincoln,
  York and River Ness.
- 5Ks: Bournemouth Supernova, Supernova Forth Road Bridge and Supernova Kelpies.
- Ultras: Race to the King 100K, Race to the Stones 100K Non-Stop and Chiltern 50.

Every date was checked against the organiser on 4 October 2026. Each has a
dedicated adapter in `scripts/races/sources.ts`. The Bournemouth and Valencia
2026 editions remain listed until they pass; they are not rolled forward early.
Kelpies has two separate race nights, 12 and 13 March 2027, using the same
explicit date-choice behaviour as London. The Stones adapter selects the
100K Non-Stop package's start day, not its two-day or shorter packages.

Ultras have their own filter and exact distance label (`distanceKm`). They
remain browsable and joinable, with official preparation and entry links.
Tropos's training engine supports 5K through marathon only: the training picker
excludes ultras and their pages do not offer a training-plan CTA. Incoming
remote metadata cannot change a race's bundled distance or training eligibility.

Eight new licensed photos and existing destination images cover all 15 new
race IDs. Provenance is in
`src/assets/editorial/sources-short-races-ultras-2026-10-04.json`. The Chiltern
image shows regional countryside at Ivinghoe Beacon, not the advertised course.
The Forth cover depicts the road bridges, not the nearby railway bridge.

The bundle allowance changes only the measured catalogue (`spaceDefs`,
14,953 to 19,963 bytes) and editorial-reference (`spaceTypes`, 12,610 to
15,963 bytes) chunks, plus their corresponding total. This accounts for the
15 definitions, their photo references and the distance guard; other chunk
allowances stay as they were.

## Runtime behaviour

The community directory lists upcoming races first and then evergreen races
awaiting a new date, labelled **Next date TBA**. Their Space pages stay open
and show the last edition separately. The training picker and training CTA
still require an upcoming date. Existing personal goals are never moved to a
new year by this process.

London's confirmed 2027 edition has two race days, 24 and 25 April. The
directory displays both; the Space page asks for the day on the runner's entry,
and the training picker offers each day separately. A saved goal keeps its
selected day. `dateKeys` carries the reviewed choices; `dateKey` is the final
day for directory expiry and backwards compatibility. Older clients display
that final day until updated, so release the client before promoting this
two-day metadata.

## Daily GitHub job

`.github/workflows/race-date-check.yml` runs at 07:23 UTC daily and can also
be started with **Actions → Refresh race dates → Run workflow**. It runs a
normal TypeScript program; there is no AI service, token cost, always-running
computer or new paid service. GitHub Actions usage follows the repository's
normal plan.

The job reads `config/raceEvents`, skips dates that have not passed, and checks
the remaining organisers. `scripts/races/sources.ts` identifies each official
source and, where inspected, its dedicated race-date element. Otherwise it
accepts only matching structured Event/SportsEvent data. It never chooses a
random date elsewhere on a page or adds a year by assumption.

Only an unambiguous next edition can be published. London explicitly supports
two adjacent race days; other date ranges still require review. Invalid dates,
conflicting dates, unexpected redirects, HTTP failures and implausible
year jumps go to one deduplicated GitHub issue. Sources that still show the
last edition are quietly retried the next day. Unchanged issues are not
rewritten; the issue closes once no source needs review. The Actions run
summary records the audit.

An automatic update writes only race dates and their evidence, in a Firestore
transaction with a concurrent-change check and a readback. Existing web and
native clients pick up those metadata updates on their next session. Adding
new race IDs or changing the directory UI still needs a web/native release.

The merge-time metadata sync preserves an automatic date if its recorded
bundled date still matches the catalogue. Editing that bundled date explicitly
supersedes the automated value, allowing reviewed corrections to win. Both
writers share one GitHub concurrency group. Removed race IDs are still removed
by the catalogue sync.

## Local commands and rollout

```sh
npx playwright install chromium      # once, for the two rendered sources
npm run races:refresh -- --all        # dry-run every source; no credentials
npm run races:refresh                # dry-run expired bundled dates only
npm run races:refresh -- --apply      # uses Google application-default credentials
```

Dry runs save `race-date-report.json`. `--today=YYYY-MM-DD` is available only
in dry-run mode. Do not commit generated reports containing routine run noise.

After the change is merged to the default branch, the schedule uses the existing
`FIREBASE_SERVICE_ACCOUNT` GitHub secret, as the metadata sync already does.
No additional secret is required. Run it once manually and inspect the summary.
Deploy the updated Firestore rules and account-deletion allowlist with the new
catalogue, following the repository's normal release gates.

GitHub schedules are best-effort and run from the default branch. Public-repo
schedules can be disabled after 60 days without repository activity; check the
Actions page if an idle repository stops running. See
[GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Some organiser sites block automated access or publish dates only through
scripts, images or inconsistent markup. Those need an occasional adapter fix or
manually verified catalogue date. The fallback keeps races visible throughout;
this does not promise that every organiser can be scraped forever.

The source adapters cover all 57 races. Amsterdam, Houston, Seville and Paris
use dedicated organiser FAQ statements. Chester and New York use a fresh
anonymous Chromium browser to read their rendered event pages. The browser
does not solve access challenges; an inaccessible event page stays in review.
Main-frame navigation is limited to reviewed HTTPS hosts, including New York's
normal waiting-room host, and the final page must be the organiser's event
site. CI installs Chromium automatically. For a local installed browser,
`RACE_BROWSER_EXECUTABLE_PATH` may point to its executable.

Great Birmingham and Great Manchester use their event entries on Great Run's
[official support page](https://info.greatrun.org/support/solutions). Great
Bristol and Great North's main event sites blocked automated access, and their
support entries were inconsistent or stale. These two races require agreement
between independent charity entry providers:

- Bristol 10K: [Cancer Research UK](https://www.cancerresearchuk.org/get-involved/find-an-event/great-bristol-10k)
  and [British Heart Foundation](https://www.bhf.org.uk/how-you-can-help/events/runs/great-bristol-run-10k).
- Great North: [Macmillan](https://www.macmillan.org.uk/fundraise/charity-runs/great-north-run)
  and [British Heart Foundation](https://www.bhf.org.uk/greatnorthrun).

These are entry-provider sources, not direct organiser announcements. Both
must load, identify the same race and publish the same date. A failure or
disagreement requires review; neither source is silently dropped. Evidence
stores both URLs and response hashes. An adapter failure never erases a date
or a race.
