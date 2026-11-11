# Layout and components: rules measured from the apps people come back to

Area: layout and components. This covers the size ladder of a screen, cards versus full-bleed, spacing values, the primary action and the chrome budget.
Written 7 November 2026 for the design-guide rewrite. Nothing in the repo was edited.

## How this was measured (read once)

- **Sample.**
  - 71 reference screens were annotated by hand: 68 from 17 fitness apps and 3 cross-check apps. The 17 fitness apps are Apple Fitness, WHOOP, Oura, Strava, Nike Run Club, Hevy, Ladder, Runna, Fitbod, Gentler Streak, Bevel, Duolingo, MacroFactor, Cal AI, Yazio, Lifesum and Garmin Connect. The cross-check apps are Airbnb, Headspace and Revolut, labelled "(x)".
  - By kind: 28 home or today screens, 18 details, 13 lists and 12 rewards. Each fitness app has 1 to 6 screens, and I took its main screens, not only its prettiest.
  - Three captures are mid-scroll and are left out of the ladder statistics.
  - The automatic spacing pass covered 176 screens: every ref image in `refs/` plus the 48 new downloads in `img/`.
  - The Tropos side is 18 dark first-viewport frames from `current/`, all 393×852.
- **Units.**
  - Mobbin captures are 1179×2676 px. The bottom 120 px is Mobbin's footer, so the screen itself is 1179×2556 px, which is 393×852 pt at 3×. Fitbod's are 375×812 and Duolingo's newer ones are 402×874.
  - Tropos frames are 2×.
  - Every number below is in pt.
- **Tropos frames are web captures.** They have no status bar and no home indicator. On iOS the shell adds `--safe-top` above the page: 59 pt on a Dynamic Island phone, from `Layout.tsx` and `index.css`. The tab pill then sits on `--safe-bottom` + `--tab-bar-gap` (34 + 8 pt; `components.css` `.bottom-nav-frame`). The Tropos "on device" numbers below are derived from those CSS values, not photographed. `crops/fig-chrome-budget.jpg` shows the simulation.
- **Definitions.**
  - **Usable screen.** The screen minus the status bar and the home indicator: 852 − 54 − 34 = 764 pt for refs, and 759 for Tropos on device.
  - **App chrome.** Title or nav bar, any control rows under it (segmented, tabs, chips, a date strip), and the tab bar.
  - **Content viewport.** The usable screen minus app chrome.
  - **Hero.** The tallest block in the content viewport.
  - **Runner-up.** The second tallest block.
- **Tools.** All of these are in `scripts/`, run with `python3 -I`.
  - `analyze.py` finds cards: left and right vertical edge runs, top and bottom by column scan, and a corner radius from a circle fit.
  - `blocks.py` segments a screen vertically into blocks.
  - `probe.py` prints colour segments along one row or one column.
  - `button.py` gives the extents of a filled control.
  - `spacing.py` gives per-app gutter, radius, gap and padding.
  - `metrics.py` computes chrome, hero and ladder figures from the hand annotation in `data/annot.py`.
  - `colour.py` measures colour coverage.
- **Annotation.** Chrome edges, block heights and container types (`data/types.py`) were read off 25-pt gridded crops: `crops/grid-*.jpg` and `crops/sheet-*.jpg`. Every screen cited was looked at in one of those crops. Precision is ±3 pt for probed values and ±5 pt for hand-read block edges.
- **Spreads.**
  - Per-screen figures are reported as median [range] (n).
  - Spacing values are per-app medians, so an app with 14 screens does not outvote one with 2.

---

## 1. Rules

### Rule 1. App chrome takes at most 20% of the usable screen on a tab root, and at most 12% on a pushed screen

