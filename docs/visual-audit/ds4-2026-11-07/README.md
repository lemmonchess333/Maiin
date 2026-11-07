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
- **Left open: the run day's hue** (settled in v3, below: the runner and its
  glow are coral). The runner's lit muscles are purple and
  its glow coral. A coral glow strong enough to count split the light free
  run 41% purple, 40% coral, so a run's glow stays below what counts in both
  themes, and the free run leads with purple at 59%, under the 60% rule.
  Dark is 0.16 points louder there, from the tab bar's active pill, the Food
  card and the header, which are not the hero's. Choosing the run hero's
  one hue is an owner call.

## Built: finish screens

`built-finish-*` are the lift and run finish screens and the share card as
built, captured on the emulator rig on 7 November 2026 by
`e2e/screenshots/finish-screens.capture.spec.ts`. The lift's two registers
are the real `SessionCompleteScreen` in the finish lab (`/dev/finish`, a
pull day of 2,295 kg in 41 min: `best` with a new best on the row,
`routine` with none); `lift-first` is a real first workout on a fresh
account (`companion-finish.capture.spec.ts`, 375 px). The run's are real
saves on a fresh free runner: its first run (`first`, 5 km), a slower 3 km
(`routine`) and the 5 km loop faster (`best`: its fastest 1K and 5K). The
share cards are drawn at half size (540 × 960). Under Reduce Motion, so no
confetti is in a measured frame; `lift-best-confetti` is the one taken
with motion on.

Measured at 393 × 852 unless named: colour as pixels with S > 0.35 and
V > 0.25 (`python3 -I`, PIL and numpy), with its leading hue; the object's
drawn width (an `object-fit: contain` drawing's own pixels, a map band's
box) and top, and its height as a share of the screen; the largest text
against the next size. The first screen holds six blocks: the kicker, the
object, the session done, the figure with its caption, one line, and Share
with Done. Above Share and Done, the top of the next section peeks (its
heading and the top edge of its card, about 50 pt) as the cue that there
is more: "New bests" on a lift reward, "Your week so far" on a routine
lift, the stats card on a run. It is counted as a cue, not a block.

| Frame                           | Register         | Colour, lead               | Object                                  | Largest text         |
| ------------------------------- | ---------------- | -------------------------- | --------------------------------------- | -------------------- |
| `lift-best-393-dark` / light    | reward, new best | 5.4% / 5.9%, gold 98%      | 63% wide, top at 157 pt (18%), 27% tall | "2,295", 94 px, 4.7x |
| `lift-best-320-dark`            | reward, new best | 4.2%, gold 98%             | 61% wide, top at 177 pt (21%)           | "2,295", 77 px, 3.9x |
| `lift-first-375-dark` / light   | reward, first    | 4.1% / 4.5%, purple 86%    | the session's own drawing               | "90", 94 px          |
| `lift-routine-393-dark` / light | summary          | 0.2% / 0.1% (the muscles)  | 63% wide, top at 157 pt (18%)           | "2,295", 94 px, 4.7x |
| `run-best-393-dark` / light     | reward, new best | 8.7% / 9.3%, gold 83%      | map band, full width, top 0, 53% tall   | "5.00", 94 px, 4.7x  |
| `run-first-393-dark` / light    | reward, first    | 4.2% / 7.4%, coral 99%     | as above                                | as above             |
| `run-routine-393-dark` / light  | summary          | 1.6% / 1.1%, coral (route) | map band, 57% tall                      | "3.00", 94 px, 4.7x  |
| `share-lift-best`               | card, new best   | 5.4%, gold 94%             | the row drawing, 78% of the card wide   | "2,295", wide cut    |
| `share-run-best`                | card, new best   | 10.9%, gold 100%           | the route, gold                         | "5.02", wide cut     |
| `share-lift-routine`            | card             | 3.3%, purple 100%          | the row drawing                         | "2,295"              |

Before this pass (the first build, frames of the same names in its
commit): the drawing was 50% wide with its top at 106 pt and 21% tall, the
map band 38% tall, and a third of the first screen (about 180 pt on the
lift, 140 pt on the run) stood empty between the line and Share and Done.
The object's area now takes that height, the drawing is 63% wide (61% at
320), and the next section peeks. Colour at 393 dark went from 6.5% to
5.4% on the lift's best, since the same light now spreads over a taller
area, and from 8.3% to 8.7% on the run's.

Six text sizes on the lift reward (94, 20, 18, 16, 14 px and the peeking
heading), five elsewhere; the display figure in Archivo's wide heavy
italic, and one filled button, Done, neutral (DS4 call 1a). Dark is the
quieter theme in every pair but the lift's routine and the run's routine,
where both carry under 2% and the difference is the drawing's muscles and
the route. The purple light on dark is the softest of the three: at the
coral's stops the real first workout measured 5.9% on dark against 4.5% on
light, and at its own 4.1%.

A first of each sport is a first (owner, 7 November 2026): a lifter's
first run is rewarded as "You finished your first run!", and a runner's
first lift as a first workout (`earlierSessions`, `isFirstOfSport`). The
post keeps the account's first ("First session on Tropos"): a first of its
sport on the post would need a new moment, which `validPostMoment` in
`firestore.rules` refuses, so that waits for a rules release.

Before DS4: `current-finish-lift` (2.1% colour, about 9 blocks, 6 numbers,
4 buttons, a figure 23% wide inside a card). The run's finish before was
DS3's: the map in a card at 256 px, the distance at 48 px under a coral
"Nice run", a green "Run saved" banner, and a coral Done.

## Built: running in coral (v3)

The runner's lit muscles were drawn in the lifting purple. They are now
running's coral, recoloured as the poses are cut (`npm run art:run-poses`,
`scripts/art/recolour.ts`: hue to 348, saturation and lightness kept),
so every runner in the app changes with them: Home's run hero, Train's
two run cards (`ProgrammeRunSection`) and the run finish's runner without
a route. The cut-outs measure
hue 348, saturation 0.57, lightness 0.63 against the token's 348, 0.57,
0.61. The rest day's walker keeps its purple: a rest day belongs to the
plan, not to a run. `runPoses.test.ts` measures each cut-out's highlight.

With the runner coral, the run hero's glow is coral at the lift glow's
weight (`.hero-glow-run`), and a first session's tile on a run post is
coral (`postMomentLines`' `sport` tone).

| Frame                              | Colour | Leading hue | Before (v2)       |
| ---------------------------------- | ------ | ----------- | ----------------- |
| `built-home-free-run-v3-393-light` | 2.5%   | coral 94%   | 1.88%, purple 59% |
| `built-home-free-run-v3-393-dark`  | 1.2%   | coral 78%   | 1.72%, purple 59% |

Dark's other hues are the header's brand mark and streak, the tab bar's
active pill and the avatar, which are not the hero's.
