# Planning foundations

Base: `be5ffb1cc93ce49208f1998000e78f5f6b709021`. The owner authorised the
remaining experience/workload, recurring lifting-time and non-race-goal work
on 2026-09-13. This record describes the implementation, not a new plan lock.

## Running starting point

The running handoff's needs-analysis principle (Magness chapters 10–12,
Faster Road Racing chapter 1) distinguishes recent exposure from a race goal.
Currently only pace, race context, tuning and availability shape the plan.
Add an optional, explicitly confirmed report of recent weekly minutes,
longest run and running experience. Recorded activity can populate a draft;
it cannot confirm itself or silently raise prescriptions.

The report is a conservative planning ceiling, not a fitness diagnosis.
Generated non-race sessions fit the reported weekly/longest duration where
the catalogue permits. Building/returning runners receive easy sessions;
regular runners retain existing quality policy within the same envelope.
The report is dated and versioned. After the four-week evidence window it
remains a ceiling, with easy running and a visible review prompt. It never
expires into an automatic volume increase. Clearing or updating it is an
explicit previewed save. Existing profiles without it retain their plan.
No calendar-only growth, injury prediction or unconfirmed pace authority is
added. The shortest timed easy sessions are ten and twenty minutes, and use the existing
pause-corrected session player for remaining time and completion cues. Existing
templates retain their personalized pace targets. When
even the shortest sessions exceed the report, show the limitation instead
of deleting scheduled days or claiming that the envelope fits.

The profile owns the report; configurePlan commits it with the exact preview
and generated rows. Every generation path threads it. Race, recovery,
completed, manually claimed, moved and overridden sessions keep their
existing precedence. A changed generated row records its original template
and the report date for explanation. Client/server sanitizers and real
rollover tests cover this boundary.

## Recurring lifting time

The lifting handoff prioritises realistic time and stable identity (Fleck
and Kraemer chapter 3; Helms pages 33–45). Existing Express trims use a
working-set budget although displayed estimates include rest and setup.
Keep that existing one-session choice. Add an optional usual-session budget
using the existing rest/setup/warm-up duration estimate. Preserve the first
anchor and all compounds; reduce/drop accessories first, then reduce other
compound sets to their existing floor. If that still exceeds the budget,
report the estimate honestly.

This preference selects a prepared execution copy at Start, with previewed
changes. The full stored programme, exercise IDs, loads and histories remain
available. Source-index mapping and a distinct session-variant draft scope
protect completion/progression. Later weeks apply the preference to their
current prescriptions, without compounding reductions. Full-session and
easier-today choices remain explicit overrides. Removal restores the full
default immediately. The profile owns the preference; no week-engine port
or new command family is needed.

## Goals without a race

Keep the locked freeform substrate. Add an optional weekly number-of-runs
or running-minutes goal with progress from eligible logged sessions on local
calendar dates. It does not author a race, scheduled rows, or another run
mode, and does not change race adherence denominators. Saving, clearing,
account switching, partial data, corrections and week boundaries are covered.
The existing run editor owns the goal; the freeform Run page displays progress.

Product references checked 2026-09-13: [Runna's editable running background](https://support.runna.com/en/articles/6205993-adjusting-your-running-ability)
and [Strava's activity/time goals](https://support.strava.com/en-us/articles/15401694-goals-on-the-strava-app).
These support input/control patterns, not training constants or copied plans.

## Verification

Verify preview/commit equality, profile sanitation, unchanged legacy output,
strict malformed-input rejection, report freshness, protected run identity,
live week regeneration, budget execution and truthful completion. Check both
themes, account-scoped drafts, saves and clearing. Run `npm run verify` and
the relevant backend/browser suites before publishing.

Local results, 2026-09-13:

- Lint, form artwork/draft checks, TypeScript and the production build passed.
  The latest combined `npm run verify` invocation was interrupted after it
  stalled following the completed build; its unit phase was run separately
  through the checked-in runner with the network guard intact.
- The complete app run passed 9,028 tests, with four five-second timeouts and
  344 emulator-dependent skips. All four affected files passed on a one-worker
  rerun (23 tests), without changing assertions or timeouts. All 9,032
  non-skipped cases therefore passed across the full run and targeted rerun;
  this is not a claim of a single clean full-suite invocation.
- The backend emulator suite passed 1,488 tests. After the final report-date
  parity correction, the profile sanitizer and plan callable checks passed
  again (67 tests); client/server planning preference parity also passed.
- Firestore emulator rules passed 312 tests across seven files.
- Both mobile completion journeys passed, including editing completed work
  and reading the saved full/usual-time session variant from Firestore.
  Populated lifting-time, running starting-point and weekly-goal screens were
  visually checked in light and dark themes.
- Import-cycle and bundle-size checks passed. CI remains a release gate.

## Bundle review

The clean production build adds 17,213 JavaScript bytes (0.30%). The
focused lifting and running settings now include the new controls and previews;
the shared lifting-time builder emits its own small chunk. The generated size
baseline records this intentional growth. The existing 5% tolerance and 2 KiB
small-chunk allowance are unchanged.
