# Tropos lifting-programming evidence handoff for Claude Code

> Target baseline: remote origin/main at
> a69a9d655424ca4c27e8315bcbffe340f1085748, audited on 2026-08-07.
> Re-fetch the intended branch and record its SHA before relying on any
> current-state claim below.

## Purpose

Use the supplied lifting sources to improve Tropos's programming experience
without turning books, study averages, or a coach's sample routine into an
opaque universal algorithm.

This document gives Claude Code:

- evidence principles that plausibly transfer to a broad fitness product;
- the current remote-main architecture and intentional product behavior;
- the remaining correctness work that must not be obscured by new theory;
- a bounded, testable workflow for future programming changes.

It is not approval to rewrite stored programmes, diagnose readiness or injury,
or open a pull request.

## Important repository status

Do not merge the old divergent lift feature branch into main. The earlier lift
work was already squash-merged: the tree at local feature commit
feeadb497de44ec8d667ce0c53c36a7353103741 matches the GitHub-authored main
commit ec0296d3. Remote main contains further work after that merge. This
handoff therefore targets the remote SHA above, not the old feature branch.

## Read before making a change

1. Fetch the actual target branch and compare its SHA with this document.
2. Read AGENTS.md, CLAUDE.md, and the dual-scheduling ADR.
3. Read the lifting evaluation and the volume-currency and command-boundary
   ADRs: docs/proposals/lifting-v8-evaluation.md, docs/adr/0010-volume-currency.md,
   and docs/adr/0011-command-boundary-scope.md.
4. Trace the real caller, persistent field, server owner, and tests for the
   proposed change. Existing remote behavior is authoritative until an owner
   chooses otherwise.
5. Make one bounded product decision before editing. Do not perform a broad
   book-driven rewrite.

Lifts are split-ordered; runs are date-pinned. Preserve that distinction.

## Product guardrails

- Adherence is first: equipment, available time and days, confidence,
  preference, current capacity, and concurrent running are programming inputs.
- Training age changes complexity and autonomy more than it changes blanket
  dose. Do not equate advanced status with endless volume or risky exercise
  selection.
- A saved programme, exercise identity, calibrated load, history, or schedule
  must not change invisibly.
- Use plain coaching language. Do not present a heuristic, book protocol, or
  research average as individual certainty.
- Pain and medical concerns are boundaries, not inputs to a diagnostic engine.
  Offer conservative choices or escalation guidance, not rehabilitation or a
  readiness diagnosis.
- Changes must respect both light and heavy users of the system: a novice,
  a returning lifter, an experienced lifter, a runner who lifts, and someone
  with a history-bearing programme all need safe behavior.

## Evidence ledger and source provenance

The books are evidence inputs, not assets to commit or redistribute. Their
transferable concepts are stronger where they agree across sources than where
one author specifies an exact routine or number.

| Source                                                                                                                        | Best product use                                                         | Key limitation                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Vladimir Zatsiorsky, William Kraemer, Andrew Fry, Science and Practice of Strength Training, 3rd ed. (2021)                   | Strength specificity, stable anchors, monitoring and recovery concepts   | Athlete/strength context; not a consumer prescription for percentages, velocity, or power work. |
| Steven Fleck, William Kraemer, Designing Resistance Training Programs (1987 Human Kinetics edition)                           | Needs analysis, gradual exposure, equipment and time constraints         | Historical framing, not modern numeric dose.                                                    |
| Eric Helms, Andrea Valdez, Andy Morgan, The Muscle and Strength Pyramid: Training, 2nd ed. (2019 Spanish adaptation supplied) | Adherence hierarchy, stage-aware progression and deloads                 | Practical coaching heuristics, not a generator specification.                                   |
| Mike Israetel, James Hoffmann, Melissa Davis, Jared Feather, Scientific Principles of Hypertrophy Training (2021 EPUB)        | Hypertrophy trade-offs, fatigue awareness, controlled variation          | Advanced physique focus; do not implement personal MEV, MAV, or MRV calculations.               |
| Brad Schoenfeld, Science and Development of Muscle Hypertrophy, 2nd ed. (2021)                                                | Effort, selection, rest, volume/frequency trade-offs, concurrent context | Broad ranges and individualization; no single optimal split or deload.                          |

The supplied editions were read on 2026-08-07 from temporary local attachment
caches. PDF review combined text extraction with visual spot checks. EPUB review
used its ZIP, OPF, NCX, and XHTML structure. The cache data below permits
reproducible source identification without copying the books into the repo.

