# Tropos running-programming evidence handoff for Claude Code

> Target baseline: remote origin/main at
> a69a9d655424ca4c27e8315bcbffe340f1085748, audited on 2026-08-07.
> Re-fetch the intended target and record its SHA before acting on a
> current-state claim below.

## Purpose

Use the supplied running sources and product-quality benchmarks to make Tropos
feel like a thoughtful, adaptable running coach: clear sessions, coherent
progression, useful trade-offs, and graceful response to real life.

Runna-like means polished plan creation, transparency, adaptation, and user
control. It does not mean copying Runna's visual design, wording, proprietary
plans, or brand, and it does not mean making an opaque AI-coach claim.

This is planning material, not authorization to rewrite stored plans, provide
medical advice, or open a pull request.

## Read before making a change

1. Fetch the actual target branch and compare its SHA with this document.
2. Read AGENTS.md, CLAUDE.md, and the dual-scheduling ADR.
3. Read both the lifting handoff and the current running paths/tests. Lifts
   are split-ordered; runs are date-pinned. Preserve that ontology.
4. Trace the proposed change through its UI, hook/client, persistent model,
   server lifecycle, refetch/rollover, and next-session behavior.
5. Make one bounded product decision before editing. Do not do a large
   book-driven rewrite or add a third run mode atop an unresolved contradiction.

## Product guardrails

- Adherence and context precede optimization: days, time, terrain, equipment,
  confidence, current capacity, concurrent lifting, and disruption are inputs.
- A run must expose its purpose, dose, effort cue, modification path, and why
  it changed. Labels alone are not a plan.
- A run record is evidence, not unquestionable truth: GPS, treadmill/manual
  entry, heat, hills, route, illness, and timing can be unrepresentative.
- Pace estimates and performance forecasts are planning aids with uncertainty,
  not promises or pass/fail judges.
- Adaptation is collaborative. Offer bounded, understandable choices; do not
  stack missed quality work, silently move a race, or invent activity.
- Medical symptoms, pain, post-injury return, pregnancy, fever, or chest
  symptoms require conservative boundaries and appropriate care language, not
  diagnosis or clearance by the product.
- Product direction is to avoid calling a compressed plan safe: use
  limited-runway or mostly-easy preparation and explain the limitation.
  Current remote copy still says finish-safely; treat that as open correction
  work rather than evidence that safety can be promised.
  (STATUS 2026-08-09: largely superseded — see the RUN-EV-05 ledger note;
  the body copy is now honest and only the label question remains open.)

## Evidence ledger and source provenance

The supplied books were read for transferable concepts, not to import sample
schedules or numerical rules. The separately shared Drive source was not
available: it opened a Google sign-in page in this environment. It is excluded
from evidence claims until reattached or made readable.

| Source                                                                                                                              | Safe product use                                                                                                             | Key limitation                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Steve Magness, The Science of Running: How to Find Your Limit and Train to Maximize Your Performance (2014), ISBN 978-0-615-94294-0 | Individual response, stimulus/recovery, session mechanics, broad-to-specific periodization, and careful strength integration | Coach-authored performance text; not a consumer dose formula. |
| Pete Pfitzinger and Philip Latter, Faster Road Racing: 5K to Half Marathon (2015), ISBN 978-1-4504-7045-2                           | Goal-distance context, session roles, hard/easy spacing, taper intent, and supplemental strength                             | Road-race examples and numeric schedules are not defaults.    |
| Pete Pfitzinger and Scott Douglas, Advanced Marathoning, 3rd ed. (2020), ISBN 978-1-4925-9240-2                                     | Marathon specificity, recovery/load separation, interruption handling, strength, and taper context                           | Advanced-marathon population; not a generic mileage policy.   |

The three accessible editions were read on 2026-08-07 from temporary local
attachment caches. PDF review combined text extraction and visual spot checks.
EPUB review used ZIP, OPF, NCX, and XHTML structure. Do not commit, redistribute,
or quote the source files extensively.

| Source               | Cache ID / format |      Bytes | SHA-256                                                          |
| -------------------- | ----------------- | ---------: | ---------------------------------------------------------------- |
| Magness              | EAnkYw / PDF      |  5,429,314 | E83B8BEA2A556034029B874CCBF1CF88919BC90E5C5D6A0778C850FE36825366 |
| Faster Road Racing   | sHYMl3 / EPUB     |  6,443,314 | A38E845638EB0FA810E78B2F1F08C8A8800ADF34D3661D73A1845B9D8CA4D6DC |
| Advanced Marathoning | HZc01t / EPUB     | 50,274,040 | D7D2E54444BDFF5EADE2014357F31C7A1E26DAFD992E70EAEC5DF03C45B2A592 |

