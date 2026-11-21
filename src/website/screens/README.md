# The website's app screens

Screens of the app as it runs, shown on troposfit.com (`AppScreen`,
the website’s design (#3428), "App screens"). Each is a crop of a capture from the
emulator rig (`docs/agents/capture-rig.md`) on the repo's seeded demo
accounts, so every name and number on them is made up: "E2E Tester", "Maya
Chen" and "Jordan Reyes" are the seeds' people. None is a real person's data.

The rig could not run where these were made (its Firestore emulator's
download host is blocked in that sandbox), so they are the most recent rig
captures already on main, cropped and saved again as WebP at quality 80.
Replace a file here with a fresh capture of the same screen when that
screen changes; keep the name, and change its row.

| File                   | Cropped from                                                                                 | Shows                                          |
| ---------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `home-today.webp`      | `docs/visual-audit/trim-2026-11-11/home-top-after-393-dark.webp`                             | Home: today's lift, its drawing, the week      |
| `food-day.webp`        | `docs/visual-audit/food-2026-11-11/built-6-wheel-after-393-dark.webp`                        | Food: the calories left, macros, the food log  |
| `lift-day.webp`        | `docs/visual-audit/lift22-2026-11-12/after-dark.webp`                                        | Train: a lift day's exercises, with a superset |
| `challenge-board.webp` | `docs/visual-audit/trim-2026-11-11/board-weekly-after-393-dark.webp`                         | Together: a weekly challenge's board           |
| `train-run.webp`       | `docs/visual-audit/plan-photos-2026-11-13/train-race-band.webp` (dark half, its left 392 px) | Train: the next run and the race plan          |

Four screens came later from the other build of the site (#3442), which ran
the rig through CI on 18 November on the same seeded accounts and saved
each at 660 px wide, cut at the tab bar's foot:

| File             | Shows                                                         | Page                   |
| ---------------- | ------------------------------------------------------------- | ---------------------- |
| `run.webp`       | A saved long run: the map coloured by pace, time, pace, climb | Running: every run     |
| `lift-best.webp` | A finished lift: Pull A done and a new best on the row        | Lifting: see it add up |
| `together.webp`  | Together: this week's challenge, the leagues, a Circle        | Social: a Circle       |
| `feed.webp`      | The feed: a morning run and a lift with two new bests         | Social: who sees what  |
