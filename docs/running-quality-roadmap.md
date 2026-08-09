# Running quality roadmap — the Runna bar and the elite-coaching bar

Written 2026-08-09, owner-directed. This is a FEATURE LIST and ability
map, not a lock: each row is a candidate for its own grill/spec/PR
cycle. Two quality bars are used deliberately, because they are
different products:

- **The Runna bar** — what the best recreational coaching app ships.
  Runna is the named quality reference in the running evidence handoff
  ("What Runna-like quality means in Tropos"). Parity here is a
  launch-competitiveness question.
- **The elite-coaching bar** — what an Olympic athlete's coach actually
  manages. Most of it is *monitoring and individualization*, not fancier
  workouts. Some of it transfers to recreational runners; some of it is
  theater when an app fakes it. The non-features section is as load-
  bearing as the features.

Evidence base: Daniels, Pfitzinger, Hansons, Magness, Noakes — the five
sources the scheduler already cites (and the owner's own shelf). Every
feature row names its source or is labelled a product invention.

---

## 0. Where Tropos already stands (verified against code, 2026-08-09)

Inventoried by grep, not memory. The base is stronger than a gap
analysis would guess:

| Ability | Where it lives |
| --- | --- |
| Individual pace engine (VDOT; Daniels) — easy/threshold/interval bands, race paces, Riegel projections | `runPaces.ts` |
| Two-tier benchmark consent (auto-derive with provenance; prescriptions gated on acceptance) | `useRunFitnessAutoDerive`, `prescriptivePaceTableFromFitness` (PR #1888) |
| Periodized race plans: Base → Build → Taper → Race, honest runway states (compressed / mostly-easy) | `runScheduler.ts`, `raceGoalPlanner.ts` |
| Medium-long run, distance-aware midweek ceiling (Pfitzinger) | PR #1889 |
| Quality progression by volume at fixed physiological pace, event-specific ceilings | `qualityTemplateId` |
| Re-entry / layoff adaptation (detrained runners get re-entry weeks, no quality) + layoff-await (no placeholder materialization) | Run15 + PR #1888 |
| Weekly adaptation: adjust-this-week, fell-behind prompts, ease-week nudge, cutback weeks | Run13/Run14, `AdjustWeekSheet`, `FellBehindSheet` |
| GPS engine: Kalman filter, splits, elevation, GPX export, privacy zones | `gps.ts`, `privacyZones.ts` |
| Guided runs, interval workouts, audio cues, wake lock | `useGuidedRun`, `useIntervalWorkout`, `useAudioCues` |
| Post-run verdict vs prescribed pace | `RunSummary` |
| **Training-load model — already a Banister-style fitness/fatigue impulse-response** (42-day fitness TC, 7-day fatigue TC, effort-weighted minutes, quality factor 1.3) | `trainingLoad.ts` |
| HR zones (5-zone, max-HR driven, age fallback) + heart-rate hook | `hrZones.ts`, `useHeartRate` |
| HealthKit reconciliation — **decided and accepted**, ADR-0007 | `docs/adr/0007` |
| Weather at run time (display + tips; NOT yet pace-adjusting) | `weather.ts` |
| PR tracking, pace trends, race predictions, shoes, race spaces/community | `prTracking`, `paceTrends`, `RacePredictionsCard`, spaces |
| **Hybrid lift+run scheduling in one plan** — the structural advantage neither Runna nor any pure running app has | dual-ontology scheduler (ADR-0002) |
| **A real nutrition engine beside the run plan** — second structural advantage | `phaseNutrition`, day-type macros |

Confirmed gaps (greps came back empty): no hills / strides /
progression-run templates; no structured warmup→main→cooldown segments
(warmups are description text only); no race target TIME anywhere (goal
is distance+date only); no cadence; weather not wired into pace targets.

---

## 1. Ability set A — the Runna bar (parity features)

Ordered by leverage. "Builds on" names the existing seam — none of
these start from zero.

**A1. Structured sessions: warmup → main set → cooldown → strides.**
Today a session is one block; Runna's are segmented with the watch/app
walking you through each. The interval player already exists
(`useIntervalWorkout`, `useGuidedRun`) — this is a template-schema
change (segments array) + player generalization, not a new engine.
Strides (4–6 × 20s relaxed-fast) are the cheapest "feels professionally
coached" addition in all of running; Daniels prescribes them 2–3×/week
in every plan. Effort: M. Source: Daniels, Pfitzinger.

**A2. Race target TIME → goal-pace-specific sessions.** The goal today
is distance+date; VDOT sets paces from fitness alone. Adding an optional
target time enables the signature sessions of every marathon source:
race-pace segments inside long runs (Pfitz), tempo-at-goal-pace
(Hansons' "marathon-pace runs are the program"), and an honest
feasibility verdict (target VDOT vs current VDOT — "your target implies
21:45 5K shape; you're at 22:40" — with the gap trend). The benchmark
consent machinery (PR #1888) already guards the fitness side. Effort:
M-L. Source: Hansons, Pfitzinger, Daniels.

**A3. HealthKit / watch import (execute ADR-0007).** Runna's stickiness
is largely Garmin/Apple Watch execution. The ADR is accepted and the
reconciliation model decided — this is the highest-leverage *native*
work on the list, and it feeds every adaptive feature below with HR +
runs the phone never saw. iOS-first product, watch-first runners.
Effort: L (native). Source: n/a (infrastructure).

**A4. Missing session types: hills, progression runs, race-pace long
runs.** Template additions on the existing ladder machinery. Hills =
Lydiard/Daniels strength phase; progression runs = de Castella/Kenyan
staple, easy→steady→strong; race-pace long-run variants pair with A2.
The variation bank + day-sheet swap already handle per-day substitution.
Effort: S-M each. Source: Daniels (hills), Magness (progression).

**A5. "Why this session" explainers.** The handoff's Runna-quality
table already names this ("Explainable session: purpose, planned dose,
pace band, source of changes"). The scheduler KNOWS the phase, the ramp
position, the cutback state, the layoff class — surfacing one honest
sentence per session ("Week 9 build, cutback week — volume eases ~30%
so next week's peak lands on fresh legs") is a view-model feature, no
engine change. Effort: S-M. Register: honest, no physiology claims.

**A6. Adaptive paces during the plan (close the loop).** The pace
insight (Pro) already recalibrates VDOT mid-plan with consent. What's
missing is the plan responding the other way: repeated pace-verdict
misses easing the next week (the Run14 ease-nudge exists for VOLUME;
extend the same pattern to intensity), and a post-cutback bounce check.
Effort: M. Source: Magness (respond to the athlete, not the plan).

**A7. Race-day plan: pacing strategy + A/B/C goals.** Given target time
(A2): per-5k split table with a negative-split bias, C-goal fallback
("finish"), weather-aware caution line (weather.ts already fetches).
Pure view-model + one new card. Effort: S-M. Source: standard marathon
coaching practice; Pfitz's race-execution chapter.

**A8. Fueling for the long run and race week — the hybrid advantage.**
No running app owns this credibly; Tropos already has a macro engine
with day-type awareness. Long-run day carb targeting, race-week carb
load protocol, in-race fueling reminders by duration (>75min → carbs/hr
guidance). This is the differentiator feature: Runna cannot ship it.
Effort: M. Source: standard sports-nutrition consensus; keep claims
conservative and cite in-app.

**A9. Strength-for-runners as a first-class plan.** `primaryGoal:
"running"` exists in the lift engine but is thin. Runna sells "strength
for runners" as a headline feature — Tropos has an entire lift engine
idle behind it. Run-support templates (single-leg, calf, hip, plyo
progressions), scheduled AROUND the run plan's hard days (the dual
ontology already knows both calendars). Effort: M. Source: consensus
running-injury-prevention literature; label as such.

**A10. Cadence + basic form metrics.** Phone accelerometer (native) or
watch import (A3). Display + trend only at first — no "fix your form"
prescriptions without evidence. Effort: M (native). Register: metrics,
not claims.

---

## 2. Ability set B — the elite-coaching bar

What an elite coach actually adds beyond a good plan: monitoring depth,
environmental control, and individualization from the athlete's own
response. The honest translations:

**B1. Training-load guardrails (extend `trainingLoad.ts`).** The
Banister-style model exists. Elite practice adds: ramp-rate warnings
(acute:chronic ratio outside ~0.8–1.3 flagged as spike), monotony/strain
(Foster), and a pre-hard-day freshness read. All computable from data
already stored. Surface as *advisory* copy in the existing banner
register — never a red "injury risk" scare number. Effort: M. Source:
Foster, Banister; label the thresholds as heuristics (RUN-EV-06
register).

**B2. Environmental adjustment: heat + altitude paces.** Weather is
already fetched per run. Elite coaches adjust targets for heat/humidity
as a matter of course; the math is public (pace-degradation curves by
dew point). Adjust the DISPLAYED target band, tell the user why, one
line. Altitude: static offset per elevation band. Effort: S-M. Source:
Daniels (altitude tables), published heat-adjustment curves.

**B3. Aerobic-efficiency trend (HR-pace decoupling).** With HR (A3):
same-pace-lower-HR over weeks is the cleanest fitness signal that
exists without lab tests; Maffetone/Seiler-adjacent. Chart + one-line
trend verdict. Feeds A6's adaptation loop with something better than
pace misses. Effort: M after A3.

**B4. Polarization check (Seiler 80/20).** Weekly intensity
distribution vs the 80/20 target, from HR zones or pace bands. Most
recreational runners run their easy days too hard — the single
highest-value elite habit to transfer. Display + gentle nudge. Effort:
S after A3/HR. Source: Seiler.

**B5. The individualized exposure model (RUN-EV-04 — unlocked by
data).** The deferred handoff row: replace static ladders with ramps
fitted to the athlete's own tolerated load history, with provenance and
fallbacks. This is THE elite ability — Magness's whole thesis — and it
stays deferred until real users generate real longitudinal data. Every
feature above (A3, B1, B3) is also the data-collection prerequisite for
this one. Effort: XL, post-launch, own design cycle.

**B6. Season planning: A/B/C races.** One goal race today. Elite
athletes periodize a season; recreational runners do a tune-up race
before a marathon (Pfitz explicitly schedules them). Minimum viable: a
B-race inside a marathon block (taper-lite week + auto-recovery),
scheduled around the existing phase rail. Effort: L. Depends on the
Run9a two-state lock — needs a grill before any model change.

**B7. Recovery signals in, cautiously.** Sleep/HRV import via HealthKit
(A3) as *context* on the easier-today chooser — never as a readiness
score (the easierToday module's own register, already documented: "ONE
factual reason, never a readiness percentage"). Effort: M after A3.

---

## 3. Non-features — elite things Tropos should NOT fake

Named so future grills don't relitigate them:

- **Readiness scores.** A single 0–100 "recovery %" is pseudo-precision;
  the codebase's own register (easierToday) already rejects it. Signals
  in, verdicts out — one factual reason at a time.
- **Lactate/VO2 lab-style numbers from phone data.** Estimation theater.
  VDOT from race efforts is honest; fake lab metrics are not.
- **Medical claims.** The mostly-easy rename (RUN-EV-05) and the
  recovery banner copy set the register: describe what the plan does,
  never promise safety or physiology.
- **AI-form-coaching from video.** Not with current evidence quality.
- **Sub-elite volume defaults.** Pfitzinger's 55–90 mi/wk plans are for
  runners who already run 50+. The medium-long PR deliberately pegged
  peaks BELOW source values; keep that discipline everywhere.

---

## 4. Sequencing recommendation

Pre-launch, iOS-first, one developer-operator. Three waves:

**Wave 1 — "feels coached" (pure client, no new data):**
A5 explainers → A4 session types (strides first) → A1 structured
sessions → A7 race-day plan. Every run in the plan gains visible
intent. Small PRs, each independently shippable.

**Wave 2 — "knows me" (the data spine):**
A3 HealthKit (the long pole — start early) → A2 target time →
B1 load guardrails → B2 environment adjustment → A6/A8.
A3 unblocks B3/B4/B7.

**Wave 3 — "adapts like a coach" (post-launch, data-fed):**
B3 → B4 → A9 → B6 → B5 (RUN-EV-04, the end state).

The two structural advantages — hybrid lift integration (A9) and
nutrition (A8) — are the moat features: Runna cannot follow there
without becoming a different product. They are deliberately placed
after the "feels coached" wave because coached-feeling sessions are the
first-session impression, and the moat features are retention features.
