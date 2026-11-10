# Rules: habit loops, first use, logging speed and honest selling

Area: what brings a person back and what makes the app quick to use. The streak and
its page; missed days and coming back; asking for notifications and other
permissions; setup and the plan it ends on; logging a set and logging food; the
week's count; the paywall. The five earlier files measure how a screen looks.
This one measures what a flow does. Studied 10 November 2026.

It answers the owner's question for this pass: what makes these apps easy, fun
and hard to put down, and which of it Tropos should hold itself to. The short
answer is at the end of "What it found".

## How it was measured (read this before trusting a number)

- **Screens.** 168 preview screens from 51 apps, found with 16 Mobbin searches
  (8 for flows, 8 for single screens) and each looked at before it was counted.
  42 of the apps are fitness, food, sleep or habit apps. Nine are cross-checks
  from other categories (Mesh, Copilot, Monarch, foodpanda, Vocabulary, 5 Minute
  Journal, LinkedIn, yope, Life Reset); they appear only in the trial and the
  comeback counts and are named where they do.
- **Counting, not pixels.** Every number here is a count of screens that do a
  thing, read by eye from Mobbin's preview images. Nothing was measured in
  points or in colour share, so nothing here overrides a number in the other
  five files. A flow's length is Mobbin's own screen count for that flow.
- **Samples are small and chosen by search.** Each count names its sample, and
  a sample of 6 to 15 is the norm. One sample is biased by its own search and
  says so: the nine trial screens were found by asking for a trial timeline, so
  "9 of 9 show a timeline" would be circular and is not claimed. A second,
  unbiased paywall search (10 screens) gives the base rate.
- **A flow preview is three to five screens.** For the six long flows (Cal AI
  setup, Runna setup, Hevy logging, Duolingo lesson, Strava recording, pushr
  setup) only those frames were seen, not every step.
- **Retention was not measured.** These are category leaders by reputation and
  by Mobbin's curation. A pattern most of them share is evidence that it does
  not hurt; it is not proof that it causes anyone to stay.
- **Tropos's side is read from the code,** at the file and line given, on main
  at `66733e9`. Nothing was captured on a device in this pass. "Not checked"
  means exactly that.

### The headline numbers

| What the reference apps do                                      | Count            | Tropos (main, 10 Nov)                  |
| --------------------------------------------------------------- | ---------------- | -------------------------------------- |
| Streak page shows the days, not only the count                  | 10 of 15         | Yes: a month of days                   |
| The count stands against a best or a next tier                  | 8 of 15          | Partly: the best is on the badges page |
| Training apps that count the streak in weeks                    | 5 of 5           | Days, kept alive on a weekly cadence   |
| A comeback screen pairs reassurance with a next step, no blame  | 5 of 5           | Yes                                    |
| Notification ask states its reason first                        | 10 of 10         | Yes                                    |
| It shows the notification before asking                         | 6 of 11          | Yes: the reminder's own words and time |
| Saying no is one plain tap                                      | 8 of 10          | Yes: the switch stays off              |
| Setup: one question a screen, a reason under it, progress shown | 4 of 4 flows     | Yes                                    |
| Setup length                                                    | 12 to 34 screens | 8 steps                                |
| Setup ends on a plan in the person's own numbers                | 10 of 10         | Yes                                    |
| A set row arrives filled in and logs in one tap                 | 6 of 6           | Yes                                    |
| Adding food opens on the person's own past foods                | 7 of 8           | Yes, once the box is focused           |
| The week is a seven-day strip                                   | 7 of 9           | Yes                                    |
| The week shows done against planned                             | 5 of 9           | Yes                                    |
| Paywall states price and period beside its button               | 9 of 10          | Yes                                    |
| Paywall says how to cancel                                      | 8 of 10          | Yes                                    |
| Trial screen promises a reminder before the charge              | 8 of 9 (biased)  | Yes, and offers a phone reminder       |

## What it found

1. **Tropos already has the mechanics.** Of the eleven rules below it meets
   nine, partly meets two and breaks none. Setup is the shortest in the sample.
   The streak forgives without selling forgiveness. The reminder ask shows the
   reminder. The trial screen is more candid than nine of the ten paywalls in
   the unbiased sample. The gap between Tropos and the apps people come back to
   is not a missing loop. It is how quietly the loops are drawn, which is what
   DS4's rules 1 to 33 already address.