- **Rule:** The title bar, control rows and tab bar together take at most 150 pt of a 764-pt usable screen on a tab root, and at most 90 pt on a detail, finish or reward screen. To check it on a screenshot: the first content block starts at y ≤ 120 pt, or y ≤ 215 pt when the root has a date strip, and the bottom chrome is ≤ 90 pt measured from the screen edge.
- **Evidence:** app chrome as a share of the usable screen.

  | Screens                    | Refs median [range]       | Tropos median [range]     |
  | -------------------------- | ------------------------- | ------------------------- |
  | Tab roots, per-app medians | **14.4%** [7–28], 17 apps | **31%** [9–46], 17 frames |
  | Home or today              | 14.3% [6–29], n25         | 32% [29–42], n8           |
  | Detail                     | 10.9% [0–28], n18         | 21% [9–28], n4            |
  | Reward                     | 6.5% [0–22], n12          | 29%, n1 (Badges)          |
  | List                       | 12.6% [7–28], n13         | 40% [29–46], n4           |

  Per app, on tab roots: Bevel 7, Gentler 10, Strava 12, Garmin 12, Hevy 13, Lifesum 14, Fitbod 14, WHOOP 14, Duolingo 14, Oura 15, Yazio 15, NRC 18, Ladder 19, Apple Fitness 23, MacroFactor 24, Runna 26, Cal AI 28. Every Tropos home tab measures 29–42, which is above every reference app's median.

  Where the first content block starts, in absolute y:
  - Ref homes without a control row: median **105** [54–150], n18.
  - Ref homes with a date strip or tabs: median **205** [125–220], n7.
  - Tropos tab roots on device: median **231** [209–304]. Home's first card is at 246 and Social Feed's at 304.

  The worst Tropos cases:
  - Social Feed carries the title (24 pt), a Together/Feed segmented control (52 pt), Following/Spaces/Explore tabs (28 pt) and a note line before any content: 245 pt of app chrome, 42%.
  - Training history carries 275 pt, 46%.

  Cited screens:
  - Apple Fitness Summary, chrome 14%: [5b8d5290](https://mobbin.com/screens/5b8d5290-6c52-436f-bac3-9d0a531db829).
  - Strava Home, 12%: [f9216faa](https://mobbin.com/screens/f9216faa-47b8-4b6c-9e69-6464b21c3d74).
  - Runna Today, 26%, the top of the range and with a date strip: [be9b0bcc](https://mobbin.com/screens/be9b0bcc-6c28-4abf-bde0-6b046df1207d).
  - Hevy Workout, 13%: [ffc35de8](https://mobbin.com/screens/ffc35de8-fc69-4292-b7ac-710ab04c6e65).

- **Why it works:**
  - Chrome is the same on every visit. Content is what changed overnight.
  - At 14% chrome the reference apps show about 650 pt of content in the first viewport. Tropos Home shows 508 pt. That is roughly one fewer block of "what's new for me" before the thumb has to move.
- **Tropos today:**
  - §5 has no budget, and every page stacks a 24-pt top pad, a two-line title (eyebrow date plus `text-h1`), then controls.
  - Home measures 30 pt top pad + 59 pt title + 23 pt gap + 59 pt week strip + 8 pt gap = 179 pt before the first card. Social stacks two tab rows.
  - On device Home's chrome is 33% and Social's 42%.
- **Proposed wording:**
  - **Chrome budget.** On a tab root, the title, any control row and the tab bar together take at most 20% of the usable screen (150 pt on a 393×852 phone). On a pushed screen the limit is 12% (90 pt).
  - A page whose title, controls and tab bar exceed the budget has to lose something: the eyebrow line, the large title (use the 17-pt nav title once scrolled), or a control row.
  - Measure it on device with the safe areas, not in the browser.

### Rule 2. At most one control row under the title, drawn 32–40 pt tall

- **Rule:** Between the title and the first content there is at most one row of segmented control, tabs, chips or date strip. A segmented track is drawn 32–40 pt tall, and its 44-pt hit area comes from padding outside the track.
- **Evidence:**
  - Ref screens with any control row: 19 of 68. Two stacked rows appear only in MacroFactor's food search, which is a modal tool (quick-add pills, then Scan/Search/AI tabs; app chrome 18%).
  - Measured track heights:

    | App and control                             | Track height                         |
    | ------------------------------------------- | ------------------------------------ |
    | Gentler Streak steps segmented              | **32** (active 28)                   |
    | Apple Fitness+ chips                        | 36                                   |
    | WHOOP W/M/6M                                | ~36 (read from the crop, not probed) |
    | MacroFactor Consumed/Remaining              | 40                                   |
    | Oura date tabs                              | 32                                   |
    | Hevy filter chips                           | 30                                   |
    | Tropos segmented (Analytics, Social, Train) | **52** (active pill 44)              |

  Cited screens:
  - Gentler Streak steps: [fbf5a64b](https://mobbin.com/screens/fbf5a64b-4488-4816-b9e0-fa065ec7aa33).
  - Strava You, one tab row: [f75e89d7](https://mobbin.com/screens/f75e89d7-4088-478c-948b-c2af75795dba).
  - MacroFactor dashboard toggle: [05bca7bd](https://mobbin.com/screens/05bca7bd-ff17-45dc-bca0-3b4c6d51a745).

- **Why it works:**
  - A second row of tabs asks the person to choose twice before seeing anything.
  - A thinner track reads as a switch and not as a third card.
  - The hit area stays 44 pt, so §0.5 is still met.
- **Tropos today:**
  - Social has Together/Feed (52 pt) plus Following/Spaces/Explore (28 pt) plus a note line: 95 pt of controls.
  - History and Training history put a 52-pt range control inside the content as well.
  - §0.5's 44-pt floor is being met by drawing the track 52 pt tall.
- **Proposed wording:**
  - **One control row.** A page has at most one row of controls (segmented, tabs, chips or a date strip) between its title and its content. A second choice goes into the content as a section, or behind a sheet.
  - A segmented track is drawn 36 pt tall. Its 44-pt hit area is the track plus 4 pt of padding above and below, so the floor holds without the control looking like a card.

### Rule 3. The tab bar sits on the home indicator: bottom chrome ≤ 90 pt from the screen edge

- **Rule:** The bottom of the tab bar, or the bottom of a floating pill, sits 21–28 pt above the screen edge, inside the home-indicator area. The bottom chrome, measured from the screen edge, is ≤ 90 pt. The tab bar has 3–5 destinations.
- **Evidence:** column probes through each tab bar.

  | Tab bar style                                                                                                        | Screens | Bottom chrome from the screen edge                                |
  | -------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------- |
  | Floating pill (Apple Fitness, WHOOP, Oura, Gentler, Lifesum, Cal AI)                                                 | 20      | median **82** [81–92]                                             |
  | Bar (Strava, NRC, Hevy, Runna, Fitbod, Yazio, Garmin, MacroFactor, Duolingo, Bevel, Ladder, plus 3 cross-check apps) | 27      | median **83** [79–96]; the fitness apps' maximum is Duolingo's 93 |
  | Tropos pill on device (derived)                                                                                      | —       | **106**                                                           |
  - Pills are 61–64 pt tall and their bottoms sit 21–28 pt above the screen edge: Apple 770–831, WHOOP 760–824, Oura 765–828, Gentler 770–831 and Lifesum 769–831.
  - Tropos's pill is 64 tall and full width with 5 items, and sits on 34 + 8. Its bottom is 42 pt above the edge, so it occupies 746–810 on device.
  - Five of the six pill apps (Apple, WHOOP, Oura, Gentler, Cal AI) draw a pill narrower than the screen: 3–4 items, about 230–290 pt wide. Three of them (WHOOP, Oura, Cal AI) put the create action in a separate 56–64-pt round button. Lifesum's 5-item pill spans the width, as Tropos's does.

  Cited screens:
  - Apple Fitness Summary: [5b8d5290](https://mobbin.com/screens/5b8d5290-6c52-436f-bac3-9d0a531db829).
  - WHOOP Home: [4e7d8b71](https://mobbin.com/screens/4e7d8b71-ac46-472f-8e31-b619f5e533ae).
  - Oura Today: [bfe532d9](https://mobbin.com/screens/bfe532d9-62fe-4246-9775-9c8934195bcb).
  - Strava Home: [f9216faa](https://mobbin.com/screens/f9216faa-47b8-4b6c-9e69-6464b21c3d74).

- **Why it works:** iOS's own floating tab bar sits in the home-indicator zone because that strip cannot hold content anyway. Adding the safe area and then a gap stacks two empty bands and costs about 23 pt of content on every screen.
- **Tropos today:** §5 asks for an inset frosted capsule "with the safe-area gap outside its surface", and `.bottom-nav-frame` pads `safe-bottom + 8`. Bottom chrome measures 106 pt on device against a reference median of 82–83.
- **Proposed wording:**
  - **Tab bar.** The capsule is 62–64 pt tall and its bottom edge sits 22–26 pt above the screen edge. That puts it within the home-indicator inset (`max(safe-bottom − 10px, 8px)`), not on top of it.
  - Bottom chrome, measured from the screen edge, is never more than 90 pt.
  - Labels stay. Five destinations is the maximum.

### Rule 4. One hero, then a step down: no other block is more than 0.8× the hero, and on Home aim for 0.65×

- **Rule:** In the first viewport, the tallest block (the hero) takes 35–60% of the content viewport. No other block is taller than 0.8× the hero. On Home the hero is today's thing (the session, or the day's verdict) and the runner-up is at most 0.65× it.
- **Evidence:** block heights read on gridded crops.

  | Screens          | Hero share of content viewport, median [range] | Runner-up ÷ hero, median         | Runner-up ≤ 0.8× | Runner-up ≤ 0.65× |
  | ---------------- | ---------------------------------------------- | -------------------------------- | ---------------- | ----------------- |
  | Ref homes        | **38%** [15–88]                                | **0.60**                         | 15/23            | 14/23             |
  | Ref details      | 41% [26–76]                                    | 0.60                             | 17/18            | 10/18             |
  | Ref rewards      | 37% [11–100]                                   | 0.37                             | 11/12            | 8/12              |
  | Ref lists        | 21% [8–51]                                     | 0.99 (lists are flat on purpose) | —                | —                 |
  | Tropos home tabs | **41%** [37–50], so hero size is fine          | **0.76**                         | 5/8              | 1/8               |
  - On Tropos Home, the session card is 210 pt and the Food card 204 (0.97).
  - On a new account's Home the Food card (204) is **taller** than the session card (191), so the biggest object on the screen is calories, not today's workout.
  - Social Feed's runner-up is 0.87.
  - The refs over 0.8 are mostly feeds or tools: Fitbod's exercise list 1.00, Cal AI 0.99 and 0.90, WHOOP 0.99, MacroFactor 0.99, Duolingo's path 0.94, Apple Summary 0.90 (a user-edited widget grid, see section 2), Yazio 0.85.

  Cited screens:
  - Oura Today, hero 69%, runner-up 0.22: [bfe532d9](https://mobbin.com/screens/bfe532d9-62fe-4246-9775-9c8934195bcb).
  - Runna Today, 0.39: [be9b0bcc](https://mobbin.com/screens/be9b0bcc-6c28-4abf-bde0-6b046df1207d).
  - Hevy Home feed, 0.33: [d9d34fad](https://mobbin.com/screens/d9d34fad-9f60-4040-b53c-61bd8f6f8be9).
  - NRC Club, 0.42: [fbdd0133](https://mobbin.com/screens/fbdd0133-20fc-4ab2-9b51-80e2ddf5fe1d).

- **Why it works:**
  - A size step tells the eye where to land first, so the screen is read in under a second.
  - Two blocks of equal size compete, and the person has to decide which one the screen is about.
  - Height alone does not separate Tropos from the refs: its hero share is the same. Its runner-up does, and that is the "column of equal cards" the owner sees. On the new-account Home it puts the wrong thing first.
- **Tropos today:**
  - The guide sets two card sizes (hero and compact, §14d) but no ratio between blocks.
  - DS3 put Performance last, but nothing stops the Food card from matching the Today card.
- **Proposed wording:**
  - **The size ladder.** Each screen has one hero, the thing the screen is for, and it takes 35–60% of the first viewport below the chrome. Nothing else in the first viewport is taller than four fifths of it.
  - On Home the hero is today's session (or rest day), and everything under it is compact: at most two thirds of the hero's height. Summarise the Food card to its ring and three numbers, and open the full card from it.

### Rule 5. The hero leaves the card: detail and reward heroes are never in a card, and a Home hero is dressed differently from its siblings

- **Rule:**
  - On a detail, finish or reward screen, the hero sits open on the page or bleeds full width. It is never inside a rounded card.
  - On Home, the hero's container differs from its siblings': open, full-bleed or an image tile. If it has to be a card, it is the only card with that fill, and its visual (ring, map, figure) fills at least half its height.
- **Evidence:** container type of every block in the first viewport. c = card, o = open on the page, f = full-bleed, i = image or colour tile. Shares are by block height.

  | Screens           | Share of blocks that are cards, median                                | Viewports that are all cards | Hero is a card                                |
  | ----------------- | --------------------------------------------------------------------- | ---------------------------- | --------------------------------------------- |
  | Ref homes (n23)   | 48%                                                                   | 7/23                         | **9/23** (open 5, full-bleed 6, image tile 3) |
  | Ref details (n18) | **0%**                                                                | 1/18                         | **3/18**                                      |
  | Ref rewards (n12) | **0%**                                                                | 1/12                         | **2/12**                                      |
  | Tropos (n18)      | **90%** [15–100] (100% on Home, Explore, Together, League and Badges) | 6/18                         | **14/18**                                     |
  - Tropos's hero leaves the card only for an empty state (a hexagon icon and a sentence) and for the run map, which is an inset 16-pt card.
  - Of the 9 ref homes whose hero is a card, 5 fill at least half the card's height with a ring or chart: Apple Summary's ring 140 of 200 pt, Cal AI's ring about 110 of 150, Yazio's ring about 115 of 226, Garmin's sleep bars about 110 of 216, and Cal AI's day-1 card.
  - Tropos's hero card is set apart by a 12% sport wash: rgb(27,26,42) against the siblings' rgb(23,23,27), a luminance step of about 4/255.

  Cited screens:
  - WHOOP Home, open dials above carded siblings: [4e7d8b71](https://mobbin.com/screens/4e7d8b71-ac46-472f-8e31-b619f5e533ae).
  - Apple Fitness day detail, an open 266-pt ring: [527bed87](https://mobbin.com/screens/527bed87-fe98-4e4d-b778-b635c9475df5).
  - NRC run summary, an open 64-pt figure "2.02" with an inset map: [fdd8734e](https://mobbin.com/screens/fdd8734e-60a2-4e86-a070-6744a05e4a7d).
  - Ladder finish, an open 243-pt coin: [05f70a6f](https://mobbin.com/screens/05f70a6f-c904-497f-af89-df41f6846b44).

- **Why it works:**
  - A card says "one of several". The thing a screen is about is not one of several.
  - Taking the hero out of the box is the cheapest way to give it weight without adding colour.
  - It also lets the siblings stay calm cards, so cards keep their meaning: a collection.
- **Tropos today:**
  - §14j asks for a "card-based layout", and §6 and §14d only define kinds of card.
  - 14 of the 18 heroes measured are a card on #17171B at the same 16-pt inset as everything else. The other four are empty states and the inset run map.
- **Proposed wording:**
  - **Cards hold collections; heroes stand on the page.** The hero of a detail, finish or reward screen is drawn straight on the page or full width, never in a card.
  - On Home the hero may stay a card only if it is the one card with its own fill and its picture (form art, ring, route) is at least half its height. Everything around it stays a compact card.

### Rule 6. A screen about one session or place opens on a full-bleed band, 25–75% tall, running under the status bar

- **Rule:**
  - A detail or finish screen whose object has a picture (a run's route map, a Space's photo, a session's form art, a medal) opens with that picture full width, from y = 0, with no radius, 25–75% of the first viewport tall (aim for about 40%).
  - Navigation floats over it as 36–44-pt round buttons.
  - Content below starts on a sheet or on the page, not in a card.
- **Evidence:**
  - Ref screens with a full-bleed band ≥ 15% of the content viewport: **19/65**. By kind:

    | Kind    | Screens with a band |
    | ------- | ------------------- |
    | Details | 7/18                |
    | Rewards | 6/12                |
    | Homes   | 6/23                |
    | Lists   | 0/12                |

  - Band heights:

    | Screen                      | Band height | Share of viewport |
    | --------------------------- | ----------- | ----------------- |
    | Strava activity map         | 318         | 42%               |
    | Strava club photo           | 187         | 26%               |
    | Cal AI scan photo           | 318         | 42%               |
    | WHOOP workout photo         | 466         | 66%               |
    | Ladder workout poster       | 578         | 76%               |
    | Gentler monthly map         | 231         | 32%               |
    | Runna workout gradient      | 200         | 29%               |
    | Duolingo quest colour field | 220         | 30%               |

  - Across the 7 detail screens, the band is a median **42%** of the viewport [26–76].
  - Tropos: **0/18**. The run detail's map is an inset 16-pt card, 24–344 at x 16–376, and the Space photo is an inset card, 24–200.

  Cited screens:
  - Strava activity: [125cbc4d](https://mobbin.com/screens/125cbc4d-55cc-4abc-82d0-4ff489ed616e).
  - Strava club: [de662ea2](https://mobbin.com/screens/de662ea2-24c4-40bb-a176-210b0b00e424).
  - Cal AI scan result: [86f83795](https://mobbin.com/screens/86f83795-ce16-4149-9ed4-9f53ca5dd1a7).
  - Ladder workout detail: [d67cb7a1](https://mobbin.com/screens/d67cb7a1-a18f-4deb-aa87-3ac00916e913).

- **Why it works:**
  - The edge of the phone becomes the frame, so the picture reads as a place you are in, not a thumbnail of it.
  - The band also separates "about this thing" from the list of facts below it without any extra divider.
- **Tropos today:**
  - The guide has no full-bleed pattern. §5 says "don't invent a different gutter".
  - The route map already exists as an image (§14l, `RouteMapHero`, 5:2).
  - The run detail and Space hero are inset cards.
- **Proposed wording:**
  - **Full-bleed bands.** A detail or finish screen whose subject has a picture opens on it at full width, from the top of the screen, square-cornered, 25–75% of the first viewport tall (about 40% for a map or photo). Back and Share float over it as 40-pt round buttons on a translucent fill.
  - This is the one place the 16-pt gutter does not apply.
  - Lists and Home tiles never bleed.

### Rule 7. One card radius, 16 pt, and a smaller one for what sits inside a card

- **Rule:** Every card uses one radius, 16 pt. Tiles, media and inputs inside a card use 10–12. Pills are fully round. There is no larger "hero" radius, because heroes are not cards (Rule 5).
- **Evidence:**
  - Card radius by circle fit on the top-left corner. Plausible cards only: w ≥ 150, h ≥ 40, r 3–34.
  - Per-app medians across 16 fitness apps: **11.8** [7.7–29.5].

    | App           | Card radius (pt) |
    | ------------- | ---------------- |
    | Garmin        | 7.7              |
    | Ladder        | 8.5              |
    | NRC           | 9.7              |
    | Hevy          | 9.8              |
    | Strava        | 9.8              |
    | Fitbod        | 10.5             |
    | WHOOP         | 11.5             |
    | MacroFactor   | 11.5             |
    | Runna         | 12.0             |
    | Lifesum       | 12.2             |
    | Duolingo      | 14.7             |
    | Bevel         | 14.8             |
    | Apple Fitness | 15.3             |
    | Yazio         | 15.4             |
    | Cal AI        | 19.3             |
    | Gentler       | 29.5 (one card)  |

  - 14/16 apps are at ≤ 16.
  - Tropos measures **21–22** on hero cards and **16** on compact ones (n76 cards). Only Gentler's single card is rounder.
  - Cross-check: Revolut 15.4, Headspace 15.5, Airbnb photo tiles 22.8.

  Cited screens:
  - Apple Fitness Summary, 15.3–16: [5b8d5290](https://mobbin.com/screens/5b8d5290-6c52-436f-bac3-9d0a531db829).
  - WHOOP streak, 11.5: [f38f622f](https://mobbin.com/screens/f38f622f-5abd-4432-b5de-cf3fbc93b17a).
  - Runna run types, 12.0: [f61e971c](https://mobbin.com/screens/f61e971c-a7f7-4363-8988-f2b20794a7fa).

- **Why it works:**
  - A radius is a material. One value says "these are the same kind of thing".
  - Tropos uses its bigger radius on its most important card, so the hero is set apart only by being the roundest box on the screen.
  - Data apps sit at 10–12 because tighter corners read as precise.
- **Tropos today:** §14d sets hero = `rounded-2xl` (22 px) and compact = `rounded-xl` (16 px). The frames measure 21–22 and 16.
- **Proposed wording:**
  - **Radius.** Cards are 16 pt, every card, every size. Things inside a card (photos, inputs, tiles, the set table) are 12. Chips and pills are fully round.
  - A larger radius is not a way to mark importance: importance is size and treatment (Rules 4 and 5).

### Rule 8. Spacing keeps Tropos's gutter but adds rhythm: 8–12 inside a group, about 32 between sections

- **Rule:**
  - The side gutter is 16.
  - Cards in one group are 8–12 apart.
  - From the end of a section to the next section heading is 28–36 pt. From a heading to its first block is 12–20.
  - Card padding is 16–20.
  - A run of four or more blocks at one identical gap is a failure.
- **Evidence:**
  - **Gutter** (mode of the left content edge):

    | Gutter | Apps                                                                                   |
    | ------ | -------------------------------------------------------------------------------------- |
    | 16     | 8 of 17: WHOOP, Hevy, Runna, Fitbod, Bevel, MacroFactor, Yazio, Garmin (Lifesum 14)    |
    | 20     | 4: Apple Fitness, Ladder, Oura, Gentler                                                |
    | 24     | 4: Strava, NRC, Duolingo, Cal AI. These are editorial screens that also bleed imagery. |

    Tropos is 16 on every frame.

  - **Card-to-card gap** within a group, per-app medians: **10.3** [8.3–16.4], 8 apps. Runna 8, Strava 8, Apple 10, NRC 10, Cal AI 10, Lifesum 12, Hevy 16, WHOOP 16. Tropos is **16** between every Home card (n25 gaps, median 15.5).
  - **Section gap** (previous block to the next heading), read from block edges on 20 ref sections: median **31** [14–67]. **Heading to its content**, 19 sections: median **18** [10–41]. Tropos: section gaps 22–62 and heading-to-content 8–24, which is in family. Home has no headings, so it is one gap value, 16, repeated four times.
  - **Card padding**, first text or icon from the card edge, per-app medians: **16.5** [13–28], 13 apps. Tropos is 16 compact and 20 hero, which is fine.

  Cited screens:
  - Apple Fitness Summary, 10 between cards: [5b8d5290](https://mobbin.com/screens/5b8d5290-6c52-436f-bac3-9d0a531db829).
  - Yazio Today, a 45 section gap then 16 to the card: [0cc2792f](https://mobbin.com/screens/0cc2792f-7c05-4667-9c0f-ba47d6e0c3fe).
  - Garmin Home, 30 then 21: [66366428](https://mobbin.com/screens/66366428-5782-43e0-92b6-b04b4fcd313a).
  - Runna run types, 8 between rows: [f61e971c](https://mobbin.com/screens/f61e971c-a7f7-4363-8988-f2b20794a7fa).

- **Why it works:**
  - Two gap sizes make groups the eye can count. "These three go together, and that is a new topic."
  - One gap repeated between every card makes the screen one long list of equals. That is the column the owner sees.
- **Tropos today:**
  - §14f has 8 within a group, 12 inside a card and 16 between sections, owned by `PageShell`.
  - On Home every card is its own "section", so every gap is 16 and nothing is grouped.
- **Proposed wording:**
  - **Rhythm.** Within a group of cards or rows, 8 pt (12 for large tiles). Between groups, 32 pt, and the group opens with its `SectionHeading` 16 pt above its first card.
  - Home's compact cards are one group ("Today": food, water, weight, steps) at 8 pt under a heading, not four sections at 16.
  - The 16-pt gutter and the 16/20 card padding stay.

### Rule 9. One filled button per screen, 44–52 pt tall, and full width when it is pinned

- **Rule:**
  - A screen has at most one filled (high-emphasis) button. Everything else is tonal, outline or text.
  - The filled button is 44–52 pt tall. When it is the screen's way forward (start, finish, save, done), it is pinned above the home indicator or tab bar, full width at the 16-pt gutter.
  - On Home the hero itself is the tap target, and its Start is the one filled button.
- **Evidence:**
  - Filled buttons per screen: **63/65** annotated ref screens have ≤ 1. The exceptions are Runna's workout detail (Start plus a music square) and Yazio's three small meal "+" buttons. **12/23** ref homes have no filled button at all: Apple Summary, WHOOP ×2, Oura ×2, Strava, NRC, Hevy feed, Ladder, Gentler, Bevel and Garmin. Tropos has 2 on 5/18 frames: Home (Start plus the teal water "+"), Train ×2 (the filled Lift segment plus Start), and Food ×2 (the filled Breakfast chip plus the camera).
  - Pinned full-width filled buttons, 12 screens (Hevy finish, Ladder ×2, Runna ×4, Duolingo streak, Bevel finish, Cal AI scan, Yazio streak, Lifesum first meal):

    | Measure | Value                                                                                                            |
    | ------- | ---------------------------------------------------------------------------------------------------------------- |
    | Height  | median **45.3** [43–52]                                                                                          |
    | Width   | 300–360, mostly 341–360, i.e. 16–26 margins                                                                      |
    | Fill    | black (Runna, Bevel, Cal AI, Yazio), brand (Hevy blue, Ladder volt, Lifesum green) or white on colour (Duolingo) |

  - Placement of the 28 filled primaries:

    | Placement                                                                                          | Screens |
    | -------------------------------------------------------------------------------------------------- | ------- |
    | Pinned bottom                                                                                      | **12**  |
    | Floating pill or FAB (Fitbod ×3, MacroFactor ×2, Cal AI ×2, Lifesum ×2, Bevel template)            | 10      |
    | Inside the hero card (Hevy Workout tab, Duolingo popover), or right under the title (Hevy routine) | 3       |
    | Inline in the flow (Strava's View pill, Fitbod summary, Yazio's "+")                               | 3       |

  - Tropos:
    - Start workout is 51 tall but only 321 wide, nested 36 pt inside the card.
    - Train's Start is 52 × 329.
    - The workout logger's Complete set is 51 × 361 pinned, which matches the rule.

  Cited screens:
  - Runna Today, Record workout 45 × 360 pinned above the tab bar: [be9b0bcc](https://mobbin.com/screens/be9b0bcc-6c28-4abf-bde0-6b046df1207d).
  - Ladder workout detail, 46 × 357: [d67cb7a1](https://mobbin.com/screens/d67cb7a1-a18f-4deb-aa87-3ac00916e913).
  - Hevy finish, Done 47 × 360: [db9dd20e](https://mobbin.com/screens/db9dd20e-1263-4da0-88ef-4fdca528cc6a).
  - Bevel finish, Done 51 × 356 above two tonal halves: [9dcab6d1](https://mobbin.com/screens/9dcab6d1-881d-446d-b49e-eaa0e417f2bb).

- **Why it works:**
  - One filled shape per screen is the answer to "what do I do here". Two filled shapes ask the person to choose.
  - Pinning the way forward at the thumb, at full width, makes it reachable without hunting. It also leaves the hero free to be a picture rather than a form.
- **Tropos today:**
  - §14i maps roles to variants but does not limit the count.
  - A filled segmented-control active state (Train's Lift) and filled chips (Food's meal chips) both read as primary.
- **Proposed wording:**
  - **One filled button.** A screen has one filled button, 48 pt tall, and it is the action the screen exists for. On a session, finish or detail screen it is pinned above the home indicator (or above the tab bar), full width inside the 16-pt gutter.
  - On Home it is the Start of today's session.
  - Segmented actives, meal chips and quick-add circles use the tonal fill (10–14% of their domain colour), never the solid fill.

### Rule 10. Day 1 keeps the hero's slot: an empty hero is at least 75% of its full size and draws the empty object

- **Rule:** On a new account, the hero block is at least 75% of the height it will have with data, and it draws the object empty: a ring at 0, outlined segments, a grey body map. It is never an icon-and-sentence block.
- **Evidence:** day-1 hero against the same screen with data.

  | App                 | Day-1 hero | Hero with data | Change | What day 1 draws                                     |
  | ------------------- | ---------- | -------------- | ------ | ---------------------------------------------------- |
  | WHOOP               | 146        | 144            | +1%    | the three dials as "--%"                             |
  | Cal AI              | 143        | 150            | −5%    | the 2900 ring card                                   |
  | Oura                | 400        | 450            | −11%   | the dial at 0                                        |
  | Fitbod recovery     | 436        | 591            | −26%   | the body map, beside an explainer sheet              |
  | Strava best efforts | 372        | 214            | +74%   | a big empty podium                                   |
  | Apple Summary       | 200        | not captured   | —      | an empty ring at full size, 140 of the card's 200 pt |

  None of the six uses an icon-in-a-shape empty state in the hero slot.

  Tropos:
  - New Home's session card is 191 against 210 with data (−9%), which passes.
  - New Analytics replaces the 181-pt Performance card with a 228-pt block of a hexagon icon, two lines and a button.
  - New Social Feed's first block is the same kind of empty block (170).

  Cited screens:
  - WHOOP new user: [a04b3fb9](https://mobbin.com/screens/a04b3fb9-cae0-4dd7-8b46-42403add333a).
  - Oura getting started: [f6c46e74](https://mobbin.com/screens/f6c46e74-427e-4197-9d63-03ed1f42a114).
  - Strava empty podium: [f921cb7b](https://mobbin.com/screens/f921cb7b-4fb3-402f-a494-0428c4a7b99d).
  - Cal AI day 1: [928beeca](https://mobbin.com/screens/928beeca-5bc5-4dfd-bc7a-d52753bb359a).

- **Why it works:**
  - The layout teaches what will appear there.
  - The empty ring is an unfinished goal, a reason to start.
  - Every new person sees day 1. CLAUDE.md's cold-start rule makes it one of the most-seen states.
- **Tropos today:** §10a requires six states but not their geometry. The art direction already says "Day 1 is full, not empty", and this rule makes it measurable.
- **Proposed wording:**
  - **Empty heroes keep their size.** A hero with no data is drawn at least 75% of its full height, as the empty version of itself: the ring at 0, the week's segments outlined, the body map unlit. The one sentence under it says when it fills.
  - The centred icon-in-a-hexagon empty state is for lists only, never a hero.

### Rule 11. A list row is 56–64 pt, and a taller row earns its height with a picture or figures

- **Rule:**
  - Text rows (title plus one meta line) are 56–64 pt.
  - A row taller than 72 pt carries a thumbnail ≥ 56 pt (photo, map, form art) or figures at ≥ 20 pt.
  - Rows in one list share one surface with hairlines. They are not separate cards, except when each row is a tappable plan item.
- **Evidence:** row pitch, measured from dividers or block edges.

  | App and list             | Row pitch  | What the row carries                     |
  | ------------------------ | ---------- | ---------------------------------------- |
  | MacroFactor food search  | **62**     | text, hairlines                          |
  | MacroFactor contributors | 62         | text                                     |
  | Runna run types          | 56 + 8 gap | separate cards                           |
  | Hevy logger sets         | 49         | set table                                |
  | Gentler detail rows      | 44         | text                                     |
  | Fitbod exercises         | 112        | 63×93 photo thumbnails                   |
  | Ladder movements         | 119        | 80-pt video thumbnails                   |
  | Hevy programs            | 140        | 90×124 art                               |
  | NRC activities           | 154        | three 22-pt figures, 36-pt map thumbnail |

  All four rows over 72 pt carry a thumbnail ≥ 60 pt or 20+ pt figures. Tropos's Training history rows are **101** pt with a 36-pt icon tile and 13–17-pt text, while its exercise rows (69, 48-pt art) and plan rows (73) are in family.

  Cited screens:
  - MacroFactor search: [e48b1b63](https://mobbin.com/screens/e48b1b63-00de-4a1b-afbd-27d2ca22e120).
  - Fitbod builder: [ce72c126](https://mobbin.com/screens/ce72c126-7a91-4a1c-893d-c0ca1885acaa).
  - NRC all activity: [c20a7fbc](https://mobbin.com/screens/c20a7fbc-a50f-4f54-8d4f-4fec4bf84ca1).

- **Why it works:**
  - Height is a promise of content. A 100-pt row of small text reads as empty space and halves how many sessions fit.
  - A picture or a big figure justifies the height, because it is what people scan for.
- **Tropos today:** no row spec. Sessions show about 4 per viewport where MacroFactor or Runna would show 6–7.
- **Proposed wording:**
  - **Rows.** A text row is 60 pt: title, one meta line, 12 pt above and below.
  - Make a row taller only to show a picture of the thing (route thumbnail, form art ≥ 56 pt) or its numbers as figures. A saved run's row shows its route, and a saved lift's row shows its first exercise's art.

---

## 2. Rules we should NOT copy

- **Photo-led heroes (Ladder, WHOOP, Oura).**
  - The heroes measured: Ladder's 472-pt coach photo card on Home ([0e0eb164](https://mobbin.com/screens/0e0eb164-8560-4d10-b8bf-93017db938fa)), WHOOP's 66% workout photo ([f7ce5e9e](https://mobbin.com/screens/f7ce5e9e-6478-48e0-a1c2-7bd3389c7033)), and Oura's landscape photo behind the whole Today tab (100% full-bleed).
  - They rest on a library of commissioned photography that Tropos does not have.
  - A new user has no photo of their own, so the hero would be stock: a brand image, not "you".
  - Rule 6's full-bleed band is for the user's own picture (their route, their Space, their medal art), not for mood photography.
- **Full-screen colour fields on everyday screens (NRC, Duolingo).**
  - NRC's volt achievement ([931d5b5c](https://mobbin.com/screens/931d5b5c-bc58-44f6-80e1-478c4ae9d594)) and Duolingo's orange streak ([84ec5a7b](https://mobbin.com/screens/84ec5a7b-37ce-4c38-808d-7c3c91c3c0aa)) are 91–94% saturated colour.
  - They work because they appear once, as a reveal. Tropos already allows that for rewards (§14l).
  - Copied onto Home or the logger, they would make every day a celebration, and the celebration would stop meaning anything.
- **A floating Start pill over the list (Fitbod).**
  - Fitbod's coral 36 × 147 pill at the bottom right ([e3dbfe3e](https://mobbin.com/screens/e3dbfe3e-150c-4f42-9773-04715f96b12f)) covers the last exercise row.
  - It is under the 44-pt floor.
  - It duplicates a start the hero can carry. Rule 9's pinned full-width button is the more common pattern (12 screens against 10 floating), and the floating ones are logging tools, not a session's start.
- **A separate round "+" beside the tab pill (WHOOP, Oura, Cal AI).** This works when an app has one global create action. Tropos's actions are domain-specific (start a lift, start a run, log food), and a sixth target in the bottom 90 pt crowds a 5-item pill.
- **The date-strip header as a justification (Runna, Cal AI).** These two have the heaviest chrome in the set (26% and 28%) and are the top of the range, not the norm. Tropos Home (33%) should not cite them. If the strip stays, the title goes to one line (Q1).
- **The 24-pt editorial gutter (NRC, Strava, Duolingo, Headspace (x), Airbnb (x)).**
  - It pairs with full-bleed imagery and big type.
  - Mixing 24 and 16 gutters inside one app breaks the column every Tropos screen aligns to.
  - 8 of 17 fitness apps use 16. Keep it.
- **Very round cards (Alma 31.6, BitePal 31.2, Gentler 29.5).** These are brand-soft surfaces paired with illustration or a mascot. At Tropos's data density they read as bubbles, which is the opposite of what Rule 7 fixes.
- **Apple Fitness's even card grid as permission for a column of equal cards.**
  - Summary ([5b8d5290](https://mobbin.com/screens/5b8d5290-6c52-436f-bac3-9d0a531db829)) is a user-edited widget grid: 200/180/158 pt, runner-up 0.90, and it has an Edit mode with remove badges.
  - Its hero is still the ring, at 70% of the first card's height.
  - Tropos Home is not user-arranged, so the analogy does not hold.
- **Duolingo's 3D slab buttons and the winding path.** The darker 4-pt bottom lip and the node path are Duolingo's brand language. Copied, they would read as borrowed.

---

## 3. Open questions for the owner

1. **Home's header: the week strip or the two-line title?** Today the 30-pt pad, date line, "Today" and the week strip cost 179 pt (33% chrome on device, against a reference median of 14%).
   - **A.** Keep the strip, which every Tropos tab shares, and drop the eyebrow date into a single 34-pt title line ("Today · Sat 7 Nov"), as Runna's and Cal AI's one-line headers do. This saves about 35–40 pt and lands near 28%.
   - **B.** Take the strip out of the chrome and draw the week inside the hero as the session's place in the week, the way Apple's ring strip sits only on the day detail and WHOOP and Oura show none on Home. This saves about 75 pt and lands near 23%, but the week stops being a navigator on Home.
2. **Detail and finish heroes: full-bleed, or stay inset?**
   - **A.** Run map, Space photo and finish screen open on a full-bleed band from y = 0 with floating round buttons (Rule 6; Strava, Cal AI, Ladder). Cards stay for the facts below.
   - **B.** Keep the 16-pt inset card at radius 16. This is calmer and needs no new pattern, but every screen stays 85–100% cards and the "everything is a box" look remains.
3. **Where Home's Start lives.**
   - **A.** Keep Start inside the hero, as Hevy's routine card, Duolingo's popover and Gentler's rest card do. Make it the hero's full inner width, 48 tall, and keep it the only filled button (the water "+" becomes tonal).
   - **B.** Pin a full-width Start (48 × 361) above the tab bar, as Runna's Record workout does. The hero is then free to be open or a picture (Rule 5), but the button stays on screen when the person scrolls past today, so it has to change with the day's state (Start, Resume, Done).

---

## Files

- This file: (working files, not committed)
- Figure: (working files, not committed). It shades the app chrome on 8 screens: Tropos Home and Social as device simulations, then Apple Fitness, WHOOP, Oura, Strava, Hevy and Runna.
- Data: `data/annot.py` (hand annotation), `data/types.py` (container types), `data/metrics.json`, `data/colour.json` and `data/spacing.json`. The raw card detections are in `auto.json`.
- Images: 48 new screens in `img/` and their mobbin URLs in `ledger.tsv`. The URLs for the older refs are in `refmap.tsv`.
- Gridded review crops: `crops/grid-*.jpg` and `crops/sheet-*.jpg`.
