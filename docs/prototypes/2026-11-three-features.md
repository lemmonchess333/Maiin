# Three features from the Maxed review: spec and prototypes

**Status:** a draft for the owner's calls, 2026-11-10. Nothing here is
locked. The prototypes live on `claude/prototype-three-features`, which never
merges. Once the owner answers the calls, each answer becomes a row in the
plan file (`lock-decision`), and the real build starts from that row, not
from this branch.

The three features, in the order the Mobbin check ranked them:

1. **Go easier today, from Home.** Today's session can be made easier when
   the app knows a reason, or when the person asks.
2. **An example day on the welcome screen.** One real-looking session before
   sign-up.
3. **A partner's week.** Your week and your streak partner's, side by side.

---

## 1. Go easier today, from Home

### What exists

- "Easier today" (PROGRAM-ADAPT-01, `src/features/program/easierToday.ts`):
  - the same session, one set less per lift, weights at 85%;
  - it never changes the plan, and the session is saved as it happened.
- **Where it shows:**
  - always offered on Train, behind "Short on time?";
  - a "Go easier today" row on Train's session card, when its one reason
    fires: a hard run yesterday before a session that works the same legs
    (Lift4 (3)).
  - **Home shows none of it.**
- **Lift4 (2026-10-05) set the rule this feature has to live with:**
  - the app says what it knows and never guesses;
  - "Go easier today" keeps only its hard-run reason, and the guessed reasons
    were retired;
  - no readiness percentage (the comment in `ExpressSessionSheet.tsx`).

### What other apps do

Nine apps on Mobbin change or rate the day:

- **A readiness score:** Tempo, The Outsiders, Oura, Bevel, Fitbit and Tonal.
- **A rest day suggestion:** Gentler Streak.
- **The person chooses:** Strava (Easier, Steady, Harder) and Runna (plan
  difficulty).
- **When there's no sleep data:** The Outsiders scores from training load
  alone and says so.

### What Tropos does differently, and why

- **No score.** A score from training load is a guess about a body the app
  can't see, which is exactly what Lift4 retired.
- **A fact the person can check instead:**
  - "Hard run yesterday";
  - "5 h 40 min of sleep last night";
  - "You said you're tired".
- **Where this goes:** the reason for the difference goes in `GLOSSARY.md`
  with the build, as the reference-app rule asks.

### Proposal

- **Where it shows:**
  - on Home's hero as well as Train's card;
  - Start stays the hero's one button;
  - the easier session is a quiet link under it ("Go easier today · one set
    less per lift, lighter loads").
- **Reasons, one shown at a time, in this order:**
  1. The person's own answer this morning, if call 2 asks.
  2. A hard run yesterday, before a session that works the same legs
     (exists).
  3. **New:** a leg day yesterday, before today's hard run (intervals, tempo
     or a long run). It's the same fact the other way round.
  4. **New, iOS only:** under 6 hours of sleep last night, as recorded in
     Apple Health (call 3).
- **What easier means:**
  - **A lift:** as now, one set less per lift and 85% weights.
  - **A run (new, call 4):**
    - intervals or a tempo run become an easy run of the same length of
      time;
    - a long run becomes two-thirds of its distance, at easy pace;
    - an easy run has no easier option.
  - **How an easier run counts:** as the week's run done. The run plan
    doesn't step up from it: it counts as an easy run.
- **Never automatic and never the default.** The only trace kept is
  `sessionVariant` on the private session record, as now. The morning
  answer stays on the phone.

### The owner's calls

- **Call 1, where it shows:**
  - A, on Home's hero as well as Train;
  - B, on Train only, as now.
- **Call 2, whether to ask the person.** One prototype variant each:
  - **A, "Only with a reason":** the link shows only when a reason fires.
    Lift4 as it is.
  - **B, "Always a choice":** the link shows every day, quietly, and the
    reason line joins it when one fires. Strava's choose-it-yourself, with no
    score.
  - **C, "Morning question":** one tap before the day's first session (Good,
    Tired, Rough). Tired or Rough makes the easier session the main button.
    A reason the app knows sits above the question, in the same card, with
    no separate link. Fitbit's and Tempo's check-in, without the number.
- **Call 3, sleep from Apple Health:**
  - A, build it;
  - B, skip it.
  - **Building it:**
    - `capacitor-health` 8 reads steps, workouts, heart rate and calories,
      not sleep. Reading `HKCategoryTypeIdentifierSleepAnalysis` would go in
      the app's own iOS plugin, next to the WatchRun bridge.
    - The permission is asked where steps are asked.
    - Only a device can confirm it; it gets a row in the QA backlog.
    - The web build has no sleep, and shows nothing in its place: no "no
      data" line.
- **Call 4, an easier run:**
  - A, build it (the rules above);
  - B, lifts only.

**My recommendation:** 1A, 2B, 3A, 4A.

- **2B** gives a tired person a way in from Home without asking everyone a
  question every morning, and without guessing.
- **3A** is the reason the Maxed screens made the case for, and it's a fact,
  not a score.
- **Run first, build second.** Ship reasons 2 and 3 and the easier run
  first. Sleep follows once a device has confirmed the read.