### Excluded sources and intake

The Google Drive-linked source required Google sign-in when checked, and the
latest supplied temporary preview path was not available in this workspace.
Neither source informed this handoff. Reattach a readable copy before asking
Claude to treat either as evidence.

For every new source, append a ledger row with author, title, edition/year,
format, temporary-source identity or filename, byte size/hash where available,
access date, reading method, chapter/page or EPUB location, population/context,
short paraphrased principle, transferability limit, and the Tropos decision or
non-adoption it supports. Reconcile it against this document rather than
counting books as votes. Do not commit the source asset or extracted text.

### Transferable source principles

- Begin with demonstrated capacity, current exposure, recovery, time, and a
  concrete goal. A target event alone is not a baseline. Magness, Chapters
  10-12; Faster Road Racing, Chapter 1; Advanced Marathoning, Chapters 1 and 9.
- Give every session a purpose and a materialized dose. Warm-up, work,
  recovery, cool-down, duration/distance, effort, and total load together
  describe what a session is. Magness, Chapter 16; Faster Road Racing,
  Chapter 7; Advanced Marathoning, Chapter 8.
- Space demanding work and revise after interruption. Do not catch up missed
  quality by stacking it. Faster Road Racing, Chapters 2 and 7; Advanced
  Marathoning, Chapters 3 and 8; Magness, Chapters 14 and 19.
- Long runs, taper, recovery, and strength work are purpose- and
  context-dependent. They are not a universal percentage, mileage ceiling,
  separation rule, or calendar formula. Faster Road Racing, Chapters 3 and 6;
  Advanced Marathoning, Chapters 4 and 6; Magness, Chapter 21.
- Preserve easy work, but do not hard-code 80/20, a fixed zone system, a 10
  percent rule, or an injury predictor from one workload ratio.

### Applied running design rules

This is the self-contained, paraphrased source synthesis Claude should use
instead of reopening the books. It turns the shared coaching lessons into
product decisions; it does not import any source's sample plan, mileage table,
or performance formula.

| Decision                        | Evidence-informed Tropos behaviour                                                                                                                                                                                                                                                                                               | Do not encode                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Establish the starting point    | Build from a concrete goal/event, available days and realistic time, demonstrated recent running exposure, longest tolerated run, interruption history, confidence, constraints, and concurrent lifting. Distinguish a desired target from evidence of current capacity.                                                         | A race distance, one fast run, age, sex, a generic level, or a pace score as a full baseline.                                           |
| Qualify the input data          | Record provenance and freshness for GPS, treadmill, manual, and user-reported history. Treat unusual terrain, heat, illness, route, device error, and missing data as context for a conservative review rather than facts to optimize around.                                                                                    | A fitness score or workload ratio as an injury predictor, readiness diagnosis, or automatic volume prescription.                        |
| Materialize each session        | Give every generated run a purpose, hard/easy intensity family, warm-up/work/recovery/cool-down structure where relevant, distance or duration, effort/pace guidance, total dose, expected placement/recovery cost, and a bounded modification path. Preserve those details through launch, completion, history, and replanning. | A label such as easy, tempo, or long run without a usable dose, effort fallback, and meaningful recovery/placement story.               |
| Compose the week                | Protect easy/recovery work and space demanding sessions in the actual calendar. Make the cost of a hard run visible beside hard lower-body lifting and fixed life constraints.                                                                                                                                                   | One universal intensity split, a hard session on every available day, or a silent weekday move/deletion to make the calendar look tidy. |
| Progress the dose               | Progress components deliberately from eligible completed exposure: long/easy duration or distance, quality dose, intensity specificity, and density can each change independently. Build broad capacity before making work more event-specific, and retain cutbacks/taper/recovery as purposeful plan states.                    | A universal weekly percentage increase, static distance labels, or a calendar week counted as completed adaptation.                     |
| Respond to interruption         | Never stack or catch up missed quality. Offer an explainable keep, move, drop, easier replacement, or replan decision that retains completed history and event identity. Returning runners use a conservative re-entry path until sufficient current exposure is established.                                                    | Pretending missed work happened, silently moving the race, or forcing the original quality dose after illness, travel, or a layoff.     |
| Handle limited runway and taper | Describe what the available time can support, use a conservative preparation path, and make taper/recovery deliberate rather than accidental. Keep the plan honest when the event is close or the baseline is uncertain.                                                                                                         | A finish-safely promise, a universal taper percentage/duration, or a race prediction presented as certainty.                            |
| Give intensity guidance         | Prefer a pace band plus effort fallback, with a clear reason for the cue and room for terrain, weather, fatigue, and device uncertainty.                                                                                                                                                                                         | One compulsory zone system, exact pace as a pass/fail test, or an uncontextualized threshold/VDOT conversion.                           |
| Coordinate strength work        | Treat strength as a potentially useful but context-dependent support input. Present hard-run/lift overlap as an explicit trade-off and retain the lifting plan's separate scheduling ontology.                                                                                                                                   | Mandatory strength for every runner, a fixed hours-apart rule, or an automatic claim that lifting will improve every runner's outcome.  |
| Explain and adapt               | Before committing a material replan, preview the exact schedule and dose that will be stored, explain why it changed, and preserve a user-controlled recovery/review route.                                                                                                                                                      | A synthetic preview, a non-atomic save, a plan mode that disappears after onboarding, or advice that crosses into medical clearance.    |

