# The training-engine prompt

The reusable prompt for a multi-agent pass on Tropos's lifting and running:
close the evidence gaps, extract the seams a simulation needs, build a simulator
that drives the real engine for synthetic people over 16–52 weeks, test the
app end to end, fix what is broken, and decide and build the changes to
locked decisions under the owner's delegation (`owner-answers.md`, 2026-10-07).
Paste the block and choose the scope line. It runs as a
workflow (`/effort ultracode`, or the word "workflow").

Its inputs are in [`docs/training-engine-2026-10/`](../training-engine-2026-10/README.md),
gathered on 2026-10-06 at `55c195a`: audits of the lifting, running and test
code; lifting and running evidence, checked against its primary sources on
2026-10-07; how other apps explain training; the
owner's coaching sources; the owner's answers to the open calls; and the
harnesses behind every measured number. The
block points into them rather than restating them. What each clause buys is
explained below the block.

---

## The prompt

```
Run the training-engine pass on Tropos as a WORKFLOW.

[SCOPE — keep one line. The owner's order is lifting first, then running.
 Phases 0–3 are shared: the first run builds them, a later run re-verifies
 and reuses them.
   LIFTING: Phases 0–4 and 6 (lifting questions).
   RUNNING: Phases 0–3, 5 and 6 (running questions).
   BOTH:    every phase.]

THE GOAL, in the owner's words: make the lifting and the running "as good as
humanly possible" — the most advanced lifting model there is (strength and
powerlifting, hypertrophy, powerbuilding) and running at the Strava/Runna
level — and PROVE it. Simulate people using the app on their own goals for
16–52 weeks ("put 10 kg on my bench", "a 16-week lifting programme", "a
marathon in a year while my lifting keeps improving", each depending on what
kind of lifter they are), measure the outcomes against research, and test the
real app end to end, because "a lot of the issues we have on the app is just
not knowing if stuff works".

READ FIRST, before the first edit:
- docs/training-engine-2026-10/README.md and every file it indexes. They are
  this prompt's reference: audits of the code at 55c195a (every claim a
  file:line or a measurement), the evidence (each claim marked [VF] full
  text, [VA] abstract or page, [U] unchecked, [R] unidentified or [C]
  computed), the
  owner's coaching sources, the explanation research, and the harnesses
  behind the numbers. Below, a bare name (lifting-evidence,
  running-engine-audit, harnesses/…) means a file in that folder.
- owner-answers.md in that folder: the owner's answers to the open calls
  (A1–A12, 2026-10-07) and the rules for the questions this run finds. They
  are decided: build on them, don't ask again.
- CLAUDE.md; CODING_STANDARDS.md for each area you touch; GLOSSARY.md.
- .claude/plans/programme-run-followups.md rows Lift1–Lift4, Run9, Run9a,
  Run10, Run13–Run18, Pgm4–Pgm7 and Time1. Lift4 is the lifting system's
  spec.
- docs/training-programming-claude-handoff.md and the two handoffs it
  indexes (ledgers, non-adoptions, verification matrices).
- docs/adr/ 0002, 0008, 0009, 0010 (with both 2026-08-03 addenda), 0011, 0012.
- Before UI or copy: docs/voice-and-tone.md and DESIGN_GUIDE.md §0, §10, §14.
  Before functions/: docs/agents/functions-deploy.md. Before E2E:
  docs/agents/capture-rig.md.

GROUND YOURSELF
- `git fetch --unshallow`, `npm ci`, `(cd functions && npm ci)`.
- Baseline: `npm run verify`, recorded (2026-10-06: passed in 603 s; 11,784
  unit tests passed, 372 skipped). Every PR reports movement against it.
- Probe the network with a PubMed E-utilities query. On 2026-10-06 this
  environment's egress policy blocked PubMed, the publishers, the coaching
  sites and the app help centres. On 2026-10-07 PubMed, Europe PMC, Crossref,
  open full text and the coaching and app pages loaded; Springer,
  journals.lww.com, journals.physiology.org and six app pages did not. If
  PubMed is blocked, tell the owner the fix (the environment's Network access
  setting) and run Phase 0 in flag mode.
- The emulator rig works in this container: firebase-tools through npx,
  PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome, builds and
  Playwright output written outside the repo, firestore-debug.log deleted
  afterwards, orphaned `vite preview` children killed.
  test-infrastructure-audit.md §3 has the exact commands.

STANDING RULES
- THE QUIET RULE (Lift4): if last time's numbers explain the new one, the
  app says nothing; if they can't, it says one line, or the rule changes
  until they can. Every design in this pass is held to it, runs included.
- OWNER CALL: Lift4 is the acceptance spec for the lifting system as built.
  The Run locks (Run9a's two-state surface, Run15, Run16, Run17, Run18,
  Pgm6) and RUN-EV-08's consent rule are the same for running. A change to
  what any of them decided is an owner call, and the owner delegated those
  calls on 2026-10-07: owner-answers.md answers the open ones, and its last
  section says how this run answers the ones it finds. An explicit earlier
  owner decision is never reversed without the owner. Every answer is locked
  with the lock-decision skill on its own claude/lock-<id> branch before it
  is built. Locks are append-only.
- THE RUNNING COPY: the simulator and the tests call the code production
  runs. When they need logic that is inline or private, extract it, then call
  it (ADR-0008). ADR-0002: lifts stay split-ordered and runs date-pinned.
  ADR-0009: extend the one Firestore fake. ADR-0010: counting changes go
  through the ADR. ADR-0011: name every new document writer. ADR-0012 stands.
- Existing users keep their plans (Pgm5). Anything that reaches a saved plan
  goes through migrations.ts, the server sanitizer allow-list and a cross
  test.
- Sex stays a cold-start seed only (LIFT-EV-07). An emphasis the person
  chooses is a legitimate input.
- Evidence: a number tagged [U] or [R] stays out of code and copy until
  Phase 0 verifies it. The non-adoption lists bind (both handoffs;
  lifting-evidence §7; running-evidence §8): ranges in place of promises,
  advisory guards in place of risk scores, an effort or talk-test cue beside
  every pace.
- Design for the user base: cold start, 2-day plans, light trainers, the
  lapsed and returning, holidays and illness are first-class personas. iOS
  and web parity for everything a person sees. Injury, illness and pregnancy
  get the existing conservative copy and a pointer to a professional.
- House rules from CLAUDE.md: guarded Firestore writes, `tsc -b`, lint's ✖
  line, the FULL unit suite before pushing a cross-module import, en-GB
  dates, 24-hour times, spaced units, the large-text capture spec green after
  any layout change.

────────────────────────────────────────────────────────────────────────
PHASE 0 — CLOSE THE EVIDENCE GAPS
owner-answers.md A1–A12 are locked as Pgm7 (lemmonchess333/Maiin#2604). If
the Pgm7 row is not on main yet, build on that PR and say so; never re-lock
them. The ADR-0010 addendum they record is in #2601.
The evidence was read against its primary sources on 2026-10-07. Done:
Pelland 2025's curves, counting comparison and frequency slopes; Nuzzo 2024;
Latella 2020; Steele 2023; Frandsen 2025's full text; Daniels' caps; the
minimal-dose papers; the Banister priors; OREB-07's "Dr. Rhea" citation.
Left:
- the [U] and [R] claims listed at the top of lifting-evidence (10) and
  running-evidence (the talk-test levels, Seiler's three zones, masters
  trainability and age caps, Pfitzinger's strides, Milanović's window,
  Wilson's "small at moderate volume");
- lifting-evidence §8: Busso 1990's fits, Bosquet 2013's time course, Wilson
  2012's full text, a journal version of Remmert 2025, Strong's help pages,
  Alpha Progression's in-app targets, Conti 2026's hazard tables;
- running-evidence §9 and the end of §4.3: the Olympiatoppen zones, a
  strides trial, a 26–52-week recreational curve, heat slopes for training
  paces, whether the single-run guard holds for duration or for novices;
- explanation-ux §8: the six blocked pages, Edge and Strong.
Close the ones a later phase relies on. Record each PMID or DOI, the
population and the exact number, correct the doc in place and change its
marker, and promote the decision-relevant verified rows into the handoff
ledgers in their intake format.
Done when every [U] or [R] that a later phase relies on is verified, or is
carried into the final report as unverified.

PHASE 1 — THE SEAMS (behaviour-preserving extractions, one PR each)
The audits measured that every prescription decision is pure except these,
which a simulator would otherwise have to copy:
1. the weekly rollover: useProgram.ts's lift-only and run-side loops and the
   private nextRunWeek / regenerateRacePlan, into one pure module that both
   effects call;
2. mark-day-done (workoutCompletion.ts and useProgram's optimistic copy) and
   the SessionProgression assembly (useProgram, WorkoutSession);
3. the performanceHistory date: applyProgression and recorded() stamp
   new Date(); stamp the session's date;
4. determinism: an injectable source for generateInstanceId, and one seeded
   PRNG in src/test/prng.ts replacing the 13 mulberry32 copies;
5. one exported definition of a hard run that both sides import. Today the
   lift side counts any run of at least 45 min or 8 km as hard, and the run
   plan counts long, tempo, intervals and race. The run plan's wins
   (owner-answers A5): long, tempo, intervals, race and any other quality
   type; an untyped run counts as long at 75 minutes or more; distance never
   counts on its own. This one changes behaviour, so it lands with its own
   red test, after the golden traces of the other four.
Done when each extraction has a golden trace equal before and after and
`npm run verify` is green.

PHASE 2 — THE SIMULATOR
Build the harness in src/test/sim/ and the suites in
src/features/program/__tests__/sim/, so it runs in `unit` and all eight
matrix jobs. Seed it from harnesses/lifting-sim.test.ts.txt and
harnesses/running-sim.test.ts.txt, replacing their inline copies with the
Phase 1 exports.
- Drive the running copy in production order, per simulated day: buildPlan
  (the onboarding call) → normalizeProgramState → migrateProgramState → the
  rollover → todaySession (Home) and nextUpIndex (Train) →
  buildInitialSetLogs and startingSetRows → the virtual athlete →
  toCompletionSetLogs → applySessionProgression → mark-day-done. Runs go
  through computePlanMetadata, runDocument and the scheduledRunCompletion
  claim map; the server's pure deciders (the applyProgramCommand reducers,
  fell-behind, race no-show, recovery entry) through createRequire; the
  person's actions (Swap, Skip, Easier today, Take a lighter week, Ease back
  in, Adjust this week) as the commands the app sends.
- Determinism under the five-way matrix: vi.setSystemTime at local noon each
  simulated day, addLocalDays, keys from localDateString and localWeekKey,
  race dates relative to the pinned start, traces built with String() and
  toFixed(), state built inside each test, one seeded RNG per persona with
  its seed in failure messages, each test under 5 s or with an explicit
  timeout, and one persona whose span crosses each Auckland DST change.
- The virtual athlete: lifting-evidence §4.4 and running-evidence §6.2–6.7
  specify both halves. Every parameter goes in one table with its value,
  range, source, marker and grade; the weakly sourced ones are swept:
  adherence (anchors in lifting-evidence §2.22 and running-evidence §9
  item 4) and injury severity beyond novices (running-evidence §6.3).
  Calibrate before any comparison: lifting-evidence §4.2 and its
  §4.4 calibration list, running-evidence §6.7 item 8. A missed target is a
  finding about the model.
- Priors the 2026-10-07 check settled (values and sources in the evidence
  docs' "Verified parameters" blocks):
  - fitness–fatigue: draw τ₁, τ₂ and k₂/k₁ jointly from published sets (Peng
    2023), or lognormal medians τ₁ 42 days (log-SD 0.35), τ₂ 10 (0.6), k₂/k₁
    2 (0.7). Individual fits are ill-conditioned: a smoother, not a
    predictor (running-evidence §6.2).
  - the app's own form curve (trainingLoad.ts, gains 1 − e^(−1/τ)) implies
    k₂/k₁ ≈ 5.7, so a session reads net-negative for about 15 days. That is
    the 42/7 fitness-and-freshness convention (the file names Strava's as
    its model), display-only, and it stays (owner-answers A2): simulate the
    athlete on the published prior, never on trainingLoad.ts.
  - lifting fatigue: §4.4's 2–4-day time constant is an ASSUMPTION;
    strength-sport fits put it at 13–22 days [U]. Sweep it.
  - reps achieved: Nuzzo 2024's mean + z × SD at each load, z drawn once per
    lifter (lifting-evidence §2.15).
  - adherence: Conti 2026 (median dropout 19 weeks, 10.1% training at 52
    weeks, counted from users already active in their first 28 days, so
    retention from install is lower), Fuente-Vidal 2026 (about half of
    planned sessions done), Couch to 5K completion 27.3% (Relph 2023). Sweep
    9-week plan completion from 25% to 70%.
  - injury: about 30 per 1000 h in a novice's first 8–13 weeks, falling
    towards 7.7; prior injury ×1.5–2, never the odds ratio 2.21; Kluitenberg
    2016's novice tiers (22% run less, 52% stop 1–6 days, 26% stop a week or
    more); match each calibration target's injury definition (§6.3).
  - concurrent training: key the multipliers to session spacing and
    endurance hours, not km. The two docs give 0.6–0.8 vs 0.6–0.85 for a
    trained man at high volume and 0.95–1.0 vs 0.9–1.0 for the upper body:
    pick one per cell in the table. A heavy leg session impairs running for
    up to 48 h, fading after 2–3 sessions.
  - recreational running anchor: Festa 2020 (VDOT ≈ 42, +3.0–3.5% in 8
    weeks) is the only in-band trial; Muñoz's runners sit near VDOT 53.
- The model is a hypothesis. Report outcomes as ranges across seeds and at
  least two model variants. Its jobs, in order: show what the engine does
  (invariants, coaching checks); test plausibility (each persona lands in its
  research band, stalls, or spirals); compare programmes, and only as input
  to an owner call.
- Personas — extend the matrix, keep these. The evidence personas
  (lifting-evidence §4.5, running-evidence §6.5: a novice benching 60 kg; an
  intermediate at 100 kg wanting +10 kg in 16 weeks; an intermediate woman
  training for size; the year-out marathoner who lifts; 3:45 to sub-3:30;
  Couch to 5K; six weeks off sick), plus: a powerbuilder on 4 days, run on
  Build muscle and on Get stronger; an advanced 5-day lifter; a light trainer
  doing 2 of 4 sessions; a 2-day, 30-minute dumbbell beginner; a 4-week
  layoff returning by "Ease back in" and by "Keep my old weights"; holidays;
  a cut; a lifter over 50; a half marathon on 3 run days; "New to running" at
  the 1-run-a-week default with a marathon; a freeform runner for 16+ weeks;
  hybrids at 3 lifts + 4 runs and 2 lifts + 3 runs, with the leg trim both
  ways.
- Each persona gets a golden trace (toMatchFileSnapshot): week, phase,
  sessions done/planned, main-lift loads and true vs logged e1RM, hard sets
  and days per muscle, steps, holds, misses and drops, lighter weeks; run
  minutes and km, long run, quality, intensity split, single-run spikes,
  injuries, true VDOT vs prescribed paces; lift/run conflicts; Home's card vs
  Train's cursor.
- Assertions:
  (a) invariants (hard): every loaded lift finite and above 0 kg and on its
      equipment grid; baseSets restored after every lighter week; weekNumber
      advancing only on trained weeks; runs only between the plan's creation
      and race day (a plan built on a Thursday wrote Tuesday and Wednesday
      runs on 2026-10-06: confirm or refute); Lift4 (10)'s race weeks; Home
      agreeing with Train (ADR-0002); every changed number explainable by the
      rules sheet; every session inside its chosen length.
  (b) coaching checks, behind a KNOWN_DEFECTS ratchet as planSweep.golden
      does it — land green with today's defects pinned, remove an entry with
      each fix: the generator checks in owner-lifting-sources.md, the
      per-goal tables in lifting-evidence §3, the week rules in
      running-evidence §5.20, its taper finding (§2 item 4), the coach
      objections in lifting-engine-audit §6.3 and running-engine-audit §7,
      and the ACSM 2026 stand (MSSE 58(4):851–72): training at least twice a
      week with all major muscle groups (not each muscle twice), strength
      work at ≥80% 1RM for 2–3 sets, ≥10 sets per muscle group a week for
      size.
  (c) outcome bands, reported, and asserted only as broad plausibility:
      medians and 80% ranges against the evidence tables (whose own 80%
      intervals are model outputs, not data); the owner's coaching
      anchors reached around the 90th–95th percentile, never as medians;
      drops per 100 sessions.
- A soak gated by TROPOS_SIM_SEEDS=500 runs on a schedule, outside the PR
  gate. Each run writes a markdown report, uncommitted.
Done when every persona has a trace, every invariant passes or is a tracked
defect, the calibration status of each target is written down, and the
suite is green in all nine CI jobs.

PHASE 3 — THE APP, END TO END
test-infrastructure-audit.md §4(b) is the design; build it.
- e2e/helpers/realCallables.ts (route completeOnboarding, configurePlan and
  applyProgramCommand to their real handlers; an unrouted callable fails
  silently), createPersona, advanceTo(day), finishLiftViaUi (about 8 s),
  fastForwardLift (the calibrateProgramme pattern), logRun({ via: seed |
  summary-state | manual }), assertWeek, selectors pinned by unit tests, and
  a steppable Node clock for in-process handlers (verify ID tokens before
  shifting it).
- Journeys in e2e/journeys/*.auth.spec.ts, each on an isolated account: Get
  stronger for 16 weeks; a year-out marathon with lifting, checked through
  the UI at the first build week, a step-back week, the taper, race week and
  the week after; a light trainer and a returning lifter (Welcome back); a
  runner with no benchmark, checking every explanation surface; a planned run
  logged through the manual/treadmill path from /run?scheduledRunId= — the
  only UI path that keeps the planned-run link, and no spec covers it today.
- CI: a `journeys` job with its own budget, retries 0 and serial steps,
  outside the existing auth.spec.ts regex, with SHA-pinned actions and the
  workflow guard tests green. Wire smoke, navigation and legal-pages into the
  emulator workflow (not required until green for two weeks) and the other
  six signed-out specs into a nightly run (owner-answers A11).
Done when each journey passes twice in a row and goes red when its key
assertion is broken on purpose.

PHASE 4 — LIFTING
4a. Lift4 as built. Each P, D or U verdict in lifting-engine-audit §4 is a
    correction (it restores the lock's text: red test first, then the fix) or
    a reading question (into decisions.md). The corrections include: a level
    change that leaves main-lift progression untouched; bodyweight mains on a
    fixed target that never progress; miss counts that survive a break taken
    with "Keep my old weights"; the Performance tab's "Lifting suggestions";
    represcription assigning heavier days by day index; Replace and Add
    ignoring the role table; "Improve running" where the lock says "Support
    my running"; a 2-of-4 lifter's lighter weeks always landing on the same
    sessions; and a lighter week taken from Train that doesn't restart the
    calendar count, which the precedence table says it does (owner-answers
    A4).
4b. Programming quality. Every item of lifting-engine-audit §6.3, with the
    matching verdict from lifting-evidence §6 beside it, goes into
    decisions.md with options and simulation results — above all: Get stronger
    training squat and bench as mains once a week; the session-to-session
    sawtooth (simulate a weekly step, an effort-gated step, e1RM-based loads,
    Oreb's rotary and effort waves, and a drop scaled by level); the starved
    30- and 45-minute plans (calibrate the session estimator against real
    saved durations; superset the accessories); curls padded as "pull";
    duplicate lifts that drift apart; light lifts that never step; and
    "advanced" changing only the starting loads. Also: L20 (a leg miss within
    24 h of a hard run counts half) stays, labelled an assumption
    (owner-answers A9; report how often it changes a drop); Lift4's
    same-weights lighter week stays (A8), though 83.7% of athletes also
    lighten loads (Rogerson 2024); Oreb's 4%-per-rep table is steeper than
    Nuzzo's 2–3%, so his 6RM load (80%) leaves about 3–4 reps in
    reserve and wave loads built from it run light.
4c. The most advanced lifting model: designed under the quiet rule and
    simulated, for decisions.md (lifting-evidence §3 and §5.2; the owner's
    sources):
    - a strength track: a frequency floor per main lift (the per-lift
      counts are CONVENTION: Pelland 2025 fits one pooled curve, with
      nothing detectable past 3 sessions a week); a top set at RPE 7–9 with
      back-offs; a phase structure ending in heavy singles and an optional
      dated test built on the race-week machinery, with a 1–2-week taper
      before it (volume cut 30–50%, up to 70%, intensity kept, then 2–7 days
      off; lifting-evidence §2.13);
    - a hypertrophy track: fractional sets per muscle with diminishing
      returns, and a per-session point (about 11 fractional sets; Remmert
      2025) past which extra gain is undetectable — a detection point, not a
      cap; 1–3 priority muscles the person chooses; a set added when a
      muscle stalls (adding sets raised strength, not reliably size: Enes
      2024 and 2025); exercises that load muscles at long
      lengths; the order and redundancy rules; coverage of rectus femoris,
      the hamstring short head, the triceps long head, side delts and calves;
    - powerbuilding as a dial between the two (Lift4 (4) already calls goals
      dials);
    - lift targets ("+10 kg on my bench by June") answered with the
      simulator's forecast range, calibrated against lifting-evidence §4.5
      persona 2 (about 15–25% odds on a general programme, 30–45% on a bench
      block; WEAK, model-based) — honest copy says "possible, not typical";
    - set volume: about 2 direct sets per session is strength's detection
      point (Remmert); splitting a weekly volume over more sessions helped
      strength, not size (Boutagy & McKean 2026, preprint); about 60 weekly
      sets added nothing over about 40 (Räntilä & Ahtiainen 2026), so Lift4's
      ceilings stand;
    - effort that rises as frequency falls (2-day plans train closer to
      failure) — a design to simulate, not a finding: nearer failure adds a
      little size and no strength (Robinson 2024);
    - an e1RM trend in the back end, weighted toward sets of about 5 reps
      and discounting sets above 10 (Reynolds 2006; a 3–8-rep band is
      CONVENTION), judged over 3–6 exposures against 3–5.5% noise (median
      4.2%; Grgic 2020), for stall detection, expectation copy and starting
      loads after swaps and returns. A one-set e1RM is good to about ±5–7%,
      not ±3–5%; analytics.ts's estimate1RMRange bands are centred 2–6% high
      on true sets to failure (about 15% on the leg press), while the Epley
      scaling in represcribe.ts and startingLoads.ts is within 1.5% of Nuzzo
      2024 from 3 to 12 reps and can stay;
    - ADR-0010, decided (owner-answers A1): the plan keeps counting an
      indirect set as 1.0, because its bands' sources counted that way; the
      virtual lifter and any forecast count it as 0.5, because they use
      Pelland 2025's curves. Check that Tropos's secondary map counts as
      indirect what Pelland did (lifting-evidence §2.4, Verified
      parameters), and measure whether the reconciler starves direct work
      for groups fed mostly by compounds (triceps, biceps, hamstrings,
      chest); a fix is per group, through an ADR-0010 addendum.
Done when every §4 verdict and §6.3 item is fixed with a test or is in
decisions.md, and each 4c design has a simulated comparison against Lift4 as
built.

PHASE 5 — RUNNING
5a. Corrections, red test first:
    - The post-run verdict, the live PaceZoneBar and the tempo audio alerts
      use the whole run, warm-up included, so a perfect tempo reads "+22s
      slow" and feeds the "Take this week easier?" nudge: judge the work
      segments only.
    - The benchmark auto-derive and Pace Insight read easy runs as race
      efforts: derive from qualifying efforts only.
    - With no benchmark, every tempo targets 4:30/km and the interval bar
      judges against 5:00/km: effort words until a pace exists.
    - Easy and medium-long runs reach the player with no duration.
    - The taper sharpener bypasses placement.
    - A race plan on one run a week (owner-answers A7): a race plan needs at
      least two run days, a marathon's setup recommends three, "New to
      running" with a race set defaults to two, and fewer days are offered
      more days, a shorter race or a later date. Existing plans keep theirs.
      Re-run running-engine-audit persona (d).
    - The copy drift in running-engine-audit §0 item 7 and §7 item 10, the
      false comment that the UI enforces 2 or more run days, and the
      LONG_RUN_MAX_MINUTES comment in runScheduler.ts, which gives Daniels
      as "the LESSER of 150 minutes and ~25-30%" (he applies 150 minutes
      from 64 km a week, 30% below it).
    Every ⚠ cell in running-engine-audit §2.3 is fixed or in decisions.md.
5b. Plan quality, for decisions.md: this is the running grill Lift4 deferred
    to. Every item of running-engine-audit §7, read against running-evidence
    §2, §5.20 and §7: the year-out marathon's shape; the 1-run-a-week
    marathon default; quality ramped by block position; back-to-back
    demanding days; the taper; the running baseline that only ratchets down;
    freeform runners getting no plan; only the current week being visible;
    onboarding asking for no benchmark. Beside them, the evidence's
    alternatives: a single-run guard against the longest run of the last 30
    days, measured by distance (Frandsen 2025 studied distance only; a
    duration bound is a Tropos extrapolation, and a step under 10% is not
    shown safe); long runs capped by Daniels' rule (30% of the week below
    64 km a week, the lesser of 25% or 150 minutes from 64 km; Tropos caps
    every long run at 150 minutes and enforces no share); intensity added
    gradually and ramped from exposure, race-specific work last (strides and
    hill sprints early; coaches order the middle differently); threshold as
    steady tempo or cruise intervals (the sources name no default, so the
    choice is Tropos's); strides on 2–3 easy days a week; a taper of about
    2 weeks (8–14 days; up to 3 still works) that cuts volume about 41–60%,
    keeps intensity and frequency and keeps a reduced long run; tune-up
    races; predictions as ranges with a mileage-aware correction (Vickers &
    Vertosick's Model 1, running-evidence §6.7 item 7); and phase-aware
    lifting for hybrids (build early, maintain in the marathon-specific
    block, heavy legs placed by the person's stated priority). Also: judge
    the year-out marathon's +34–59% weeks by the single-run guard, not the
    weekly percentage (Frandsen found week-to-week change unrelated to
    injury; Buist found no effect of the 10% rule); trainingLoad.ts's
    ACWR-above-1.4 line, which Frandsen's null ACWR bands and Impellizzeri
    2021 (c-statistic 0.574) do not support as a risk signal — it stays as
    written, advisory and never a risk score (owner-answers A10); heavy
    lifting improved running economy only above 12 km/h and in highly
    trained runners, and most
    Tropos runners are slower than 5:00 /km (plyometrics helped at 12 km/h
    or slower; combined methods most); no structured quality for a novice's
    first 4–6 weeks; 48 h between heavy legs and the long run is convention
    (Robineau supports 24 h).
5c. Explanation — the owner's direct complaint: "it says easy, hard, strides
    … and it's not explanatory what this actually is". The quiet rule for
    runs (explanation-ux §7): the name and one feel line say what to do; the
    why is one tap away; a change the person didn't make gets one line.
    - One effort language for both sports, words first: Easy (full
      sentences) · Steady · Comfortably hard (a few words) · Hard · Quick and
      relaxed. The run screen's step headings use it.
    - Names that say what you'll do, with one feel line (explanation-ux §7.3;
      running-evidence Appendix B). Tempo, intervals, strides and long run
      are kept and defined; physiology terms appear only under "Coaches also
      call this…".
    - An ⓘ "About this run" sheet on every run surface, race plan or not:
      what it is, how it should feel, why it's in your week, what to do if
      it feels wrong.
    - Easy runs carry a ceiling ("6:10 /km or slower") — but runPaces.ts
      sets the easy band's fast end at 72% of VO2max, about 18–20 s/km slower
      than Daniels' E table at VDOT 35–50 [C]; check before deriving the
      number. Strides show on the week strip; "hard" keeps one meaning; the
      post-run line speaks only when a run didn't match its type; "Run by
      feel today" (race pace slows about 0.2–0.6% per °C WBGT above about
      10 °C, more for slower runners [C, WEAK]; no source gives slopes for
      training paces).
    - "Tempo" means different paces across apps (Runna 10K–half pace,
      Garmin and COROS marathon pace, NRC 5K + 30–35 s), and the Steady /
      Comfortably hard split is Tropos's own: the sheet states Tropos's
      pace. A new runner with no pace data gets a "not enough data yet"
      state, as Runna's Pace Insights does.
    - Home's today card withholds the explainer by owner decision
      (SessionPurpose.test.tsx), and that stands (owner-answers A6): the
      sheet is one tap away, on the session the card opens.
Done when every 5a item is fixed with a test, every explanation surface in
running-engine-audit §2.3 carries the new language, and every 5b item is
decided by owner-answers.md's rules, with its simulation results.

PHASE 6 — THE DECISIONS
Write docs/training-engine-2026-10/decisions.md: numbered questions, lifting
and running in separate parts. Each carries what is locked today (row and
clause), the evidence (graded), the simulation (ranges, both model variants,
who gains and who loses), the options, the answer, the copy it implies under
the quiet rule, and what happens to existing plans. CLAUDE.md's
reference-app rule for grills applies. The owner delegated the answers:
decide each by owner-answers.md's rules, lock it with the lock-decision skill
(owner-delegated, 2026-10-07), put its new domain terms into GLOSSARY.md, and
build it in small draft PRs. Only what those rules reserve goes back to the
owner. The stretched range is answered (A3): one line, once, when a target
first climbs past its range ("Up to 22 reps on 10 kg: 12.5 kg is a big
jump"), after the ceiling's maths is checked against Nuzzo 2024.

METHOD
- A red test first for every fix — a simulation invariant, a coaching
  check, a trace line or a unit test — then the fix, then green.
- One concern per PR; at most ~400 lines of non-test diff unless the change
  is mechanical; branches claude/<area>-<slug>; draft PRs with the template
  filled honestly (the schema-migration checkbox is real) and baseline →
  after in the body. Merging waits for the owner.
- An adversarial review of each fix before it lands.
- Server copies in functions/ stay in parity through their cross tests.
- A docs/qa/pre-launch-backlog.md row for anything only a device can confirm
  (audio cues, the run screen on iOS).

DONE MEANS
A final report with: the PRs shipped; the KNOWN_DEFECTS left, each with its
reason; decisions.md, each answer with its lock, and anything handed back
to the owner; Phase 0's
verified and still-unverified claims; the simulator's calibration status per
target; the new baseline.
```

