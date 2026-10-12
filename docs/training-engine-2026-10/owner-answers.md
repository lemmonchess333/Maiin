# Owner answers, 2026-10-07

The owner delegated the open calls on 2026-10-07, after the verification pass:
"you answer the decisions", then run the training-engine prompt. These are the
answers, each with its reason and what the run does with it. They are decided:
the run builds on them and does not ask again.

They are locked as Pgm7 in `.claude/plans/programme-run-followups.md`
(lemmonchess333/Maiin#2604, on its own `claude/lock-pgm7` branch, as CLAUDE.md
requires). None of them reverses an earlier owner decision.

## The answers

### A1. Counting indirect sets (ADR-0010)

**Question.** Tropos counts an indirect set as a full set (1.0) since
2026-08-03. Pelland 2025 found that counting it at about 0.4–0.5 predicts
growth and strength best. Go back to 0.5?

**Answer.** No change to the plan's counting. The plan keeps 1.0; the
simulator's virtual lifter, and any forecast shown to a person, count indirect
sets at 0.5.

**Why.** ADR-0010 chose 1:1 so that the plan's tally is counted the way the
sources of its bands counted: Schoenfeld's dose–response bands count each set
once, whatever it trains indirectly, and the groups judged on RP's per-muscle
table (side and rear delts, abs) count direct work only. The judged layer at
1:1 measured better than the old layer at 0.5 (over-ceiling readings 24.0% →
17.7%, the worst reading from 185% of its ceiling to under 150%). Pelland
answers a different question, which count best predicts outcomes, and
publishes pooled curves, not per-muscle bands, and no maximum (its growth
curve keeps rising, with no detectable gain past about 31 fractional sets a
week). So it gives nothing to re-denominate the 14 judged groups' bands into.
Each number stays in the currency of its source: 1.0 where the plan is judged
against bands, 0.5 where the response is predicted.

**For the run.** The simulator's V_frac uses 0.5 and checks that Tropos's
secondary map counts as indirect what Pelland did. Then it measures the risk
Pelland points at: where compounds fill a judged group's band at 1.0, the
reconciler shrinks that group's direct work (triceps, biceps, hamstrings and
chest are the groups the ADR found reading high). If the simulated growth of
those muscles falls behind directly trained muscles at the same tally, the fix
is per judged group (re-anchor that band, or count that group's indirect sets
at 0.5), through a further ADR-0010 addendum with the planSweep measurement.
Never a global flip.

### A2. The app's fitness–fatigue curve (`trainingLoad.ts`)

**Question.** The training-load card's model implies a fatigue:fitness gain
ratio of about 5.7, against a median of 2 in published fits. Change it?

**Answer.** Keep it as it is.

**Why.** It follows the fitness-and-freshness charts people know from Strava
and TrainingPeaks (the file names Strava's as its model): a 42-day fitness
average, a 7-day fatigue average, form = fitness − fatigue. Those apps' exact
constants are unverified here ([U] in the evidence docs), but any chart built
on 42- and 7-day averages implies a ratio near 6 (τ₁/τ₂). The published median
of 2 comes from models fitted to predict performance, a different job. The card
is shown only on History, feeds no prescription, and its copy doesn't predict
performance.

**For the run.** The virtual athlete uses the published priors
(running-evidence §6.2), never `trainingLoad.ts`. No copy may turn form into a
prediction ("you'll be fresh by Friday"). No code change.

### A3. The one line for a stretched rep range

**Question.** When the next weight is more than about 15% heavier, Lift4 (6)
lets the reps climb past the range instead (`stretchedRepCeiling`: 10 kg
dumbbells climb to 22 reps, the same effort as 12.5 kg for 12). Say anything?

**Answer.** Yes: one line, once, on the session where a target first climbs
past its range, in the shape of Lift4's drop line ("Down from 100 kg: two
sessions under 5 reps"): what changed, then why, in the person's own numbers.
For example: "Up to 22 reps on 10 kg: 12.5 kg is a big jump." Nothing after
that; when the person picks up the heavier weight, the plan follows, and the
numbers explain it.

**Why.** Lift4's quiet rule: a target past the range shown on the row can't be
explained by last time's sets, so it gets one line. MacroFactor, Alpha
Progression, RP and Gravl stretch reps the same way, and MacroFactor and Alpha
each needed a help article for the resulting high targets
(explanation-ux §3.12).

**For the run.** Check the ceiling's maths before the line ships:
`stretchedRepCeiling` uses Epley out to 20 reps and more, past the 10 reps
Reynolds 2006 found the formulas valid for. Compare it with Nuzzo 2024's means
at those loads (lifting-evidence §2.15) and keep the ceiling that survives. The
final wording follows docs/voice-and-tone.md.

### A4. Lift4 (9): a lighter week taken from Train, and the calendar count

**Question.** The lock's text and the lighter-week precedence table read
differently: does a lighter week the person takes restart the calendar count?

**Answer.** Yes. A lighter week the person takes counts as the calendar one
and restarts its count, as the precedence table says
(`docs/lift-programming-claude-handoff.md`, "Lighter-week precedence (Lift4,
2026-10-05)").

**Why.** The table is what Lift4's build order (0) asked for, written the same
day, so it is the lock's own reading. The code's reading gives two lighter
weeks in three when one is taken in week 2 (measured:
`measurements/lifting-probes4.md`). Strength athletes deload about every 5.6 ±
2.3 weeks (Rogerson 2024); nothing supports two in three.

**For the run.** A Phase 4a correction, red test first: taken in week 2, the
next calendar lighter week comes four trained weeks later; taken in week 3,
week 4 is a normal week.

### A5. Which definition of a hard run wins

**Question.** The lift side counts any run of 8 km or 45 minutes as hard
(`isHardRun`, `src/lib/hybridGuidance.ts`), plus long, tempo and interval runs.
The run plan counts long, tempo, intervals and race. Which wins?

**Answer.** The run plan's. For the lifting rules, a run is long or hard when
its planned type is long, tempo, intervals or race, or any other quality type
the run plan schedules. A run with no planned type (freeform, logged outside
the plan, or from Health) counts as long at 75 minutes or more. Distance never
counts on its own, and an easy run is never hard.

**Why.** `isHardRun` decides both the session's after-a-hard-run record
(Lift4 (14)), which halves a leg miss (Lift4 (7)), and the hard-run reason in
"Easier today". So an easy 50-minute run halves the next leg miss, while a 5K
race doesn't count at all: races aren't on its list. 8 km takes 40 minutes for
one runner and 70 for another, and no coaching definition calls an easy run
hard. The 75 minutes is a CONVENTION.

**For the run.** Phase 1 item 5 exports this one definition and both sides
import it. The simulator reports how many untyped runs the 75-minute line
catches and misses.

### A6. Home's today card

**Question.** Should Home's today card carry the session's explanation inline?

**Answer.** No. Keep the owner's 2026-09-09 call: no explanation on Home's
card. The "About this run" sheet is one tap away, on the session the card
opens.

**Why.** It is an explicit owner decision, pinned in `SessionPurpose.test.tsx`,
and the new evidence agrees with it: the apps that explain best (Runna,
Garmin, and the lifting apps checked on 2026-10-07) show the number first and
keep the reason one tap away.

### A7. A race plan on one run a week

**Question.** "New to running" with a race set defaults to one run a week, and
the planner accepts a marathon on it.

**Answer.** A race plan needs at least two run days a week; a marathon's setup
recommends three. "New to running" with a race set defaults to two. A person
with fewer days is offered more days, a shorter race or a later date; the
setup never builds a one-run marathon. Existing plans are untouched (Pgm5).

**Why.** The audit measured a "New to running" marathon at the one-run default:
one run a week growing to 25 km, 214 minutes for a 38:00 5K runner, 100% of the
week (running-engine-audit §6.7 (d)). Daniels caps the long run at 30% of the
week below 64 km. Runna's plans start at two runs a week (from a search result;
its help page was blocked from here), its beginner marathon sample has three,
and Couch to 5K uses three. Two is the floor that keeps light trainers in.