2. **What brings people back is five things, and none is a trick.** A count
   they can see and do not want to break. Forgiveness when they do break it. A
   next thing that is always named. A log that takes one tap. A reminder they
   agreed to, in words they had already read. Every app in the sample that
   people describe as hard to put down has at least four of the five.
3. **The fun is in the feedback, not the furniture.** In all six live logging
   screens a finished set changes the row's colour at once, and Duolingo
   answers every tap inside a lesson with a verdict and a moving bar. Mascots
   and chests are one app's brand. Immediate, visible response to each action
   is in every app.
4. **The manipulative versions are a minority and easy to name.** Paid streak
   protection (2 apps), a countdown on a streak (1), guilt on saying no (1),
   multipliers with no source (3), a fake system dialog with a pointing hand
   (2), struck-through prices (4 of 10 paywalls). Tropos does none of them. The
   last rule keeps it that way.

## The rules

Numbering continues from the 44 in `README.md`.

### The streak

45. **The streak's own screen shows its days, as a week row or a month, beside
    the count.** _(10 of 15: Duolingo, Finch, Strava, WHOOP, pushr, Tonal,
    Open, Noom, LinkedIn, Cal AI. Not adidas Running, Hevy, Ladder, Atoms,
    Alma.)_ Tropos meets it: `StreakSheet.tsx:60-140` draws a month, logged
    days filled and covered days ringed.
46. **The count stands against something: your best, or the next tier and how
    far off it is.** _(8 of 15. A best or record: WHOOP, Atoms, Open, LinkedIn,
    Alma. A next milestone with progress: Duolingo, WHOOP, Ladder, Tonal,
    LinkedIn, Alma.)_ Tropos partly meets it. The longest streak is kept
    (`useStreaks.tsx:61`) and shown on the badges page (`BadgeGrid.tsx:175`),
    one tap from the sheet. The flame has tiers by day count (`flameTiers.ts`),
    but the sheet names neither the best nor the next tier. This is the one
    addition this pass recommends, and it belongs with DS4's "the profile, the
    streak and the badges" in its order of work.
47. **A missed day is absorbed, or answered with a next step. It is never
    blamed, and protection is never sold.** _(All 5 comeback screens pair a
    reassurance with something to do next and none uses a judgement word:
    Finch, Runna, Cal AI, Ten Percent Happier, Alma. Five apps absorb a miss
    automatically: Duolingo, Noom, LinkedIn, Alma, Finch. Two sell protection:
    Duolingo's shield for gems, Finch's repair for its currency.)_ Tropos meets
    it: covered days and one line of reassurance in the sheet, no freezes,
    shields or tokens (`StreakSheet.tsx:31-37`), and a "Welcome back" or "Last
    week didn't go to plan" sheet that offers how to adjust
    (`FellBehindSheet.tsx:173-202`). Runna's version is the closest reference:
    it states what each choice does to the week before the person picks.

**An observation, not a rule: the unit.** All five training apps with a streak
count it in weeks (adidas Running, Hevy, Ladder, Strava, Tonal). The nine that
count days are habit, language, food and wearable apps. Open shows both. Tropos
shows days and keeps them alive on a weekly cadence (Streak1). Tropos logs food
daily, so a day count is defensible, and this pass does not reopen Streak1. If
it is reopened, this is the evidence to start from. It is open question 1 in
the pass record.

### Asking for attention

48. **A permission is asked with its reason. A notification ask also shows the
    notification, in its real words and at its real time. Saying no is one
    plain tap.** _(10 of 10 priming screens state the benefit before the system
    prompt. 6 of 11 show the notification, counting Runna's from its setup, and
    4 use real words: Strava, Atoms, Tempo, Runna. 8 of 10 give a plain
    decline. 3 of 10 ask at the moment of use instead of in setup: Tonal on
    scheduling, Tempo on booking, Sweatcoin on starting.)_ Tropos meets it. The
    setup row prints the reminder it will send, built from the person's own
    next session and time (`SetupReminderRow.tsx:40-45, 64-68`). The evening
    reminder is offered after a session is logged
    (`CompletionReminderChoice.tsx:44`). Apple Health is asked for with what it
    is for (`StepsPrimingModal.tsx:33-34`).

### Setup and the plan