| Source                   | Cache ID / format |      Bytes | SHA-256                                                          |
| ------------------------ | ----------------- | ---------: | ---------------------------------------------------------------- |
| Zatsiorsky, Kraemer, Fry | 4A1cTo / PDF      | 17,385,808 | 3EFE90ECF7BAC3503F66B269FB04151C7BE81138B50413BA86B50626DE83285F |
| Fleck, Kraemer           | Le4kFj / PDF      | 45,936,612 | 84B3129A05118DB27C5622262127C7EE23F029BC8859E0FFF0763F169E69A9F2 |
| Helms, Valdez, Morgan    | Erbyh8 / PDF      | 16,200,369 | B28331113AB19D21ED54176E9629A09F672E6C7920901B59EFDA092AD80FE535 |
| Israetel et al.          | oiyexp / EPUB     |  1,545,751 | 7E509AB447D01C21AB449E00198CA92192C45B5C8FB10F818F75DFC26828163B |
| Schoenfeld               | q2nfE8 / PDF      |  8,620,715 | 05B86DF883117C01489928B87F74E19A0360E42C17CE98AF0666FD412C0F4DEF |

### Transferable evidence principles

- Start from a needs analysis: goals, equipment, time, schedule, experience,
  preferences, and other training determine whether a plan is usable. Fleck
  and Kraemer, Chapter 3; Helms et al., pages 33-45.
- Keep enough work stable to learn and compare; variation should solve access,
  pain, fatigue, staleness, plateau, or a planned transition rather than
  calendar novelty. Zatsiorsky et al., Chapters 1 and 5; Israetel et al.,
  Chapters 2 and 5.
- Progress conservatively from observed work. Load, reps, sets, effort, rest,
  and density are distinct signals. Do not reduce prescription to a universal
  percentage of one-repetition maximum. Zatsiorsky et al., Chapter 4.
- Goal and training age alter intent, complexity, and choices. They do not
  establish exact personal volume landmarks. Helms et al., pages 53-103 and
  116-167; Schoenfeld, Chapter 4.
- Frequency primarily distributes tolerable work. Split choice should fit
  schedule and recovery rather than be marketed as universally superior.
  Schoenfeld, Chapter 4.
- Failure, RPE, and RIR are useful uncertain tools, not mandatory defaults or
  interchangeable clinical measurements. Schoenfeld, Chapter 4; Helms et al.,
  pages 116-167.
- Deloads and recovery reductions are useful tools, but no source makes a
  fixed 3:1 or four-week cadence universal. Helms et al.; Schoenfeld, Chapters
  6 and 8.
- Concurrent lifting and running requires visible trade-offs, not a promise of
  an interference diagnosis. Zatsiorsky et al., Chapter 11; Schoenfeld,
  Chapter 8.

### Applied lifting design rules

This is the self-contained, paraphrased source synthesis Claude should use
instead of reopening the books. It translates the shared lessons into product
behaviour; it does not authorize a new universal generator or any author's
sample programme.

