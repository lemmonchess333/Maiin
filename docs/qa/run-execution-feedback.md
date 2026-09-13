# Running execution feedback

Base: `5b204395bfd15a1f724db81dca58922f583053d8` (#2286).
The owner requested continued implementation of the whole-app review.
Local verification below used the implementation rebased on
`1601f43633bc1287c85fac1c52918f43bea8898f` (#2287). Before publication, the branch
was also rebased cleanly on `4c0f624` (#2289), preserving both separately shipped
UI updates. The only overlapping edit in #2289 was a comment spelling change;
PR CI verifies the combined tree.

The running handoff's input-qualification and explainable-adaptation principles
(Magness chapters 10–12 and 16; Faster Road Racing chapters 1, 2 and 7) support
using eligible recorded work and keeping uncertainty visible. They do not supply
a clinical readiness threshold or justify automatic changes in training dose.

## Decision

The current Run cockpit passes invalid/saved-anyway runs into both coaching
evaluators. Its running-history hook reads once per mount, so remote corrections
and deletions can leave advice, goal progress and weekly totals stale. It also
reconstructs local dates from completion timestamps, losing the saved start date.

Make the bounded running-history query live and date-aware, preserving account
isolation, offline overlays and last-known rows on refresh failure. Suppress
coaching until the current query has authoritative data with no queued changes.

Add one advisory trigger to the existing easier-week card: repeated runs well
short of their saved, unchanged scheduled target. Reuse the existing two-of-three
observation pattern over ten days. The shortfall is below 70% of the chosen total
time/distance, a Tropos review heuristic consistent with its existing distance
claim floor, not a success grade or fitness assessment. Timed structures sum only
when every segment uses time; mixed structures remain unknown. Targets come from
the saved launch configuration, never today's template catalogue. Custom, extra,
race, invalid and ambiguous sessions cannot create this signal. A shorter session
does not establish why someone stopped; the copy says so.

Both today's automatic prefill and the exact scheduled-template URL used by
Home/Programme qualify when the saved metadata confirms an unchanged planned
run. A URL alone does not mean a custom run. Legacy sessions with only an
estimated template duration remain unknown; the estimate is not a saved target.

The card shows the contributing dates and actual/target amounts on request and
opens the existing easier-week preview. Only its existing atomic apply command
changes the programme. No automatic increase, catch-up loading, new run mode,
new profile field or programme migration is introduced. Taper/recovery,
fell-behind precedence, cooldown and per-week dismissal retain their contracts.
Local dismissals are scoped to the account and week, even across midnight.

After an easier week, describe the latest eligible tempo verdict factually.
Running faster than its window is not being inside the window, and one result
cannot establish recovery or that an earlier reduction caused an improvement.

## Ownership and verification

Run documents remain the evidence owner. The parser retains only a validated
target projection; edits/deletes invalidate it through the listener. The pure
evaluation carries a policy version and the contributing run IDs. No derived
health status is persisted. Existing cooldown markers stay account-scoped.

Verify invalid/unknown/future evidence, exact saved targets, time/metre units,
custom sessions, same-day ordering, corrections, deletion, pending sync, failed
refresh, stale account callbacks, date rollover, DST and preview/apply/undo.
Run the complete verify gate and inspect the card in both themes before release.

The emulator browser test uses real plan prefills and routes the Apply callable
to the actual exported server handler after verifying the emulator auth token.
It checks Firestore state before preview, after apply and after persistent undo,
as well as live correction/deletion. Both screenshot CI lanes install the
Functions dependencies so this test cannot silently turn into a mocked reducer.

## Verification results

- The final `npm run verify` completed lint (97 warnings within the unchanged
  99-warning ceiling), both artwork audits, TypeScript and the production build.
  Its unit run passed 9,079 tests; three computational property/audit tests
  exceeded their unchanged five-second timeout while the browser/emulators were
  also running. The usual 344 emulator-gated cases were skipped by this command.
- Those three suites were rerun with `VITEST_MAX_WORKERS=1`: all 20 tests passed.
  Across the full run and this isolated rerun, all 9,082 active tests passed.
  No assertion, timeout or skip policy in those suites was changed.
- The emulator browser flow passed on the final application code: real timed
  plan metadata, live correction/deletion, evidence links, an unchanged plan
  while previewing, atomic Apply and persistent Undo. Both mobile themes were
  visually inspected. The trace measured an 11,009 ms initial evidence wait on
  the busy runner; the capture now waits up to 20 seconds for that first server
  snapshot, matching the existing sign-in helper's allowance. Subsequent live
  updates remained within the normal five-second assertions.
- The production size gate passed: 298 chunks, 5,651.0 kB versus the existing
  5,646.4 kB baseline, with no budget or baseline adjustment.
- The final dependency graph check covered 1,568 source files and found no
  circular imports. Formatting and `git diff --check` passed.
- An earlier local dependency symlink caused three map suites to fail loading
  their worker module. The same fault was reproduced on the untouched #2286
  baseline. Keeping the dependencies inside the checkout fixed it; all map
  suites passed in the final full run. Two failures introduced during this work
  (an unsupported soft-delete condition and missing image settling in the new
  capture) were corrected before that final run.
