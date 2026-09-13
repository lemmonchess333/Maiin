# Feasible personal plan: implementation decisions

Target: `701fecd`, the trusted-state release integrated with `main` at
`ed5488b`. The owner requested deployment and continued development against
the whole-app audit, including plan fit (F09, F12 and F13).

## Demanding-session placement (F12)

The running handoff's spacing principle (Faster Road Racing, chapters 2 and 7;
Advanced Marathoning, chapters 3 and 8) supports using available alternatives
before placing demanding runs together. It does not establish a universal
recovery interval.

The build-week generator currently consumes quality slots in array order.
Keep the existing long-run preference, session count, quality policy,
templates, taper, race and return rules. Rank the feasible quality placements
by consecutive demanding days across the repeating week, then shared lift
days, then minimum spacing; break ties by calendar order. This is a scheduling
preference, not an injury or readiness claim. Insufficient space remains a
visible trade-off that the runner can resolve with the existing move or
easier-session actions.

Move warnings must use actual local dates, effective template types and
non-skipped sessions. A Sunday at the end of a Monday-start week is adjacent
to Saturday, not to the Monday six days before it. Show the same current
conflict after a move or template edit; do not persist a stale warning.
Client/server move validation remains mirrored. No run is completed, removed
or rescheduled by viewing an explanation. Lift order remains independent of
weekday allocation.

Validation: literal Mon/Tue/Thu/Sun regression, exhaustive feasible-day
combinations, week-wrap/date cases, client/server move parity, live editing
and preserved race/re-entry rules.

## Recurring constraints and running evidence

Time and recorded workload must influence an explicit plan preview before
they influence saved prescriptions. Missing evidence remains unknown. Current
measurement-only benchmarks do not gain prescription authority. One-session
Express and easier variants retain their established behavior. Any accepted
recurring constraint must survive save, refetch and week rollover, retain
exercise identity and completed history, and have a clear removal path.

The running slice now has optional ordinary-session and long-run time limits
(30–150 minutes; no extra limit by default). The same engine shapes the editor
preview, atomic save, settings rebuild, onboarding retake and every weekly
regeneration path. Shorter existing templates preserve the session family and
strides when available. If no long tier fits, a timed easy session replaces it,
with a visible explanation. Race sessions and explicit swaps are exempt. The
confirmed easy pace governs distance-based long-run estimates; otherwise the
existing nominal template estimate remains explicit. Removing a limit is a
normal reviewed plan edit. This is availability, not a new training-dose or
injury-prevention model.

The editor also shows four rolling weeks of eligible recorded running, with
separate loading/unavailable/empty states, weekly minutes, consistency and
longest session. It includes eligible manual/treadmill sessions and identifies
that activity outside Tropos may be absent. It does not automatically rewrite
prescriptions or claim to establish a training baseline.

F12's quality placement and current-date advice are implemented. F09's fuller
experience/workload baseline and F13's recurring **lifting** session fit remain
open; the one-session Express prescription is unchanged. F10 optional non-race
goals also remain open. These are not closed merely by adding a settings field.

## Release regression found during capture verification

The browser finish scenario exposed an invalid Firestore receipt: progression
stored `setLogs` as an array of arrays. The writer now wraps each exercise's
logs in a map, and correction reads/writes the same format. A real Firestore
serializer test covers completion, idempotent retry, correction and unchanged
single-entry progression history. This fixes the release candidate before it
reaches production; it is not dismissed as a screenshot-only failure.

## Same-race edits retain the block

Tracing time-limit saves found that buildPlan reset an existing race block to
week zero. Same-distance/date edits now pass the original block length into
both preview and save. Completed, skipped, manual, past and explicitly swapped
or moved sessions keep their original identity. A moved row reserves its old
slot so an edit cannot re-add it. Existing recovery remains intact. A different
race/date remains an explicit new block. Regression tests compare the real
preview and save and cover lifting-settings rebuilds through buildPlan.

Settings also pass the existing account-scoped layoff classification into
preview and save, so retaining block position does not reintroduce quality
work for a returning runner. Existing weekday choices remain when lift/run
counts are unchanged; a frequency change still generates a fitting layout.