The underlying synthesis is consistent with Magness's stimulus/recovery and
individual-response framing; Faster Road Racing's goal-distance, session-role,
spacing, and taper framing; and Advanced Marathoning's specificity,
interruption, recovery, strength, and event-preparation framing. The chapter
references in the preceding principles are the traceable source locations for
a proposal.

### Conservative state-response matrix

Use these behaviour states when improving the runner model. They are a product
framework, not a medical triage or performance-prediction system.

| Runner state                                               | What Tropos should do                                                                                                                                                                      | What it must not infer or promise                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Pain, injury, illness, pregnancy, fever, or chest symptoms | Stop automated progression/replanning and use approved conservative/escalation copy.                                                                                                       | A diagnosis, return-to-run clearance, rehabilitation prescription, or a safe-event claim.                                         |
| No reliable recent history                                 | Ask only for inputs that change a visible plan choice, select a conservative/mostly-easy entry path, and explain that the plan starts from uncertainty.                                    | Current race ability, a precise pace, safe event completion, or an individualized weekly dose.                                    |
| Recent, consistent completed history                       | Use demonstrated exposure as one transparent input to plan choices and show the consequence in the preview. Keep room for user correction when history does not represent current reality. | That the most recent or fastest run alone establishes capacity, recovery, or future progression.                                  |
| Eligible 21-plus-day running layoff                        | Preserve Run15's temporary re-entry restraint: no quality and conservative tiered dose, then reconcile it once the asynchronous classification resolves.                                   | That re-entry is individualized clearance, that a 6 km 5K floor is a safety rule, or that a later calendar week proves readiness. |
| Conflicting, stale, or low-confidence data                 | Prefer a cautious default, identify the uncertainty, and offer a bounded user review/replan choice. Keep source/provenance visible when it informed the plan.                              | A confident automatic escalation, a hidden conversion of manual/GPS data, or a diagnosis from the disagreement.                   |
| Short event runway or race-date change                     | Label the result limited-runway/conservative preparation, show the exact preview and explicit choices, and preserve recovery/easy work.                                                    | That the plan can make an event safe, recover missed fitness, or justify catch-up quality.                                        |
| Missed, partial, or manually modified planned session      | Preserve completion truth, then offer keep, move, drop, easier replacement, or replan according to the current week and constraints.                                                       | A fabricated completion, duplicated quality, or an unreviewed race-date/plan replacement.                                         |

### Contemporary and product checkpoints

