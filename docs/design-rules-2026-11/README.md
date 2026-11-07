# Tropos design rules, measured from the apps people come back to

Decided 7 November 2026 (DS4 in the plan file; the owner took every recommendation). The rules are in DESIGN_GUIDE.md §0 and §14m and, for words, in CODING_STANDARDS.md's house voice; this folder keeps the evidence.

## Where these come from

Five research passes on Mobbin, each measured with code on the screenshots (pixel colour, text heights, block sizes) and checked by eye:

| Area                        | Reference screens     | Apps                | Tropos frames   |
| --------------------------- | --------------------- | ------------------- | --------------- |
| Hierarchy and type          | 80                    | 18 + 2 cross-checks | 19              |
| Colour                      | 145                   | 21                  | 33 + 10 mockups |
| Layout                      | 68                    | 17 + 3 cross-checks | 18              |
| Imagery, rewards, first use | 74                    | 16                  | 27              |
| Words                       | 82 screens, 322 lines | 16                  | all frames      |

Apps: Apple Fitness, WHOOP, Oura, Strava, Nike Run Club, Hevy, Ladder, Runna, Fitbod, Gentler Streak, Bevel, Duolingo, MacroFactor, Cal AI, Yazio, Lifesum, MyFitnessPal and others. Revolut, Headspace and Airbnb are cross-checks only. Each area's rules, measurements and cited screens (as Mobbin links) are in this folder: `rules-type.md`, `rules-colour.md`, `rules-layout.md`, `rules-imagery.md`, `rules-words.md`. The screenshots and measuring scripts were working files and are not committed; Mobbin screens are linked, not copied.

## What it found

1. **Tropos isn't short of colour; the colour is in the wrong place.** Its everyday screens carry 3.1% colour against the apps' 2.4%. On 17 of 32 Tropos frames the biggest patch of colour is a button; in the apps it's the person's data (6 of 85).
2. **Its hierarchy is upside down.** On Home, the "Today" page title is bigger than the session. 78% of Tropos screens have a large page title; 13% of the apps' do. Navigation and controls ("chrome") take 31% of a Tropos screen against the apps' 14%.
3. **It has no pictures where people look.** Imagery covers about 5% of a Tropos screen against the apps' 16%, and none of Tropos's Home screens has a hero picture. Seven of 12 lists have no picture per row. All 30 badges have the same silhouette.
4. **Rewards are where it's too quiet.** The finish screen carries 2.1% colour and about 9 blocks. The apps' reward screens carry about 13% colour in one object, with one figure and one button.
5. **The words are abstract.** 5% of Tropos lines carry a number, against 26% in the apps, and 45% are about a thing ("load", "the week") rather than you.

The research also overturned my first mockups:

- They flooded Home with purple, measuring 35% colour. The cap is 8%.
- They set Home in 76 px poster type. Nothing on a reference Home exceeds 48 px.
- They made the finish screen a full purple flood with 9 blocks. Reward screens put a coloured object on a plain page and use at most 6 blocks.

## The rules

### Hierarchy

