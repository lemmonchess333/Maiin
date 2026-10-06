# Training-engine pass — inputs, 2026-10-06

The audits and research behind
[`docs/agents/training-engine-prompt.md`](../agents/training-engine-prompt.md),
the prompt for a multi-agent pass on Tropos's lifting and running. Gathered in
one session at HEAD `55c195a` by six parallel agents, plus coaching transcripts
the owner supplied.

**Nothing here is a decision.** Locks live in
`.claude/plans/programme-run-followups.md`; the lifting system's spec is the
Lift4 row. These files are evidence and measurements to bring to the owner,
not changes to make.

## How far to trust each kind of file

- **Audits** (`*-audit.md`): every claim is a `file:line` at `55c195a` or a
  measurement from running the real code. They are point-in-time: line
  numbers drift, so re-trace a claim before acting on it.
- **Evidence** (`*-evidence.md`, `explanation-ux.md`): **no paper or web page
  was opened directly.** This environment's egress policy blocked PubMed,
  every publisher, the coaching sites and the app help centres, and web search
  was capped at 200 calls per turn across all agents. Each claim carries a
  marker:
  - `[V]` — checked against abstract or summary text that search returned;
  - `[V2]` / `[V*]` — checked through a secondary source, or by the sibling
    research agent;
  - `[R]` / `[K]` — recalled from prior knowledge, **not** re-checked.

  Never encode an `[R]`/`[K]` number as a constant or put it in copy until
  it is verified (the prompt's Phase 0). The handoffs' source-intake rule
  still applies: a source joins the handoff ledgers only after a readable
  review.

- **Owner sources** (`owner-lifting-sources.md`): six Sebastian Oreb YouTube
  transcripts, paraphrased into principles with timestamps. The transcripts
  themselves are not stored and must never be committed. The video URLs were
  not supplied; ask the owner for them before citing.

## Read order

| File                                                         | What it is                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [lifting-engine-audit.md](lifting-engine-audit.md)           | The lifting pipeline end to end; the simulation seam; Lift4 clause-by-clause conformance; 12 generated plans; a 7-persona, up-to-52-week proof of concept on the real engine; what a strength coach would object to                                        |
| [running-engine-audit.md](running-engine-audit.md)           | The running pipeline; every session label × every surface and its explanation; paces; week composition; run ↔ lift coupling; a 13-variant, 52-week simulation on the real generator; what a running coach would object to                                  |
| [test-infrastructure-audit.md](test-infrastructure-audit.md) | Unit and E2E layers; the emulator rig, measured working in this container (signed-in suite 46/46 in 4.7 min; a real account moved +16 weeks); clock and determinism seams; designs for the headless simulator and the browser journeys                     |
| [lifting-evidence.md](lifting-evidence.md)                   | Powerlifting, hypertrophy, powerbuilding, general fitness and lifting for runners: volume, frequency, effort, periodization, peaking, expected progress by training age, a virtual-lifter response model, a Lift4 gap analysis, non-adoptions              |
| [running-evidence.md](running-evidence.md)                   | A 113-row source ledger; intensity, injury, taper, concurrent training; a 19-type session dictionary with plain-English lines; simulation priors (Banister, injury hazard, detraining); personas; a year ending in a marathon while lifting; non-adoptions |
| [explanation-ux.md](explanation-ux.md)                       | How Runna, Strava, NRC, Garmin, COROS, TrainingPeaks, Apple, Polar, Hevy, Strong and Fitbod explain sessions, effort and changes; a pattern library; recommendations for Tropos under Lift4's quiet-by-default rule                                        |
| [owner-lifting-sources.md](owner-lifting-sources.md)         | The owner's coaching sources (Oreb), mapped against Lift4, with the generator checks they imply                                                                                                                                                            |
| `measurements/`                                              | Raw outputs the lifting audit cites (generated plans, the simulation summary, probes)                                                                                                                                                                      |
| `harnesses/`                                                 | The scratch harnesses that produced the measurements, saved as `.txt` so no toolchain runs them. Seeds for the real simulator, not the simulator: they re-implement private logic inline (ADR-0008's drift risk)                                           |

Not kept, and regenerable by rerunning the harnesses: the lifting simulation's
full week-by-week log, the running simulation's full output, and the plans'
JSON twin.

## Corrections made at integration

The integrating session checked load-bearing claims against the tree. Three
were wrong in the agents' first drafts and are corrected in place:

1. **ADR-0010's counting.** The lifting evidence said Tropos "already counts
   0.5" and that the 1:1 flip was planned. The flip **landed** on 2026-08-03:
   `SECONDARY_SET_WEIGHT = 1.0` in `volumeModel.ts`, recorded in the ADR's
   second addendum. The evidence (Pelland 2025: fractional counting predicts
   hypertrophy best, direct-only predicts strength best) therefore argues for
   _returning_ to 0.5 for hypertrophy judgements — a question for the ADR,
   not a code change.
2. **Runs after race day.** The test-infrastructure audit read
   `racePlanSafetySweep.test.ts` as recording that 28.4% of plans schedule runs
   after race day. That figure is historical: the sweep now pins zero. It is a
   guarded regression, not an open defect.
3. **Lighter-week precedence.** The lifting audit marks Lift4 (9) as built to
   the lock's text but not to the handoff's precedence table, which says a
   lighter week taken from Train restarts the calendar count. Which reading
   governs is unresolved; the prompt asks for it to be confirmed before any
   fix.

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
