# Training-engine pass — inputs, 2026-10-06

The audits and research behind
[`docs/agents/training-engine-prompt.md`](../agents/training-engine-prompt.md),
the prompt for a multi-agent pass on Tropos's lifting and running. Gathered in
one session at HEAD `55c195a` by six parallel agents, plus coaching transcripts
the owner supplied. The evidence was checked against its primary sources on
2026-10-07.

**Nothing here is a lock.** Locks live in
`.claude/plans/programme-run-followups.md`; the lifting system's spec is the
Lift4 row. These files are evidence and measurements; `decisions.md` records
the answers the pass reached from them and points at each lock.

## How far to trust each kind of file

- **Audits** (`*-audit.md`): every claim is a `file:line` at `55c195a` or a
  measurement from running the real code. They are point-in-time: line
  numbers drift, so re-trace a claim before acting on it.
- **Evidence** (`*-evidence.md`, `explanation-ux.md`): the first draft
  (2026-10-06) opened no paper or web page, because this environment's egress
  policy blocked PubMed, every publisher, the coaching sites and the app help
  centres. On 2026-10-07 the sources themselves were read: the full text
  where it was open (PMC, Europe PMC, preprints, OSF files, author copies),
  otherwise the PubMed abstract, the Crossref record, the book or the page.
  A second agent re-checked the disputed claims. A few publishers stayed
  blocked (among them Springer, journals.lww.com and
  journals.physiology.org), and 8 of the 108 app links failed (2 dead, 6
  blocked). Each claim carries one marker, shared across the folder:
  - `[VF]` — checked against the full text on 2026-10-07;
  - `[VA]` — checked against the abstract, or the book or web page itself;
  - `[U]` — the source is identified, but this claim could not be checked
    (paywalled, blocked, or not stated in the abstract);
  - `[R]` — still not identified or not checked;
  - `[C]` — computed by the folder's own scripts from published numbers.

  The first draft's `[V]`, `[V2]`, `[V*]` and `[K]` are gone, and `[R]` no
  longer means "recalled". Each evidence doc opens with its main corrections
  and the load-bearing claims still `[U]` or `[R]`. Never encode a `[U]` or
  `[R]` number as a constant or put it in copy until it is verified (the
  prompt's Phase 0). The handoffs' source-intake rule still applies: a source
  joins the handoff ledgers only after a readable review.

- **Owner sources** (`owner-lifting-sources.md`): six Sebastian Oreb YouTube
  transcripts, paraphrased into principles with timestamps. The coach's claims
  carry no marker: they are his. The research notes added against them on
  2026-10-07 carry the markers above. The transcripts themselves are not
  stored and must never be committed. The video links aren't needed (owner,
  2026-10-07); the doc cites the coach by name and video title.

## Read order

