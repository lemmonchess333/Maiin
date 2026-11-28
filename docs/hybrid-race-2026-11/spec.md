# Hybrid race: the spec

18 November 2026. A draft for the owner to read and decide on. Nothing in the
app has changed.

**Sources, in the order they win.** (1) The owner's calls of 18 November,
passed on by the coordinator: the name; the Hybrid Training Space as the
community home, with Train as the second way in; and no events listed. (2) The
Hyb1 lock row (draft PR #3403, branch `claude/lock-hyb1`), whose eleven calls
are the design wherever (1) does not change them. (3) The rows and documents
it rests on: Circ1 (circuit mode: the block model and the player), TrainWk1
(Train as one week), Pgm9 (a printed week the owner signs), App1 Q84 and Q85
(what is Pro), ADR-0002 (runs dated, lifts in order), DESIGN_GUIDE §0, §10 and
§14m to §14q, and CODING_STANDARDS' house voice.

**The prototype** is `prototype/index.html` in this folder, one file with
nothing to download. Its captures, at 393 px in the dark theme, are in
`prototype/captures/` and listed at the end.

**The brand.** The name of the best-known series of these races appears
nowhere in Tropos: not in the product, a Space, the store listing, a
screenshot or the code. This document and the prototype never write it either.

---

## The short version

- **What it is.** "Hybrid race" is a goal beside the road races, for an
  honest, generic format that many organisers and gyms run: 8 × 1 km of
  running, each run followed by a station. The person enters their own race,
  as a custom race in Runna: a date, a name they type if they want one, their
  division and their kit. The goal picker shows it as "Hybrid race · 8 × 1 km
  runs, 8 stations".
- **The Hybrid session** is one session on one clock: rounds for time, each
  step a run (metres and time) or a station (metres or reps, with kg). It is
  the run plan's quality day, so it sits on a date, and it is saved as one
  workout.
- **Two ways in, one setup.** The Hybrid Training Space stays the community
  home and gains "Train for a hybrid race". Train, through Run plan, is the
  second way in. Both open the same six-screen setup.
- **No events are listed.** Tropos names no race, shows no calendar and
  suggests no race name (owner, 18 November). A generic count, "34 people on
  Tropos are training for a hybrid race", is the plan group.
- **The plan is a preset** (Hyb1 call 8): the 10K run plan with its quality
  day replaced by the Hybrid session, a strength plan built for the stations,
  a benchmark every fourth week, two simulations and a two-week taper. It
  reaches nobody until the owner signs its printed weeks (Pgm9). Three are
  printed in §3.
- **Proof of getting faster** is the benchmark: a fixed session against the
  clock, every fourth week, with a best that gets the full screen.
- **Counting** changes in four readers and adds one rule for load. A Hybrid
  session counts once, as a run; its run metres add to the week's kilometres
  and nowhere else.
- **Free and Pro.** The sessions, the player, the splits and the benchmark are
  free. The plan is Pro after its first week, as the half and the marathon are
  (App1 Q85).

---

## 1. Who it is for and what they come for

Run-and-station races are 8 × 1 km of running, each run followed by a station:
ski erg, sled push, sled pull, burpee broad jumps, rower, farmer's carry,
sandbag lunges and wall balls. About half the race is running. What decides it
is running well on legs a station has just loaded, and handling the sled and
the wall balls without falling apart. Most people race the open division, often
with friends, and most finish in 75 to 110 minutes.

Three kinds of person come to Tropos for one, and each is a real share of the
user base, not an edge case:

| Who                     | What they have          | What they lack                                 |
| ----------------------- | ----------------------- | ---------------------------------------------- |
| A runner new to lifting | A 10K in 45 to 55 min   | Strength for the sled, grip, wall balls        |
| A lifter new to running | Strength, kit knowledge | 8 km of running, and running after a station   |
| A hybrid athlete        | Both, roughly           | Practice at the format, pacing, a time to beat |

They come to the app for two things, every time they open it:

1. **Today's session, in a week that balances.** Which session today, what is
   in it, at what weight, and that the week around it leaves the legs fresh
   enough for the hard days. Home and Train already answer "what today"; this
   goal changes what the answer is.
2. **Proof they are getting faster.** A runner can see a 5K time fall. A hybrid
   racer cannot, unless the app gives them a fixed test. The benchmark (§4.6)
   is that test: the same session every fourth week, against the clock, with a
   best.

Everything below serves one of those two.

---

## 2. The two ways in and the setup

### 2.1 The Hybrid Training Space

**Hybrid Training** (`hybrid-training`, the interest Space that exists) stays
the community home; no new Space is made (owner, 18 November). Under its hero
it gains a format card, laid out as a road race's card is (`RaceEventHeader`):

- two chips, "8 × 1 km runs" and "8 stations";
- the eight stations in race order, each with its drawing;
- **"Train for a hybrid race"**, the card's filled button in running coral, as
  "Train for this race" is on a road race. It opens setup at its first screen;
- the generic count, "34 people on Tropos are training for a hybrid race"
  (§9.2): to everyone once it reaches 10 (App1 Q6's floor for people not in a
  group), and from 3 to someone who is training for one, as plan groups are.

Below it, pinned by the Tropos Team: **Sessions to try**, the six authored
sessions (§7), each a row with its drawing, name and minutes, opening the
session's page where Start runs it. They are free and need no goal (Hyb1 call
7). Then the members' posts and sessions, as now.

Joining never sets a race, and training never joins the Space. The Space's
tagline loses its em dash: "Lift and run in the same week, the Tropos way."

### 2.2 Train and Settings

People who never open Social must find it too. Train's "Your plan" section
links to Run plan (TrainWk1 Q15), and Settings → Run plan's "Training for a
race" shows the race cards (`PhotoChoiceCards`). **Hybrid race joins them as a
card**: its label "Hybrid race", its fact "8 × 1 km runs, 8 stations", and a
photograph of its own (open question 9). Choosing it does not add questions to
the run-plan editor: it opens the same setup as the Space, at its first screen.

Train's "Train another way" (TrainWk1 Q16) gains one row, "Hybrid sessions",
listing the six sessions to run on demand, so they are reachable without a goal
and without Social.

### 2.3 The setup, screen by screen

One route, `/plan/hybrid`, a pushed page without the tab bar, in setup's style:
one question a screen, the reason under it, a six-segment progress bar, Back,
and Continue as the screen's one filled button (§14n rules 49 and 50). Both
ways in open it; which one is a query parameter, for analytics only.

| #   | Screen                   | Asked or prefilled                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | When is your race?       | Asked: the date, and "Race name (optional)", up to 60 characters. The field is empty and stays empty unless the person types: no placeholder name, no suggestions, no list. "Your plan counts back from race day." Under 6 weeks: "Six weeks is short. The plan starts in its build weeks." Under 3 weeks no plan is offered: "Too close for a plan. The sessions in Hybrid Training will help." |
| 2   | Which division?          | Four cards: Women’s open, Women’s pro, Men’s open, Men’s pro, each with its sled push and wall-ball weights as the fact. "It sets the weight on every station. Most people race open." The profile's sex for calorie calculation preselects women's or men's, and open; "unspecified" preselects nothing.                                                                                        |
| 3   | What does your gym have? | Four switches: Sled, Ski erg, Rower, Wall-ball target. An off switch shows its stand-in under it ("Without one: a plate push and a seated cable row"). "Missing kit gets a stand-in, named on the session." Prefilled on for a full gym, off for a home gym or minimal kit, changeable either way.                                                                                               |
| 4   | Where you’re starting    | Two rows. Running: "Most weeks · 5K in 24:30" from `runFrequency` and `runFitness.benchmark`; Lifting: "Some experience" from `onboarding.experience`. Each has Change, which opens the three choices (New, Now and then or Some experience, Most weeks) and an optional 5K time. Known answers make this a confirm screen. "It sizes your runs and your first weights."                         |
| 5   | How many days a week?    | 3, 4, 5 or 6, with the week's shape under the choice from the rules in §3.1 ("5 days: 1 Hybrid session, 2 strength, 2 runs"). Prefilled from the current plan's training days, kept between 3 and 6.                                                                                                                                                                                             |
| 6   | Your plan                | Week 1 in the person's own numbers: each day with its session's drawing, name and minutes, the race and its date, "12 weeks · Base, Build, Taper". What changes: "Your lift plan becomes Strength A and B. Push Pull Legs is kept for after the race." The Pro note when it applies. "Change days" moves a session to another day here. One button: **Start plan**.                              |

