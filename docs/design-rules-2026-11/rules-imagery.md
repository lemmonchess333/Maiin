# Rules: imagery, iconography, rewards and first-use states

Area: how much of the first screen is a picture, and whose picture it is; icon style
and size; badge and medal art; reward and celebration screens; first-use and empty
states. These rules come from measuring 74 screens across 16 fitness and food apps,
plus 5 cross-check screens from Airbnb and Headspace. They are compared with 27
captured Tropos screens. Studied 7 November 2026.

Evidence sheets in this folder: `evidence-rewards.jpg`, `evidence-badges.jpg`,
`evidence-firstuse.jpg`. All downloaded screens are in `img/`. The scripts that
produced every number are in `scripts/`. The per-screen imagery numbers are in
`share.json`.

## How it was measured (read this before trusting a number)

- **Screens.** I used 74 reference screens from 16 apps: Apple Fitness, WHOOP, Oura,
  Strava, Nike Run Club (NRC), Hevy, Ladder, Runna, Fitbod, Gentler Streak, Bevel,
  Duolingo, MacroFactor, Cal AI, Yazio and Lifesum. Each app has 3 to 7 screens,
  sampled by type: home or today (15), a list (13), a detail (9), a reward (17) and
  day 1 or empty (20). The cross-check apps (Airbnb, Headspace) are reported apart
  and are not in any median. The Tropos screens are the 27 captured first viewports
  in `grill2/current/*-dark-fold.png`: 20 from a well-used account and 7 from a new
  account. 46 reference screens came from `grill2/refs/`. I added 66 screens from
  Mobbin and looked at every one before citing it.
- **Viewport.** One viewport is 393 × 852 pt. Mobbin images are 1179 px wide, so
  1 pt = 3 px, and I cut off the 120 px Mobbin footer. Fitbod's images are
  375 × 812 pt. Tropos frames are at 2x.
- **What counts as imagery.** I drew a bounding box, in pt, around each picture.
  I read the boxes off a 50 pt grid laid over each screen (`sheets/grid-*.jpg`,
  `sheets/tropos-*.jpg`), accurate to about ±5 pt. The boxes are in
  `scripts/annotations.py`. Five kinds count as imagery:
  - **photo**: photography;
  - **illus**: illustration, character, 3D object or drawn figure;
  - **badge**: award art;
  - **data**: rings, dials, gauges, maps, route lines and body maps;
  - **chart**: bar and line charts.

  These do **not** count: icons under about 48 pt, flat colour fields, gradients,
  confetti, and type at any size. "Imagery share" is the area of the union of the
  boxes divided by the viewport. "Largest element" is the biggest single box as a
  share of the viewport. For scale, 10 % of the viewport is a 183 × 183 pt square.

- **Badges.** For the silhouettes of Tropos's 30 badges, I compared the alpha masks
  of `public/badges/*.webp` pairwise using intersection over union (IoU), and left
  out the 4 seals. For the colour of reference badges, I cut out each badge, masked
  it against its local background, and counted the share of pixels with saturation
  above 0.35 and value above 0.25 ("colourful pixels"). I counted silhouettes and
  numerals by eye, one screen at a time.
- **Reward screens.** For colour, I took the share of the viewport in its single
  most common quantised colour, and the share of pixels with saturation above 0.45
  and value above 0.35 ("saturated share"). Object width and position come from the
  pt grid.
