# Workout effort entry and completion summaries

[Effort comparison](./workout-effort-2026-10-28/rpe-board-dark.html) · [Summary comparison](./workout-effort-2026-10-28/summary-board-dark.html)

The nine RPE ratings now wrap into larger choices. The existing segmented-control primitive supplies exclusive selection, arrow keys, Home and End, and one Tab stop. Opening the ratings leaves effort unset. Clear removes an accidental rating and returns focus to the first option; clearing also removes effort from the save payload. Half-point ratings remain available.

Review and saved-workout summary figures stack on narrow screens and at larger text sizes. Their values and units keep separate space.

The saved page's title gives Share its own row when the two no longer fit. Its layout breakpoints follow the root text scale, including when an enclosing page keeps a fixed base font size.

Kettlebell loads use the same equipment-aware formatting on the review and saved record, including new bests, previous-best comparisons and first-logged records. A 16 kg bell reads **35 lb** throughout. Its stored weight remains 16 kg.

The exercise breakdown now compares timed working sets by duration when their added loads differ. A completed unweighted 60-second hold appears ahead of a loaded 30-second hold. Warm-ups and unfinished sets remain excluded from that comparison.

Short sessions retain fractional minutes when the review opens and when a pending completion is reopened. Previously, rounding a short clock to zero made the writer substitute its estimate for a session with no clock. The six-set browser journey exposed a review under one minute becoming an 18-minute saved record. New saves retain the clock, with a one-second minimum. Duration labels also follow the rounded display value at the one-minute and one-hour boundaries. The correction form accepts these precise durations, so editing a set keeps the measured clock. Existing saved durations lack the discarded clock precision, so the correction applies to new saves and retries.

## Measured baseline

The baseline is commit `4c25d01`, captured before the app changes. Separate local emulator accounts keep the baseline, corrected Chromium and corrected WebKit journeys on matching starting histories. Each journey logs three kettlebell sets and three leg-press sets. The kg fixture totals 12,210 kg of work.

| Check                                       | Before                            | After                            |
| ------------------------------------------- | --------------------------------- | -------------------------------- |
| RPE target width, 393 × 852                 | 33.9 px                           | 64.2 px                          |
| RPE target width, 320 × 568                 | 25.8 px                           | 49.6 px                          |
| RPE target width, doubled text at 393 × 852 | 24.1 px                           | 88.3 px                          |
| Doubled-text rating labels                  | Decimal labels overlap            | Every rating fits                |
| Doubled-text summary                        | Work total overlaps the set count | Separate figures and units       |
| 16 kg bell in the lb review                 | 35.3 lb                           | 35 lb, matching the saved record |

All corrected effort targets meet the 44 × 44 px minimum. The standard phone summary keeps its three figures in a row.

## Reference

[Visible](https://mobbin.com/screens/a9170494-8f71-43b1-aa35-e1e80432646a) provides one iOS example of numbered effort choices. Tropos keeps its own scale and components. Wrapping, keyboard handling and Clear address the measured Tropos control problems. The summary and load corrections come from the Tropos baseline. Reference metadata is retained in the adjacent directory.

## Browser checks

Chromium and Linux WebKit checked both themes at 393 × 852 and 320 × 568, plus doubled text at 393 × 852. Both engines kept the rating labels and summary values within their bounds. End selected and focused 10; Clear left no rating selected.

Both engines saved and reopened the workouts in kg and lb. The saved Firestore documents were checked for RPE 8 on the first leg-press set, three working sets per exercise and an exact stored kettlebell weight of 16 kg. The saved-record summary was also checked at all three sizes in both themes.

A separate Chromium check logged three bodyweight sets in a short session. Review and the reopened record both showed under one minute; the document retained its measured 2.792 seconds. Correcting the first set to 9 reps preserved that exact duration. `short-session-checks.json` records that result.

Chromium reported no page errors during the main journey. WebKit emitted local emulator access warnings, retained in its metrics; the journey assertions passed. WebKit used a local HTML policy override to reach the emulator ports. These are automated browser checks, not physical iPhone testing.

The directory contains captures and measurements, saved-record checks and four self-contained comparison boards. Embedded pane images match the captured PNGs.

## Verification

Before the effort and summary fixes, six regression checks failed and 120 existing checks passed in the three completion suites. Three additional clock checks failed before the duration correction, covering fresh saves and reopened retries. Two form-validity checks failed before the correction form accepted fractional minutes. The corrected source passes 267 focused tests, including saved summaries, workout records, PR descriptions, draft recovery, the save writer, duration labels, corrections and the working-set save boundary. Formatting checks pass.

The final `npm run verify` passed: lint, verifier tests, artwork checks, dependency cycles, TypeScript, production build, bundle limits and the full unit suite. The suite passed 1,333 files and 15,541 tests, with 13 files and 484 tests skipped. Prettier, `git diff --check`, browser-data assertions and embedded-capture checks also passed. No bundle budget was increased.

This follows the [exercise progress units and records pass](./chart-metrics-2026-10-28.md).
