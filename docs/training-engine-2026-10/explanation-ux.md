# How the best fitness apps explain training, and what Tropos should take from it

Researched 2026-10-06 for the owner's question: _"you go into running and it says easy, hard, strides, all this stuff, and it's not explanatory what this actually is. I don't understand why or how something like Strava may do it. How do they do it? What do other people do?"_

Scope: how apps explain session types, effort targets, plan structure and why a plan changed. Pricing and feature teardowns are in `docs/competitive-analysis-running-2026.md` and aren't repeated here.

> Integrated 2026-10-06 into `docs/training-engine-2026-10/`. Planning
> material, not a lock. Verification status, corrections and read order:
> [README.md](README.md).

---

## Read this first: method and limits

- **The first pass (2026-10-06) read no page directly.** The egress proxy refused every fetch, so that pass worked from search-tool extracts. On 2026-10-07 every URL in the first pass's Sources list was fetched and read: 100 of 108 loaded. Most loaded with plain curl. The5krunner answered only a crawler user agent. Hevy and Fitbod help articles were read through their public Zendesk article API. The Nike PDFs were read through pdftotext. Quotes in this doc are now the pages' current wording. §9 lists what the check found.
- **Eight links failed.** Two are dead and six are blocked by a bot wall or the egress proxy; the Sources list marks each one. A claim that rests only on one of those pages is marked [U], and so is a claim that rests only on the repo's own analysis [REPO-comp].
- **The lifting apps are now covered.** JuggernautAI, RP Hypertrophy, Alpha Progression, Boostcamp, MacroFactor Workouts, Gravl and Liftosaur were read on their own help centres, blogs, product pages or App Store listings on 2026-10-07 (§3.4–§3.12). Edge is covered only through the repo's existing analysis and its homepage. §8 lists what is still open.
- **Some sources have a stake in the answer, and they are flagged where cited:** dr-muscle.com sells a Fitbod competitor, anatomikfit.com ranks its own app first, therunninggenie.com ranks its own product, and findyouredge.app is Edge's own site.
- Every claim carries a link tag such as [RN-conv]. Each tag resolves to a URL in the Sources list at the end.

**Markers.** This folder shares one scheme:

| Marker | Meaning                                                                                      |
| ------ | -------------------------------------------------------------------------------------------- |
| [VF]   | Checked against the full text on 2026-10-07.                                                 |
| [VA]   | Checked against the abstract, or the book or web page itself, on 2026-10-07.                 |
| [U]    | The source was identified, but this claim could not be checked (paywalled, blocked or dead). |
| [R]    | Still not identified or not checked. Do not encode it.                                       |
| [C]    | Computed by the doc's own script. Not used in this doc.                                      |

Every tagged claim in this doc was checked against its cited web page or PDF on 2026-10-07, so [VA] applies to every claim that carries no other marker. It is not repeated on each line. Claims marked [U] or [R] say so where they appear.

---

## 1. The short answer to "how does Strava do it?"

**Mostly, Strava doesn't explain training itself. Runna does it for them.** Strava's help centre says its running training plans are now powered by Runna, which Strava bought in 2025 [ST-plans-new]. Strava's own explanation layer is Athlete Intelligence, an AI summary shown after an activity. Forbes's headline calls it "bland pep talks" [FORBES-ai] [U]. Fortune reports "often obvious (and sometimes incorrect) feedback" [FORTUNE-ai], and one forum user called it "an utterly pointless application of an LLM" [STW-forum].

**Runna explains each session in five places, and each place does one job:**

1. **The session is a list of steps, each with a target written in body terms plus a number.** For example: a warm-up of "800m at conversational pace. No faster than 7:15/km.", then the set, then "90s walking rest" [RN-workouts].
2. **An easy run gets a speed limit, not a target.** For conversational pace the app shows "No faster than" a given pace [RN-workouts]. Runna's blog calls this one of the app's "most-loved features" [RN-blog-easy], and its help centre says to "Treat 'no faster than' pace guidance as a ceiling, not a target" [RN-easy].
3. **A Workout Briefing arrives the day before.** It covers the session's focus, coaching tips, what the last workout showed, weather, hydration and "where this session fits within your training cycle". The briefing is AI-written. Each workout also has a human-written Coach's Comment [RN-brief].
4. **A definitions library sits behind the sessions:**
   - conversational pace means you can "speak in full sentences" [RN-conv]
   - a tempo run means you can "speak in short phrases" [RN-terms] at 7–8/10, and intervals are 8–9/10 [RN-tempo-int]
   - strides have their own article [RN-strides]
   - there's a coaching-terms glossary [RN-terms] and a "Training methods and sessions explained" collection [RN-methods]
5. **Changes come as named statuses that need your yes.** Pace Insights reports "Pace on Point", "Ahead of the Pack" and three other statuses, one of them for when there isn't enough data yet. It states that Pace Insights "never automatically change your training paces without your input" [RN-pi]. Adapt for Heat is a suggestion: you tap "Review suggestion", then "Accept" or "Keep as planned" [RN-heat].

**Two other apps take different routes:**

- **Nike Run Club leads with effort words.** Coach Bennett: "Easy is an effort, it's not a pace" [GP-nrc]. Its plans define every pace as an effort out of 10, anchored to a race you could run: "5K pace … the pace you could race or run hard for about 3 miles", 7–8 out of 10. The plans also carry a pace chart, and say to "Treat each pace target as the middle of a range" [NRC-10k].
- **Garmin attaches three short lines to each suggested workout:** what it's for, how to do it, and why it changed ("…due to high run mileage") [5kr-adaptive].

The owner's complaint is that sessions are named but never explained. The best apps answer it with a name that says what you'll do, one line on how it should feel, and the why one tap away.

---

## 2. Running apps

### 2.1 Runna (Strava-owned since 2025)

**(a) Session names.** Easy run, long run, intervals, tempo, hill reps, race, parkrun [RN-instant] [RN-workouts]. Runna deliberately doesn't name sessions "threshold". It uses "intervals" and "tempo runs" because "threshold is a physiological term, not a session structure" [RN-tempo-int].

**(b) Where the explanation lives:**

- **The step list with targets.** Every workout has warm-up, main set, recoveries and cool-down [RN-workouts].
- **The Workout Briefing, from the day before.** Contents: "key workout focus and coaching tips, insights from your previous workout, weather guidance, hydration and nutrition tips, and plan context". The briefing is AI-generated. Beside it, each workout has a human-written Coach's Comment that "explains the session structure" [RN-brief]. A Runna press release says of the briefings: "no two customers receiving the same briefing" [RN-beginner].
- **Audio pace feedback during the run** [RN-workouts] [TG-runna].
- **Workout Insights after the run.** Rating the run thumbs-up or thumbs-down unlocks AI feedback on "what went well and what you could improve for next time" [RN-insights].
- **The laps chart.** It draws your pace for each stage against a dark band marking Runna's target [RWH-stats].
- **The help-centre glossary and the "sessions explained" collection** [RN-terms] [RN-methods].

**(c) Representative copy:**

- **Easy / conversational.** "slow enough that you can speak in full sentences and hold a conversation with someone". It adds a directions test: "If someone stopped you, asking for directions, would you be able to speak to them or would you need a minute to catch your breath?" Runna also notes that what feels easy for 5 km may not for 20 km [RN-conv]. "Conversational pace is deliberately conservative: the goal is effort control, not speed" [RN-easy].
- **Strides.** Bursts of "15-20 seconds" at "about 85-90% of max effort". A typical week has 4–6 of them after an easy run, with "60-120 seconds of walking recovery". Strides "should feel fast and controlled, not maximal", and "Always run strides after a warm-up or easy running" [RN-strides].
- **Tempo.** "Longer, sustained efforts performed below your lactate threshold, usually as one continuous block". The aim is to hold a "comfortably hard" pace at 7–8/10 [RN-tempo-int]. The coaching-terms glossary describes it as a pace where you can "speak in short phrases, but not hold a full conversation" [RN-terms].
- **Intervals.** "Shorter, harder efforts … with a walking or static recovery between reps", 8–9/10 [RN-tempo-int].
- **Recovery run.** "A recovery run is a short, low-intensity run done after a hard workout". "Recovery runs feel easy and use the same pacing as an easy run" [RN-terms].
- **Build week and deload week.** A build week is "a training week where your overall load increases compared to the previous week". Plans run "build, build, deload", and "the deload weeks are what allow the build weeks to keep working" [RN-build].

**(d) How effort is expressed.** Runna's workout guide shows single pace targets, such as "400m at 6:20/km" [RN-workouts]. A third-party review describes "a pace range with the target pace sitting right in the middle" [RWH-problem]. Easy runs get a ceiling instead [RN-easy] [TG-easy]. There's an RPE mode, in which workouts "guide you based on effort level (e.g., RPE 4) instead of exact paces" [RN-rpe] [RN-units]. Runna's own RPE article lists when to switch: when you're fatigued, in heat or wind, on hills or trails, at altitude, or coming back from illness [RN-rpe]. A third-party guide adds that Runna can recommend RPE for a single session on the day, and that accepting applies only to that run [RWH-rpe].

**(e) How plan structure is shown.** The briefing's "plan context" says where the session sits in the training cycle [RN-brief], and the build/deload articles explain why a week differs [RN-build]. The 2026 beginner plans start with time-based walk–runs, and Runna says the plan "only transitions to distance when the runner is ready" [RN-beginner]. A separate "Not Feeling 100%" feature "can adjust training intensity or remove pace targets for periods ranging from 3–14 days". Only endurance.biz reports it [EB-beginner].

**(f) How adaptive changes are communicated:**

- **Pace Insights,** after any session with pace targets. Five statuses [RN-pi] [RN-pi-rec]:
  - "Pace on Point" — on track
  - "Ahead of the Pack" — tap "View update"
  - "Let's Review Your Pace" — "A pace decrease may make training more effective and enjoyable"
  - "Variable Pace Detected" — "We can't make a recommendation just yet as your results have been mixed. Focus on hitting your pace targets and staying consistent!"
  - "Monitoring Your Pace Data" — "We don't have enough data yet"

  Runna states that "Pace Insights never automatically change your training paces without your input." The screen also lists "Why you received your latest status" and "Which workouts contributed to it" [RN-pi].