| Decision                            | Evidence-informed Tropos behaviour                                                                                                                                                                                                                                                                                                                        | Do not encode                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Establish the starting point        | Treat a first plan as a conservative hypothesis built from goal, available days/time, equipment, confidence, preferences, other training, and any trustworthy completed history. Collect a new input only when it changes a visible plan choice. Saved history outranks cold-start assumptions.                                                           | A demographic field, desired goal, or one estimated max as a complete capacity or readiness model.                                                   |
| Choose and retain exercises         | Apply selection precedence: safety/injury boundary and available equipment, required movement role/coverage, current identity/history/calibration, stated preference, then variety. Keep a stable anchor long enough to learn and compare. Explain every replacement and use the existing identity/load boundary so history transfers only when truthful. | Calendar novelty, a cosmetic swap, or relabelling history/load onto a materially different, cross-category, bodyweight/loaded, or rep-unit exercise. |
| Represent the dose                  | Model each working prescription as exercise, sets, reps or seconds, load/resistance, effort cue, rest, order, and meaningful modification. Volume totals are an audit and planning aid, not the whole stimulus. Timed holds remain seconds from generation through history and progression.                                                               | One universal volume number, tonnage alone, or repetition-shaped logic for a time-based movement.                                                    |
| Judge a completed session           | Treat performance as comparable only for the same exercise identity/instance, rep unit, and calibrated-load context. Warm-ups, missing/incomplete work, unsafe substitutions, pain boundaries, and fresh/uncalibrated movements are hold/calibration states, not progression, recovery, PR, or volume evidence.                                           | Treating every logged row as equivalent evidence or using a warm-up/partial session to escalate dose.                                                |
| Progress from observed work         | Use the smallest explainable response justified by eligible completed work: progress, hold, reduce, recover, or deliberately reselect. A noisy or incomplete session should not trigger a confident escalation. Do not change more than one prescription dimension per response unless a named recipe deliberately composes them.                         | Calendar-only load jumps, forced progression after a modified session, or variation as the default response to a single bad day.                     |
| Use effort feedback                 | Let RPE/RIR or an equivalent effort signal refine a prescription when the person can use it. Show that it is an estimate and accept missing or low-confidence feedback without treating it as failure.                                                                                                                                                    | Failure-by-default, a clinical readiness score, or assuming reported RIR is exact across people and exercises.                                       |
| Allocate work and frequency         | Use frequency to distribute tolerable work across the person's actual week. Make a declared strength or muscle priority visible in the allocation and in what is deprioritized, while preserving recovery and session-time constraints.                                                                                                                   | A claim that one split, frequency, or every-muscle-at-once maximum volume is universally superior.                                                   |
| Manage fatigue and deloading        | Treat the current calendar shape as a starting heuristic and completed work/repeated regression/user feedback as reasons to review it. When reducing work, state whether sets, reps, load, exercise stress, or schedule changed and give a bounded path back. An untrained week cannot manufacture training stimulus.                                     | A fixed deload cadence as physiology, an MRV diagnosis, or copy that promises a load reduction when the actual recipe changes something else.        |
| Scale complexity by experience      | Let training age chiefly change exercise complexity, optional effort/autonomy, and how much explanation/control the person receives. Keep a simple, legible route for all tiers.                                                                                                                                                                          | Automatic volume inflation, advanced methods, daily maxes, or technical movements merely because a user is labelled advanced.                        |
| Coordinate lifting with running     | Surface the competition for leg stress, time, and recovery. If a hard run and a hard lift conflict, show the trade-off and offer a choice consistent with the user's stated priority.                                                                                                                                                                     | A silent deletion, catch-up session, fixed separation rule, or an interference/injury diagnosis.                                                     |
| Explain changes and preserve agency | Before a material change, show what changes, why, expected trade-off, and how to keep, modify, or reverse it. Saved programme identity, calibrated load, completion truth, and history remain the default.                                                                                                                                                | A book-driven rewrite of an existing plan with no user-visible decision or rollback path.                                                            |

The underlying synthesis is consistent with needs analysis and gradual exposure
(Fleck and Kraemer), specificity and monitoring (Zatsiorsky, Kraemer, and
Fry), adherence and staged progression (Helms, Valdez, and Morgan), fatigue
and controlled variation (Israetel and colleagues), and effort,
volume/frequency, and concurrent-training trade-offs (Schoenfeld). The
chapter/page references in the preceding principles are the traceable source
locations for a proposal.

### Conservative response ladder

For a future progression, recovery, or variation feature, prefer this
decision order:

1. Preserve the recorded session truth and determine whether the completed
   data are usable for a decision.
2. Check an explicit constraint: available equipment/time, user modification,
   pain boundary, concurrent hard running, or an active recovery/block state.
3. If the person completed the intended work with a trustworthy positive
   signal, make at most the bounded progression the current policy permits.
4. If the signal is uncertain, hold the prescription and invite a user review;
   do not manufacture a regression or advancement.
5. If there is repeated, explainable shortfall, reduce the relevant stress or
   offer recovery/replanning before changing exercise identity.
6. Change identity only for a named reason and through the safe
   load/history-reset or transfer rule. Persist, explain, and test the result.

This is a product decision hierarchy, not a diagnostic or individualized
physiology model.

### Contemporary evidence checkpoints