49. **Setup asks one thing a screen, says why under the question, and shows
    where you are. It stays at eight steps.** _(4 of 4 flows whose question
    screens were seen show progress and a reason line: Cal AI, Runna, Tonal,
    Garmin Connect. Lengths: pushr 12 screens, Cal AI 17 and 34 in two
    captures, Runna 25.)_ Tropos meets it and is the shortest: eight steps in
    five named chapters, each with its question and its reason
    (`Onboarding.tsx:114-152`). A ninth step needs one removed.
50. **Setup ends on your plan in your own numbers, changeable there, behind one
    button.** _(10 of 10 plan screens play back the person's answers or
    figures: Equinox+, Runna, Tonal, Cal AI, Yazio, pliability, MacroFactor,
    Apple Fitness, Garmin Connect, Noom. 5 of 10 allow a change on that screen.
    10 of 10 have one main button. 5 of 10 give a length or an end date.)_
    Tropos meets it: "Review your plan" then "Your plan", with "Change anything
    before you start" (`Onboarding.tsx:146-151`).

### Logging

51. **A set row arrives filled in. One tap on the row logs it, and the row
    changes at once.** _(6 of 6 live logging screens prefill each set from the
    plan or from last time, complete it with one control on the row and change
    the row's fill when done: Hevy, Ladder, Runna, WHOOP, Gymshark, Bevel. 5 of
    6 show elapsed time. Last time's numbers are on the row or one tap away in
    3 of 6.)_ Tropos meets the first two: the row carries last session's same
    set (`WorkoutSession.tsx:2731`) and one button moves through sets and
    exercises. The row's change on completion was not checked in this pass.
52. **Adding food opens on what you ate before. A row adds in one tap and
    carries its calories.** _(7 of 8 add screens open on the person's own
    history, recents or frequents before any typing: MyFitnessPal, BitePal,
    Bevel, Oura, Lifesum, Yazio, Noom. Cal AI opens on generic suggestions. 7
    of 8 add a row in one tap. 6 of 8 show calories on every row. 6 of 9 put
    scan, voice or barcode on the same screen.)_ Tropos meets it at one remove:
    the Quick add list of the person's own foods appears when the box is
    focused (`Food.tsx:140`, `FoodComposerCard.tsx:104-123`), and scan sits
    beside the box. Whether each Quick add row shows its calories was not
    checked.

### The week

53. **The week is seven days in a row with done against planned.** _(7 of 9
    weekly screens draw the seven days: Runna, The Outsiders, Gymshark, Strava,
    Withings, Peloton Strength+, Google Health. 5 of 9 set the count against a
    target: Runna, Strava, Withings, Google Health, Ladder.)_ Tropos meets it:
    "4 of 6 sessions this week" over seven segments (`WeekSessions.tsx:3-9`,
    `WeekStrip.tsx:33`), from the one week count every surface reads
    (`trainingWeek.ts`).

### Selling

54. **A paywall states the price and the period beside its button, says how to
    cancel, and can be left. A trial names the day it charges and the reminder
    before it.** _(Unbiased sample of 10 fitness and health paywalls: price and
    period beside the button on 9, "cancel anytime" on 8, a way out on all 10.
    Of the 4 that offer a trial, 1 draws a timeline, TIDE. In the 9 screens
    found by asking for a timeline, 8 promise a reminder before the charge and
    3 give the calendar date.)_ Tropos meets it and does more than the
    category: the billed amount in bold with the trial, "No payment due today",
    a visible way to keep Free, a trial timeline and a phone reminder
    (`Upgrade.tsx:5-20, 150-153`).

### What Tropos does not do

