# Training history

Approved direction: 29 October 2026. Implemented at `/history/sessions`.

## Purpose and entry points

Browse saved lifts and runs in one chronological list, including sessions
older than the current training week. The History action in Analytics and
Your plan opens this page. Its back link returns to the originating view.
Analytics retains its Analytics, PRs and Badges tabs; the weekly plan retains
its existing agenda and rotation. Home receives no new content.

The approved mock uses compact mixed-session rows, month headings, sport
filters and a date sheet. References reviewed on Mobbin:

- [Garmin Connect](https://mobbin.com/screens/90362555-a74f-479d-bb50-6c47830a9848): mixed activity chronology and session summaries.
- [Bevel](https://mobbin.com/screens/2c8bd560-dba7-420d-acee-4c2a5443d010): month grouping across activity types.
- [komoot](https://mobbin.com/screens/9f456179-4651-4e9b-afe4-88ad992c8f0e): search and filters above completed activities.
- [Runna](https://mobbin.com/screens/a0b846c0-90ed-46b2-bec3-7a9735d218f3): activity filtering in a sheet.

Tropos's exact entry points, date presets and Back behaviour are product
decisions, not claims made from these static references.

## Browsing

- Default period: the last 30 inclusive local calendar days, ending today.
- All / Lifts / Runs selects the source shown. Only selected sources subscribe.
- Presets: This week (Monday through today), Last 30 days, This month through today.
- Custom From / To dates are inclusive. Invalid or reversed dates cannot apply.
- Search matches saved session names within the selected period and sport.
- Dates, sport and search are explicit URL state. Relative periods are pinned
  on entry, so returning from a detail across midnight keeps the same dates.
- Rows sort by session day, newest first. Same-day ties use stable identity;
  save timestamps are not presented as session start times.
- The view initially renders 30 rows; Show more adds 30. It queries the whole
  selected period without a document cap. Display pagination cannot omit
  sessions saved on the same day. There is no new server cursor or index.

## Records and navigation

Reuse `SAVED_WORKOUTS`, `SAVED_RUNS` and `useSavedSessions`, including their
account isolation, legacy parsing and durable queued saves. The page never
writes a training record. Titles use `workoutTitle` and `runTitle`; run
summaries respect the person's distance unit. Lift rows show recorded
duration and exercise count. Missing durations are omitted. Run summaries
use saved distance and duration; no effort or per-session PR is inferred.

The date is the lift's `date` or the run's `day`, under the existing session
start-day rules. A run saved despite validity problems remains visible with
`Saved · Not counted`, using the shared volume-eligibility policy. A durable
local write is marked as waiting to sync until it leaves the queue.

Rows open the existing saved detail routes. Back restores filters, expanded
row count and scroll position. Position memory is bounded, account-scoped
and contains no session documents. Missing-session recovery and successful
deletion also return to the filtered history when it was the entry point.

## Incomplete reads

Loading never displays an authoritative zero. A failed source provides Retry
and preserves available rows from either source. A failed read with retained
rows is exposed by `useSavedSessions.readFailed`; its existing `failed`
property keeps its original empty-result meaning for other callers.

A cached or queued answer is labelled as sessions shown, with an incomplete
period notice. An empty cache is not described as an empty training history
or a failed search. Only a complete answer supports those empty-result claims.
The global app shell continues to report connectivity and sync failures.

## Verification

Required: `npm run verify`, including build, bundle-size check and all unit
tests. Focused tests cover date boundaries, malformed URLs, units, invalid
runs, uncapped same-day records, search, failed sources, queues and retry.

`e2e/trainingHistory.auth.spec.ts` uses its own temporary emulator account and
deletes it afterwards. It checks real combined reads, sport and name filters,
date-sheet dismissal with browser Back, 71 older same-day sessions, expanded
list restoration, exact scroll restoration and existing detail navigation.
Optional captures cover both themes, 320/393px widths and 100/200% text.
This verifies Chromium; physical iOS/Safari behaviour is not claimed.
