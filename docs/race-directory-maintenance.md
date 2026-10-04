# Race directory and automatic dates

Updated 4 October 2026. This implements the owner's request to keep recurring
races visible and refresh organiser dates without repeatedly using ChatGPT.
It supersedes the hidden-card and manual-only date-update rules in the older
race proposals.

## What ships

The catalogue contains 42 races: 27 marathons, 8 half marathons, 5 10Ks and
2 5Ks. Eight additions: Sydney, Amsterdam, Rotterdam and Copenhagen marathons;
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

All 42 races have a shipped destination photograph. The 16 added photographs
and their licences, photographers, source links, hashes and processing details
are recorded in `src/assets/editorial/sources-race-expansion-2026-10-04.json`.
These are location photographs, not official event images or course promises.

## Runtime behaviour

The community directory lists upcoming races first and then evergreen races
awaiting a new date, labelled **Next date TBA**. Their Space pages stay open
and show the last edition separately. The training picker and training CTA
still require an upcoming date. Existing personal goals are never moved to a
new year by this process.

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

Only one unambiguous next date can be published. Invalid dates, conflicting
dates, multi-day events, unexpected redirects, HTTP failures and implausible
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

The 4 October 2026 live dry run read unambiguous dates for 31 of 42 sources.
The other 11 need review: Chester, Amsterdam, New York, Houston, Seville,
Paris, London Marathon (two-day edition), Great Birmingham Run, Great Bristol
Run, Great Manchester Run and Great North Run. The Great Run sites returned
HTTP 403. Their already verified catalogue dates remain usable; an adapter
failure never erases a date or a race.