| File                                                         | What it is                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [lifting-engine-audit.md](lifting-engine-audit.md)           | The lifting pipeline end to end; the simulation seam; Lift4 clause-by-clause conformance; 12 generated plans; a 7-persona, up-to-52-week proof of concept on the real engine; what a strength coach would object to                                                                                                                                      |
| [running-engine-audit.md](running-engine-audit.md)           | The running pipeline; every session label × every surface and its explanation; paces; week composition; run ↔ lift coupling; a 13-variant, 52-week simulation on the real generator; what a running coach would object to                                                                                                                                |
| [test-infrastructure-audit.md](test-infrastructure-audit.md) | Unit and E2E layers; the emulator rig, measured working in this container (signed-in suite 46/46 in 4.7 min; a real account moved +16 weeks); clock and determinism seams; designs for the headless simulator and the browser journeys                                                                                                                   |
| [lifting-evidence.md](lifting-evidence.md)                   | Powerlifting, hypertrophy, powerbuilding, general fitness and lifting for runners: volume, frequency, effort, periodization, peaking, expected progress by training age, adherence priors, a virtual-lifter response model, what adaptive apps publish about their models, a Lift4 gap analysis, non-adoptions; each topic's verified parameters         |
| [running-evidence.md](running-evidence.md)                   | A source ledger, every row marked by how it was checked; intensity, injury, taper, concurrent training; a 19-type session dictionary with plain-English lines; simulation priors (Banister, injury hazard, detraining); personas; a year ending in a marathon while lifting; non-adoptions                                                               |
| [explanation-ux.md](explanation-ux.md)                       | How Runna, Strava, NRC, Garmin, COROS, TrainingPeaks, Apple, Polar, Hevy, Strong, Fitbod, RP, JuggernautAI, MacroFactor Workouts, Alpha Progression, Boostcamp, Gravl and Liftosaur explain sessions, effort and changes; a pattern library; recommendations for Tropos under Lift4's quiet-by-default rule; what checking every cited page changed (§9) |
| [owner-answers.md](owner-answers.md)                         | The owner's answers to the open calls (A1–A12, 2026-10-07), each with its reason and what the run does with it, and the rules for the questions the run finds                                                                                                                                                                                            |
| [decisions.md](decisions.md)                                 | The questions the pass found, lifting and running: what is locked, the evidence, the simulation, the options and each answer, and what goes back to the owner                                                                                                                                                                                            |
| [owner-lifting-sources.md](owner-lifting-sources.md)         | The owner's coaching sources (Oreb), mapped against Lift4, with the generator checks they imply; his citations checked (OREB-07's "Dr. Rhea" range matches Rhea 2003 and Peterson 2004–2005, which count sets per muscle group per session) and his %1RM table set against Nuzzo 2024                                                                    |
| `measurements/`                                              | Raw outputs the lifting audit cites (generated plans, the simulation summary, probes)                                                                                                                                                                                                                                                                    |
| `harnesses/`                                                 | The scratch harnesses that produced the measurements, saved as `.txt` so no toolchain runs them. Seeds for the real simulator, not the simulator: they re-implement private logic inline (ADR-0008's drift risk)                                                                                                                                         |

Not kept, and regenerable by rerunning the harnesses: the lifting simulation's
full week-by-week log, the running simulation's full output, and the plans'
JSON twin.

## Corrections made at integration

The integrating session checked load-bearing claims against the tree. Three
were wrong in the agents' first drafts and are corrected in place:

1. **ADR-0010's counting.** The lifting evidence said Tropos "already counts
   0.5" and that the 1:1 flip was planned. The flip **landed** on 2026-08-03:
   `SECONDARY_SET_WEIGHT = 1.0` in `volumeModel.ts`, recorded in the ADR's
   second addendum. Pelland 2025's weekly fits favour fractional counting for
   strength as well as hypertrophy (best indirect weight about 0.38–0.39; 0.5
   fits well) and fit weekly strength worst with direct-only counting.
   Direct-only counting fits strength best only per session, in Remmert 2025;
   this README first credited that to Pelland. The evidence therefore argues
   for _returning_ to about 0.4–0.5 for both goals — a question for the ADR,
   not a code change.
2. **Runs after race day.** The test-infrastructure audit read
   `racePlanSafetySweep.test.ts` as recording that 28.4% of plans schedule runs
   after race day. That figure is historical: the sweep now pins zero. It is a
   guarded regression, not an open defect.
3. **Lighter-week precedence.** The lifting audit marks Lift4 (9) as built to
   the lock's text but not to the handoff's precedence table, which says a
   lighter week taken from Train restarts the calendar count. Which reading
   governs was decided on 2026-10-07: the precedence table does
   (`owner-answers.md` A4).

## Checked against the sources, 2026-10-07

On 2026-10-07 every source then in the two evidence docs' ledgers was
checked, and every link `explanation-ux.md` cites was fetched. Lifting: 390
claims confirmed, 115 corrected, 47 unsupported and 39 not checkable.
Running: 341, 131, 38 and 41. Explanation: 100 of 108 links read in full.
The corrections that move a design:

- **Set counting (Pelland 2025).** 0.5 counting fits strength as well as
  size; direct-only counting fits weekly strength worst. Extra strength stops
  being detectable past about 3–4 fractional sets a week, not 5 direct sets.
- **Frequency.** At equal volume Pelland finds more sessions help strength
  (0.73 at once a week, 1.14 at three, relative to twice), but Grgic 2018
  found no clear effect, so the effect rests on one analysis.
- **Tapers.** Running: about 2 weeks (8–14 days; up to 3 still works),
  volume cut 41–60%, intensity and frequency kept. A strength test: volume
  cut 30–50% (up to 70%) over 1–2 weeks, then 2–7 days off.
- **The single-run guard (Frandsen 2025)** is measured by distance only, with
  no novice estimate; a duration bound is a Tropos extrapolation.
- **Daniels' long-run cap** is 30% of weekly volume below 64 km a week, and
  the lesser of 25% or 150 minutes from 64 km a week.
- **Expected strength progress.** Untrained lifters gain about 30–50% in
  year 1; trained lifters starting a strength programme about 7.5–12.5%; then
  about 1–2% a year (Latella 2024, Steele 2023). Latella 2020 followed lifters
  for 1.6–1.8 years, not 15, and the ACSM rates are the 2002 stand's.
- **Reps at %1RM.** Nuzzo 2024's means replace the textbook table (9.8 reps
  at 80%, 8.8 on the bench); a rep is worth about 2–3% of 1RM.
- **The app's own models.** `trainingLoad.ts`'s update step implies a
  fatigue:fitness gain ratio of about 5.7, against a published median of 2;
  `estimate1RMRange` is centred 2–6% high on true sets to failure.

## Headline findings

The prompt carries the detail; these are the ones that shape it.

- **Everything that decides a prescription is pure**, so the real engine can be
  simulated week by week. The blockers are four pieces of inline or private
  logic (the weekly rollovers and `nextRunWeek` in `useProgram.ts`,
  mark-day-done, the session-progression assembly), a wall-clock date stamp in
  `applyProgression`, and non-deterministic instance ids.
- **Lift4 is mostly built as written.** Measured gaps: a level change doesn't
  change how main lifts progress; bodyweight mains on a fixed target never
  progress; the Performance tab still shows "Lifting suggestions"; block
  represcription assigns heavier days by position; the running goal reads
  "Improve running".
- **Lift4 suits novices, general fitness, Build muscle and runners who lift.**
  It falls short for strength lifters (no per-lift frequency floor, no 1–3-rep
  exposure, no peak or test, session-to-session steps that produce a
  sawtooth of drops) and for time-rich advanced hypertrophy lifters.
- **The running engine judges correct running as wrong.** Verdicts and the live
  pace bar average the whole run, warm-up included. The benchmark auto-derive
  reads easy runs as race efforts. With no benchmark (the onboarding default)
  every tempo targets 4:30/km.
- **The year-out marathon is badly shaped**: 20 easy-only weeks, a 15 km long
  run for 29 weeks, +34–59% jumps after step-backs, a −61% taper with no long
  run in the last four weeks.
- **Session explanations exist in one collapsed line**, only on race plans.
  "Hard" means five different things; on the lift side an easy 50-minute run
  counts as a hard run.
- **The test rig works here**, and a simulated week costs about 2–5 ms headless
  or 15–20 s in the browser. Nine signed-out specs run in no CI workflow.
