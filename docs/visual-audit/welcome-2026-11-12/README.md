# The welcome on photographs, 2026-11-12

Captures of the signed-out welcome after it moved from DS8's example week
to full-screen photographs of athletes (DESIGN_GUIDE §14p, last bullet;
`src/assets/welcome/README.md`). Taken from the dev server against the
emulator config with Chromium at 2x, the photographs given time to load.

| File                      | What it shows                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `before-after-393.webp`   | Before (the example week), then each of the five photographs as it plays, 393 × 852                |
| `before-after-320.webp`   | The same at 320 × 568: the headline at half the height, each face kept above it by its focus point |
| `iphone-se-375.webp`      | The five at 375 × 667 (9:16, shorter than the files' 9:19.5)                                       |
| `light-and-dark-393.webp` | The light theme beside the dark: the same, as the welcome uses the stage's fixed colours           |
| `large-text.webp`         | 1.35x and 2x text at 393 and 320 under Reduce Motion (the red bar is the emulator's warning)       |

Measured at the same time: nothing wider than the screen at either text
size; at 2x on 320 the page scrolls 90 px, which the large-text spec
allows; under Reduce Motion only the first photograph is fetched. The
headline's top sits at 578 of 852 (68 %) on a 393 phone.

Chosen against Strava's, Nike's and Tonal's welcomes on Mobbin; those
screens are not kept here.