Six screens, under §14n's eight. With a complete profile the person taps
Continue five times and Start plan once.

**The race's name is the person's own.** Tropos never fills it in, suggests
one or checks it against a list. It shows on the person's own screens (Train's
race card, Home, Together's hero, the race-day card) and nowhere public (§9.3).

**What Start plan writes**, in one call to `configurePlan` so nothing is left
half-written (CODING_STANDARDS: persist every mirrored and derived field in the
same write):

- `raceGoal`: `distance: "hybrid"`, `targetDate`, `entry: "race"`,
  `eventName` when typed, and `hybrid: { division, kit }`. No `eventSpaceId`:
  there is no race Space to bind to;
- `runMode: "race_prep"` and the run plan's days;
- the lift plan rebuilt on the Hybrid strength template, with the previous
  template's choice kept as `hybrid.returnTo` (open question 1);
- `weekSchedule` from the preset's days;
- the starting point's answers, where screen 4 changed them.

**Changing it later.** Settings → Run plan shows the Hybrid race goal as a race
goal: the date, the name, the division and the kit open their own screens of
the setup. "No race" ends the goal; after the race the existing recovery weeks
run, then Train offers the previous lift plan back (open question 1).

---

## 3. The week

### 3.1 How the preset builds a week

These are Tropos heuristics, each a number the owner can move. They make a
preset, not an engine: nothing here doses hybrid work from the person's
results, which needs its own lock (Hyb1 call 8, Circ1 call 5).

1. **One Hybrid session a week**, always. It is the 10K run plan's quality day,
   so it sits on a date (§3.3).
2. **The other days**, by how many the person has:
   - 3 days: 1 run, 1 strength.
   - 4 days: 2 runs and 1 strength; but someone new to lifting who runs most
     weeks gets 1 run and 2 strength. The weaker side takes the spare day.
   - 5 days: 2 runs, 2 strength.
   - 6 days: 3 runs, 2 strength.
3. **Runs** come from the 10K plan for the person's starting point (Run24's
   starting point and long-run rungs every 2 km). One run is the long run; two
   are the long run and an easy run; three add the 10K plan's quality run. For
   someone who runs most weeks, the easy run becomes the 10K plan's quality run
   in Build weeks.
4. **Strength** is the Hybrid strength template (§6.2): one day is "Strength ·
   Full body"; two are "Strength A · Legs and push" and "Strength B · Pull and
   grip". Station work in them is at race weight.
5. **Spacing.** The Hybrid session, the long run and Strength A each have a day
   between them. Strength B (lighter on the legs) and the easy run sit beside
   them. At 5 days or fewer there are at least two rest days.
6. **The Hybrid session rotates** over a 12-week block: the benchmark in week 1
   and in each lighter week, a half simulation in weeks 5 and 9, the full
   simulation in week 10, and the three training sessions between.