| Source                                                                                                                                                                                                                                         | Safe product implication                                                                                                                 | Limitation                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Campos et al., intensity distribution review (2022)](https://pubmed.ncbi.nlm.nih.gov/34749417/)                                                                                                                                               | Preserve an easy-work budget and use multiple intensity signals.                                                                         | Different zone definitions classify the same training differently; no universal split follows. |
| [Rosenblat et al., intensity-distribution network meta-analysis (2025)](https://pubmed.ncbi.nlm.nih.gov/39888556/)                                                                                                                             | Retain athlete-level moderation and uncertainty rather than declaring one distribution best.                                             | Trained endurance-athlete context is not direct consumer evidence.                             |
| [Wang et al., taper systematic review (2023)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/)                                                                                                                                              | Treat taper as deliberate event preparation.                                                                                             | Pooled effects do not prescribe one taper shape.                                               |
| [Training-load/injury systematic review (2018)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6253751/)                                                                                                                                             | Treat abrupt change as a review prompt rather than injury prediction.                                                                    | No simple workload ratio establishes individual risk.                                          |
| [Strength and running-economy meta-analysis (2024)](https://pubmed.ncbi.nlm.nih.gov/38165636/)                                                                                                                                                 | Treat strength as a context-dependent adjunct to running.                                                                                | It does not prescribe lifting to every runner.                                                 |
| [Runna plan creation guidance](https://support.runna.com/en/articles/15443877-how-to-create-a-training-plan-in-runna) and [adaptation guidance](https://support.runna.com/en/articles/12809806-feeling-unwell-how-to-adapt-your-training-plan) | Benchmark input capture, preview, deliberate adaptation, and user control. Re-check these changing product pages at implementation time. | Product benchmark only, not physiology evidence or a feature specification.                    |

## Current remote-main architecture

| Concern                        | Primary paths                                                                                                                                 | Current meaning                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Persisted running state        | src/features/program/programTypes.ts, src/lib/runPlanMetadata.ts, and ProgramState                                                            | State carries run days, plan rows, race/recovery information, and lifecycle data alongside lifting.                                          |
| Onboarding and mode resolution | Onboarding, onboardingRunMode, runModeResolution, planBuilder                                                                                 | Live support is freeform and race preparation, but onboarding retains a Structured selection that is not currently a viable end-to-end mode. |
| Plan generation                | raceGoalPlanner, runScheduler, workout templates, useProgram                                                                                  | The scheduler materializes race-plan rows against date, frequency, schedule, phase, and current plan position.                               |
| Session execution              | src/pages/Run.tsx, src/components/run/RunLaunchCard.tsx, interval/audio flow, src/pages/RunSummary.tsx, and src/lib/scheduledRunCompletion.ts | A planned dose must survive from generated row to launch, completed run, slot claim, history, and analytics.                                 |
| Replanning and lifecycle       | useProgram plus server race/recovery lifecycle paths                                                                                          | Replans, no-show/recovery, race timing, local dates, and persistent histories must use a coherent ownership model.                           |
| Fitness and insight            | run fitness derivation and pace insight paths                                                                                                 | Benchmarks can inform pace, but automation, consent, provenance, and confidence must be reconciled before adding prescriptive power.         |

## Current remote-main behavior to preserve

### Internal labels

- **Run15** is the existing layoff/re-entry slice around layoff detection,
  recent-layoff fetching, and the run scheduler. It is an internal work label,
  not a user-facing plan type or a clinical screen.
- **Run9** is the existing run-state migration/reconciliation work around
  run9Migration and run-mode resolution. It is an implementation label, not a
  supported mode or product promise.

### Implemented race-prep progression

Remote main no longer uses only static long-run templates. Race preparation now
progresses long, easy, and quality dose through the carried original plan
block, including cutbacks, taper/race behavior, and the persisted week the
runner is actually in.

Run15 adds a returning-runner guard: eligible running layoffs of 21 days or
more receive temporary re-entry behavior with no quality and conservative
distance-tier restraint. The 5K configuration deliberately uses the
scheduler's available 6 km long-run tier even though its configured base is
4 km. This is a meaningful baseline, not a full individualized athlete-dose
system.

Test the actual generator and lifecycle around long-run progression, quality
progression, persisted-week progression, and detrained race plans whenever
that behavior changes. Do not regress it to static 10K/15K labels or call a
below-floor, all-easy fallback a full long-run progression model.

### Current product limits

- Live run-mode resolution supports freeform and one date-specific race goal.
  It is not an automatic clone of every plan taxonomy, multi-event plan, or
  coached return-to-running product.
- Race plan dose is race-config and preference aware, but still not derived
  from demonstrated weekly exposure, longest run, session-duration capacity,
  quality tolerance, progression history, or combined lifting load.
- The target run-days preference, actual week schedule, generated slots,
  preview, and adherence denominator are not yet one atomic model.
- Manual/custom changes and completed history must retain local-date and
  identity semantics through reruns and recovery paths.

## Status ledger

### Resolved at the target SHA

| Item                          | Current result                                                                                                                       | Preserve                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Long/easy/quality progression | Race-prep rows progress across persisted weeks with cutbacks and taper/race behavior.                                                | Test real rollover and supported race distances, not only helper output. |
| Returning-runner restraint    | Eligible 21-plus-day layoffs get temporary re-entry with no quality and conservative tiered dose; 5K uses the deliberate 6 km floor. | Do not call it personalized readiness or a safety guarantee.             |
| Date-aware race scheduling    | Generated plans use plan week and race context rather than an undifferentiated static template.                                      | Preserve local-date semantics and completed history.                     |

### Open correctness and model work

Issue IDs make the work list durable across Claude sessions. (Renamed from
`RUN-0x` at integration — this repo's retention-audit rows Run13/Run14 in
`.claude/plans/programme-run-followups.md` already use `RUN-02`/`RUN-05`
for UNRELATED issues: the Adjust-this-week sheet and the ease-week nudge.)
Re-verify each one at the target SHA before changing it: **ready
correction** means the documented behaviour can be repaired without
choosing a new product policy; **owner decision** means Claude must
obtain/record a decision first.

STATUS 2026-08-09 (integration re-audit, base `52c2f02`): RUN-EV-01
CONFIRMED open — `Onboarding.tsx` (~line 1181) still offers a
"Structured" mode chip, `onboardingRunMode.ts` passes it through
untouched, and the Run9a lock pins the live run surface to two states
(freeform substrate + race overlay), so the selection still cannot
survive end-to-end; the owner decision remains open. RUN-EV-05
SUBSTANTIALLY SUPERSEDED — the below-floor copy is now a deliberate
five-state model (`raceGoalPlanner.ts`: "Too soon for a full build …
mostly easy running, no hard sessions", card copy "finish strong, not to
PR", pinned by `RaceCockpitCard.test.tsx` including agreement between
the toast and the persistent card); the substance the row demanded
(honest limitation language, no event-safety promise in the body copy)
is in place, and what remains is only whether the LABEL "finish-safely"
itself overpromises — an owner naming decision, no longer a ready
correction. RUN-EV-02 partially overtaken: the retention-audit Run13 arc
shipped a race-prep "Adjust this week" sheet (client-only, PR #1536),
but this row's atomic goal/schedule/preview-commit concern was NOT
re-verified. RUN-EV-03, -04, -06 through -10 were NOT re-verified in
this pass — trace before acting.

STATUS 2026-08-09, owner-decision session (PR #1886): RUN-EV-01
DECIDED and RESOLVED — the "Structured" chip is REMOVED from
onboarding; the surface matches the Run9a two-state lock (freeform +
race prep). Legacy profiles and drafts carrying runMode "structured"
keep resolving to freeform exactly as before (onboardingRunMode's
pass-through and its tests are unchanged); a legacy draft re-opens on
Freeform. RUN-EV-05 DECIDED and RESOLVED — the below-floor label is
"mostly-easy plan" across every user-visible surface (planner status +
CTA, cockpit card, realign toast, Adjust-week preview), and the
"train safely" phrasing went with it; the internal `finish_safely`
state keys are deliberately unchanged (persisted vocabulary, no user
value in renaming). Full unit suite green after both changes.

STATUS 2026-08-09 (second batch, owner delegated the choice): RUN-EV-06
DECIDED and RESOLVED — the 150-minute ceiling and 6 km lowest tier are
retained, explicitly labelled Tropos heuristics (not source-derived
safety rules) at the constant in `runScheduler.ts`; the Daniels
citation covers the time half only. RUN-EV-08 DECIDED, implementation
owed — two-tier by consequence: measurement-only benchmarks may
auto-update with visible provenance and a reversal path; any benchmark
change that feeds a prescription keeps explicit acceptance. No code
shipped yet; the implementing session must trace the automatic fitness
derivation and pace-insight acceptance paths and test the policy.

STATUS 2026-09-06 (Run17 / Run18, plan file): RUN-EV-06's ceiling is
unchanged and is now MEASURED at the runner's confirmed easy pace
(`planningEasyPaceSPerKm`, behind RUN-EV-08's gate) — a tier is
schedulable when km × easy pace ≤ 150 min; without a confirmed benchmark
the nominal table stands, byte-identical. The intended long-run curve is
clamped to the schedulable peak (plus a 10% hold so the ceiling tier is
reached for the last two or three ramp weeks, not once, and not for six
flat weeks as the 32 km overshoot produced). `bigger` can no longer sit
below `standard`. Run18: a build week keeps one easy run whenever ≥ 3 run
days exist — `harder`'s second quality session needs a slot beyond it.

STATUS 2026-08-09, later same session — SHIPPED (PR #1886). The tier
split is by CONSEQUENCE at the fan-out: `prescriptivePaceTableFromFitness`
returns null while `runFitness.pendingConfirmation` is true, and the six
prescription call sites (Run.tsx ×3, RunSetupModal, ProgrammeRunSection,
DayActionSheet) now use it — an unaccepted auto-derived benchmark leaves
session targets on template paces. Measurement surfaces (predictions,
the settings pace grid, the RunSummary verdict) keep the full table.
The silent auto-derive now writes provenance (`sourceRunId`/`sourceRunAt`
from the winning run) plus `pendingConfirmation: true`; acceptance paths
(the pace-insight accept, the new "Use for pace targets" callout in
RunFitnessSection, manual entry) write the flag as LITERAL false —
Firestore merge writes deep-merge maps, so omission would leave a stale
true. Reversal: "Remove" clears `runFitness` to null (template-pace
fallback). Sanitizer subfields allow-listed boolean-strict. Legacy
derived benchmarks without the flag stay prescriptive (confirmed by
default) — yanking existing users' paces retroactively was not part of
the decision.

STATUS 2026-08-09, merge-cascade close-out (PR #1888, merged to main):
RUN-EV-02 RESOLVED — RunPlanSettings saves are ONE buildPlan from the
current draft + ONE atomic configurePlan batch; preview ≡ commit by
construction (both derive from generateSchedule); freeform saves clear
goal, targets and plan together (the CF sanitizer now preserves an
explicit raceGoal: null). The trace found the live bug was worse than
the row said: a first freeform→race_prep save early-returned in a stale
closure and wrote NO plan while toasting success. RUN-EV-03 RESOLVED —
the run-side auto-rollover awaits the layoff read for the current uid
(the read never rejects) and re-runs when it lands; recentLayoff is
declared in every regen dependency array. Regression constructs the
real cache-paint-vs-network race and is mutation-checked.

> **Two run-relevant issues are ledgered on the LIFT side.** The Performance
> Index is hybrid — run load is half its `loadScore` — and the deload it
> recommends now has a run half (#1930), but neither appears anywhere in this
> document. Before changing run load, run volume scoring, or anything the
> deload touches, read `LIFT-EV-09` (a deload trigger measured unreachable —
> 0 hits in 345,600 realistic weeks) and `LIFT-EV-10` (a running-only week
> caps the PI at 68, so 110 km reads "Steady" and can never be offered a
> deload) in `docs/lift-programming-claude-handoff.md`. They are filed there
> because the deload is a lift-side concept; the evidence is at least as much
> about running. Cross-referenced rather than duplicated — two copies of a
> finding drift, and this repo has the scars.

| ID / state                                    | Issue                                                                                                                                                                                                                                                                                                              | Required outcome                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RUN-EV-01 — P0, owner decision                | Onboarding still offers Structured while runtime resolution turns it into freeform and deletes its plan/days. First trace: Onboarding, onboarding run-mode resolution, useProgram, and Run9 migration tests.                                                                                                       | Decide once: remove or explicitly resolve Structured before plan creation, or restore a supported lifecycle. A selection must survive onboarding, hydration, and display without silent plan deletion.                                                              |
| RUN-EV-02 — P0, owner decision                | Race-plan settings have two schedule authorities and a non-atomic write path. Target days can differ from actual schedule slots; preview uses a different calendar; regeneration can use a stale pre-save closure. First trace: RunPlanSettings, raceGoalPlanner, runScheduler, and useProgram.                    | Use one current-draft operation to compute and commit goal, mode, effective schedule, targets, tuning, run days, and plan together. Preview the same effective schedule. Prove a 2-to-4-day change updates slots, rows, target, and adherence denominator together. |
| RUN-EV-03 — P1, ready correction              | Re-entry classification is asynchronous but is not a declared regeneration dependency everywhere. First trace: fetchRecentLayoff, useProgram, runScheduler, and layoff-wiring/detrained-plan tests.                                                                                                                | Await/reconcile before first materialization, or run one idempotent replan when a stricter 21-plus-day classification arrives. Test loading an existing plan with no manual refresh or profile edit.                                                                |
| RUN-EV-04 — P1, owner decision                | Run15 is a re-entry guard, not a full individualized dose model. First trace: runScheduler, runPlanMetadata, runner-history inputs, and Run15 tests.                                                                                                                                                               | Before adding constants, design a versioned, explainable exposure model with provenance/freshness, no-data/stale/contradictory fallbacks, visible plan differences, and no fitness-score-only volume prescription.                                                  |
| RUN-EV-05 — P1, ready correction              | Current compressed-plan copy says finish-safely even though the product cannot guarantee event safety. First trace: ProgrammeRunSection, race-planner/scheduler copy, and plan-state UI tests.                                                                                                                     | Replace it with limited-runway/conservative preparation language and test the affected plan states and guidance surfaces.                                                                                                                                           |
| RUN-EV-06 — P1, owner decision                | The scheduler has existing hard-coded dose heuristics: a 150-minute long-run ceiling and a 6 km lowest long-run tier, including re-entry 5K behavior. First trace: runScheduler and long-run/detrained-plan tests.                                                                                                 | Keep them labelled as Tropos heuristics, not source-derived safety rules. Review their user-visible explanation, low-readiness behavior, and supported-distance tests before changing them.                                                                         |
| RUN-EV-07 — P1, owner decision                | Compatibility and concurrency ownership are incomplete. The tested Run9 migration and stale race-week reconciliation helpers are not runtime paths; client full snapshots coexist with server lifecycle writers. First trace: run9Migration, raceRunDaysReconcile, useProgram, and server race/recovery lifecycle. | Establish idempotent migration/reconciliation ownership and test client-save versus server recovery/no-show interleavings before adding durable fields.                                                                                                             |
| RUN-EV-08 — P1, owner decision                | Benchmark-consent policy is inconsistent: qualifying GPS runs can auto-derive a benchmark while pace insight uses explicit acceptance. First trace: automatic fitness derivation, pace insight, and their tests.                                                                                                   | Choose whether automatic updates remain with clear provenance or all persisted benchmark changes require consent; test the selected policy.                                                                                                                         |
| RUN-EV-09 — P1, investigation then correction | Planned-dose execution is not complete until the generated row survives launch, edits, saved completion, slot claim, history, analytics, and lifecycle effects. First trace: runPlanMetadata/template prefill, Run, RunLaunchCard, RunSummary, scheduledRunCompletion, and lifecycle writers.                      | Add journey tests across generated, custom, and modified completion; do not declare a scheduler helper complete on its own.                                                                                                                                         |
| RUN-EV-10 — P2, owner decision                | Hard-session placement needs a documented cyclic and hybrid constraint model. First trace: runScheduler, week schedule, lifting overlap, and date-boundary tests.                                                                                                                                                  | When changing placement, test Saturday-to-Sunday and other adjacent hard/easy relationships plus heavy-lift stress. Flag conflicts and offer choices rather than silently deleting work.                                                                            |

## What Runna-like quality means in Tropos

| Quality                | Tropos behavior                                                                                                                  | Anti-pattern                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Clear plan choice      | Explain freeform versus race prep and the inputs that govern it.                                                                 | Offering a mode that runtime silently retires.             |
| Honest input capture   | Ask only for inputs that materially change the plan and preview their consequence.                                               | Collecting data but generating unchanged static templates. |
| One preview and commit | Show the exact schedule, frequency, hard-session placement, progression, taper/recovery, and lift conflicts that will be stored. | A synthetic preview that differs from the committed plan.  |
| Flexible disruption    | Offer bounded conservative choices and a visible return path.                                                                    | Catch-up quality, silent race changes, or medical claims.  |
| Explainable session    | Show purpose, planned dose, pace band/effort cue, modification option, and source of changes.                                    | One rigid pace number and a pass/fail verdict.             |
| Truthful history       | Match real runs deterministically and preserve manual/custom completion separately.                                              | Fabricating activity or treating a status tap as a run.    |
| Calm coaching          | Use direct, humane copy that admits uncertainty.                                                                                 | Claims that limited runway or a metric makes a race safe.  |

## Future runner-state and planned-dose design

Do not implement this as a single large model migration. Use it as the decision
frame for one vertical slice at a time.

### Runner-state inputs worth considering

- goal kind and race/event identity;
- recent run days, distance or time, longest run, quality exposure, and
  interruptions, with source/provenance/freshness;
- available days, fixed constraints, and realistic session-time capacity;
- preferred units, terrain, device/manual reliability, and pace/effort
  guidance;
- concurrent lifting and other demanding activity;
- confidence in data and a conservative, non-diagnostic return check-in.

Never infer baseline, injury status, readiness, or race ability from age, sex,
one fast run, a generic experience label, or a desired race plan.

### Planned-session contract

A materialized run should have:

- purpose and intensity family;
- warm-up, work, recovery, and cool-down components where relevant;
- distance or time with a reason for the chosen unit;
- pace band and effort fallback;
- expected total dose and a bounded, conservative modification path;
- hard/easy classification plus placement and lifting-conflict rationale;
- generation policy, original/persisted plan position, and relevant baseline
  provenance;
- the baseline/provenance version used, the conservative fallback when that
  input is unavailable, and whether completion is eligible to inform future
  progression, re-entry, or benchmark derivation;
- a deterministic identity that supports matching and avoids overwriting
  completed/custom history.

## Claude Code implementation contract

Before changing code, write a short decision record:

| Field               | Required content                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Evidence principle  | Paraphrase plus book chapter/page or review reference.                                                        |
| Current behavior    | Exact target SHA, fields, real caller, and affected users.                                                    |
| Product decision    | Intentional user-visible result.                                                                              |
| Non-goal            | Source/product behavior Tropos will not import.                                                               |
| Ownership/migration | Client/server owner, types, normalization, migration, concurrency, local-date, history, and rollback effects. |
| Preview/diff        | What the user sees before accepting and how it equals persisted output.                                       |
| Validation          | Journey, lifecycle, regression, property, parity, and interleaving checks.                                    |

Any new measurement or personalization signal needs a user-visible purpose,
consent and no-data fallback, a durable owner, and proof that it cannot
silently alter an existing saved prescription.

Completion is fail-closed:

1. Record the target SHA, owner decision, non-goals, migration/rollback, and
   direct-write/command ownership.
2. Trace UI to hook/client to persistence/server to refetch/rollover/recovery.
3. Update every crossed boundary: types, normalization, migration, validation,
   reducer, schedule owner, copy, and tests.
4. For planned-dose changes, trace runPlanMetadata/template-to-prefill,
   Run, RunLaunchCard, interval/audio, RunSummary, scheduledRunCompletion,
   history/analytics, and server lifecycle as applicable.
5. Prove the saved/refetched plan and next session/week behavior, not merely a
   helper result.
6. Run focused tests, npm run verify, and git diff --check. Confirm no book
   files, extracted source text, or temporary artifacts are staged.

## Required verification matrix

| Dimension          | Minimum cases                                                                                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode/lifecycle     | freeform, race prep, legacy Structured migration/decision, recovery/no-show, completed race                                                                                                                                                                                                           |
| Race               | supported distances, first/returning/general context, normal and limited runway, race-date edit                                                                                                                                                                                                       |
| Current capacity   | no data, active history, stale history, 21-plus-day layoff, contradictory/manual/GPS data                                                                                                                                                                                                             |
| Frequency/schedule | 2 through 4 and other supported days, custom schedule, preview equals commit, denominator matches plan                                                                                                                                                                                                |
| Dose               | easy, long, tempo/threshold, intervals, cutback, taper, re-entry, time and distance units                                                                                                                                                                                                             |
| Placement          | same-day, adjacent, Saturday-to-Sunday, hard/easy, heavy-lift interaction                                                                                                                                                                                                                             |
| Execution          | generated row, custom row, user-modified row, launch/audio, saved run, slot claim, history/analytics                                                                                                                                                                                                  |
| History            | completed, skipped, manually claimed, duplicate/matching edge case, local date/timezone                                                                                                                                                                                                               |
| Safety/uncertainty | symptom-boundary copy never diagnoses or claims safety; no/stale/conflicting/one-off data cannot escalate dose; delayed layoff read produces one carry-safe replan; limited-runway/race-date copy has no safety guarantee; skipped/partial/custom quality cannot create catch-up or false progression |
| Persistence        | types, migrations, client/server validation/reducer, saved/refetched state                                                                                                                                                                                                                            |
| Concurrency        | queued/rejected/refetched command, direct client write versus server lifecycle, idempotent migration/reconciliation                                                                                                                                                                                   |
| Benchmark          | automatic versus confirmed source, provenance, consent, stale/unrepresentative data                                                                                                                                                                                                                   |

## Explicit non-adoptions

Do not add the following merely because they appear in a source or a competitor:

- fixed mileage tiers, weekly increases, set calendar plans, a universal 10
  percent rule, one intensity split, or an individualized injury-risk score;
- a new source-derived or universal taper duration/percentage, long-run cap,
  race predictor, pace formula, VDOT rule, or fitness-score-derived dose.
  The current 150-minute ceiling and 6 km floor are Tropos heuristics that
  require explicit review, not book facts or individual safety guarantees;
- mandatory heart-rate zones, threshold tests, track sessions, hills,
  plyometrics, strength training, or shoe/device data;
- medical triage, return-to-run clearance, injury rehabilitation, or illness
  diagnosis;
- automatic catch-up loading, silent race-date moves, plan replacement without
  an explicit user decision, or fabricated completion; or
- copying Runna's visual design, text, proprietary plan content, or branding.

## Owner decisions still needed

1. Is Structured removed/resolved at onboarding, or restored as a supported
   mode with full end-to-end ownership?
2. What single operation owns race goal, mode, schedule, target frequency,
   plan rows, and the adherence denominator?
3. Which runner-state inputs are worth collecting first, and what is the safe
   no-data behavior?
4. Which benchmark policy is chosen: explicit acceptance for all persisted
   changes, or automatic updates with visible provenance and reversal?
5. Which compatibility/migration and direct-write versus lifecycle semantics
   protect live race data?
6. What hard-run/lift conflict rule is advisory, and which choices will the
   runner see?
7. Which new plan taxonomy, if any, has a distinct user journey rather than
   simply another label?
8. What is the product policy for the current 150-minute long-run ceiling,
   6 km floor, and lower-readiness/race-distance exceptions?
9. What exact limited-runway language replaces finish-safely without implying
   medical or event safety?

## Final instruction

Use the books and benchmark material to ask better questions, make progression
and disruption handling understandable, and preserve runner control. Prefer a
small end-to-end improvement with truthful saved/refetched behavior over a
large library rewrite or a promise of individualized coaching certainty.
