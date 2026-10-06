# How the best fitness apps explain training, and what Tropos should take from it

Researched 2026-10-06 for the owner's question: _"you go into running and it says easy, hard, strides, all this stuff, and it's not explanatory what this actually is. I don't understand why or how something like Strava may do it. How do they do it? What do other people do?"_

Scope: how apps explain session types, effort targets, plan structure and why a plan changed. Pricing and feature teardowns are in `docs/competitive-analysis-running-2026.md` and aren't repeated here.

> Integrated 2026-10-06 into `docs/training-engine-2026-10/`. Planning
> material, not a lock. Verification status, corrections and read order:
> [README.md](README.md).

---

## Read this first: method and limits

- **I couldn't read any page directly.** WebFetch was refused by the egress proxy on every domain I tried (support.runna.com, runna.com, dcrainmaker.com, support.garmin.com, support.apple.com, wikipedia.org). Reddit was blocked for both tools. Every finding below comes from WebSearch extracts of the cited pages. Short quotes are as the search tool returned them: treat them as near-verbatim and re-check any UI copy before reusing it.
- **The search budget ran out partway through the lifting apps.** All agents in this turn share a cap of 200 web searches. I covered Runna, Strava, Nike Run Club, Garmin, COROS, TrainingPeaks, Apple, Polar, Kotcha, Type to Run, V.O2 (Daniels), Hevy, Strong and Fitbod. I did not cover JuggernautAI, RP Hypertrophy, Alpha Progression, Boostcamp, MacroFactor Workouts, Gravl or Liftosaur. Edge is covered only through the repo's existing analysis. §8 lists what to check next.
- **Some sources have a stake in the answer, and they are flagged where cited:** dr-muscle.com sells a Fitbod competitor, findyouredge.app is Edge's own blog, and coachleo.ai is a vendor. Where the search tool merged several sources into one extract, I cite every page that could be the origin and say so.
- Every claim carries a link tag such as [RN-conv]. Each tag resolves to a URL in the Sources list at the end.

---

## 1. The short answer to "how does Strava do it?"

**Mostly, Strava doesn't explain training itself. Runna does it for them.** Strava's help centre says its running training plans are now powered by Runna, which Strava bought in 2025 [ST-plans]. Strava's own explanation layer is Athlete Intelligence, an AI summary shown after an activity. Reviewers called it "bland pep talks" [FORBES-ai], and users called it "stating the obvious" [STW-forum].

**Runna explains each session in five places, and each place does one job:**