---

## Why each clause is there

- **The scope line, and Phases 0–3 shared.** The owner asked for lifting
  first, then running. The seams and the simulator serve both, and building
  them twice is the most expensive way to run this prompt.
- **Lift4 as the acceptance spec, and the owner call.** Lift4 was locked on
  2026-10-05 after a five-round grill and built the next day (#2593). The
  owner also said "a lot of the programming needs to be fixed". Both are
  honoured by measuring Lift4 as built, fixing what departs from its text,
  and bringing everything else as a question. A silent rewrite of a lock one
  day old would cost more trust than any programming gain, and Pgm5 forbids
  discarding a plan choice without a yes. On 2026-10-07 the owner delegated
  the answers ("you answer the decisions"): owner-answers.md records them and
  the rules for the rest. Those rules keep every explicit earlier owner
  decision, and the merge, with the owner, and every answer is locked before
  it is built, so nothing changes silently.
- **Phase 0 before any number.** The research for this prompt was drafted
  with every primary source blocked. Reading the sources on 2026-10-07
  corrected 115 lifting and 131 running claims, among them the taper length,
  Pelland's strength threshold and which counting method fits strength: a
  taper percentage or a volume threshold encoded from the draft would have
  shipped into every plan. What is still `[U]` or `[R]` is in the same state,
  a good lead and a bad constant.
- **The running copy.** CLAUDE.md records a runs query that read nothing in
  production for five months with its tests green, because the tests
  exercised a fake that disagreed with the real thing. The audits' own
  harnesses re-implement mark-day-done and the rollover, and the 24-week
  volume test bypasses session reading. A simulator built on copies passes
  while production drifts, so Phase 1 comes first.
- **"The model is a hypothesis."** Any simulated difference between two
  programmes comes from the model's assumptions. Calibrating to research
  targets first, sweeping the unsourced parameters and reporting ranges
  across two model variants is what makes the owner's "measurable" request
  honest. A single number from one model would be a promise, not a
  measurement.
- **The determinism list.** Each of CI's four extra unit jobs (timezone,
  locale, future clock, shuffle) exists because it caught a real defect (see
  CLAUDE.md's table). A simulator that reads the
  wall clock goes red on a calendar morning, and `applyProgression` stamps
  `new Date()` today.
- **The KNOWN_DEFECTS ratchet.** `planSweep.golden` set the pattern: a golden
  that silently blessed defects would be worse than none. Landing green with
  today's defects pinned lets every later fix show up as one removed entry.
- **One UI lift a week in the journeys.** A lift through the UI takes about
  8 s, so 48 lifts would take 6.5 minutes on their own. One a week keeps the
  real completion transaction exercised every simulated week while the rest
  go through the real engine.
- **The manual/treadmill run path.** RunSummary state injection saves a run
  with no planned-run link, so it cannot test plan credit. The manual path
  from `/run?scheduledRunId=` is the only UI route that keeps it, and nothing
  covers it.
- **The owner's anchors at the 90th–95th percentile.** Oreb's timelines (a
  double-bodyweight squat in 1–2 years; 140 kg bench in about two) describe
  coached, self-selected men of 80–100 kg. The lifting evidence places them in
  the upper tail. Asserting them as medians would make the app promise what
  most users won't get.
- **The quiet rule for runs.** The explanation research found the same
  shape in Runna, Garmin and NRC (a name that says what you'll do, a feel
  line, the why one tap away, a change that asks first) and the same failures
  elsewhere (Strava's AI summaries, Garmin Coach's silent adaptation). Lift4's
  rule already says this for lifting, and the lifting apps checked on
  2026-10-07 (RP, MacroFactor, Gravl, Alpha Progression) do the same: the
  number first, the reason one tap away, a flag only when it differs from
  what you'd expect. Carrying it over keeps one voice across both sports.
- **Home's today card.** Withholding the explainer there is an owner decision
  pinned in a test. A pass told to "make it explanatory" would overturn it;
  owner-answers A6 keeps it.

## Baselines

Measured on 2026-10-06 in a 4-vCPU cloud container. Each run takes its own
at the start.

- `npm run verify`: passed in 603 s; 1,075 test files; 11,784 tests passed,
  372 skipped.
- `npx vitest run src/features/program`: 48.4 s; 124 files; 1,732 tests.
- Signed-in E2E suite on the emulators: 46 tests passed in 4.7 minutes.
- A simulated week: about 2–5 ms headless; about 15–20 s through the browser.

## What the prompt routes to the owner

The owner delegated the decisions on 2026-10-07 (`owner-answers.md`). What
still goes back:

- Merging every PR.
- A question whose answer would reverse an explicit earlier owner decision (a
  Lift4 owner call, a lock row's "owner:" line, Home's today card), brought
  with its evidence and simulation results.
- Anything that touches money, privacy, or a medical or safety claim.
- Network access to primary sources (the environment's Network access
  setting), only if PubMed is blocked again; without it, what is left of
  Phase 0 runs in flag mode.