- **Love or tolerate.** I did not measure ratings or retention. All 16 apps are
  category leaders by reputation. Where a pattern comes from one app's brand, or is
  used to sell (for example Fitbod's first-workout paywall), I flag it under "Rules
  we should not copy".

### The headline numbers

| Measure (first viewport)                             | Reference apps (n = 74)                           | Tropos (n = 27)                     |
| ---------------------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| Imagery share, median (IQR)                          | **16 %** (10–33)                                  | **5 %** (0–14)                      |
| Median of the 16 apps' own medians                   | 14 % (range 6 Yazio to 83 Oura)                   | 5 %                                 |
| Largest single picture, median                       | 11 % of the viewport                              | 3 %                                 |
| Screens with a picture ≥ 10 % of the viewport        | 40 / 74 (54 %)                                    | 6 / 27 (22 %)                       |
| Screens with no imagery at all                       | 5 / 74 (7 %)                                      | 10 / 27 (37 %)                      |
| Home screens with a picture ≥ 10 %                   | 9 / 15                                            | 0 / 3                               |
| Detail screens with a picture ≥ 10 %                 | 9 / 9                                             | 4 / 4                               |
| Dedicated reward screens with one object ≥ 25 % wide | 10 / 10                                           | 0 / 1 (figure 23 % wide, in a card) |
| List screens: imagery share, median                  | 15 % (from many small pictures; largest only 3 %) | 0 % (7 of 12 have none)             |

Imagery share by app (median of that app's sampled screens): Oura 83, Gentler Streak
39, Ladder 36, Fitbod 25, Cal AI 22, Strava 20, Bevel 18, Apple Fitness 15, NRC 13,
WHOOP 13, Duolingo 12, Lifesum 11, MacroFactor 11, Runna 10, Hevy 10, Yazio 6.
Tropos: 5.

So the hooked-on apps are **not** picture books. Most sit at 10–25 %. The gap is that
Tropos has **no hero picture**, not that it lacks a photo background. Tropos's only
screen with a picture of 20 % or more is the run detail map, at 42 %. The reference
apps have one on 23 of 74 screens.

---

## 1. Rules

### Rule 1: Home, a session's detail and a finish screen each carry one picture of at least 10 % of the first viewport

- **Rule:** Home, a session or day detail, and a finish or reward screen each show
  at least one picture of 10 % of the first viewport or more (about 180 × 180 pt).
  Across the first viewport, the pictures add up to 15–45 %.
- **Evidence:**

  | Screen type  | Ref. imagery share, median (IQR) | Ref. largest picture, median (IQR) | Ref. screens with a picture ≥ 10 % | Tropos                                           |
  | ------------ | -------------------------------- | ---------------------------------- | ---------------------------------- | ------------------------------------------------ |
  | Home / today | 18 % (12–41)                     | 15 % (7–28)                        | 9 / 15                             | 12 % share, 6 % largest; 0 / 3                   |
  | Detail       | 29 % (25–42)                     | 29 % (15–42)                       | 9 / 9                              | 20 % share; 4 / 4 (run map, charts, space photo) |
  | Reward       | 16 % (12–36)                     | 15 % (10–36)                       | 13 / 17                            | 0 % (Weekly review)                              |

  The pictures that carry these screens:
  - Apple Fitness's day ring is 270 × 275 pt, 22 % of the viewport
    ([527bed87](https://mobbin.com/screens/527bed87-fe98-4e4d-b778-b635c9475df5)).
  - Fitbod's body map takes 44 %
    ([90d727e0](https://mobbin.com/screens/90d727e0-3f31-4c10-abc9-c9fd9d8b28c1)).
  - Ladder's coach photo takes 52 %
    ([0e0eb164](https://mobbin.com/screens/0e0eb164-8560-4d10-b8bf-93017db938fa)).
  - NRC's run map takes 34 %, under a "3.76" numeral about 60 pt tall
    ([2a0aaccb](https://mobbin.com/screens/2a0aaccb-b97b-4764-8d8d-5a4622e5974f)).

  The exceptions are WHOOP's home (three 100 pt dials, largest 3 %,
  [4e7d8b71](https://mobbin.com/screens/4e7d8b71-ac46-472f-8e31-b619f5e533ae)) and
  Runna's today list (1 %,
  [be9b0bcc](https://mobbin.com/screens/be9b0bcc-6c28-4abf-bde0-6b046df1207d)).
  Both are loved apps. WHOOP makes up for it with three coloured dials in a row, and
  Runna with colour-edged cards.

- **Why it works:** a picture of the person's own day, such as their ring, their
  route or their muscles, can be read in under a second, before any text. It is the
  thing that changes between visits, so it is the reason to open the app.
- **Tropos today:** §0.1 says "don't introduce new colours, gradients, or decorative
  elements", and §14j says "when polishing, focus on type weight, spacing and
  shadows". Neither tells a designer to make a picture big. On Home, the form figure
  in today's card is 70 × 130 pt, 2.7 % of the viewport, or 5.6 % for a new account.
  The calorie ring is 105 pt, 3.5 %. The Weekly review has no picture at all.
- **Proposed wording (§6, new "Hero picture" row):** "Home, a session's detail and a
  finish screen each give one picture at least 10 % of the first viewport (about
  180 × 180 pt). The picture is today's session figure, the route map, the ring, or
  the muscles worked. A picture is content, not decoration: §0.1 forbids decoration,
  not pictures of the person's own training."

### Rule 2: every row that stands for a session, a person or an award carries its own picture

- **Rule:** in a list, a row that stands for a session, a person, a challenge or a
  badge shows that thing's own picture, between 36 and 80 pt: its route, form
  figure, photo, avatar or badge art. A sport icon in a tinted tile does not count.
  Rows for settings and plain text are exempt.
- **Evidence:** on reference list screens the median imagery share is 15 % (IQR
  11–21), but the largest picture is only 3 %. The imagery comes from many small
  pictures, one per row. 12 of 13 reference list screens have imagery; the exception
  is Hevy's set logger, 1 %, which is a table. Examples:
  - Strava's challenges list has a different 65 pt badge on every row
    ([a8e6856f](https://mobbin.com/screens/a8e6856f-3b93-44e6-bf5e-789b0b438171)).
  - Fitbod's session list has a 65 × 120 pt demo photo per exercise
    ([e3dbfe3e](https://mobbin.com/screens/e3dbfe3e-150c-4f42-9773-04715f96b12f)).
  - Strava's best efforts has a route thumbnail per run
    ([59475482](https://mobbin.com/screens/59475482-3c4a-454c-bf44-936537dbd933)).

  Tropos: list screens have a median of 0 %, and 7 of 12 have no imagery. Training
  history, the plan, Run setup, notifications and both profiles show only small
  sport icons in tinted tiles.

- **Why it works:** a picture per row makes a history feel like a collection the
  person built ("my runs"), not a log. It also lets the eye find a row by its shape
  before reading.
- **Tropos today:** rows in `/history/sessions` and `/program/plan` use a sport icon
  tile of about 30 pt. Tropos already has the art these rows need: form figures, the
  route drawing and badge art.
- **Proposed wording (§6):** "A row that stands for a session, a person or an award
  leads with that thing's own picture (36–80 pt): a lift's form figure, a run's route,
  a badge. A sport icon tile is for rows with nothing of their own to show."

### Rule 3: imagery comes from the person or from Tropos's own art, not from stock

- **Rule:** at least 80 % of the imagery area on personal surfaces (Home, Train,
  Food, History, Profile) is the person's own data, maps or photos, or Tropos's own
  art (form figures, badges, medals). Generic photography may appear only on
  community and event surfaces: races, spaces and challenges.
- **Evidence:** imagery area across the 74 reference screens, by source:

  | Source                                                   | Share of imagery area | Screens                     |
  | -------------------------------------------------------- | --------------------- | --------------------------- |
  | The app's own art (illustration, 3D, badges, figures)    | 36 %                  | 42                          |
  | The person's data drawn (rings, maps, body maps, charts) | 32 %                  | 31                          |
  | Generic photography (landscape, race, brand)             | 19 %                  | 5 (3 of them Oura)          |
  | The app's own photography (coaches, exercise demos)      | 6 %                   | 3 (Ladder, Fitbod)          |
  | The person's own photos                                  | 6 %                   | 4 (Strava, Hevy ×2, Cal AI) |

  13 of the 16 apps showed no generic photography in the sample. The 3 that did were
  Oura's landscape backgrounds
  ([bfe532d9](https://mobbin.com/screens/bfe532d9-62fe-4246-9775-9c8934195bcb)),
  Runna's race photo behind a finished plan
  ([dd04b27a](https://mobbin.com/screens/dd04b27a-9195-44c7-8c19-f15cd7def913)), and
  Strava's partner-challenge banner
  ([a8e6856f](https://mobbin.com/screens/a8e6856f-3b93-44e6-bf5e-789b0b438171)).
  The most-copied "own art" is the anatomical figure: Hevy
  ([80f164aa](https://mobbin.com/screens/80f164aa-c011-4469-ba7a-158116427cab)),
  Fitbod, and Tempo's muscle map
  ([ffece9a9](https://mobbin.com/screens/ffece9a9-c86b-46a0-a023-28bc7c6aceeb), seen
  but not in the 74). Tropos's form figures are the same kind of asset.

- **Why it works:** a picture that is about the person ("your route", "your muscles
  today") is identity and progress. A stock photo of someone else is decoration, and
  it is the same for every user, so it stops being seen after the first week.
- **Tropos today:** Tropos's imagery is already mostly its own: figures, rings, the
  route map and badges. Its stock-like photos are the challenge card ("Weekly
  Warrior") and the space heroes, which this rule allows.
- **Proposed wording (§1):** "Pictures are the person's own (data drawn, their
  route, their photos) or Tropos's own art (form figures, badges, medals). Generic
  photography belongs only to events and places: a race, a space, a challenge."

### Rule 4: each badge family has its own silhouette and its own colour, and the tier metal is not the only colour

- **Rule:** a badge collection uses at least 3 distinct outer silhouettes, one per
  family (for example consistency, distance, strength, food), and each family has an
  enamel colour of its own. The tier metal is the rim, not the whole colour story.
  Test: put the collection's alpha masks side by side. The median pairwise IoU must
  be below 0.8.
- **Evidence:**

  | Collection                                                                                                                                                                                                                                | Distinct silhouettes (by eye)                                                   | What carries the colour                     |
  | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------- |
  | Apple Fitness [385c1711](https://mobbin.com/screens/385c1711-6119-4b91-8ec2-50851648825a)                                                                                                                                                 | 5 of 5, every award unique                                                      | 3D enamel per award                         |
  | WHOOP [ee83cea3](https://mobbin.com/screens/ee83cea3-9161-406c-961b-76910c776c88), [d3bdc04c](https://mobbin.com/screens/d3bdc04c-fde1-4308-8076-fe23c9162a51)                                                                            | 4: hex (sleep), shield (recovery), diamond (strain), round (healthspan)         | category colour: green, blue, teal          |
  | NRC [f6d1fbc9](https://mobbin.com/screens/f6d1fbc9-36f4-4d2f-b182-54a4a1840acb), [c07489f7](https://mobbin.com/screens/c07489f7-ad1c-47f5-b464-1eaf73a7102b), [90985f45](https://mobbin.com/screens/90985f45-1852-4344-a154-733aba12ce02) | 4: shield (PRs), numeral-arrow (streaks), sticker (challenges), plate (monthly) | volt on black; metals for the monthly tiers |
  | Ladder [7b497200](https://mobbin.com/screens/7b497200-e56e-41f8-a058-50683b2c590b)                                                                                                                                                        | 4: shield, plate, circle, triangle                                              | subject art (wolf, flame, rocket)           |
  | Cal AI [40849b04](https://mobbin.com/screens/40849b04-f210-49aa-8144-e830e38a2710), [a67ac8fb](https://mobbin.com/screens/a67ac8fb-bd7b-49c5-ba86-29d70fc21024)                                                                           | 3–4: hex, circle, winged shield, portrait                                       | subject per badge (lettuce, nut, plate)     |
  | Duolingo [27423508](https://mobbin.com/screens/27423508-e523-49a9-a2bd-2c8eabe9e661)                                                                                                                                                      | 9 of 9 (a character per award)                                                  | full palette                                |
  | Strava milestones [25f88039](https://mobbin.com/screens/25f88039-90f9-4175-8e8c-d78ca6d658af)                                                                                                                                             | 1 (hex with a numeral); challenge badges vary                                   | navy and orange                             |
  | **Tropos, 30 badges**                                                                                                                                                                                                                     | **1** (pairwise alpha-mask IoU median 1.00, min 0.99)                           | tier metal only                             |

  Measured colour: Tropos's 30 badges have a median of 23 % colourful pixels. 15 of
  the 30 have no colourful hue at all (silver and platinum), and the other 15 all sit
  in the red-orange to orange bins (bronze and gold). Earned badges in the reference
  apps spread across green, cyan, blue, yellow, violet and red: WHOOP 22 %, Strava
  50 % and Cal AI 50 % colourful.

  Strava is the one reference that uses a single hex for its milestones, so "one
  shape" is not fatal. But Strava puts the number on it, and its challenge badges
  vary (see `evidence-badges.jpg`).

- **Why it works:** collecting depends on telling items apart at a glance. With
  different shapes, a trophy case reads as a set of different things. With one shape
  it reads as one thing repeated. The silhouette also tells the family before the
  label is read.
- **Tropos today:** the 30 badges are one dark hex in four metals with a glowing
  glyph (`public/badges/*.webp`). §14l already moved medals to a round coin, and
  leagues to a shield with chevrons (`TierBadge`). That makes three silhouettes
  across Tropos's rewards, but only one inside the badge collection.
- **Proposed wording (§14, badges):** "Each badge family has its own silhouette and
  enamel colour, taken from the domain's colour (purple lifting, coral running,
  orange food, teal water, gold a new best). The tier is the rim metal. A collection
  never reads as one shape repeated: the median pairwise silhouette IoU stays below
  0.8."

### Rule 5: a count or distance badge carries its number in the art

- **Rule:** a badge earned for a number (days, sessions, km, kg, a distance) shows
  that number as part of the art, legible at 64 pt.
- **Evidence:** 74 of 103 badges (72 %) across 11 collection screens in 7 apps carry
  a numeral in the art. By collection:
  - NRC streaks: 11 of 11 ("3X", "5X", "12"). NRC PRs: 9 of 11 ("1K", "13.1",
    "26.2", "25MI"). NRC challenges: 4 of 10.
  - Cal AI milestones: 11 of 11 ("3 STREAK" to "1000 STREAK"). Cal AI subjects: 8 of
    15 ("10 lb", "200 lb").
  - WHOOP: 8 of 8, and 6 of 10 on the healthspan tab. Duolingo: 9 of 9 ("845",
    "2225").
  - Ladder: 4 of 6 ("100", "01 STREAK", "7X").
  - Strava: 3 of 7 visible (the locked hexes hide theirs).
  - Apple: 1 of 5 ("100").

  Tropos: **0 of 30.** `10k_club` is a target, not "10K", and `two_plate` is two
  plates, not "2".

  The number is also the reward's hero:
  - WHOOP's achievement page is a shield around a "10", 70 pt tall
    ([ff4d5412](https://mobbin.com/screens/ff4d5412-608d-4566-81b8-c22f90ab0a28)).
  - Runna's PR is a hex reading "1K"
    ([0e8a24e7](https://mobbin.com/screens/0e8a24e7-31ae-4657-bc16-6ace3abc70ea)).

- **Why it works:** the number is what the person did. Showing it makes the badge
  specific ("my 100th") and makes the next tier legible ("50 → 100"), which is the
  completion pull.
- **Tropos today:** badge names carry the number ("Two Week Wonder", "Century Club"),
  but the art does not.
- **Proposed wording (§14, badges):** "A badge for a count or a distance shows the
  number in its art (Archivo, legible at 64 pt). A badge for a quality (Early Bird,
  Balanced) shows its subject."

### Rule 6: a locked badge is the same art, greyed, with its goal and progress showing (keep what Tropos does)

- **Rule:** a locked badge is drawn as its own art with no saturated colour, its
  silhouette and number still readable, and a progress bar or "4 of 5" under it. It
  is never hidden, and never a generic lock tile.
- **Evidence:**
  - In all 6 collections measured with locked items, locked badges had **0 %**
    colourful pixels. Earned badges had a median of 12–50 %.
  - 4 of 6 keep the art legible when locked:
    - NRC: light-grey ghosts of "1K" and "26.2"
      ([f6d1fbc9](https://mobbin.com/screens/f6d1fbc9-36f4-4d2f-b182-54a4a1840acb)).
    - Apple: line drawings with "0 of 100" and a bar
      ([385c1711](https://mobbin.com/screens/385c1711-6119-4b91-8ec2-50851648825a)).
    - Cal AI: grey embossed "1000 STREAK"
      ([40849b04](https://mobbin.com/screens/40849b04-f210-49aa-8144-e830e38a2710)).
    - Ladder: dark outline of the badge's own form
      ([7b497200](https://mobbin.com/screens/7b497200-e56e-41f8-a058-50683b2c590b)).
  - 2 of 6 put a padlock over a plain shape: Strava's milestone hexes, and WHOOP's
    shapes with a "0".
- **Why it works:** seeing the goal drawn, but not yet coloured, is the completion
  urge. Hiding it removes the goal.
- **Tropos today:** **already compliant.** Locked badges on the Badges page are the
  same hex, desaturated, with the glyph visible and a progress bar ("6/7 days").
  Keep it, and add the number from Rule 5 to the greyed art.
- **Proposed wording:** "A locked badge is its own art in grey (no saturated
  colour), with its number and its progress. Never a padlock tile, never hidden."

### Rule 7: a reward screen is one object, one figure, one sentence and one button

- **Rule:** a dedicated reward screen shows:
  - one object (badge, medal, flame, figure or photo card), 40–75 % of the screen
    width, centred in the upper 40 % of the screen;
  - at most one hero figure, fused with the object or directly under it;
  - at most one sentence;
  - one primary action, with Share secondary at most.

  It has no more than 6 blocks in all. No settings, no list of other figures.

- **Evidence:** 10 dedicated reward screens (`evidence-rewards.jpg`):

  | Screen                                                                                            | Moment           | Object, % of width            | Hero figure        | Sentences | Primary actions | Confetti | Saturated share |
  | ------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------- | ------------------ | --------- | --------------- | -------- | --------------- |
  | Apple award [ef801eab](https://mobbin.com/screens/ef801eab-0b55-4042-8763-0f980714b094)           | weekly streak    | 74 (3D award)                 | none               | 1         | 0               | no       | 5 %             |
  | NRC "You're on fire" [931d5b5c](https://mobbin.com/screens/931d5b5c-bc58-44f6-80e1-478c4ae9d594)  | 3 runs in a week | 62 (enamel "3X" pin)          | in the art         | 1         | 1               | no       | 92 %            |
  | Duolingo streak [84ec5a7b](https://mobbin.com/screens/84ec5a7b-37ce-4c38-808d-7c3c91c3c0aa)       | streak + 1       | 41 (flame)                    | "5", ~95 pt        | 0         | 2               | no       | 94 %            |
  | Duolingo first lesson [a5edfc91](https://mobbin.com/screens/a5edfc91-474c-4ff6-b1b2-e418bfe5a383) | first lesson     | 47 (owl)                      | 3 tiles            | 1         | 1               | no       | 14 %            |
  | Yazio 3-day [7c901d3e](https://mobbin.com/screens/7c901d3e-fe7b-441f-bb89-75cd282d8c4c)           | streak milestone | 25 (flame)                    | "3", ~55 pt, fused | 1         | 1               | no       | 2 %             |
  | Lifesum first meal [18f6c48f](https://mobbin.com/screens/18f6c48f-2457-4836-b989-3c470c46abb1)    | first meal       | 100 (watercolour trophy)      | none               | 1         | 1               | no       | 10 %            |
  | Runna fastest 1K [0e8a24e7](https://mobbin.com/screens/0e8a24e7-31ae-4657-bc16-6ace3abc70ea)      | PR               | 45 (hex "1K")                 | "2:25", ~30 pt     | 0         | 0 (close)       | yes      | 2 %             |
  | Runna plan done [dd04b27a](https://mobbin.com/screens/dd04b27a-9195-44c7-8c19-f15cd7def913)       | plan complete    | 39 (badge on a photo)         | none               | 1         | 1               | yes      | 1 %             |
  | Ladder workout done [05f70a6f](https://mobbin.com/screens/05f70a6f-c904-497f-af89-df41f6846b44)   | every workout    | 53 (3D coin "1")              | in the art         | 0         | 1               | a few    | 2 %             |
  | Hevy first workout [db9dd20e](https://mobbin.com/screens/db9dd20e-1263-4da0-88ef-4fdca528cc6a)    | first workout    | 94 (photo share card)         | 3 on the card      | 1         | 1               | yes      | 8 %             |
  | **Tropos "Workout saved"** (`current/finish-oct31-dark.png`)                                      | every lift       | **23** (figure inside a card) | **6 figures**      | 0         | **4**           | no       | 3 %             |

  Summary across the 10 reference screens:
  - Object width: median 50 %, range 25–100 %.
  - Object centre: median y = 300 pt, 35 % down the screen (range 220–472 pt).
  - Sentences: 10 of 10 have one or none.
  - Primary actions: median 1.
  - Blocks: median 5–6.

  The Tropos finish screen has about 9 blocks: title, subtitle, a row of 3 figures, a
  muscles card, "Next", "Your week so far", a "Share sessions automatically?" card
  with 2 buttons, View workout, and Done.

- **Why it works:** peak-end. One object at poster size makes the moment different
  from every other screen, so it is remembered. It also works as the share image as
  it stands. Each extra block turns the moment back into a form.
- **Tropos today:** §10a says success states use "neutral specific copy, plus Undo
  or an edit route. No automatic sharing, no extra celebration dialog." §14l allows
  rewards to be loud, but only medals and leagues (Social) and the badge capsule get
  a reveal. The finish screen is a receipt.
- **Proposed wording (§14l, extended):** "A reward screen holds one object at 40–75 %
  of the width in the upper 40 %, one figure, one sentence and one primary action (Share
  may sit beside it). Everything else, such as week so far, sharing settings and
  muscles, goes on the summary that follows."

### Rule 8: the reward stage stays the page colour, and colour lives in the object and its glow

- **Rule:** on a reward screen, saturated colour covers at most about 30 % of the
  viewport, carried by the object and a glow behind it in the moment's domain colour.
  The page background stays the app's own (`#0E0E11` in dark). A headline on a
  coloured field meets 3:1 contrast. Tone-on-tone is not allowed.
- **Evidence:**
  - Saturated share across 17 reference reward screens: median **5 %**, range 1–94 %.
  - Only **2 of 17** flood the screen with one saturated colour: NRC's volt (92 %)
    and Duolingo's orange (94 %), each the app's own brand colour.
  - 13 of 17 keep the app's ordinary page, dark or white, as the stage: 11 of them
    at 70–92 % in one neutral colour, plus Hevy and Runna on white behind a photo
    card. Oura's 2 use a photo or a gradient as the stage. The colour comes from the
    object: Apple's green enamel, Ladder's lime coin rim,
    WHOOP's green glow (16 %,
    [ff4d5412](https://mobbin.com/screens/ff4d5412-608d-4566-81b8-c22f90ab0a28)),
    Yazio's purple header on day 1 (28 %,
    [84b1eadf](https://mobbin.com/screens/84b1eadf-f94e-43a7-84e6-838d039aeaa1)).
  - NRC's tone-on-tone headline measures **1.76:1** against its volt (sampled
    `#A3C236` on `#D5FF45`), below WCAG's 3:1 for large text.
  - Tropos's finish screen: 3 % saturated, 85 % `#0C0C0C`. Its colour is already in
    range; what it lacks is the object.
- **Why it works:** a single bright object on a quiet stage reads as a trophy under
  a spotlight. Runna's 1K is literally a spotlight
  ([0e8a24e7](https://mobbin.com/screens/0e8a24e7-31ae-4657-bc16-6ace3abc70ea)). A
  full flood works for an app with one brand colour. With five domain colours it
  would read as five different apps.
- **Tropos today:** the medal reveal (§14l) already does this: a dark stage, the
  tier's light and the medal. The proposed art direction
  (`grill2/art-direction.md` §2, "colour floods heroes and rewards") goes further
  than the evidence on rewards.
- **Proposed wording (§14h / §14l):** "A reward keeps the dark stage. Its colour is
  the object and one radial glow in the moment's domain colour (gold for a new
  best), about 30 % of the viewport at most. No full-bleed colour field, and no
  tone-on-tone text."

### Rule 9: firsts, streak milestones, PRs and finished plans get a full-screen moment; a routine session gets a summary with a picture

- **Rule:** four moments open a dedicated reward screen (Rule 7) once, automatically
  after Finish:
  - the first session of each sport, and the first meal logged;
  - a streak milestone (7, 14, 30 … days);
  - a new best (PR, fastest 1K or 5K, longest run);
  - a plan or programme completed.

  A routine session ends on its summary, which still leads with a picture of at
  least 10 % (Rule 1): the route map, the figure with the muscles worked, or the
  distance as a figure of 64 pt or more. Confetti only for firsts, PRs and a
  completed plan.

- **Evidence:** which moments have a dedicated full screen in the sample:

  | Moment                | Apps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
  | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | First session or meal | 6: Hevy ([db9dd20e](https://mobbin.com/screens/db9dd20e-1263-4da0-88ef-4fdca528cc6a)), Duolingo ([a5edfc91](https://mobbin.com/screens/a5edfc91-474c-4ff6-b1b2-e418bfe5a383)), Lifesum ([18f6c48f](https://mobbin.com/screens/18f6c48f-2457-4836-b989-3c470c46abb1)), Fitbod ([b4ed960b](https://mobbin.com/screens/b4ed960b-cea8-4ae5-a237-15aefee55660)), Ladder ([05f70a6f](https://mobbin.com/screens/05f70a6f-c904-497f-af89-df41f6846b44)), WHOOP first week ([9214ddad](https://mobbin.com/screens/9214ddad-b502-43c5-aa25-70bd056e2c76)). Strava marks it inline: "Kudos on your first activity!" ([f795b44a](https://mobbin.com/screens/f795b44a-b478-4140-a625-83b44be19963)) |
  | Streak milestone      | 7: Duolingo, NRC, Yazio, WHOOP ([cf90dbe1](https://mobbin.com/screens/cf90dbe1-9588-43d7-a465-47aae3bcada4): even day 1 gets a flame and a "1"), Apple, Cal AI, Ladder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | PR or fastest effort  | 1 full screen (Runna, [0e8a24e7](https://mobbin.com/screens/0e8a24e7-31ae-4657-bc16-6ace3abc70ea)) and 3 inline: Strava's medal card on the map ([c7214e38](https://mobbin.com/screens/c7214e38-9958-4220-8a65-f2c79863c8e0)), Fitbod's records list, NRC's PR badges                                                                                                                                                                                                                                                                                                                                                                                                                   |
  | Plan or goal complete | 3: Runna ([dd04b27a](https://mobbin.com/screens/dd04b27a-9195-44c7-8c19-f15cd7def913)), NRC "1 RUN COMPLETED" ([3f7b1e8c](https://mobbin.com/screens/3f7b1e8c-94a7-4460-9b80-3f3db7df0ccf)), Oura goal reached ([2f2a48a2](https://mobbin.com/screens/2f2a48a2-ce16-4c80-ad9a-b5d744e20f1d))                                                                                                                                                                                                                                                                                                                                                                                            |
  | Every routine session | Loud in 3: Duolingo, Ladder, Fitbod (records and confetti). A calm summary in 4: Apple ([08f4f651](https://mobbin.com/screens/08f4f651-0a4f-488f-91e6-c2ad9c341241)), NRC (the distance at about 60 pt plus a map, [2a0aaccb](https://mobbin.com/screens/2a0aaccb-b97b-4764-8d8d-5a4622e5974f)), Runna (a map, [1afab035](https://mobbin.com/screens/1afab035-c451-4884-9ad2-972e6ef168c6)), Strava                                                                                                                                                                                                                                                                                     |

  Confetti appears on 5 screens: Hevy first workout, Runna plan done, Runna fastest
  1K, Fitbod records, and Ladder (every workout). 4 of the 5 are a first, a PR or a
  finished plan. No streak screen in the sample uses confetti.

- **Why it works:** the first time is the moment most likely to decide whether a new
  person comes back. Hevy, Duolingo and Lifesum make it the loudest screen in the
  app. Saving the full screen for real milestones keeps it rare enough to mean
  something. A 4-day-a-week lifter would see a per-session celebration about 200
  times a year.
- **Tropos today:**
  - §10a forbids "an extra celebration dialog".
  - FV1 and §14l keep rewards off Home, and badges open on tap from the NewBadgeRow.
  - A PR or a first session is a gold row on the receipt (`SessionCompleteScreen`,
    `postMoments.ts` `firstSession`).

  Nothing in Tropos marks a first workout as different from the 200th. The finish
  screen is not Home, so a moment there does not break "never over Home".

- **Proposed wording (§10a and §14l):** "After Finish, a first session of a sport, a
  streak milestone, a new best or a finished plan opens its reward screen once
  (Rule 7), then the summary. Every other session goes straight to the summary, which
  leads with its picture. Confetti only for a first, a new best or a finished plan.
  Reduce Motion fades in and throws nothing."

### Rule 10: a metric at zero is drawn full-size at zero, with its goal

- **Rule:** when a figure, ring, chart or grid has no data yet, draw it at full size
  in its empty state: the ring as a track, the chart's axes and target line, the
  grid's cells, "0 of 3". Add one line saying what fills it. Never replace it with an
  icon block.
- **Evidence:** I classified 45 first-use and empty instances across the 16 apps
  (`scripts/empty_tally.py`). Where the empty thing is a metric, 15 of 18 draw it
  full at zero and 3 use an icon (Hevy ×2, Ladder ×1). Examples:
  - MacroFactor's dial at "0 consumed / 2041 target" and an empty 7 × 4 grid
    ([0a81aa3f](https://mobbin.com/screens/0a81aa3f-649c-44f9-b5ca-626482d70c50),
    [dc491be6](https://mobbin.com/screens/dc491be6-b85b-4eb3-846e-1468b0be0840)).
  - Lifesum's 8 glasses, 4 broccoli and 3 apples drawn faded
    ([9ae60ebf](https://mobbin.com/screens/9ae60ebf-ca1e-4f22-ae27-dce31eed3db4)).
  - NRC's "0.0" at full display size over an empty week chart
    ([58c10cac](https://mobbin.com/screens/58c10cac-14ca-40ab-8ead-372aef4d5ed2)).
  - Cal AI's ghost rings and a ghost meal card
    ([928beeca](https://mobbin.com/screens/928beeca-5bc5-4dfd-bc7a-d52753bb359a)).
  - Bevel's tiles keep their gauge shells with "No data"
    ([c4c26ac5](https://mobbin.com/screens/c4c26ac5-84f1-4e1c-9c76-19dfd00eeb2e)).
  - Yazio's grey flame at "0" with 7 outlined flames
    ([a1866274](https://mobbin.com/screens/a1866274-9fc1-4c95-89b1-db0d40ff68af)).

  Badge collections behave the same way: 4 of 5 show the locked set drawn (Rule 6).

- **Why it works:** the empty goal is the most motivating thing a new person can
  see. It shows exactly what "full" looks like, so the first entry visibly moves
  something. An icon says "nothing here" and shows nothing to aim at.
- **Tropos today:**
  - Food (the 2,740 kcal ring) and the Home calorie ring already do this.
  - Analytics on day 1 replaces the whole page with the hexagon "No analytics yet"
    (`current/new-history-dark-fold.png`).
  - The profiles' "Shared this week: Nothing yet." is a text-only card where the
    week's 7 days could be drawn empty.
- **Proposed wording (§10a, First use):** "A metric with no data is drawn at full
  size, empty: the ring's track, the chart's axes and target, the grid's cells, '0 of
  3'. One line under it says what fills it and when. The EmptyState block is never
  used in place of a metric."

### Rule 11: the first-use screen leads with the first action, and the hexagon icon block is a last resort for lists

- **Rule:**
  - **Day 1 of a tab:** the hero is the first action as a card, the same size as the
    later hero, with the session, step or person and its button. Add one line saying
    when the rest fills in ("ready after your first week").
  - **A list with no items:** draw a ghost of one item in the item's own shape, or
    use own art (at least 120 pt).
  - **The icon-plus-"Nothing yet" block:** at most one per screen, only for a list
    whose items cannot be drawn ahead (for example notifications), and never as the
    only thing on a tab's first screen.
- **Evidence:** treatments across the 45 instances in 16 apps:

  | Treatment                                  | Instances | Apps                                                                           |
  | ------------------------------------------ | --------- | ------------------------------------------------------------------------------ |
  | Goal or content drawn full at zero (ghost) | 23 (51 %) | 12 apps                                                                        |
  | First action as the hero                   | 7 (16 %)  | Duolingo, Gentler Streak, Ladder, Oura, Runna, Strava, WHOOP                   |
  | Icon + "nothing yet"                       | 7 (16 %)  | **3 apps: Hevy 5, Strava 1, Ladder 1**                                         |
  | Own illustration, 3D or character          | 3 (7 %)   | NRC, Strava (plus 5 of 7 cross-check: Airbnb 3D objects, Headspace characters) |
  | Text only                                  | 3 (7 %)   | MacroFactor, Strava                                                            |
  | Blank                                      | 2 (4 %)   | Strava                                                                         |

  By what is empty:
  - A day-1 home: 7 of 8 lead with the first action.
    - Strava: "You've joined the world's largest team!" and a 4-step checklist
      ([93f9acfd](https://mobbin.com/screens/93f9acfd-853d-4ea2-bd54-3bc62155b2ce)).
    - Runna: "A new plan awaits" and the first run
      ([24c5d161](https://mobbin.com/screens/24c5d161-e6b3-44e4-9df7-daa205e0d024)).
    - Gentler Streak: "Your optimal Activity Path will be ready 7 days after your
      next recorded workout"
      ([377afa33](https://mobbin.com/screens/377afa33-0c4c-4160-a255-17df91ec48a8)).
    - Ladder: "Complete a Welcome Workout"
      ([2f109f68](https://mobbin.com/screens/2f109f68-516d-4138-ba6a-4ba600ce63c8)).
  - A list with no items: mixed (icon 4, ghost 4, text 3, blank 2, art 1). The
    icon-only block lives here.
    - Hevy, a loved app, uses it most, but always inside the content's own frame (a
      chart box, a workouts box) and next to an action
      ([7370cfee](https://mobbin.com/screens/7370cfee-bee2-437d-a374-5d65f4545a89)).
    - Whole-screen empties use own art: NRC's 175 pt runner, "Celebrate Every Run"
      ([90b083e3](https://mobbin.com/screens/90b083e3-b2cc-410d-b8b2-155a58327182)),
      and Airbnb's 3D suitcase
      ([c9c2f44d](https://mobbin.com/screens/c9c2f44d-1906-4857-bb94-1838ac1e1c8d)).
    - Airbnb's Trips draws a ghost of three trip cards with photos
      ([01f52e72](https://mobbin.com/screens/01f52e72-2105-4946-8936-93d60b15ba7f)).

- **Why it works:** a new person's first question is "what do I do?". A hero card
  answers it, and a ghost of the content shows what doing it will produce. A
  repeated icon block answers neither. Seen on 8 tabs, it reads as an unfinished app,
  which is the "vibe coded blank" the owner described.
- **Tropos today:**
  - The same purple hexagon `EmptyState` appears on **8 of the 27** captured screens
    (30 %): Social Following, Notifications (×2 on one screen), own profile, another
    person's profile, a race space, Analytics day 1, own profile day 1, and the Food
    log day 1. That is 7 lists and 1 metric page.
  - `EmptyState.tsx` defines the hexagon as the canonical empty state, and §10a
    tells designers to "reach for the EmptyState primitive".
  - Home day 1 already leads with "Your first workout" as the hero card, which
    complies.
- **Proposed wording (§10a, First use, replacing "Reach for the EmptyState
  primitive"):** "Day 1 of a tab leads with the first action as its hero card, and
  says when the rest fills in. A list with no items draws one ghost item in the
  item's own shape, or Tropos's own art at 120 pt or more. The icon block
  (`EmptyState`) is for a list whose items cannot be drawn ahead, at most once per
  screen, and never as a tab's whole first screen."

### Rule 12: tab glyphs are 20–24 pt; content uses pictures and actions use icons

- **Rule:** tab-bar glyphs are 20–24 pt in their larger dimension, line when
  inactive and filled or coloured when active. An icon labels an action or a field.
  Where the thing itself has a picture (a food, an exercise, a badge), show the
  picture, not an icon.
- **Evidence:** I read the tab-bar glyphs of 16 reference apps on a 2 pt grid
  (`sheets/tabbars-*.png`, `crops/tab-zoom2.png`), accurate to about ±2 pt. A
  pixel-mask script gave noisy results, so I did not use it.
  - Median about **21 pt**. Range: 13 (Cal AI) to 27 (Duolingo's full-colour
    illustrated icons). Values: Hevy 24–25, Ladder 22–26, Apple 22, Strava 21–23,
    Yazio 22, Lifesum 22, WHOOP 21, Oura 20, Runna 20, Bevel 20, MacroFactor 20,
    NRC 18–19, Fitbod 18.
  - Style: line in 10 of 16, filled in 4 (Apple, Ladder, Bevel, Gentler Streak),
    full colour in 1 (Duolingo). Active is filled or coloured in about 10.
  - In content, the food apps show the food rather than an icon: MacroFactor's colour
    food glyphs at 35–40 pt
    ([cb3845d0](https://mobbin.com/screens/cb3845d0-2f2f-4765-a349-17848224e2cc)),
    Yazio's meal pictures in 60 pt rings
    ([0cc2792f](https://mobbin.com/screens/0cc2792f-7c05-4667-9c0f-ba47d6e0c3fe)),
    and Lifesum's 50 pt food images
    ([ba02a832](https://mobbin.com/screens/ba02a832-1a7e-4717-8dae-e96cb104ad78)).
  - Tropos: the visible glyph is about **16 pt** (Home 16 × 17, Food 15, Train
    11 × 18). The glyphs are drawn inset in a 24-unit viewBox inside a 22 px box
    (`BottomNavigation.tsx`, `size-[22px]`; `TabIcons.tsx`).
- **Why it works:** the tab bar is touched dozens of times a day. Glyphs at the
  platform's size read as native, and smaller ones read as a web page.
- **Tropos today:** tab glyphs are about 25 % smaller than the reference median. The
  drawn icon set itself (outline and filled forms) already matches the dominant
  style.
- **Proposed wording (Conventions, Icons):** "Tab glyphs fill 20–24 pt: line when
  inactive, filled when active. In content, a thing with its own picture (food,
  exercise, badge) shows the picture; icons are for actions and labels."

---

## 2. Rules we should NOT copy

1. **A full-bleed brand colour flood on rewards** (NRC volt, Duolingo orange). These
   are 2 of 17 reward screens, and each is the app's single brand colour. Tropos has
   five domain colours, so a coral, purple or orange flood per moment would read as
   different apps. NRC pairs it with a tone-on-tone headline at 1.76:1, which fails
   WCAG. The dark stage plus a glow (Rule 8) gets the same "different screen" effect.
2. **Generic landscape photography behind Home** (Oura). These 3 screens hold most
   of the sample's generic-photography area. Text set over a photo needs scrims and
   fails contrast often. The photo is the same for every user, so it says nothing
   about the person. It is Oura's brand (ring, sleep, nature), not a pattern: 13 of
   16 apps show none.
3. **A mascot or character** (Duolingo, Gentler Streak, NRC's empty runner, Yazio's
   monsters, Headspace). 4 of 16 apps use one. FV1 already decided that the Tropos
   mark is the guide, with no character. Tropos's form figures and the anatomical
   runner do the "own art" job that a character does elsewhere (Hevy and Fitbod use
   figures too).
4. **A celebration after every session** (Duolingo every lesson, Ladder's coin after
   every workout). It suits 5-minute lessons and classes. For a lifter training 3–4
   times a week, a full-screen moment each time stops meaning anything, and Apple,
   NRC, Runna and Strava all end a routine session on a calm summary (Rule 9).
5. **A reward that turns into a paywall** (Fitbod's "Congrats on your first Fitbod
   workout!" leads into a $79.99/yr offer,
   [b4ed960b](https://mobbin.com/screens/b4ed960b-cea8-4ae5-a237-15aefee55660)).
   Selling at the peak moment spends the trust the moment just earned. FV1 already
   removed the Pro offer between setup and Home.
6. **The streak-lost screen** (Cal AI's "1 Day streak lost" with a grey flame,
   [f48da1ad](https://mobbin.com/screens/f48da1ad-4de3-4900-9abd-6978316b5bb7), and
   Duolingo's streak in danger). These conflict with Tropos's Streak1 register
   ("nothing about a streak at risk") and with designing for lapsed and returning
   people.
7. **A padlock tile over locked milestones** (Strava's grey hexes, WHOOP's locks).
   It hides the very number that makes the goal (Rule 6). NRC, Apple, Cal AI and
   Ladder show it.
8. **Icon-only empty states everywhere** (Hevy). Hevy is loved despite them, not
   because of them. It is the only app of 16 that uses the block more than once, and
   even there the icon sits inside the content's own frame next to an action.

---

## 3. Open questions for the owner (3)

1. **Does a first, a new best, a streak milestone or a finished plan open its own
   screen by itself after Finish?**
   - (a) **Yes.** It opens once, before the summary, as Hevy, Duolingo, Lifesum and
     Runna do. This means relaxing §10a's "no extra celebration dialog" for those
     four moments only.
   - (b) **No.** The top block of the existing finish screen becomes the moment
     (object, figure, sentence), with no extra screen and no extra tap.

   Option (a) is the measured pattern (6 apps for firsts). Option (b) keeps one
   screen and still meets Rule 7 if the rest of the receipt drops below the fold.

2. **How far does the badge redraw go?**
   - (a) **Redraw** the 30 badges into 4–6 family silhouettes (for example a round
     coin for consistency, a shield for strength, a hex for running distance, a
     droplet or plate for food and water), each with its numeral and its domain's
     enamel colour. This is a new Gemini art brief, like `MEDAL_ART_BRIEF.md`.
   - (b) **Keep the hex.** Add the numeral and recolour the enamel by family. This
     is cheaper and meets Rules 5 and 6, but still fails Rule 4, which needs at
     least 3 silhouettes.
3. **Is generic photography allowed anywhere?**
   - (a) **No.** Only Tropos's own art and the person's own data and photos. The
     challenge card's stock gym photo would be replaced by the challenge's badge art
     at poster size. 13 of 16 apps showed no generic photography.
   - (b) **Yes, but only on community and event surfaces** (race spaces, challenges,
     Circles), as Strava and Runna do. Never on Home, Train, Food or History.