1. **The session is a list of steps, each with a target written in body terms plus a number.** For example: a warm-up of "800m at conversational pace, no faster than 7:15/km", then the set, then "90s walking rest" [RN-workouts].
2. **An easy run gets a speed limit, not a target.** For conversational pace the app shows "no faster than" a given pace. It's described as one of the app's "most-loved features" [TG-runna] [TG-easy] [RN-blog-easy]. _(The phrase may come from Runna's own blog rather than Tom's Guide; the extract didn't say which.)_
3. **A Workout Briefing arrives the day before.** It covers the session's focus, coaching tips, what the last workout showed, weather, hydration and "where this session fits within your training cycle" [RN-brief].
4. **A definitions library sits behind the sessions:**
   - conversational pace means you can "speak in full sentences" [RN-conv]
   - a tempo run means short phrases at 7–8/10, intervals are 8–9/10 [RN-tempo-int] [RN-thresh]
   - strides have their own article [RN-strides]
   - there's a coaching-terms glossary [RN-terms] and a "Training methods and sessions explained" collection [RN-methods]
5. **Changes come as named statuses that need your yes.** Pace Insights reports "Pace on Point", "Ahead of the Pack" and so on, and "never automatically change your training paces without your input" [RN-pi]. Adapt for Heat is a suggestion you accept or turn down [9to5-heat].

**Two other apps take different routes:**

- **Nike Run Club uses effort words instead of numbers.** Coach Bennett: "Easy is an effort, it's not a pace" [GP-nrc]. Its plans define every pace as an effort out of 10, anchored to a race you could run: "5K pace … the pace you could race or run hard for about 3 miles", 7–8 out of 10 [NRC-10k].
- **Garmin attaches three short lines to each suggested workout:** what it's for, how to do it, and why it changed ("…due to high run mileage") [5kr-adaptive].

The owner's complaint is that sessions are named but never explained. The best apps answer it with a name that says what you'll do, one line on how it should feel, and the why one tap away.

---

## 2. Running apps

### 2.1 Runna (Strava-owned since 2025)

**(a) Session names.** Easy run, long run, intervals, tempo, hill reps, race, parkrun [RN-instant] [RN-workouts]. Runna deliberately doesn't name sessions "threshold". It uses "intervals" and "tempo runs" because "threshold is a physiological term, not a session structure" [RN-tempo-int] [RN-thresh]. _(The search tool merged two Runna articles into this extract; either may be the origin.)_

**(b) Where the explanation lives:**

- **The step list with targets.** Every workout has warm-up, main set, recoveries and cool-down [RN-workouts].
- **The Workout Briefing, from the day before.** Contents: "key workout focus and coaching tips, insights from your previous workout, weather guidance, hydration and nutrition tips, and plan context". Runna says no two people get the same briefing [RN-brief].
- **Audio pace feedback during the run** [RN-workouts] [TG-runna].
- **Workout Insights after the run.** Rating the run thumbs-up or thumbs-down unlocks AI feedback on "what went well and what you could improve for next time" [RN-insights].
- **The laps chart.** It draws your pace for each stage against a dark band marking Runna's target [RWH-stats].
- **The help-centre glossary and the "sessions explained" collection** [RN-terms] [RN-methods].

**(c) Representative copy:**

- **Easy / conversational.** "slow enough that you can speak in full sentences and hold a conversation". It adds a directions test: "If someone stopped you asking for directions, would you be able to speak to them or would you need a minute to catch your breath?" Runna also notes that what feels easy for 5 km may not for 20 km [RN-conv]. Easy pace is "deliberately conservative: the goal is effort control, not speed" [RN-easy]. _(Merged extract from Runna's conversational-pace and easy-runs articles.)_
- **Strides.** 3–4 × 80–100 m (or 15–25 seconds), building to about 90% effort, "relaxed and smooth", walking or jogging back for full recovery. Strides "should feel fast and controlled, not maximal" and always come after a warm-up or easy running [RN-strides].
- **Tempo.** "Longer, sustained efforts performed below your lactate threshold, usually as one continuous block". The aim is to hold a "comfortably hard" pace at 7–8/10. It's described elsewhere as a pace where "you can speak in short phrases, but not hold a full conversation" [RN-tempo-int] [RN-thresh] [RN-tempo].
- **Intervals.** "Shorter, harder efforts … with a walking or static recovery between reps", 8–9/10 [RN-tempo-int].
- **Recovery run.** "Slow, easy runs that help your body recover from harder workouts" [RN-terms].
- **Build week and deload week.** A build week is "a training week where your overall load increases compared to the previous week". Plans run "build, build, deload", and "the deload weeks are what allow the build weeks to keep working" [RN-build].

**(d) How effort is expressed.** Pace ranges by default, with the target pace in the middle of the range [RN-workouts]. Easy runs get a ceiling instead [TG-easy]. There's an RPE mode, in which workouts "guide you based on effort level (e.g., RPE 4) instead of exact paces" [RN-rpe] [RN-units]. A third-party guide adds two details [RWH-rpe]:

- Runna can recommend RPE for a single session on the day; accepting applies only to that run.
- It suggests switching when you're fatigued, in heat or wind, on hills or trails, at altitude, or coming back from illness.

**(e) How plan structure is shown.** The briefing's "plan context" says where the session sits in the training cycle [RN-brief], and the build/deload articles explain why a week differs [RN-build]. The 2026 beginner plans start with time-based walk–runs and switch to distance "only … once runners are ready" [RN-beginner]. The app can also remove pace targets for 3–14 days [EB-beginner] [RN-beginner] _(merged extract; either may be the origin)_.

**(f) How adaptive changes are communicated:**

- **Pace Insights,** after any session with pace targets. Four statuses [RN-pi] [RN-pi-rec]:
  - "Pace on Point" — on track
  - "Ahead of the Pack" — tap "View update"
  - "Let's Review Your Pace" — "A pace decrease may make training more effective and enjoyable"
  - "Variable Pace Detected" — "Runna can't make a recommendation just yet as your results have been mixed"

  Runna states that "Pace Insights never automatically change your training paces without your input."

- **Adapt for Heat (July 2026).** The suggestion appears the day before or on the day. You pick the hour you'll run from a colour-coded forecast, review the change, and accept it or keep the original [9to5-heat] [5kr-heat] [RN-heat-press]. Possible changes:
  - slower targets, chosen so the session still does the same job
  - "Lower the conversational pace ceiling on easy runs"
  - a structured long run swapped for a conversational one
  - advice not to run outside in extreme heat
- **The5krunner's description:** "coach-written plans, adjusted by an algorithm, with AI features added on top". The predicted race time updates as fitness changes [5kr-ai].

**(g) What users complain about:**

- Distance "way too fast", long-run paces too quick, speed sessions "too spicy" early on [TP-runna] [JUA-runna] [RWH-problem].
- "Pacing targets that don't reflect daily fatigue" [TP-runna] [JUA-runna] [RWH-problem].
- Pace prompts that "switch every .25 to .10 miles" [JUA-runna].
- Menus that are "kind of confusing at times" [JUA-runna].
- Reported injuries led Runna to add ways to "tone down plans" [AOL-strava] [5kr-injury].
- **Telling detail:** Runna needed two help articles to separate tempo, interval and threshold [RN-thresh] [RN-tempo-int]. The category labels alone didn't carry the meaning.

### 2.2 Strava

**(a)/(b) Session names and explanations.** New running plans are powered by Runna [ST-plans], and Runna is one of 14 apps feeding workouts into Strava since May 2026 [ST-may26]. Strava's own explanation surface is **Athlete Intelligence**. Strava says it "translates workout data into simple and personalized insights" covering pace, heart rate, elevation, power and Relative Effort, with trends over the past 30 days [ST-ai-press].

**(c) Representative copy.** Viral examples include the AI telling a cyclist who had crashed into a door and needed an ambulance, "Despite the setback, your activity data shows you're a consistent, well-rounded athlete—keep up the great work!" [FORTUNE-ai].

**(d) How effort is expressed.** Relative Effort, a heart-rate-zone-weighted score [ST-re].

**(e) Fitness & Freshness:** fitness is a 42-day weighted load, fatigue a 7-day one, and form is the difference between them. Strava's own gloss: "You'll notice the score go up quickly after a couple hard days, but also go down quickly as you take a few days off" [ROADCC-ff] [RCUK-ff].

**(g) What users complain about:**

- "Bland pep talks" [FORBES-ai].
- "A mix of stating the obvious, making incongruous comparisons and being wrong about zones and efforts" [STW-forum].
- "An utterly pointless application of an LLM — it took my activity title & description and regurgitated it back to me" [STW-forum].
- "Great effort" on warm-up runs [ST-community] [STW-forum].

### 2.3 Nike Run Club

**(a) Session names.** Recovery run, speed run (intervals, fartlek, hills, tempo), long run and tempo run [NRC-mar].

**(b) Where the explanation lives:**

- **Audio-guided runs.** Coach Chris Bennett wrote the scripts ("the first run, the next run, the first speed run and the comeback run") and "pops in and out at certain distances" [NPR-nrc].
- **A "know your paces" glossary in each training plan** [NRC-10k] [NRC-5k] [NRC-mar].

**(c) Representative copy, from the plan PDFs:**

- **Recovery pace.** "A pace easy enough that you can talk, laugh or argue freely while running", 4–5/10 [NRC-10k] [NRC-mar].
- **Pace ladder by effort:** mile pace 9/10 ("the pace you could race or run hard for one mile"), 5K pace 7–8/10, 10K pace 6–7/10 [NRC-10k].
- **Tempo.** "A hard but controlled pace … Teaching your body to be comfortable being uncomfortable … close to 30-35 seconds slower than your 5K pace", 6/10 [NRC-mar].
- **Recovery days.** "Run easy and based on how you feel to help you recover" [NRC-mar].
- **Fartlek written in the effort language,** e.g. "2 x 1:30 10K Pace, 3 x 1:00 5K Pace, 4 x 0:30 Mile Pace, 5 x 0:15 Best Pace" [NRC-10k].

**(d) How effort is expressed.** Words and effort out of 10, anchored to race distances, not minutes per kilometre. "Easy is an effort, it's not a pace" [GP-nrc]. A reviewer adds: "It's never about running a 9-minute mile pace … it's always about running at your 3 out of 10 or your 6 out of 10" _(reviewer's description; origin unclear between [GP-nrc] and [HS-nrc])_.

**(f) Adaptation.** NRC's coaching is pre-recorded and doesn't adapt to performance (per the repo's analysis, [REPO-comp]).

**Note.** NRC's tempo is 6/10 and Runna's is 7–8/10. Effort numbers don't transfer between apps; the words do.

### 2.4 Garmin (Daily Suggested Workouts, Garmin Coach, Training Status, Readiness)

**(a) Session names come from what the workout trains:** base, tempo, threshold, VO2 max, anaerobic, sprint and recovery [GA-dsw] [GA-dsw-nz]. Suggestions draw on VO2 max, Training Status, acute and chronic load, recovery time, sleep and, on supported devices, Training Readiness [5kr-dsw]. Garmin's own blog says you won't see sprint suggestions "if you have a significant amount of recovery time remaining" [GA-dsw].

**(b)/(f) Where the explanation lives: what / how / why (since November 2024).** "Each suggested workout is explained to you – thus, you will be told what the workout is trying to achieve, how you have to do it and why the change has been suggested" [5kr-adaptive]. Examples:

- **What:** "Build up your base endurance".
- **How:** "Keep it short and low-intensity", or "Active recovery or rest is suggested for the remainder of today".
- **Why:** "…due to high run mileage", "…due to high recovery time".

**(c) Status copy, each label paired with an action** [GA-status-man] [GA-status-blog]:

- **Maintaining.** "Your current training load is enough to maintain your fitness level. To see improvement, try adding more variety to your workouts or increasing your training volume."
- **Unproductive.** "Your training load is at a good level, but your fitness is decreasing. Your body may be struggling to recover…"
- **Overreaching.** "…Your body needs a rest."
- **Peaking.** "You're in ideal form."

**Training Readiness labels** [GA-ready-man]: Prime "Best possible"; High "Ready for challenges"; Moderate "Good to go"; Low "Time to slow down"; Poor "Let your body recover".

**(d) How effort is expressed.** Target pace or heart-rate ranges, with a heart-rate-guided option [GA-dsw-nz]. After a run, Training Effect scores aerobic and anaerobic load from 0 to 5 under a "primary benefit" label [5kr-te].

**(e) Plan structure.** Garmin Coach plans adapt to performance and recovery data [5kr-adaptive].

**(g) What users complain about:**

- **"Unproductive" after a run that felt great.** Forum threads: "Great run but vo2 max down and unproductive?!?", "Unproductive training status but V02 max increasing", "Training Status Confusing" [GF-unprod1] [GF-unprod2] [GF-confusing] [GF-advice]. Users report getting the label regularly in heat (25 °C and above), even though Garmin says the feature accounts for heat and altitude [GF-unprod2] [TG-status].
- **Opaque adaptation in Garmin Coach.** A Garmin Coach user asked for a separate difficulty field to be dropped in favour of the watch's Perceived Effort. They said there was "no indication of what the plan was adapting to" [GF-coach].
- **Readiness that sits low.** Third-party "always low or stuck at 1" fix guides exist [GNETA-ready].
- **Thin AI insights.** Garmin Connect+ "Active Intelligence" puts an LLM summary at the top of the Home view [AC-gc+]. A one-year review says it "continues to restate thin insights" [5kr-gc+].

### 2.5 COROS (EvoLab, Training Hub)

**(a)/(d) Zone names describe what the zone trains:** Recovery, Aerobic Endurance, Aerobic Power, Threshold, Anaerobic Endurance, Anaerobic Power, all set from threshold pace [CO-zones]. Two examples:

- **Zone 1:** "very low intensity allowing comfortable breathing and conversation".
- **Zone 2:** "you can still hold a conversation but feel a steady effort that can be sustained for multiple hours" [CO-zones].

_(The extract for zones 3–6 mixed in cycling-power figures, so those descriptions aren't quoted.)_

**(e) Plan structure.** The Training Hub projects how planned workouts will change Base Fitness and fatigue before you do them [CO-hub]. Plans are built in Base, Build and Peak phases [CO-phases]. Structured workouts are "a series of steps designed to target specific intensity zones" [CO-struct].

### 2.6 TrainingPeaks

**(b) Where the explanation lives.** The athlete sees a picture of the workout's shape: "Athletes will quickly be able to see workout elements like warm-up, main set, and cool-down, and no longer will they have to read lengthy descriptions just to get a sense of what is prescribed" [TPK-builder]. A coach's description and pre/post-activity comments sit beside it [TPK-guide].

**(f) Planned against done, shown as colour:**

- green: within ±20% of plan
- yellow: 50–79% or 121–150%
- orange: further off
- red: missed
- grey: unplanned

[TPK-guide] [BC-colors]

### 2.7 Apple Workout app (watchOS 11 and 26)

**(d) How effort is expressed.** After a workout you rate effort from 1 to 10 under four labels [AP-wos11] [PL-load]:

- **Easy** (1–3)
- **Moderate** (4–6)
- **Hard** (7–8)
- **All Out** (9–10)

For cardio workouts the watch estimates the rating, and you can adjust it for stress or soreness.

**(e) Training Load.** It compares your last 7 days with your last 28: "well below, below, steady, above, or well above" [AP-wos11] [PL-load].

**(b) Workout Buddy (watchOS 26).** Generated voices of Fitness+ trainers speak in three phases: a **Pep Talk** at the start, **Alerts & Milestones** during, and a **Walk Off** summary at the end [DCR-wos26]. Example lines: "You're halfway there, keep it up," and "You just ran your fastest mile this week" [AI-buddy] [AP-wos26].

### 2.8 Polar

**(c) After the workout, Training Benefit says what the session did** [PO-tb] [PO-tb2]:

- **Recovery training:** "Very nice session for your recovery. Light exercise like this allows your body to adapt to your training."
- **Steady state & basic training, long:** "Excellent! This long session improved the endurance of your muscles and your aerobic fitness…"
- **Tempo training:** "Great pace! You improved your aerobic fitness, speed, and ability to sustain high intensity effort for longer."
- **Maximum training:** "That was a hard session! You improved your sprint speed…"

**(e) Plan structure.** The Running Program has three named phases: Base building, Build-up and Tapering [PO-rp] [PO-rp-man] [PO-rp-blog].

- Base building runs in four-week cycles of three progressive weeks and one lighter week.
- After each cycle the program suggests whether to stay at the same level or change.
- Build-up uses two progressive weeks and one lighter week.

There are five session types: easy jog, medium run, long run, tempo run and interval. Each has a warm-up, work and cool-down, with heart-rate zone prompts such as a 14-minute warm-up in zones 1–3 [PO-rp-man].

### 2.9 Newer entrants (2025–2026) and V.O2

- **Kotcha** launched on 23 October 2025 (one listicle says late 2024), co-developed with Eliud Kipchoge and the NN Running Team, with four AI coach personas [MH-kotcha] [AS-kotcha].
  - A session shows a title ("Progressive Run"), total time, pacing written as instructions ("run easy for 20 min, then build effort") and a note from "Coach K".
  - Every Sunday it reviews the week and writes the next one. A run rated very hard changes what follows [GR-kotcha].
- **Type to Run Weekly Coach** is a chat-based planner that syncs to Garmin. It explains its reasoning, asks how training went, and lets you question its decisions. The5krunner contrasts this with Garmin "silently manipulating your schedule based on overnight HRV" [5kr-ttr].
- **Others:** Coach Leo, Coopah, Athletica and TrainAsONE market conversational or adaptive coaching. I didn't examine them [RG-ai].
- **V.O2 (Jack Daniels' app)** uses letter codes: E, M, T, I, R. It defines each, for example: Easy is "conversational in nature … 60-80% effort", and Repetition is short work at "about 1500m or mile race pace" with full recovery, "to improve speed and running economy" [VO2-defs] [VO2-easy] [VO2-rep]. The letters only make sense to someone who has read the definitions.

---

## 3. Lifting apps

### 3.1 Hevy

- **(b)/(d) The last session sits beside every set.** A PREVIOUS column shows what you did last time, so "you can see your previous performance at a glance throughout your current session". It includes last time's effort rating ("50lbs x 10 @ 8.5 RPE") [HV-prev] [HV-prev-help].
- **The effort picker explains each value.** Optional RPE logging uses a 6–10 scale where each number carries "a brief description indicating the number of reps in reserve" [HV-rpe] [HV-prev].
- **(f) Hevy Trainer (algorithmic, "do not rely on AI").** It sets rep ranges, rest times, starting weights and "helpful tips". It "will let you know when to increase your weight and by how much", gives "gentle reminders to maintain intensity if progress stalls", and lowers weights when you slip back [HV-trainer] [HV-trainer-help] [HV-announce].
- **The progression rule is easy to state.** You must reach the top of the rep range at the prescribed weight on every set before the weight goes up. _(This is a third-party description of the rule [AF-po].)_

### 3.2 Strong

- **(b)** "The last available set will be displayed right below your current set, so you can decide whether to match or even up the intensity" [STRONG].
- **(d)** Optional RPE (5–10) or reps in reserve logged after each set [STRONG].
- I found no progression feature in what I could see, so the numbers are the only explanation.

### 3.3 Fitbod

- **(e) Recovery model.** Every muscle group gets a recovery percentage from 0 to 100, based on recent sets, reps and load. 80–100% counts as "fresh", and fresher muscles are chosen first [FB-recovery].
- **(f) Explaining a lower number: a help article, not in-app copy.** Fitbod's help centre explains that when recommended weights fall, it's "usually because the session is meant to be lighter … a lighter day is part of the pattern rather than a mistake". After a break it lowers weights on purpose [FB-creates] [FB-section] [FB-break].
- **(g) What users complain about:** workouts that "feel randomized", odd exercise order, weight suggestions that are off ("I think fitbod is training me for cirque du soleil") [JUA-fitbod] [TR-fitbod] [DRM-fitbod]. _DRM-fitbod is written by a competitor._

The lesson matches what Lift4 found: a number the person didn't choose reads as a bug unless something says why.

---

## 4. Hybrid

- **Edge** says it models training interference, for example "a hard leg day affects your run the next day", and has human coaches reply in-app [REPO-comp], [EDGE].
- Edge's own blog ranks it first among AI coaches for rebuilding "the rest of your week" after a session [EDGE-ai] _(vendor claim)_.
- I found no app that explains the lift–run interaction at the moment it changes a session. Edge markets it as a capability. Lift4 already plans for it: a leg trim during a race build, and "heavy legs before a long or key run is a note in 'Why this session'".

---

## 5. Pattern library: what the best apps do repeatedly

Counts follow the repo's grilling rule. When 3 or more reference apps do something the same way, Tropos should match it unless it has a stated reason not to.

**P1. Effort first in body terms, with a number second.** The talk test, effort words, effort out of 10, or a race you could run at that pace.

- Who: Runna ("full sentences", "short phrases", 7–8/10) [RN-conv] [RN-tempo-int]; NRC ("talk, laugh or argue freely", 4–5/10; "5K pace") [NRC-10k]; Apple (Easy / Moderate / Hard / All Out) [AP-wos11]; COROS Zones 1–2 ("hold a conversation") [CO-zones]; V.O2 ("conversational") [VO2-easy]; Hevy and Strong for lifting (reps in reserve words on the RPE scale) [HV-rpe] [STRONG].
- Count: 6+.

**P2. The session name says what you'll do, and a definition is one step away.**

- Who: Runna (plain names, a briefing, a glossary) [RN-brief] [RN-terms]; Garmin (what / how / why lines) [5kr-adaptive]; Kotcha (title, total time, pacing in words, coach note) [GR-kotcha]; NRC (a glossary in every plan) [NRC-10k].
- Runna avoids naming sessions after physiology ("threshold") [RN-tempo-int].
- Count: 4.

**P3. Show the session's shape as steps, each with its own target.**

- Who: Runna [RN-workouts]; TrainingPeaks (a picture, "no longer … lengthy descriptions") [TPK-builder]; Polar (warm-up, work and cool-down with zone prompts) [PO-rp-man]; COROS [CO-struct]; Apple custom workouts [AP-wos26].
- Count: 5. Tropos already does this (`runSegments.ts`).

**P4. An easy run gets a ceiling, not a target.**

- Who: Runna's "no faster than", and its heat feature lowers that ceiling [TG-easy] [9to5-heat]. NRC frames the same idea as "Easy is an effort, it's not a pace" [GP-nrc].
- The principle is universal; the ceiling-as-UI is explicit only in Runna.

**P5. Explain the purpose before the run, give instructions during it, and say what it did afterwards.**

- Who: Runna (briefing / audio / Workout Insights) [RN-brief] [RN-insights]; Apple (Pep Talk / Alerts / Walk Off) [DCR-wos26]; NRC (guided audio) [NPR-nrc]; Polar (Training Benefit afterwards) [PO-tb]; Garmin (benefit label before and after) [5kr-te].
- Count: 5.

**P6. A change arrives as "what changed, because why, and your call".**

- Who:
  - Runna Pace Insights: statuses, consent, and a "can't tell yet" state [RN-pi]
  - Runna Adapt for Heat: accept or keep the original [9to5-heat]
  - Garmin: "…due to high run mileage" [5kr-adaptive]
  - Hevy Trainer: a rule you can state [HV-trainer]
  - Kotcha and Type to Run: they ask how training went [GR-kotcha] [5kr-ttr]
  - Fitbod: explains in its help centre [FB-creates]
- The counter-example is Garmin Coach: "no indication of what the plan was adapting to" [GF-coach].
- Count: 5+.

**P7. Name the week's job in plain words, with one reason.**

- Who: Runna (build and deload weeks; "plan context") [RN-build] [RN-brief]; Polar (named phases, a lighter week every fourth week, a check-in after each cycle) [PO-rp]; COROS (phases) [CO-phases]; Garmin (adaptive plans) [5kr-adaptive].
- Count: 4.

**P8. A status word always comes with an action.**

- Who: Garmin Training Status ("To see improvement, try…") [GA-status-man]; Garmin Readiness ("Time to slow down") [GA-ready-man]; Apple Training Load ("steady", "above") [PL-load]; Runna Pace Status ("Focus on hitting your pace targets and staying consistent!") [RN-pi].
- Count: 3+.

**P9. Running by feel is an option when conditions make pace targets meaningless.**

- Who: Runna (RPE mode, a recommendation for one session, heat adjustment, beginner plans with pace targets switched off) [RN-rpe] [RWH-rpe] [9to5-heat] [EB-beginner]; Garmin (heart-rate-guided suggestions) [GA-dsw-nz]; NRC (effort-only by design) [GP-nrc].
- Count: 3.

**P10. For lifting, last time's numbers sit beside today's so the numbers explain themselves.**

- Who: Hevy's PREVIOUS column with last RPE [HV-prev]; Strong's previous set under the current one [STRONG]; Hevy Trainer's single stated rule [HV-trainer].
- Count: 3. This is Lift4's "Last:" decision.

---

## 6. Anti-patterns

1. **Physiology names used as labels with no definition in body terms.** Examples: Garmin's "Anaerobic" and "VO2 Max" [GA-dsw], COROS's "Aerobic Power" and "Anaerobic Endurance" [CO-zones], V.O2's E/M/T/I/R [VO2-defs]. Runna deliberately avoids "threshold" as a session name, and still needed help articles to separate tempo, intervals and threshold [RN-tempo-int] [RN-thresh].
2. **AI summaries that repeat the data back.** Strava's are "bland pep talks", "stating the obvious", and say "great effort" on warm-ups [FORBES-ai] [STW-forum] [ST-community]. Garmin's Active Intelligence "restate[s] thin insights" [5kr-gc+]. This is the most visible failure in the category.
3. **Silent adaptation.** Garmin Coach: "no indication of what the plan was adapting to" [GF-coach]. The opposite failure is a reason under every changed number, which Lift4 already declined.
4. **A verdict that contradicts what the person felt, without saying why.** Garmin's "Unproductive" after a great run, often caused by heat [GF-unprod1] [TG-status], and readiness that stays low [GNETA-ready]. This supports the roadmap's non-feature: no readiness score.
5. **Too many cues.** Runna's pace prompts switch every 0.1–0.25 miles [JUA-runna].
6. **Fixed pace targets with no way out.** "Pacing targets that don't reflect daily fatigue" [TP-runna]. Runna answered with RPE mode and Adapt for Heat.
7. **Numbers that move with no explanation in the app.** Fitbod's lighter days needed a help-centre article [FB-creates]; Lift4 records the same lesson for "60 kg × 12".
8. **Praise in place of an explanation.** Polar's benefit texts open with "Excellent!" and "What a session!" [PO-tb]; Strava's AI says "keep up the great work!" [FORTUNE-ai]. Tropos's voice guide already bans this. Polar's useful half is the part after the praise: what the session did.
9. **Effort numbers that disagree.** NRC's tempo is 6/10, Runna's is 7–8/10 [NRC-mar] [RN-tempo-int]. Across apps this is unavoidable; inside one app, keep one scale and let words lead.

---

## 7. Recommendations for Tropos

### 7.0 Where Tropos is today (checked in the code, read-only)

- **The "why this session" line exists, but only on race plans.** `src/lib/runSessionExplainer.ts` is wired into Home (`DayPeekCard`), Train (`ProgrammeRunSection`, `DayActionSheet`) and `Run.tsx`. It returns `null` without race context, so a runner with no race date sees no reason for "Easy 30 + strides".
- **Session names say how much, not what or why** (`src/lib/workoutTemplates.ts`): "Easy 30", "Easy 30 + strides", "20 Min Tempo", "4×1K Intervals", "8×400m Speed", "Long 10K", "Medium-long 75".
  - Descriptions mix effort words with jargon: "4 reps of 1 km hard with 90s rest" (hard isn't defined), "aerobic base", "aerobic depth", "marathon aerobic depth", "half-marathon specific", "time on feet".
  - The explainer itself uses "threshold pace", "ramps volume" and "top-end economy".
  - Some of its lines are already strong: "Easy day — it makes the hard days work. If it feels too easy, it's right." and "The recovery between reps is part of the session, not a failure of it."
- **Easy runs show a two-sided pace range, or nothing.** When the runner has a fitness benchmark, easy and long runs display the whole easy band. The chain is `resolveSessionPaces` → `band: paceTable.easy` → `sessionPaceDisplay` → "5:25–5:45 /km". That reads as a target to hit, not "slower is fine". Without a benchmark no pace shows at all. So for a new user the description ("Conversational pace — recovery day") is the only guidance, which makes the feel line the most important line in cold start.
- **Internal step types leak into the run screen as headings.** `IntervalStepShell.tsx` falls back to `seg.type.toUpperCase()` when a step has no rep count. A single-block tempo shows **MODERATE** over an instruction that says "Comfortably hard — hold the rhythm", which is two effort words for one block. Warm-up and cool-down show **WARMUP** and **COOLDOWN**.
- **Audio cues are already plain and good** (`runCueCopy.ts`): "Stride 2 of 4. Quick feet, easy face.", "Easy running. Conversational pace — strides at the end."
- **The pace-change card already matches Runna's consent model** (`PaceInsightCard`): "Your recent runs support faster targets" / "Your saved targets may be too quick right now".
- **Possible inconsistency to check.** `ProgrammeRunSection` renders "Base · week N of M". GLOSSARY's "Phase disclosure" entry says the run tab hides base and build and names only the taper. This research doesn't settle that; it's flagged so a future grill reads both.

### 7.1 The rule: Lift4's principle carried over to running

> **If the session's name and its one feel line tell you what to do, the app says nothing more. Why it's in your week is one tap away. A change the person didn't make gets one line, on the session it changed.**

This is Lift4's rule ("if last time's sets explain the new number, the app says nothing; if they can't, it says one line") applied to sessions. It matches the evidence: names that do the work (P2), definitions one step away (P2, P7), changes as one line with a reason (P6). It avoids both failures: silent adaptation (anti-pattern 3) and repeated summaries (anti-pattern 2).

### 7.2 One effort language for both sports, words first

A beginner without a watch needs an effort they can feel. The talk test is the one cue every app agrees on (P1). Numbers disagree between apps (anti-pattern 9), so words lead and "/10" is secondary.

| Word (shown)          | Talk test (shown)                                     | About        | Used for                                 | Evidence                                                                                   |
| --------------------- | ----------------------------------------------------- | ------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Easy**              | You can talk in full sentences.                       | 3–4/10       | easy, long, recovery, warm-up, cool-down | Runna "full sentences" [RN-conv]; NRC 4–5/10 [NRC-10k]; Apple Easy 1–3 [AP-wos11]          |
| **Steady**            | You can talk, in shorter sentences.                   | 5–6/10       | progression finishes, marathon-pace work | Apple Moderate 4–6 [AP-wos11]; NRC 10K pace 6–7/10 [NRC-10k]                               |
| **Comfortably hard**  | A few words at a time.                                | 7/10         | tempo                                    | Runna "short phrases", 7–8/10 [RN-tempo-int]; NRC tempo 6/10 [NRC-mar]                     |
| **Hard**              | No chatting, but you could hold it for a few minutes. | 8–9/10       | intervals                                | Runna 8–9/10 [RN-tempo-int]; NRC 5K pace 7–8/10 [NRC-10k]                                  |
| **Quick and relaxed** | Fast but smooth, not a sprint.                        | short bursts | strides, short reps                      | Runna strides "fast and controlled, not maximal", ~90% [RN-strides]; V.O2 R pace [VO2-rep] |

- **The hybrid angle no running app has.** Lift4 already calls lifting effort "reps to spare". On a run, the talk test is the same idea: how many words you have to spare. One line in the effort sheet can say so: _"On a lift, reps to spare tell you how hard a set was. On a run, it's how much you can say."_ Keep Lift4's words exactly as locked; this only makes running parallel.
- **Use these words everywhere:** on cards, in sheets, in audio and in the run screen's step headings. That replaces MODERATE, HARD and WARMUP (§7.0).

### 7.3 Names that say what you do, plus one feel line

Draft copy, run past `docs/voice-and-tone.md` before shipping. Template ids stay; only names and the visible line change. Units follow the house style ("30 min", "400 m", "6:10 /km").

| Template today                                       | Proposed name                   | Feel line on the card                                                              | "Why it's in your week" (no race needed)                                                                                    |
| ---------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Easy 30 · "Conversational pace — recovery day"       | **Easy run · 30 min**           | Easy: you can talk in full sentences. Slower is fine.                              | Keep today's line: "Easy day — it makes the hard days work. If it feels too easy, it's right."                              |
| Easy 30 + strides                                    | **Easy run + strides · 30 min** | Easy, then 4 strides: 20 seconds quick and smooth, walk back between.              | Strides keep your legs used to running quicker, at almost no cost. Not a hard session.                                      |
| 20 Min Tempo                                         | **Tempo · 20 min**              | Comfortably hard: a few words at a time. Even from start to finish.                | Teaches you to hold a strong pace for longer.                                                                               |
| 4×1K Intervals · "4 reps of 1 km hard with 90s rest" | **Intervals · 4 × 1 km**        | Hard, and even: the last rep as quick as the first. 90 s easy jog or walk between. | Short hard efforts with rests add up to more fast running than you could do in one go. The rest is part of the session.     |
| 8×400m Speed                                         | **Short reps · 8 × 400 m**      | Quick and relaxed, not a sprint. Walk or jog between.                              | Practises running fast with good form.                                                                                      |
| Long 10K · "Easy-to-moderate effort, time on feet"   | **Long run · 10 km**            | Easy, like your easy days. Walk breaks are fine.                                   | Builds the endurance for longer races. Finishing it comfortably matters more than the pace.                                 |
| Medium-long 75 · "aerobic depth"                     | **Longer easy run · 75 min**    | Easy, just longer than usual.                                                      | Keep today's line: "extra easy volume midweek, so the long run isn't carrying the whole week." Swap "volume" for "running". |

Keep the words **tempo**, **intervals**, **strides** and **long run**. Runna and NRC both keep them, and runners will meet them everywhere, so define them rather than rename them away. The physiology names (threshold, VO2 max, zone 2) appear only as a "Coaches also call this…" line inside the sheet (§7.4), never as labels (anti-pattern 1).

### 7.4 Where each explanation goes

| Moment                                               | What it says                                                                                                                                                                                                                                                                                          | What it never says                                                            | Evidence                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Session card** (Home, Train, Run tab)              | Name (§7.3), duration or distance, **one** line: the feel line, or the pace. Easy and long runs show the talk test plus a ceiling ("6:10 /km or slower"). Workouts show the range plus the effort word.                                                                                               | Why; physiology; praise                                                       | P1, P2, P4; Runna [RN-workouts] [TG-easy]                                                        |
| **ⓘ "About this run" sheet** (tap the name or the ⓘ) | Four short lines: **What it is · How it should feel · Why it's in your week · If it feels wrong** ("Can't talk? Slow down, or walk for a minute. That's still the run."). Then the step list, then "Coaches also call this…". Same affordance as Lift4's rules sheet, merged with "Why this session". | A lecture; more than one reason                                               | Runna briefing and glossary [RN-brief] [RN-terms]; Garmin what/how/why [5kr-adaptive]; Lift4 (3) |
| **Pre-run screen**                                   | The step list with each step's target (already there) and the purpose line once.                                                                                                                                                                                                                      | Repeating the sheet                                                           | Runna stages [RN-workouts]; Polar phases [PO-rp-man]                                             |
| **Audio at the start**                               | One sentence: the session and its feel. Already close: "Easy running. Conversational pace — strides at the end."                                                                                                                                                                                      | Pep talk                                                                      | Apple Pep Talk [DCR-wos26]; NRC [NPR-nrc]                                                        |
| **Audio during**                                     | Step instructions only; a pace nudge rarely, and on easy runs only when faster than the ceiling.                                                                                                                                                                                                      | Frequent pace flips                                                           | Runna complaint [JUA-runna]                                                                      |
| **Post-run**                                         | Silent when the run matched its type; the existing pace verdict carries it. One line when it didn't, e.g. "Faster than easy today. Easy days work best slower, so the hard runs get your energy."                                                                                                     | "Great effort"; restated stats                                                | Polar's "what it did" [PO-tb]; Strava's anti-pattern [FORBES-ai]                                 |
| **A change the plan made**                           | One line on the session it touched: _what changed — because…_ in the person's terms. Pace changes need a yes (`PaceInsightCard` already asks). Add Runna's "mixed results, no change yet" state if it's missing.                                                                                      | Unexplained changes; a reason under every number                              | Runna Pace Insights [RN-pi]; Garmin "due to…" [5kr-adaptive]; Garmin Coach complaint [GF-coach]  |
| **The week**                                         | A plain label only when the week differs: Lighter week, Taper, Race week. Its reason goes in the sheet, e.g. "Less running this week, so next week's long run starts on fresh legs."                                                                                                                  | Base / Build / Peak vocabulary on the main surface (see §7.0's GLOSSARY note) | Runna build/deload [RN-build]; Polar 3+1 cycles [PO-rp]                                          |

### 7.5 Changes and adaptation, in order of priority

1. **Use one sentence shape for every change the person didn't make:** _[What changed]: [reason in their terms]._ For example:
   - "Shorter than planned: you've run more than usual this week."
   - "Easier today: heavy legs session yesterday."
   - "Down from 100 kg: two sessions under 5 reps" (this is Lift4's wording, which already fits).

   Apply it across `AdjustWeekSheet`, `FellBehindSheet`, the ease-week nudge and the lighter week, so running and lifting changes read the same.

2. **Pace changes need a yes.** This already ships (`PaceInsightCard`) and matches Runna [RN-pi]. Add the "mixed results, no change yet" status only if the engine can produce it honestly.
3. **Run by feel today.** This is the manual version of roadmap item B2 (heat), cheap now. It hides pace targets for one run and keeps the effort words. Evidence: Runna's per-session RPE recommendation and heat feature [RWH-rpe] [9to5-heat]. It fits Lift4 (1): "any number is one tap from changed".
4. **Hybrid lines only where something changed.** When the scheduler eases a run because of a leg session, or flags heavy legs before a long run, say so in one line on that session ("Easy today: heavy legs session yesterday"). Never a general explainer about lifting and running. This is where Tropos can beat Edge's marketing claim [REPO-comp] with an explanation at the moment it matters.

### 7.6 Lifting: what this research confirms about Lift4, and two small additions

- **Confirmed:**
  - "Last:" showing every set mirrors Hevy and Strong (P10).
  - The single stated progression rule mirrors Hevy Trainer [HV-trainer].
  - One line when the plan lowers a lift is what Fitbod lacked in-app [FB-creates].
  - Silence when the numbers explain themselves is what Hevy and Strong do.
- **Addition 1: label every value on the optional effort row in words,** as Hevy does on its RPE scale [HV-rpe]. For example: "8 · 2 reps to spare", "9 · 1 rep to spare", "10 · nothing left". This keeps Lift4's plain-words rule ("reps to spare").
- **Addition 2: give "Lighter week" a one-line reason in the rules sheet,** e.g. "Half the sets, same weights, so the next weeks' work keeps landing." Runna's framing: "the deload weeks are what allow the build weeks to keep working" [RN-build].

### 7.7 What not to build

These are supported by the anti-patterns and consistent with `docs/running-quality-roadmap.md` §3.

- No readiness score or 0–100 verdict (anti-pattern 4).
- No AI-written activity summaries (anti-pattern 2).
- No physiology names as session or zone labels (anti-pattern 1).
- No praise-first copy (anti-pattern 8).
- No reason under every number, and no help-centre-only definitions: if a term needs a help article, the in-app name and line have failed.

### 7.8 Suggested order (all roadmap A5, "Wave 1 — feels coached")

1. Effort ladder, names and feel lines, and the easy-run ceiling. Copy plus `runLabels`/template view model; size S.
2. Map the run screen's step headings to the ladder words (`IntervalStepShell` eyebrow); S.
3. "Why it's in your week" for runs without a race (`runSessionExplainer` without phase context); S.
4. The ⓘ "About this run" sheet, reusing Lift4's rules-sheet pattern; S–M.
5. The one-sentence change format across the existing adjust and nudge sheets; S.
6. The post-run mismatch line (easy run run hard); S–M.
7. Run by feel today; M.

**Optional check that the copy works.** Count opens of the ⓘ sheet per session type in the existing analytics layer. If first-time viewers keep opening one type's sheet, its name or feel line isn't doing the job, and Lift4's "or the rule changes until they can" applies.

---

## 8. Gaps and follow-ups (not researched; no claims made)

The search budget ran out before these. Each is a short list of what to check, not a finding.

- **RP Hypertrophy app:** how its post-exercise questions (pump, joint pain, workload) and next-session soreness questions are worded, and how a set change or deload is explained on screen.
- **JuggernautAI:** pre-session readiness questions; how an RPE-driven change to the next set is shown.
- **Alpha Progression:** its per-set recommendation display and any "why this weight" text.
- **MacroFactor Workouts (2025):** how its algorithmic progression is explained in-app (Stronger by Science's articles on reps in reserve are likely the source).
- **Boostcamp:** program notes from program authors as the explanation layer.
- **Gravl and Liftosaur:** recovery map wording; Liftosaur's progression rules shown as visible scripts.
- **Edge:** in-app copy for interference and deload weeks (only vendor pages were seen).
- **User confusion threads** (r/Runna, r/Garmin, r/fitbod) couldn't be reached. App Store reviews and Garmin forum threads stand in for them here.

---

## Sources

### Runna

- [RN-conv] https://support.runna.com/en/articles/9707518-what-is-conversational-pace
- [RN-easy] https://support.runna.com/en/articles/15820108-how-to-make-the-most-of-your-easy-runs
- [RN-strides] https://support.runna.com/en/articles/15842006-what-are-strides-and-why-they-re-good-for-your-running
- [RN-terms] https://support.runna.com/en/articles/9459885-coaching-terms-every-runner-should-know
- [RN-tempo-int] https://support.runna.com/en/articles/13848642-what-s-the-difference-between-a-tempo-and-interval-running-session
- [RN-thresh] https://support.runna.com/en/articles/8608203-is-my-workout-a-threshold-interval-session-or-tempo-run
- [RN-tempo] https://support.runna.com/en/articles/8911204-what-is-a-tempo-run-a-complete-guide-for-runners
- [RN-methods] https://support.runna.com/en/collections/16285592-training-methods-and-sessions-explained
- [RN-rpe] https://support.runna.com/en/articles/6967043-what-is-rpe
- [RN-units] https://support.runna.com/en/articles/6206133-adjusting-your-training-units
- [RWH-rpe] https://www.runningwestwardho.co.uk/post/runna-rpe-guide (third-party guide)
- [RN-workouts] https://support.runna.com/en/articles/15690947-understand-your-runna-workouts
- [RN-instant] https://support.runna.com/en/articles/10116460-how-to-use-instant-workouts
- [RWH-stats] https://www.runningwestwardho.co.uk/post/runna-post-run-stats-explained (third-party guide)
- [RN-pi] https://support.runna.com/en/articles/14656203-what-are-pace-insights-and-how-do-they-work
- [RN-pi-rec] https://support.runna.com/en/articles/10854865-what-are-pace-insight-recommendations-and-how-do-they-work
- [RN-heat-press] https://www.runna.com/press/runna-announces-new-updates
- [9to5-heat] https://9to5mac.com/2026/07/29/runna-now-automatically-adapts-training-paces-based-on-heat-and-humidity/
- [5kr-heat] https://the5krunner.com/2026/07/29/runna-launches-adapt-for-heat-to-adjust-pace-for-weather/
- [5kr-ai] https://the5krunner.com/2026/09/28/is-runna-ai/
- [RN-brief] https://support.runna.com/en/articles/13169751-what-are-workout-briefings
- [RN-insights] https://support.runna.com/en/articles/10494265-what-are-workout-insights
- [RN-build] https://support.runna.com/en/articles/15013260-what-is-a-build-week-understanding-progressive-overload-in-your-running-plan
- [RN-beginner] https://www.runna.com/press/runna-introduces-updated-beginner-running-plans-for-2026
- [EB-beginner] https://endurance.biz/2026/industry-news/runna-updates-beginner-and-return-to-running-training-plans/
- [TG-easy] https://www.tomsguide.com/features/youre-probably-running-your-easy-miles-too-fast-heres-how-to-pace-yourself
- [TG-runna] https://www.tomsguide.com/wellness/running/this-is-the-running-app-im-using-to-train-for-my-sixth-marathon-and-it-just-got-even-better-for-beginners-too
- [RN-blog-easy] https://www.runna.com/blog/everything-you-need-to-know-about-embracing-your-easy-runs
- [TP-runna] https://www.trustpilot.com/review/runna.com
- [JUA-runna] https://justuseapp.com/en/app/1594204443/runna-running-training-plans/reviews
- [RWH-problem] https://www.runningwestwardho.co.uk/post/the-problem-with-runna
- [5kr-injury] https://the5krunner.com/2026/02/21/runna-ai-marathon-training-injury/
- [AOL-strava] https://www.aol.com/articles/inside-controversy-surrounding-strava-run-162700562.html

### Strava

- [ST-plans] https://support.strava.com/hc/en-us/articles/216918647-Training-Plans-for-Runners
- [ST-may26] https://stories.strava.com/articles/whats-new-on-strava-may-2026
- [ST-ai-press] https://press.strava.com/articles/stravas-athlete-intelligence-translates-workout-data-into-simple-and
- [FORBES-ai] https://www.forbes.com/sites/cyrusfarivar/2024/10/12/strava-upsets-fans-with-new-ai-feature-that-promises-insights-but-provides-bland-pep-talks/
- [FORTUNE-ai] https://fortune.com/2024/10/11/strava-app-artificial-intelligence-fitness-athletic-memes
- [ST-community] https://communityhub.strava.com/strava-features-chat-5/athlete-intelligence-feedback-7587
- [STW-forum] https://singletrackworld.com/forum/bike-forum/strava-athlete-intelligence/
- [ST-re] https://stories.strava.com/articles/how-to-use-relative-effort-to-refine-your-training
- [ROADCC-ff] https://road.cc/?p=45241
- [RCUK-ff] https://roadcyclinguk.com/?p=105483

### Nike Run Club

- [NRC-10k] https://www.nike.com/pdf/Nike-Run-Club-10K-Training-Plan-Audio-Guided-Runs.pdf
- [NRC-5k] https://www.nike.com/pdf/Nike-Run-Club-5K-Training-Plan-Audio-Guided-Runs.pdf
- [NRC-mar] https://www.nike.com/pdf/Nike-Run-Club-Marathon-Training-Plan-Audio-Guided-Runs.pdf
- [GP-nrc] https://www.gearpatrol.com/fitness/a43976920/nike-run-club-app-review/
- [HS-nrc] https://www.headspace.com/articles/how-to-get-into-running
- [NPR-nrc] https://www.npr.org/2023/11/04/1210678199/nike-run-clubs-oddly-mindful-coach

### Garmin

- [GA-dsw] https://www.garmin.com/en-CA/blog/fitness/daily-workout-suggestions-for-runners/
- [GA-dsw-nz] https://www.garmin.com/en-NZ/blog/types-of-daily-suggested-workouts-for-runners/
- [5kr-dsw] https://the5krunner.com/garmin-features/training/daily-suggested-workouts/
- [5kr-adaptive] https://the5krunner.com/2024/11/12/garmin-adaptive-plans-get-improved-explanations/
- [GA-status-man] https://www8.garmin.com/manuals-apac/webhelp/fenix7series/EN-SG/GUID-6F726699-0535-4A66-8F51-84A31CE81CD5-8601.html
- [GA-status-blog] https://www.garmin.com/en-US/blog/fitness/garmin-training-status-and-how-to-use-it/
- [GA-ready-man] https://www8.garmin.com/manuals-apac/webhelp/forerunner265series/EN-SG/GUID-35D1273C-4F9C-4029-9B8F-F997F4D7C3A8-7793.html
- [5kr-te] https://the5krunner.com/garmin-features/training/training-effect/
- [GF-unprod1] https://forums.garmin.com/outdoor-recreation/outdoor-recreation/f/epix-2/291466/great-run-but-vo2-max-down-and-unproductive
- [GF-unprod2] https://forums.garmin.com/outdoor-recreation/outdoor-recreation/f/epix-2/352865/unproductive-training-status-but-v02-max-increasing
- [GF-confusing] https://forums.garmin.com/outdoor-recreation/outdoor-recreation/f/fenix-6-series/251948/training-status-confusing
- [GF-advice] https://forums.garmin.com/outdoor-recreation/outdoor-recreation/f/epix-2/320150/training-status-advice-confusing
- [GF-coach] https://forums.garmin.com/outdoor-recreation/outdoor-recreation/f/fenix-6-series/326077/impressions-of-coach-greg-10k-training-plan
- [TG-status] https://www.tomsguide.com/how-to/how-to-use-the-training-status-feature-on-garmin-watch
- [GNETA-ready] https://www.gneta.app/blog/garmin-training-readiness-fix (third-party)
- [AC-gc+] https://www.androidcentral.com/wearables/new-garmin-connect-plus-subscription-adds-active-intelligence-beta-enhanced-smarts
- [5kr-gc+] https://the5krunner.com/2026/04/20/garmin-connect-plus-review/

### COROS

- [CO-zones] https://coros.com/stories/coros-metrics/c/evolab-updated-pace-zones
- [CO-hub] https://coros.com/us/stories/coros-metrics/c/welcome-to-the-training-hub
- [CO-phases] https://coros.com/stories/coros-coaches/c/periodization-how-coros-uses-phases-to-build-training-plans
- [CO-struct] https://coros.com/stories/coros-coaches/c/structured-workouts-and-effort-accuracy

### TrainingPeaks

- [TPK-guide] https://www.trainingpeaks.com/learn/trainingpeaks-athlete-user-guide/
- [BC-colors] https://www.joinbasecamp.com/support/compliancecolors
- [TPK-builder] https://www.trainingpeaks.com/learn/articles/introducing-trainingpeaks-workout-builder/

### Apple

- [AP-wos11] https://www.apple.com/newsroom/2024/06/watchos-11-brings-powerful-health-and-fitness-insights/
- [PL-load] https://www.pocket-lint.com/what-is-watchos-training-load/
- [DCR-wos26] https://www.dcrainmaker.com/2025/07/apple-watchos-26-workout-beta-real-world.html
- [AI-buddy] https://appleinsider.com/inside/watchos-26/tips/how-to-train-smarter-with-workout-buddy-in-ios-26-watchos-26
- [AP-wos26] https://www.apple.com/newsroom/2025/06/watchos-26-delivers-more-personalized-ways-to-stay-active-and-connected/

### Polar

- [PO-tb] https://support.polar.com/us-en/support/training_benefit_feature
- [PO-tb2] https://www.polar.com/en/smart-coaching/training-benefit
- [PO-rp] https://support.polar.com/en/support/polar_running_program
- [PO-rp-man] https://support.polar.com/e_manuals/M200/Polar_M200_user_manual_English/Content/Polar-Running-Program.htm
- [PO-rp-blog] https://www.polar.com/blog/polar-running-program/

### Newer entrants and V.O2

- [GR-kotcha] https://grittyrunners.co.uk/2026/04/17/kotcha-review/
- [MH-kotcha] https://marathonhandbook.com/eliud-kipchoge-enters-the-app-game-but-not-how-youd-expect/
- [AS-kotcha] https://apps.apple.com/us/app/kotcha-your-new-running-coach/id6746164787
- [5kr-ttr] https://the5krunner.com/2026/03/30/type-to-run-weekly-coach/
- [RG-ai] https://therunninggenie.com/blog/best-ai-running-coach-apps
- [VO2-defs] https://vdoto2.com/learn-more/training-definitions
- [VO2-easy] https://news.vdoto2.com/2017/11/whats-easy-pace/
- [VO2-rep] https://news.vdoto2.com/2018/01/whats-repetition-pace/

### Lifting

- [HV-prev] https://www.hevyapp.com/features/track-exercises/
- [HV-prev-help] https://help.hevyapp.com/hc/en-us/articles/36011896355479-How-to-Use-Previous-Workout-Values-to-Improve-Performance-in-Hevy
- [HV-rpe] https://help.hevyapp.com/hc/en-us/articles/34490600233111-RPE-vs-RIR-What-They-Mean-and-How-to-Use-Them-in-Hevy
- [HV-trainer] https://www.hevyapp.com/features/workout-plan-generator/
- [HV-trainer-help] https://help.hevyapp.com/hc/en-us/articles/38385724273047-Hevy-Trainer-Explained-How-It-Builds-Your-Workout-Program
- [HV-announce] https://www.hevyapp.com/announcing-hevy-trainer/
- [AF-po] https://anatomikfit.com/en/blog/progressive-overload-apps/ (third-party)
- [STRONG] https://strong.app
- [FB-recovery] https://fitbod.me/blog/muscle-recovery/
- [FB-creates] https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout
- [FB-section] https://help.fitbod.me/hc/en-us/sections/360001078993-Understanding-Fitbod-How-It-Works
- [FB-break] https://help.fitbod.me/hc/en-us/articles/34320813009431-Took-a-Break-Here-s-How-to-Recalibrate-Your-Fitbod-Recommendations
- [JUA-fitbod] https://justuseapp.com/en/app/1041517543/fitbod-workout-fitness-plans/reviews
- [TR-fitbod] https://www.techradar.com/health-fitness/fitbod-app-review
- [DRM-fitbod] https://dr-muscle.com/fitbod-app-review-alternative/ (written by a competitor)

### Hybrid and repo

- [EDGE] https://www.findyouredge.app/ (vendor)
- [EDGE-ai] https://www.findyouredge.app/news/best-ai-running-coach-apps-2026 (vendor's own ranking)
- [REPO-comp] `docs/competitive-analysis-running-2026.md` (repo; researched 2026-06-11)
- Tropos code read for §7.0: `src/lib/runSessionExplainer.ts`, `src/lib/workoutTemplates.ts`, `src/lib/runLabels.ts`, `src/lib/runSegments.ts`, `src/lib/runCueCopy.ts`, `src/components/run/IntervalStepShell.tsx`, `src/components/run/PaceInsightCard.tsx`, `src/components/program/ProgrammeRunSection.tsx`, `GLOSSARY.md` ("Phase disclosure")
