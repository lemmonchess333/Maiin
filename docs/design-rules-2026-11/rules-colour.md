# Colour rules for Tropos, measured from the apps people come back to

Area: **colour**: how much a screen carries and where, gradients, meaning-colours, reward colour, dark and light.
Every number below was measured with code on the screens. Nothing is eyeballed except where a line says "by eye".

Files in this folder:

- `measurements.json`: one record per screen (178), with every metric below. `table.txt` has one row per screen, `summary.txt` the group statistics, `largest.txt` the biggest colour area on each screen.
- `evidence-sheet.jpg`: the screens cited most, each labelled with its colour share, hue count and biggest colour area.
- `tools/measure.py` (metrics), `tools/sample.py` (colour samples along a line), `tools/pairs.py` (light/dark pairs), `tools/largest.py`, `tools/summary.py`, `tools/proposed.py`, `tools/catalog.py` (the hand tags).
- `mobbin/`: the 49 screens I added, with `mobbin/manifest.tsv` (file → mobbin_url). The other 96 reference screens are reused from `../../refs/`.

---

## How it was measured

**Sample.**

- 145 reference screens from 21 apps: Apple Fitness, WHOOP, Oura, Strava, Nike Run Club, Hevy, Ladder, Runna, Fitbod, Gentler Streak, Bevel, Duolingo, MacroFactor, Cal AI, Yazio, Lifesum, Garmin, Tempo, MyFitnessPal, Alma and BitePal.
- 2 cross-check apps from outside fitness, labelled `(x-check)` and left out of every reference statistic: Revolut (3 screens) and Headspace (1).
- 33 Tropos frames (`../../current/*-fold.png`, the first 393×852 viewport, 27 dark and 6 light), plus the "Workout saved" finish screen (`finish-oct31-dark.png`) and the 10 proposed mockups (`../../proposed/*.png`), measured the same way.
- Each app's main screens were taken (today/home, a list, a detail, a finish or reward screen), not only its best-looking ones.
- I looked at every image at contact-sheet size and zoomed into the ones I cite.

**Gaps.**

- Mobbin has no dark Gentler Streak screens (searched: 0 results). All 4 Gentler screens are light.
- Strava dark has 1 screen.
- Cal AI dark has 2 screens. Oura has 15, almost all dark (Oura is dark by default).

**Normalising.**

- Every capture was resampled to a 1 pt grid (Mobbin captures are 3×, so ÷3; Tropos captures are 2×, so ÷2).
- From each Mobbin capture I cut the 40 pt "curated by Mobbin" footer and the iOS status bar (54 pt, or 44 pt on the 375-wide Fitbod captures).
- Every share below is a share of the first screen.

**Metrics.**

