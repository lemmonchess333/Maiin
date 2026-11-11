# Words on screen: rules taken from the apps people come back to

Area: the words themselves. Hero headlines, the coach line under a score, card titles, buttons, reward lines, first-use lines, bad-day lines, notifications.

The owner's complaint was that Tropos's wording is "consistently bad". One mockup said "your legs ran 18.4 km": legs don't run, you do. This file turns 16 apps' real copy into 11 checkable rules, each tested against Tropos's current frames and its `src/lib` copy.

## How this was measured

- **Sample.** 322 strings transcribed by hand from **82 screens** of 16 apps. Screens per app: WHOOP 6, Oura 7, Bevel 3, Apple Fitness 6, Gentler Streak 4, Runna 5, Ladder 3, Duolingo 11, Fitbod 4, Nike Run Club 6, Hevy 5, Strava 10, MacroFactor 5, Cal AI 3, Yazio 3, Lifesum 1.
  - 61 screens come from the shared `../../refs/` set and 21 were added from Mobbin into `img/`. I looked at every one; small text was read on full-resolution crops.
  - Each app's main screens are covered (home or today, a list or log, a detail, a reward) plus its first-use and bad-day states where Mobbin has them.
  - Eight lock-screen live activities were also read from Mobbin previews: Hevy, NRC, WHOOP, Oura, Apple Fitness, Strava, Runbuds and Future.
- **Love vs tolerate.** This is by reputation, not measured here. Yazio and Lifesum are mass-market diaries people tolerate. The other 14 are the habit apps the brief names.
  - Strava's _Athlete Intelligence_ text is a new subscriber AI feature. It appears below as a pattern **not** to copy.
- **The data.** Every string, its app, screen URL, role and a hand-coded grammatical subject are in `corpus.py`.
  - Roles are hero, insight, card, button, reward, first-use, bad-day, notification, empty and label.
  - `measure.py`, `measure2.py` and `measure3.py` compute everything below. Their outputs are in `measure*-output.txt`, and you can rerun them with `python3 -I measure.py`.
- **What is a sentence.** A sentence is any string of 4 or more words in an insight, bad-day, first-use, reward, empty or notification role, split at `. ! ?`. That gives n = 118.
  - A headline is the largest line of words on a hero, reward, first-use or bad-day screen (n = 47, listed in `measure.py`).
- **Tropos's side.** The Tropos copy was read from the captured frames in `../../current/`: home, new-home, program, training-plan, weekly-review, history, finish, badges, notifications, social and profile.
  - It was also read from the strings in `src/lib/performanceLine.ts`, `performanceInsights.ts`, `performanceSummary.ts`, `weeklyReviewViewModel.ts`, `paceVerdict.ts` and `firstWeek.ts`.
  - That gives 16 headlines, 40 sentences and 28 buttons. Tropos subjects were hand-coded too (`measure3.py`).

### The numbers that matter, side by side

| measure                                                                                   | reference (16 apps)                                                                             | Tropos today                                                                 |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| headline length, words                                                                    | median 3, range 1–10 (n=47); 34/47 are 4 words or fewer                                         | median 2.5, range 1–6 (n=16)                                                 |
| headline contains a digit                                                                 | 11/47 (23%)                                                                                     | **0/16**                                                                     |
| sentence length, words                                                                    | median 9, range 4–23 (n=118); 109/118 are 15 words or fewer                                     | median 7, range 2–20 (n=40)                                                  |
| sentence contains a digit                                                                 | 31/118 (26%)                                                                                    | **2/40 (5%)**: the pace verdict template and Together's "Groups of about 20" |
| sentence is about **you** (subject is you, or an imperative to you)                       | 56/118 (47%)                                                                                    | 12/40 (30%)                                                                  |
| sentence is about **a thing** (the week, load, sessions, momentum)                        | 21/118 (18%)                                                                                    | **18/40 (45%)**                                                              |
| body part as the subject of a training act ("legs ran")                                   | 0/118                                                                                           | 0/40 in the app; 1 in the mockup                                             |
| training-science noun nobody explains (load, volume, adherence, baseline, signals, index) | 14/118 (12%); 12 of them are the app's own named score or a body measure, which the app teaches | **8/40 (20%)**, none taught                                                  |
| sentence ends in "!"                                                                      | 24/118 (20%); 0% in 6 of the 16 apps                                                            | 0/40                                                                         |
| buttons: words / verb-first                                                               | median 2, 58/68 are 1–3 words; 56/68 verb-first                                                 | median 2; 24/28 verb-first                                                   |
| a button with a session name in it                                                        | 0/68                                                                                            | 1/28 ("Start Pull — Lat Focus")                                              |

The short version: Tropos's lines are not too long, and they are not too loud. They are too abstract. They talk about _load_, _volume_ and _the week_ where every reference app talks about _you_ and _your number_.

---

## Rules

The figures in the rewrites (40%, a recovery score of 41 against a usual 60, 4,120 kg) are examples. The appendix names where each one would come from, and which of those sources already exist.

### Rule 1. The person does the training. The body only recovers.

- **Rule:** In any sentence that reports a training or logging act (ran, lifted, logged, finished, missed, added), the subject is "you" or an imperative to you.
  - A body part, a session, "load" or the plan is never the one doing the act.
  - A body part may be the subject only of a physical state: it recovers, it is fresh, it is tired.
