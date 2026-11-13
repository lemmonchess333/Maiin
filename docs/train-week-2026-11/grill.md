# Train as one week: the grill (13 November 2026)

The owner asked for Train's two tabs (Lift, Run) to be rethought, then for
an exhaustive grill with the questions answered by the agent, and then
said: "Ignore the rules, we don't want to be held back, we just want the
best app, the best results, what would be best for the user and the most
effective."

So in this document an earlier decision is evidence, not a limit. Where an
answer overturns one, the answer says which. Nothing here is built, and
nothing here is decided until the owner confirms it. The few answers that
most need the owner's own word are listed at the end.

Every question is worded so that "yes" accepts the answer under it.

## What was found first

**Measured on the emulator rig, 13 November, one seeded account (six lift
days, free running), 393 x 852:**

|                                      | Train, Lift | Train, Run | Home  |
| ------------------------------------ | ----------- | ---------- | ----- |
| Where content starts                 | 234 px      | 156 px     | 92 px |
| The hero's share of the first screen | 32%         | 28%        | 58%   |
| Largest text against the next size   | 1.14x       | 1.14x      | 1.50x |

**From the code** (three read-only passes, file and line in each answer):

- Lifts have no stored weekday. A lift's day is worked out two ways, and
  the two can disagree: the Lift tab and Home's card use the cursor ("the
  next lift not done", `nextUpCursor.ts:21-36`), while Home's other days,
  the day sheet and the plan page use the slot ("the Nth lift goes on the
  Nth lift day", `scheduleUtils.ts:238-254`).
- No function returns "this week's sessions, both sports, in order". The
  nearest, `buildTrainingPlanWorkspace`, shows a lift day as a generic
  "Lift day" and never names the session (`trainingPlanWorkspace.ts:128-147`).
- Train's first screen repeats Home: today's session name, its drawing,
  its numbers, "about N min" and Start are on both.
- 18 places in `Program.tsx` branch on the open tab, and 17 test files, 2
  journeys and 4 capture specs know the tabs.
- Setup already asks "Lifting / Running / Both" (`Onboarding.tsx:1298-1316`).
- Nothing after setup updates what kind of athlete a person is, a runner
  cannot add lifting from Settings, and a lifter new to running is not
  offered the starter plan.

**From 18 apps on Mobbin:** six hold more than one kind of session in a
plan (Runna, Equinox+, Centr, Apple Fitness, Future, Garmin Connect). All
six show one week. None splits the plan into a tab per sport.

---

## Round 1. What the page is for

❓ **Q1** - **Is Train's job "my week and my plan", with Home keeping
"today"?**

➡️ Yes. Home already answers "what do I do now" with the session's name,
picture, numbers and Start. Train repeats that card and hides the week
behind "Your plan". A person opens Train to see what is coming, to move
things round, and to look inside a session. So Train leads with the week,
and today's session is simply the first thing in it.

---

❓ **Q2** - **Should the sport tabs go, for everyone?**

➡️ Yes. A person who lifts and runs has one week, and today no screen
shows it with its sessions named. A person with one sport gets a second
tab that is empty or an advert. Zero of the six apps that mix session
kinds split their plan this way. The tabs exist because the code has a
lift engine and a run scheduler, not because a person thinks in two
halves.

---

❓ **Q3** - **Should every session sit on a day, lifts included?**

➡️ Yes. People plan their lives by days. This overturns part of the May
decision (RunWk1 and ADR-0002), which said the week must not show a named
lift on a weekday. That decision was right about its reason and I keep the
reason: a lift not done on its day must never be lost or called "missed".
I drop only its conclusion that a lift therefore cannot be drawn on a day.

---

❓ **Q4** - **Should a lift slide forward by itself when its day passes?**

➡️ Yes. The lift order stays the truth, as it is today. The days are worked
out from it each time: lifts already done sit on the day they were done,
and lifts still to do are laid, in order, on the usual lift days from today
onward. Skip Monday and Monday's lift is on Wednesday in the morning, with
"Moved from Mon" under it. Nothing is stored, so nothing can drift.

---

❓ **Q5** - **Should a run keep its day, with a move offered when it is
missed?**

➡️ Yes. A run's day carries meaning that a lift's does not: the long run
is on the weekend, the hard session has easy days round it, a race has a
date. A missed run reads "Missed" with Move and Skip beside it, which the
app can already do (`moveRunDay`, `transitionRunDay`).

---

❓ **Q6** - **When there are more lifts left than lift days left in the
week, should the extra ones be shown as "not placed" and not pushed onto
rest days?**

➡️ Yes. The app should not spend a person's rest days for them. The extra
lifts go in a short group, "Still to do", each with "Do it today". If they
are not done, next week starts with them, which is what the weekly
rollover already does (`programEngine.ts:3326-3329`). The words say so:
"Carries over to next week."

---

❓ **Q7** - **Should one function lay out the week for every surface?**

➡️ Yes, and this is the most valuable engineering change. Today the cursor
and the slot can name two different "next lifts" on Home and Train. One
pure function, `layOutWeek`, gives the same answer to Train, Home's week
strip and day card, Home's "tomorrow" line, the setup preview, reminders
and the widgets still to be built.

---

## Round 2. The page

❓ **Q8** - **Should the page open on the week, with no large "Train"
title above it?**

➡️ Yes. Today 234 px pass before anything about the person's training
appears on the Lift tab. A one-line header (the plan's position, "Edit
plan", the menu) lets the week start inside the first 100 px.

---

❓ **Q9** - **Should the week's header be seven days with a lift lane and
a run lane?**

➡️ Yes. Purple marks for lifts and coral for runs, filled when done,
outlined when planned, today marked, and one count under it ("3 of 7
sessions"). It is the picture of the week and the one place both sports
are seen at a glance. Seven of nine apps with a weekly screen draw the
seven days. Tapping a day scrolls the list to that day. It does not swap
the page's content, so it is not a tab bar.

---

❓ **Q10** - **Should the body be a day-by-day list, today first?**

➡️ Yes. Under the header, the week is a list grouped by day. Days already
past fold into one row ("Earlier this week: 2 done") that opens on a tap,
so today is at the top without scrolling. Today's sessions are full cards.
Later days are shorter rows. A rest day is one thin line.

---

❓ **Q11** - **Should every session row carry its own picture, its name,
one line of numbers and its state?**

➡️ Yes. The lead lift's drawing or the runner, "Pull A", "Back and biceps,
about 52 min" or "5 km, easy", and a state: Next, Today, Done, Missed (runs
only), Skipped, Moved from Mon. The same row shape for both sports is what
makes the week read as one thing.

---

❓ **Q12** - **Should a tap on a session open that session's own page?**

➡️ Yes. Today a lift's detail is spread down the Lift tab and a run's is in
a bottom sheet, so the two sports behave differently. One pattern for
both: Train (the week), then the session (what is in it, why, change it,
start it), then the workout or the run. The lift's page holds what the Lift
tab holds now: the exercises, replace, add, remove and reorder them, Short
on time, Skip, Make this next, Start. The run's page holds what the day
sheet holds now: the run, why this run, change it for this day, move, skip,
mark as done, Start.

---

❓ **Q13** - **Should Start be on today's card in Train as well as on
Home?**

➡️ Yes. Removing it to avoid repeating Home would cost a tap for no gain.
Any lift still to do also offers "Do it today", on any day, since lifting
on a rest day is the person's choice.

---

❓ **Q14** - **Should there be one notice slot for the week, shared by
both sports?**

➡️ Yes. Today the lighter-week notice, which is about running load, shows
on the Lift tab, and the run notices show on the Run tab. One slot under
the header, one notice at a time, in this order: a session left unfinished
(Resume), a race day or "did you race?", last week did not go to plan,
recovering after a race, consider a lighter week, runs not set up.

---

❓ **Q15** - **Should the plan's long-range things sit under the week, in
one "Your plan" section?**

➡️ Yes. The race card (days to go, the weeks ahead, the race-day plan), the
training block card, and three links: Lift plan, Run plan, Usual weekly
layout. They are looked at now and then, so they belong below what changes
daily.

---

❓ **Q16** - **Should Empty workout, Saved routines and Free run sit
together under "Train another way"?**

➡️ Yes. Today the first two are at the foot of the Lift tab and the third
is on the Run tab. They are the same idea: a session outside the plan.

---

❓ **Q17** - **Should the separate "Your plan" page be folded into Train
and removed?**

➡️ Yes. That page (`TrainingPlan.tsx`, 788 lines) is the combined week
already, without session names. Once Train is the week, the page is a
second copy. Its "Move a run" and its "the week didn't go to plan" card
move into Train, and its address redirects.

---

❓ **Q18** - **Should past weeks be reachable from the header, and next
week shown when it is known?**

➡️ Yes to past weeks: the lift history is kept for eight trained weeks and
saved sessions carry their dates. Next week is a later step: the lift order
is known, but next week's runs are made at the rollover, except in a race
plan, which already shows "the weeks ahead".

---

## Round 3. Hard cases in the week

❓ **Q19** - **On a day with a lift and a run, should both rows show under
that day, in the order Home already uses?**

➡️ Yes. Home decides which leads (`todaySession.ts`, the run first when
running is the main goal). Train uses the same answer, and the day's note
says when a hard run sits beside a heavy leg day (the app already flags a
clash, `runReschedule.ts:90`, `runScheduler.ts:2037`).

---

❓ **Q20** - **Should a skipped lift leave the week's days and wait in a
"Skipped" group with Restore?**

➡️ Yes. A skip has no date to hang on. Restore exists as a command
(`restoreWorkoutDay`) but Train has no button for it today, so a skipped
lift cannot be brought back from there. This adds the button.

---

❓ **Q21** - **When every lift is done early, should the week say so and
offer "Start next week"?**

➡️ Yes, as now (`Program.tsx:1479-1490`), drawn as the last row of the
week.

---

❓ **Q22** - **Should a lighter week, a taper, race week and recovery be
shown on the sessions themselves?**

➡️ Yes. A small word on each row ("Lighter", "Taper") and the notice above.
In race week the lift days the app skips for the person read "Rest before
your race", not "Skipped", since the person did not skip them.

---

❓ **Q23** - **Should a session done outside the plan (an empty workout, a
routine, a free run) appear on the day it was done?**

➡️ Yes. The week is what happened as well as what was planned. They count
as they count now.

---

❓ **Q24** - **In the first week of an account, should the days before
the start be blank and uncounted?**

➡️ Yes, as the count already does (`trainingWeek.ts:111-116`).

---

❓ **Q25** - **Should editing be held while a finished session is still
waiting to save?**

➡️ Yes, the rule the plan page uses today (`TrainingPlan.tsx:219-224`),
so a change cannot land on a week that is about to be rewritten.

---

## Round 4. Who the page is for

❓ **Q26** - **Should the page be the same page for all five kinds of
person, with only its contents differing?**

➡️ Yes. The five: lifts only; runs only with no plan; runs only with a
starter or race plan; both with free running; both with a run plan. One
layout, fewer or more rows. No empty tab, no second screen to learn.

---

❓ **Q27** - **For someone who only lifts, should running appear as one
quiet "Add running" row, and nothing else?**

➡️ Yes. Today a lifter's Run tab opens on "Pick your pace today" and a race
card they did not ask for. One row under "Your plan" is enough, and it can
be dismissed.

---

❓ **Q28** - **For someone who only runs, should lifting appear as one
"Add lifting" row?**

➡️ Yes. Today there is no way to add lifting from Settings: the Lift plan's
days control offers 2 to 6 and a runner's saved value is 0, which matches
no option (`ProgrammeSettings.tsx:844-854`, `liftPlanRebuild.ts:71`). The
row opens the three lifting questions setup already asks (days and
minutes, equipment, anything to work around) and builds the plan.

---

❓ **Q29** - **For a runner with no plan, should the week show the runs
done, a standing "Run when it suits you" card, and the ways to a goal?**

➡️ Yes. A free runner has no planned sessions, so the header shows what
they did, the first card starts a run, and under it are their recent runs
and the offers that fit them (30 minutes without stopping, a race). This
is the state most at risk of feeling empty, so it gets a full first card
and real numbers, never a blank list.

---

❓ **Q30** - **Should "what do I train" be read from the plan itself, in
one place?**

➡️ Yes. There is no helper for it today. Home, Train, Settings and the
first-week card each test a different mix of `athleteType`, `runFrequency`
and `runMode`, and `athleteType` is written once at setup and never again.
One function, `trainingKind(profile, programState)`, answers from the
plan: lifts if there are lift days, runs if there is a run plan or the
person said they run.

---

❓ **Q31** - **Should adding or removing a sport update the person's
athlete type and running level?**

➡️ Yes. Nothing after setup writes them. So a lifter who starts running
stays a "Lifter", is never offered the starter plan
(`RunPlanSettings.tsx:273-277`), and is counted as a lifter in the
figures. Add running and Add lifting write them, and so does removing a
sport.

---

❓ **Q32** - **Should "Add running" offer three choices: run when I like,
build to 30 minutes, train for a race?**

➡️ Yes. They are the three run modes the app has. The starter plan must be
offered to anyone adding running, since "new to running" is exactly who a
lifter adding running is.

---

❓ **Q33** - **Should Lift plan gain "Not lifting" so lifting can be
removed as well as added?**

➡️ Yes. A person's training changes. A runner coming back from a lifting
phase needs the way out as much as the way in.

---

## Round 5. Setup

❓ **Q34** - **Should setup keep its questions as they are?**

➡️ Yes. It already asks Lifting, Running or Both in step 1 and skips the
steps a person does not need. All three ends can be reached. The redesign
needs no new question.

---

❓ **Q35** - **Should setup's last screen show the person their first
week, drawn by the same function as Train?**

➡️ Yes. The review already promises "see your upcoming week in Train"
(`Onboarding.tsx:2132`) and has a week preview built on the slot rule
(`WeekPreview.tsx:58`). Drawing it with `layOutWeek` makes the promise
true: the week they see at the end of setup is the week Train opens on.

---

❓ **Q36** - **For a run-only person choosing free running, should setup
still end with no scheduled runs?**

➡️ Yes for now. Asking a free runner for a weekly number adds a step for
someone who chose "no plan". Train can offer a weekly goal later, where
the app already has one (`NonRaceGoalProgress`). This one is the owner's
to weigh: see the list at the end.

---

❓ **Q37** - **After setup, should the person still land on Home, with the
first-week card opening the session's own page?**

➡️ Yes. Home first is the 31 October decision and the redesign gives no
reason to change it. The first-week rows fall back today to
`/program?tab=lift` and `/program?tab=run` (`firstWeekAction.ts:55,74`).
They would open the session's page instead.

---

## Round 6. The first time through

❓ **Q38** - **Should the first visit to Train carry one hint, on the
week?**

➡️ Yes. Today's hint is on the Lift tab's circles: "Workouts go in order.
Each one waits its turn, whatever the weekday." The new one sits on the
week's header: "Your week. Runs keep their day. Lifts go in order: miss
one and it moves to your next lift day." One hint, shown once.

---

❓ **Q39** - **Should people who already use the app see that hint once
too?**

➡️ Yes. The page changes under them, and the sliding lift is new
behaviour on screen. A new hint id shows it once to everyone and never
again.

---

❓ **Q40** - **Should the menu's "How workout order works" become "How
your week works"?**

➡️ Yes, and it should be there for everyone, not only on the Lift tab as
now.

---

❓ **Q41** - **Should the other hints and the older accounts' walk stay as
they are?**

➡️ Yes. The first set, the food composer, the first run and the three-stop
walk do not mention the tabs.

---

## Round 7. Data and the backend

❓ **Q42** - **Can the first version ship with no change to stored data
and no change on the server?**

➡️ Yes. The layout is worked out from what is already saved: the lift
order and its done and skipped marks, the dated runs, the usual weekly
layout on the profile, and the saved sessions. No server code names a
tab, and the rules for a person's plan are a plain owner read and write.

---

❓ **Q43** - **Should the week's counts stay exactly as they are?**

➡️ Yes. "Planned" is the number of usual lift days plus the dated runs,
and "done" is saved sessions in the week. Neither reads which day a lift
is drawn on (`trainingWeek.ts:99-155`). The league's server copy
(`leaguePlanned.js`) is untouched.

---

❓ **Q44** - **Should every link into Train keep working?**

➡️ Yes. `/program` is the week. `?day=N` opens that lift's page, `?rday=`
that run's page, and `start`, `express` and `resume` do what they do now.
`?tab=` is accepted and ignored, so old links, saved pages and the push
notification's `/program` all land somewhere right. `/program/plan`
redirects, keeping `?reset=1`.

---

❓ **Q45** - **Should moving a lift to a chosen day wait for a second
step, since it needs new stored data?**

➡️ Yes. Sliding by itself needs nothing stored. Choosing "this week I lift
Thursday, not Wednesday" does: there is no field for a one-week change to
lift days, and no command to change lift order beyond "make this next".
That step adds one small field for the week, a server command, its
checks, and a schema step from 6 to 7. It is worth doing, after the week
is live.

---

❓ **Q46** - **Should "Fit my week" (tell the app which days you can train
this week) ride on that same second step?**

➡️ Yes. It is the same stored thing, the days available this week, seen
from the other side. It is the feature most likely to help someone keep
training through a busy week.

---

❓ **Q47** - **Should the faults found on the way be fixed with this
work?**

➡️ Yes, each as its own small change:

- Home and Train can name different next lifts (two rules).
- The app and the server disagree on whether a run can be moved to a day
  (`useProgram.ts:2176-2185` against `programCommands.js:1644-1650`).
- A runner cannot add lifting from Settings.
- A lifter new to running is not offered the starter plan.
- A skipped lift cannot be restored from Train.
- A person's athlete type is never updated after setup.

---

❓ **Q48** - **Should reminders stay as they are for now?**

➡️ Yes. They repeat weekly from the usual layout and already name the next
lift from the cursor (`workoutReminderCopy.ts`). A lift that slid to a
non-lift day gets no reminder that day. That is a known gap, small, and
worth closing only with the second step.

---

❓ **Q49** - **Should the widgets be built on the same layout?**

➡️ Yes. No snapshot of "today's session" exists yet for a widget. The
Today widget needs the session and the week strip, which is this function's
output. Building the layout first means the widget work reads it and adds
no third rule.

---

## Round 8. How to build it

❓ **Q50** - **Should it start as a prototype on a canvas, picked before
any production code?**

➡️ Yes, as Food and the widgets did. The canvas shows the week for the
five kinds of person and the hard cases (a missed lift sliding, a missed
run, a double day, more lifts than days, a free runner, a new account).

---

❓ **Q51** - **Should the pick then be recorded as a decision that names
what it overturns?**

➡️ Yes: a new row in the plan file, and a status note on ADR-0002 saying
its rule about the week's picture is replaced while its reason stands.

---

❓ **Q52** - **Should it be built in these steps, one PR each?**

➡️ Yes:

1. `layOutWeek`, a pure function with its tests. Nothing on screen
   changes.
2. Home reads it for its week strip, day card and "tomorrow" line. This
   alone fixes the two-rules fault.
3. The session pages, lifted out of the Lift tab and the day sheet, still
   reached from today's tabs. No change in what a person can do.
4. The new Train behind an address switch, so it can be seen on the web
   and compared with the old page.
5. The switch flips. The tabs, the tab memory, the plan page and their
   tests go.
6. Adding and removing a sport, and the Settings holes.
7. The hint, the menu line and setup's preview.
8. Later, by its own decision: choosing a lift's day and Fit my week.

---

❓ **Q53** - **Should the old page stay until step 5?**

➡️ Yes. Steps 1 to 4 change nothing a person depends on, so each can be
checked alone and any of them can be dropped without undoing the rest.

---

❓ **Q54** - **Should the layout be tested against whole seasons, not
only single weeks?**

➡️ Yes. A simulator of a lifting season exists (`src/test/sim/liftSeason.ts`).
Running the layout over it checks that a lift is never lost, never shown
twice and never called missed, across skipped days, extra sessions and
rollovers. Dates make this a case for the time-zone and future-clock
runs CI already has.

---

❓ **Q55** - **Should the two journeys that tap the tabs be rewritten to
walk the week?**

➡️ Yes. They are the best guard: a new runner, and a marathon runner who
lifts, each over weeks. The names they look for live in one file
(`src/test/journeyScreens.ts`), so they change there.

---

❓ **Q56** - **Should the work be judged by numbers set now?**

➡️ Yes:

- Content starts within 120 px (from 234).
- The whole week, with its sessions named, is on one screen (from none).
- A test proves Home and Train name the same next lift in every case the
  simulator makes.
- All five kinds of person have a first screen with a first action.
- The page holds at 320 px and at twice the text size.

---

❓ **Q57** - **Should accessibility be designed in, not checked at the
end?**

➡️ Yes. The header's days are buttons that move the list, not a tab list.
The list has a heading per day. Every move has a menu action as well as a
drag. Targets are 44 px. Nothing depends on the lane's colour alone: a
lift and a run also differ by icon and by word.

---

## Round 9. What could go wrong

❓ **Q58** - **Is it acceptable that a lift appears to move overnight?**

➡️ Yes, with the words to explain it. "Moved from Mon" on the row, the
hint on first visit, and the menu line. The other choice is a lift that
sits on Monday marked late, which is the thing the May decision rightly
refused.

---

❓ **Q59** - **Is a list of up to thirteen rows acceptable on a phone?**

➡️ Yes. Six lifts and seven runs is the most a week can hold. Past days
fold into one row and rest days are thin, so a full week is about two
screens. The header shows all of it at once.

---

❓ **Q60** - **Is it acceptable to change a page people know?**

➡️ Yes. The sessions, the buttons and the words stay the same. What
changes is where things are, and the hint says so once. There is one
user today, which is not a reason to hold back or to rush: the page is
designed for the people who come later.

---

❓ **Q61** - **Does this still treat lifting and running fairly?**

➡️ Yes, more than now. The glossary calls the lift programme "the
structured anchor" for a hybrid and treats the run-only person as a
chosen second case. One week gives both sports the same row, the same
page and the same weight.

---

❓ **Q62** - **Is anything left out on purpose?**

➡️ Yes. A month view, sharing a week, a coach's notes on the week, and
showing how hard each day is. Each could follow. None is needed for the
week to be right, and the last one needs a rule for "hard" that covers
both sports.

---

## What this overturns

| Earlier decision                                                            | What changes                        | What stays                                            |
| --------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| RunWk1 and ADR-0002 (May): the week must not show a named lift on a weekday | A lift is drawn on a day, and moves | Lifts stay in order; a lift is never lost or "missed" |
| Pgm3: the page's order, with the day stepper on top                         | The week leads                      | The notice sits at week level                         |
| Run9: change the Run tab only, leave the Lift tab                           | Both are replaced                   | Its one-notice rule, now for both sports              |
| The plan page (28 October)                                                  | Folded into Train                   | Move a run, the reset card                            |
| The first-visit hint "Workouts go in order"                                 | Replaced by one on the week         | One hint, once                                        |
| The glossary's "the lift programme is the anchor"                           | Both sports get the same weight     | Nothing in the engines                                |

## The owner's own calls

Everything above is answered. These five are the ones where the owner's
taste or appetite decides more than the evidence does:

1. **Q3 and Q4.** Lifts on days that slide. I recommend yes.
2. **Q12.** A session opens its own page. I recommend yes.
3. **Q17.** The plan page goes. I recommend yes.
4. **Q36.** A free runner still gets no weekly number at setup. I
   recommend leaving it, and offering a weekly goal on Train.
5. **Q45 and Q46.** Choosing a lift's day and Fit my week come second,
   with their backend change. I recommend yes, after the week is live.

## Not checked

- One seeded account was measured. A race-plan runner, a lift-only
  account, a run-only account and a new account were read in the code,
  not captured.
- The Mobbin apps mix session kinds, but none has a lift order laid onto
  days with dated runs beside it. Equinox+ is the nearest.
- "Sessions on days help people keep training" is my judgement from how
  the surveyed apps are built. I have no figure for it.
- Nothing here has been drawn yet. The prototype is the next step.