| Source                                                                                                             | Safe product implication                                                                           | Limitation                                                                |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Ramos-Campo et al., split versus full-body resistance training (2024)](https://pubmed.ncbi.nlm.nih.gov/38595233/) | When work is comparable, let frequency, recovery, preference, and schedule determine split choice. | It does not validate every Tropos split or prescribe volume.              |
| [Robinson et al., estimated proximity to failure (2024)](https://pubmed.ncbi.nlm.nih.gov/38970765/)                | Preserve effort as one useful signal; do not require failure or fixed RIR by default.              | Intervention-level RIR estimates do not identify an individual's optimum. |
| [Huiberts, Wüst, and van der Zwaard, concurrent training (2024)](https://pubmed.ncbi.nlm.nih.gov/37847373/)        | Surface lifting/running trade-offs as context-dependent choices.                                   | Evidence remains incomplete for hypertrophy and highly trained people.    |

## Current remote-main architecture

| Concern                  | Primary paths                                                                                                    | Current meaning                                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persisted programme      | src/features/program/programTypes.ts                                                                             | ProgramState holds the rolling lift state; ProgramExercise holds stable instance identity, prescription, rep unit/range, progression state, and history.                                                                                          |
| Plan construction        | src/features/program/planBuilder.ts and programEngine.ts                                                         | buildPlan composes profile, schedule, lift programme, and run plan. It preserves any existing same-day-count plan on content edits; cold start, day-count/experience rebuild, and explicit reset follow the template/procedural generation rules. |
| Templates and selection  | templates, templateConversion, matchTemplate, variationBank, startingLoads, injurySubstitutions, experienceModel | Exercise identity, equipment fit, calibrated load, and history preservation are high-risk boundaries.                                                                                                                                             |
| Volume and recovery      | volumeModel, muscleTaxonomy, overlapModel, adjustmentRule                                                        | The system uses auditable muscle accounting and recovery/overlap controls. Internal MRV-style labels are product heuristics, not a diagnosis or measured personal physiology.                                                                     |
| Block lifecycle          | trainingBlock, represcribe, useProgram, server command reducers                                                  | An active block temporarily owns the lift prescription and is reversibly released through the command boundary.                                                                                                                                   |
| Commands and persistence | programCommandClient, commandOutbox, useProgram, functions/index.js, functions/lib/programCommands.js            | Most interactive programme mutations now use optimistic command application, durable outbox handling, rejection rollback, and authoritative refetch.                                                                                              |
| Session and progression  | WorkoutSession, useProgram, programEngine, functions/lib/progressionEngine.js                                    | Completion, effort, progression, history, and persistence must stay semantically aligned on client and server.                                                                                                                                    |

## Current remote-main behavior to preserve

### Vocabulary that must not be conflated

| Concept                       | Durable owner                                                           | Allowed product meaning                                                                            | Must not substitute for                                                                           |
| ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Nutrition phase               | Goal/profile state                                                      | Cut, recomp, or lean-bulk context that may influence the plan.                                     | Standing lifting focus, active block, or recovery status.                                         |
| Standing lifting focus        | primaryGoal/programme configuration                                     | The long-lived strength, hypertrophy, fat-loss, general, or running-support intent.                | A nutrition phase or an automatically active specialization block.                                |
| Active block focus            | Training-block state and command lifecycle                              | A temporary, reversible prescription emphasis with recorded start/release history.                 | A permanent goal change, diagnosis, or stale saved snapshot.                                      |
| Lifecycle and recovery status | Programme lifecycle fields, deload/recovery state, and typed view model | A truthful explanation of the current plan/recovery action when the underlying recipe supports it. | A generic Hypertrophy label, nutrition phase, or evidence of personal fatigue physiology.         |
| Experience tier               | Profile/programme experience model                                      | Complexity, coaching autonomy, and appropriate exercise/effort options.                            | A fixed ability score, a personal volume landmark, or permission for automatic high-risk methods. |

### Goals, splits, and tiering

- Goal is the nutrition phase: cut, lean bulk, or recomp. Primary goal is the
  lifting stimulus: strength, hypertrophy, fat loss, general, or running.
  Never conflate the two.
- Current procedural split policy is frequency-led: one, two, and three lift
  days use full body; four uses upper/lower; five uses PPL plus upper/lower;
  six uses PPL twice. Zero means a run-only configuration. A preferred split is
  not a license to violate this generated baseline.
- Strength mains use a 5-7 band with 8-12 accessories. Hypertrophy, general,
  and fat-loss use 8-12 mains with 12-15 accessories. Running support uses
  4-6 mains with 10-12 accessories and reduced lift volume. These are current
  Tropos base policies, not book-mandated universal prescriptions. For
  intermediate and advanced plans, automatic day roles can shift final
  rep targets by plus or minus two; treat the bands as anchors, not every
  final row's exact output.
- Beginner, intermediate, and advanced tiers gate complexity and coaching
  autonomy. Advanced work may use more appropriate variants and RPE; that does
  not mean an indiscriminate volume increase.

### Prescription, volume, and lifecycle

- A fresh plan opens at its base shape. For trained weeks, the calendar cadence
  is a starting policy: accessory shape moves around base minus one, base, and
  base plus one, while recovery signals can override the calendar.
- The current every-fourth-trained-week deload is a Tropos heuristic, not a
  book-mandated cadence. Treat any revision as an explicit product decision.
- An untrained week can advance the calendar anchor, but must not archive
  fictional training or advance mesocycle/deload work as if the user trained.
  Lift week keys protect pure-lifter rollover semantics.
- User-approved prescription edits outrank generated defaults. Update the
  lifecycle anchor read at rollover, such as baseSets, or persist an explicit
  override so a later week cannot silently erase an edit. A missed or partial
  lift must not create catch-up sets, compressed split scheduling, or
  accelerated progression; resume the ordinary sequence/dose or offer an
  explicit rest/replan choice.
- The volume model now uses one-to-one primary and secondary credit with
  per-exercise deduplication, fine-muscle attribution, canonical display
  rollups, and a 14-group judgement layer. Its bands are transparent heuristic
  priors, not individualized MEV/MAV/MRV claims.
- The generator accounts for direct calf and side-delt work and avoids
  double-counting one physical set inside a canonical bucket. Preserve this
  accounting when changing exercise data or volume policy.
- The recovery rule can react to repeated regression by reducing
  muscle-local work or escalating to a whole-programme deload, while
  persisting recoveringMuscles. It must remain explainable as a conservative
  Tropos heuristic, not a personal MRV measurement or medical judgement.
- Before changing recovery or block behavior, record one precedence table for
  manual deload, local/whole-programme recovery, calendar shaping, and block
  pace. Do not silently stack reductions from multiple owners in one week.
  The table must identify the source of user copy, what is reversible, and
  whether completed work is immutable.
- Training blocks are not merely metadata. Starting a block applies a
  sanctioned focus-and-pace prescription transform; release restores the
  standing focus without resetting the current truthful loads or erasing
  history. Block history records what happened.
- A focus-changing block retains days, exercise identities/instance IDs,
  history, and truthful current calibration. It may re-prescribe non-seconds
  target/range/progression and safely reduce load when a higher target needs
  it; target-specific failure counters reset. Timed holds are not
  repetition-represcribed. Release applies the standing focus forward rather
  than restoring a stale snapshot. A same-focus/full block must not cause a
  hidden prescription change, and easing copy must name the exact recipe
  effect before confirmation.
- A permanent primary-goal change with unchanged lift-day count still preserves
  existing workouts. Do not mistake the temporary block re-prescription path
  for a decision to silently rebuild every saved programme.

### Command and mutation boundary

- The canonical program-command transport is a bare command object. The server
  tolerates the historical wrapped form only for rollout compatibility. Keep
  the sender contract bare.
- ProgramState/sanitizer key parity is mechanically protected, including
  plateauResponses. Every new persistent ProgramState field must be represented
  at each required normalization, validation, sanitizer, reducer, migration,
  and transaction boundary.
- New interactive mutations should use the command path. Existing direct
  snapshot writes are deliberate exceptions, including workout-completion
  full-state batches, lift/run rollover, run regeneration/realignment, and
  the current reorder-rejection fallback. A new direct snapshot write needs a
  named owner, an explicit precedence/conflict reason, and tests showing no
  hidden-field loss.

## Status ledger

### Resolved at the target SHA

| Item                      | Current result                                                                                                  | Preserve                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Command envelope          | The client sends the bare command shape; the callable accepts the legacy wrapper only for compatibility.        | Do not reintroduce a required wrapper or fork command serialization.                                     |
| Plateau-state persistence | plateauResponses is sanitizer-allowed and ProgramState/sanitizer parity is tested.                              | Extend parity whenever durable programme state grows.                                                    |
| Block focus lifecycle     | Start/release are server-owned command transforms with reversible focus handling.                               | Preserve exercise identity, history, and truthful current load through block changes.                    |
| Split and volume upgrades | Low-frequency full-body policy, goal-aware rep bands, 1:1 volume currency, and muscle taxonomy are implemented. | Treat their numbers as current product policy subject to explicit change, not as accidental boilerplate. |
| Run-support lifting       | Running primary goal has a strength-oriented, lower-volume lift prescription.                                   | Coordinate with the running plan rather than overwrite it.                                               |

### Open correctness work

Issue IDs make the work list durable across Claude sessions. (Renamed from
`LIFT-0x` at integration — this repo's 2026-07-10 programme audit already
uses that vocabulary for unrelated issues.) Re-verify each
one at the target SHA before changing it: **ready correction** means the
documented behaviour can be repaired without choosing a new product policy;
**owner decision** means Claude must obtain/record a decision first.

STATUS 2026-08-09 (integration re-audit, base `52c2f02`): LIFT-EV-02
CONFIRMED open — `planBuilder.ts` still falls back to
`currentPhase: "Hypertrophy"` for a fresh build (~line 537-540).
LIFT-EV-03 RESOLVED in the integrating PR (#1886): both deload paths
already shared the tier-split recipe (`programEngine.applyDeload` ↔
`functions/lib/deloadEngine.js`, backlog #8), so the defect had narrowed
to the copy — `DeloadBanner`'s active state now derives its sentence from
the experience tier (beginner/unknown: "lighter weights"; post-novice:
"at the same weights"), with a four-tier mutation-safe test matrix;
residue: the stale `−1 set, ×0.85` recipe comment at
`functions/lib/programCommands.js:1520` (comment-only, left for the next
functions-touching PR). LIFT-EV-07 CONFIRMED present —
`startingLoads.ts:75` still applies `sex === "female" ? 0.75 : 1`,
documented in-file; the owner decision remains open. LIFT-EV-01, -04,
-05, -06, -08 were NOT re-verified in this pass — trace before acting.

STATUS 2026-08-09, owner-decision session (PR #1886): LIFT-EV-02
DECIDED and RESOLVED — the phase label derives from the primary goal.
Implementation honors the engine's real vocabulary: `planBuilder` now
initializes `currentPhase: "progression"` (the value rollover already
writes; "Hypertrophy" only ever survived week 1), and Home's header
renders `primaryGoalLabel(primaryGoal)` with the deload lifecycle state
overriding — a strength plan can no longer read "Hypertrophy phase" in
any week. LIFT-EV-07 DECIDED — RETAIN AND FENCE: the 0.75 female
starting-load factor stays (removing it would RAISE first-session seed
loads for female users — a safety regression), bounded in writing to
cold-start seeding only; it must never expand into sex-based
programming and is superseded the moment any real capacity signal
exists for the user. Full unit suite green after both changes.

STATUS 2026-08-09 (second batch, owner delegated the choice):
LIFT-EV-05 DECIDED, implementation owed — automatic protective
reductions stay, but they must be SURFACED: a banner (DeloadBanner
pattern) with honest copy that does not cite MRV/landmark science the
engine doesn't implement, plus a one-tap undo restoring the
undiminished prescription. LIFT-EV-06 DECIDED, implementation owed —
a same-frequency primary-goal change offers a visible keep-or-
represcribe choice reusing the existing training-block transform;
never silently automatic in either direction. Neither is shipped;
each is a bounded feature PR with its own design surface.

STATUS 2026-08-09, later same session — BOTH SHIPPED (PR #1886).
LIFT-EV-05 RESOLVED: `RecoveryReductionBanner` (Program page, next to
the deload banner) names the halved muscles with factual trigger/change
copy and no physiology claims; `revertRecoverySession` is the pure
inverse (restores sets/reps from the stash, drops `preDeloadReps`);
`undoRecoveryReduction` persists it via the standing ADR-0011
document-write path. Reversal semantics as decided: `recoveringMuscles`
is KEPT on undo, so the refractory guard holds and the trigger cannot
re-fire for the same muscles next rollover. Known residue, deliberate:
the whole-body escalation still writes no discriminator — it remains
indistinguishable from a calendar deload in state, and the deload
banner covers its visibility; adding a marker field was judged not
worth the sanitizer/type surface until someone needs the attribution.
LIFT-EV-06 RESOLVED: `focusChangedSameFrequency` in ProgrammeSettings
gates a two-action confirm ("Save and update sessions" via
`represcribeWorkouts`, or "Save, keep current sessions"); neither is
default. Undo semantics as specified: the transform is invertible by
re-application, so changing the focus back re-offers the choice in the
opposite direction — no snapshot kept. Note the client-side seam adds
a prescription-writing path through `configurePlan` (the legacy
full-document exception); if the command boundary ever closes over
configurePlan, this belongs in a `represcribeFocus` command reusing
the existing `functions/lib/represcribe.js` mirror.

| ID / state                        | Issue                                                                                                                                                                                                                        | Required outcome                                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LIFT-EV-01 — P1, ready correction | Timed-hold repeated failure is still repetition-shaped in the client and server progression mirrors. First trace: programEngine, progressionEngine, and their cross/engine tests.                                            | Define a seconds-specific decrement and floor; test linear and double paths, range caps/floors, history, labels, and client/server parity.                                                                                        |
| LIFT-EV-02 — P1, ready correction | A fresh build still initializes currentPhase to Hypertrophy regardless of primary goal. First trace: planBuilder, programme types/labels, and plan-builder/migration consumers.                                              | Separate goal, block focus, nutrition phase, and lifecycle status, or render a typed neutral view model. Audit every consumer so a strength plan cannot receive a false label.                                                    |
| LIFT-EV-03 — P1, ready correction | Manual-deload copy promises lighter weights even when the selected recipe may hold load and reduce sets/reps. First trace: DeloadBanner and the client/server deload recipes.                                                | Derive copy from the active recipe or use truthful neutral language. Test beginner, intermediate, advanced, and timed-hold views.                                                                                                 |
| LIFT-EV-04 — P1, owner decision   | The command boundary is intentionally incomplete because retained full-snapshot writes can race command or lifecycle writers. First trace: useProgram, program-command client/outbox, and server command lifecycle.          | Document each exception's owner and precedence; test client command applied, queued, rejected, and refetched paths plus stale-device/outbox interleavings.                                                                        |
| LIFT-EV-05 — P1, owner decision   | Two-session regression is internally labelled MRV and can automatically reduce a local muscle or escalate to a whole-programme deload. First trace: programEngine, easierToday/recovery helpers, and recovery-trigger tests. | Make the trigger, user copy, recovery choice, and reversal semantics explicitly reviewable; preserve recoveringMuscles and test local/whole-body, trained/untrained, and client/server paths. Do not claim individual physiology. |
| LIFT-EV-06 — P2, owner decision   | A same-frequency permanent goal change does not offer a user-visible prescription rebuild decision. First trace: planBuilder, Programme Settings, and existing plan/history preservation tests.                              | Decide whether to offer it. If approved, specify identity, calibrated load, history, active-session, migration, and undo semantics before code.                                                                                   |
| LIFT-EV-07 — P2, owner decision   | Starting-load logic currently applies a sex-based 0.75 factor for female users while all other values use the default factor. First trace: startingLoads and its tests.                                                      | Make retention, revision, or removal an explicit calibration/fairness/safety decision. Never silently change saved loads, and do not expand this into deterministic sex-based programming.                                        |
| LIFT-EV-08 — P2, owner decision   | The first fresh plan's base shape is a product default, not demonstrated individual capacity. First trace: planBuilder, programEngine, and onboarding/template entry paths.                                                  | If changing it, collect only explainable, consented inputs and retain safe no-data fallbacks. Do not infer a personalized volume landmark from one signal.                                                                        |

## Evidence-informed decision queue

| Priority | Candidate decision                                           | Guardrail                                                                                                                          |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Make tier policy legible in product copy and tests.          | Preserve complexity/autonomy framing; do not blanket-gate volume.                                                                  |
| P1       | Improve the observed-performance progression loop.           | Never progress after unsafe substitution, pain boundary, missing completion data, or unusable effort data.                         |
| P1       | Finish command/direct-write ownership boundaries.            | Do not half-migrate fields or treat parity as a substitute for live concurrency behavior.                                          |
| P1       | Improve the block-end review.                                | Offer bounded choices such as continue, release, adjust, or easier week; do not auto-diagnose fatigue or silently rewrite history. |
| P2       | Improve transparent volume review.                           | Surface understandable bands and uncertainty; do not claim exact personal landmarks or use opaque physiology scores.               |
| P2       | Improve run/lift coordination advice.                        | Flag trade-offs and offer choices; never silently delete, stack, or weekday-pin lifts.                                             |
| P2       | Add optional session-quality guidance.                       | Keep rest, order, ROM, tempo, and effort cues plain-language and non-punitive.                                                     |
| P3       | Add outcome instrumentation before advanced personalization. | Every recorded signal must support a visible user decision and have an honest no-data fallback.                                    |

## Explicit non-adoptions

Do not add the following merely because they appear in a source:

- universal weekly set targets, muscle frequency, automatic weekly set
  additions, or exact personal volume landmarks;
- a new universal fixed deload cadence. The current every-fourth-trained-week
  Tropos policy is a heuristic requiring explicit review, not a source mandate;
- failure-by-default, AMRAP testing, daily maxes, test-day maxes, competition
  peaking, percent-of-one-repetition-max programming, velocity training, or
  power-athlete monitoring as ordinary defaults;
- new mandatory DUP, PPL, six-day lifting, weekday-pinned lifts, or automatic
  calendar-driven exercise rotation beyond the current limited, tier-aware
  day-role variation;
- BFR, bands/chains, flywheels, eccentric overload, drop sets, rest-pause,
  supersets, partial-ROM work, or other advanced methods as regular defaults;
- new deterministic programming from sex, age, genetics, or assumed response.
  The existing sex-based starting-load factor is a separately documented
  active cold-start heuristic needing explicit review, not a justification to
  generalize sex-based rules;
- rehabilitation, medical clearance, injury prediction, or an overtraining
  diagnosis; or
- silent rewrites of saved prescriptions, historical loads, or exercise
  identity.

## Claude Code implementation contract

Before code, record the following for one bounded slice:

| Field                   | Required content                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Evidence principle      | Paraphrase plus book chapter/page or review reference.                                                         |
| Current behavior        | Exact target SHA, paths, fields, caller, and affected users.                                                   |
| Product decision        | What Tropos will intentionally do.                                                                             |
| Non-goal                | What the source says that Tropos will not import.                                                              |
| Ownership and migration | Persistent fields, client/server owners, normalization, sanitizer, reducer, migration, and concurrency impact. |
| User journey            | Entry UI to stored/refetched state to next session or week.                                                    |
| Validation              | Tests and concrete visible scenarios, including a negative or mutation check where practical.                  |

Any new measurement or personalization signal needs a user-visible purpose,
consent and no-data fallback, a durable owner, and proof that it cannot
silently alter an existing saved prescription.

Completion is fail-closed:

1. State the target SHA, owner decision, non-goals, and rollback/migration plan.
2. Trace the real user path: UI, hook/client, persistence or server reducer,
   refetch/rollover, and next session/week.
3. Update all crossed boundaries together: types, normalization, validation,
   sanitizer, reducer, migration, copy, and tests.
4. Include a real caller/component or cross-boundary regression, not only a
   new helper test.
5. Verify saved and refetched state plus the relevant lifecycle transition.
6. Run focused tests, npm run verify, and git diff --check. Confirm no source
   assets or temporary extracts are staged.

## Required verification matrix

Apply the relevant parts of this matrix to every lift-programming change.

| Dimension             | Minimum cases                                                                      |
| --------------------- | ---------------------------------------------------------------------------------- |
| Tier                  | beginner, intermediate, advanced, unknown/legacy where relevant                    |
| Primary goal          | strength, hypertrophy, fat loss, general, running                                  |
| Lift frequency        | zero through six requested days where affected                                     |
| Nutrition phase       | cut, recomp, lean bulk when prescription changes                                   |
| Equipment/constraints | full gym, home/minimal, substitution/injury-boundary paths                         |
| Programme history     | fresh, template-derived, regenerated, and history-bearing                          |
| Identity/load         | same movement, same-category variation, cross-category, bodyweight/loaded boundary |
| Prescription          | main/accessory, reps, seconds, range, rest, baseSets                               |
| Failure               | first, second, third failure; weighted/bodyweight/timed-hold client/server parity  |
| Lifecycle             | trained and untrained weeks, deload, recovery, start/release/end block             |
| Scheduling            | split order, schedule edit/override, week-wrap adjacency, date-pinned runs         |
| Session flow          | warm-up, working sets, effort timing, completion, PR/history effects               |
| Persistence           | normalization, migration, callable validation/sanitizer/reducer, state parity      |
| Concurrency           | queued/rejected/refetched command and retained direct-save interleavings           |

Start with the relevant engine, plan-builder, experience, volume, overlap,
variation, starting-load, migration, command-envelope, command-parity, server
sanitizer, Programme Settings, and WorkoutSession tests. Add a genuine session
integration test when changing logging, warm-ups, PRs, effort capture, timed
holds, or completion behavior.

## Owner decisions still needed

1. Should a permanent primary-goal change offer a visible re-prescription
   option when lift frequency is unchanged?
2. Which direct snapshot writes remain exceptions, and what conflict policy
   protects them against command and lifecycle writers?
3. Which lifecycle concept belongs in user-visible phase copy, separate from
   nutrition, primary goal, and training-block focus?
4. Should a block-end review ask a short recovery question, and which choices
   are recommendations versus automatic action?
5. How should transparent volume review evolve without creating a false
   personal-volume algorithm?
6. What run/lift priority information is worth collecting before offering
   scheduling or recovery advice?
7. Should repeated regression remain an automatic recovery action, and what
   user-visible review/undo language keeps its MRV-style label honest?
8. Should the existing sex-based starting-load factor be retained, revised, or
   removed, and what calibration, fairness, and saved-load transition policy
   supports that decision?

## Final instruction

Use evidence to improve the questions Tropos asks, the choices it presents,
and the safety and clarity of its decisions. Preserve history, identity, load,
schedule, local-date semantics, and honest completion state. Prefer a small
end-to-end improvement with real-path tests over a large theory-driven rewrite.
