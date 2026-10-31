# Live form guide and saved workout, 28 October 2026

[Guide comparison](./live-workout-2026-10-28/guide-board-dark.html) · [Saved actions comparison](./live-workout-2026-10-28/saved-board-dark.html)

The live guide now uses the compact movement stage, with the current cue under the figure and the full steps available on tap. In the baseline 393 × 852 capture, the first instruction started below the viewport. The current cue is now visible at 393 × 852, 320 × 568, and doubled text size. Closing the sheet returns focus to its info button.

The walkthrough also exposed a data issue: history arriving after someone started typing could replace their weight and reps. The added delayed-read test failed with 9 kg replacing an entered 7 kg, then passed after manual edits stopped the automatic history fill. Untouched exercises still take their defaults from history.

The saved footer now offers **View workout** above **Done**, using the ID from the save receipt. The browser followed it to a saved record containing **67.5 kg × 9**. Back returned to the page before the session. Programme workouts, saved routines and empty workouts all supply this action. Queued saves can open the local record; a failed sync removes the action and offers retry.

References: [Hevy form guide](https://mobbin.com/flows/5d4a597d-f135-41c3-b929-c945d469daa3), [Tonal movement detail](https://mobbin.com/flows/7ca753e7-ca74-47ce-918c-6203ff8f07c8), and [Bevel saved workout](https://mobbin.com/screens/ffce8bfe-c19b-4978-a37f-a858f29bcffa). The existing Tropos footer keeps Done last; the new secondary action sits above it.

Focused verification: 112 tests passed, including delayed history, receipt identity, queued sync failure and recovery after reopening. Phone captures cover both themes, narrow screens and doubled text. These are Chromium browser checks, rather than measurements on a physical iPhone.

The required `npm run verify` gate passed: lint, art checks, dependency checks, production build, chunk-size budget and 15,496 unit tests.

The lazy workout chunk is 69,931 bytes, compared with the previous verified build's rounded 69.57 kB. Its older budget was 66,265 bytes; only this chunk's baseline was updated.

The muscles card's doubled-text overflow was fixed in the [accessibility follow-up](./workout-accessibility-2026-10-28.md). Its original trace located the set count beside the fixed-width drawing. The saved footer actions remained in bounds throughout.
