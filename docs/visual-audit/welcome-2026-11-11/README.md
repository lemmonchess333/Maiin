# The welcome and sign-in screens, 11 November 2026 (DS8)

The welcome screen's picture became the product (an example week, today's
session and a daily calorie target), and sign-in and sign-up open on a
drawn lifter who faces you. Both left the frosted card and carry the
lockup, the mark beside "Tropos". The decision is lock row DS8 in the plan
file and DESIGN_GUIDE §14p.

| File                 | What it shows                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `welcome-393.webp`   | The welcome screen before and after, 393 by 852                                                       |
| `welcome-320.webp`   | The same at 320 by 568: the picture gives up its lower edge and "Get started" stays on the screen     |
| `sign-in-393.webp`   | Sign-in before and after, 393 by 852                                                                  |
| `sign-in-320.webp`   | The same at 320 by 568: the heading takes two lines beside the lifter                                 |
| `sign-up-393.webp`   | Sign-up before and after                                                                              |
| `sign-in-lifter.gif` | The lifter's rep: the flipbook's 34 frames at 12 a second, set where the figure stands                |
| `phones.webp`        | Both screens with an iPhone 15's safe areas, and on an iPhone SE (375 by 667)                         |
| `large-text.webp`    | Four of the large-text frames: at 1.35x on a 320 px phone and at 2x the lifter gives way to the words |
| `light-393.webp`     | Both screens with the light theme forced, which a signed-out app never shows                          |

## Measured

- **Overflow.** The large-text spec's own measure (`layoutBreaks` and
  `brokenWords`, the spec's ignore list) on the three screens at 393 and
  320 px and at 100%, 135% and 200% text: no breaks. It was run against a
  local dev server, since the spec itself needs the emulator rig.
- **Colour** (`colourStats` from `scripts/design-qa/screenScore.ts`, 393 by
  852, dark): the welcome is 5.1% colour where it was 5.3%, and sign-in
  5.0% where it was 5.4%, both about 95% purple and under the 8% ceiling.
  The filled purple button is still each screen's largest patch of colour;
  DESIGN_GUIDE §14p says why it was not changed here.
- **One screen.** On an iPhone 15 (393 by 852 with its safe areas) the
  welcome shows its whole picture above "Get started", and sign-in fits
  from the lockup to "Sign up" without scrolling.

## How they were made

The real pages from a local dev server with placeholder Firebase config,
in Chromium at twice the size. Safe areas were set by overriding
`--safe-top` and `--safe-bottom`. The GIF sets each frame of the flipbook
on a capture of the page with the figure hidden; the page plays it with
`HeroMotion`. A phone decides the rest: the rows in
`docs/qa/pre-launch-backlog.md`.