**For the run.** Phase 5b builds it; the simulator re-runs persona (d).

### A8. The lighter week's loads

**Question.** In Rogerson 2024, 83.7% of athletes also lighten multi-joint
loads in a deload. Lift4's lighter week keeps the weights. Change it?

**Answer.** No. Keep Lift4's recipe: half the working sets, same weights,
comfortably easy.

**Why.** Bell 2023's Delphi panel accepted unchanged intensity when volume
drops (95% agreement). Rogerson describes what athletes do, not what works
better, and no trial compares the two. The recipe is an owner call (Lift4 (9),
owner call (2)).

### A9. Lift4 (7): a leg miss within a day after a long or hard run counts half

**Question.** The verification found no study behind it. Keep it?

**Answer.** Keep it, labelled an assumption.

**Why.** It is a protective default, not a finding: it stops one long run from
lowering a leg lift. With A5 it fires only after real long or hard runs.

**For the run.** The simulator reports how often it changes a drop.

### A10. The training-load card's ramp line

**Question.** The card warns when the last 7 days carry more than 1.4 times
the 4-week average (`ACWR_SPIKE_THRESHOLD`). Frandsen 2025 and Impellizzeri
2021 found the ratio a poor injury predictor. Keep it?

**Answer.** Keep it as written.

**Why.** It is advisory, labelled a Tropos heuristic, never mentions injury and
feeds no prescription, which is the shape running-evidence §8 asks for. The
evidence argues against the ratio as a risk score, and this line isn't one.
The run plan's progression check is the single-run guard (Phase 5b), not the
ratio.

### A11. The signed-out specs that run in no CI job

**Answer.** Wire `smoke`, `navigation` and `legal-pages` into the existing
emulator workflow on chromium, not required until they have been green for two
weeks. Run `accessibility`, `performance`, `pwa`, `security`, `responsive` and
`responsive-safari-standalone` on a nightly schedule.

**Why.** The first three are the cheapest and catch a broken build or route.
The other six are slower and gate nothing today; a nightly run gives their
signal without taxing every PR. `requiredCheckComposition.test.ts` pins the
required set, so it changes only when a job is promoted.

### A12. The links to the coach's videos

**Answer.** Not needed (owner, 2026-10-07: "you don't need the video links as
I gave you all the transcripts"). `owner-lifting-sources.md` cites him by name
and video title.

## The questions the run finds

The owner delegated these too. Phase 6 still writes `decisions.md`, but the
run answers each question itself, locks it and builds it, by these rules:

1. Choose the option the evidence and the simulation favour across the
   personas, the cold-start, light-trainer and returning ones included, not
   only the median.
2. When two options land within the simulation's noise, keep what the app
   does now.
3. Never reverse an explicit owner decision: a Lift4 owner call, a lock row's
   "owner:" line, or a decision pinned in a test (Home's today card). Those go
   back to the owner, with the evidence.
4. Lock each answer with the lock-decision skill, marked "owner-delegated,
   2026-10-07", before code relies on it.
5. Every change ships as a draft PR; the owner merges.

Still the owner's: merging; reversing an earlier owner decision; anything that
touches money, privacy, or a medical or safety claim.
