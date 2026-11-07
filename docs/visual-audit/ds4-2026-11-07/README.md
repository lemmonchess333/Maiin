# DS4 mockups, 7 November 2026

Throwaway HTML mockups of the direction DS4 sets (DESIGN_GUIDE §0 and §14m),
next to the same screens as they were on main, captured on the emulator rig
at 393 px in dark. The mockups use the app's own tokens, fonts and art; they
are pictures of a target, not code.

| Mockup                            | Colour (share of the first screen)                      | Hero                              | Largest text                                                            |
| --------------------------------- | ------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `proposed-home-lift`              | 3.4% (limit 8%), purple leading                         | 54.5% of the screen, top at 58 pt | "Pull A", 36 px, 1.68x the next size                                    |
| `proposed-home-day1`              | 2.4%, one hue                                           | 54.5%                             | "Upper A", 36 px, 1.65x                                                 |
| `proposed-finish-new-best`        | 7.9% (reward band 5-15%), gold                          | 54.2%                             | "2,295", 96 px, 5.2x                                                    |
| `proposed-home-lift-purple-start` | 8.0%; the filled button becomes the largest colour area | 54.5%                             | as above; not chosen: the owner took the white Start on 7 November 2026 |

Before: `current-home`, `current-home-new`, `current-finish-lift` (the
finish frame is from the 31 October capture; the screen had not changed).

An earlier round (a purple flood across Home, 76 px type on Home, a flooded
finish screen with nine blocks) was measured against the research and
dropped: 35% colour against the 8% ceiling, and type above the 48 px a Home
screen reaches in the reference apps.

## Built: Home's hero

`built-home-*` are the Home hero as built, captured on the emulator rig on
7 November 2026 (a Saturday): the rich seeded account (`rich`, a lifting
day) and a new account straight from setup (`new`), at 393 and 320 px in
both themes. `lift-last-time` is the rich account with a last time written
on its lifts (its seed carries none), to show the comparison line; `run`
is the season athlete on a run day; `rest` is the rich account on Sunday.
Measured at 393 × 852: colour as pixels with S > 0.35 and V > 0.25; the
hero is today's session, from the top of its headline to its Start.

| Frame                       | Colour                      | Hero                | Next block | Largest text            |
| --------------------------- | --------------------------- | ------------------- | ---------- | ----------------------- |
| `built-home-rich-393-dark`  | 2.3% (limit 8%), purple 78% | 53.5%, top at 92 pt | 0.21x      | "Pull A", 36 px, 1.5x   |
| `built-home-rich-393-light` | 0.8% (limit 15%)            | 53.5%               | 0.21x      | as above                |
| `built-home-new-393-dark`   | 0.9%, purple 79%            | 53.5%               | 0.21x      | "Upper A", 36 px, 1.5x  |
| `built-home-run-393-dark`   | 2.3%, purple 55%            | 45.8%               | 0.25x      | "Free run", 36 px, 1.5x |

Before (the same accounts on main, `current-home` and `current-home-new`):
the rich account
at 7.1% colour with the purple Start the largest patch, the new account at
6.7%, and "Today" at 31 px over a 25 px session title.

## Built: the hero's four follow-ups (v2)

`built-home-*-v2-*` are Home after the four follow-ups the hero left open,
captured on the emulator rig on 7 November 2026: the rich account today (a
lifting day), on Sunday (its rest day), and on Sunday as a free runner
(`runMode: "freeform"`), at 393 × 852 and 320 × 693 in both themes. The
measures are the ones above. Colour leads with its hue's share. The picture
is the drawing's box as a share of the screen.

| Frame                          | Colour            | Leading hue | Picture         | Card radius             |
| ------------------------------ | ----------------- | ----------- | --------------- | ----------------------- |
| `built-home-rich-v2-393-light` | 1.99% (limit 15%) | purple 89%  | unchanged       | 16 pt (measured 15.4)   |
| `built-home-rich-v2-393-dark`  | 1.36% (limit 8%)  | purple 84%  | unchanged       | 16 pt                   |
| `built-home-rich-v2-320-light` | 1.62%             | purple 100% | unchanged       | 16 pt                   |
| `built-home-rich-v2-320-dark`  | 1.05%             | purple 100% | unchanged       | 16 pt                   |
| `built-home-rest-v2-393-light` | 2.04%             | purple 82%  | the walker, 12% | 16 pt                   |
| `built-home-rest-v2-393-dark`  | 1.27%             | purple 67%  | the walker, 12% | 16 pt                   |
| `built-home-free-run-v2-393-*` | 1.72% / 1.88%     | purple 59%  | the runner      | 16 pt; line "11.0 km …" |

- **Rest-day picture (rule 24, 26).** The leaf icon on a 120 pt tile (4.3%
  of the screen, and an icon, not art) is now the canonical athlete on an
  easy walk, one soft purple highlight on the calves, drawn for it
  (`docs/exercise-art/run-poses/rest-walk.jpg`, cut as the runners are). Its
  box is 147 × 280 pt, 12.3% of the screen at 393 and 18.6% at 320.
- **Light's leading hue (rule 11, 15).** The hero's glow had dark's stops
  in both themes, and on a pale page a tint counts as colour only from about
  0.7 alpha. Light's hero carried no counted colour, so the week's run
  segments and the Food card split it: the hero PR's light frame measured
  0.8% colour, purple 43%, against 2.3% on dark. Light now has its own
  stronger stops (`.hero-glow`), and the line's mark ring is full strength
  on light, since at half strength only dark showed it. On today's state
  (the main lift pictured, the badge row in view), `before-home-rich-v2-393-light`
  is 0.71% colour, purple 69%, against dark's 1.36%. After: 1.99%, purple
  89%, and dark is no longer louder than light on any state captured but the
  free run. The new stops on the hero PR's frame, simulated: purple 80%.
- **Card radius (rule 20).** Home's cards were 22 pt (`rounded-2xl`, the
  `hero` card size): Today's energy, Water, the first-week card, the
  starter goal's card, the day peek, "This week" and the first-meal card.
  They are now 16 pt, and what sits inside them (the first-week rows, the
  performance row, Water's icon tile) is 10 pt. The shared `cardClasses`
  and `Card` are unchanged; `StarterDoneCard` is shared with Train and
  changes there too.
- **A free run's line (rules 35, 41).** "11.0 km this week" over "7.0 km
  last week" (`freeRunHeroLine`); with nothing last week, the week's runs
  ("2 runs so far"); with no run in either week, "0 km this week" over
  "Finish your first run and it counts here".
- **Left open: the run day's hue.** The runner's lit muscles are purple and
  its glow coral. A coral glow strong enough to count split the light free
  run 41% purple, 40% coral, so a run's glow stays below what counts in both
  themes, and the free run leads with purple at 59%, under the 60% rule.
  Dark is 0.16 points louder there, from the tab bar's active pill, the Food
  card and the header, which are not the hero's. Choosing the run hero's
  one hue is an owner call.
