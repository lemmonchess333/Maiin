# Workout completion at larger text sizes

[Dark comparison](./workout-accessibility-2026-10-28/card-board-dark.html) · [Light comparison](./workout-accessibility-2026-10-28/card-board-light.html)

The muscles-worked card now puts its drawing above the list when the available width cannot accommodate both. Muscle names wrap, and set counts keep their own space. The standard phone layout still places the drawing beside the list.

At doubled text on a 393 × 852 viewport, the baseline card was 313 pixels wide but its content extended to 413 pixels. The corrected card and its content both measure 313 pixels. The same layout handles the fallback muscle figure.

## Browser checks

| Browser  | 393 × 852                           | 320 × 568                           | 393 × 852 with doubled text         |
| -------- | ----------------------------------- | ----------------------------------- | ----------------------------------- |
| Chromium | Both themes, no horizontal overflow | Both themes, no horizontal overflow | Both themes, no horizontal overflow |
| WebKit   | Both themes, no horizontal overflow | Both themes, no horizontal overflow | Both themes, no horizontal overflow |

Both browsers completed the following journey against the local Auth and Firestore emulators:

1. Add Bench Press and enter 67.5 kg × 9.
2. Open and close its form guide. The values remain 67.5 and 9, and focus returns to the guide button.
3. Complete the working set, finish and save.
4. Open the exact saved record with **View workout**.
5. Correct the set to 10 reps, save the correction and reload. The record still shows **67.5 kg × 10**.
6. Return to the previous page without reopening the completed session.

These are automated mobile browser checks, including Linux WebKit, rather than a physical iPhone Safari test. The WebKit test uses a local HTML policy override to permit emulator ports. It emitted emulator request warnings, recorded in its metrics; the journey assertions passed. Chromium reported no page errors.

Measurements and screenshots are in the adjacent folder. The comparison uses the committed `c5b7d57` component as its baseline, served separately from the corrected source. Screens are scrolled to show the card above the sticky footer.

## Verification

`npm run verify` passed: lint, verifier tests, artwork checks, dependency cycles, TypeScript, the production build, the chunk-size budget and the full unit suite. The suite passed 1,330 files and 15,496 tests, with 13 files and 484 tests skipped. Prettier and `git diff --check` also passed.

[Home comparison and next changes](./home-review-2026-10-28.md)
