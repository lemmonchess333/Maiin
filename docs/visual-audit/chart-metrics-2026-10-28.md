# Exercise progress units and records

[Dark comparison](./chart-metrics-2026-10-28/chart-board-dark.html) · [Light comparison](./chart-metrics-2026-10-28/chart-board-light.html)

Exercise progress now names the selected metric and its unit. Tooltips keep fractional loads, such as **82.5 kg** or **181.9 lb**. The strength estimate is labelled **Est. 1RM**. The metric switch uses the existing accessible segmented control, with one selected option and arrow, Home and End key handling.

Personal-record markers now compare the metric you selected against all earlier sessions. Max Weight uses the heaviest load, Volume uses working-set volume, Reps uses total reps and Seconds uses the longest hold. Ties do not earn a new record. Earlier records still count when their sessions fall outside the displayed date range. Recent-session PR badges follow the same selection.

Every entry for the same exercise within a workout now contributes its working sets. Warm-ups remain excluded.

## References

[Tonal](https://mobbin.com/screens/49b9079a-87e6-434d-802e-25a9a9858077) shows metric tabs, an LBS chart label and a value with its unit. The [Hevy](https://mobbin.com/screens/e08c325b-da4c-4dcc-a871-2f119fbddde6) measurements screen shows metric controls and a fractional bodyweight value in kg. These screens informed unit presentation. Record calculations and repeated-entry aggregation fix errors reproduced in Tropos; the references do not establish that arithmetic.

## Measured baseline

The baseline is commit `1543cbe`, captured before the changes. Two isolated emulator accounts use the same four sessions, with kg and lb preferences. The oldest workout is outside the initial three-month range and contains the heaviest load, 100 kg. A later workout has two separate entries for the exercise.

| Check                                    | Before               | After                          |
| ---------------------------------------- | -------------------- | ------------------------------ |
| Weight records in the three-month chart  | 2 false records      | 0                              |
| Weight records after selecting All       | Not measured         | 1, at the older 100 kg session |
| Volume for the repeated exercise entries | 380 kg across 2 sets | 760 kg across 4 sets           |
| Volume records in the three-month chart  | 2                    | 3                              |
| Latest weight tooltip, kg                | 83, no unit          | 82.5 kg                        |
| Latest weight tooltip, lb                | 182, no unit         | 181.9 lb                       |
| Bodyweight rep records in the chart      | 0                    | 2                              |

Estimated strength and timed-hold charts each retain their two expected records in this fixture.

## Browser checks

Chromium and Linux WebKit checked both themes at 393 × 852 and 320 × 568, plus doubled text at 393 × 852. Neither engine produced page overflow. All metric targets measured at least 44 × 44 px, exactly one option was selected, and End selected and focused Volume. Max Weight is fully readable at the checked sizes. The spoken chart summary includes the metric and exact value with its unit; hold durations are announced in seconds.

Chromium reported no page errors. WebKit emitted local emulator access warnings for migration callables and Firestore streams, retained in its metrics. Chart and keyboard assertions passed in both engines. WebKit used a local HTML policy override to reach emulator ports; these checks do not constitute testing on a physical iPhone.

The directory contains baseline and corrected captures, browser metrics and self-contained comparison boards. Each board embeds the exact captured PNGs. Reference metadata is retained in `reference-notes.json`.

## Verification

All 10 new regression checks failed on the baseline. The corrected source passed 48 focused tests, including the existing history, bodyweight-label, chart tab-stop, rep-bucket and chart-mock audit checks.

The final `npm run verify` passed: lint, verifier tests, artwork checks, dependency cycles, TypeScript, production build, bundle limits and the full unit suite. The suite passed 1,333 files and 15,524 tests, with 13 files and 484 tests skipped. Prettier, `git diff --check`, browser-data assertions and embedded-capture checks also passed. No bundle budget was increased.

This follows the [Train navigation and session comparison pass](./train-progress-2026-10-28.md).