- **Adapt for Heat (July 2026).** The suggestion appears the day before or on the day, usually when the feels-like temperature is above about 20 °C. You pick the hour you'll run from a colour-coded hourly forecast [9to5-heat] [5kr-heat], tap "Review suggestion", then "Accept" or "Keep as planned" [RN-heat]. Possible changes [RN-heat] [9to5-heat] [5kr-heat] [RN-heat-press]:
  - slower targets, chosen so the session still does the same job
  - easy runs get "a slower conversational pace limit", which "may show as a slightly longer estimated duration" [RN-heat]
  - a structured long run swapped for a conversational one
  - advice not to run outside in extreme heat
- **The5krunner's description:** "The accurate description is coach-written plans, adjusted by an algorithm, with AI features added on top." The estimated race time is an input: it "sets the pace target for every workout" [5kr-ai].

**(g) What users complain about:**

- Pace prompts "every 30 seconds or so, it becomes very grating" [JUA-runna].
- The app "doesn't realise when you've stopped at a light so it keeps telling me to speed up" [JUA-runna].
- "One coach says the app fails to account for fatigue" [AOL-strava].
- After reported injuries, Runna was "adding features to let its customers dial back the intensity of their plans" (The5krunner, citing the Wall Street Journal) [5kr-injury].
- Complaints about paces being too fast early on could not be checked: the Trustpilot page is blocked [TP-runna] [U].
- **Telling detail:** Runna needed two help articles to separate tempo, interval and threshold [RN-thresh] [RN-tempo-int]. The category labels alone didn't carry the meaning.

### 2.2 Strava

**(a)/(b) Session names and explanations.** New running plans are powered by Runna [ST-plans-new]. On 14 May 2026 Strava added 14 integrations, Runna among them, that "bring your lifts directly into Strava". These carry strength workouts, not runs [ST-may26]. Strava's own explanation surface is **Athlete Intelligence**. Strava says it "translates workout data into simple and personalized insights" covering pace, heart rate, elevation, power and Relative Effort, with trends over the past 30 days [ST-ai-press].

**(c) Representative copy.** Viral examples include the AI telling a cyclist who had crashed into a door and needed an ambulance, "Despite the setback, your activity data shows you're a consistent, well-rounded athlete—keep up the great work!" [FORTUNE-ai].

**(d) How effort is expressed.** Relative Effort, a heart-rate-zone-weighted score [ST-re].

**(e) Fitness & Freshness.** Strava's own gloss: "You'll notice the score go up quickly after a couple hard days, but also go down quickly as you take a few days off" [ROADCC-ff]. The 42-day fitness and 7-day fatigue windows are not on road.cc, and [RCUK-ff] times out [U].

**(g) What users complain about:**

- "Bland pep talks", in Forbes's headline [FORBES-ai] [U].
- "Often obvious (and sometimes incorrect) feedback" [FORTUNE-ai].
- "It seems an utterly pointless application of an LLM - it took my activity title & description and regurgitated it back to me using 100 words." [STW-forum]

### 2.3 Nike Run Club

**(a) Session names.** Recovery run, speed run (intervals, fartlek, hills, tempo), long run and tempo run [NRC-mar].

**(b) Where the explanation lives:**

- **Audio-guided runs.** Coach Chris Bennett wrote the scripts ("the first run, the next run, the first speed run and the comeback run") and "pops in and out at certain distances" [NPR-nrc].
- **A "know your paces" glossary in each training plan** [NRC-10k] [NRC-5k] [NRC-mar].

**(c) Representative copy, from the plan PDFs:**

- **Recovery pace.** "A pace easy enough that you can talk, laugh or argue freely while running", 4–5/10 [NRC-10k] [NRC-mar].
- **Pace ladder by effort:** mile pace 9/10 ("the pace you could race or run hard for one mile"), 5K pace 7–8/10, 10K pace 6–7/10, and Best Pace "?? out of 10" [NRC-10k]. The ladder is the same in all three plan PDFs.
- **Tempo.** "A hard but controlled pace … Teaching your body to be comfortable being uncomfortable … close to 30-35 seconds slower than your 5K pace", 6/10 [NRC-mar].
- **Recovery days.** "Run easy and based on how you feel to help you recover" [NRC-mar].
- **Fartlek written in the effort language,** e.g. "2 x 1:30 10K Pace, 3 x 1:00 5K Pace, 4 x 0:30 Mile Pace, 5 x 0:15 Best Pace" [NRC-10k].

**(d) How effort is expressed.** Effort leads: words and effort out of 10, anchored to race distances. "Easy is an effort, it's not a pace" [GP-nrc]. The plans do give numbers too. A per-mile Pace Chart is built from your best mile, with the advice: "Treat each pace target as the middle of a range… you are not a robot" and "When in doubt be sure to focus on effort" [NRC-10k]. A Headspace article puts it this way: "It's never about running a 9-minute mile pace or an 8-minute mile pace, it's always about running at your 3 out of 10 or your 6 out of 10" [HS-nrc].