7. **Lighter weeks** are the run plan's step-back weeks, every fourth week
   (`isRunStepBackWeek`): runs about 20% shorter, lifts at half the sets
   (Lift4's lighter week), and the Hybrid session lighter or the benchmark.
8. **The full simulation's week** drops Strength A, halves Strength B and
   replaces the long run with an easy one: the simulation is 8 km of running
   on its own.
9. **Taper**, the last two weeks: week 11 has runs at about 75%, half sets and
   a 3-round Hybrid session; race week has easy runs only, Strength B at half
   sets early in the week or nothing, and no Hybrid session. Lift days the plan
   rests are not counted as planned (TrainWk1 STATUS (b)).
10. **Block length.** 12 weeks is the shape. A race 8 to 16 weeks out shortens
    or repeats Base; further out, Base repeats until 16 weeks out; 3 to 8 weeks
    out starts in Build; under 3 weeks there is no plan (§2.3).
11. **Run steps for a new runner** are 600 m in weeks 1 to 4 and 800 m in
    weeks 5 to 8, then 1 km. The simulations and the benchmark always run
    1 km, walking when needed, so a time compares with the last.

### 3.2 Three printed weeks

The race is on Saturday 13 February 2027; week 1 starts on Monday 23 November 2026. Each person has a full gym unless said. Minutes are estimated by hand
from the sets, rests and paces; the build prices them on the app's own clock
before the owner sees the generated print. `*` marks the day's main lift.

#### A. A runner new to lifting, 4 days

Women's open. Runs most weeks, 5K in 25:00. New to lifting. All four kinds of
kit. Rule 2 gives her 1 run and 2 strength.

| Day  | Week 1                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mon  | **Strength B · Pull and grip**, about 40 min: Dumbbell Romanian Deadlift 3×8-12\*, Lat Pulldown 3×8-12, Seated Cable Row 3×10-12, Sled Pull 4×12.5 m at 78 kg, Farmer's Carry 3×50 m at 2×16 kg, Plank 3×30 s |
| Tue  | Rest                                                                                                                                                                                                          |
| Wed  | **Hybrid session · Benchmark**, about 45 min, women's open weights (§7.6). Sets her first best                                                                                                                |
| Thu  | Rest                                                                                                                                                                                                          |
| Fri  | **Strength A · Legs and push**, about 40 min: Goblet Squat 3×8-12\*, Walking Dumbbell Lunges 3×16 steps, Dumbbell Bench Press 3×8-12, Sled Push 4×12.5 m at 102 kg, Wall Balls 3×15 at 4 kg to 2.70 m         |
| Sat  | Rest                                                                                                                                                                                                          |
| Sun  | **Long 10K**, about 60 min                                                                                                                                                                                    |
| Week | 4 sessions, 3 rest days. 13 km of running (3 in the benchmark). About 3 h 5 min                                                                                                                               |

| Wk  | Phase          | Wed: Hybrid session           | Sun: run    | Strength              |
| --- | -------------- | ----------------------------- | ----------- | --------------------- |
| 1   | Base           | Benchmark                     | Long 10K    | B Mon, A Fri          |
| 2   | Base           | Run and push                  | Long 10K    | B, A                  |
| 3   | Base           | Run and pull                  | Long 12K    | B, A                  |
| 4   | Base, lighter  | Run and carry, 3 rounds       | Long 8K     | B, A at half sets     |
| 5   | Build          | Half simulation, stations 1-4 | Long 12K    | B, A                  |
| 6   | Build          | Run and push                  | Long 12K    | B, A                  |
| 7   | Build          | Run and pull                  | Long 14K    | B, A                  |
| 8   | Build, lighter | Benchmark                     | Long 10K    | B, A at half sets     |
| 9   | Build          | Half simulation, stations 5-8 | Long 14K    | B, A                  |
| 10  | Build          | Full simulation               | Easy 40     | B at half sets        |
| 11  | Taper          | Run and push, 3 rounds        | Long 10K    | B, A at half sets     |
| 12  | Race           | Wed Easy 20 + strides         | Race on Sat | B at half sets on Mon |

The trade to see: her running drops to one run plus the session's 3 or 4 km,
from the three runs she does now. A runner who wants to keep two runs picks 5
days. If the owner prefers two runs at 4 days for everyone, rule 2 loses its
exception (open question 2).

#### B. A lifter new to running, 4 days

Men's open. Does not run. Lifts most weeks. His gym has a rower and a ski erg
but no sled and no wall-ball target, so the sled and the wall balls are swapped
(§6.4). Rule 2 gives him 2 runs and 1 strength.

| Day  | Week 1                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mon  | **Easy 20**, walk breaks when needed, 20 min                                                                                                                              |
| Tue  | **Strength · Full body**, about 50 min: Barbell Squat 4×5-8\*, Romanian Deadlift 3×6-10, Pull-Ups 3×6-10, Dumbbell Bench Press 3×8-12, Farmer's Carry 3×50 m at 2×24 kg   |
| Wed  | Rest                                                                                                                                                                      |
| Thu  | **Hybrid session · Benchmark**, about 45 min, men's open weights, swapped: plate push for the sled push, seated cable row for the sled pull, thrusters for the wall balls |
| Fri  | Rest                                                                                                                                                                      |
| Sat  | **Easy 30**, where his long run starts, 30 min                                                                                                                            |
| Sun  | Rest                                                                                                                                                                      |
| Week | 4 sessions, 3 rest days. About 10 km of running. About 2 h 25 min                                                                                                         |

| Wk  | Phase          | Thu: Hybrid session                 | Mon and Sat: runs        | Tue: strength        |
| --- | -------------- | ----------------------------------- | ------------------------ | -------------------- |
| 1   | Base           | Benchmark (1 km runs)               | Easy 20, Easy 30         | Full body            |
| 2   | Base           | Run and push, 600 m runs            | Easy 20, Easy 30         | Full body            |
| 3   | Base           | Run and pull, 600 m runs            | Easy 30, Long 6K         | Full body            |
| 4   | Base, lighter  | Run and carry, 3 rounds, 600 m runs | Easy 20, Easy 30         | Full body, half sets |
| 5   | Build          | Half simulation, stations 1-4       | Easy 30, Long 6K         | Full body            |
| 6   | Build          | Run and push, 800 m runs            | Easy 30, Long 6K         | Full body            |
| 7   | Build          | Run and pull, 800 m runs            | Easy 30, Long 8K         | Full body            |
| 8   | Build, lighter | Benchmark                           | Easy 20, Long 6K         | Full body, half sets |
| 9   | Build          | Half simulation, stations 5-8       | Easy 30, Long 8K         | Full body            |
| 10  | Build          | Full simulation                     | Easy 30, Easy 30         | Full body, half sets |
| 11  | Taper          | Run and push, 3 rounds              | Easy 30, Long 6K         | Full body, half sets |
| 12  | Race           | Thu Easy 20                         | Mon Easy 20, race on Sat | Rested, not counted  |

The trade to see: his benchmark is 3 km of running from week 1, at whatever
mix of running and walking he can manage, because a benchmark that grew with
him would show no progress. His training sessions start at 600 m.

#### C. A hybrid athlete, 5 days

Women's pro. Runs most weeks, 10K in 46:00. Lifts most weeks. All four kinds
of kit. Rule 2 gives her 2 runs and 2 strength.

| Day  | Week 1                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mon  | **Easy 40 + strides**, about 45 min                                                                                                                                                                   |
| Tue  | **Strength A · Legs and push**, about 50 min: Barbell Squat 4×5-8\*, Walking Dumbbell Lunges 3×20 steps, Dumbbell Bench Press 3×8-12, Sled Push 4×12.5 m at 152 kg, Wall Balls 3×20 at 6 kg to 2.70 m |
| Wed  | Rest                                                                                                                                                                                                  |
| Thu  | **Hybrid session · Benchmark**, about 45 min, women's pro weights                                                                                                                                     |
| Fri  | **Strength B · Pull and grip**, about 50 min: Romanian Deadlift 3×6-10\*, Pull-Ups 3×6-10, Seated Cable Row 3×10-12, Sled Pull 4×12.5 m at 103 kg, Farmer's Carry 4×50 m at 2×24 kg, Plank 3×40 s     |
| Sat  | **Long 12K**, about 65 min                                                                                                                                                                            |
| Sun  | Rest                                                                                                                                                                                                  |
| Week | 5 sessions, 2 rest days. About 22 km of running. About 4 h 15 min                                                                                                                                     |

| Wk  | Phase          | Thu: Hybrid session           | Mon and Sat: runs                  | Tue and Fri: strength |
| --- | -------------- | ----------------------------- | ---------------------------------- | --------------------- |
| 1   | Base           | Benchmark                     | Easy 40 + strides, Long 12K        | A, B                  |
| 2   | Base           | Run and push                  | Easy 40 + strides, Long 12K        | A, B                  |
| 3   | Base           | Run and pull                  | Easy 50 + strides, Long 14K        | A, B                  |
| 4   | Base, lighter  | Run and carry, 3 rounds       | Easy 40, Long 10K                  | A, B at half sets     |
| 5   | Build          | Half simulation, stations 1-4 | 5×1K Intervals, Long 14K           | A, B                  |
| 6   | Build          | Run and push                  | 30 Min Tempo, Long 14K             | A, B                  |
| 7   | Build          | Run and pull                  | 6×1K Intervals, Long 16K           | A, B                  |
| 8   | Build, lighter | Benchmark                     | Easy 40 + strides, Long 12K        | A, B at half sets     |
| 9   | Build          | Half simulation, stations 5-8 | 40 Min Tempo, Long 16K             | A, B                  |
| 10  | Build          | Full simulation               | Easy 40 + strides, Easy 50         | B at half sets        |
| 11  | Taper          | Run and push, 3 rounds        | 5×1K Intervals, Long 12K           | A, B at half sets     |
| 12  | Race           | Thu Easy 20                   | Mon Easy 30 + strides, race on Sat | B at half sets on Tue |

The quality runs in Build are examples of what the 10K plan's ladder gives;
the run engine picks them, as it does now.

**Acceptance (Pgm9).** These prints are written by hand from the rules in
§3.1. They show the shape for the owner to say yes or no to before any code is
written. The build then generates the same three setups from the preset and
the owner signs the generated print before the preset reaches anyone; a passing
test is not acceptance (Pgm9 (4)).

### 3.3 Dates, slides and missed days (ADR-0002)

- **The Hybrid session is dated**, as every run is. It is the run plan's day:
  Train draws it on its date, and if the day passes without it, it is missed,
  as a run is, never slid. "Move a run" moves it within its week, with the
  spacing note when it would land beside the long run or Strength A.
- **Lifts slide** as TrainWk1 call 1 says: a lift whose day passes moves
  forward in order. A lift may slide onto the Hybrid session's day (Train
  shows the Hybrid session first and the lift second), except a simulation's
  or the benchmark's day: there the lift waits a day.
- **Race day** is a run day of type race (`templateId: "hybrid_race"`). Its card
  reads "Race day · Hybrid race" (or the name the person typed) and offers "Log
  your race": the finish time, saved as a Hybrid workout with no steps (§4.5),
  and marked done. Official splits are not entered in v1. After it, the run
  plan's recovery weeks run as for any race.

---

## 4. The Hybrid session

### 4.1 The block model

Hyb1 call 4: extend the workout, do not invent a new kind.

- **A session is one block, rounds for time** (Circ1 v2's for-time block,
  shared with circuit mode). It has a number of rounds and an ordered list of
  steps; a simulation is one round of sixteen steps.
- **A step is a run or a station.**
  - A run: metres and a time. Entered, not tracked: there is no GPS inside a
    workout in v1, so the plan's metres stand unless the person corrects them
    at the finish (a treadmill reads 1.02 km). Its aim is a pace (§7).
  - A station: metres (sled push, sled pull, burpee broad jumps, the carry,
    the lunges, the ergs) or reps (wall balls), with kg where it has a load.
- **Transitions are timed.** Each step starts with a tap and ends with a tap,
  so the gap between one step's end and the next one's start is the transition,
  as a race times the walk to each station (open question 4).
- **Saved as one workout** (`format: "hybrid"`), each step one exercise, each
  round one set of it. §10.1 has the fields.

### 4.2 The session's page and the player