1. **One hero per main screen and per finish or reward screen.** It takes 30–60% of the first screen, with its top in the first 260 pt. _(63 of 80 reference screens; Tropos 10 of 18; Train's next session starts at 555 pt.)_
2. **The hero holds the largest text, at least 1.2× the next size. No large page title sits above a hero:** the hero names the screen, and the date is a small kicker. _(Large titles: 13% of reference screens, 78% of Tropos. On Home the title is 24.4 pt of ink and the session 19 pt.)_
3. **A size ladder.** The next block is at most 0.8× the hero's height, or 0.65× on Home. _(Reference median 0.60; Tropos Home 0.97; for a new account the Food card is taller than the workout card.)_
4. **The hero is not just another card.** On a detail or reward screen it leaves the card; on Home it's dressed differently from the cards below it. _(In a card: 3 of 18 detail heroes and 2 of 12 reward heroes; Tropos 14 of 18 screens.)_

### Type

5. **Home and detail heroes use a headline of 25–38 px or a figure of 40–48 px. Nothing on these screens goes above 48 px.** _(No reference Home screen goes above about 50 pt.)_
6. **Display type at 64–120 px only on finish, new-best, streak and live screens.** One element per screen, in the hero, in Archivo's wide heavy cut; it's the same family, so there is still no third font. _(10 of 79 reference screens; 0 of 30 Home screens.)_
7. **At most six text sizes on a screen.** _(Median 5; 74 of 79 comply.)_
8. **A unit on a big figure is a caption, or sits on the baseline at 0.4–0.7 of the figure's height.** Tropos already does this; keep it.

### Colour

9. **Everyday screens carry at most 8% colour on dark and 15% on light.** _(80 of 86 reference screens.)_
10. **The biggest colour on a screen is your data:** a ring, segments, a route, a figure's lit muscles. Never a button. _(Button biggest on 6 of 85 reference screens; Tropos 17 of 32.)_
11. **At most three hues on a screen, and one holds at least 60% of the colour.** _(78 of 86; the leading hue's median share is 92%.)_
12. **Each colour has one meaning, and generic actions are neutral.** Purple is lifting and the brand, coral running, orange food, teal water, gold a new best. Follow, Edit profile, Start a circle and Done are white or grey. A domain action may take its domain colour, so Start workout is purple and Log food is orange. _(8 of 8 apps with meaning colours; Tropos's purple does about seven jobs.)_
13. **Gradients are allowed within one hue (30° of hue or less), fading into the page or card.** _(15 of 15 everyday reference gradients. Tropos's Food hero blends orange into purple: the only multi-hue everyday gradient in 178 screens.)_
14. **On dark, colour is strokes and glows on a neutral ground; filled areas stay small.** _(Fills are a median 0.4% of dark reference screens; 0 of 31 flood. Tropos's fills: 1.4%.)_
15. **Each colour keeps its hue in both themes, and dark is never louder than light.** _(Tropos Food: 7.2% colour in dark, 2.9% in light.)_
16. **An empty metric is a full-size grey track; colour arrives with data.** _(WHOOP is 0.6% colour while calibrating and 3.5% with a score.)_

### Layout

17. **Chrome takes at most 20% of a tab's main screen.** _(Reference median 14.4%; Tropos 31%, Home 33%, Social 42%.)_
18. **At most one row of controls under the title, drawn 32–40 pt tall.** _(Tropos's are 52 pt, and Social stacks two rows.)_
19. **The tab bar sits on the home indicator, within 90 pt of the screen's bottom edge.** _(Reference about 82 pt; Tropos 106 pt.)_
20. **One card radius, 16 pt, with 10–12 pt for what sits inside a card. Use 8–12 pt between cards in a group and about 32 pt between sections.** _(Tropos hero cards are 22 pt; Home repeats a 16 pt gap four times.)_
21. **One filled button per screen, about 45 pt tall and full width.** _(63 of 65; Tropos Home, Train and Food have two.)_
22. **List rows are 56–64 pt, or taller only with a thumbnail or a big number.** _(Tropos's session rows are 101 pt with a 36 pt icon.)_
23. **A screen about one session or place opens on a full-bleed band, 25–75% tall:** a run's map, a Space's photo, the finish screen. _(19 of 65 reference screens; Tropos 0 of 18.)_

### Imagery and badges

24. **Home, a session's detail and the finish screen each carry one picture of at least 10% of the first screen.** _(9 of 15 reference home screens and 9 of 9 detail screens; Tropos Home 0 of 3.)_
25. **Every row that stands for a session, a person or an award has its own picture, 36–80 pt.** _(7 of 12 Tropos lists have none.)_
26. **Imagery is yours or ours:** at least 80% from your data or photos, or Tropos's own art. No stock photos on personal screens. _(74% of reference imagery; stock photos in 3 of 16 apps, and only on community screens.)_
27. **Badges come in at least three silhouettes.** A badge for a count or a distance shows its number in the art. A locked badge is the same art, greyed, with its progress shown (Tropos already does this). _(Median 4 silhouettes per collection; 72% of 103 badges show the number. Tropos: 30 badges, one silhouette, no numbers.)_
28. **Tab icons are 20–24 pt.** _(Tropos's are about 16 pt.)_

### Rewards

29. **A full-screen reward is for firsts, streak milestones, new bests and a finished plan. A routine session gets a calm summary with a picture.** _(Firsts in 6 apps, streaks in 7.)_
30. **A reward screen has one object about half the screen's width in its top 40%, one display figure, at most one sentence, one main button, and at most 6 blocks.** _(Tropos "Workout saved": about 9 blocks, 6 numbers, 4 buttons, and a figure 23% wide inside a card.)_
31. **A reward's colour is the achievement's own, on the object, over the plain page: about 5–15% of the screen.** _(Reference median 13%; 5 of 29 flood the screen, and Nike Run Club's flood fails contrast at 1.76:1. Tropos finish screen 2.1%, weekly review 0.3%.)_
32. **Confetti only for firsts, new bests and a finished plan.**

### First use

33. **Day 1 leads with the first action. A metric at zero is drawn full size at zero, and the hero keeps at least 75% of its size.** No icon-only "nothing yet" block. _(7 of 8 reference home screens lead with the action; 15 of 18 metrics are drawn at zero. The icon block appears in 3 of 16 apps; Tropos uses it on 8 of 27 screens.)_

### Words

34. **You do the training; the body only recovers.** _(14 of 15 reference sentences about an act have "you" as the subject, and none a body part.)_
35. **Every insight carries one number and what it's compared with,** for example "10% lower than usual". _(0 of 27 Tropos coach lines carry a number.)_
36. **Verdict first, then the reason, then one step. The number, the colour and the words agree.** _(18 of 18 reference insights. Tropos shows "92 +2" next to "Backing off".)_
37. **A hero line is at most 4 words and names today's session or state.** _(Median 3.)_
38. **Plain nouns.** No load, volume, adherence or baseline unless the screen explains it.
39. **A button is a verb and its object, 1–3 words, at most 20 characters, in sentence case.** _(56 of 68 start with a verb. Tropos has "Start Pull — Lat Focus".)_
40. **A reward line says what you achieved, its number, what you did and what's next.** _(13 of 14 carry a number.)_
41. **A first-use line gives the first step and when it fills, with a number.** _(1 of 20 reference screens leads with "No … yet"; Tropos 5 of 7.)_
42. **On a bad day, show your number against your usual, with no judgement words.** _(0 of 16 bad-day screens use one.)_
43. **No exclamation marks in everyday text, and at most one on a reward screen.**
44. **A notification leads with a name or a number; a lock-screen live activity is numbers only.**

## What stays from the current guide

The research backs these:

- The five meaning colours.
- Two font families.
- The 16 pt gutter and card padding.
- Spaced units, and units smaller than their figure.
- Tokens instead of hex values, and 44 pt touch targets.
- AA contrast, both themes, and Reduce Motion.
- Locked badges drawn greyed.
- A calm colour budget on everyday screens.
- The house voice's core: observational, no cheering in UI, sentence case.

## What changes in the current guide

| Today's rule                               | Replaced by                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| "No gradients"                             | One-hue gradients that fade into the surface (13)                        |
| "Calm over flashy, when in doubt do less"  | The hierarchy rules (1–4) and the colour budget (9–11)                   |
| "No decorative elements"                   | The imagery rules (24–27)                                                |
| "No extra celebration dialog"              | The reward rules, for firsts, bests, streaks and a finished plan (29–32) |
| The hexagon empty state on every first use | The first-use rule (33)                                                  |
| A large title on every page                | The hero names the screen (2)                                            |
| Purple on every button                     | One meaning per colour, generic actions neutral (12)                     |

New, with nothing to replace:

- the chrome budget (17–19);
- one filled button per screen (21);
- badge silhouettes and numbers in the art (27);
- the words rules (34–44).