**(f) Adaptation.** NRC's coaching is pre-recorded and doesn't adapt to performance (per the repo's analysis, [REPO-comp]) [U].

**Note.** NRC's tempo is 6/10 and Runna's is 7–8/10. Effort numbers don't transfer between apps; the words do.

### 2.4 Garmin (Daily Suggested Workouts, Garmin Coach, Training Status, Readiness)

**(a) Session names come from what the workout trains:** base, tempo, threshold, VO2 max, anaerobic, sprint and recovery [GA-dsw] [GA-dsw-nz]. Suggestions draw on VO2 max, Training Status, acute and chronic load, recovery time, sleep and, on supported devices, Training Readiness [5kr-dsw]. Garmin's own blog says you won't see sprint suggestions "if you have a significant amount of recovery time remaining" [GA-dsw].

**(b)/(f) Where the explanation lives: what / how / why (since November 2024).** "Each suggested workout is explained to you – thus, you will be told what the workout is trying to achieve, how you have to do it and why the change has been suggested" [5kr-adaptive]. Examples:

- **What:** "Build up your base endurance".
- **How:** "Keep it short and low-intensity", or "Active recovery or rest is suggested for the remainder of today".
- **Why:** "…due to high run mileage", "…due to high recovery time", "…to account for your significant jet lag".

The5krunner adds a caution: "The standard phrases will grate after a while" [5kr-adaptive].

**(c) Status copy, each label paired with an action** [GA-status-man]:

- **Maintaining.** "Your current training load is enough to maintain your fitness level. To see improvement, try adding more variety to your workouts or increasing your training volume."
- **Unproductive.** "Your training load is at a good level, but your fitness is decreasing. Your body may be struggling to recover…"
- **Overreaching.** "…Your body needs a rest."
- **Peaking.** "You're in ideal form" in Garmin's blog [GA-status-blog]. The manual says "Peaking means that you are in ideal race condition" [GA-status-man].

**Training Readiness labels** [GA-ready-man]: Prime (95–100) "Best possible"; High (75–94) "Ready for challenges"; Moderate (50–74) "Good to go"; Low (25–49) "Time to slow down"; Poor (1–24) "Let your body recover".

**(d) How effort is expressed.** Target pace or heart-rate ranges, with a heart-rate-guided option [GA-dsw-nz]. After a run, Training Effect scores aerobic and anaerobic load from 0 to 5 under a "primary benefit" label: 3.0 is improving, 4.0 highly improving and 5.0 overreaching [5kr-te].

**(e) Plan structure.** Garmin Coach adapts from a difficulty rating you give each workout. Race Training plans and Daily Suggested Workouts adapt from watch data such as sleep and recovery status [5kr-adaptive].

**(g) What users complain about:**

- **"Unproductive" after a run that felt great.** Forum threads: "Great run but vo2 max down and unproductive?!?", "Unproductive training status but V02 max increasing", "Training Status Confusing" [GF-unprod1] [GF-unprod2] [GF-confusing] [GF-advice]. One reply explains that the status is "a trending type analysis rather than a judgment of the one run you just completed" [GF-unprod1]. The label doesn't say so.
- **Opaque adaptation in Garmin Coach.** A Garmin Coach user asked for a separate difficulty field to be dropped in favour of the watch's Perceived Effort. They wrote: "Perhaps so, but there was no indication of what it was adapting." [GF-coach]
- **Readiness that sits low.** Third-party "always low or stuck at 1" fix guides exist [GNETA-ready].
- **Thin AI insights.** Garmin Connect+ "Active Intelligence" puts an LLM summary at the top of the Home view [AC-gc+]. A one-year review says it "continues to restate thin insights" [5kr-gc+].

### 2.5 COROS (EvoLab, Training Hub)

**(a)/(d) Zone names describe what the zone trains, and all but Threshold carry an effort word:** Recovery, Aerobic Endurance, Aerobic Power, Threshold, Anaerobic Endurance, Anaerobic Power, all set from threshold pace [CO-zones]:

- **Zone 1, Recovery (Easy Effort):** "Very low, allowing comfortable breathing and conversation".
- **Zone 2, Aerobic Endurance (Moderate Effort):** "you can still hold a conversation but feel a steady effort".
- **Zone 3, Aerobic Power (Tempo Effort):** "conversation is difficult", for efforts of 1–3 h.
- **Zone 4, Threshold:** "hard but sustainable for 30-60 minutes".
- **Zone 5, Anaerobic Endurance (Very High Effort):** efforts of 3–8 min.
- **Zone 6, Anaerobic Power (Maximal Effort):** efforts under 3 min [CO-zones].

**(e) Plan structure.** The Training Hub projects how planned workouts will change Base Fitness and fatigue before you do them [CO-hub]. Plans are built in five phases: Base, Build, Peak, Taper/Race and Transition, and each week shows its current phase [CO-phases]. Structured workouts are "a series of steps designed to target specific intensity zones" [CO-struct].

### 2.6 TrainingPeaks

**(b) Where the explanation lives.** The athlete sees a picture of the workout's shape: "They will quickly be able to see workout elements like warm-up, main set, and cool-down. No longer will they have to read lengthy descriptions just to get a sense of what is prescribed" [TPK-builder]. A coach's description and pre/post-activity comments sit beside it [TPK-guide].

**(f) Planned against done, shown as colour:**

- green: within ±20% of plan
- yellow: 50–79% or 121–150%
- orange: more than 50% above or below
- red: not completed
- grey: unplanned

[TPK-guide]

### 2.7 Apple Workout app (watchOS 11 and 26)

**(d) How effort is expressed.** After a workout you rate effort on a 1–10 scale labelled Easy, Moderate, Hard and All Out [AP-wos11] [PL-load]. No cited page says which numbers fall under which label. For cardio workouts the watch estimates the rating, and you can adjust it for stress or soreness.

**(e) Training Load.** It compares your last 7 days with your last 28: "well below, below, steady, above, or well above" [AP-wos11] [PL-load]. The Fitness app "details the possible impact on their fitness if they continue to train at that current level" [AP-wos11].

**(b) Workout Buddy (watchOS 26).** Generated voices of Fitness+ trainers speak in three phases: a **Pep Talk** at the start, **Alerts & Milestones** during, and a **Walk Off** summary at the end [DCR-wos26]. Apple's example lines: "Mile four. You picked up the pace and ran that last one in 8 minutes and 28 seconds." and, at the end, "You went 4.3 miles in just over 38 minutes…" [AP-wos26].

### 2.8 Polar

**(c) After the workout, Training Benefit says what the session did** [PO-tb] [PO-tb2]. Polar's support page describes each benefit at more length and without praise [PO-tb]. The watch manual's feedback lines open with praise [PO-pacer]:

- **Recovery training:** "Very nice session for your recovery. Light exercise like this allows your body to adapt to your training."
- **Steady state & basic training, long:** "Excellent! This long session improved the endurance of your muscles and your aerobic fitness…"
- **Tempo training:** "Great pace! You improved your aerobic fitness, speed, and ability to sustain high intensity effort for longer."
- **Maximum training:** "What a session! You improved your sprint speed…"

**(e) Plan structure.** The Running Program has three named phases: Base building, Build-up and Tapering [PO-rp] [PO-rp-man] [PO-rp-blog].

- Base building runs in four-week sets of three progressive weeks and one lighter week.
- After each set "it's up to you to choose" whether to stay at the same level or change [PO-rp].
- Build-up uses two progressive weeks and one lighter week.
- Tapering is the last two to three weeks.

There are five session types: easy jog, medium run, long run, tempo run and interval. Each has a warm-up, work and cool-down [PO-rp-man].

### 2.9 Newer entrants (2025–2026) and V.O2

- **Kotcha.** Its App Store listing is now titled "Kotcha - Running & Trail" and says "Built with Eliud Kipchoge and Kilian Jornet" [AS-kotcha]. The launch date (23 October 2025), the link to the NN Running Team and the four AI coach personas come from [MH-kotcha], which is blocked [U].
  - Every Sunday it reviews the week and writes the next one. A run rated very hard changes what follows [GR-kotcha].
  - Each week it asks you to "log how you're currently feeling, and hit validate to agree" [GR-kotcha].
- **Type to Run Weekly Coach** is a chat-based planner that syncs to Garmin. It explains its reasoning, asks how training went, and lets you question its decisions. The5krunner contrasts this with Garmin "silently manipulating your schedule based on overnight HRV" [5kr-ttr].
- **Others:** a listicle from The Running Genie, which ranks its own product, names TrainAsONE, Runna, COROS Training Hub and Garmin Coach. I didn't examine them [RG-ai].
- **V.O2 (Jack Daniels' app)** uses letter codes: E, M, T, I, R [VO2-defs] [U]. It defines each. Easy is a "comfortable, conversational pace" at "59-74% of VO2max or 65-79% of your HRMax", and may be "up to 20-seconds slower or faster" on a given day [VO2-easy]. For Repetition: "Think of Reps as similar to current 1500 or mile race pace". They are "fast, but not necessarily 'hard'", and their purpose is "To improve your speed and economy" [VO2-rep]. The letters only make sense to someone who has read the definitions.

---

## 3. Lifting apps

The pages behind §3.1–§3.12 were read directly on 2026-10-07. Hevy and Fitbod help pages were read through their public Zendesk article API, because their HTML pages block plain requests. RP's question wording comes from the RP web app's own shipped copy (training.rpstrength.com). Quotes are verbatim, in the vendor's spelling and unit style.

### 3.1 Hevy

- **(b)/(d) The last session sits beside every set.** A PREVIOUS column shows what you did last time, so "you can see your previous performance at a glance throughout your current session" [HV-prev] [HV-prev-help]. It can include last time's effort rating, for example "50lbs x 10 @ 8.5 RPE" [HV-rpe].
- **The effort picker explains each value.** Optional RPE logging uses a 6–10 scale, and "Each number will have a brief description indicating the number of reps in reserve you believe you have" [HV-rpe].
- **(f) Hevy Trainer (algorithmic).** "Our programs are generated using an algorithm and do not rely on AI to create users' programs" [HV-trainer-help].
  - It sets rep ranges, rest times and "helpful tips". It suggests starting weights only "if you've logged the exercises at least once in Hevy" [HV-trainer].
  - It "will let you know when to increase your weight and by how much based on your performance" [HV-trainer-help], and it "automatically adjusts your working weights" [HV-trainer].
  - It gives "Gentle reminders to maintain intensity if progress stalls" [HV-announce]. The feature page says "Reminders to push hard if progression stalls" [HV-trainer].
  - It marks lifts that moved: "a small indication next to the movements you've made progress on". A progress report gives "a brief overview of where you're progressing or maintaining" [HV-trainer].
  - None of Hevy's own pages says it lowers weights [HV-trainer] [HV-trainer-help] [HV-announce] [HV-settings].
- **The progression rule isn't on Hevy's pages.** Hevy's own pages don't state Trainer's rule [HV-trainer] [HV-trainer-help]. Only a third-party page does: "you must reach the top of the rep range with the prescribed weight on every prescribed set before the weight increases" [AF-po]. Anatomik, which wrote it, ranks its own app first.

### 3.2 Strong

- **(b)** Whether Strong shows the last set beside the current one could not be confirmed: no such wording is on strong.app or its help centre [STRONG] [R].
- **(d)** Optional RPE on "a 6-10 scale", mapped to reps in reserve: 6 is 4 in reserve, 7 is 3, 8 is 2, 9 is 1 and 10 is 0 [STRONG-rpe].
- I found no progression feature in what I could see, so the numbers are the only explanation [R].

### 3.3 Fitbod

- **(e) Recovery model.** Every muscle group gets a recovery percentage from 0 to 100, based on recent sets, reps and load, and fresher muscles are chosen first. Fitbod warns against reading the figure closely: "Don't get too hung up on the exact percentages—there is no magic number" [FB-recovery]. Its pages disagree on full recovery: "up to 7 days" [FB-creates] and seven days [FB-recovery], but "fully recovered after six days" in one help article [FB-recovery-help].
- **(f) Progression.** "Complete an exercise comfortably and Fitbod gradually increases load or reps; struggle with it and future recommendations ease back" [FB-srw].
- **Explaining a lower number: a help article, not in-app copy.** Fitbod's help centre explains that when recommended weights fall, it's "usually because the session is meant to be lighter … a lighter day is part of the pattern rather than a mistake". After a break it lowers weights on purpose [FB-creates] [FB-section] [FB-break]. Another article says "a lighter-feeling session isn't a sign something's wrong. It's part of the pattern", and "a recommendation isn't a verdict on what you should be able to lift" [FB-srw].
- **(d) Effort.** Reps in Reserve "on a scale from 0 (failure) to 4+ (very easy)", asked after a set. Fitbod still works without it [FB-srw].
- **(g) What users complain about.** The quotes come from a competitor's review: workouts that "seemed random", and "I think fitbod is training me for cirque du soleil" [DRM-fitbod]. They are not on [JUA-fitbod] or [TR-fitbod].

The lesson matches what Lift4 found: a number the person didn't choose reads as a bug unless something says why.

### 3.4 RP Hypertrophy (Renaissance Periodization)

- **Progression.**
  - "weight is increased by a few percentage points each week".
  - If the next weight is too big a jump ("like going from the 10lb to the 15lb dumbbells"), "it adds a rep to each set instead" [RP-prog].
  - Under a set the app shows "We recommend {n} reps or {n} RIR" [RP-app].
  - Setup copy: "Hit your targets and push closer to failure as the app automatically increases weight, reps, or sets" [RP-app].
- **The four questions** (shipped copy) [RP-app]:
  - Joint pain, per exercise: "How did your joints feel during {exercise}?" Answers: None, Low pain, Moderate pain, A lot of pain. The last one's long form reads "My joints hurt BAD, something is up."
  - Pump, per muscle: "How much of a pump did you get today in your {muscle}?" Answers: Low pump, Moderate pump, Amazing pump.
  - Volume, per muscle: "How was the volume of work (number of hard sets) for your {muscle}?" Answers: Not enough, Just right, Pushed my limits, Too much.
  - Soreness, per muscle, asked about the previous session: "How sore did you get in your {muscle} AFTER training it LAST TIME?" Answers: Never got sore, Healed a while ago, Healed just on time, I'm still sore!
- **How set changes are explained.** The help centre states the mapping [RP-prog]:
  - "Low pumps, barely sore, and rating workouts as easy = more sets"
  - the middle answers give "no change in sets"
  - "Amazing pumps, so sore that you can't heal on time, and too much volume = fewer sets"
- **What the screen shows.** Each exercise carries an icon whose tooltip reads "Improved!", "Maintained" or "Regressed" [RP-app]. I found no in-app sentence saying why sets changed. The help centre says it: "the algorithm determined (based on your feedback) that you would benefit from backing off a bit" [RP-drop].
- **Deloads.**
  - "the last week of the block is always a deload" [RP-drop], and a block is at most 8 weeks including it [RP-meso].
  - In-app: "Don't worry about hitting 8 RIR exactly, just make sure every set this week feels ultra easy."
  - Also in-app: "If you have to grind, fatigue will hang around and your next mesocycle may be negatively affected." [RP-app]
- **Honest answers.**
  - "this is where users can go wrong with the app feedback prompts. The app will only increase volumes if you tell it you can handle more" [RP-long].
  - Any number can be overridden: "by all means manually add or delete sets or overwrite the weight" [RP-prog].

### 3.5 JuggernautAI

- **Readiness.** "Before each session, the app asks about your readiness (e.g., sleep, mood, energy, soreness). Based on your answers, it adjusts the day's training, modifying volume or weight as needed" [JAI-ind].
- **Readiness score.** The help centre says "Scores range from around 0 to ~30", with bands: below 10, "likely heavily fatigued" [JAI-ready]. Version 3.0 moved to "a simple 0–100 scale with mapped zones" [JAI-v3].
- **Next sets from RPE.**
  - "As you enter your top set and back down set RPEs during a workout, the program continues to adjust in real-time. It tweaks your next sets based on how you're performing" [JAI-ind].
  - Back-off work "is based on your performance in the top set" [JAI-load].
  - Main lifts get a weight range: "your performance during warm-ups will help you decide where you fall within that range" [JAI-rpe].
- **Check-ins and set drops.**
  - There are check-ins at the end of each session, week, block and programme [JAI-ind].
  - From v2.5: "Weekly check-ins automatically drop sets when your readiness score falls below 3" [JAI-v25].
- **Rating advice that contradicts itself.**
  - Blog: "When you aren't sure if you should rate a set as an 8 or 8.5RPE, you are usually better off rating it as an 8.5RPE" [JAI-tips].
  - Help centre: "You're better off rating a set slightly lower (e.g., RPE 7 instead of 8) than overshooting" [JAI-rpe].
- **Deloads.** "While the training during a Deload week can seem like it is too easy, it is an important part of staying healthy" [JAI-phases].
- **Where the why lives.**
  - "The ℹ️ icon will give you more information about many features of the app. The FAQ section in the menu has tons of information" [JAI-tips].
  - The help article on missed lifts is about mindset and states no programme rule [JAI-miss].

### 3.6 MacroFactor Workouts (launched January 2026)

- **Launch.** MacroFactor's January 2026 newsletter: "This month, we launched MacroFactor Workouts" [MF-launch].
- **The rule.**
  - "driven by rule-based logic, not generative AI ... changes in weight and reps follow clear rules versus black-box guidance" [MF-page].
  - A target such as 7–9 reps at 2 RIR predicts "8+2=10 reps" to failure. Beat that and load or reps go up [MF-po].
- **Lower numbers.**
  - "if your program calls for sets of eight reps at a given weight and you only complete six reps, the app may recommend slightly less weight next time" [MF-lower].
  - "progression recommendations are never punitive" [MF-lower].
- **The explanation surface: the Smart Progression wand.** "Tapping the wand opens an explanation of why a recommendation was made" [MF-wand].
  - Blue means information: "No action is required."
  - Yellow "appears when Smart Progression makes a recommendation that differs from what you might expect, such as a larger change in reps or weight."
  - Red means the equipment isn't available [MF-wand].
- **Big jumps.**
  - "Going from 10lb to 15lb is a 50% increase in load ... the app may increase reps instead" [MF-highreps].
  - With "Expand Rep Range" on, it "may try 100 lb x 9 reps instead of forcing 105 lb x 8 reps" [MF-sp].
- **Effort.**
  - RIR is optional but "strongly recommended", on a scale of 0 to 6+ [MF-rir].
  - Generated programmes start with a hard set because "It gives you a clearer RIR anchor" [MF-fail].
- **Deloads and missed sessions.**
  - Deloads are a choice: None, First Cycle or Last Cycle [MF-deload].
  - "If you miss workouts or take time off, your program does not change", because programmes run on cycles, not dates [MF-miss].
  - The structure never changes by itself: "Your program and overall structure will not change automatically" [MF-update].

### 3.7 Alpha Progression

- **The model.**
  - "Internally, the system uses an estimated 10RM."
  - Recommendations combine the reference workout, today's sets, the planned target and the weights available [ALP-prog].
- **Display.**
  - "The blue bubble shows the recommendation for the set it is attached to."
  - The editable fields start from last time's values [ALP-prog].
- **Lower numbers.**
  - "Underperformance can reduce what it would otherwise have suggested for the next set; it does not have to wait until your next workout to respond."
  - "A lower recommended weight does not automatically mean a worse set or a step backward." [ALP-prog]
- **Big jumps.**
  - 20 kg to 25 kg dumbbells "is a 25% increase". The worked example builds to 20 kg × 15, then moves to 25 kg × 6.
  - "The transition at 15 reps belongs to this example; it is not a fixed threshold" [ALP-prog].
- **Effort.**
  - RIR is optional, but "Once you enable it, however, you must enter RIR for every set you log."
  - Without it, the app "uses its own algorithm to infer RIR from your performance" [ALP-prog].
- **Deloads and beginners.**
  - Plans default to 4 weeks.
  - "For beginners, we recommend starting without RIR, periodization, or a deload" [ALP-gen].
  - There is no recommendation the first time an exercise is done [ALP-prog].

### 3.8 Boostcamp

- **Progression.** "Hit your reps and the app increases the load next session" [BC-home].
- **The explanation is the programme author's.** Programme pages carry the author's rules. Its GZCLP page is the example [BC-gzclp]:
  - main-lift failures go 5×3 → 6×2 → 10×1 at the same weight;
  - after that, "rest for 2-3 days and test for a new 5 Rep Max. Use 85% of this number to start a new cycle at 5x3";
  - accessories: "If you fail 3 sets of 15 reps, lower weight by 10-15% and try again".
  - The app follows the programme "with auto-progression and built-in coaching notes" [BC-gzclp].
- **Effort.** RPE (5 to 10) and RIR fields on every set, for programmes that use them [BC-feat].
- **Pro.** Pro adds "a builder that generates a starter plan from a short questionnaire" [BC-feat].
- No public help centre was found.

### 3.9 Gravl

- **Why this weight.** "Tap Insights ... The sheet is headed with the weight it is explaining, for example Why 40 kg today?" It walks through "your last session on that exercise, the exertion rating you gave it, and where the exercise sits in today's workout" [GV-weights].
- **Effort.**
  - "Could you do more? (but with good form, of course)". It is asked "when all sets of an exercise are done", with "one of the three possible values".
  - It is on by default and can be switched off.
  - "Tap '0' only if you went to absolute failure, so our AI won't challenge you more next time" [GV-weights].
- **First guesses and breaks.**
  - "Your initial weights are too low or too high? No problem! Just enter the weights you actually lifted."
  - After a break, a slider takes up to 60% off every recommended weight [GV-weights].
- **Recovery.** Below 60% recovery the workout card reads "Rest recommended" [GV-recovery].
- **Deloads.**
  - A Deload Period is started by the user, and the Train tab shows its dates and intensity.
  - Its sessions get a "Deload workout" badge and "don't update your recommended weights" [GV-deload].

### 3.10 Liftosaur

- **The rule is the text.**
  - "A progression is a rule on one exercise in your program. It runs when you finish the workout and rewrites the program text."
  - "Complete all three sets of five, and after you finish the workout the line reads 160lb. Miss a rep, and it stays at 155lb" [LS-prog].
  - Misses are part of the rule: lp(5lb, 2, 1, 10lb, 3) means +5 lb after 2 good sessions and −10 lb after 3 failed ones [LS-script].
- **A preview at the point of change.**
  - "Complete all working sets of an exercise, and the app shows what the rule will do under the sets. Exercise Changes lists the new weights or reps."
  - "Tap Suppress under the preview to keep the program as it is after this workout" [LS-prog].
- **Deloads.** "Write progress: none on a deload day to skip it there" [LS-prog].
- **Notes.** Author notes written as // comments are "shown to the user during workout" [LS-script].
- **Playground.** It lets you "Simulate workouts to see how weights, reps and state variables change from week to week" [LS-play].

### 3.11 Side by side

| App          | Progression                                          | Lower numbers, where explained      | Deloads                          | Effort input                   |
| ------------ | ---------------------------------------------------- | ----------------------------------- | -------------------------------- | ------------------------------ |
| RP           | Load up a few % a week; a rep if the jump is too big | Help centre; icon reads "Regressed" | Last week of every block         | 4 questions; required          |
| JuggernautAI | RPE-driven; next sets adjust in-session              | ℹ️ and in-app FAQ                   | Scheduled, with tapers to a meet | Readiness + RPE every main set |
| MacroFactor  | Beat "mid-range + RIR"                               | Wand (yellow = unexpected); help    | Optional, first or last cycle    | RIR 0–6+, optional             |
| Alpha        | e10RM, per set, within session                       | Help article                        | Optional; off for beginners      | RIR optional; inferred         |
| Boostcamp    | Author's rules                                       | Programme page (fail protocol)      | Programme's own                  | RPE/RIR fields                 |
| Gravl        | Last session + exertion + position                   | "Why 40 kg today?" sheet            | User-started period              | 3-value question, default on   |
| Liftosaur    | Script (lp/dp/sum)                                   | Preview under the sets              | `progress: none`                 | `+` asks when written          |
| Hevy Trainer | Automatic weight progression                         | Not stated on Hevy's pages          | None found                       | RPE 6–10, optional             |
| Fitbod       | Varied by mStrength; e1RM                            | Help: "not a verdict"               | None found in articles read      | RiR 0–4+, optional             |

### 3.12 What this means for Tropos under Lift4's quiet rule

1. **The quiet rule is the norm, not an outlier.** Every app that sets numbers shows the number and keeps the why one tap away [MF-wand] [GV-weights] [ALP-prog] [RP-app]. None writes a reason under every number. MacroFactor's yellow wand is Lift4's rule in other words: speak when a change "differs from what you might expect" [MF-wand].
2. **Gravl's why sheet reads last session, effort rating and order** [GV-weights]. Tropos's "Last:" row (every set) and the optional effort row carry the first two inline. The ordinary case needs no sheet.
3. **Drops.** The apps with a stated rule can say why a weight fell in one line [BC-gzclp] [LS-script]. The continuous models explain drops only in help articles ("never punitive" [MF-lower]; "not a verdict" [FB-srw]). Lift4's two-miss rule and "Down from 100 kg: two sessions under 5 reps" belong to the readable-rule group, and say more in-app than MacroFactor, Alpha or Fitbod.
4. **Open question: the stretched range.** Four apps add reps when the next weight is too big a jump [MF-highreps] [ALP-prog] [RP-prog] [GV-weights]. MacroFactor and Alpha each wrote a help article explaining the high-rep targets this produces. Lift4 does the same above about 15%. A target past the shown range isn't explained by last time's sets, so by the rule it gets the one line. Possible wording: "Reps first: 12.5 kg is a big jump." Owner to confirm.
5. **Effort stays optional.** Most apps make it optional and infer it when missing [MF-rir] [ALP-prog] [FB-srw]. Both feedback-driven apps publish advice on answering honestly [RP-long] [JAI-tips], and JuggernautAI's two pages disagree on which way to round [JAI-rpe]. This supports declining the "reps left" tap. If it is ever reopened, Gravl's is the lightest form found: one question per exercise, three answers, can be switched off [GV-weights].
6. **Lighter weeks: a label and a feel line.** RP says "every set this week feels ultra easy" [RP-app]. JuggernautAI says the deload "can seem like it is too easy" [JAI-phases]. Alpha recommends none for beginners [ALP-gen], and Gravl's deload sessions never move recommended weights [GV-deload]. Lift4 (9) and its "comfortably easy in a lighter week" cue already match.
7. **Stalls, markers and previews.**
   - Only Hevy Trainer nudges on a stall [HV-trainer]. RP adds sets when pumps are low [RP-prog].
   - Hevy and RP mark lifts "progress" or "Regressed" [HV-trainer] [RP-app]. Those are verdicts, not explanations.
   - Liftosaur previews next time's numbers under the sets [LS-prog], but it is a scripting app for people who write programmes.
   - Nothing here argues against Lift4's "no stall cards, no Next time list".
8. **First guesses.** Every app says the first numbers are a guess, or gives none [FB-creates] [GV-weights] [MF-onboard] [ALP-prog]. Lift4's single first-set line matches.

---

## 4. Hybrid

- **Edge**, per the repo's June 2026 analysis, models training interference ("a hard leg day affects your run the next day") and has human coaches reply in-app [REPO-comp] [U]. Its homepage no longer mentions human coaches. It now says sessions are planned so they "help each other instead of competing for your legs" [EDGE].
- Edge's own blog ranks it first among AI coaches for rebuilding "the rest of your week" after a session [EDGE-ai] _(vendor claim)_.
- I found no app that explains the lift–run interaction at the moment it changes a session. Edge markets it as a capability. Lift4 already plans for it: a leg trim during a race build, and "heavy legs before a long or key run is a note in 'Why this session'".

---

## 5. Pattern library: what the best apps do repeatedly

Counts follow the repo's grilling rule. When 3 or more reference apps do something the same way, Tropos should match it unless it has a stated reason not to.

**P1. Effort first in body terms, with a number second.** The talk test, effort words, effort out of 10, or a race you could run at that pace.

- Who: Runna ("full sentences", "short phrases", 7–8/10) [RN-conv] [RN-terms] [RN-tempo-int]; NRC ("talk, laugh or argue freely", 4–5/10; "5K pace") [NRC-10k]; Apple (Easy / Moderate / Hard / All Out) [AP-wos11]; COROS (an effort word in five of its six zone names; "hold a conversation" in Zones 1–2) [CO-zones]; V.O2 ("conversational") [VO2-easy]; Hevy and Strong for lifting (RPE mapped to reps in reserve) [HV-rpe] [STRONG-rpe].
- Count: 6+.

**P2. The session name says what you'll do, and a definition is one step away.**

- Who: Runna (plain names, a briefing, a glossary) [RN-brief] [RN-terms]; Garmin (what / how / why lines) [5kr-adaptive]; NRC (a glossary in every plan) [NRC-10k].
- Runna avoids naming sessions after physiology ("threshold") [RN-tempo-int].
- Count: 3.

**P3. Show the session's shape as steps, each with its own target.**

- Who: Runna [RN-workouts]; TrainingPeaks (a picture: "No longer will they have to read lengthy descriptions") [TPK-builder]; Polar (warm-up, work and cool-down) [PO-rp-man]; COROS [CO-struct]; Apple custom workouts [AP-wos26].
- Count: 5. Tropos already does this (`runSegments.ts`).

**P4. An easy run gets a ceiling, not a target.**

- Who: Runna's "No faster than" [RN-workouts], which its help centre says to treat "as a ceiling, not a target" [RN-easy]. Its heat feature gives easy runs "a slower conversational pace limit" [RN-heat]. NRC frames the same idea as "Easy is an effort, it's not a pace" [GP-nrc].
- The principle is universal; the ceiling-as-UI is explicit only in Runna.

**P5. Explain the purpose before the run, give instructions during it, and say what it did afterwards.**

- Who: Runna (briefing / audio / Workout Insights) [RN-brief] [RN-insights]; Apple (Pep Talk / Alerts / Walk Off) [DCR-wos26]; NRC (guided audio) [NPR-nrc]; Polar (Training Benefit afterwards) [PO-tb]; Garmin (a benefit label after the run) [5kr-te].
- Count: 5.

**P6. A change arrives as "what changed, because why, and your call".**

- Who:
  - Runna Pace Insights: statuses, consent, a "can't tell yet" state, a "not enough data yet" state, and why you got the status [RN-pi]
  - Runna Adapt for Heat: "Accept" or "Keep as planned" [RN-heat]
  - Garmin: "…due to high run mileage" [5kr-adaptive]
  - MacroFactor: a wand that opens "an explanation of why a recommendation was made" [MF-wand]
  - Liftosaur: the rule is written in the programme, and a preview shows what it will do, with Suppress to keep the programme as it is [LS-script] [LS-prog]
  - Boostcamp: the programme author's rule, stated on the programme page [BC-gzclp]
  - Kotcha and Type to Run: they ask how training went [GR-kotcha] [5kr-ttr]
  - Fitbod: explains in its help centre [FB-creates]
- Hevy Trainer is not listed: its own pages don't state its rule (§3.1).
- The counter-example is Garmin Coach: "there was no indication of what it was adapting" [GF-coach].
- Count: 5+.

**P7. Name the week's job in plain words, with one reason.**

- Who: Runna (build and deload weeks; "plan context") [RN-build] [RN-brief]; Polar (named phases, a lighter week every fourth week, and the runner chooses the level after each cycle) [PO-rp]; COROS (five phases, with each week showing its phase) [CO-phases]; Garmin (adaptive plans) [5kr-adaptive].
- Count: 4.

**P8. A status word always comes with an action.**

- Who: Garmin Training Status ("To see improvement, try…") [GA-status-man]; Garmin Readiness ("Time to slow down") [GA-ready-man]; Apple Training Load ("steady", "above", with "the possible impact on their fitness") [PL-load] [AP-wos11]; Runna Pace Status ("Focus on hitting your pace targets and staying consistent!") [RN-pi].
- Count: 3+.

**P9. Running by feel is an option when conditions make pace targets meaningless.**

- Who: Runna (RPE mode, a recommendation for one session, heat adjustment, and "Not Feeling 100%", which can remove pace targets for 3–14 days) [RN-rpe] [RWH-rpe] [RN-heat] [EB-beginner]; Garmin (heart-rate-guided suggestions) [GA-dsw-nz]; NRC (effort first; its pace chart is "the middle of a range") [GP-nrc] [NRC-10k].
- Count: 3.

**P10. For lifting, last time's numbers sit beside today's so the numbers explain themselves.**

- Who: Hevy's PREVIOUS column with last RPE [HV-prev] [HV-rpe]; Alpha Progression's fields, which start from last time's values [ALP-prog]; Gravl's why sheet, which starts from your last session on the exercise [GV-weights].
- Strong's previous-set display could not be confirmed (§3.2).
- Count: 3. This is Lift4's "Last:" decision.

---

## 6. Anti-patterns

1. **Physiology names used as labels with no definition in body terms.** Examples: Garmin's "Anaerobic" and "VO2 Max" [GA-dsw], and V.O2's E/M/T/I/R [VO2-defs] [U]. COROS avoids this: its zone names carry effort words, such as "Aerobic Power (Tempo Effort)", and Threshold is "hard but sustainable for 30-60 minutes" [CO-zones]. Runna deliberately avoids "threshold" as a session name, and still needed help articles to separate tempo, intervals and threshold [RN-tempo-int] [RN-thresh].
2. **AI summaries that repeat the data back.** Strava's are "bland pep talks" in Forbes's headline [FORBES-ai] [U], give "often obvious (and sometimes incorrect) feedback" [FORTUNE-ai], and in one user's words "regurgitated it back to me" [STW-forum]. Garmin's Active Intelligence "continues to restate thin insights" [5kr-gc+]. This is the most visible failure in the category.
3. **Silent adaptation.** Garmin Coach: "there was no indication of what it was adapting" [GF-coach]. The opposite failure is a reason under every changed number, which Lift4 already declined.
4. **A verdict that contradicts what the person felt, without saying why.** Garmin's "Unproductive" after a great run rates "a trending type analysis rather than a judgment of the one run you just completed", and the label doesn't say so [GF-unprod1]. Readiness that stays low is another case [GNETA-ready]. This supports the roadmap's non-feature: no readiness score.
5. **Too many cues.** Runna's pace prompts come "every 30 seconds or so, it becomes very grating" [JUA-runna].
6. **Fixed pace targets with no way out.** One coach says Runna "fails to account for fatigue" [AOL-strava]. Runna answered with RPE mode, Adapt for Heat and features to "dial back the intensity" of plans [5kr-injury].
7. **Numbers that move with no explanation in the app.** Fitbod's lighter days needed a help-centre article [FB-creates]; Lift4 records the same lesson for "60 kg × 12".
8. **Praise in place of an explanation.** Polar's benefit texts open with "Excellent!" and "What a session!" [PO-pacer]; Strava's AI says "keep up the great work!" [FORTUNE-ai]. Tropos's voice guide already bans this. Polar's useful half is the part after the praise: what the session did.
9. **Effort numbers that disagree.** NRC's tempo is 6/10, Runna's is 7–8/10 [NRC-mar] [RN-tempo-int]. Runna's own pages disagree too: its glossary puts easy at 3–5 and steady at 6–7 [RN-terms], its RPE article puts moderate at 4–6 [RN-rpe], and its tempo guide says "70-80% effort" [RN-tempo]. Across apps this is unavoidable; inside one app, keep one scale and let words lead.

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

| Word (shown)          | Talk test (shown)                                     | About        | Used for                                 | Evidence                                                                                                                               |
| --------------------- | ----------------------------------------------------- | ------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Easy**              | You can talk in full sentences.                       | 3–4/10       | easy, long, recovery, warm-up, cool-down | Runna "full sentences" [RN-conv], RPE 3–5 [RN-terms]; NRC 4–5/10 [NRC-10k]                                                             |
| **Steady**            | You can talk, in shorter sentences.                   | 5–6/10       | progression finishes, marathon-pace work | Runna steady 6–7, "comfortably hard" [RN-terms]; NRC 10K pace 6–7/10 [NRC-10k]                                                         |
| **Comfortably hard**  | A few words at a time.                                | 7/10         | tempo                                    | Runna "short phrases" [RN-terms], 7–8/10 [RN-tempo-int]; NRC tempo 6/10 [NRC-mar]                                                      |
| **Hard**              | No chatting, but you could hold it for a few minutes. | 8–9/10       | intervals                                | Runna 8–9/10 [RN-tempo-int]; NRC 5K pace 7–8/10 [NRC-10k]                                                                              |
| **Quick and relaxed** | Fast but smooth, not a sprint.                        | short bursts | strides, short reps                      | Runna strides "fast and controlled, not maximal", about 85–90% [RN-strides]; V.O2 R pace, "fast, but not necessarily 'hard'" [VO2-rep] |

- **Steady and comfortably hard are Tropos's own split.** Runna's glossary uses "comfortably hard" for both steady pace and tempo [RN-terms]. No cited page gives Apple's labels number bands, so Apple is not used as evidence for the "About" column.
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
| **Session card** (Home, Train, Run tab)              | Name (§7.3), duration or distance, **one** line: the feel line, or the pace. Easy and long runs show the talk test plus a ceiling ("6:10 /km or slower"). Workouts show the range plus the effort word.                                                                                               | Why; physiology; praise                                                       | P1, P2, P4; Runna [RN-workouts] [RN-easy]                                                        |
| **ⓘ "About this run" sheet** (tap the name or the ⓘ) | Four short lines: **What it is · How it should feel · Why it's in your week · If it feels wrong** ("Can't talk? Slow down, or walk for a minute. That's still the run."). Then the step list, then "Coaches also call this…". Same affordance as Lift4's rules sheet, merged with "Why this session". | A lecture; more than one reason                                               | Runna briefing and glossary [RN-brief] [RN-terms]; Garmin what/how/why [5kr-adaptive]; Lift4 (3) |
| **Pre-run screen**                                   | The step list with each step's target (already there) and the purpose line once.                                                                                                                                                                                                                      | Repeating the sheet                                                           | Runna stages [RN-workouts]; Polar phases [PO-rp-man]                                             |
| **Audio at the start**                               | One sentence: the session and its feel. Already close: "Easy running. Conversational pace — strides at the end."                                                                                                                                                                                      | Pep talk                                                                      | Apple Pep Talk [DCR-wos26]; NRC [NPR-nrc]                                                        |
| **Audio during**                                     | Step instructions only; a pace nudge rarely, and on easy runs only when faster than the ceiling.                                                                                                                                                                                                      | Frequent pace flips                                                           | Runna complaint [JUA-runna]                                                                      |
| **Post-run**                                         | Silent when the run matched its type; the existing pace verdict carries it. One line when it didn't, e.g. "Faster than easy today. Easy days work best slower, so the hard runs get your energy."                                                                                                     | "Great effort"; restated stats                                                | Polar's "what it did" [PO-tb]; Strava's anti-pattern [FORTUNE-ai] [STW-forum]                    |
| **A change the plan made**                           | One line on the session it touched: _what changed — because…_ in the person's terms. Pace changes need a yes (`PaceInsightCard` already asks). Add Runna's "mixed results, no change yet" and "not enough data yet" states if they're missing.                                                        | Unexplained changes; a reason under every number                              | Runna Pace Insights [RN-pi]; Garmin "due to…" [5kr-adaptive]; Garmin Coach complaint [GF-coach]  |
| **The week**                                         | A plain label only when the week differs: Lighter week, Taper, Race week. Its reason goes in the sheet, e.g. "Less running this week, so next week's long run starts on fresh legs."                                                                                                                  | Base / Build / Peak vocabulary on the main surface (see §7.0's GLOSSARY note) | Runna build/deload [RN-build]; Polar 3+1 cycles [PO-rp]                                          |

### 7.5 Changes and adaptation, in order of priority

1. **Use one sentence shape for every change the person didn't make:** _[What changed]: [reason in their terms]._ For example:
   - "Shorter than planned: you've run more than usual this week."
   - "Easier today: heavy legs session yesterday."
   - "Down from 100 kg: two sessions under 5 reps" (this is Lift4's wording, which already fits).

   Apply it across `AdjustWeekSheet`, `FellBehindSheet`, the ease-week nudge and the lighter week, so running and lifting changes read the same.

2. **Pace changes need a yes.** This already ships (`PaceInsightCard`) and matches Runna [RN-pi]. Add the "mixed results, no change yet" status only if the engine can produce it honestly. Add a "not enough runs yet" status for new runners, as Runna's fifth status does [RN-pi].
3. **Run by feel today.** This is the manual version of roadmap item B2 (heat), cheap now. It hides pace targets for one run and keeps the effort words. Evidence: Runna's per-session RPE recommendation and heat feature [RWH-rpe] [RN-heat]. It fits Lift4 (1): "any number is one tap from changed".
4. **Hybrid lines only where something changed.** When the scheduler eases a run because of a leg session, or flags heavy legs before a long run, say so in one line on that session ("Easy today: heavy legs session yesterday"). Never a general explainer about lifting and running. This is where Tropos can beat Edge's marketing claim [REPO-comp] with an explanation at the moment it matters.

### 7.6 Lifting: what this research confirms about Lift4, two small additions and one open question

- **Confirmed:**
  - "Last:" showing every set mirrors Hevy's PREVIOUS column, and the way Alpha Progression and Gravl start from last time's numbers (P10).
  - The single stated progression rule mirrors Liftosaur's lp() and dp() rules and Boostcamp's programme pages [LS-script] [BC-gzclp]. Hevy's own pages don't state Trainer's rule (§3.1).
  - One line when the plan lowers a lift is what Fitbod, MacroFactor and Alpha leave to help articles [FB-creates] [MF-lower] [ALP-prog].
  - Silence when the numbers explain themselves is what Hevy's logger does. Strong was not re-checked (§3.2). Hevy Trainer is not silent: it adjusts weights, marks lifts that progressed and sends stall reminders [HV-trainer]. MacroFactor's yellow wand speaks only when a change "differs from what you might expect" [MF-wand].
  - The other apps that set numbers also keep the why one tap away (§3.12).
- **Addition 1: label every value on the optional effort row in words,** as Hevy does on its RPE scale [HV-rpe]. For example: "8 · 2 reps to spare", "9 · 1 rep to spare", "10 · nothing left". This keeps Lift4's plain-words rule ("reps to spare").
- **Addition 2: give "Lighter week" a one-line reason in the rules sheet,** e.g. "Half the sets, same weights, so the next weeks' work keeps landing." Runna's framing: "the deload weeks are what allow the build weeks to keep working" [RN-build]. RP's in-app line for its deload week: "just make sure every set this week feels ultra easy" [RP-app].
- **Open question for the owner: the stretched range.** When the next weight up is a jump of more than about 15%, Lift4 adds reps first. The new target then isn't explained by last time's sets, so by the quiet rule it gets the one line (§3.12, item 4).

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

These were not checked on 2026-10-07. Each is a short list of what to check, not a finding.

- **Edge:** in-app copy for interference and deload weeks. Only its homepage and its blog were seen.
- **Strong:** whether it shows the last set beside the current one, and whether it has any progression feature (§3.2).
- **The six blocked pages:** [FORBES-ai], [ST-community], [TP-runna], [MH-kotcha], [AI-buddy] and [VO2-defs]. The claims that rest on them are marked [U].
- **On-screen copy for the lifting apps:** §3.4–§3.10 come from help centres, blogs, product pages and App Store listings. Only RP's wording was read from the app's own shipped copy.
- **User confusion threads** (r/Runna, r/Garmin, r/fitbod) weren't read. App Store reviews and Garmin forum threads stand in for them here.

---

## 9. Checked against the cited pages (2026-10-07)

Every URL in the first pass's Sources list was fetched on 2026-10-07. 100 of 108 were read in full. The5krunner answered only a crawler user agent. Hevy and Fitbod help articles were read through their Zendesk API. Quotes below are the page's current wording. The lifting apps added in §3.4–§3.12 were read the same day; §3 gives their method.

### 9.1 Links that failed

- Dead: [BC-colors] returns 404. [RCUK-ff] times out (504). The TrainingPeaks colour bands are on [TPK-guide].
- Blocked, not checked: [FORBES-ai], [ST-community], [TP-runna], [MH-kotcha], [AI-buddy], [VO2-defs]. "Bland pep talks" survives only in the Forbes URL.
- Moved: [ST-plans] is now [ST-plans-new]. [AS-kotcha] is now "Kotcha - Running & Trail", "Built with Eliud Kipchoge and Kilian Jornet".

### 9.2 Corrections

Where the first pass differed from the page. §1–§8 follow the pages.

**Strava (§1, §2.2)**

- "Stating the obvious", the "incongruous comparisons" line and "great effort" on warm-ups are not on [STW-forum]. It does carry the "utterly pointless application of an LLM" quote. Fortune reports "often obvious (and sometimes incorrect) feedback" [FORTUNE-ai].
- The 14 May 2026 integrations "bring your lifts directly into Strava". They are strength workouts, not runs [ST-may26].
- The 42-day and 7-day windows are not on [ROADCC-ff]. The quote is.

**Runna (§2.1)**

- Strides are "15-20 seconds" at "about 85-90% of max effort", 4–6 reps, "60-120 seconds of walking recovery" [RN-strides]. Not 3–4 × 80–100 m.
- Recovery run: "a short, low-intensity run done after a hard workout… use the same pacing as an easy run" [RN-terms].
- "Speak in short phrases, but not hold a full conversation" is from [RN-terms], not [RN-tempo-int].
- "Most-loved features" is Runna's blog [RN-blog-easy], not Tom's Guide. The help centre says: "Treat 'no faster than' pace guidance as a ceiling, not a target" [RN-easy].
- A pace range with "the target pace sitting right in the middle" comes from [RWH-problem]. [RN-workouts] shows single targets.
- "No two customers receiving the same briefing" is from [RN-beginner].
- Briefings are AI-written. Each workout also has a human Coach's Comment that "explains the session structure" [RN-brief].
- The RPE switch list (fatigue, heat, hills, trails, altitude, illness) is Runna's own [RN-rpe].
- Pace targets off for 3–14 days is the "Not Feeling 100%" feature, reported only by [EB-beginner].
- Beginner plans: "only transitions to distance when the runner is ready" [RN-beginner].
- Pace Insights has five statuses. The fifth is "Monitoring Your Pace Data: We don't have enough data yet" [RN-pi].
- Adapt for Heat: "Review suggestion", then "Accept" or "Keep as planned". Easy runs get "a slower conversational pace limit". It triggers above about 20 °C feels-like [RN-heat].
- "Predicted race time updates as fitness changes" is not on [5kr-ai]. The estimated race time "sets the pace target for every workout".
- "Way too fast", "too spicy", "daily fatigue", ".25 to .10 miles" and "kind of confusing" are not on [JUA-runna] or [RWH-problem]. What is there: pace prompts "every 30 seconds or so… very grating" [JUA-runna], and "fails to account for fatigue" [AOL-strava]. Runna was "adding features to let its customers dial back the intensity of their plans" [5kr-injury].

**NRC (§2.3)**

- Plans include a per-mile Pace Chart. "Treat each pace target as the middle of a range… you are not a robot." "When in doubt be sure to focus on effort" [NRC-10k].
- "Never about running a 9-minute mile pace" is from [HS-nrc].

**Garmin (§2.4)**

- Exact: "there was no indication of what it was adapting" [GF-coach].
- Heat as the cause of "Unproductive" is not on [GF-unprod2] or [TG-status], so it is not used. The manual corrects for heat above 22 °C [GA-status-man].
- Garmin Coach adapts from a difficulty rating. Race Training and DSW use watch data [5kr-adaptive].
- "You're in ideal form" is from [GA-status-blog].

**Others**

- COROS zone names carry effort words, e.g. "Zone 3: Aerobic Power (Tempo Effort)… conversation is difficult" [CO-zones], so COROS does not belong in anti-pattern 1. Phases are Base, Build, Peak, Taper/Race and Transition [CO-phases].
- TrainingPeaks: "They will quickly be able to see workout elements like warm-up, main set, and cool-down. No longer will they have to read lengthy descriptions…" [TPK-builder].
- Apple's 1–3, 4–6, 7–8 and 9–10 bands are on no cited page. The Workout Buddy lines are not on [AP-wos26].
- Polar's praise-first lines are in the watch manuals [PO-pacer], not [PO-tb]. Maximum training says "What a session!". The 14-minute warm-up is not on [PO-rp-man].
- V.O2 Easy: "59-74% of VO2max or 65-79% of your HRMax" [VO2-easy].
- [RG-ai] names TrainAsONE, Runna, COROS, Garmin Coach and its own product. It is a vendor. Coach Leo, Coopah and Athletica are not on it.
- Kotcha's "Progressive Run" example is not in [GR-kotcha].
- Strong logs RPE on "a 6-10 scale" mapped to reps in reserve [STRONG-rpe]. The previous-set quote was not found.
- Fitbod "80–100% fresh" is not on [FB-recovery]. "Cirque du soleil" is only on [DRM-fitbod].
- Hevy Trainer "automatically adjusts your working weights" [HV-trainer]. Nothing says it lowers them. "50lbs x 10 @ 8.5 RPE" is from [HV-rpe].
- [AF-po] is a vendor (Anatomik ranks itself first).
- Edge's homepage no longer mentions human coaches [EDGE]. That claim rests on [REPO-comp].

### 9.3 What the first pass missed

1. Runna shows why a change happened. Pace Insights lists "Why you received your latest status" and "Which workouts contributed to it" [RN-pi]. Mileage Insights has four statuses, can be dismissed, and shows the race-time impact [RN-mileage].
2. Runna has an "if the pace feels wrong" answer: "Try slowing down by 5–10 sec/km rather than taking a walking break". On hills, run to effort [RN-tempo-int].
3. Runna answers "why did my plan reduce this week?": "Because your body needs it" [RN-deload-ntr]. Build and deload weeks show ahead in the mileage graph [RN-build].
4. Runna's effort numbers disagree with themselves. Easy is 3–5 and steady 6–7, which "should feel 'comfortably hard'" [RN-terms]. Moderate is 4–6 in [RN-rpe]. Tempo is "70-80% effort" in [RN-tempo].
5. "Tempo" means different paces in different apps:
   - Runna: about 10K to half-marathon pace [RN-tempo-int]
   - Garmin: "your so-called marathon pace" [GA-dsw]
   - COROS: "marathon pace" [CO-zones]
   - NRC: "30-35 seconds slower than your 5K pace" [NRC-10k]
6. Runna has four long-run types and explains why long-run pace varies [RN-longruns]. Longer runs may show "conversational" with no pace [RN-conv].
7. Canned lines wear out. The5krunner says Garmin's "standard phrases will grate after a while" [5kr-adaptive].
8. Verdicts without a way forward confuse people. Garmin Coach users got "Room to Grow" even after hitting their targets [GF-coach]. "Unproductive" is "a trending type analysis rather than a judgment of the one run you just completed" [GF-unprod1].
9. Generated voices get facts wrong. Workout Buddy gave a 16-day streak that was really 307 days: "No human would phrase it that way" [DCR-wos26].
10. Apple pairs the load band with "the possible impact on their fitness" [AP-wos11].
11. Polar and NRC leave the choice to the runner. Polar: "it's up to you to choose" [PO-rp]. NRC: "Adjust!… The best coach for you is you" [NRC-10k]. Kotcha asks each week: "log how you're currently feeling, and hit validate to agree" [GR-kotcha].
12. Fitbod changes workouts in the background: "a workout can change without you doing anything" [FB-refresh].
13. Hevy can limit PREVIOUS to the same routine [HV-prev-help].
14. V.O2: Reps are "fast, but not necessarily 'hard'" [VO2-rep].

### 9.4 What this means for §7

- Apple's number bands are on no cited page, so §7.2's effort ladder rests on Runna's own scale [RN-terms] and NRC's. Runna uses "comfortably hard" for both steady and tempo, so Tropos's split between them is Tropos's own choice.
- Runna's fifth Pace Insights status supports a "not enough runs yet" state on Tropos's pace card (§7.4, §7.5) [RN-pi].
- The lifting apps in §3.4–§3.12 support Lift4 as locked. The one open question is the stretched range (§3.12, item 4; §7.6).

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
- [RN-mileage] https://support.runna.com/en/articles/11794078-what-are-mileage-insights
- [RN-heat] https://support.runna.com/en/articles/15647483-how-does-runna-adapt-my-workouts-for-heat-and-humidity
- [RN-heat-press] https://www.runna.com/press/runna-announces-new-updates
- [9to5-heat] https://9to5mac.com/2026/07/29/runna-now-automatically-adapts-training-paces-based-on-heat-and-humidity/
- [5kr-heat] https://the5krunner.com/2026/07/29/runna-launches-adapt-for-heat-to-adjust-pace-for-weather/
- [5kr-ai] https://the5krunner.com/2026/09/28/is-runna-ai/
- [RN-brief] https://support.runna.com/en/articles/13169751-what-are-workout-briefings
- [RN-insights] https://support.runna.com/en/articles/10494265-what-are-workout-insights
- [RN-build] https://support.runna.com/en/articles/15013260-what-is-a-build-week-understanding-progressive-overload-in-your-running-plan
- [RN-deload-ntr] https://support.runna.com/en/articles/15013028-why-does-my-new-to-running-plan-go-down-in-distance-a-guide-to-deload-weeks
- [RN-longruns] https://support.runna.com/en/articles/9357249-understanding-the-long-runs-in-your-runna-plan
- [RN-beginner] https://www.runna.com/press/runna-introduces-updated-beginner-running-plans-for-2026
- [EB-beginner] https://endurance.biz/2026/industry-news/runna-updates-beginner-and-return-to-running-training-plans/
- [TG-easy] https://www.tomsguide.com/features/youre-probably-running-your-easy-miles-too-fast-heres-how-to-pace-yourself
- [TG-runna] https://www.tomsguide.com/wellness/running/this-is-the-running-app-im-using-to-train-for-my-sixth-marathon-and-it-just-got-even-better-for-beginners-too
- [RN-blog-easy] https://www.runna.com/blog/everything-you-need-to-know-about-embracing-your-easy-runs
- [TP-runna] https://www.trustpilot.com/review/runna.com (blocked on 2026-10-07 by a bot wall or the egress proxy; not checked)
- [JUA-runna] https://justuseapp.com/en/app/1594204443/runna-running-training-plans/reviews
- [RWH-problem] https://www.runningwestwardho.co.uk/post/the-problem-with-runna
- [5kr-injury] https://the5krunner.com/2026/02/21/runna-ai-marathon-training-injury/
- [AOL-strava] https://www.aol.com/articles/inside-controversy-surrounding-strava-run-162700562.html

### Strava

- [ST-plans] https://support.strava.com/hc/en-us/articles/216918647-Training-Plans-for-Runners (moved: now [ST-plans-new])
- [ST-plans-new] https://support.strava.com/en-us/articles/15401942-training-plans-for-runners
- [ST-may26] https://stories.strava.com/articles/whats-new-on-strava-may-2026
- [ST-ai-press] https://press.strava.com/articles/stravas-athlete-intelligence-translates-workout-data-into-simple-and
- [FORBES-ai] https://www.forbes.com/sites/cyrusfarivar/2024/10/12/strava-upsets-fans-with-new-ai-feature-that-promises-insights-but-provides-bland-pep-talks/ (blocked on 2026-10-07 by a bot wall or the egress proxy; not checked)
- [FORTUNE-ai] https://fortune.com/2024/10/11/strava-app-artificial-intelligence-fitness-athletic-memes
- [ST-community] https://communityhub.strava.com/strava-features-chat-5/athlete-intelligence-feedback-7587 (blocked on 2026-10-07; it now redirects to an archived forum; not checked)
- [STW-forum] https://singletrackworld.com/forum/bike-forum/strava-athlete-intelligence/
- [ST-re] https://stories.strava.com/articles/how-to-use-relative-effort-to-refine-your-training
- [ROADCC-ff] https://road.cc/?p=45241 (read 2026-10-07 at https://road.cc/content/news/134008-strava-updates-fitness-and-freshness-heart-rate-monitor-users)
- [RCUK-ff] https://roadcyclinguk.com/?p=105483 (dead: timed out with a 504 on 2026-10-07)

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
- [BC-colors] https://www.joinbasecamp.com/support/compliancecolors (dead: 404 on 2026-10-07)
- [TPK-builder] https://www.trainingpeaks.com/learn/articles/introducing-trainingpeaks-workout-builder/

### Apple

- [AP-wos11] https://www.apple.com/newsroom/2024/06/watchos-11-brings-powerful-health-and-fitness-insights/
- [PL-load] https://www.pocket-lint.com/what-is-watchos-training-load/
- [DCR-wos26] https://www.dcrainmaker.com/2025/07/apple-watchos-26-workout-beta-real-world.html
- [AI-buddy] https://appleinsider.com/inside/watchos-26/tips/how-to-train-smarter-with-workout-buddy-in-ios-26-watchos-26 (blocked on 2026-10-07 by a bot wall or the egress proxy; not checked)
- [AP-wos26] https://www.apple.com/newsroom/2025/06/watchos-26-delivers-more-personalized-ways-to-stay-active-and-connected/

### Polar

- [PO-tb] https://support.polar.com/us-en/support/training_benefit_feature
- [PO-tb2] https://www.polar.com/en/smart-coaching/training-benefit
- [PO-pacer] https://support.polar.com/e_manuals/pacer/polar-pacer-user-manual-english/training-benefit.htm
- [PO-rp] https://support.polar.com/en/support/polar_running_program
- [PO-rp-man] https://support.polar.com/e_manuals/M200/Polar_M200_user_manual_English/Content/Polar-Running-Program.htm
- [PO-rp-blog] https://www.polar.com/blog/polar-running-program/

### Newer entrants and V.O2

- [GR-kotcha] https://grittyrunners.co.uk/2026/04/17/kotcha-review/
- [MH-kotcha] https://marathonhandbook.com/eliud-kipchoge-enters-the-app-game-but-not-how-youd-expect/ (blocked on 2026-10-07 by a bot wall or the egress proxy; not checked)
- [AS-kotcha] https://apps.apple.com/us/app/kotcha-your-new-running-coach/id6746164787 (the listing is now titled "Kotcha - Running & Trail")
- [5kr-ttr] https://the5krunner.com/2026/03/30/type-to-run-weekly-coach/
- [RG-ai] https://therunninggenie.com/blog/best-ai-running-coach-apps (vendor: ranks its own product)
- [VO2-defs] https://vdoto2.com/learn-more/training-definitions (blocked on 2026-10-07 by a bot wall or the egress proxy; not checked)
- [VO2-easy] https://news.vdoto2.com/2017/11/whats-easy-pace/
- [VO2-rep] https://news.vdoto2.com/2018/01/whats-repetition-pace/

### Lifting

- [HV-prev] https://www.hevyapp.com/features/track-exercises/
- [HV-prev-help] https://help.hevyapp.com/hc/en-us/articles/36011896355479-How-to-Use-Previous-Workout-Values-to-Improve-Performance-in-Hevy
- [HV-rpe] https://help.hevyapp.com/hc/en-us/articles/34490600233111-RPE-vs-RIR-What-They-Mean-and-How-to-Use-Them-in-Hevy
- [HV-trainer] https://www.hevyapp.com/features/workout-plan-generator/
- [HV-trainer-help] https://help.hevyapp.com/hc/en-us/articles/38385724273047-Hevy-Trainer-Explained-How-It-Builds-Your-Workout-Program
- [HV-announce] https://www.hevyapp.com/announcing-hevy-trainer/
- [HV-settings] https://help.hevyapp.com/hc/en-us/articles/43572343844247-How-Hevy-Trainer-Settings-Work
- [AF-po] https://anatomikfit.com/en/blog/progressive-overload-apps/ (third-party vendor: Anatomik ranks its own app first)
- [STRONG] https://strong.app
- [STRONG-rpe] https://help.strongapp.io/article/230-about-rpe
- [FB-recovery] https://fitbod.me/blog/muscle-recovery/
- [FB-creates] https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout
- [FB-section] https://help.fitbod.me/hc/en-us/sections/360001078993-Understanding-Fitbod-How-It-Works
- [FB-break] https://help.fitbod.me/hc/en-us/articles/34320813009431-Took-a-Break-Here-s-How-to-Recalibrate-Your-Fitbod-Recommendations
- [FB-srw] https://help.fitbod.me/hc/en-us/articles/43489869175063-How-does-Fitbod-decide-my-sets-reps-and-weight
- [FB-recovery-help] https://help.fitbod.me/hc/en-us/articles/360006269014-Muscle-Recovery
- [FB-refresh] https://help.fitbod.me/hc/en-us/articles/42333470514455-Why-did-my-workout-change-Understanding-workout-refreshes
- [JUA-fitbod] https://justuseapp.com/en/app/1041517543/fitbod-workout-fitness-plans/reviews
- [TR-fitbod] https://www.techradar.com/health-fitness/fitbod-app-review
- [DRM-fitbod] https://dr-muscle.com/fitbod-app-review-alternative/ (written by a competitor)

### Lifting: RP, JuggernautAI, MacroFactor, Alpha Progression, Boostcamp, Gravl, Liftosaur

- [RP-prog] https://help.rpstrength.com/hc/en-us/articles/43864744488599-Hypertrophy-App-Progressions
- [RP-drop] https://help.rpstrength.com/hc/en-us/articles/43864718052887-Sudden-Drop-In-Workload
- [RP-long] https://help.rpstrength.com/hc/en-us/articles/43864739113239-Long-Workouts
- [RP-meso] https://help.rpstrength.com/hc/en-us/articles/43549555189399-Change-the-Length-of-Your-Mesocycle
- [RP-app] https://training.rpstrength.com/assets/index-6f9ec378.js (RP web app's shipped copy, read 2026-10-07; the file name changes each release)
- [JAI-ind] https://help.jtsstrength.com/en/articles/3-how-juggernautai-is-individualized-to-you
- [JAI-rpe] https://help.jtsstrength.com/en/articles/2-all-about-rpe-and-rir
- [JAI-ready] https://help.jtsstrength.com/en/articles/15-readines-rating
- [JAI-load] https://help.jtsstrength.com/en/articles/22-loading-strategies
- [JAI-phases] https://help.jtsstrength.com/en/articles/17-training-phases
- [JAI-miss] https://help.jtsstrength.com/en/articles/43-how-to-respond-to-missed-lifts
- [JAI-tips] https://www.juggernautai.app/blog/5-tips-to-get-the-most-out-of-the-juggernautai-app
- [JAI-v25] https://www.juggernautai.app/blog/juggernautai-25
- [JAI-v3] https://www.juggernautai.app/blog/juggernautai-v3-0-is-here
- [MF-page] https://macrofactor.com/workouts/
- [MF-launch] https://macrofactor.com/mm-jan-2026/
- [MF-onboard] https://macrofactor.com/welcome-to-macrofactor-workouts/
- [MF-po] https://help.macrofactorapp.com/en/articles/372-what-does-progressive-overload-mean-in-macrofactor-workouts
- [MF-lower] https://help.macrofactorapp.com/en/articles/373-why-does-the-app-sometimes-recommend-lowering-weight-or-reps
- [MF-wand] https://help.macrofactorapp.com/en/articles/391-what-does-the-smart-progression-wand-mean
- [MF-sp] https://help.macrofactorapp.com/en/articles/305-understanding-and-using-smart-progressions
- [MF-highreps] https://help.macrofactorapp.com/en/articles/392-why-am-i-being-recommended-very-high-reps
- [MF-rir] https://help.macrofactorapp.com/en/articles/385-what-is-rir-and-how-should-i-use-it-during-training
- [MF-fail] https://help.macrofactorapp.com/en/articles/397-is-it-normal-to-see-failure-sets-or-rir-decreasing-across-sets
- [MF-deload] https://help.macrofactorapp.com/en/articles/297-deload-first-cycle-or-last-cycle
- [MF-miss] https://help.macrofactorapp.com/en/articles/382-what-happens-to-my-program-if-i-miss-workouts-or-take-time-off
- [MF-update] https://help.macrofactorapp.com/en/articles/369-how-often-does-my-program-update
- [ALP-prog] https://alphaprogression.com/en/blog/alpha-progression-progression-recommendations
- [ALP-gen] https://alphaprogression.com/en/blog/alpha-progression-workout-plan-generator
- [BC-home] https://www.boostcamp.app/
- [BC-feat] https://www.boostcamp.app/features
- [BC-gzclp] https://www.boostcamp.app/coaches/cody-lefever/gzcl-program-gzclp
- [GV-weights] https://gravl.ai/help/gravl-science-understand-your-recommended-weights
- [GV-recovery] https://gravl.ai/help/gravl-muscle-fatigue-and-recovery
- [GV-deload] https://gravl.ai/help/deload-weeks-everything-you-need-to-know
- [LS-prog] https://www.liftosaur.com/features/progressions
- [LS-script] https://www.liftosaur.com/doc/liftoscript
- [LS-play] https://www.liftosaur.com/features/playground

### Hybrid and repo

- [EDGE] https://www.findyouredge.app/ (vendor; the homepage no longer mentions human coaches)
- [EDGE-ai] https://www.findyouredge.app/news/best-ai-running-coach-apps-2026 (vendor's own ranking)
- [REPO-comp] `docs/competitive-analysis-running-2026.md` (repo; researched 2026-06-11)
- Tropos code read for §7.0: `src/lib/runSessionExplainer.ts`, `src/lib/workoutTemplates.ts`, `src/lib/runLabels.ts`, `src/lib/runSegments.ts`, `src/lib/runCueCopy.ts`, `src/components/run/IntervalStepShell.tsx`, `src/components/run/PaceInsightCard.tsx`, `src/components/program/ProgrammeRunSection.tsx`, `GLOSSARY.md` ("Phase disclosure")