**The session's page** (TrainWk1 call 2: a session opens its own page). The
kicker "Hybrid session · Thu 10 Dec"; the name as the hero, "Run and pull"; one
line, "4 rounds · about 50 min · 4 km of running"; its picture (the runner and
the session's lead station); "Why this session": "Pulling on legs that have
just run. Week 3 of 12." Then one round's steps, "× 4", each with its drawing,
amount and weight, and a swapped step's label (§4.4). Start session is the
page's one filled button, neutral; Move, Skip and Mark as done sit under it.

**The player** is a full screen on the dark stage in both themes, as the run
screen is, with the screen kept awake. The phone sits on the floor beside a
sled, so everything that matters is readable at two metres and tappable with a
sweaty hand (Hyb1 call 10):

- **Top**: the session's name, "Round 2 of 4", and the total clock.
- **A strip of every step**, coral for runs and purple for stations, filled
  when done, the current one lit.
- **The hero**: the current step's drawing in one soft light of its colour;
  the kicker ("Run · 1 km" or "Station · Sled pull"); the step's clock in the
  display register (Archivo's wide heavy cut, 88 px, the live-screen exception
  in §14m rule 6); under it the aim ("Aim 5:20 /km") or the job ("25 m ·
  103 kg").
- **What is next**, one line: "Next: Ski erg 250 m".
- **One big button**, the bottom third of the screen, about 120 px tall:
  "Done" while a step runs. After Done the screen shows the next step with its
  drawing and the transition's clock running, and the same button reads "Start
  sled pull". Two taps per change, each the same place on the glass.
- **Pause** and **End** are small, at the top, out of reach of a stray tap.
  End asks once ("End and save 9 of 16 steps?").
- **Voice** (`useAudioCues`): the step's name as it starts, "Round 3. Run,
  one kilometre." No mid-run cues: without GPS there is no distance to call.

The player reuses `useSessionPlayer` and `useAudioCues` (Circ1 call 10). An app
closed mid-session resumes it from the device on reopening, as a lift does.

### 4.3 The Live Activity

A hybrid kind beside the run's and the lift's (§14q, Wid2):

- **Lock Screen card and expanded island**: the current step's drawing at the
  left in one soft light of its colour; the kicker "RUN · ROUND 2 OF 4" in
  coral or "SLED PULL · ROUND 2" in purple; the step clock as the large figure;
  one line, "Total 14:20 · Next ski erg 250 m".
- **Compact sides**: the sport's icon and the step clock. **Minimal**: the
  clock alone, at the 12 pt `ISLAND_FIGURE_PT`.
- It starts at the first step and ends at the finish; it changes pose as the
  step changes, never animates within one. No button (Wid2: none yet).
- The widget extension needs the new drawings (§6) in `liveActivityArt.ts`.

### 4.4 Kit swaps

Hyb1 call 6: setup asks about four kinds of kit; anything missing swaps to a
named stand-in from one authored table (§6.4). On the session's page, in the
player and on the finish, a swapped step shows the stand-in's name and drawing
with a label under it: **"Swap for sled pull · no sled"**. Train's row for the
day says how many: "4 rounds · 2 swaps".

A swapped station has no best of its own (Hyb1 call 6). The benchmark keeps a
best for each set of swaps (§4.6), so a gym without a sled still has a time to
beat.

### 4.5 The finish

A routine session gets a calm summary with its picture (§14m rule 29):

- the name and the date as the kicker, the total as the figure, "37:09" at
  44 px, with "4 rounds · 4 km run";
- against the same session last time on the same kit, one line: "1:05 faster
  than Thu 10 Dec"; the first time, when it comes back: "Your first Run and
  pull. It comes back in week 7, to beat.";
- **the splits**: a grid with a row per step and a column per round, each cell
  its time; transitions are the last row; under it "Runs: 5:01 /km on average
  · Transitions: 2:48 in all". Tapping a run's cell corrects its metres. At
  320 px and at large text the grid becomes one block per round;
- "How did that feel?" Easy, Right or Hard (Circ1 call 7), stored for the
  session-RPE load that comes later (Hyb1 call 3);
- the feed post row, as on the lift finish (§9.5);
- Done, the one filled button.

A **first** Hybrid session and a **benchmark best** get the full screen
(§0 rule 12, §14m rules 29 to 32).

**Log your race** (race day) saves a workout with the finish time and no steps:
the time is the figure, and the finish shows it with the division and the
race's name. It counts once, like any session.

### 4.6 The benchmark and its best

The benchmark (§7.6) is fixed: the same steps and weights every time, so its
total time is a fair test. It comes in week 1 and in each lighter week, and
anyone can run it from the Space or "Train another way" at any time.

- **The best is the fastest saved benchmark on the same kit.** It is read from
  the saved workouts, not stored apart, so deleting a session puts the best
  back where it was (ADR-0012). Each set of swaps keeps its own best; the
  finish names it: "Your best with plate push and seated cable row".
- **The first benchmark** gets the full screen: "Your first benchmark", the
  time in the display register, "The time to beat in week 4."
- **A new best** gets the full screen, in gold, the colour of a best and
  nothing else: one drawn object (a gold stopwatch ring around the time)
  half the screen's width in its top 40%, the kicker "NEW BENCHMARK BEST", the
  time as the one display figure, one sentence, "1:12 faster than your first,
  on 25 Nov.", what is next, "Next benchmark: week 8, Wed 13 Jan.", and Done.
  Share is a quiet link. Confetti, since it is a new best (§14m rule 32);
  Reduce Motion fades it in and throws nothing.
- **A slower benchmark** is a routine finish: the time, and "0:40 slower than
  your best. Lighter weeks often are." The bad-day rule: a number, no grade.

### 4.7 Ended early, offline, deleted

- **Ended early**: what was done is saved and counts once if it ran 7 minutes
  or more (Circ1 call 6's floor); the planned day is marked done only when every
  step was done. A benchmark ended early has no time and no best.
- **Offline**: the session saves to the device and queues, as a lift does
  (`offlineQueue.ts`); the finish says it is waiting to sync only where that
  guarantee holds (§10a).
- **Deleted** from its detail page (ADR-0012): the week's counts, the best and
  the planned day's completion follow.

---

## 5. Counting

Hyb1 call 3: count each step as what it is, add nothing new, and never count
the session twice. **The session counts once, as a run** (its kind under
ADR-0002). Its run metres add to the week's kilometres. Its weighted rep sets
add to tonnage. Its metre stations add no load: a sled's kg is not comparable
across floors. Minutes and Easy / Right / Hard are stored for later.

### 5.1 The one load rule

Today ~40 places decide whether a set adds tonnage with `repUnit === "seconds"
? 0 : kg × reps` (client and server; `grep` lists them). A third unit makes that
test wrong in every one. So:

- `RepUnit` becomes `"reps" | "seconds" | "metres"` (`programTypes.ts`), and
  `WorkoutExercise.repUnit` follows (`savedWorkouts.ts`).
- One predicate, **`repUnitCountsLoad(unit)`**, true only for reps or no unit,
  in `src/features/program/repUnits.ts`, and its server copy in
  `functions/lib/timedExerciseIds.js`, pinned by the existing
  `timedExerciseIds.cross.test.ts`.
- Every site moves to it: `workoutTonnageKg` (`savedWorkouts.ts`),
  `workoutVolumeKg` (`functions/lib/workoutVolume.js`), the reducer's tonnage
  and `addExercises` / `replaceExercise` (`functions/lib/programCommands.js`),
  `workoutCorrections.js`, `represcribe.js` and its client copy,
  `firstWeekActivation.js`, the lift finish, `prTracking.ts`, `liftRecords.ts`,
  and the rest of the list. A ratchet test then fails on any new
  `=== "seconds"` load check, as `oneWeekCountGuard.test.ts` does for counts.

### 5.2 The readers, one by one

| Reader                                                                                                              | Change                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/trainingWeek.ts` `countDone` and `countedSessions` (Home, both finishes, the review, Train, anniversaries) | **lifts done**: saved workouts except `format: "hybrid"`. **runs done**: runs that count, plus Hybrid workouts, plus planned runs marked done by hand on a day with neither. **metres**: the runs' distance plus `hybridRunMetres(workout)`. `weekDone` and `trainingWeek` follow, because they call it. Planned: the Hybrid day is one of `runDays`, so it is already one planned run. |
| `src/lib/savedWorkouts.ts`                                                                                          | `hybridRunMetres(workout)`: the sum of the run steps' metres as saved after the finish's corrections. The one place they are added up.                                                                                                                                                                                                                                                  |
| `src/lib/savedRuns.ts`                                                                                              | **No change, on purpose.** A Hybrid session is not a saved run, so its run steps never reach run records (fastest 1K and 5K), pace trends, the run list, shoe mileage, segments or the kilometre challenges. They are typed, not recorded, and run on legs a station has loaded; a fastest 1K from one would be false.                                                                  |
| `functions/lib/leaguePlanned.js`                                                                                    | The Hybrid day is in `runDays`, so it counts as one planned run already. Race week leaves out the lift days the plan rests (TrainWk1 (b)), as for any race. `leaguePlanned.cross.test.ts` gains a hybrid week.                                                                                                                                                                          |
| `functions/lib/weekTally.js` (the league's done)                                                                    | Counts every saved workout once, so a Hybrid session is one session. It reads no hand-marked completions, so the planned day's completion cannot add a second. `weekTally.cross.test.ts` gains the case.                                                                                                                                                                                |
| `functions/performanceEngine.js` `aggregateWindow` and `src/lib/performanceEngine.ts`                               | One session in the lifting loop (an active week, a session). Tonnage through `workoutVolumeKg` and the load rule: wall balls count, metre stations do not. Run steps carry category "Run" and the ergs "Cardio", so neither adds a hard set. Run metres stay out of `runKm`, `runLongKm` and `runQualityCount` in v1: no new performance measure (Hyb1 call 3).                         |
| Planned day done (`setManualRunCompletion` in `programCommands.js`)                                                 | The finish marks the Hybrid day done with the existing command, carrying `source: "hybrid"` and the workout's id, so Train, the run plan's next week and race reconciliation all see it. `countDone` leaves it out where the workout is already counted.                                                                                                                                |
| Streak, badges, challenges                                                                                          | A saved workout: it keeps the streak, counts for the session badges and `workout_count`, adds its rep tonnage to `total_volume`. It is not a lift and a run for the hybrid-window badges, and adds nothing to distance badges or kilometre challenges.                                                                                                                                  |
| Calories (`workoutBurn.js` and its client copy)                                                                     | Not the tonnage formula, which would read a Hybrid session as light lifting. Run steps at the run rule (about 1 kcal per kg per km), stations at the 2024 Compendium METs for their activity times their minutes, transitions at walking (3.5 METs).                                                                                                                                    |

### 5.3 Server validation

`functions/lib/programCommands.js`:

- accepts `metres` wherever a unit is carried, and `repUnitForExerciseId`
  gains a metres set for the new station ids only (`sled-push`, `sled-pull`,
  `sandbag-lunges`, `burpee-broad-jumps`). The ergs and the farmer's carry keep
  their lift-plan units, so no stored plan changes. The migration that fills a
  missing unit (`migrations.ts`) keeps filling seconds only, with a test;
- `addExercises` prescribes a metres station as 4 × 12.5 m (the race's
  lengths), and `replaceExercise` resets the amount when the unit changes, as
  it does between reps and seconds today;
- `setManualRunCompletion` accepts the optional `source: "hybrid"` and
  `workoutId` (a string id, length-bounded, like the rest).

---

## 6. Catalogue, drawings and loads

### 6.1 Stations

Hyb1 call 5. Each new exercise ships with its drawing (Circ1 call 9's rule: no
exercise without art), through the pipeline that drew the rest of
`public/form-art/`:

| Exercise           | Id                   | Today                    | Unit                | New drawing                                    |
| ------------------ | -------------------- | ------------------------ | ------------------- | ---------------------------------------------- |
| Ski Erg            | `ski-erg`            | Exists, drawn            | metres in a session | No                                             |
| Sled Push          | `sled-push`          | Part of `sled-push-pull` | metres              | Yes, from the existing push                    |
| Sled Pull          | `sled-pull`          | Part of `sled-push-pull` | metres              | Yes, facing the sled, hand over hand on a rope |
| Burpee Broad Jumps | `burpee-broad-jumps` | New                      | metres              | Yes                                            |
| Rowing Machine     | `rowing-machine`     | Exists, drawn            | metres in a session | No                                             |
| Farmer's Carry     | `farmers-carry`      | Exists, drawn            | metres in a session | No                                             |
| Sandbag Lunges     | `sandbag-lunges`     | New                      | metres              | Yes, bag on the shoulders                      |
| Wall Balls         | `wall-balls`         | New                      | reps                | Yes, mid-throw toward a target                 |

`sled-push-pull` stays in the catalogue for the history that holds it, hidden
from pickers; the plan and the sessions use the two new ids. The prototype uses
stand-ins where a drawing does not exist yet: the sled push drawing for both
sled steps, thrusters for wall balls, walking lunges for the sandbag lunges,
burpees for burpee broad jumps.

### 6.2 The Hybrid strength template

A lift template beside the others, whose focus label is "Hybrid race". Rest,
set counting and the clock follow Lift21's rules; the minutes in §3.2 are by
hand until the build prices them.

| Day                            | New to lifting                                                                                                                              | Some experience and up                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Strength A · Legs and push     | Goblet Squat 3×8-12\*, Walking Dumbbell Lunges 3×16 steps, Dumbbell Bench Press 3×8-12, Sled Push 4×12.5 m, Wall Balls 3×15                 | Barbell Squat 4×5-8\*, Walking Dumbbell Lunges 3×20 steps, Dumbbell Bench Press 3×8-12, Sled Push 4×12.5 m, Wall Balls 3×20    |
| Strength B · Pull and grip     | Dumbbell Romanian Deadlift 3×8-12\*, Lat Pulldown 3×8-12, Seated Cable Row 3×10-12, Sled Pull 4×12.5 m, Farmer's Carry 3×50 m, Plank 3×30 s | Romanian Deadlift 3×6-10\*, Pull-Ups 3×6-10, Seated Cable Row 3×10-12, Sled Pull 4×12.5 m, Farmer's Carry 4×50 m, Plank 3×40 s |
| Strength · Full body (one day) | Goblet Squat 3×8-12\*, Dumbbell Romanian Deadlift 3×8-12, Lat Pulldown 3×8-12, Dumbbell Bench Press 3×8-12, Farmer's Carry 3×50 m           | Barbell Squat 4×5-8\*, Romanian Deadlift 3×6-10, Pull-Ups 3×6-10, Dumbbell Bench Press 3×8-12, Farmer's Carry 3×50 m           |

Station loads are the division's race loads (§6.3). Missing kit swaps as in
§6.4; the lift plan's own kit and injury swaps (`matchTemplate.ts`) apply to
the rest. First weights for the lifts come from `startingLoads.ts`, as now.

### 6.3 Division loads

From the best-known series' published 2025/26 singles rulebook (R1, June
2025). Sled weights
include the sled. Kept as one config table, pasted forward by hand each season
with the season named beside it (open question 10), never fetched.

| #   | Station            | Distance or reps  | Women's open   | Women's pro    | Men's open     | Men's pro      |
| --- | ------------------ | ----------------- | -------------- | -------------- | -------------- | -------------- |
| 1   | Ski erg            | 1000 m            | none           | none           | none           | none           |
| 2   | Sled push          | 50 m (4 × 12.5 m) | 102 kg         | 152 kg         | 152 kg         | 202 kg         |
| 3   | Sled pull          | 50 m (4 × 12.5 m) | 78 kg          | 103 kg         | 103 kg         | 153 kg         |
| 4   | Burpee broad jumps | 80 m              | none           | none           | none           | none           |
| 5   | Rower              | 1000 m            | none           | none           | none           | none           |
| 6   | Farmer's carry     | 200 m             | 2 × 16 kg      | 2 × 24 kg      | 2 × 24 kg      | 2 × 32 kg      |
| 7   | Sandbag lunges     | 100 m             | 10 kg          | 20 kg          | 20 kg          | 30 kg          |
| 8   | Wall balls         | 100 reps          | 4 kg to 2.70 m | 6 kg to 2.70 m | 6 kg to 3.00 m | 9 kg to 3.00 m |

Secondary guides disagree on one point (one says 75 wall balls for women's
open in 2025/26); the rulebook says 100 for every division, and that is what
the table holds.

### 6.4 Swaps

One authored table (Hyb1 call 6). A swapped station has no best.

| Missing           | Station    | Stand-in                                                                 | Load by division (women's open, women's pro, men's open, men's pro) |
| ----------------- | ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Sled              | Sled push  | Plate push: a plate pushed along turf or a smooth floor, the same metres | 15, 20, 20, 25 kg plate                                             |
| Sled              | Sled pull  | Seated Cable Row, 12 reps for each 12.5 m                                | 40, 55, 55, 70 kg                                                   |
| Ski erg           | Ski erg    | Rowing Machine, the same metres                                          | none                                                                |
| Rower             | Rower      | Ski Erg, the same metres                                                 | none                                                                |
| Ski erg and rower | Either     | A bike, 2 minutes for each 500 m, hard                                   | none                                                                |
| Wall-ball target  | Wall balls | Thrusters, a dumbbell of the ball's weight in each hand, the same reps   | 2 × 4, 2 × 6, 2 × 6, 2 × 9 kg                                       |

Not swaps, so they keep their bests: the farmer's carry with dumbbells instead
of kettlebells, and the lunges with a dumbbell held at the chest instead of a
sandbag. The stand-in loads are Tropos heuristics.

---

## 7. Content: the six sessions

Tropos-authored (Hyb1 call 7). Each starts with an untimed warm-up (8 minutes
easy on the treadmill or an erg, then two easy lengths of each loaded station)
and then the timed block. Loads are listed women's open / women's pro / men's
open / men's pro. Run steps aim at the person's 10K pace plus 20 s a km (a
Tropos heuristic: running after a station is slower), or "steady, able to
talk" for someone new to running. Swaps follow §6.4.

### 7.1 Run and push · about 45 min

4 rounds for time:

- Run 1000 m (600 m or 800 m for a new runner, §3.1 rule 11)
- Sled push 25 m (2 × 12.5 m): 102 / 152 / 152 / 202 kg
- Wall balls 25: 4 kg to 2.70 m / 6 kg to 2.70 m / 6 kg to 3.00 m / 9 kg to
  3.00 m

In all: 4 km of running, 100 m of sled push, 100 wall balls, the race's whole
wall-ball count. Swaps: plate push 25 m; thrusters 25.

### 7.2 Run and pull · about 50 min

4 rounds for time:

- Run 1000 m
- Sled pull 25 m (2 × 12.5 m): 78 / 103 / 103 / 153 kg
- Ski erg 250 m
- Burpee broad jumps 20 m

The pull comes straight off the run, while the legs and grip are loaded, as
the sled comes early in a race. Swaps: seated cable row 2 × 12 at 40 / 55 /
55 / 70 kg; rower 250 m.

### 7.3 Run and carry · about 50 min

4 rounds for time:

- Run 1000 m
- Rower 250 m
- Farmer's carry 100 m: 2 × 16 / 2 × 24 / 2 × 24 / 2 × 32 kg
- Sandbag lunges 50 m: 10 / 20 / 20 / 30 kg

Swaps: ski erg 250 m. The lighter-week version is 3 rounds.

### 7.4 Half simulation · about 50 min

Half the race at full distance and weight, alternating halves each time the
plan gives it.

- **Stations 1 to 4**: Run 1 km · Ski erg 1000 m · Run 1 km · Sled push 50 m ·
  Run 1 km · Sled pull 50 m · Run 1 km · Burpee broad jumps 80 m.
- **Stations 5 to 8**: Run 1 km · Rower 1000 m · Run 1 km · Farmer's carry
  200 m · Run 1 km · Sandbag lunges 100 m · Run 1 km · Wall balls 100.

Loads from §6.3. Swaps from §6.4.

### 7.5 Full simulation · about 1 h 30 min

The race in order: eight times a 1 km run and the next station, at full
distance and the division's weight (§6.3). Swaps from §6.4; a swapped
simulation is still a simulation, with no best.

### 7.6 Benchmark · about 45 min

Every station once at about half its race distance, three 1 km runs, for time.
Run steps are always 1 km, for everyone.

1. Run 1 km
2. Ski erg 500 m
3. Sled push 25 m: 102 / 152 / 152 / 202 kg
4. Sled pull 25 m: 78 / 103 / 103 / 153 kg
5. Burpee broad jumps 40 m
6. Run 1 km
7. Rower 500 m
8. Farmer's carry 100 m: 2 × 16 / 2 × 24 / 2 × 24 / 2 × 32 kg
9. Sandbag lunges 50 m: 10 / 20 / 20 / 30 kg
10. Wall balls 50: 4 kg to 2.70 m / 6 kg to 2.70 m / 6 kg to 3.00 m / 9 kg to
    3.00 m
11. Run 1 km

A first-timer takes 30 to 40 minutes for the timed part. The best is kept for
each set of swaps (§4.6).

---

## 8. Food

Hyb1 call 9: a Hybrid day is fuelled like the hard day it is.

- **The day's type.** The schedule's four day types (`lift`, `run`, `both`,
  `rest`) stay: a Hybrid day is a run day in the schedule, or `both` when a
  lift shares it. What makes it hard is the planned run's type: `RunPlannedType`
  gains `"hybrid"`, and `HARD_RUN_TYPES` (`programTypes.ts`) gains it too.
- **What that does.** `classifyDayIntensity` (`dayIntensity.ts`) returns HARD
  for the day, so `phaseNutrition` moves 450 kcal of fat into carbs with the
  0.6 g/kg fat floor, as on a long run or a race day. The simulations and the
  benchmark are the same tier; no new tier.
- **The words.** Food's day caption reads "Hybrid day" (and "Race day" on race
  day), from the same place the other captions come from.
- **The burn** is §5.2's, so the day's energy is not read as light lifting.

Nothing else in food changes.

---

## 9. Social

### 9.1 Hybrid Training, the community home

§2.1: the format card with "Train for a hybrid race", the generic count, the
six sessions pinned, then posts and sessions as in every Space. Its cover
photograph stays (a pair passing a medicine ball, `space-hybrid-training`),
which already fits the format and carries no event's branding.

### 9.2 Naming, and why no events are listed

**Decided (owner, 18 November).** "Hybrid race" is a goal type for a generic
format, and Tropos lists no hybrid race events: no event Spaces, no calendar,
no dates to pick from, and no switch to show or hide them. The person enters
their own race.

**Why.** A road race is listed by its own name. Here the best-known events
belong to one series whose name is a registered mark, licensed to paid training
partners and to one exclusive software partner. Listing its events under their
name needs its permission. Listing the same events without the name, by city
and date, reads as a knock-off and is bad practice (the owner's words: it is
the same event with the name taken off). So Tropos lists neither, and the
format stands on its own: many organisers and gyms run races in this shape.

**What that means in the product.**

- The feature is "Hybrid race" everywhere: the goal, the Hybrid session, the
  format card, Train, Home, the store listing.
- The series' name never appears in Tropos: not in the app's name, its App
  Store keywords, description or screenshots (App Review 2.3.7), a Space, a
  post Tropos writes, a notification, or the code. Ids and fields say
  `hybrid`.
- A person may type their race's own name into their goal. That is their
  content; Tropos never fills it in or suggests it (§2.3).
- Two other names stay out: "SkiErg" (one word) is Concept2's mark, so the
  station is "Ski erg"; and the series' own word for the transition zone is
  not used: Tropos says "transitions".
- The division loads (§6.3) are the format's numbers, read from the published
  rulebook and entered by hand each season. Numbers are facts, not the mark.

**Later.** If Tropos gets traction, apply to the series' official
digital-partner programme. Listing its events properly, by name, comes only
with its permission.

### 9.3 The plan group and the "Training for" chip

**The count is honest and cheap, so it is in.** With no event to bind to there
is no single race to share, but there is a format: `raceCohorts/hybrid-training` counts
every goal with `distance: "hybrid"` and a race day still ahead.

- `cohortOf` in `functions/lib/raceCohorts.js` returns `hybrid-training` for a
  hybrid goal; `onRaceGoalWritten` and `dailyRaceCohortRecount` recount it as
  they recount a race Space. The count query is
  `raceGoal.distance == "hybrid"` and `raceGoal.targetDate >= cutoff`, which
  needs one composite index (`raceGoal.distance`, `raceGoal.targetDate`),
  pinned in `__tests__/raceCohorts.test.js` as the existing index is.
- It names no one, counts a restricted account as a number like any other,
  and is recounted, never incremented, like every plan group.
- **Where it shows.** The format card on Hybrid Training, to anyone from 10
  (App1 Q6) and to someone training for one from 3; Together's race hero for
  someone training for one, from 3: "You and 33 others on Tropos are training
  for a hybrid race". Under the floor, or while the count is read, nothing is
  drawn, never a zero.
- **Together's race hero** for a hybrid goal: "Your race · 9 weeks to go", the
  typed name or "Hybrid race", the date, and Hybrid Training's cover.

**The chip.** Someone who turns on "Show the race I'm training for" (the
existing `RaceIdentityToggle`) shows "Training for a hybrid race · 9 wks" on
their profile, linking to Hybrid Training. The public profile carries
`trainingForSpaceId: "hybrid-training"` (already allowed: any known Space id)
and a new `trainingForDateKey`, the race day, so the chip disappears after it
as a road race's does. The typed name is never on the chip.

### 9.4 A session in the feed

A Hybrid session posts as a lift does (`liftPost.ts`), with its own card: the
session's name and time as the headline, its picture, "4 rounds · 4 km run · 4
stations" as the facts, and a strip of the rounds' times. Moments
(`postMoments.ts`) gain two kinds from real data: **a first Hybrid session**
(purple, as a first session is) and **a benchmark best** (gold, with the time
and the improvement); `firestore.rules` accepts their shapes. A swapped
benchmark's best says which kit. Photos, props and comments work as on any
post. A post never carries the typed race name.

---

## 10. Data model, migrations, rules, server and Pro

### 10.1 What is stored

| Where                         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users/{uid}/workouts/{id}`   | `format: "hybrid"` (Circ1 adds `"circuit"`); `block: { kind: "for_time", rounds, totalS, feel? }`; `hybrid: { sessionId, division, kitKey, runDayId? }` where `kitKey` names the swaps ("no-sled", "" for none). Each step is an exercise with `stepKind: "run" \| "station"`, `repUnit` and `swapFor?`; each round is a set with `reps` (metres or reps), `weightKg`, `durationS`, `transitionS` and `round`. Log your race: `sessionId: "race"`, `totalS`, no exercises. |
| `users/{uid}.raceGoal`        | `distance` gains `"hybrid"`; new optional `hybrid: { division: "women_open" \| "women_pro" \| "men_open" \| "men_pro", kit: { sled, skiErg, rower, wallBallTarget }, returnTo? }`. `eventName` is the typed name, as for any race.                                                                                                                                                                                                                                         |
| `users/{uid}/public/profile`  | `trainingForDateKey`, the race day, beside `trainingForSpaceId` (§9.3).                                                                                                                                                                                                                                                                                                                                                                                                    |
| `programState.runDays[]`      | `type: "hybrid"` with `hybridSessionId` and `templateId: "hybrid_<session>"`; the race day is `type: "race"`, `templateId: "hybrid_race"`.                                                                                                                                                                                                                                                                                                                                 |
| Lift templates                | The Hybrid strength days (§6.2) in the template table, with the goal's focus label "Hybrid race".                                                                                                                                                                                                                                                                                                                                                                          |
| `SPACE_DEFS`                  | `hybrid-training` gains its format card (`format: "hybrid"`) and the tagline without its em dash. No new Space id.                                                                                                                                                                                                                                                                                                                                                         |
| `raceCohorts/hybrid-training` | The generic count (§9.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Catalogue                     | Five new exercise ids (§6.1); `sled-push-pull` hidden from pickers.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Bests                         | Nothing stored: read from saved benchmarks, which needs a composite index on `workouts` (`hybrid.sessionId`, `date`), pinned in `firestore.indexes.json` by a test.                                                                                                                                                                                                                                                                                                        |

### 10.2 Migrations and the schema version

- **No data is rewritten.** Every field is new and optional; old workouts,
  goals and plans read as before.
- **The programme's schema version moves by one** in the PR that first writes a
  `hybrid` run day (to 8 if TrainWk1's call 5 has taken 7 by then, else to 7),
  with no one-shot repair. That is the existing rule
  (`CURRENT_PROGRAM_SCHEMA_VERSION`, `migrations.ts`): a document a newer build
  wrote is left alone by an older one, so an old build cannot write a plan with
  a run day it does not understand back at its own version.
- **Older builds** meet a `hybrid` run day before they update. They must not
  break on it: the run card's unknown-template path shows "Hybrid session" and
  opens the session's page, which asks them to update. Checked on the build
  before the one that writes it.
- **The unit migration** (`migrations.ts` fills a missing `repUnit` from the
  id) keeps filling seconds only. A test holds that no stored plan gains
  metres.

### 10.3 Rules

- `raceGoalValid()` in `firestore.rules`: `distance` may be `"hybrid"`;
  `hybrid` is an allowed key, a map with `division` in the four values, `kit`
  a map of four booleans and `returnTo` a string up to 40 characters.
- The public profile: `trainingForDateKey` is a `YYYY-MM-DD` string or absent,
  next to the existing `trainingForSpaceId` gate.
- Post moments: the two new kinds' shapes (§9.4).
- No Space id changes, so `isKnownSpaceId` and `functions/lib/spaceIds.js`
  stay as they are. Workouts keep their owner-only rule; no shape gate is added
  (none exists for lifts).

### 10.4 Server

- `functions/profileSanitizer.js`: the `raceGoal` cleaner accepts `"hybrid"`
  and the `hybrid` map, or `configurePlan` silently drops them.
- `RACE_CONFIGS` (`runPlanTiming.ts`) and `VALID_RACE_DISTANCE`
  (`programTypes.ts`) gain `hybrid`, built as the 10K with the Hybrid day
  overlaid. The two race-day sweeps (`raceDayCompletion.js`,
  `raceReconciliation.js`) read `RACE_CONFIGS` and would throw on an unknown
  distance; they gain `hybrid`, and never infer a Hybrid race from a recorded
  run: race day is marked by Log your race or by hand, and "did you race?"
  asks.
- `programCommands.js`, `workoutVolume.js` and the rest of §5.3.
- `raceCohorts.js`: the hybrid branch and its index (§9.3).
- `onWorkoutCreated` and `onWorkoutDeleted`: no new code; they read the load
  rule through `workoutVolumeKg`.
- Read `docs/agents/functions-deploy.md` before the first server PR.

### 10.5 Free and Pro

App1 Q84 and Q85: logging, recent history and anything that protects a person
stay free; race plans are Pro after their first week.

| Free                                                                         | Pro                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hybrid Training's format card, the count, the chip, posts                    | **The Hybrid race plan after its first week**: `hybrid` joins `PRO_RACE_DISTANCES` (`racePlanAccess.ts`), sharing the once-per-account free week (`racePlanFreeWeekUsed`) |
| The six sessions run on demand, the player, the Live Activity, swaps, splits | History and charts older than 3 months (Q84), the benchmark's chart included                                                                                              |
| The benchmark and its best, the reward screens                               |                                                                                                                                                                           |
| Log your race                                                                |                                                                                                                                                                           |

A free account past the first week keeps its goal and date, and Train's
planned Hybrid session offers Pro as a planned half-marathon session does
(`RunCTACard`, `ProgrammeRunSection`). The same session stays free to run from
the Space or "Train another way". Setup's last screen carries
`RacePlanProNote`.

---

## 11. Analytics, tests and the order of work

### 11.1 Analytics

A `hybridAnalytics.ts` shim like `programAnalytics.ts`, through
`analyticsClient`. No free text and never the typed race name.

| Event                        | When                      | Properties                                                                                                           |
| ---------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `hybrid_setup_opened`        | Setup's first screen      | `door`: `space`, `run_plan`, `train`                                                                                 |
| `hybrid_setup_step_done`     | Each Continue             | `step`, `prefilled`                                                                                                  |
| `hybrid_setup_finished`      | Start plan                | `division`, `days`, `swaps` (0 to 4), `weeks_to_race`, `run_level`, `lift_level`, `named` (whether a name was typed) |
| `hybrid_setup_left`          | Leaving before Start plan | `last_step`                                                                                                          |
| `hybrid_session_started`     | Start session             | `session`, `planned`, `swaps`                                                                                        |
| `hybrid_session_finished`    | The finish                | `session`, `planned`, `minutes`, `rounds`, `swaps`, `feel`                                                           |
| `hybrid_session_ended_early` | End                       | `session`, `steps_done`, `steps_total`                                                                               |
| `hybrid_benchmark_saved`     | A benchmark's finish      | `first`, `best`, `improvement_s` in 30-second bands                                                                  |
| `hybrid_race_logged`         | Log your race             | `has_time`                                                                                                           |

The two questions they answer: do people who open setup finish it, and by
which way in; and do people who start the plan come back for the benchmark in
week 4.

### 11.2 Tests

**Unit**

- The load rule: `repUnitCountsLoad` on both sides, the cross test, every
  reader's tonnage with a metre station and wall balls, and the ratchet on
  `=== "seconds"`.
- `trainingWeek`: a Hybrid session counts once as a run; with a hand-marked day
  on the same date still once; on demand once; its metres in `km`; never in
  lifts. `weekTally` and `leaguePlanned` cross tests with a hybrid week.
- `savedRuns` readers: run records, pace trends and shoe mileage ignore Hybrid
  sessions (a test that seeds one and expects nothing to move).
- The preset: the three setups in §3.2 generated and pinned as snapshots once
  the owner has signed them (Pgm9), plus the rules in §3.1 as properties: one
  Hybrid session a week, the spacing, the rest days, the taper.
- `dayIntensity`: a Hybrid day is HARD.
- The division table pinned to its season; the swap table (each missing kit
  names its stand-in; a swapped station has no best); the benchmark's best per
  kit, and after a delete.
- `programCommands`: metres in `addExercises` and `replaceExercise`; the
  manual completion's new fields; the migration fills no metres.
- `raceCohorts`: a hybrid goal is counted in `hybrid-training`, moves out when
  its date passes or the goal ends, and the index is declared.
- Rules (emulator): `raceGoal` with `hybrid`; `trainingForDateKey`; the moment
  shapes.
- `profileSanitizer`: the `hybrid` map kept, junk dropped.
- Words: `copyMechanics`, `emDashCopy` and the date, time and unit treatments
  cover the new copy; `journeyScreens.ts` holds the names the journeys find; a
  test that the setup's name field has no placeholder or suggestion list.

**Journeys** (`e2e/journeys/hybridRace.auth.spec.ts`): a new account opens
Hybrid Training, taps "Train for a hybrid race", finishes setup, sees week 1 on
Train, moves its day to the benchmark and runs it through the player with the
clock moved, finishes with splits and sees the week count it once; moves to
week 4 and beats the benchmark for the best screen; moves to race week and logs
the race. A second journey comes in from Run plan with no sled.

**Captures** (`e2e/screenshots/hybridRace.capture.spec.ts`): the Space's
format card, each setup screen, Train's week, the session's page, the player on
a run, between steps and on a swapped station, the finish, the first benchmark
and the best, at 393 and 320 px in both themes. The large-text spec
(`largeText.capture.spec.ts`) adds the setup, the session's page, the player
and the finish at 1.35× and 2×.

### 11.3 Build order, as PRs

The lock's order (Hyb1 "Order"). Circ1's player is not built on main yet (no
`format: "circuit"` exists), so step 3 waits for it, or builds the for-time
block that circuit mode's v2 then reuses.

1. **Catalogue and drawings.** Sled Push and Sled Pull as two exercises; wall
   balls, sandbag lunges and burpee broad jumps, each with its drawing; the
   division table and the swap table as pure modules with tests. Nothing on
   screen.
2. **The metres unit and the one load rule**, client and server, with the
   cross tests and the ratchet. Nothing on screen.
3. **The Hybrid session**: the model, the session's page, the player, the
   transitions, the finish with splits, Easy / Right / Hard, the Live Activity
   kind, and the six sessions under "Train another way". The counting of §5 in
   the same PR, since the first save is counted. Free.
4. **The benchmark's best** and the three full-screen moments.
5. **Hybrid Training as the home**: the format card, sessions to try, the feed
   card and the two moments.
6. **The goal and the plan**: `distance: "hybrid"` through rules, sanitizer and
   `RACE_CONFIGS`; setup at `/plan/hybrid` from both ways in; the preset; the
   Pro gate; the generic count and the chip. The generated prints for the three
   setups in §3.2 go to the owner before merge (Pgm9).
7. **Food**: `hybrid` in `HARD_RUN_TYPES` and the caption.

Health export (mixed cardio) ships with the lift export, Circ1 call 12.

---

## 12. Not in v1, and why

- **Events.** No event Spaces, calendar or race names, by the owner's call
  (§9.2). If Tropos gets traction, apply to the series' official
  digital-partner programme; listing its events by name comes only with its
  permission.
- **EMOM and AMRAP.** Not needed for this race (Hyb1 call 4); circuit mode's v2
  brings AMRAP.
- **GPS inside a workout.** Runs are entered; tracking a run inside a workout
  is a second run engine.
- **A session-RPE load or any new performance measure.** Minutes and feel are
  stored so one can come later (Hyb1 call 3).
- **An engine that doses hybrid work** from results. The preset first; an
  engine needs its own lock.
- **Target-time forms, race prediction and entering official splits.** Log
  your race takes the finish time only.
- **Doubles, relays and team divisions.** Different loads and pacing, and a
  partner the app cannot see.
- **The watch.** Tropos has no watch app yet.
- **Open user-shared routines.** Later, with moderation (Hyb1 call 7).
- **Hybrid run steps in run records, pace trends, shoes, segments, kilometre
  challenges and the score** (§5.2).
- **Station bests outside the benchmark.** A best per station needs the same
  floor and sled every time; the benchmark's total is the honest one for now.
- **A "keep my lift plan" choice** during the block (open question 1).

---

## 13. Open questions for the owner

Each has a recommendation. The name, the Space and events are decided (§9.2).

1. **Does the goal replace the lift plan for the block?** Recommended: yes,
   with Strength A and B, and Train offers the previous plan back after the
   race (`hybrid.returnTo`). A "keep my lift plan" choice can come later if
   lifters ask for it.
2. **At 4 days, does a runner new to lifting get 1 run and 2 strength?**
   Recommended: yes, the weaker side takes the spare day (§3.2 A). The printed
   week is where to say no.
3. **A benchmark best for each set of swaps,** so a gym without a sled still
   has a time to beat? Recommended: yes.
4. **Transitions timed by a tap at each step's start** (two taps per change on
   one big button)? Recommended: yes. If people skip it, a setting can let a
   step start as the last one ends.
5. **The Hybrid session in coral on the week, its stations in purple inside
   the session?** Recommended: yes. It is the run plan's day, and the five
   colours keep one meaning each.
6. **Shorter run steps for a new runner** (600 m, then 800 m) in training
   sessions, with 1 km in the simulations and the benchmark? Recommended: yes.
7. **Hybrid run kilometres in the week's kilometres** (Home, the review) and
   nowhere else in running? Recommended: yes (§5.2).
8. **The plan is Pro after its first week; the sessions, the player and the
   benchmark are free?** Recommended: yes (§10.5).
9. **A photograph for the Hybrid race goal card** from Unsplash+, with a model
   release and no event's branding in the frame, three to choose from?
   Recommended: yes. Until then the card uses the existing race photograph.
10. **The division table entered by hand each season,** with a test that names
    the season? Recommended: yes.
11. **The typed race name on the person's own screens only,** never on the
    chip, a post or a share card? Recommended: yes. "A hybrid race" says
    enough in public, and Tropos then never draws a name it did not write.
12. **The generic count shown to everyone on Hybrid Training from 10,** and to
    someone training for one from 3? Recommended: yes (§9.3).

---

## The prototype

`prototype/index.html`, one file: the app's fonts, tokens, drawings and the
Space's cover are inside it, so it opens offline on a phone. Tap through from
the first screen; the index at the top jumps to any screen. It follows a man
training for men's open at a gym without a sled, on 5 days, who typed no race
name: his Run and pull swaps the sled pull for a seated cable row, and his
benchmark best is kept for that kit. The numbers on it are examples.

Captures (393 px, dark theme, device scale 2), in `prototype/captures/`:

| File                       | Screen                                          |
| -------------------------- | ----------------------------------------------- |
| `01-space.png`             | Hybrid Training, with "Train for a hybrid race" |
| `02-setup-date.png`        | Setup 1: the race date and an optional name     |
| `03-setup-division.png`    | Setup 2: the division                           |
| `04-setup-kit.png`         | Setup 3: the kit, sled off                      |
| `05-setup-start.png`       | Setup 4: where you're starting                  |
| `06-setup-days.png`        | Setup 5: days a week                            |
| `07-setup-plan.png`        | Setup 6: your plan, Start plan                  |
| `08-train-week.png`        | Train: week 3, today's Hybrid session           |
| `09-session.png`           | The session's page, with the swap               |
| `10-player-run.png`        | The player mid-run                              |
| `11-player-transition.png` | The player between steps                        |
| `12-player-station.png`    | The player mid-station, on the swap             |
| `13-finish.png`            | The finish with splits                          |
| `14-benchmark-best.png`    | The benchmark best                              |