---

## 2. An example day on the welcome screen

### What exists

- **The welcome screen (A5, `src/pages/Login.tsx`):**
  - the mark;
  - "Your training and food, planned together";
  - three rows: Lifting, Running and Food;
  - Get started and I have an account.
- **What it never shows:** what a session looks like.

### What other apps do

- **Hevy:** its welcome screens show a real set table, bench press with its
  sets, before sign-up.
- **Shortly after setup:** Tempo, Ladder, Future and adidas Running show a
  first workout.
- **What Tropos already covers:** Home leading with today's session for a new
  account (FV1) is the "shortly after setup" half.
- **What's left:** the "before sign-up" half.

### Proposal

- **What it shows:**
  - one example session, drawn with the app's own pieces;
  - the session's drawing and its name;
  - three lifts, each with sets × reps and a weight, as Train shows them.
- **It says it's an example:** "An example day. Yours is built from your
  answers."
- **Fixed sample data:** no account, no network, nothing stored.
- **Large text:** it has to pass `largeText.capture.spec.ts` at 320 px with
  2× text, like the rest of sign-up.

### The owner's call

- **Call 5, the shape.** One prototype variant each:
  - **A, "One session":** the three rows become one example session card.
  - **B, "Swipe a week":** three pages to swipe through: a lift with its sets,
    a week of lifts and runs, a day's food target.
  - **C, "Rows that open":** the three rows stay, and each opens to show its
    example.

**My recommendation:** pick from the captures. On paper, C keeps what the
three rows say, that Tropos plans all three, and adds the example without
making the screen longer until someone asks.

---

## 3. A partner's week

### What exists

- **Partner bonds (Soc6, `src/features/partnerStreak/`):**
  - two people who follow each other start a shared streak;
  - a day counts when both train;
  - up to 5 partners;
  - the profile shows the streak.
- **The friends board (Polish2 call 5):** weekly totals for people who chose
  Show my week, ranked by sessions.
- **The data a week needs doesn't exist yet:**
  - a bond keeps each person's **last** active day only (`lastActive`);
  - the board keeps **totals** for the week, not days.

### What other apps do

- **Hevy:** compares you with one friend over 30 days: workout count, and
  which muscles each of you trained.
- **Runbuds:** races two people's weekly distance on a track.
- **Slopes:** compares a day with the friends you rode with.
- **Three apps, none the same shape:** a weaker signal than features 1 and 2.

### Proposal

- **Where:** on Together, and on a bonded partner's profile.
- **What:** a card per partner showing this week, Monday to Sunday:
  - you and them, a mark for each day each of you trained;
  - the days you both trained, which are the streak's days, joined.
- **Data:**
  - the bond keeps each member's active days for its current week;
  - only the server writes them, from the trigger that already advances the
    streak (`partnerStreakPersist.js`);
  - they're cleared when the week turns;
  - the account-deletion sweep already removes bonds.
- **Privacy:**
  - a partner already learns, from the streak, that you trained today;
  - a week of days tells them little more;
  - what you did and how much is call 6.

### The owner's calls

- **Call 6, what a partner sees:**
  - A, days only;
  - B, days and the sport (lift or run);
  - C, days, sport and the week's totals.
- **Call 7, the shape.** One prototype variant each:
  - **A, "Two rows":** your week and theirs, a column a day, the shared days
    joined.
  - **B, "Against your own plans":** each of you against your own plan this
    week, the way the league scores (Soc15 call 3), so a 2-day lifter and a
    5-day runner meet on equal terms.
  - **C, "Last 30 days":** Hevy's comparison: sessions, time, distance.

**My recommendation:**

- **6B with 7A**, or **7B** if the two-row week reads as a contest the
  lighter trainer always loses. B is the only shape that's fair to a
  light-trainer, which CLAUDE.md asks every design to be.
- **Build features 1 and 2 first.** This one needs a server change, and the
  evidence for it is the thinnest.

---

## The prototypes

Each variant swaps only the part being tested inside the real screen. The
rest of the screen is real.

| Feature            | Where                     | Variants                                                 |
| ------------------ | ------------------------- | -------------------------------------------------------- |
| 1, Go easier today | Home, `/?variant=A` (add `&reason=0` for a day with no reason) | A only with a reason · B always a choice · C morning question |
| 1, the rules       | `docs/prototypes/easier-today-rules.html` | one file: press buttons, see which reason shows and what the easier session is |
| 2, Example day     | the welcome screen, `?variant=A` | A one session · B swipe a week · C rows that open |
| 3, Partner's week  | Social → Together, `?variant=A` | A two rows · B against your own plans · C last 30 days |

- **Switching variants:** a bar at the bottom of each screen (← and → also
  work) changes the variant.
- **When the bar shows:** only in a dev build, or in a build made with
  `VITE_PROTOTYPES=true`.
- **Screenshots:** `sheet-easier.png`, `sheet-welcome.png` and
  `sheet-partner.png` beside this file, at 393 px, captured against the
  emulator rig with `VITE_PROTOTYPES=true`.
- **The data is stub data throughout:**
  - the partner, the reasons and the example session;
  - none of it is read from, or written to, Firestore.