- **Evidence:** `measure3.py` lists every reference sentence with an act verb.
  - 15 of them use the act as a verb with a subject. **14 have "you"** and 1 is a passive about a challenge (Strava, "June 5K x Brooks Challenge completed").
  - **0 have a body part.** All 4 reference sentences whose subject is the body are physical states:

    | app            | sentence                                      |
    | -------------- | --------------------------------------------- |
    | Gentler Streak | "muscles also need time to recover"           |
    | Gentler Streak | "your body repairs any small tears"           |
    | WHOOP          | "your body is functioning normally"           |
    | WHOOP          | "your body is in balance and fully recovered" |

  - Cited:
    - [NRC "You ran 3 times in a week."](https://mobbin.com/screens/931d5b5c-bc58-44f6-80e1-478c4ae9d594) (`refs/progress/nrc-youre-on-fire.jpg`)
    - [Oura "You hit your activity goal on 57% of days."](https://mobbin.com/screens/9ff7183f-de8f-45b2-8985-23f105c4914e) (`refs/progress/oura-report-57pct-story.jpg`)
    - [Gentler Streak "You've burned 147 kcal"](https://mobbin.com/screens/d52cd871-49fa-4ccb-b944-cb4a60ffed0d) (`img/gentler-youve-burned-147.jpg`)
    - [Gentler Streak rest day, the body recovering](https://mobbin.com/screens/c991401a-cc03-4eb2-9143-e775e8b15865) (`refs/home/gentler-streak-home-rest-day-character.webp`)
- **Why it works:** The finished act is the reward, and the reward belongs to the person. Giving credit to a limb or a metric splits the credit and sounds machine-written, which is exactly what the owner heard.
- **Tropos today:** The house voice in CODING_STANDARDS says nothing about subjects.
  - 2 of the 5 Tropos act-verb sentences give the act to a thing:
    - "Load has **run** high, so this is a good week to ease off." (weekly review, `weeklyReviewViewModel.ts`)
    - "Most sessions **ran** off-plan." (`performanceInsights.ts`)
  - The mockup's "your legs ran 18.4 km" is the same mistake.
  - The app's own uses of "legs" are correct, with legs as the thing acted on: "so your legs are fresh for it" (`DeloadBanner.tsx`) and "while your legs recover from the race" (`ProgrammeRunSection.tsx`). Keep those.

| ✗                                                       | ✓                                                   |
| ------------------------------------------------------- | --------------------------------------------------- |
| Your legs ran 18.4 km this week.                        | You ran 18.4 km this week.                          |
| Most sessions ran off-plan.                             | You did 2 of your 6 planned lifts.                  |
| Load has run high.                                      | You ran 40% more than your usual week.              |
| Your plan knows you're tired.                           | (no rewrite: the plan doesn't know; say the number) |
| ✓ allowed: Your legs need two easy days after the race. |                                                     |

- **Proposed wording:** "**The person does the training.** When a sentence reports something done (ran, lifted, logged, finished, missed), its subject is _you_, or it is an instruction to you. A body part may recover, rest or be fresh; it never runs or lifts. A metric (load, volume, the score) or a session never runs, climbs or does anything; say what _you_ did and give the number."

---

### Rule 2. A coach line carries one of your numbers, with what it is compared with.

- **Rule:** Every insight, verdict or bad-day sentence does one of two things:
  - it contains one of the person's own numbers with its point of comparison (than usual, of planned, since week 1, last Saturday), or
  - it sits directly under the figure it explains.
  - "Load is high" fails: an adjective with nothing to measure it against.
- **Evidence:** 31/118 reference sentences carry a digit: WHOOP 29%, Bevel 75%, Hevy 100%, Duolingo 71%.
  - Every insight or bad-day sentence with a number also gives the comparison, except one: Runna's "You will have 3 workouts this week", which states a consequence.

    | app   | number              | compared with                                             |
    | ----- | ------------------- | --------------------------------------------------------- |
    | WHOOP | "26% higher"        | "than usual"                                              |
    | WHOOP | "10% lower"         | "than usual"                                              |
    | WHOOP | "1:19"              | "below your weekly average over the last 6 months (1:39)" |
    | Bevel | "40% today"         | "lower than your usual"                                   |
    | Bevel | "dipped to 67%"     | "lower than yesterday's 77%"                              |
    | Hevy  | "stronger than 48%" | "of male lifters your age"                                |
    | Oura  | "57%"               | "of days"                                                 |
    | NRC   | "3 times"           | "in a week"                                               |

  - The reference sentences with no digit sit directly under a dial that shows the number: Oura's 80 and 62 gauges, Gentler's bar.
  - Cited:
    - [WHOOP "Your HRV is 10% lower than usual…"](https://mobbin.com/screens/2a304724-c00c-49b4-861d-0af230d8827e) (`img/whoop-lower-hrv-yellow-coach.jpg`)
    - [WHOOP trend 1:19 vs 1:39](https://mobbin.com/screens/e2217a0e-7bb4-4aac-9edb-20a890bd9788) (`refs/progress/whoop-trend-strength-6m.jpg`)
    - [Bevel "dipped to 67% … yesterday's 77%"](https://mobbin.com/screens/bf86c914-92f3-441f-acf6-08a4c2a7e1d0) (`img/bevel-sleep-dipped-67.jpg`)
    - [Bevel "Recovery is at 40% today, which is lower than your usual"](https://mobbin.com/screens/746c3b08-afd9-4790-945c-ac254f31f41c) (`refs/home/bevel-home-three-dials-insight.webp`)
- **Why it works:** The number is the proof, and the comparison makes it the person's own scale. A low day is then "lower than _your_ usual", not a grade. Without a number, "Load is high" can't be checked, and it reads like a horoscope.
- **Tropos today:** **0/27** coach sentences carry a number. That covers `performanceInsights.ts`, `performanceSummary.ts`, the weekly review and the Home and Train frames. Only the pace verdict has numbers ("Faster than easy today: 5:12 /km, against 5:45–6:15 /km.").
  - The engine already has the numbers. `performanceLine.ts` prints "Running distance 40% above your usual week" in two states, then falls back to the bare "Load is high. Ease off this week" in the backing-off state, the one that most needs a reason.
  - The weekly review frame does it right in one place: "sessions, 2 of 6 lifts and 1 run".

| ✗ (Tropos now)                                  | ✓                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Load is high. Ease off this week                | You ran 40% more than your usual week. Keep tomorrow easy. (`runAheadOfBaseline`)     |
| Training volume dipped.                         | You lifted 3.5k kg less than the 30 days before. (the History frame's own "↓3.5k kg") |
| Recovery signals are below your usual baseline. | Your recovery score is 41; your usual is 60.                                          |
| You stacked more sessions than usual.           | 6 sessions this week; you usually do 4.                                               |

- **Proposed wording:** "**One number, and what it's compared with.** A coach line, verdict or bad-day line includes one of the person's own numbers and its point of comparison: _than your usual week_, _of 6 planned_, _since week 1_, _last Saturday_. The exception is a line printed directly under the figure it explains. Never put an adjective about a metric ('high', 'elevated', 'dipped') where the number could go."

---

### Rule 3. The coach sentence: verdict first, then the reason, then one step. The number, the colour and the words agree.

- **Rule:** The coach line is 1–2 sentences of 15 words or fewer each.
  - It starts with the verdict in plain words, then gives the reason (the number from Rule 2).
  - It adds a next step only when the screen offers it as a button. Otherwise it stops.
  - A high score shown in a calm or warning colour must say in words why a high number isn't good news.
- **Evidence:** 18 insight paragraphs from 8 apps, hand-coded:

  | part of the paragraph                   | how many have it |
  | --------------------------------------- | ---------------- |
  | a verdict                               | 18/18            |
  | a number                                | 11/18            |
  | a comparison with the person's own past | 7/18             |
  | a next step                             | 11/18            |
  | all four                                | 1/18 (Bevel)     |
  - So the fixed part is **verdict first**. The number comes when it isn't already in a dial, and the step only when there is one.
  - 11 of the 18 paragraphs are 1–2 sentences. The longer ones are cut at about 2 lines by the app itself ("…", "Show more": Bevel, Oura Meals).
  - Every scored screen in the sample has a number, a colour and words that agree (6 screens):

    | app   | number and colour | words                                             |
    | ----- | ----------------- | ------------------------------------------------- |
    | WHOOP | 86%, green        | "Elevated HRV … peak recovery"                    |
    | WHOOP | 49%, yellow       | "Yellow means your body is functioning normally"  |
    | WHOOP | 17%, red          | no words at all                                   |
    | Oura  | 80                | "very good"                                       |
    | Oura  | 62                | "Major signs of strain", on an orange storm photo |
    | Bevel | 40%               | "lower than your usual"                           |

  - Cited:
    - [WHOOP Elevated HRV 86%](https://mobbin.com/screens/4e7d8b71-ac46-472f-8e31-b619f5e533ae) (`refs/home/whoop-home-today.webp`)
    - [Oura readiness 80](https://mobbin.com/screens/bfe532d9-62fe-4246-9775-9c8934195bcb) (`refs/home/oura-today-readiness-80.webp`)
    - [WHOOP 17% red, no sentence](https://mobbin.com/screens/10431550-32a3-40f6-b8e5-bdebed0e2ad6) (`img/whoop-red-17-recovery.jpg`)

- **Why it works:** The verdict answers the question the person opened the app with ("push or rest?") in the first 5 words. The number makes it believable. Agreement between number, colour and words is what makes the number trusted from then on.
- **Tropos today:** Home and Analytics show **"92"**, a green **"+2"** chip and amber **"Backing off. Load is high. Ease off this week"**. The number went up, the chip says good and the verb says retreat. Nothing says that 92 measures _how much_ you trained, not how well. (The engine maps your usual week to 67 and anything over 1.3× it to 90+, per `performanceEngine.ts`.)
  - The weekly review repeats the clash: "92 performance, up 2 · Load has run high, so this is a good week to ease off." It sits under "2 of 6 lifts".
  - The verdict word "Backing off" is a fragment with no subject.
- **Rewrite:** "**92, up 2.** You trained 40% more than your usual week. Keep tomorrow easy." The verdict ("keep tomorrow easy") follows the reason. Better still: lead with "Ease off tomorrow. You ran 40% more than your usual week."
- **Proposed wording:** "**Verdict, reason, step.** A coach line is one or two sentences, each 15 words or fewer: the verdict first in plain words, then the number that earns it, then one step only if the screen offers it as a button. The figure, its colour and the sentence must say the same thing. If a high number means _slow down_, the sentence says why."

---

### Rule 4. The hero line names today's session or today's state, in 4 words or fewer.

- **Rule:** The largest words on a hero are 4 words or fewer. They name either:
  - the session ("Pull A", "Legs day"), or
  - the day's state ("Rest day", "Recovery done").
  - The small kicker above carries time and position, with a number ("Today · lift 3 of 6"). The line below carries the figure.
  - No "!" and no "?", unless the screen has a control that takes the answer.
- **Evidence:** 47 headlines: median 3 words, range 1–10, 34/47 are 4 words or fewer. The long ones are first-use instructions or rewards ("Complete a Welcome Workout to unlock all workouts.", 8).
  - 11 home or today heroes:
    - **7 state the day:** Oura "Feeling good?", "Major signs of strain", "Getting started"; Gentler "Day to Rest and Recover", "Go Gentler"; Runna "Recovery done, Alex", "A new plan awaits, Alex".
    - **2 name the session:** Ladder "ARMS & DEEP CORE", Fitbod "Legs day".
    - **2 name the section:** MacroFactor "DASHBOARD", Apple "Summary".
  - "!" on state headlines: 0/12.
  - Questions: 4 screens ask the person a question, and 3 of them come with a control for the answer: Duolingo "Can you practice every day?" → "I'M COMMITTED"; Runna "Missed workouts?" → two options; WHOOP's coach question → a chat field. Oura's "Feeling good?" has none.
  - Kickers carry context with a number: Duolingo "SECTION 2, UNIT 1", Runna "Friday, Sep 5 · 25m - 35m", Ladder "Wednesday", NRC "Week 1 Active".
  - Cited:
    - [Runna "Recovery done, Alex"](https://mobbin.com/screens/48d9e879-8ad7-4c03-8483-8b064eb3a4f1) (`refs/home/runna-today-rest-day-recovery-done.webp`)
    - [Fitbod "Legs day"](https://mobbin.com/screens/e3dbfe3e-150c-4f42-9773-04715f96b12f) (`refs/home/fitbod-workout-today-legs-day.webp`)
    - [Duolingo kicker + "START +25 XP"](https://mobbin.com/screens/3ecf07e8-cea8-4414-b5d9-05cd21033429) (`refs/home/duolingo-path-start-popover.webp`)
- **Why it works:** A 2–3 word name is read in a glance. The person learns _what today is_ before reading anything else. Moving the number into the kicker or the line below keeps the name clean and still gives a fact.
- **Tropos today:** The Home hero "Pull A" passes. The kicker "Planned for today" is 3 words that say nothing the date above doesn't. "Your first workout" (new account) is a good kicker.
  - The longest Tropos headlines are the empty states ("Nothing from people you follow yet", 6 words).
  - Tropos has no state words for a rest or deload day on Home. The "Consider a lighter week" banner sits on Train instead.
  - Rewrite: kicker "**Today · lift 3 of 6**", headline "**Pull A**", line "**Back and biceps, about 26 min. Last time you rowed 32.5 kg × 8.**"
- **Proposed wording:** "**The hero names today in four words or fewer**: the session ('Pull A') or the day ('Rest day', 'Race week'). The kicker above gives time and position with a number ('Today · lift 3 of 6'); the line below gives the figure. No exclamation mark; no question unless the screen takes the answer."

---

### Rule 5. Plain nouns: name things the way the person would.

- **Rule:** Coach lines use sessions, days, kg, km, minutes and meals.
  - They don't use _load, volume, adherence, baseline, signals_ or _Performance Index_.
  - The exception: the same screen defines the term in one sentence the first time it appears, as Oura and WHOOP teach their scores.
- **Evidence:** Reference: 14/118 sentences use such a term. 12 of the 14 are the app's own named score or a body measure (HRV, Readiness, Recovery, respiratory rate), which the app teaches on first sight. The other two are Oura's "baseline" and Fitbod's "1RM":
  - Oura: "The Readiness Score shows how ready you are for the day." ([5a37255c](https://mobbin.com/screens/5a37255c-77fd-4e23-884b-5d9af68a0a38), `refs/home/oura-today-first-readiness-score.webp`)
  - WHOOP: "Your WHOOP Recovery Score reveals how well your body has recovered each day … Right now, your score is based on general population data." ([b2940af4](https://mobbin.com/screens/b2940af4-7b74-489a-b1d6-1222b1eaa964), `img/whoop-calibrating-first-recovery.jpg`)
  - Hevy, Strava, NRC, Runna, Apple Fitness, Cal AI and MacroFactor's main screens use **none** of the six words above in a sentence. Hevy's feed has no app sentence at all, only "Time · Volume · Records" labels over numbers ([4ba60a24](https://mobbin.com/screens/4ba60a24-eae5-434f-aff6-06947dc5c65d), `img/hevy-feed-labels-only.jpg`).
- **Why it works:** The person thinks in sessions and kilos, not in training load. An undefined term turns a verdict into homework, and the person can't act on what they can't picture.
- **Tropos today:** 8/40 sentences: _load_ ×3, _volume_ ×2, _adherence_, _recovery signals … baseline_, _Performance Index_. No captured frame says what "load" is or what 92 measures.

| ✗                                                                | ✓                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Adherence was high this week.                                    | You did all 4 planned sessions.                                                             |
| Your Performance Index needs a few weeks of data to spot trends. | Your score settles after about 4 weeks of training.                                         |
| Volume is elevated this week.                                    | You lifted 14,200 kg this week; you usually lift 10,500 kg.                                 |
| (first sight of the score, new)                                  | Performance compares this week's training with your last four. Your usual week is about 67. |

- **Proposed wording:** "**Say sessions, kilos and kilometres.** Coach lines never use load, volume, adherence, baseline, signals or index. If a screen shows a score of our own, the first time a person sees it, one sentence says what it measures and what their usual is."

---

### Rule 6. Buttons: a verb and its object, in 1–3 words. The name goes above the button.

- **Rule:** A button starts with a verb, is 1–3 words and 20 characters or fewer, in sentence case (a house choice to keep).
  - The session's name is the heading above the button, never inside it.
  - A link to more information that isn't an action is a row with a chevron, not a button.
- **Evidence:** 68 reference buttons: median 2 words, 58/68 are 1–3 words, **56/68 verb-first**.
  - The non-verb buttons are Done, Next, No thanks, option choices (Rest / Active Recovery) and first-person commitments.
  - **0/68 contain a session name**: Fitbod "Start Workout", Runna "Record workout", NRC "START", Apple "Let's Go" under "Yoga with Molly".
  - Only Duolingo prints a reward on the button ("START +25 XP", "SHARE +20 GEMS").
  - Letter case is a brand choice, with no consensus: 17 ALL CAPS, 22 Title Case, 21 sentence case.
  - Cited:
    - [Apple "Let's Go" under the session name](https://mobbin.com/screens/e857d9fb-8522-4e87-9704-35228f51a38b) (`img/applefitness-plan-letsgo.jpg`)
    - [Runna "Record workout"](https://mobbin.com/screens/be9b0bcc-6c28-4abf-bde0-6b046df1207d) (`refs/home/runna-today-workouts.webp`)
    - [NRC "START"](https://mobbin.com/screens/2704b68b-8ef8-4655-9bc0-618fca80ecc9) (`img/nrc-run-start-first-run.jpg`)
- **Why it works:** The thumb needs the verb. The eye already has the name from the heading. A short button reads the same at 200% text and in any session's name length.
- **Tropos today:** 28 buttons, median 2 words, 24/28 verb-first, sentence case ✓.
  - "**Start Pull — Lat Focus**" (Your plan) is 4 words, 22 characters and contains an em dash. Rewrite: heading "Pull — Lat Focus", button "**Start workout**".
  - "**Your best moment**" (weekly review) has no verb, so it can't say what happens. Rewrite: "**See your best moment**".
- **Proposed wording:** "**Buttons are a verb and its object**: 1–3 words, 20 characters or fewer, sentence case ('Start workout', 'Log food', 'Take a lighter week'). The session's name is the heading above the button, never inside it."

---

### Rule 7. Reward lines: the achievement, its number, what you did, what's next.

- **Rule:** A reward screen has up to three lines:
  - **Headline:** names the achievement with its number in 5 words or fewer ("3-day streak", "Your fastest 5K", "First run").
  - **Line under it:** You + past-tense verb + number + its point of comparison, 12 words or fewer.
  - **Third line (optional):** the next milestone and how far off it is.
  - A system confirmation (saved, logged, completed, updated) never heads a reward.
- **Evidence:** 14 reward screens across 10 apps:
  - **13/14** put a number or ordinal in the headline or the line under it. Oura's sits in the dial above "Goal reached".
  - Reward headlines: median 3 words, range 2–5 (n = 11).
  - The "you did" lines: NRC "You ran 3 times in a week."; Apple "Your current streak is 1 week."; Hevy "This is your 1st workout"; Oura "You reached your activity goal!"; Lifesum "You added your first meal!"
  - 4/14 name the next milestone with its gap: Duolingo "Tomorrow makes 7 days"; Yazio "let's go for the 7-day milestone"; Ladder "Complete 2 more workouts!"; NRC "43.04 mi to 1st milestone".
  - Cited:
    - [NRC "YOU'RE ON FIRE / You ran 3 times in a week."](https://mobbin.com/screens/931d5b5c-bc58-44f6-80e1-478c4ae9d594) (`refs/progress/nrc-youre-on-fire.jpg`)
    - [Strava "Your fastest 1K in 2026!"](https://mobbin.com/screens/ec37f99f-d129-48ad-b1fe-a535ef450751) (`img/strava-fastest-1k-ai-card.jpg`)
    - [Apple award "You earned this award for … 1 week."](https://mobbin.com/screens/ef801eab-0b55-4042-8763-0f980714b094) (`refs/progress/applefitness-award-earned-3d.jpg`)
    - [Ladder "Complete 2 more workouts!"](https://mobbin.com/screens/05f70a6f-c904-497f-af89-df41f6846b44) (`refs/home/ladder-workout-complete-3d-coin-streak.webp`)
- **Why it works:** The number makes the reward specific, so it can't be faked or felt as generic. "You" gives the credit, and the next milestone gives a reason to come back tomorrow.
- **Tropos today:**
  - The finish screen is headed "**Workout saved**", a system confirmation. Its numbers ("<1 minute · 90 kg lifted · 1 set") are labels with no "you".
  - "Your week so far · 1 of 6 lifts · 1 day streak" is good material placed as a footnote.
  - The Home row "**New badge · Getting Started**" never says what earned it. In `badges.ts` the badge is a 3-day streak.

| ✗                           | ✓                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Workout saved / Pull A      | **Pull A done** / You lifted 4,120 kg in 41 min, 2.5 kg more on the row than last Saturday. / 4 of 6 lifts this week. Next: Push A on Monday. |
| New badge · Getting Started | **New badge: Getting Started** / You've logged 3 days in a row. 4 more for Week Warrior.                                                      |
| You crushed it!             | (no rewrite: never; see Rule 10 and "do not copy")                                                                                            |

- **Proposed wording:** "**A reward says what, how much and what's next.** Headline: the achievement with its number, five words or fewer. Under it: _You_ + what you did + the number + its point of comparison. Then the next milestone and how far off it is, if there is one. 'Saved', 'logged' and 'completed' confirm a save; they never head a reward."

---

### Rule 8. First-use lines: the first step, and when it fills, with a number.

- **Rule:** An empty first-use surface draws its goal at full size with zero in it, and one sentence says two things:
  - the first step, and
  - when the surface fills, using a number or the session's name.
  - "First" is used as a reward, not an apology. "No X yet" and "Nothing … yet" never head the screen.
- **Evidence:** 20 first-use screens across 13 apps:
  - A "No … yet" headline: **1/20**. Strava's "No PR - Yet!" is followed at once by "Upload a run of 1 mile or longer to record a PR." ([f921cb7b](https://mobbin.com/screens/f921cb7b-4fb3-402f-a494-0428c4a7b99d), `refs/progress/strava-besteffort-empty-podium.jpg`)
  - The empty goal drawn at full size with zero in it: **8/20**. Apple "0/300 CAL", Cal AI "2900 Calories left", WHOOP "--%", Yazio "Day 0/3", Duolingo's 6 empty day dots, Oura's 0–350 gauge, Fitbod "0 days since", Apple "0 of 100".
  - Says when it fills: **9/20, with a number in 7** ("3 more nights", "one more sleep", "Saturday, January 3", "1 mile or longer", "1 STEP LEFT", "Day 0/3", "after today").
  - "First" as a celebration: 6 (Oura "Your first Readiness Score!", Hevy "This is your 1st workout", Strava "Kudos on your first activity!", Lifesum "You added your first meal!", Runna "My First Run", NRC "First Run").
  - Cited:
    - [WHOOP "Only one more sleep until you unlock your Week One Highlights."](https://mobbin.com/screens/a11c3a93-6d32-491d-b86b-fb69ba758b4a) (`img/whoop-almost-there-week-one.jpg`)
    - [Runna "Your plan will start on Saturday, January 3 …"](https://mobbin.com/screens/24c5d161-e6b3-44e4-9df7-daa205e0d024) (`refs/home/runna-today-new-plan-awaits.webp`)
    - [Cal AI "Tap + to add your first meal of the day" under 2900](https://mobbin.com/screens/928beeca-5bc5-4dfd-bc7a-d52753bb359a) (`refs/food/calai-home-day1-empty.jpg`)
- **Why it works:** Every new person lives in this state. "No analytics yet" tells them they have nothing. "Finish Upper A and this fills" tells them they are one session from something. A countdown with a number makes the first return visit a plan rather than a hope.
- **Tropos today:** 5 of 7 first-use headlines are "No/Nothing … yet": "No sessions logged yet", "No analytics yet", "Nothing from people you follow yet", "No notifications yet" and "Nothing shared yet". None has a number.
  - Tropos already says _when_: "Your Performance will appear after your first logged session" ✓, "When they share a session, it shows here." ✓. Keep that.

| ✗ (Tropos now)                                                                                                              | ✓                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| No sessions logged yet / Your Performance will appear after your first logged session                                       | **Your first score** / Finish Upper A and it appears here. It settles over 4 weeks.                       |
| No analytics yet / Log a workout, run or meal and your trends will show up here.                                            | **Your first week starts here** / Finish Upper A and this page draws your sessions, kg lifted and km run. |
| No notifications yet / Props and comments on your sessions, and news from your circles and spaces, show up here. (17 words) | Props and comments on your sessions land here. (8 words, no headline)                                     |
| Your first week · Day 1 of 7 · 0 of 1 done                                                                                  | Your first week · Day 1 of 7 · Finish Upper A to start it                                                 |

- **Proposed wording:** "**Day one is a starting line, not an empty room.** Draw the goal at full size with zero in it. One sentence says the first step and when this fills, with a number or the session's name ('Finish Upper A and your first score appears'). 'First' is a reward word. Never head a screen with 'No … yet'."

---

### Rule 9. Bad-day lines: your number against your usual, no grade, one choice.

- **Rule:** A low, missed or over-target day is stated as the person's number against their own usual or plan, in 15 words or fewer.
  - It uses no judgement words: _fail, bad, poor, behind, over, too much, only_.
  - If there is something to do, it offers one choice as a button.
  - Over-target food is numbers only, with no warning colour and no sentence.
  - In a list, a miss is an empty mark. The word "missed" appears at most once on the screen, attached to a choice.
- **Evidence:** 16 bad-day screens from 8 apps, hand-coded per screen:

  | app · screen                                                                                                  | number           | vs own usual | next step                   | judgement word                                                     | "!" |
  | ------------------------------------------------------------------------------------------------------------- | ---------------- | ------------ | --------------------------- | ------------------------------------------------------------------ | --- |
  | Oura · Major signs of strain ([31d2964f](https://mobbin.com/screens/31d2964f-6f51-40f4-9b56-773e284abed4))    | in dial          | –            | rest if low on energy       | –                                                                  | –   |
  | Oura · 57% of days ([9ff7183f](https://mobbin.com/screens/9ff7183f-de8f-45b2-8985-23f105c4914e))              | ✓                | –            | take pride in rest days     | – (reframed: "You don't need to hit your activity goal every day") | 2   |
  | Oura · Meals "Limited" ([186f8fc9](https://mobbin.com/screens/186f8fc9-295a-4bf3-a92e-da89c46edb56))          | –                | –            | protein-rich snack          | "Limited" label                                                    | –   |
  | WHOOP · HRV 10% lower ([2a304724](https://mobbin.com/screens/2a304724-c00c-49b4-861d-0af230d8827e))           | ✓                | ✓            | –                           | – ("functioning normally")                                         | –   |
  | WHOOP · strength 1:19 vs 1:39 ([e2217a0e](https://mobbin.com/screens/e2217a0e-7bb4-4aac-9edb-20a890bd9788))   | ✓                | ✓            | –                           | – ("below")                                                        | –   |
  | WHOOP · red 17% ([10431550](https://mobbin.com/screens/10431550-32a3-40f6-b8e5-bdebed0e2ad6))                 | ✓                | colour       | –                           | no words at all                                                    | –   |
  | Bevel · Recovery 40% ([746c3b08](https://mobbin.com/screens/746c3b08-afd9-4790-945c-ac254f31f41c))            | ✓                | ✓            | prioritise rest             | –                                                                  | –   |
  | Bevel · Sleep 67% vs 77% ([bf86c914](https://mobbin.com/screens/bf86c914-92f3-441f-acf6-08a4c2a7e1d0))        | ✓                | ✓            | (cut off)                   | – ("a bit lower")                                                  | –   |
  | Bevel · "Below normal" ([cf175d8e](https://mobbin.com/screens/cf175d8e-0c46-4461-90cb-3c5163d9349a))          | ✓                | ✓ (range)    | –                           | –                                                                  | –   |
  | Gentler · Go Gentler ([af1d374d](https://mobbin.com/screens/af1d374d-4ab3-4d9c-9c9d-47a1ed767ee1))            | –                | –            | "Today I Choose Rest"       | –                                                                  | –   |
  | Runna · missed sheet ([df6ff839](https://mobbin.com/screens/df6ff839-9843-48fa-aee7-337ec0804cd0))            | ✓ ("3 workouts") | –            | 2 options with consequences | "missed"                                                           | 3   |
  | Runna · home "Missed workouts?" ([48d9e879](https://mobbin.com/screens/48d9e879-8ad7-4c03-8483-8b064eb3a4f1)) | –                | –            | skip or add                 | "missed"                                                           | –   |
  | Duolingo · <3 hours ([1755644a](https://mobbin.com/screens/1755644a-3b98-4a8e-906f-0ef606e166eb))             | ✓                | –            | Extend streak               | –                                                                  | 1   |
  | Duolingo · freeze ([3b18d128](https://mobbin.com/screens/3b18d128-382c-4604-9f98-214c7d239779))               | ✓                | –            | refill                      | – (reframed: "You protected")                                      | 1   |
  | MacroFactor · 5141 / 2041 ([8f43f9df](https://mobbin.com/screens/8f43f9df-d586-4583-871c-2e13664892b3))       | ✓ only           | –            | –                           | **no words; rings capped at 100% in their own colours**            | –   |
  | Cal AI · fat 117/98 g ([0b587652](https://mobbin.com/screens/0b587652-d78b-4abb-8d03-aa9685167524))           | ✓ only           | –            | –                           | no words                                                           | –   |
  - Totals: a number on **12/16**. A comparison with the person's own usual on 5/16, all of them WHOOP and Bevel. A choice on 9/16. "!" on 4/16. **Fail, bad, poor, behind, over, too much: 0/16.** The strongest words used are Oura's "Limited" rating and Runna's "missed".
  - Misses inside lists are marks with no word: Duolingo's calendar, Yazio's grey flames, Cal AI's dashed day rings, Apple's empty rings.
  - Local files: `refs/home/oura-today-signs-of-strain.webp`, `img/whoop-lower-hrv-yellow-coach.jpg`, `img/macrofactor-over-target-5141.jpg`, `img/runna-missed-workouts-sheet.jpg`.

- **Why it works:** Measuring against your own usual turns a bad day into information, not a grade, which is the mechanism the house voice already credits to MacroFactor and Happy Scale.
  - Saying it once and offering one choice gives the person something to do with the feeling, instead of a label that sits there all week.
- **Tropos today:**
  - The plan list prints "**Lift day · Missed**" twice in a row. The Home week strip's dashed circles already show the same miss with no word ✓.
  - The Train banner "**Consider a lighter week** / Your running load has been high, with signs of reduced recovery. A lighter week can help you come back stronger." has no number, and its last clause is a motivational tail.
  - Insights "Below plan / Most sessions ran off-plan."
  - Numbers on 0 of these 5.

| ✗ (Tropos now)                                                                                                                             | ✓                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Lift day · Missed (×2 rows)                                                                                                                | Lift day ◌ (rows) + one line above: **2 lifts not done this week** · [Move one to Sunday]                                                       |
| Consider a lighter week / Your running load has been high, with signs of reduced recovery. A lighter week can help you come back stronger. | **Ease off this week?** / You ran 40% more than your usual week, and your recovery score is 41 (usual 60). [Take a lighter week] [Keep my plan] |
| Below plan / Most sessions ran off-plan. Reset next week with one anchor.                                                                  | **2 of 6 lifts this week** / Weeks like this would fit a 3-day plan. [Try 3 days]                                                               |

- **Proposed wording:** "**A bad day is your number, not a grade.** State it as the person's number against their own usual or their plan, in 15 words or fewer, with no judgement words (fail, bad, poor, behind, over, too much, only). Offer one choice if there is one. Food over target shows the numbers only, with no warning colour and no sentence. In lists a miss is an empty mark; the word 'missed' appears at most once, next to a choice."

---

### Rule 10. Exclamation marks: none in the app's everyday text, and at most one on a reward or first-ever screen.

- **Rule:** No "!" on buttons, labels, state headlines, coach lines, bad-day lines, toasts or empty states.
  - A reward or first-ever screen may carry one "!", on its headline or on its line, never both.
- **Evidence:** "!" by role across all 322 strings:

  | role            | "!"   |
  | --------------- | ----- |
  | buttons         | 0/68  |
  | labels          | 0/47  |
  | state headlines | 0/12  |
  | card titles     | 1/56  |
  | insights        | 6/42  |
  | bad-day         | 5/22  |
  | first-use       | 5/29  |
  | rewards         | 8/24  |
  | notifications   | 10/16 |
  - 6 of 16 apps use **no** "!" at all in the sample: Apple Fitness, Bevel, Cal AI, Fitbod, Gentler Streak and MacroFactor.
  - The heavy users are the game-style apps: Duolingo (85% of its sentences), Ladder, Yazio, and Runna's coach.
  - On reward screens 8/14 carry one. NRC and Apple put the energy in display type and colour instead: "YOU'RE ON FIRE" over "You ran 3 times in a week.", which ends in a full stop ([931d5b5c](https://mobbin.com/screens/931d5b5c-bc58-44f6-80e1-478c4ae9d594)).
  - Where "!" stacks it reads as nervous. Runna's miss sheet has 3 in 3 sentences ([df6ff839](https://mobbin.com/screens/df6ff839-9843-48fa-aee7-337ec0804cd0)).

- **Why it works:** Calm text keeps "!" rare, so it still means something on the one screen that earns it. In the numbers, the warmth comes from "you" and the figure, not from punctuation.
- **Tropos today:** 0 "!" (the house rule), which is right for the everyday text. Whether a reward may carry one is open question 1.
- **Proposed wording:** keep the house voice's "No exclamation-mark cheer in UI chrome" and add: "A reward or first-ever screen may carry one exclamation mark, on its headline or its line, never both. Energy comes from the number, the colour and the type size, not from punctuation."

---

### Rule 11. Notifications and live activities: a name or a number first.

- **Rule:** A notification's first words are a person's name or the reader's own number, and the body is 12 words or fewer. A live activity or widget is figures and labels only, with no sentence. Never send a countdown to losing something.
- **Evidence:** 16 notification and widget strings from 4 apps, plus 8 lock-screen live activities.
  - **0 of the 8 live activities have a sentence.** Hevy shows "Deadlift (Barbell) · Set 3 of 4 · 90 kg x 5 reps" ([184c2861](https://mobbin.com/screens/184c2861-65d0-4764-a3d3-6808a961264e), `img/hevy-live-activity-set.jpg`). NRC shows "3.76 Miles · 54:48 · 14'33''" ([24a6e841](https://mobbin.com/screens/24a6e841-1143-4008-84bd-38a9c549a3b3)).
  - 9/16 notification strings contain a name or a number. The other 7 are generic engagement pushes, such as Strava's "Your activity is ready. Go dive into those stats!" and "You gained some serious ground" ([d921bfc6](https://mobbin.com/screens/d921bfc6-d802-4fb0-9aa2-fc24cb668d13), `img/strava-notifications-list.jpg`).
  - Length: median 7 words, range 3–17.
- **Why it works:** On a lock screen, the name or the number is the only part read. "Maya" and "8.2 km" are the reasons to open the app.
- **Tropos today:** The server messages already lead with the name ✓: "{fromName} gave you props" and "{fromName} commented on your activity" (`functions/`). They never say _which_ session.
  - Rewrite: "Maya gave your **8.2 km run** props."
- **Proposed wording:** "**Name or number first.** A notification starts with a person's name or the reader's own number and names the session ('Maya gave your 8.2 km run props'), 12 words or fewer. Live activities and widgets are figures and labels only. Never send a countdown to losing something."

---

## Rules we should NOT copy

1. **Strava Athlete Intelligence hype.** Examples: "You **crushed** this afternoon run with three new personal bests and hit your weekly goal—**seriously impressive** speed work today." and "**Wow, what a run!** You **absolutely crushed it**…" ([f6b18597](https://mobbin.com/screens/f6b18597-ed12-4014-98bb-7da449d3ad85), [79781054](https://mobbin.com/screens/79781054-6bd6-4e50-bd30-726e9706c0a1)).
   - It is AI-written praise on a paid feature. It restates the numbers in hype words and uses the "crushing it" the house voice already bans.
   - Strava's own Best Efforts card shows the better version a few pixels above it: "Your fastest 1K in 2026!"
2. **Duolingo's loss-aversion copy.** "Last chance, Sam Lee!" on the lock screen beside an angry red owl ([269fa3a3](https://mobbin.com/screens/269fa3a3-12a4-4b07-b3d3-87cfce4b95aa)). "845 days · Please practice!" ([292dabe3](https://mobbin.com/screens/292dabe3-384b-4a45-81d8-85d998bbf852)). A "1:47:37" countdown live activity ([97acbdbc](https://mobbin.com/screens/97acbdbc-0d3b-4070-8711-fa4797ea9e66)).
   - A language lesson is safe to do every day. Training is not: rest days are part of the plan. Guilt aimed at a rest day is bad coaching, and lapsed or ill people are a real segment of users (CLAUDE.md).
3. **Runna's cheerleading around a miss.** "Looks like you missed a few workouts - no problem, it happens! Pick an option below and let's keep moving forward. You've got this!" That is 3 "!" and 2 slogans.
   - Copy the **options with their consequences** ("You will have 3 workouts this week" / "Your plan for this week stays the same"). Drop the cheering.
4. **Hevy's peer percentile.** "You are stronger than 48% of male lifters your age and bodyweight." ([14db3357](https://mobbin.com/screens/14db3357-172d-401e-9179-05f032ec2a26))
   - A beginner would read "stronger than 6%". It is gendered. Tropos compares you with your own past (Rule 2), and that never punishes the cold start.
5. **Gentler Streak's paragraphs and first-person buttons.** The rest-day hero carries 44 words of physiology ("Exercise is a wonderful way to support muscle growth and development…"), plus "You have full permission to rest and relax" and the button "Today I Choose Rest". Duolingo and Yazio have "I'M COMMITTED".
   - That therapeutic voice is Gentler's brand. On Tropos it would break Rule 3's two-sentence limit.
   - Commitment buttons collect a promise that later becomes a guilt lever.
6. **WHOOP's marketing cards in the data stream.** "Unlock New Potential · Connect WHOOP to Strava and your favorite apps for a **seamless** experience" and "WHAT YOUR DOCTOR LIKELY DIDN'T TEST" ([a04b3fb9](https://mobbin.com/screens/a04b3fb9-cae0-4dd7-8b46-42403add333a), [4e7d8b71](https://mobbin.com/screens/4e7d8b71-ac46-472f-8e31-b619f5e533ae)).
   - These are ads in the coach's voice, and the CODING_STANDARDS AI-tell list already bans _unlock_ and _seamless_.
7. **Sentences in ALL CAPS.** NRC "YOU'RE ON FIRE", Ladder "TEAMMATES WORKING OUT", MacroFactor "DASHBOARD" and "6 DAYS until check-in".
   - These are brand typefaces. Caps work for 1–3 display words, never for a sentence. Display type belongs to the typography rules, not to the words.
8. **Branded scores the app never teaches.** Oura and WHOOP spend first-use screens teaching "Readiness" and "Recovery".
   - If Tropos keeps a named score ("Performance 92"), copy the _teaching_ (Rule 5), not the habit of inventing a noun and leaving it unexplained.

## What to keep from the current house voice (CODING_STANDARDS, line 97 on)

The sample supports most of it:

| house-voice rule                                                  | what the sample shows                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| Observational, not judgmental                                     | judgement words on 0/16 bad-day screens                   |
| No exclamation cheer in the app's everyday text                   | 0/68 buttons, 0/47 labels                                 |
| No AI tells                                                       | Strava's AI text is the counter-example                   |
| Genre exceptions for spoken run cues, kudos chips and badge names | none of the rules above touches those three genres        |
| MacroFactor never shames a high day                               | at 252% of target it shows "5141 / 2041" and nothing else |

Sentence-case buttons are a house choice the sample neither supports nor contradicts; keep them.

What the voice lacks is anything positive about **who** a sentence is about (Rule 1), **numbers** (Rules 2 and 7), and **plain nouns** (Rule 5). "Observational" has produced lines that observe a metric ("Load is high") instead of a person ("You ran 40% more than usual"). The proposed additions fill that gap without loosening the calm.

## Open questions for the owner

1. **May a reward screen carry one "!"?**
   - **A, yes, one:** "Your fastest 5K!" or "Your first run!". This matches 8/14 reward screens (Hevy, Strava, Oura, Lifesum).
   - **B, no:** the energy comes from display type and colour, as on NRC's "YOU'RE ON FIRE / You ran 3 times in a week." and Apple's award. This keeps the house rule absolute.
2. **On days without a session to start, does Home's hero say the day's state in words?**
   - **A, yes:** "Rest day", "Ease off", "Race week", "Recovery done". This matches 7/11 home heroes (Oura, Gentler, Runna).
   - **B, no:** the hero only ever names a session (Ladder, Fitbod: 2/11). Rest and deload stay as smaller cards.
   - DS3's "the first thing should be something to do today" fits B on rest days, unless the rest day is the thing to do.
3. **Do hero and reward lines use the person's first name?**
   - **A, yes, on the day's first greeting and on rewards:** "Recovery done, Alex", "Wow! Nice work, Sam". 5 apps do this, 7 uses in the sample (Runna, WHOOP's coach, Gentler, Duolingo, Strava), and never on buttons or labels.
   - **B, no:** names stay on Social, where they mean another person.

## Appendix: Tropos lines and their rewrites in one place

| where (file or frame)                                  | now                                                                                                                                        | rewrite                                                                                                | data it needs (already exists?)                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Home performance row, Analytics (`performanceLine.ts`) | 92 · +2 · Backing off. Load is high. Ease off this week                                                                                    | 92, up 2. You ran 40% more than your usual week. Keep tomorrow easy.                                   | `runAheadOfBaseline` / `liftAheadOfBaseline` ✓ |
| Weekly review (`weeklyReviewViewModel.ts`)             | 92 performance, up 2 · Load has run high, so this is a good week to ease off.                                                              | 2 of 6 lifts and 7.0 km run. You ran 40% more than usual, so this week starts easy.                    | ✓                                              |
| Train banner (`DeloadBanner` / ease-week nudge)        | Consider a lighter week · Your running load has been high, with signs of reduced recovery. A lighter week can help you come back stronger. | Ease off this week? · You ran 40% more than your usual week, and your recovery score is 41 (usual 60). | load ratio ✓; recovery score: check the source |
| Plan list (`TrainingPlan`)                             | Lift day · Missed (×2)                                                                                                                     | Lift day ◌ · one line: 2 lifts not done this week [Move one to Sunday]                                 | ✓                                              |
| Home hero kicker                                       | Planned for today                                                                                                                          | Today · lift 3 of 6                                                                                    | `trainingWeek.ts` ✓                            |
| Home hero line                                         | 3 exercises · about 26 min · Back                                                                                                          | Back and biceps, about 26 min. Last time you rowed 32.5 kg × 8.                                        | last-time load ✓                               |
| Your plan button                                       | Start Pull — Lat Focus                                                                                                                     | Start workout                                                                                          | –                                              |
| Weekly review button                                   | Your best moment                                                                                                                           | See your best moment                                                                                   | –                                              |
| Finish headline (`WorkoutSessionCompletion`)           | Workout saved / Pull A                                                                                                                     | Pull A done / You lifted 4,120 kg in 41 min, 2.5 kg more on the row than last Saturday.                | `liftRecordsStore` ✓                           |
| Home badge row                                         | New badge · Getting Started                                                                                                                | New badge: Getting Started. You've logged 3 days in a row.                                             | `badges.ts` ✓                                  |
| New Home performance row                               | No sessions logged yet · Your Performance will appear after your first logged session                                                      | Your first score · Finish Upper A and it appears here. It settles over 4 weeks.                        | ✓                                              |
| Analytics empty                                        | No analytics yet · Log a workout, run or meal and your trends will show up here.                                                           | Your first week starts here · Finish Upper A and this page draws your sessions, kg lifted and km run.  | ✓                                              |
| Notifications empty                                    | No notifications yet · Props and comments on your sessions, and news from your circles and spaces, show up here.                           | Props and comments on your sessions land here.                                                         | –                                              |
| insights (`performanceInsights.ts`)                    | Adherence was high this week. Nothing needs changing.                                                                                      | You did all 4 planned sessions.                                                                        | ✓                                              |
| insights                                               | Training volume dipped. Consistency matters more than peak weeks — pick one workout to anchor next week.                                   | You lifted 3.5k kg less than the 30 days before. Pick one lift to keep next week.                      | ✓                                              |
| insights                                               | Most sessions ran off-plan. Reset next week with one anchor.                                                                               | 2 of 6 lifts this week. Weeks like this would fit a 3-day plan.                                        | ✓                                              |
| Notification (`functions/`)                            | Maya gave you props                                                                                                                        | Maya gave your 8.2 km run props                                                                        | activity summary on the props doc: check       |
| Mockup                                                 | your legs ran 18.4 km                                                                                                                      | You ran 18.4 km                                                                                        | –                                              |
