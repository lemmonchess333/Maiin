# Train navigation and exercise session comparisons

Train's day buttons now keep separate touch targets on narrow screens. At larger text sizes the day strip scrolls, and selection stays in view. Arrow keys, Home and End move selection and focus; only the selected day is in the Tab sequence.

Closing a workout now keeps manually entered weight, reps, notes and set edits before the first completed set. The browser walkthrough entered **57.5 kg × 9**, closed the workout, reloaded Train and resumed with those values intact. The new recovery rule starts with a manual edit. Start fresh clears the old draft; later manual edits can be kept again.

Exercise progress now puts the previous session's full top set below the current one. Sessions on the same day are ordered by their timestamps, and comparisons and PR markers use workout IDs. Warm-ups are excluded from working-set counts, volume and top-set comparisons. The chart's metric controls also meet the minimum touch height.

## Comparisons

[Train day strip](./train-progress-2026-10-28/train-board-dark.html) · [Resume edited workout](./train-progress-2026-10-28/resume-board-dark.html) · [Exercise sessions](./train-progress-2026-10-28/progress-board-dark.html)

The iOS [Equinox+](https://mobbin.com/screens/5a119924-6016-470e-9bc7-b9f09be567f4) and [Peloton](https://mobbin.com/screens/d539d7ba-721e-49a6-9efe-2e82f649463b) screens show a selected day above its sessions. [Hevy](https://mobbin.com/screens/4d2233ca-a56c-4244-bde5-821bf3f1b6a9) shows the weight and reps of successive exercise sessions. The responsive sizing, keyboard handling and inline Last wording are local implementation decisions. The recovery change fixes data loss reproduced in Tropos.

## Browser checks

Both Chromium and Linux WebKit checked dark and light themes at 393 × 852, 320 × 568 and doubled text at 393 × 852. Day buttons no longer overlap, the page stays within its width, and selecting a day outside the visible part of the strip reveals it. The browser selected the last day, checked its Make this next action, used Home to return to the first day and started its workout.

Both engines restored 57.5 kg and 9 reps after closing, reloading and resuming, with no second Resume confirmation. The exercise session link opened the matching saved workout. Chromium reported no page errors. WebKit emitted emulator access warnings, retained in its metrics; the journey assertions passed. These are automated browser checks, not a physical iPhone Safari test. WebKit uses a local HTML policy override to reach the emulator ports.

The baseline is commit `ba6f52f`, served separately from the corrected source. An isolated emulator account has three known sessions, including two on one day. The baseline gave both same-day rows the same negative weight comparison; the corrected rows show their distinct previous sets.

## Verification

The two new pre-completion recovery tests failed before the fix: neither the entered load nor the note reached a draft. All 53 focused tests now pass, covering draft recovery, added exercises, keyboard navigation and exercise comparisons, including bodyweight and timed holds.

The final `npm run verify` passed: lint, verifier tests, artwork checks, dependency cycles, TypeScript, production build, chunk-size budget and the full unit suite. The suite passed 1,331 files and 15,512 tests, with 13 files and 484 tests skipped. Prettier, `git diff --check` and the capture-data checks also passed. No bundle budget was increased.