55. **No pressure tricks.** Each of these was seen in the sample and each is
    banned here:
    - protection for a streak that costs money or an earned currency (Duolingo,
      Finch);
    - a countdown or a "streak lost" interruption (yope's lock-screen timer,
      Cal AI's modal);
    - a second prompt that argues when someone says no (pushr: "it's not a wise
      idea to delay a good habit");
    - a multiplier with no source ("2x more likely", "9x better results":
      Runna, Breathwrk, Cal AI). Rule 35 already wants every number to say what
      it is compared with. A number about other people needs a source the
      person can open;
    - a drawn copy of the system permission dialog with a hand pointing at
      Allow (Cal AI, Breathwrk);
    - a struck-through price (Lifesum, BitePal, Yazio, Calm Sleep);
    - a question in setup that serves the business and not the plan (Cal AI's
      "Where did you hear about us?");
    - a marketing opt-in that arrives ticked (Runna's email list);
    - hearts, energy or any limit on how much someone may train or log
      (Duolingo).

## Smaller samples, kept as notes

- **Saving a session is one button.** Strava and Hevy both prefill the title,
  leave the note, photo and effort optional, and pin one Save. Two apps; not a
  rule. Tropos's run summary was not compared.
- **A post is something you can use.** Hevy's feed post opens "Save as
  Routine" and "Copy Workout". One app. Tropos has the same
  (`ActivityCard.tsx:1138`, `SaveRoutineSheet.tsx`).
- **A first-week list on the home screen.** Google Health shows "Discover more
  1/3" with a Dismiss. One app. Tropos's `FirstWeekCard` is the same idea with
  one or two rows.
- **An end-of-session chain.** Duolingo follows a lesson with up to four
  screens, each one object, one line and one button. DS4's rule 30 already
  holds a reward screen to that shape.

## What Tropos lacks, in order

1. **The streak sheet does not say what the count is measured against** (rule
   46). Add the best and the next flame tier's day count. Small: both values
   exist. It is a visual change, so it starts as a mockup with captures
   (DESIGN_GUIDE §0 rule 13).
2. **Two things were not checked and should be, on the capture rig:** a
   finished set's row changing at once (rule 51), and calories on each Quick
   add row (rule 52).

Nothing else. The rest of this file is a set of floors Tropos already stands
on, written down so a later change cannot quietly lower one.

## Cited screens

Streaks: Duolingo [streak flow](https://mobbin.com/flows/381d56b5-b9a6-426e-8d13-2f5b06d9d420),
[personal streak](https://mobbin.com/flows/971a833b-d067-4302-86b1-34df80ae62ac),
[streak with shield](https://mobbin.com/flows/d1739059-58c7-4b20-8630-8833869d34bb);
[adidas Running](https://mobbin.com/screens/9d27ac65-a9fa-4bad-98e6-3b48462e1337);
[Hevy](https://mobbin.com/screens/d9d34fad-9f60-4040-b53c-61bd8f6f8be9);
[Ladder](https://mobbin.com/screens/71401625-f188-4059-9d11-3b2e3f032e29);
[Finch](https://mobbin.com/screens/9c5434c3-6fa3-43bd-bcc2-c46c2e077e25);
[Strava](https://mobbin.com/screens/02f8ff4a-0d9d-492b-8be8-08fb9e9fe486);
[WHOOP](https://mobbin.com/screens/db83268b-206f-43b4-89ac-acb6f66cd699);
[Atoms](https://mobbin.com/screens/c9d10ef7-c55e-40d5-a8cb-3376e053d799);
[pushr](https://mobbin.com/screens/b06889cf-967c-4a69-b741-4f084b98fe82);
[Tonal](https://mobbin.com/screens/2493c7a2-d321-4d4f-8b2e-81614d8ceacf);
[Open](https://mobbin.com/screens/a9a3f387-4d20-410c-9f06-3f3bb2b90552).

Missed days and coming back: [Finch](https://mobbin.com/screens/d6e7a7b1-4b61-40b1-8ff7-1c602badec85);
[Noom](https://mobbin.com/screens/e8d88c93-7fb9-4411-a5e2-1be6d3d0d8a5);
[Alma](https://mobbin.com/screens/ea9a9230-151b-449e-bf4e-ac49022b3e71);
[Ten Percent Happier](https://mobbin.com/screens/b69f57db-e384-4cbd-8316-4378f3e53123);
[LinkedIn](https://mobbin.com/screens/ac97796a-bc39-417a-a3ec-b92d96040c1d);
[yope](https://mobbin.com/screens/bcb66346-6e57-45ff-9bf7-028336fafb7c);
[Cal AI](https://mobbin.com/screens/f48da1ad-4de3-4900-9abd-6978316b5bb7);
[Runna](https://mobbin.com/screens/df6ff839-9843-48fa-aee7-337ec0804cd0);
[Life Reset](https://mobbin.com/screens/7bc93398-ced0-4c75-a6e6-1b6ac26211c5).

Notification asks: [Sweatcoin](https://mobbin.com/screens/1f30eb64-f674-4889-a251-f2d7b43bf4f9);
[Apple Fitness](https://mobbin.com/screens/48ccc11e-546c-43de-b93c-9d3ec41acbd0);
[Pillow](https://mobbin.com/screens/814f7829-304b-49f2-851b-9dadb978258c);
[Wysa](https://mobbin.com/screens/ff59c484-845f-4eb0-a383-8be9c465b5fc);
[Strava](https://mobbin.com/screens/c43f3937-d7e3-4af8-9a56-1bb85e63a06d);
[Noom](https://mobbin.com/screens/525233d0-eabe-423d-94e0-ed37b4e21b53);
[Atoms](https://mobbin.com/screens/10e80f9a-ea1d-4c26-9f5a-54e5e48fac34);
[Breathwrk](https://mobbin.com/screens/400d8291-3d8c-4b78-99ae-6a59c56ae6a3);
[Tonal](https://mobbin.com/screens/9c5d36bf-3064-49c0-8fe7-c6702a9fe1b1);
[Tempo](https://mobbin.com/screens/28a98c51-2efc-4489-8d14-2f31cd4db383).

Setup and the plan: Cal AI [17 screens](https://mobbin.com/flows/05ca2ff4-106a-4fda-a0dd-3cc9b73a83c1)
and [34 screens](https://mobbin.com/flows/579da5dd-453a-4e7c-9c11-d20708a4db82);
Runna [setup](https://mobbin.com/flows/1689d6d5-e245-4369-9dae-320bd863136b) and
[plan introduction](https://mobbin.com/flows/3ee01e10-b2e3-4af5-8216-62f5b3133a20);
pushr [setup](https://mobbin.com/flows/bdc848ab-0394-418e-8868-667ddce96ebf);
[Equinox+](https://mobbin.com/screens/d8c29db8-7813-4abd-a525-2287ee532e6d);
[Runna](https://mobbin.com/screens/7bac6f01-4822-4e44-abc7-8631520a7517);
[Tonal](https://mobbin.com/screens/c627b5a2-4b3e-431b-998a-c8f4dd44651a);
[Cal AI](https://mobbin.com/screens/9c2d9ab4-8fd6-481d-a26a-2b0e5434cf8c);
[Yazio](https://mobbin.com/screens/3023715f-a48a-4581-a866-fadce01bea57);
[pliability](https://mobbin.com/screens/1bdd4694-0e2b-4ade-a5bc-9d56af1233a3);
[MacroFactor](https://mobbin.com/screens/e1f177ed-30f2-403b-95b4-c1d740a0a599);
[Apple Fitness](https://mobbin.com/screens/01e6de48-395e-4adf-b282-750de5fc5095);
[Garmin Connect](https://mobbin.com/screens/03310b0c-3fa8-4616-ba5e-e36092bf800d);
[Noom](https://mobbin.com/screens/e863b1da-a3eb-4319-aae0-efa5e3c0eff6).

Logging a set: Hevy [logging a workout](https://mobbin.com/flows/7b6374ff-8ff6-4d7b-babe-077e72b6ee1f)
and [set row](https://mobbin.com/screens/fa1b4fe1-5d63-4e97-ac9a-ccdf41b86d7c);
[Ladder](https://mobbin.com/screens/68512f15-98b2-412d-a78e-95e044723fa0);
[Runna](https://mobbin.com/screens/5f5c55bd-9cb8-4916-9e86-2953b6c6ca18);
[WHOOP](https://mobbin.com/screens/e40a3f82-a819-4035-b68b-dae1a52ebb6b);
[Gymshark](https://mobbin.com/screens/25eebc84-2d43-4fdd-8474-2f05dea50098);
[Bevel](https://mobbin.com/screens/fb4dd4d3-a726-4b44-93cf-32443b7a84ce).

Adding food: [MyFitnessPal](https://mobbin.com/screens/5a54a586-e408-4ca1-82a8-5766d404c190);
[BitePal](https://mobbin.com/screens/7f90b0ee-908e-4b4e-8bf0-97dae9e73b4d);
[Bevel](https://mobbin.com/screens/8e2c1535-f38d-4563-8967-61768047e137);
[Oura](https://mobbin.com/screens/c4b7dbe5-6cab-4d4b-b33b-f78091b71f2e);
[Lifesum](https://mobbin.com/screens/6aebdd4f-bd19-4d57-b0fa-1dcde3545dda);
[Yazio](https://mobbin.com/screens/3542227b-4c4f-4d15-aac4-3989a73ca531);
[Cal AI](https://mobbin.com/screens/d487304a-d32f-49cd-bb53-f1088f8ba2fb);
[Noom](https://mobbin.com/screens/6c9ad2b4-29ff-4cf2-86fd-d540578ae7c0);
[MacroFactor](https://mobbin.com/screens/4ba868a9-6976-46e7-b43c-68fcff4c0f36).

The week: [Runna](https://mobbin.com/screens/17c9ee53-dcd9-4985-8540-63070c9787f2);
[The Outsiders](https://mobbin.com/screens/ee550909-e4d5-4508-83ec-8275853dbff9);
[Gymshark](https://mobbin.com/screens/70a69481-458e-4c05-8df3-d009a3703f2c);
[Strava](https://mobbin.com/screens/1c996718-ab94-4247-85b3-80885bab44c9);
[Tempo](https://mobbin.com/screens/692641c2-5f5a-4a57-96e6-9156905cb3ec);
[Withings](https://mobbin.com/screens/4f910ac9-dadf-443e-a79c-9bfc293ee5af);
[Peloton Strength+](https://mobbin.com/screens/7d46ceb5-9b75-40df-a0ea-07cce7f0b929);
[Google Health](https://mobbin.com/screens/42cd2707-6d4b-4fa8-830a-040422fb9be4).

Paywalls, unbiased: [Gentler Streak](https://mobbin.com/screens/de7d0f96-35db-464b-bf9b-3c2907bfa23d);
[Bevel](https://mobbin.com/screens/87ac5af9-7c7a-46b8-8a82-ad8c90bf574c);
[Hevy](https://mobbin.com/screens/63d360d1-fe60-4834-b349-832dab2a7d56);
[Withings](https://mobbin.com/screens/7e85fbe1-961c-43ac-9fb5-f4b8039af167);
[TIDE](https://mobbin.com/screens/4946c946-896e-433d-a459-e031e0e011b6);
[Lifesum](https://mobbin.com/screens/8b62f92e-5ada-4dc4-89f1-70a82820887e);
[Ladder](https://mobbin.com/screens/a4b92e08-4977-4b90-90a9-d451345b2ce9);
[BitePal](https://mobbin.com/screens/19ffa622-fc5f-4dd1-803b-530c11d4c9de);
[Yazio](https://mobbin.com/screens/d444f04c-d1b9-4872-a056-a0dff266f600);
[Calm Sleep](https://mobbin.com/screens/07905baf-c7e7-48db-9b78-5866d040e1af).

Trial timelines, found by asking for one: [Headspace](https://mobbin.com/screens/17e4ce60-0851-40be-92af-336be1220857);
[Mesh](https://mobbin.com/screens/60db255e-0f7c-4caf-a0a5-4d91c0aa8740);
[5 Minute Journal](https://mobbin.com/screens/855c42a9-4d3c-4c80-86b4-45ee94667c74);
[Vocabulary](https://mobbin.com/screens/32238af5-552f-4ac3-bede-16981f4c23d3);
[Copilot](https://mobbin.com/screens/b6ba77c0-7d8f-423e-8453-9db2a97f8035);
[Centr](https://mobbin.com/screens/ae9d5d98-c17a-461e-ba9d-e890570942a5);
[Pillow](https://mobbin.com/screens/73a2cafa-d97e-477b-9e00-1e276ef50151);
[foodpanda](https://mobbin.com/screens/bbd3d8db-9a3b-4fee-8eb3-d2344bb9d30e);
[Monarch](https://mobbin.com/screens/f4f97ca0-8e85-4609-8f21-c5c9902171d4).

Feedback inside a session: Duolingo [completing a lesson](https://mobbin.com/flows/706ba483-579e-4628-9903-ba0809870d18).
Recording and saving: Strava [publishing an activity](https://mobbin.com/flows/a5ac4455-5b84-443a-b0e3-4273865a507e)
and [starting a record](https://mobbin.com/flows/e6356a85-1710-4b88-b329-e6d3df02d2b6).