| Metric             | Definition                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Colour share**   | Pixels with HSV S > 0.35 and V > 0.25 (the brief's test), plus chroma (max−min) ≥ 0.12. The chroma floor stops tinted near-blacks such as Bevel's navy #282d40 counting as colour.                                                                                                                                                                         |
| **Hues**           | A histogram of the colour pixels' hue in 10° bins, split into clusters at its valleys. Two clusters merge when the valley between them is above half the smaller peak. A hue counts as present when its cluster holds ≥ 0.1% of the screen, about 310 pt², roughly one solid 18 pt icon. **Leading-hue share** is the largest cluster ÷ all colour pixels. |
| **Fill vs stroke** | A colour pixel is _fill_ when a 15×15 pt window around it is ≥ 85% colour: buttons, cards, floods. Every other colour pixel is _stroke_: rings, bars, text, icons. **Biggest colour area** is the largest connected fill. A **flood** is a single fill covering ≥ 40% of the screen.                                                                       |
| **Tint**           | Pixels with chroma ≥ 0.05 that are not colour pixels: tinted greys and washes.                                                                                                                                                                                                                                                                             |
| **Gradients**      | Detected in 8 pt tiles; [full method below](#gradient-detection).                                                                                                                                                                                                                                                                                          |

<a id="gradient-detection"></a>**Gradient detection.**

1. The screen is cut into 8 pt tiles, and a flat plane is fitted to each tile. A tile is _smooth_ when the plane fits with an error under 2.5/255.
2. Neighbouring smooth tiles join one region when their mean colours differ by ≤ 4 levels.
3. A region covering ≥ 3% of the screen whose colour runs over ≥ 12 levels is a gradient.
4. Its **hue span** is the 5–95% range of hue around the colour wheel, over the region's tiles with chroma ≥ 0.06.
5. Each gradient is called **one-hue** when the span is ≤ 30°, **adjacent-hue** at 30–60° and **multi-hue** above 60°. I then checked each gradient by sampling colours along a line (`tools/sample.py`).

**Hand tags** (`tools/catalog.py`):

- Each screen is tagged _everyday_, _day1_ (a new account) or _reward_. Reward covers a finish screen, an award, a streak extended, a recap or a share card.
- Each screen's **imagery** is tagged by eye as none, small or large. Large means photos, illustration, 3D renders or map tiles covering about 15% or more of the first screen.
- Statistics marked "UI" exclude large-imagery screens, because photos add colour and hues that no design rule controls.

---

## The headline, in numbers

|                                         | Reference apps                                               | Tropos today                                                         |
| --------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Colour share, everyday UI screens       | median **2.4%** (IQR 1.2–4.3%, p90 13.2%), n=73, 20 apps     | median **3.1%** dark (IQR 0.8–5.3%, max 7.9%), n=19; 3.3% light, n=6 |
| ... dark only                           | median **2.0%** (p90 3.8%, max 14.9%), n=31, 10 apps         | 3.1%                                                                 |
| Hues per screen, everyday and day-1 UI  | median 2; ≤ 3 on **78 of 86**                                | median 2; ≤ 3 on 28 of 32                                            |
| Leading hue's share of the colour       | median 92%                                                   | median 88%                                                           |
| Biggest colour area is a **button**     | **6 of 85** screens (3 apps)                                 | **17 of 32** screens                                                 |
| Reward and finish screens, colour share | median **13.1%** (IQR 7.1–28.1%), n=29, 13 apps; floods on 5 | finish 2.1%, weekly review 0.3%                                      |
| Everyday gradients, by hue span         | 15 screens, 7 apps: **all one-hue** (≤ 30°)                  | 1: the Food hero, orange to purple, **137°**                         |
| Proposed mockups (`../../proposed/`)    |                                                              | Home 35–36%, Food 21–22%, finish 55–64%                              |

The proposed mockups' numbers come from `tools/proposed.py`.

What this says, before the rules:

1. **Tropos is not short of colour on everyday screens.** It already carries as much as WHOOP, Oura, Apple Fitness and Fitbod, or slightly more. The "blank" feeling does not come from too little colour.
2. **It puts the colour in the wrong place.** In the reference apps the biggest colour area is the person's data: a ring, a bar, the day's glow. In Tropos it is a full-width purple or coral button on 17 of 32 screens.
3. **The loud register is missing.** Reference reward screens carry 5.5× their everyday colour, almost all of it in one hue. Tropos's finish screen carries less colour than its own Home.
4. **The proposed Home mockups overshoot.** At 35–36% they carry more colour than any everyday dark reference screen (max 14.9%), and about as much as a reward screen.

---

## Rules

### C1. Everyday screens carry little colour: ≤ 8% on dark, ≤ 15% on light

- **Rule:** On an everyday screen (Home, a list, a detail, the logger), colour pixels cover at most 8% of the first screen on dark and 15% on light. Typical is 2–5%. The one exception is colour that comes from imagery, or from a ground that is itself today's state.
- **Evidence:** everyday and day-1 UI screens, measured with `measure.py`:

  | Group                          | n (apps) | Median | IQR       | p90   | Max   | Within the budget |
  | ------------------------------ | -------- | ------ | --------- | ----- | ----- | ----------------- |
  | Dark                           | 36 (10)  | 1.7%   | 0.8–3.1%  | 3.7%  | 14.9% | 34/36 ≤ 8%        |
  | Light                          | 49 (15)  | 2.4%   | 1.3–7.5%  | 13.6% | 35.0% | 44/49 ≤ 15%       |
  | Large imagery (excluded above) | 22 (10)  | 6.3%   | 3.0–12.5% |       | 60.4% |                   |
  | Rewards (for contrast)         | 29 (13)  | 13.1%  | 7.1–28.1% |       | 94.3% |                   |
  - **Dark exceptions** (2 screens, 1 app): Bevel's sleep pages, at 14.6% and 14.9%. A selected card is filled indigo #374572.
  - **Light exceptions** (5 screens, all loved or popular apps): Duolingo's path (26.7%, the current unit's blue), NRC's run-level card (22.9%: the card is the level's colour), Lifesum's green diary header (33.5% and 35.0%) and Strava's Relative Effort bands (15.4%).
  - **Flood exception** (1 screen): NRC's live run, 87.2% orange, a live state.
  - **Imagery:** every dark screen above 8% with imagery gets its colour from photos. Oura's photo of the day (19–34%) and Ladder's coach photos (9–13%) are the main cases.
  - Cited screens:
    - [WHOOP home](https://mobbin.com/screens/4e7d8b71-ac46-472f-8e31-b619f5e533ae) (`refs/home/whoop-home-today.webp`, 3.5%)
    - [Apple Fitness summary](https://mobbin.com/screens/2745a5a7-c443-46cf-80bb-a3e7b72ff8f7) (`mobbin/applefitness-summary-move-46.jpg`, 1.7%)
    - [Fitbod workout](https://mobbin.com/screens/f666f5aa-4ab1-423e-a560-b9fdb707b4ba) (`mobbin/fitbod-workout-list-dark.jpg`, 2.8%)
    - [Oura sleep](https://mobbin.com/screens/ded88fa6-85b6-460f-89b9-9eb71fcd2ef9) (`mobbin/oura-sleep-first-score-dark.jpg`, 1.7%)

- **Why it works:** a person opens these screens many times a day. Low colour keeps the few colours that are there readable as meaning, and leaves the reward screens room to feel different.
- **Tropos today:** the guide's "calm over flashy" holds on the measured frames: dark median 3.1%, 25 of 26 dark frames within the budget. The one over is a new account's Food, at 8.5% (the wash, the orange ring and the camera button).
  - The proposed mockups break it: `home-lift` 36.4%, `home-day1` 35.0%, `plan-journey` 44.0%, `profile` 26.6%, `food-day` 22.0%. Only `home-rest`, at 8.7%, is near the budget. See open question 1.
- **Proposed wording:** "Everyday screens stay quiet: colour covers at most 8% of the first screen on dark and 15% on light (2–5% is normal). Measure it with `rules/colour/tools/measure.py`. More colour than that belongs to a reward, to imagery, or to a ground that shows today's state."

### C2. The biggest colour on the screen is the person's data, not a button

- **Rule:** On an everyday screen, the largest connected area of colour is a data mark: a ring or arc, a bar, a route, the lit muscles of a figure, or the day's state glow.
  - A colour-filled button may not be larger than that mark.
  - A filled button that stands alone in colour stays a pill of 1.5% of the screen or less (about 140×36 pt). The exception is the screen's single sport-start action, and even then a bigger mark in the same hue sits above it.
- **Evidence:** `largest.txt`, everyday and day-1 UI screens:
  - **Reference apps:** a button is the biggest colour area on **6 of 85** screens, from 3 apps.
    - Fitbod's floating Start Workout pill, 137×36 pt = 1.1% of the screen, on 4 screens.
    - Gentler's "Today I choose rest" button.
    - Strava's Pause button while recording.
  - Everywhere else the biggest colour area is data. Biggest colour area on dark reference screens: median 0.3%, max 8.3%.
    - Apple's Move ring is 1.75% of its screen.
    - WHOOP's recovery ring is the largest colour on its detail page (1.4%).
    - Hevy's muscle-split bar, at 274×10 pt, is the largest colour on its workout page, and its weekly bars on its profile.
    - Oura's sleep-stage bar.
    - MacroFactor's macro dots.
    - Duolingo's streak chain in its calendar (304×29 pt), which my shape test first took for a button.
  - Cited screens:
    - [WHOOP 86% recovery](https://mobbin.com/screens/c85b5dd2-aa58-41be-a07b-11d5c8e4db9f) (`mobbin/whoop-recovery-86-detail.jpg`)
    - [Apple Fitness Move ring](https://mobbin.com/screens/527bed87-fe98-4e4d-b778-b635c9475df5) (`refs/home/apple-fitness-day-ring-partial-weekstrip.webp`)
    - [Hevy workout detail](https://mobbin.com/screens/f388fe19-e9de-44ef-8faa-b4c9c192f6ad) (`mobbin/hevy-workout-detail-dark.jpg`)
- **Why it works:** colour on data says "this is you, today", and colour on a button says "this is our interface". The apps people come back to spend their colour on the first.
- **Tropos today:** on **17 of 32** frames the biggest colour is a full-width filled button, 310–350 × 33–41 pt and 2.5–3.8% of the screen.
  - Purple #6761d1: Start workout on Home and Train, Start Pull on the plan, Complete set in the logger, Follow on another person's profile, Start a circle, and Start a workout on a new account's Analytics and profile.
  - Coral: Run this route again, Train for this race.
  - On Home the Start workout button (3.3%) is the biggest colour. The session itself is a 12% purple tint, which is not colour by this measure, plus a grey and white figure.
- **Proposed wording:** "Spend colour on data, not on chrome. On every everyday screen, the largest area of colour is the person's data (a ring, a bar, a route, a figure's lit muscles). A colour-filled button is never the biggest colour on its screen."

### C3. At most three hues on a screen, and one of them leads

- **Rule:** The first screen shows at most 3 distinct hues, not counting photos and badge art, and the leading hue holds at least 60% of the colour pixels.
- **Evidence:** everyday and day-1 UI reference screens, n=86, 21 apps:
  - 78 show ≤ 3 hues (median 2).
  - The leading hue holds a median 92% of the colour, and ≥ 60% on 69 of 82.
  - The 8 screens with 4–5 hues are Duolingo (path ×2, new profile), Lifesum (diary, daily wins), WHOOP (home, explainer) and Runna (today). On each, every extra hue is a separate, labelled metric (WHOOP's three dials, Duolingo's currencies).
  - Cited screens:
    - [WHOOP home](https://mobbin.com/screens/4e7d8b71-ac46-472f-8e31-b619f5e533ae) (4 hues)
    - [Cal AI home](https://mobbin.com/screens/0b587652-d78b-4abb-8d03-aa9685167524) (`refs/food/calai-home-dark-week-rings.jpg`, 3)
    - [Fitbod upcoming](https://mobbin.com/screens/eb63fb58-141c-4a68-a4a6-90f7e4c1505a) (`mobbin/fitbod-upcoming-dark.jpg`, 0)
- **Why it works:** one leading hue tells you what the screen is about, and a second or third reads as a different thing. Beyond three, colour stops carrying meaning and becomes decoration.
- **Tropos today:** 28 of 32 frames pass, and the leading hue's median share is 88%.
  - Home shows 4 hues: the purple session and button, the coral run days on the week strip, the orange food ring and the teal water.
  - History and a new account's Food also show 4.
- **Proposed wording:** "No more than three hues on one screen (photos and badge art excepted), and one of them leads with at least 60% of the colour."

### C4. One meaning per hue; generic actions stay neutral when colours mean things

- **Rule:**
  - Every hue has exactly one meaning across the app.
  - An app running three or more meaning hues draws its generic actions in the neutral primary: white on dark, near-black on light. Generic actions are Follow, Join, Done, Share, Edit, Save, Start a circle and Log in.
  - A coloured fill appears only on an action that starts that colour's thing: Start workout in purple, Start run in coral.
- **Evidence:** the apps split into two families. Hue families were counted when they recur on 2 or more of an app's UI screens (`summary.py`); identity colours and button fills were checked by eye on every screen.

  | Family           | Apps                                                                                                                                                                                                                                                              | Identity hues                | Recurring hue families (measured)                                                               | Primary button                                                                                                                                          |
  | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Single accent    | Strava (orange), Hevy (blue), Fitbod (coral), Ladder (chartreuse), Gentler (orange), Lifesum (green)                                                                                                                                                              | 1 brand hue that means "you" | Fitbod 1, Hevy 2, Lifesum 2, Strava 4 (its blue and purple come from maps and the effort chart) | **The brand hue, on 6 of 6**                                                                                                                            |
  | Several meanings | WHOOP (sleep, strain, recovery states), Oura (states, sleep stages), Apple Fitness (Move, Exercise, Stand, steps, distance, pace), Bevel (strain, recovery, sleep, HR, HRV), MacroFactor (4 macros), Cal AI (3 macros, day state), Runna (5 session types), Yazio | 3–6                          | WHOOP 6, MacroFactor 5, Runna 5, Apple 3, Oura 3                                                | **Neutral on 8 of 8**: white or outlined (WHOOP, Oura), grey (Apple), black (Runna, MacroFactor, Yazio), black or white (Cal AI), frosted glass (Bevel) |
  - Duolingo is the one exception. Its buttons are blue in an app of five currency colours, but blue means only "act" there.
  - Cited screens:
    - [Runna plan, light](https://mobbin.com/screens/884d7416-da67-44b1-b8b0-1f5b1ce3fc0b) (`mobbin/runna-plan-week1-gradient-spines.jpg`: session colours with a black Record Run)
    - [MacroFactor dashboard](https://mobbin.com/screens/5cea3f89-659b-4369-a1a4-07ebdcab4591) (`mobbin/macrofactor-weekly-nutrition-light.jpg`: 4 macro colours and a black control)
    - [Cal AI food](https://mobbin.com/screens/fca464bb-acce-40e0-9ce1-2a8aac0a530b) (`mobbin/calai-food-detail-dark.jpg`: a white Log)
    - [Fitbod](https://mobbin.com/screens/f666f5aa-4ab1-423e-a560-b9fdb707b4ba) (one coral, on its button)

- **Why it works:** when a colour has one job, a glance is enough: purple means a lift. When the brand colour is also every button, the eye can no longer tell "lifting" from "tap here".
- **Tropos today:** the guide already says "one colour per job", and Tropos is a several-meanings app: 6 recurring hue families across its 33 frames, the same count as WHOOP. Its colours double up:
  - **Purple** carries lifting, the brand, the streak flame (§14k), the verdict ring (`performanceColour.ts`: brand purple, amber on overreach), the active tab, links ("Find people"), and every generic primary button (Follow on another profile, Start a circle).
  - **Coral** carries running and "vitals / recovery" (§3e).
- **Proposed wording:** "Every colour has one job, across the whole app: purple is lifting, coral is running, orange is food, teal is water, gold is a new best. Generic actions (Follow, Join, Share, Done, Edit) use the neutral primary button (white on dark, near-black on light). A coloured fill is only for starting that colour's thing (Start workout in purple, Start run in coral)." See open question 2.

### C5. A state colour comes from one scale of at most 3 steps, and an empty metric is a grey track at full size

- **Rule:**
  - A colour that says _how something is going_ (a daily verdict, the plan done this week) comes from one scale used across the app. The scale has at most 3 steps and borrows no identity hue.
  - Before there is data, the same mark is drawn at full size as a neutral grey track, or as its own hue at 35% brightness or less. The first colour arrives with the first data.
- **Evidence:**
  - Apps with a state scale (by eye):
    - WHOOP recovery: green, yellow, red. Measured on home: 86% green, 49% yellow.
    - Oura: GOOD and OPTIMAL in teal, "pay attention" in peach, LIMITED in rose.
    - Cal AI: green or red day rings.
    - Gentler: green, yellow and red on the activity path.
    - Bevel: yellow to green inside the recovery ring.
  - Apple uses no state hue. State is the amount of fill: the Move track is the same hue as the fill at 31% brightness (sampled #4e0619, h344, V 0.31) against the fill's 97% (#fb1150, h344).
  - Colour arrives with data:
    - WHOOP while calibrating: a grey 54% ring, 0.6% colour. Home with a score: 3.5%.
    - Fitbod's recovery map: 1.0% before the first workout, 4.2% after.
    - Yazio's streak: a grey flame at 0.6% on day 0, an orange flood at 25.2% on day 3.
  - Cited screens:
    - [WHOOP home, yellow day](https://mobbin.com/screens/2a304724-c00c-49b4-861d-0af230d8827e) (`mobbin/whoop-home-49-yellow.jpg`)
    - [WHOOP strain vs recovery](https://mobbin.com/screens/72fc9a4d-505f-49be-8686-1d3cf998f105) (`mobbin/whoop-strain-vs-recovery-rgy.jpg`: the three-step scale explained)
    - [WHOOP calibrating](https://mobbin.com/screens/b2940af4-7b74-489a-b1d6-1222b1eaa964) (`mobbin/whoop-recovery-calibrating-grey.jpg`)
    - [Fitbod day 1](https://mobbin.com/screens/00777705-f049-4cd4-b5b1-366f99aff28b) (`refs/training/fitbod-recovery-day1-empty.jpg`)
- **Why it works:**
  - A state colour that changes overnight is a reason to open the app: you read the day from its hue before reading any number.
  - A grey track drawn at full size teaches a new user what will fill, so that the first colour is the reward.
- **Tropos today:**
  - The verdict ring is brand purple and turns amber only on overreach. Its colour does not tell a good week from a middling one.
  - Colour does not follow data: a new account's Home has 6.7% colour, a used account's 7.0%. The colour sits in chrome (the Start button, the card tint), not in the person's numbers.
  - The calorie ring already draws a grey groove, which fits this rule.
- **Proposed wording:** "Empty is grey, at full size: before there is data a ring or bar is drawn whole, as a grey track, and its colour arrives with the first entry. If a colour shows how something is going, it comes from one scale of at most three steps, used everywhere, and never borrows a sport's colour." Whether to add a state scale at all is open question 3.

### C6. Gradients are allowed in one hue, fading into the surface they sit on

- **Rule:**
  - A gradient uses one hue: at most 30° of hue from one end to the other, measured. It runs from that hue into the surface under it, the page or the card.
  - Two meaning colours never share a gradient.
  - A data mark may run across adjacent hues (≤ 60°) only to draw a low-to-high scale.
  - Gradients spanning more than 60° are for recap or story slides only.
- **Evidence:** gradients detected and then sampled (detector output in `measurements.json`):

  | Where                      | Screens (apps)                                     | Hue span | Examples, sampled end to end                                                                                                                                                                                                                                                                                                                                 |
  | -------------------------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Everyday grounds and glows | **15 screens (7 apps), 15 one-hue**                | 0–30°    | WHOOP ground h199–210 fading to #030303 (4 screens), and a teal card glow (h162–166) fading into the card's cool grey; Oura teal header fading to the page #121214 (h180, 4 screens); Bevel navy sheet; Runna rest-day sky h214 fading to the page #f1f5f9; MyFitnessPal pale blue into white; Lifesum green header h80 to h109 (29°); Strava's empty podium |
  | Reward grounds             | 7 screens (3 apps): 4 one-hue, 2 adjacent, 1 multi | 3–92°    | Strava finish glow red h357 to orange h28 into black (31° end to end; the detector's 5–95% span is 8°); Strava Month in Sport; Yazio milestone h22 to h44; Oura reports pink to purple (58°), maroon to brown (37°), and blue h201 to purple h293 (92°, the only multi-hue)                                                                                  |
  | Data marks                 | 4 apps                                             | 6–50°    | Bevel recovery ring green h118 to yellow-green h69 (a low-to-high scale); Runna's easy-run spine yellow h54 to green h78 and beyond; Duolingo's streak chain red-orange h10 to amber h38 (28°); Gentler's step bars h40 to h34                                                                                                                               |
  | Multi-hue anywhere else    | 0 in fitness apps                                  |          | Only a third-party mark (Ladder's Instagram button) and a theme the user picks (Revolut x-check)                                                                                                                                                                                                                                                             |
  - Cited screens:
    - [Revolut, purple to black](https://mobbin.com/screens/9e4593eb-6c61-4722-ac2d-6e8148fedd38) (x-check, h266 held at full saturation from V 0.93 to 0.30)
    - [Strava "Nice work!"](https://mobbin.com/screens/499f7c34-866a-4aa3-9d53-82acf88733a6) (`mobbin/strava-nicework-ribbon-glow.jpg`)
    - [Runna rest day](https://mobbin.com/screens/48d9e879-8ad7-4c03-8483-8b064eb3a4f1) (`refs/home/runna-today-rest-day-recovery-done.webp`)
    - [Bevel recovery ring](https://mobbin.com/screens/bf86c914-92f3-441f-acf6-08a4c2a7e1d0) (`mobbin/bevel-recovery-77-gradient-ring.jpg`)
    - [Oura quarterly report](https://mobbin.com/screens/d1e9091b-7b5d-424b-b9eb-9807f03bb488) (`mobbin/oura-report-highs-blue-purple.jpg`)

- **Why it works:** a one-hue fade gives a surface depth and light without adding a meaning: it is the same colour, brighter or darker. A two-hue blend asks you to read two meanings at once, and in a palette where hues are categories it reads as noise or as a brand effect.
- **Tropos today:**
  - §0.1 bans gradients, yet the Food hero wash is one: orange (#443127, h21) at top left fading through grey to purple (#312f56, h244) at bottom right. That is a 137° span in dark, and the same in light (#f7e8dc to #dfdbfd).
  - It mixes food and lifting, and it is the only multi-hue gradient on an everyday screen among all 178 measured.
  - The proposed mockups' gradients all measure one-hue, with spans of 1–3°.
- **Proposed wording (replaces "no gradients"):** "A gradient is one hue fading into the surface it sits on: at most 30° of hue end to end, from the colour into the page or card. Never two meaning colours in one gradient. A data mark may shift across neighbouring hues only to draw a scale from low to high. Gradients across several hues are for recap and story slides only."

### C7. On dark, colour is light, not paint: strokes and glows on a near-neutral ground

- **Rule:**
  - On a dark everyday screen, colour arrives as strokes (rings, bars, text, routes) and as one-hue glows.
  - Filled colour areas stay small: each is 1.5% of the screen or less, except the hero's own data mark.
  - The ground stays near-neutral (chroma ≤ 0.04) or carries one faint cool tint.
  - Nothing floods an everyday dark screen.
- **Evidence:** dark everyday UI screens, n=31, 10 apps:
  - Colour share: median 2.0%, of which strokes 1.6% and fills 0.4%.
  - Biggest fill: median 0.3% (max 8.3%, Bevel's selected card).
  - Floods: 0 of 31.
  - Per app: medians and maxima of colour, fill, stroke and biggest area, with hue count and ground colour.

    | App            | n   | Colour | Fill | Stroke | Biggest area (max) | Hues | Ground  |
    | -------------- | --- | ------ | ---- | ------ | ------------------ | ---- | ------- |
    | WHOOP          | 8   | 2.6%   | 0.2% | 1.9%   | 1.4%               | 2    | #13181c |
    | Apple          | 6   | 1.8%   | 0.3% | 1.6%   | 1.8%               | 3    | #000    |
    | Fitbod         | 6   | 2.8%   | 1.1% | 1.7%   | 1.1%               | 1    | #191921 |
    | Oura (UI only) | 6   | 0.9%   | 0.2% | 0.5%   | 1.0%               | 1    | #18191c |
    | Hevy           | 2   | 2.7%   | 1.0% | 1.7%   |                    |      | #000    |
    | Cal AI         | 2   | 0.7%   | 0.0% | 0.7%   |                    |      | #000    |
    | MacroFactor    | 2   | 0.8%   | 0.0% | 0.7%   |                    |      | #1f1f1f |
    | Runna          | 1   | 0.4%   |      |        |                    |      | #161616 |
    | Strava         | 1   | 2.9%   | 0.4% |        |                    |      | #141412 |
    | **Tropos**     | 26  | 3.1%   | 1.4% | 1.9%   | 3.8%               | 2    | #0e0e11 |

  - Grounds, measured at the screen's edge:
    - Neutral in 7 apps: Apple, Cal AI and Hevy #000; MacroFactor #141414–#1f1f1f; Runna #161616; Garmin #101010; Strava #141412.
    - Cool-tinted in 4: WHOOP #13181c (h205, chroma 0.03) on a vertical gradient into #030303; Oura #18191c–#191d20 (chroma 0.016–0.027); Fitbod #191921 (0.03); Bevel's navy #282d40 (0.094).
  - Cited screens:
    - [WHOOP home](https://mobbin.com/screens/4e7d8b71-ac46-472f-8e31-b619f5e533ae)
    - [Oura sleep health](https://mobbin.com/screens/d080c01e-0291-416f-a94c-837cc6b0318f) (`mobbin/oura-sleep-health-list-dark.jpg`, 0.4% colour)
    - [MacroFactor food log](https://mobbin.com/screens/8d0c31f9-40fe-45e2-9492-cdc56396da3c) (`mobbin/macrofactor-foodlog-dark-macro-colours.jpg`, 0.8%)
- **Why it works:** on black a small bright stroke reads as light and draws the eye, while a large fill glares and flattens the hierarchy. The dark apps get their richness from luminous marks, not from painted areas.
- **Tropos today:**
  - The ground #0E0E11 (chroma 0.012) fits.
  - Fill share is 3× the reference median (1.4% against 0.4%). Almost all of it is filled buttons and selected segments (Lift on Train, Breakfast on Food), which are exactly the fills C2 removes.
- **Proposed wording:** "On dark, colour is light: strokes, text and one-hue glows on a near-neutral ground. A filled colour area larger than a pill belongs only to the hero's own data mark or to a reward. Nothing floods an everyday dark screen."

### C8. Rewards are loud in one hue: the hue that already means the achievement

- **Rule:**
  - A reward or finish screen takes one of two forms:
    - A **colour screen**: at least 3× the colour of its everyday screens, ≥ 10% of the first screen, up to a full flood (≥ 40% in one hue).
    - A **dark stage**: one lit object or glow in that hue is the largest and brightest thing on screen, whatever its area.
  - At least 90% of the colour is one hue, the meaning colour of what was achieved. Confetti and art may add hues.
  - It is never the everyday treatment (under 5%, colour on buttons).
- **Evidence:** reward screens, n=29, 13 apps:
  - Colour share: median **13.1%** (IQR 7.1–28.1%), against 2.4% on everyday screens.
  - Floods: **5 of 29**: NRC 91.7%, Duolingo 93.6%, Oura 92.3% and 94.3%, Gentler 49.9%. Against 1 of 73 everyday screens.
  - Leading hue ≥ 90% of the colour on 17 of 29. Without art (no character, confetti or photo): **10 of 13**.
  - Light rewards: median 13.1% (4.5–30.8%), n=13. Dark rewards split in two:
    - Lit objects at 1.4–7.9%: Apple's 3D award 5.2%, Ladder's coin 2.3%, Fitbod's summary 3.2–4.2%.
    - Glows and floods at 19–42%: Strava's finish ribbon 19.2% and 41.7%, Month in Sport 22.9%, Oura's report 28.1%.
  - The reward hue is the app's existing meaning colour on 10 of 13 apps, by eye:
    - Duolingo's streak is the orange of its everyday flame, and Yazio's milestone the orange of its flame.
    - Strava's finish is Strava orange.
    - Runna's finished session is the green of an easy run.
    - Apple's award is Fitness+ green.
    - NRC's achievement is its volt.
    - Hevy finishes in its blue, Fitbod in its coral, Ladder in its chartreuse.
    - WHOOP's share card is recovery green.
  - Cited screens:
    - [NRC "You're on fire"](https://mobbin.com/screens/931d5b5c-bc58-44f6-80e1-478c4ae9d594) (`refs/progress/nrc-youre-on-fire.jpg`)
    - [Duolingo streak](https://mobbin.com/screens/84ec5a7b-37ce-4c38-808d-7c3c91c3c0aa) (`refs/progress/duolingo-streak-fullbleed-orange.jpg`)
    - [Strava "Nice work!"](https://mobbin.com/screens/f2f1bebe-7696-4d2f-abad-831d3034f044) (`mobbin/strava-nicework-ribbon-black.jpg`)
    - [Apple award](https://mobbin.com/screens/ef801eab-0b55-4042-8763-0f980714b094) (`refs/progress/applefitness-award-earned-3d.jpg`)
- **Why it works:**
  - The jump from a quiet everyday screen to a full screen of one colour is felt before it is read, and it marks the moment as an event.
  - Reusing the achievement's own colour ties the reward to the habit: Duolingo's orange flame on every screen is the orange that floods when the streak grows.
- **Tropos today:**
  - §14l allows Social and rewards to be loud, and the medal and league reveals use the dark-stage register (rays, the tier's light, confetti). They were not captured here.
  - The screen every session ends on is quiet:
    - "Workout saved" measures **2.1%** colour, all purple, less than Home's 7.0%.
    - The weekly review measures **0.3%**.
  - The proposed `finish-lift` (55.1%) and `finish-first` (63.8%) are floods with 99% of the colour in purple, which fits this rule.
- **Proposed wording:** "A finish or reward screen is loud in one colour: at least 10% of the first screen, nine-tenths of it the colour of what was done (purple after a lift, coral after a run, gold for a new best, the flame's purple for a streak). Either flood the screen with it, or put one lit object in it on the dark stage. Confetti may add colours; the screen may not."

### C9. Light and dark: same hue, and dark is never the louder one

- **Rule:**
  - Each meaning colour keeps its hue within ±3° in both themes. Saturation may drop by up to 0.2 on dark.
  - A screen's dark version carries no more colour than its light version: no wash or glow that only dark has.
  - A gradient fades into its own theme's page: black on dark, white or grey on light.
- **Evidence:** light/dark pairs, by `pairs.py` (median colour of each hue's pixels):

  | Pair                                                                 | Accent, light → dark                                                  | Colour share, light → dark                   |
  | -------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
  | Hevy profile                                                         | blue #008cff → #008cff                                                | 4.3% → 2.2%                                  |
  | Runna Your plan                                                      | teal #019788 → #029788                                                | 0.6% → 0.4%                                  |
  | Strava feed                                                          | orange #ed6826 (h20) → #f75e0b (h21)                                  | 12.0% → 2.9% (the light map's water is blue) |
  | MacroFactor dashboard (light dial page against the dark habits page) | calories h217 → h217, S 0.63 → 0.58; protein h14 → h13, S 0.61 → 0.53 | 0.9% → 0.7%                                  |
  | Cal AI home                                                          | protein h359 → h2, carbs h31 → h28; S down 0.08–0.19                  | different data on each                       |
  - In 4 of 4 comparable pairs, dark carries the same or less colour than light.
  - Gradient ends follow the theme: Revolut, Strava and WHOOP fade into near-black; Runna, MyFitnessPal and Lifesum into white.
  - Cited screens:
    - [Hevy profile, light](https://mobbin.com/screens/f4d2dd73-7a30-4a55-9229-fda8a1c7b39a) and [dark](https://mobbin.com/screens/5a216ec8-f63f-43c4-b46e-eb74bdee0057)
    - [Runna plan, light](https://mobbin.com/screens/11b11698-6aec-4379-bdf5-e87819f63388) and [dark](https://mobbin.com/screens/ab5729de-77e4-4235-8394-cf05d6e7c391)
    - [Strava feed, light](https://mobbin.com/screens/f9216faa-47b8-4b6c-9e69-6464b21c3d74) and [dark](https://mobbin.com/screens/07591af6-e60a-4967-b462-da7c5516d2f7)

- **Why it works:** the meaning of a colour has to survive the theme switch. A dark mode that glows where light does not makes the same screen say two things.
- **Tropos today:**
  - Hues match: purple #655fc8 / #6761d1 (h243 both), coral #d4637a in both themes, orange #d9884e in both.
  - Home (5.8% → 7.0%), Train (7.8% → 7.9%), History and the profile are even.
  - **Food is 2.5× louder in dark** (2.9% → 7.2%): the hero's purple glow (#312f55, about 10,000 pt²) shows only in dark.
- **Proposed wording:** "A colour keeps its hue in both themes (saturation may drop a little on dark), and dark is never louder than light: no wash or glow appears in one theme only. A gradient fades into its own theme's page."

---

## Rules we should NOT copy

1. **Red for a bad day (WHOOP's red recovery, Gentler's red zone).**
   - It works for WHOOP's committed wearable owners, who pay for a strict coach.
   - Tropos's segments include light trainers and people returning after a gap. For them a red Home reads as failure, and §14l already says a fall shows "never more than the facts".
   - If a state scale comes (C5, open question 3), its low step is amber or grey, never red. Red stays for errors.
2. **Multi-hue "aurora" grounds** (Oura's report slides, Revolut's chosen themes, Instagram's mark).
   - They belong to one brand or to the user's own choice, and blend hues freely.
   - In Tropos every hue is a category (C4), so a blend reads as two meanings or as decoration. Oura uses them only on quarterly story slides.
3. **One neon accent for everything (Ladder's chartreuse, NRC's volt).**
   - It suits a single-accent brand (C4), and both apps run with almost no other colour.
   - Tropos needs five meanings. Neon also fails contrast as text on light, and §1's "calm test".
4. **The photo or render as the colour source (Oura's landscapes, Ladder's coaches).** This is where Oura's and Ladder's everyday colour comes from: 19–34% on Oura's Today, against 0.9% on its UI-only dark screens.
   - It needs a curated library per state, and the colour it adds belongs to no meaning.
   - It is a question for the imagery area, not a licence for colour fills.
5. **Five or six metric colours on one screen** (Apple's Summary trends, Bevel's sleep tabs, Duolingo's currencies).
   - Apple carries it with a colour language people already know from the Watch, and Duolingo with a cartoon world. Tropos has no character (§0).
   - Tropos already runs five identity colours plus macro colours (7 hue families measured across 33 frames). The rule is to stop there, not to add metric colours.
6. **Strava's one-orange-for-everything.** It is the cleanest single-accent system in the set, but adopting it would collapse Tropos's sport coding, which is the identity §3f protects.
7. **Bevel's iridescent glass edges and hatched ring fills.** They are a brand ornament, they span many hues on one card, and they break C6.

---

## Open questions for the owner (3)

### 1. How loud is Home's hero?

The proposed mockups flood Home: `home-lift` is 36.4% colour and `home-day1` 35.0%, all one purple hue. No everyday dark screen in the reference set exceeds 14.9%; the dark everyday median is 2.0%. The only screens this colourful that people see every day are Oura's photo of the day (34%), Lifesum's light green header (35%), and Revolut's account colour (42%, a banking app).

- **Option A: keep everyday Home at or under 8% (C1).**
  - The hero gets its weight from scale, a bigger data mark (C2) and imagery. The lit figure is art, which C1 does not count.
  - The flood is saved for the finish screen, so the jump to a reward is at least 5×. This is what WHOOP, Apple and Fitbod do.
- **Option B: make a coloured hero ground Tropos's signature.**
  - It would have to be state, not decoration: purple on a lift day, coral on a run day, quiet on a rest day, like Runna's rest-day sky and Oura's weather. It would also have to obey C6 (one hue fading to the page) and C9 (no louder in dark).
  - The cost: Home and the finish screen would both be floods, so the reward no longer stands out (C8). The finish screen would have to go further: a full flood with art.

### 2. Does purple stay the brand and every button, or only lifting?

C4 finds that apps with several meaning colours keep generic buttons neutral (8 of 8). Tropos's purple means lifting, the brand, the streak, the verdict, links, and Follow / Start a circle.

- **Option A: purple means lifting only.**
  - Generic primary buttons become the neutral primary: white on dark, near-black on light.
  - The brand lives in the mark and the app icon.
  - The streak flame and the verdict ring need another treatment: the flame could stay purple only if streaks count lifting, and the verdict follows C5.
- **Option B: keep purple as the brand and action colour.**
  - Accept that lifting and "tap here" share a colour.
  - Then the sport-start buttons should be the only full-width purple fills, and Follow, Join and Share become outlined or secondary, so that C2 still holds.

### 3. Does Tropos get a state scale?

WHOOP, Oura, Cal AI, Gentler and Bevel colour how things are going. Apple and MacroFactor keep state in the amount of fill and in words. Tropos today has purple, and amber on overreach.

- **Option A: add a 3-step state scale for the weekly verdict and adherence (C5).**
  - For example the success green, a neutral step, and amber; never red.
  - It is the one new colour class, and it must not reuse a sport colour.
  - It gives Home a colour that changes with the week, which is the variable reward the home research found.
- **Option B: no state hue.**
  - State stays fill (a ring filling in its own colour, its empty part a dim track of the same hue, as Apple does) plus words.
  - This keeps the palette closed. Home's changing colour then comes from the day type (lift, run or rest) and from the fill amount.

---

## Appendix A: per-app numbers (everyday and day-1 screens, imagery none or small)

From `summary.txt`. "Recurring hues" are the hue families present on at least 30% of the app's screens (and at least two).

| App           | n   | Colour share, median (range) | Hues, median (range) | Dark screens | Recurring hues                          |
| ------------- | --- | ---------------------------- | -------------------- | ------------ | --------------------------------------- |
| Apple Fitness | 6   | 1.8% (0.2–3.8)               | 3 (1–3)              | 6/6          | green, red, blue                        |
| Bevel         | 3   | 14.6% (2.0–14.9)             | 2 (1–3)              | 2/3          | blue, green                             |
| Cal AI        | 3   | 0.3% (0.1–1.4)               | 1 (0–3)              | 2/3          | none                                    |
| Duolingo      | 5   | 9.8% (4.8–26.7)              | 4 (2–5)              | 0/5          | orange, blue (its "teal"), purple, pink |
| Fitbod        | 6   | 2.8% (0.0–4.2)               | 1 (0–1)              | 6/6          | red                                     |
| Hevy          | 7   | 2.2% (0.4–9.5)               | 2 (1–2)              | 2/7          | blue                                    |
| Lifesum       | 3   | 33.5% (4.3–35.0)             | 4 (2–5)              | 0/3          | green, blue                             |
| MacroFactor   | 7   | 0.8% (0.3–2.4)               | 2 (1–3)              | 2/7          | blue, orange                            |
| Nike Run Club | 4   | 12.4% (0.0–87.2)             | 1 (0–1)              | 0/4          | orange                                  |
| Oura          | 6   | 0.9% (0.1–1.7)               | 1 (0–2)              | 6/6          | blue, teal, orange                      |
| Runna         | 9   | 2.2% (0.4–11.9)              | 2 (1–4)              | 1/9          | teal, green, red, blue                  |
| Strava        | 7   | 4.8% (2.4–15.4)              | 1 (1–3)              | 0/7          | orange                                  |
| WHOOP         | 8   | 2.6% (0.5–3.6)               | 2 (1–4)              | 8/8          | blue, teal, green                       |
| **Tropos**    | 32  | 3.1% (0.2–8.5)               | 2 (1–4)              | 26/32        | purple, orange, red (the coral)         |

Single screens: Alma 1.3–3.3%, BitePal 0.5–4.3%, Garmin 3.7%, Gentler Streak 3.1–7.5%, MyFitnessPal 1.2%, Tempo 12.3%, Yazio 0.6–1.9%. Cross-check: Revolut 42.4–49.5% (account-colour grounds), Headspace 9.1% (illustrations).

## Appendix B: the Tropos frames

From `table.txt`.

| Frame                                             | Colour share                     | Fill     | Biggest area | Hues  | Biggest colour area is      |
| ------------------------------------------------- | -------------------------------- | -------- | ------------ | ----- | --------------------------- |
| home (dark / light)                               | 7.0% / 5.8%                      | 3.8%     | 3.3%         | 4 / 3 | Start workout button        |
| food (dark / light)                               | 7.2% / 2.9%                      | 3.9%     | 2.1%         | 2     | the hero's purple glow      |
| program (dark / light)                            | 7.9% / 7.8%                      | 5.0%     | 3.4%         | 2     | Start workout button        |
| training-plan                                     | 4.9%                             | 2.8%     | 2.6%         | 1     | Start Pull button           |
| workout-session                                   | 5.9%                             | 3.8%     | 3.8%         | 1     | Complete set button         |
| history (dark / light)                            | 4.2% / 3.8%                      | 1.8%     | 0.2%         | 4 / 3 | chart bars                  |
| run-detail                                        | 5.3%                             | 3.0%     | 3.0%         | 2     | Run this route again button |
| social-together                                   | 3.3%                             | 1.3%     | 1.1%         | 3     | Start a circle button       |
| other-profile                                     | 4.3%                             | 2.8%     | 2.8%         | 1     | Follow button               |
| own-profile                                       | 1.9%                             | 0.8%     | 0.8%         | 1     | Start a workout button      |
| social-feed, notifications, league, run-setup     | 0.2–0.6%                         | 0.0–0.2% |              | 1–2   | nothing                     |
| finish "Workout saved"                            | 2.1%                             | 1.2%     | 0.6%         | 1     |                             |
| weekly review                                     | 0.3%                             | 0.0%     | 0.0%         | 1     |                             |
| new home / food / program / history / own profile | 6.7% / 8.5% / 7.7% / 2.1% / 1.9% |          |              |       | the same buttons            |

The palette in use, counted as hue families present on Tropos frames: purple on 31 of 33, orange on 15, coral on 10, green on 3, teal on 2, pink on 2, yellow on 1. That is 7 families, against the "five meaning colours" in the guide; the extra ones are the macro colours, success green, amber and gold.

## Appendix C: method notes and limits

- The chroma floor (≥ 0.12) changes only dark tinted grounds. With the brief's test alone, Bevel's navy pages measured 66% "colour".
- **Hue names follow fixed bands.** Red is 345–15°, orange 15–40°, yellow 40–68°, green 68–160°, teal 160–196°, blue 196–238°, purple 238–290°, pink 290–340°. So Duolingo's #1CB0F6 counts as teal and Tropos's #7B72E9 (h244) as purple.
- **The gradient detector misses some gradients.** It finds smooth regions of 3% of the screen or more, so thin gradient strokes (rings, spines) were sampled by hand instead. It split Tropos's Food wash into two one-hue regions, because the middle of the wash is grey; the end-to-end samples give the 137° span.
- **Biggest colour area is a button** was decided by shape (28–60 pt tall, ≥ 90 pt wide, at least 2.5× as wide as tall), then checked by eye. 4 of the 10 reference screens it flagged were not buttons and were removed: Hevy's completed-set row, Oura's header glow, a BitePal toast and Duolingo's streak chain.
- **The hand tags are judgements, and the medians are robust to them.** Everyday, day1 and reward, and the imagery size, were tagged by eye. Moving the 6 borderline screens (Runna's done screen, Strava's PR sheet, Gentler's month recap, and the three Oura report slides) out of the rewards changes the everyday UI median by under 0.1 points (2.43% either way) and the reward median from 13.1% to 13.0%.
- **Duplicates were dropped.** `nrc-achievement-fullbleed-volt` is the same screen as `nrc-youre-on-fire`, `runna-today-colour-edged-cards` the same as `runna-today-workouts`, and `hevy-complete-share-photo` the same as `hevy-nicework-1st-workout-confetti`. The `fitbod-recovery-body-map` image exists as both .webp and .jpg, and only one copy was measured.
