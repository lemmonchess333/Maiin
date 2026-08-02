# Tropos v8 pack — full evaluation, and the corrected lifting framework

**Date:** 2026-08-02 · **Baseline:** `origin/main` @ `e37d9b5` (evaluation) / `9b1eaef` (this branch)
**Scope:** the lifting side. The running handoffs (05–10) are unevaluable — Daniels,
Pfitzinger and Magness were never supplied. That is a gate, not a delay.

**What this document is.** The v8 pack asked to be treated as a framework handed
down. It was instead evaluated against (a) the five training-science books
supplied, read in full by parallel readers, and (b) the actual code on `main`,
read and measured. Where the pack is right it is kept and strengthened. Where it
is wrong it is replaced. Where it describes work that is already shipped it is
struck. This document supersedes the pack for the lifting arc.

> **STATUS 2026-08-02 — the P0 set is implemented, and building it corrected
> this document.** Three amendments, kept here rather than edited into the body
> so the original claim and its correction both stay legible:
>
> - **§2.3 D3 named the wrong predicate.** It said the guard "already exists 26
>   lines above and is not applied", pointing at `isSetEligibleForStrengthPr`.
>   That predicate is `setType !== "warmup" && repUnit !== "seconds"` — **a drop
>   set passes it**, so applying it verbatim would have fixed nothing. The
>   shipped fix adds a separate `isSetEligibleForProgression` (working and
>   failure count; warmup and dropset do not; `repUnit` is a PR concern that
>   does not belong). The near-miss is what let the bug survive review, and it
>   nearly let a non-fix ship.
> - **§2.3 D2 undercounted the projection.** There are **three** copies, not
>   two: `useProgram`, `Routine`, and `functions/lib/programCommands.js:1184`.
>   The server one is latent — the client only sends `applyDeloadWeek` /
>   `revertDeloadWeek` over the command boundary — but it is in the frozen
>   command vocabulary. Relatedly, the command validator allowed **no** optional
>   keys on a set log, so widening the client alone would have made a
>   `completeWorkoutDay` command reject outright.
> - **A sixteenth defect, found while verifying D4, that outranks it. D16:**
>   `plateauResponses` is emitted unconditionally by `advanceWeek` and was
>   **absent from `PROGRAM_STATE_KEYS`**. `runProgramCommandTransaction` throws
>   `invalid-argument` when the sanitiser drops any key, so "Apply deload week"
>   did not merely lose load for anyone who had ever rolled a week — it
>   **hard-errored and did nothing**. Only a freshly-built plan (which carries no
>   `plateauResponses`) reached D4's load leak at all. The claimed guard could
>   not catch it: the coverage test iterates a hand-written fixture rather than
>   the interface, so a field added to the type and to neither the fixture nor
>   the key set stayed green. Fixed, plus the missing type pin — the same third
>   pin `profileFieldRegistry.test.ts` added for `UserProfile` after three
>   recurrences of exactly this.
>
> §2.3's D4 is also narrower than written: the client's restore path already
> handles reps as well as load, and `programExerciseBuilder` already carries
> both fields. Only the server command lacked the stash.

> **STATUS 2026-08-02b — P1 and P2 implemented. Four corrections to this
> document, and one item that turned out to be complete by design.**
>
> - **11a needs nothing further, and that is a decision rather than an
>   omission.** §6 schedules "11a alone, with zero consumers by design" in P2,
>   but its substance is D2, which shipped in P0. What remains of the handoff is
>   `eligibleForCalibration` — and per §8.5 that predicate has no caller until
>   the relative-RPE check exists. Shipping it now is exactly the
>   written-ahead-of-its-wiring debt the reachability gate discourages, so
>   `workoutSetRecord.ts` records the refusal in writing: the DATA ships here,
>   the predicate ships with its caller. **P2's 11a row is closed as
>   already-done.**
> - **§8.1's currency flip is staged, against what that section implied.** It
>   said the P1 fixtures "are what make that safe to do". They made it safe to
>   MEASURE, and the measurement changed the answer: flipping to 1:1 alone takes
>   per-muscle readings over a ceiling from 180/825 to **364/825** while
>   under-floor falls 263 → 147 — worse in total and worse in the costlier
>   direction. Both predictions I had made were wrong, including the hoped-for
>   offset from `overshootsCeiling`. The currency decision stands (1:1 is
>   correct); ADR-0010 records it and stages the flip to land with
>   landmark-aware builders. See the ADR for the full table.
> - **§3.8(c) is right that MV is missing but understates the consequence.**
>   Without it the model cannot distinguish "losing the muscle" from "paying
>   fatigue for no growth" — two different failures that both read as `low`. The
>   shipped ladder is `below_maintenance / junk / optimal / high`, with
>   `classifyVolume` derived from it so no existing surface moves.
> - **13a's taxonomy work surfaced a defect §3.9 could not see, and it was
>   user-visible.** A FOURTH label table lived in `exerciseDemo.ts`, unpinned:
>   **12 exercises highlighted no primary muscle at all** on the exercise
>   guide's body diagram — a lateral raise with no shoulder — plus 36 dropped
>   secondaries. §3.9 reasoned about the taxonomy's expressiveness; the live
>   cost was in a table it never mentions.

> **STATUS 2026-08-02c — P3's three items, and two of them turned out not to be
> builds.** 14b shipped as specified (see `recoveryTrigger.ts`). The other two
> were investigated first, and the investigation changed the answer:
>
> - **§3.4's "pass weekly aerobic minutes into `buildLiftProgram`" is NOT
>   built, and should not be until a source locates the optimum.** §3.4 itself
>   says so — "the correct framing for a hybrid user is an optimum, not a
>   penalty, and no source locates it" — but the P3 row still schedules the
>   wiring. Wilson's r = .75 is a CORRELATION with interference, not a
>   dose-response for the lift prescription, and Schoenfeld p.209 rules out
>   trading the two loads at all ("no exchange rate"). So passing minutes in
>   means either a parameter nothing reads, or an invented curve. F&K's 12–15RM
>   / 2×wk / 20–30 min runner prescription (p.120) is the only concrete dose in
>   the corpus, it is gated on being a distance runner rather than on minutes,
>   and it is from the **1987 first edition** — a thin basis for re-scheming
>   every running-goal user's mains. Checked what the engine already does: the
>   `running` goal prescribes 8–12 mains / 12–15 accessories at a 0.85 volume
>   multiplier, so F&K's accessory range is already matched.
> - **§3.4's separate-days sub-rule was already implemented — and completely
>   undefended.** `generateSchedule` only ever emits a "both" day when the week
>   cannot fit (verified: 0 violations across all 64 lift×run combinations).
>   But the tests asserted `both >= 1` on overflow cases, which a schedule that
>   doubled up EVERY day would also satisfy — i.e. the existing assertions
>   could not tell the correct schedule from the worst one, and the worst one
>   is exactly Wilson's interference case (ES 0.8 same-day vs 1.05 separate).
>   Pinned exhaustively with the citation; adding one unnecessary both-day now
>   fails six tests. Per the pack's own preamble, an existing deliverable is
>   struck rather than reimplemented — but "exists" and "is defended" are
>   different claims, and this one was only the first.
> - **The adaptation-permission enum (`insights`/`suggest`/`auto`) is deferred
>   as a PRODUCT decision, not an engineering one.** §5 calls it cheap because
>   it maps onto `ProgramSettings.autoProgression`, and the two end states do:
>   `auto` is `true`, `insights` is `false`. The middle state is the feature —
>   compute the change, show it, let the user accept — and that is a new
>   user-facing affordance, which interacts with the INVISIBLE presentation
>   policy the adjustment rule and the deload recipe both carry, and with the
>   locked "surface outcomes, hide mechanisms" operator decision
>   (`training-book-reviews.md:683`). The engine work is genuinely small; the
>   decision about whether Tropos asks the user to approve prescriptions is
>   not mine to take unilaterally.

> **STATUS 2026-08-02d — P4 (handoff 12) shipped, and the anchor slot it aimed
> at turned out to be computed-but-rendered-nowhere.** §5 says the strength
> readout goes "into the existing block-review anchor slot". The slot exists in
> `blockReviewViewModel`, and a grep for a production consumer of
> `review.anchors` returns **nothing** — it has been computed and shown to no
> one since the review shipped. So P4 both filled the slot and rendered it,
> which the GsPb1 lock explicitly provides for ("an optional anchor-movement
> metric").
>
> Two corrections to §5's framing of handoff 12:
>
> - **The anchor metric was not merely a point estimate — it ignored reps
>   entirely.** `bestSetKg` is the heaviest bar touched, so it ranks 100 kg × 1
>   above 95 kg × 10, and the second is the stronger performance by 27%. That is
>   a worse defect than the constant-confidence one §5 names, and it sat in the
>   exact slot the handoff was aiming at. Both load fields stay — heaviest bar
>   is a real fact — with the e1RM range added alongside.
> - **The ranking/display split has to be explicit.** §5 asks for a range, but
>   `epley1RMExact` must stay the single source for COMPARISONS (best-set
>   selection, PR scoring, chart series): overlapping bands have no order, and
>   those surfaces need a total order. So the point estimate keeps its job and
>   nothing PRESENTS it as though its confidence were constant. A test pins that
>   the two never drift apart.
>
> On the widths: the three tiers are sourced (Helms p75 for the tight 3–6
> region; Schoenfeld p.92 and Zatsiorsky p.62 for the breakdown; `null` above
> ~15 rather than an ever-wider band, because a reader anchors on a band's
> midpoint either way). The ±5/±10/±20 percentages are a **declared prior**,
> scaled against Schoenfeld p.92's one-person worked example — 80% 1RM being a
> 6RM, 10RM and 15RM on three exercises, which puts Epley 4% low, 7% high and
> 20% high respectively. One subject and three exercises is not a calibration
> set; saying so in the module matters more than picking better numbers.
>
> The deferred date back-map is now written out in §8.3 rather than referred to,
> with the three things a future implementation must not lose — chiefly that it
> needs a TESTED single, not an estimate: seeding a six-week plate ramp from the
> midpoint of a band this arc just finished widening would compound the error
> across every prescription in the block.

> **STATUS 2026-08-02f — P6 part 1 started. The boundary migration is blocked
> on a prerequisite neither §5 nor §6 names, and the writer count was
> understated.**
>
> - **32 `saveProgram` call sites, not 19** — 26 in `useProgram.ts` and 7 in
>   `Program.tsx`, against ONE command-boundary caller (the deload button). The
>   ◻ figure counted one file.
> - **The migration is not a mechanical rewrite, and doing it today would make
>   the app worse.** `saveProgram` calls `setDocGuarded` → Firestore `setDoc`,
>   and `firebase.ts` initialises the SDK with `persistentLocalCache`, so those
>   writes queue in the SDK and replay on reconnect. `applyProgramCommand` is an
>   HTTPS callable, which does not. `sendDeloadCommand` already says exactly
>   this in its own comment — "unlike the offline-queued setDocGuarded writers,
>   a callable can't replay" — which is why the boundary has one consumer, and
>   why that consumer is the single write that genuinely requires network.
>
>   So migrating a writer today trades a clobbering bug for offline DATA LOSS.
>   For a gym app, a basement with no signal is the normal case; losing a logged
>   workout is categorically worse than a two-tab race. Packet 18's own plan
>   listed "the client subscriber/outbox" as a later PR — that outbox is the
>   real blocker, and it did not exist.
>
> - **It exists now** (`commandOutbox.ts`), and it is small because the hard
>   half already shipped: `runProgramCommandTransaction` reads
>   `commandReceipts/{commandId}` INSIDE the transaction and short-circuits, so
>   replaying a command cannot double-apply. The client half is just "persist
>   it, replay it, let the server decide". Only transport failures queue — a
>   server rejection is dropped, because CLAUDE.md already records what a queue
>   that retries poison costs ("a raw write that fails online fails forever on
>   every flush", ~25 call sites to fix). `failed-precondition` is the live
>   case: a command queued offline may arrive into a world where its
>   precondition no longer holds.
> - **Part 2 (the ledger) stays gated, on §5's own argument** — "an audit trail
>   over a document that 19 client writers can still clobber is an audit trail
>   over a record that lies". 32 writers is a stronger version of the same
>   argument, not a weaker one.
>
>   One finding for when it is built: `PROGRAM_COMMAND_RECEIPT_RETENTION_MS`
>   (31 days) currently serves TWO purposes with different requirements.
>   Idempotency needs only "longer than any plausible replay window" — days.
>   Audit needs "longer than the phenomena being audited" — §5's ~400 days,
>   because the adaptations take 6–8 weeks. Widening the single constant would
>   over-retain idempotency markers; the two want separating, not raising.

> **STATUS 2026-08-02g — the boundary migration is started, and the mapping is
> the finding.** Of the 32 writers, the exercise-list edits in `Program.tsx`
> looked like the obvious first slice: 7 sites, all with a server reducer
> already written. Checking each against its reducer instead of assuming
> equivalence cut that to 5, and only one is provably equivalent today.
>
> - **`replaceExercise` would regress every swap to 0 kg.** The client calls
>   `weightAfterExerciseSwap(old, newId, loadContextFrom(profile))`; the server
>   reducer sets `weight: 0` and says why — "no trusted profile calibration
>   context". Migrating it would undo the load-seeding P1 fixed. The
>   transaction DOES read the profile, so the reducer could be given the
>   context — but that means mirroring `startingLoads.ts` server-side, with a
>   cross-test. **The boundary's second prerequisite, and it is a mirror.**
> - **`addExercises` IS equivalent** — the client also seeds `weight: 0`.
> - **The remove/undo PAIR cannot be half-migrated.** The undo re-inserts the
>   removed exercise object with its history and load; the server's
>   `addExercises` rebuilds from the catalog and cannot restore either. And
>   migrating the remove while its undo stays a direct write leaves precisely
>   the mixed-mode clobbering the boundary exists to remove. Faithful undo
>   needs a server-side soft delete — a new command kind, not a call-site swap.
> - **`reorderExercises` is the one that is provably equivalent**: a pure
>   permutation by `instanceId`, no calibration, no catalog rebuild, no undo
>   partner, and a reducer that refuses anything but an exact permutation.
>   Migrated, both sites (drag-and-drop and the move-up/down menu).
>
> Two things the migration itself taught, both caught by tests rather than by
> reasoning:
>
> - **A callable costs a round trip where `setDoc` resolves from cache.** So
>   the seam is optimistic-first: apply locally, send, refetch on success. A
>   drag that waits 300ms to settle is a worse app than the one being replaced,
>   and "correctness" that ships that is not a win.
> - **The obvious legacy-document guard is dead code.** `instanceId` is
>   assigned lazily on READ, so the client always sees ids and only the server
>   knows its copy lacks them. A pre-flight "do they all have ids?" check never
>   fires. The fallback belongs on the REJECTION, where it also persists the
>   ids and self-heals in one use.
>
> Remaining: ~29 sites. The blockers are now named rather than counted — the
> load-calibration mirror, a soft-delete for undo, and (for the whole-state
> writers like `regenerateProgram`, `startTrainingBlock`, `realignRacePlan`) no
> command kind at all, because `replaceProgramme` is a private server
> transition by construction.

> **STATUS 2026-08-02h — two more writers migrated; `Program.tsx` is down to
> its last two.** `removeExercise` (the site with no undo partner) and
> `addExercises` both needed NO new server code: the remove reducer is a pure
> removal by `instanceId`, and the add reducer's own comment says it matches
> "the client add default (3×10×0)", which it does. That is exactly what
> separates `addExercises` from `replaceExercise` — both sides start an ADDED
> movement uncalibrated, while only the client calibrates a REPLACED one.
>
> The two that remain are the ones with real blockers: `replaceExercise` (load
> calibration) and the remove/undo pair.
>
> **A rejected command has more than one right recovery, and choosing one
> globally would be wrong.** A rejected reorder is repaired by writing it — the
> direct write also persists the instanceIds, so it self-heals. A rejected
> REMOVE means "it is already gone": rolling back restores a view already known
> to be stale, and writing it clobbers whatever really happened, so it
> refetches. That is why `runProgramCommand` returns applied/queued/rejected
> and leaves recovery to the caller.
>
> One detail worth keeping when the next writer copies this: the optimistic ADD
> mints the same deterministic `cmd-<commandId>-<n>` ids the reducer will. A
> fresh client id would be swapped for a different React key on the refetch,
> visibly remounting the row the user just added.

> **STATUS 2026-08-02i — `replaceExercise` migrated; the load calibration is
> sent, not mirrored. Operator decision.** The reducer hard-coded `weight: 0`
> because it has no profile, so the choice was: mirror `startingLoads.ts`
> server-side, or accept the calibrated number as a bounded scalar. Put to the
> owner, who chose the scalar. Recorded here because a future security review
> will ask why the client sets a weight.
>
> The reasoning that made it defensible rather than merely cheap:
>
> - **It is not an exception to the boundary's stance, which is about
>   OBJECTS.** The validator refuses a client-supplied exercise — name,
>   category, identity — and still does; those stay catalog-derived
>   server-side. A bounded non-negative number is the same shape as the weight
>   already accepted on `logExercise` and `updateExercise.patch`.
> - **The mirror would have been the 15th, over data edited twice in this arc
>   alone.** It needs the variation bank's loadFactor table and the
>   per-category seed table — both touched by P1 and again by 11b. CLAUDE.md
>   calls mirror drift the project's #1 recurring mistake; adding a high-churn
>   one to avoid a bounded scalar is the wrong trade.
> - **The failure mode is bounded and self-correcting.** A silly value yields
>   a bad starting weight in that user's own programme, which the progression
>   engine fixes in a session or two — which is what `startingLoads` already
>   says about deliberately erring light.
>
> Pinned on both sides: the reducer uses the sent load (mutating it back to 0
> fails), the validator bounds it against negatives, overflow, strings, NaN,
> Infinity and null (removing the bound fails), and a client-supplied `name`
> is still rejected outright — so the relaxation cannot creep into a general
> patch.
>
> **`Program.tsx` is now fully on the boundary except the remove/undo pair.**
> That one still needs a server-side soft delete: the undo restores the removed
> exercise WITH its history and load, which `addExercises` cannot rebuild from
> the catalog.

> - **11b's headline value was not the data entry.** §5 frames it as "150
>   exercises × ~6 fields of domain-judgement data entry with no lead-time
>   pressure". The merge itself found three live drifts first: a name the
>   programme card and the exercise guide disagreed on, a documented
>   `lengthenedBias` field with data in the bank and none in the catalogue, and
>   `tricep-dips` classified as two different movements by two different tables.
>   The re-labelling half remains, and is now MEASURED rather than estimated —
>   23.8% of attributed volume cannot be resolved to a muscle part, ratcheted in
>   `muscleTaxonomy.test.ts`.

**Method, stated plainly so the confidence is legible.** Thirteen deep passes ran
in parallel: five book extractions (Zatsiorsky; Schoenfeld; Fleck & Kraemer;
Helms; Renaissance Periodization), one practitioner-corpus extraction
(Juggernaut ×3, Nippard ×4, Mountain Dog), three independent code audits
(generation, adaptation, exercise metadata), and four pack evaluations. The
verification and synthesis phases then ran by hand, because the workflow's final
agents died on a session token limit. **Seventeen load-bearing repo claims were
re-verified directly against source before being written down here** — they are
marked ✔ below. Claims relayed from an agent's own measurement, which I did not
independently re-run, are marked ◻. Nothing here is unmarked.

---

## 1. Verdict on the pack

### 1.1 The "Current Repository Audit" is fiction, and everything inherits from it

Every one of the pack's claimed v6 foundation files is absent. Verified
independently by four separate agents and again by me:

```
find src functions -name <X>            → 0 files, for each of:
  runPrescription  runExecution  runEvaluation  runningProfile
  liftPerformance  strengthGoal  hybridStress
  useStructuredRun useRunLaps  useRunningCapacitySnapshot

grep -rl "RunPrescription|liftPerformance|strengthGoal|hybridStress|
          SessionStressVector|structuredRun|runningProfile" src/ functions/
                                        → 0 files
```

`src/features/coaching/` does not exist. `src/features/run/` contains exactly one
source file, `runSessionReducer.ts`. **Every handoff phrased "extend X" is a
greenfield build wearing a false name.** ✔

That much has already been established. The more expensive half is what follows
from it, and it has two directions:

**Direction one — the pack invents ~8 modules.** Cost: every estimate in the pack
is wrong by the full size of the non-existent foundation, and the phrasing
("extend") hides it.

**Direction two — the pack is unaware of the 32 real ones.** This is worse,
because it produces _duplicate and regressive_ work rather than merely
mis-estimated work. `src/features/program/` is a large, dense, heavily-reviewed
body of code — `programEngine.ts` alone is 2,196 lines. `volumeModel.ts` (463
lines) is a per-muscle weekly set model that cites Schoenfeld by name.
`overlapModel.ts` (510 lines) is the best-argued module in the tree.
`muscleRecovery.ts` (223 lines) is a per-muscle recovery model that is honest
about its own limits. A handoff saying "create a lifting volume engine" is as
wrong as one saying "extend `liftPerformance.ts`". ✔

**And the pack is unaware that this exact book corpus was already mined.**
`docs/proposals/training-book-reviews.md` is a 1,917-line review dated
2026-07-27 covering the Juggernaut manuals, Mountain Dog, all four Nippard
guides and Helms, with an ID-stable backlog #1–#17 that is largely **shipped**,
each item carrying a `backlog #N` comment at its code seam. Five of Helms's most
implementable rules are already in production:

| Book rule                                           | Page        | Shipped in                          |
| --------------------------------------------------- | ----------- | ----------------------------------- |
| Flexible lighter-day swap (McNamara & Stearne 2010) | p26–27      | `easierToday.ts` (`pickLighterDay`) |
| RIR as prescriptive effort language                 | p45         | `effortCue.ts` (`rpeReserveWords`)  |
| Deload recipe differs by training age               | p65–66      | `programEngine.applyDeload`         |
| Adjustment flowchart incl. second-order branch      | p54, p75–76 | `adjustmentRule.ts`                 |
| Overlap-aware scheduling                            | p52–53      | `overlapModel.ts`                   |

A handoff reading "extend `liftPerformance.ts` with Helms's deload rule" is
therefore wrong twice: the file doesn't exist, **and** the rule is already
shipped and parity-tested. That is a regression hazard, not a stale reference. ◻

### 1.2 Handoff 01's premise is false, and that is the tell

Handoff 01 — the foundation the other seventeen rest on — asks an implementer to
reproduce and fix an `npm ci` failure. A real `npm ci` in an isolated scratch
copy: `added 1213 packages … EXIT=0`. `zod-validation-error@4.0.2` needs
`zod: "^3.25.0 || ^4.0.0"`; installed zod is `4.3.6`. Its `engines` is
`node >= 18`; the runtime is Node 22. No unmet peer, no engine violation. And
the repo is green on all three gates: `typecheck` exit 0; `lint` exit 0 (92
warnings, 0 errors); `test` 483 files, **5,864 passing, 0 failed**. ◻

An implementer following 01 literally would hunt a bug that does not exist, and
the natural "fix" — pinning or bumping `zod-validation-error` — mutates a
lockfile that is currently correct. **That is the clearest available signal
about how much of the rest to verify before building.**

### 1.3 The name "evidence-calibrated" is the pack's largest single overstatement

The pack calls itself evidence-calibrated. The rules it encodes are, in the main,
uncited expert consensus stated in the register of validated instruments. This is
measurable, and it was measured:

| Rule                                         | Source           | Citations                                                      |
| -------------------------------------------- | ---------------- | -------------------------------------------------------------- |
| RP MEV Estimator + Set Progression Algorithm | RP Ch2 P288–329  | **0 / 40 paragraphs**                                          |
| RP MRV detection ("under-perform twice")     | RP Ch3 P152–156  | **0 / 4**                                                      |
| RP deload triggers + construction            | RP Ch3 P206–222  | **0 / 16**                                                     |
| RP Frequency-Deriving Algorithm              | RP Ch4 P125–130  | **0 / 6**                                                      |
| RP mesocycle length                          | RP Ch8 P31–40    | **0 / 9**                                                      |
| Schoenfeld's ~10-sets-per-session ceiling    | p.84             | _unpublished simulation, personal communication_               |
| The 3:1 deload ratio                         | Schoenfeld p.200 | _"no studies to date have attempted to quantify"_              |
| Zatsiorsky's fitness–fatigue constants       | p.13             | **absent** — form given, no P₁/P₂/k₁/k₂                        |
| The Norwegian Frequency Project              | Schoenfeld p.88  | _unpublished conference abstract_; replication favoured 3 d/wk |

Helms, p.25, on the whole enterprise: _"we don't really know what optimal is.
There is no way to know."_

A confidence model with only an **evidence** axis (how much data do we have about
this user?) will systematically over-authorise the most confidently-stated,
least-evidenced rules — which are exactly the ones every practitioner source
repeats. **The fix is a second axis: source grade.** A high-confidence
observation feeding a rule whose entire backing is a personal communication must
not authorise a large change. That single addition is what would make the pack's
name honest, and it is §4.4 below.

### 1.4 Summary verdict

**The pack is too heavy, and heavy in the wrong places.** It proposes an
immutable programme-version store, arbitrary-point rollback, change budgets, a
decision registry and a historical replay simulator — for a single-developer,
pre-launch app whose lifting adaptation loop **does not run at all for the
priority user**, whose per-set effort evidence is **deleted on save**, and whose
state document is still last-write-wins at 19 of 20 client call sites.

It is simultaneously too light: the four things the corpus most strongly
supports for a hybrid lifting app — derive frequency from volume, cap aerobic
_duration_, trigger deloads off performance, and decide the volume currency —
appear in **none of the 18 handoffs**.

---

## 2. The lifting engine as it actually is

An honest description, because every acceptance criterion in the pack is
unmeasurable without one.

### 2.1 Three tiers, almost completely decoupled

**Tier 1 — per-exercise, per-session (`applyProgression`, `programEngine.ts:1653-1841`),
mirrored in `functions/lib/progressionEngine.js` and parity-tested.**
Input vector, complete: `actualReps`, `actualWeight`, `goal`, `microloading`,
`actualRpe?`. Success predicate: `actualReps >= exercise.reps && actualWeight >= exercise.weight`.
Range-aware double progression, proportional load steps (1.25 kg microplate vs
2.5 kg plate-pair, keyed on movement class and absolute load), bodyweight and
timed-hold axes, backoff at `consecutiveFailures >= 3`. RPE's only use is a
hold at ≥ 9.5. **Only the last set of each exercise is ever seen.** ✔

**Tier 2 — per-week (`advanceWeek`, `programEngine.ts:2084-2196`).**
Deload at `week % 4 === 0`; otherwise volume shape → fatigue shave → adjustment
rule; accessory rotation at `nextWeek % 4 === 1`.

**Tier 3 — per-generation (`balanceWeeklyVolume`, `balancePushPull`).** Called at
exactly two sites, both inside `generateProgram`. They run when a plan is built
or rebuilt, **never on a week advance.** So MEV/MAV reasoning responds to
settings changes, not to anything the user does.

### 2.2 What is genuinely good, and must survive any rewrite

This is not a weak codebase, and a rewrite that discards these reopens
documented, measured bugs.

- **`overlapModel.ts`** — measured before-tables in its own header, a documented
  shipped-and-corrected error, an explicit Nippard-vs-Helms reconciliation.
  `orderForAdjacency` brute-forces ≤720 permutations with a deterministic
  tie-break.
- **Determinism.** Both `Math.random()` sites were removed; the header records
  the measurement that motivated it ("twelve calls → EIGHT different
  programmes"). Regenerate is stable — the precondition for everything else.
- **Data-preservation machinery** — `alignExistingTo`/`alignSlots`,
  `carryExistingAccessories`, the same-category guard in `makeExercise`. Each
  fixes a _measured_ data-loss bug (deadlift kg landing on pull-ups).
- **`applyDeload`'s training-age split** — novices lose load (their stall _is_
  the load), intermediates hold load and halve volume (their fatigue is volume,
  and dropping bar weight costs skill exposure). That is Helms p65–66 correctly
  split, with the reasoning in the doc comment, and a parity-tested server
  mirror.
- **`adjustmentRule.ts`'s three-state recovery** — `"recovered" | "strained" |
"unknown"`. The `unknown` state exists because collapsing "fresh" and "too
  little baseline to judge" _"would read a cold-start user as 'recovered' and add
  volume to someone we know nothing about."_ **This is the best piece of
  confidence engineering in the codebase and it is the pattern the pack's
  confidence model should have copied.** ✔
- **`represcribe.ts`** — Epley load rescaling when a block moves the rep target,
  with a documented refusal to ever move load _up_. Correct instinct, correctly
  bounded.
- **Bodyweight-relative cold-start loads** by pattern × experience × sex,
  deliberately conservative.
- **The comment culture.** Most constants carry a why; several carry a measured
  post-mortem. `rotateUntrainedAccessories` documents its own open bug rather
  than hiding it. This is far above typical and it is why this evaluation was
  possible at all.

### 2.3 Fifteen verified defects

Each was re-read at source by me. These are not style objections; twelve of the
fifteen are live and user-visible today.

| #       | Defect                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                                        | Impact                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | **The weekly loop never runs for a pure lifter.** `useProgram.ts:655` returns early for `!runMode \|\| runMode === "freeform"` **and** additionally requires `runDays[0].weekKey`. The only other path is a manual button gated by `shouldAdvanceWeek` = _every day completed-or-skipped_ (`programEngine.ts:1940-1942`).                                                                                        | ✔                                               | A lifter who misses one Friday and doesn't tap "skip" freezes on week N **forever**: no deload, no adjustment, no rotation. Per CLAUDE.md's design-for-the-user-base rule this is the modal path.                                                                                                                                                        |
| **D2**  | **Per-set RPE and set type are captured and destroyed at the write boundary.** `toCompletionSetLogs` (`warmupRamp.ts:148-158`) takes `{weight, reps, completed, type}` and returns `{weight, reps, completed}`. The persisted `WorkoutSet` is `{setNumber, reps, weightKg}` (`useWorkouts.ts:49-53`).                                                                                                            | ✔                                               | The app collects the exact signal the whole pack needs, on Helms's exact 6–10 half-point scale, and deletes it on save. **Unrecoverable — no backfill exists.**                                                                                                                                                                                          |
| **D3**  | **Progression is fed the last set regardless of set type.** `WorkoutSession.tsx:885` applies `isSetEligibleForStrengthPr` to the volume-PR check; `:907`'s `onLogExercise` — 22 lines later, same `if (isLastSet)` block — applies nothing.                                                                                                                                                                      | ✔                                               | A lifter whose final set is a **drop set** or back-off set logs `actualWeight < exercise.weight` → scored a failure **every session** → −5% load every third session, forever. Textbook technique, punished.                                                                                                                                             |
| **D4**  | **A user-applied deload permanently loses load.** `preDeloadWeight` is written at exactly one site (`programEngine.ts:1965`, inside `prepareForDeload`), called from exactly one site (`:2143`, the _automatic_ branch). The server's `applyDeloadWeekCommand` (`programCommands.js:967`) calls `applyDeloadToWorkouts` directly with no stash. Restore happens only in `applyWeeklyVolumeShape` (`:1992-1994`). | ✔                                               | Tap the app's own "Apply deload week", train it, advance → the ×0.85 cut is **never undone**. Novices permanently 15% lighter; intermediates permanently 2 reps lower. Only escape is the Undo toast.                                                                                                                                                    |
| **D5**  | **`recoveryWeak` is mathematically unreachable without bodyweight logging.** `computeRecoveryScore` (`perfScoring.js:70-100`) starts at 60; the bodyweight branch fires only if both 7-day averages exist; the worst other outcome is −10. Floor = **50**. Predicate is `recoveryScore < 50` (`performanceEngine.js:491`).                                                                                       | ✔                                               | `"recovered"` is the default, and from the default the flowchart's only non-hold action is **add volume** — the exact direction `adjustmentRule.ts:29-31` names as the harmful error. The recovery proxy is bodyweight stability + meal-log days + session count: **no training-performance input at all.**                                              |
| **D6**  | **The plateau signal is erased by the backoff that creates it.** `plateauCount` resets to 0 on _any_ completed session (`:1792`, `:1825`), while the backoff that increments it (`:1804`, `:1835`) simultaneously cuts load 5% — engineering the next success.                                                                                                                                                   | ✔                                               | To reach `PROGRAMME_PLATEAU_MIN = 2`, two lifts must be in that transient state at the instant of a completion-gated manual button press. `plateauCount >= 3` (the rotation threshold) needs 9 consecutive failures with no success across two 5%-lighter reloads. **And every test injects `plateauCount` by hand** — ADR-0008 exists for exactly this. |
| **D7**  | **`reorganize` swaps MAIN lifts and wipes their history.** The rotation block at `programEngine.ts:2065` sits **outside** the `if (ex.isAccessory === true)` block and calls `swapExerciseIdentity`.                                                                                                                                                                                                             | ✔                                               | A coach does not respond to a stall by deleting the lift's training log. `represcribe.ts:61-69` documents this as a live hazard and works around it rather than fixing it.                                                                                                                                                                               |
| **D8**  | **The advertised intensity ramp does not exist.** `intensityMultiplier = 1 + (week%4)*0.025` and `volumeModifier` are written at `programEngine.ts:163-171`, declared at `programTypes.ts:724-725`, and **read nowhere** in `src/` or `functions/`.                                                                                                                                                              | ✔                                               | The entire "periodization" reduces to one boolean (`.deload`).                                                                                                                                                                                                                                                                                           |
| **D9**  | **The lift engine is completely blind to run load.** `buildLiftProgram` (`planBuilder.ts:227-320`) receives `runMode`, `weeklyRunDays`, `raceGoal`, `runTuning` and reads none. Neither do `volumeModel.ts`, `experienceModel.ts` or `programEngine.ts`.                                                                                                                                                         | ✔                                               | A marathon-block user and a never-runner get **identical lifting** for the same `primaryGoal`. For a hybrid product this is the single largest missing coupling.                                                                                                                                                                                         |
| **D10** | **`movementCategory` is inferred from the exercise _name_, first-match-wins, and is measurably wrong.** Not a stored field on `Exercise`. `"fly"`/`"flye"` are keywords under `horizontal_push` (`exerciseMovementCategory.ts:121`).                                                                                                                                                                             | ✔ (mechanism + instance) ◻ (the 28-error count) | `Reverse Flyes` and `Rear Delt Machine Fly` classify as **push**. `balancePushPull` keys on movement category and exists specifically to keep pull ≥ push to protect the shoulder — **it is currently counting rear-delt work as push.** 56 of 151 exercises land in the `core` fallback.                                                                |
| **D11** | **The volume currency is mismatched against its own cited source.** `volumeModel.ts:10-13` counts primary 1.0 / secondary 0.5. `volumeLandmark` (`:208-223`) classifies against `{low: 12, high: 20}` for hypertrophy. Schoenfeld pp.183–184: the meta-analyses those bands come from _"gave equal weight to both agonists and synergists"_ — **1:1**.                                                           | ✔                                               | A triceps receiving 6 bench sets tallies 3.0 and reads "low" while sitting inside the recommended band. The two numbers are in different units.                                                                                                                                                                                                          |
| **D12** | **Changing the training goal changes nothing.** The preserve branch (`planBuilder.ts:248-251`) gates on `sameDayCount && !levelChanged && input.existingState`. `primaryGoal` is **not** in the condition, and `primaryGoal` is only read by `generateProgram`.                                                                                                                                                  | ✔                                               | hypertrophy → strength with an unchanged day count and experience moves **0 of 18 slots**. A strength user keeps deadlifting at hypertrophy reps. (Blk2's `represcribe` is currently the only thing that fixes this, and only inside a training block.)                                                                                                  |
| **D13** | **The plateau toast contradicts the locked policy and misstates its own consequence.** `adjustmentRule.ts:21-22` locks presentation as _"INVISIBLE — nothing is named, explained, or surfaced."_ `useProgram.ts:1592-1596` fires `toast("Plateau detected — variation may rotate", { icon: "⚠️" })` at `plateauCount > 0`.                                                                                       | ✔                                               | It names the mechanism (violating the lock) and promises a rotation that needs `plateauCount >= 3` — four backoffs away.                                                                                                                                                                                                                                 |
| **D14** | **Two disagreeing history caps.** `.slice(-10)` at `programEngine.ts:1668` (auto-progression branch) and `.slice(-20)` at `useProgram.ts:1568` (manual branch).                                                                                                                                                                                                                                                  | ✔                                               | Both windows are shorter than the phenomena: interference takes 8 weeks to appear (Schoenfeld p.164), periodisation diverges after 6 (p.193), Hammarström ran 12 (p.85).                                                                                                                                                                                 |
| **D15** | **`GOAL_PROFILES` — the most load-bearing table in the engine — is the only one with no justification.** `programEngine.ts:58-101`. The header explains _why the table exists_ (a two-enum drift fix), never why strength = 5–7.                                                                                                                                                                                 | ✔                                               | Contrast the rest of the module, which cites Helms/Nippard/Schoenfeld heavily. And per Fleck & Kraemer p.61, mapping `strength` → 5–7 reps for a **novice** is applying an advanced-lifter curve to someone who would gain strength at 15–20RM with far lower technique risk.                                                                            |

### 2.4 Measured defects reported by the audits, not independently re-run by me ◻

Flagged separately because they came from probe scripts I did not re-execute.
Each is specific enough to be checked cheaply before acting on it.

- **Two unrelated prescription systems behind one UI.** Sweeping 90 configs
  (6 day-counts × 3 equipment × 5 goals) through `matchTemplate`: **12 take a
  hand-written template branch, 78 fall through to `generateProgram`.** The
  template branch bypasses eight post-passes — no goal profiles, no day roles,
  no volume balancing, no overlap caps, no push/pull balance.
- **The generator violates the app's own landmarks in every configuration
  sampled.** Hypertrophy 6-day: `Back=37, Shoulders=26.5, Core=22.5` against a
  ceiling of 20, while `Glutes=11, Calves=2` sit under the floor of 12.
  `overshootsCeiling` only vetoes _adds_; `volumeModel.ts:255-260` concedes "the
  builders are not policed by this."
- **`isAccessory` is systematically mis-tagged in `buildUpperLower` and
  `buildPPL`.** In the generated 4-day upper/lower, Day 1 is 5-of-5 MAIN —
  `Barbell Curl` and `Rope Tricep Pushdown` are tagged main lifts, so the whole
  volume machinery skips them. Measured result: `Biceps=10` against
  `landmark.low=12`, with no growable slot.
- **A 35 kg dumbbell lateral raise reaches real users.** On the template path,
  name-based `inferMovementCategory` disagrees with the exercise bank, so
  `loadFactorFor` returns the default 1 and the lift inherits the category
  compound's seed: `Dumbbell Lateral Raise` → 35 kg, `Leg Curl` → 85 kg,
  `Seated Calf Raise` → 85 kg. The same `seated-leg-curl` seeds at **25 kg** on
  the generated path.
- **Direct calf work is unreachable from the generator** — no calves category in
  `exerciseBank`, no entry in `CATEGORY_TO_CANONICAL`. Generated weeks give
  calves 1.5–2.5 sets, entirely as 0.5-credit secondary. The templates program 12.
- **The load seed is rep-target-agnostic.** `startingWeightForExercise` takes no
  rep argument, so a strength user gets the same 85 kg squat at 3×3–5 that a
  hypertrophy user gets at 4×6–10 — while the module's own docstring says the
  multiples target "~8 reps". `represcribe.scaleLoadForReps` solves this
  correctly with Epley and is not wired into generation.
- **Exercise-metadata coverage.** Of 151 exercises: `difficulty`, `tempo`,
  `alternatives`, `regressions` populated on **3**; `lengthenedBias` and `media`
  on **0**. The fields the pack wants (`loadFactor`, `complexity`, `primary`,
  `role`, `lengthened`) exist — on a _different_ type, `ExerciseOption`,
  covering 53 of 151. `Exercise.lengthenedBias` (0%) and
  `ExerciseOption.lengthened` (15) are **two competing flags for one concept,
  and the populated one is on the non-canonical type.**
- **`volumeModel` mapping errors.** `adductors` and `"hip flexors"` map to
  **`Quads`** (anatomically wrong); `Forearms`/`Brachioradialis` map to `null`
  (forearm work earns zero); `"hip flexors "` (trailing space) at `:99` is an
  unreachable dead key that contradicts the live one; 24 of 151 exercises
  attribute to nothing at all.

---

## 3. What the books say that Tropos ignores

Ranked by expected impact on the lifting side. Each row is book+page against
file:line, so each is checkable.

### 3.1 Frequency must be **derived** from volume. Tropos inverts the dependency.

> Schoenfeld p.87 — meta-analysis of **25 studies** directly comparing higher vs
> lower frequency: when volume was equated, hypertrophy was similar at 1, 2, 3
> or 4+ sessions per muscle per week. Verbatim: _"as a standalone variable,
> frequency does not have much impact on muscle development; it seems that its
> primary utility is to act as a **vehicle to manage weekly volume**."_

This is the cleanest single result in the entire corpus. Tropos has it backwards:
`chooseSplit(weeklyTarget)` (`programEngine.ts:214-231`) picks the split from
**lift-day count alone**, and volume falls out of the day templates.
`volumeModel.ts:1-19` already names the defect in its own header.

Correct order: goal → weekly sets per muscle → per-session cap → **derived**
minimum frequency → split shape. The derivation is
`sessions ≥ ceil(weeklySets / perSessionCap)`.

**And `perSessionCap` must be a named tunable prior, never a magic 10** —
Schoenfeld p.84 flags the ~10-sets-per-session ceiling as _"an unpublished
simulation analysis … personal communication. This hypothesis warrants further
study."_ It is the most-cited number in modern hypertrophy programming and the
book grades it as hearsay.

### 3.2 The volume currency is undecided, and currently wrong against its own source

Three currencies are in play and Tropos silently mixes two:

| Currency                                 | Source                                                                    | Tropos             |
| ---------------------------------------- | ------------------------------------------------------------------------- | ------------------ |
| Sets/muscle/week, secondaries at **1:1** | Schoenfeld pp.183–184 — the convention the 10–20 bands were derived under | bands adopted ✔    |
| Sets/muscle/week, secondaries at **0.5** | MASS/RP convention                                                        | counting adopted ✔ |
| **Reps**/muscle/week, 80–210             | Helms p52                                                                 | not modelled       |

`volumeModel.ts:10-13` counts 0.5; `:208-223` classifies against bands derived at
1:1. A set of bench and a set of pushdown were counted **equally** for the
triceps in the meta-analyses that produced those numbers.

Note the book does _not_ claim 1:1 is physiologically true — it states the
counter-case at length (pec EMG ≈ 2× triceps in the bench press) and recommends
1:1 as _"the convention that keeps you comparable to the literature."_ That is
exactly the point: the numbers are only meaningful in their own unit.

Helms's third currency matters too: 3×5 and 3×12 are the same set count and a
**2.4× different** rep count, which is why his intensity recommendation is a
_distribution over rep ranges_ (2/3–3/4 of volume in 6–12RM, p47) that a
set-count model structurally cannot express.

**My call (§8.1): adopt 1:1 and keep the bands.** Rationale there.

### 3.3 Effort, not load, is the prescribable primitive — and Tropos deletes the effort data

Two findings compose into one hard rule.

> Schoenfeld pp.95–96 — meta-analysis, ≤60% 1RM vs >60% 1RM, both to failure,
> site-specific measurement: _"the observed effect size difference of **0.03**
> indicates hypertrophic adaptations were virtually identical … **load is not a
> determining factor** in the exercise-induced accretion of muscle mass, at least
> at the whole-muscle level."_

> Schoenfeld p.92 — the %1RM→reps map is individually useless. Reps to failure at
> 75% 1RM ranged **7 to 24**. At 30% 1RM, **30 to 71**. 80% 1RM = 10RM on bench,
> **6RM** on leg curl, **15RM** on leg press _for the same person_.
> Zatsiorsky p.62 agrees independently: _"there is **no fixed relationship**…
> This relationship varies with different athletes and motions."_

So the variable that determines the stimulus is **proximity to failure**, and the
variable an app would naturally compute has a 3.4× individual spread. The
operational rule Schoenfeld gives (p.131): _"most sets should be performed at an
RIR of 1 or 2. Failure training could then be selectively employed on the last
set of an exercise"_ — with failure used **more judiciously on multi-joint** and
more liberally on single-joint (p.131, p.135). Two coupling rules attach: target
RIR must tighten toward 0 as load falls below ~60% 1RM (pp.95, 129), and there is
a hard floor at ~**30% 1RM** (p.96).

Tropos captures RPE on Helms's exact scale, uses it as one boolean, and **deletes
it** (D2). Worse, capture is defaulted **off** for everyone but advanced lifters
(`experienceModel.ts:121`), so for the modal user the engine's only autoregulation
input is never collected. ✔

**Two corrections to a naive RIR adoption**, both from Helms and both
load-bearing:

- **RIR is earned.** p139: _"For the initial month, use a percentage of 1RM (%1RM)
  to guide loading, **not RPE**."_ p73: accuracy is claimed only for lifters who
  are **advanced** AND **RPE-familiar** AND **near failure**. The book makes _no_
  accuracy claim at RPE 5–7, none for novices, none for intermediates. Tropos's
  absolute `RPE_HOLD_THRESHOLD = 9.5` is a hold triggered by noise for a beginner.
- **The relative check beats the absolute one.** p141: _"You should be able to
  complete your final set at an RPE no higher than 1 RPE value higher than the
  1st set RPE… If you cannot, you started with a load that was too heavy."_ This
  is robust to an uncalibrated scale in a way an absolute threshold is not — and
  it needs **first and last set**, which the current last-set-only pipe cannot
  supply. **This is the strongest scientific argument for per-set capture.**

### 3.4 The run plan and the lift plan cannot be scheduled independently, and the coupling variable is weekly aerobic **minutes**

> Schoenfeld p.162, Wilson meta-analysis: interference correlates with aerobic
> **duration at r = .75** and with **frequency at only r = .26**.

This is the highest-value finding in the entire pile _for a hybrid product
specifically_, and it is quantified. `buildLiftProgram` reads no run field (D9).

Four sub-rules follow, and the negative ones matter as much as the positive:

- Cap weekly aerobic **duration** before capping sessions.
- Prefer **separate days** (Wilson, ES 1.05 vs 0.8, p.164); else maximise
  intra-day separation.
- **Do not build an order rule.** Acute signalling suggests aerobic-before-lifting
  is worse, but _"Multiple studies show that strength gains are similar
  regardless of the sequence"_ (p.163).
- **Do not conclude "no interference" from a short window.** Hickson found no
  interference until **week 8** (p.164), and it is worse in trained lifters.

Fleck & Kraemer give the literal prescription for this user, and it is modest:
**12–15RM, 2×/week, 20–30 min, targeting ankles/quads/hamstrings/shoulder/back**,
framed as injury prevention and postural strength (p.120); heavy squats explicitly
_out_ for a distance runner because _"it is not part of the needs analysis of this
sport"_ (p.112). Their runner case study states the mechanism: higher-rep loading
is chosen _"so that the strength training does not interfere with aerobic
metabolism development"_ (p.79).

Two caveats F&K raise that secondary sources drop: interference may be an
**overtraining artefact** of unperiodised concurrent load (p.111), and for a
genuinely multi-energy-system trainee _"the compatibility question may be a moot
point"_ — the design question becomes **mixture optimisation, not avoidance**
(p.112). Schoenfeld adds that aerobic work raises capillarisation and satellite
cell activity, and _"resistance training alone is insufficient for increasing
capillarization"_ (p.165). **So the correct framing for a hybrid user is an
optimum, not a penalty** — and no source locates it.

### 3.5 Fatigue is specific, recovery is muscle-size-scaled, and the deload direction is easy to get backwards

> Zatsiorsky p.81: _"fatigue effects from different types of muscular work are
> **specific**. This means that an athlete who is too tired to repeat the same
> exercise in an acceptable manner may still be able to perform another exercise
> to satisfaction."_

A single global readiness scalar is the wrong shape. The book offers two lookup
tables instead — session-load → restoration time (Extreme 72 h / Large 48–72 /
Substantial 24–48 / Medium 12–24 / Small <12, p.79) and muscle size → minimum
rest (small <12 h, intermediate ~24 h, **large ≥48 h, squats 72–96 h, 2×/wk**,
p.86). The correct way to fit more work in is to **rotate patterns across
consecutive sessions**, not to lower a global load.

**And the taper direction is the single most invertible thing in the corpus.**
Zatsiorsky p.13 contrasts them explicitly:

| Theory                         | Taper                                           |
| ------------------------------ | ----------------------------------------------- |
| One-factor (supercompensation) | **Cut sessions, keep the load per session**     |
| Two-factor (fitness–fatigue)   | **Keep the sessions, cut the load per session** |

_"You would see the greatest differences in plans for tapering, or peaking."_
And supercompensation is the model the same book **rejects** on p.10: _"the
theory of supercompensation is too simple to be correct."_ So any deload
implemented as "drop to 2 heavy sessions this week" is implementing the rejected
model while citing the accepted one.

**Tropos gets the intermediate/advanced case right** (hold load, cut volume —
Helms p65–66's _"3 × 10 × 200 lbs becomes 2 × 8 × 200 lbs"_). Keep it. Do not
let any handoff replace it with a frequency cut.

### 3.6 Deloads are near-free; the trigger should be performance, not a calendar

> Schoenfeld p.200, Ogasawara: a **3-week break** at the midpoint of a 15-week
> programme _"did not interfere with muscular adaptations"_; repeated
> **3-off/6-on** cycles matched continuous training over 6 months.
> RP Ch3 P213: _"Taking a deload too early now and again is **less detrimental**
> to overall progress than delaying deloads."_

The cost of a false-positive deload is ≈ 0. The cost of a missed one is
overtraining. **So the decision threshold should be deliberately biased toward
firing** — which is a different design from "be confident before acting".

The computable trigger exists and needs no new user input:

- **RP Ch3 P154:** _"If you've **under-performed two sessions in a row**, you have
  likely hit your MRV"_ — expressed as a drop in reps at a given RIR versus last
  week, even adjusted for load. Magnitude cue (P155): reps off by 3–5 or more.
- **Zatsiorsky p.75:** _"If an athlete can do 5 reps of squats with 220 kg on
  Monday, and then a week later can only do 2 reps, something is not right."_
- **Schoenfeld p.209 (MRV):** loads stable or up → add volume; loads down → cut.

And the escalation ladder is **muscle-local first** (RP Ch3 P209–212): a recovery
session for the affected muscle (halve sets and reps at held load, Ch3 P202),
escalating to a whole-body deload only when **more than half** the muscle groups
have needed one within two weeks. With a re-entry rule almost no app implements —
resume at the **midpoint of MEV↔MRV** (Ch3 P203), which is what prevents an
immediate re-trigger.

Meanwhile Tropos's only automatic trigger is `week % 4 === 0`, and Schoenfeld
p.200 is blunt about that cadence: _"**no studies to date have attempted to
quantify** the extent of reductions in either volume or intensity (or both). A
3:1 ratio is generally a good starting point."_

### 3.7 Roughly half of all users do not respond to volume changes

> Schoenfeld p.85, Hammarström — within-subject, one leg ~15 sets/week vs the
> other ~5, 12 weeks. The book calls it _"perhaps the most elegant study on the
> topic to date."_ At the individual level: **~44% derived a clear benefit from
> higher volume, ~9% a clear benefit from LOWER volume, ~47% responded the same
> either way.**

**An engine that titrates volume for everyone produces noise for ~47% of users
and actively harms ~9%.** This is the single most important number for any
volume-response feature, and it has a direct design consequence: the response
model must have a first-class **null-result state** — _"this muscle's response to
volume change is indistinguishable from noise; hold and stop titrating"_ — and it
must be the **default** until enough evidence displaces it.

It also argues for `hold` as the modal engine output, which
`adjustmentRule.ts:77-80` already gets right.

### 3.8 Landmarks are displaceable priors, they move systematically, and MV is missing

> RP Ch7 P15: _"these are exclusively estimates of where those landmarks might
> be. **Absolutely nothing replaces carefully observed responses to training**…
> they will change day to day, week to week, month to month, and over the years.
> **Use the rough estimates** … but then autoregulate."_

Three corrections to how this is usually read:

**(a) "Don't hard-code them" is an over-reading that breaks cold start.** The same
sentence _requires_ seeded estimates, and RP supplies them: session MEV 2–4 sets
(Ch2 Summary P56), per-session MAV 5–10 and per-session MRV ~12 (Ch4 P120,
_cited_), total-session cap ~25 (Ch4 P121), beginner session MEV 1–2 (Ch7 P101).
Helms supplies his (novice ~40 reps ×2/wk, intermediate ~70 ×3/wk, p53). F&K
supply theirs (1–2 sets for the **first 6–12 workouts**, p58). Per CLAUDE.md,
cold start is one of the most-seen states in the app. **The correct rule:
constants are permitted as named, per-muscle, displaceable priors carrying a
confidence field; what is forbidden is treating them as terminal.**

**(b) They move _systematically_, not just individually — and Tropos already owns
the driver.** A deload lowers MEV partially, 8 sets → ~6 (Ch6 P38). MEV rises
faster than MRV across mesos, shrinking the window; resensitization re-opens it
(Ch6 P42). Frequency raises weekly MRV — biceps 15 sets at 1×/wk → 25 at 2× → 30
at 3× (Ch4 P84). And **diet phase shifts all three**: hypercaloric lowers MEV and
raises MRV; hypocaloric can close the window entirely (worked example: MV/MEV/MRV
2/4/7 → **5/7/7**, Ch7 P147–149). Tropos has `phaseNutrition.ts` and adaptive
TDEE. **This cross-domain link is genuine differentiation** — a purely-learned
model would spend observations chasing drift it could have predicted.

**(c) MV is missing, so "redistribute" is unimplementable.** `volumeLandmark`
returns `{low, high}` only. RP Ch8 P30 / Ch7 P159: parking a deprioritised muscle
_between_ MV and MEV yields _"more fatigue than four sets by a long shot, but no
additional benefit."_ Specialisation works by dropping non-targets to **MV**, not
MEV — _"an advanced lifter might have a weekly back MEV of 10 sets, but a weekly
back MV of four … that difference grows across the adaptive window"_ (Ch7 P155).

**And a citation warning:** RP _Scientific Principles of Hypertrophy Training_
contains exactly four tables, **none of them a per-muscle landmark table**, and
defers the topic twice to a different title, _How Much Should I Train?_ (Ch7
P136, Ch8 P30). **Any handoff citing per-muscle MEV/MRV numbers to this book has
a broken citation.**

### 3.9 Muscle coverage is not implied by movement patterns

> Schoenfeld pp.101–102, Fonseca, volume-equated, 12 weeks: the Smith-machine
> squat alone _"failed to significantly increase cross-sectional area in the
> vastus medialis and rectus femoris muscles"_ while a varied routine grew all
> four quadriceps heads.

More concrete cases, each citable:

- **Hamstrings** are only moderately active in multi-joint lower-body work, ~half
  the EMG of single-joint, and _"hypertrophy of the hamstrings is **minimal**
  following regular squat exercise"_ (p.189). Both hip-extension **and**
  knee-flexion movements are required.
- **Middle deltoid:** in the shoulder press the shoulder is externally rotated, so
  _"the anterior head … receives the majority of stimulation; the middle and
  posterior heads are substantially less active"_ (pp.186–187).
- **Rectus femoris:** squat-only training has failed to increase it (p.188).
- And responsiveness is **muscle-specific within one person** (p.170): one subject
  grows quads and not elbow flexors, another the reverse.

`volumeModel.ts:23-33` stops at 10 canonical groups. `Front/Side/Rear Delts` +
rotator cuff all → `"Shoulders"`; `Lats/Traps/Rhomboids/Teres Major` all →
`"Back"`. The module **already concedes this in its own words** at `:385-388`:
push/pull balance is computed at _movement_ level precisely because _"the
canonical 'Shoulders' group lumps the push-y front delt with the pull-y rear
delt, so a muscle-level ratio would be misleading."_

Tracking per-muscle _response_ on that taxonomy is not imprecise, it is
**incoherent** — lateral raises and rear-delt flyes have opposing profiles and
average to noise.

### 3.10 Training status gates the _method_, not only the load

- **Zatsiorsky p.71** (Rhea meta-analysis, 140 studies, 1,433 effect sizes — the
  strongest evidence in that book): untrained optimum ≈ **60% 1RM**, 3 d/wk, 4
  sets per muscle; **>1 year experience ≈ 80% 1RM**.
- **Zatsiorsky p.101:** beginners use _"the submaximal effort and repeated effort
  methods **only, not singular maximal efforts**."_
- **Fleck & Kraemer p.61:** _"inexperienced individuals … may experience
  significant gains in strength in the **15 to 20 RM** loading range."_
- **Helms p64:** expected rate of gain — novice **session-to-session**,
  intermediate **week-to-week**, advanced **month-to-month**. A factor of ~20
  across the range, and the thing any "required trend" must be calibrated against.
- **Helms pp.66–71, 81–83:** the progression **algorithm** itself is a function of
  training age — novice single progression with a reactive −10% after two
  consecutive misses; intermediate 4-week wave loading for compounds _plus_
  double progression for isolation; advanced block periodisation with AMRAP/1RM
  testing every 6–12 weeks. With explicit graduation triggers between them, all
  computable from `consecutiveFailures`/`plateauCount` which Tropos already stores.

Tropos gates deload _recipe_ and movement _complexity_ by experience, but
`progressionType` is per-exercise (`"double"`/`"linear"`), not per-training-age,
and `GOAL_PROFILES` applies one rep table to all levels (D15).

### 3.11 Program-first, constraints-second — as two objects

> Fleck & Kraemer p.69: _"**This is precisely why the program is written first,
> and then followed by any changes which may be necessary due to administrative
> limitations.**"_

With an ordered degradation policy (p.73): compute session duration immediately
after planning; eliminate **only** small-muscle-group work to fit; never shorten
rest below 1 min _except_ when higher lactate is deliberately wanted.

`buildPlan` (`planBuilder.ts:496`) folds equipment, lift-days and injuries into a
single solve. So the engine cannot distinguish an intended plan from a compromised
one, and **the user is never told what their constraint cost them** — which is
arguably the most useful thing a "Performance hub" could say. Splitting into
`buildIdeal()` → `applyConstraints()` is both an architecture fix and a product
feature ("with a 4th day you'd get +6 sets to back").

### 3.12 Maintenance dosing — an entire missing construct

> Fleck & Kraemer p.179: _"**To maintain strength gains the intensity should be
> maintained, but the volume and frequency of training can be reduced.**"_
> p.180: 68 college football players, **2×/wk through a 14-week season** —
> _"no significant decreases in one RM for any of the exercises"_ (with the
> template given in full).
> p.183: aerobic fitness needs **≥3 d/wk at unchanged intensity**; one-third and
> two-thirds intensity cuts cost **21% and 30%** of aerobic fitness.
> p.184: _"strength adaptations appear to be maintained for longer periods of
> time with a reduced training program"_ than endurance adaptations.

Every `maintenance` match in `src/lib/` is **nutrition** (`adaptiveTdee.ts`,
`macroConstants.ts`, `taperNutrition.ts`). There is no training-side maintenance
concept. Deload is a different thing — a planned reduction inside a progression,
not a hold under external constraint.

This is the missing behaviour for travel weeks, illness, and the
lapsed-and-returning segment CLAUDE.md names as real. **And it comes with a free
hybrid rule: in a constrained week, cut lift volume and frequency first, and
protect run _intensity_ hardest.**

### 3.13 Adherence outranks everything, and it has an RCT

> Helms p.17–18: the pyramid is Adherence → V/I/F → Progression → Exercise
> selection → Rest → Tempo, and _"~80% of your progress is going to be made by
> focusing on these bottom three or four levels."_ Levels 5–6 are guardrails:
> the book's own answers there are _"rest until you feel ready"_ (p112) and
> _"just lift the weights"_ (p122). There is no knob to build.
> p.23: a plan the user can't run _"is not an option, let go of it."_
> p.26, **McNamara & Stearne 2010** — the only RCT in the chapter: volume-matched
> over 12 weeks, a group that chose daily between an easy/moderate/hard session
> **based on energy that day** made **greater strength gains** than the
> fixed-order group.

`easierToday.ts` already implements the mechanic. The under-used part is the
**constraint**: the engine must never surface a prescription the user's declared
schedule cannot accommodate.

Two things about the pyramid that a flat 0–6 list destroys, and both matter:
**periodization is drawn deliberately OUTSIDE the pyramid** (p17, p18, p76) because
it cuts across all six levels — so a 0–6 ordering has no slot for the thing that
decides _when_ volume rises and _when_ a deload lands. And **tier 2 is explicitly
unranked internally** (p19, p31: _"it is not appropriate to put any single one of
these on a pedestal"_) — any hierarchy that ranks volume above intensity above
frequency invents a decision Helms refuses to make.

### 3.14 What the practitioner corpus adds that the science books don't

Three things, all cheap, all absent from the repo.

**(a) Ask _where_ the lift fails — but ask it correctly.** `variationBank.ts:~639`
already names this as the open seam. The corpus supplies the mapping (deadlift
off-the-floor vs lockout; squat out-of-the-hole vs mid-range vs forward lean;
bench off-the-chest vs lockout), but it also supplies **two corrections that a
naive version would miss**:

- **Failure location ≠ deficit location.** Deadlift manual p19 (Smith): _"The most
  important thing you can do to have a strong lockout is to build strength and
  SPEED off the floor."_ p21 (Lilly): _"I would quickly stall out just inches from
  lockout … it wasn't necessarily better form that was going to fix my issues, but
  pulling with acceleration in mind."_ A naive "fails at lockout → prescribe
  lockout work" rule prescribes the wrong thing for this population. **The lockout
  branch must offer a floor-speed option.**
- **The experts contradict each other about the modal failure point.** Squat p6
  (Smith): _"The most common place for a raw lifter to miss a max squat is right
  out of the hole."_ Squat p31 (Sumner): _"I, like 80% of raw lifters miss a squat
  a little less than halfway up."_ Two world-record squatters, same PDF, no data.
  **Do not hard-code a default failure location.** Ask, or don't guess.

**(b) Condition accessory selection on technique style.** Sumner, Squat p29 and
p63: _"I am a low-bar squatter and I have a big intentional lean so I emulate that
with my assistance lifts. A close stance, upright squatter would benefit more from
front squats"_ — expressed as an explicit **3:1** dominant/minority split. This is
**one onboarding tap**, it works at **cold start with zero training history**
(which the failure-point question cannot), and it is entirely absent today.

**(c) Add setup/cue change as a fourth intervention class.** Deadlift manual
p43–44 (Little): _"If you struggle at the bottom start with your hips slightly
higher… If lockout is your weak point you should learn to start with your hips
lower."_ Same failure axis, but the fix is a **cue**, not an exercise. Today the
engine's only response to a stall is swapping the exercise. A cue is free,
instant, reversible, needs no equipment — and is **structurally inexpressible in a
variation bank**, which is why the repo doesn't have it.

**And an epistemic warning that applies to the whole corpus:** the Juggernaut
manuals are **anthologies, not systems** — 13/14/10 short articles by _different_
elite lifters who disagree with each other about rack pulls, deload necessity,
and per-lift frequency. _"Juggernaut says X"_ is almost always wrong; one author
says X.

---

## 4. Doctrine corrections

The pack's four cross-cutting doctrine planks. Three are wrong or decorative as
stated.

### 4.1 "Adapt ONE variable at a time" — replace it

**It appears in none of the five books.** What the sources actually do is change
several variables at once, deliberately:

- **RP runs three simultaneous progressions** across every mesocycle — volume,
  load/reps, and RIR descending 4-5 → 1-0 (Ch2 P268–270). This is the pack's own
  primary hypertrophy source, and it flatly contradicts the doctrine.
- **Helms's intermediate wave changes load and reps every week** (p68–69), and his
  deload cuts sets _and_ reps _and_ load together (p142).
- **Schoenfeld's volume budget _requires_ a simultaneous compensating change**
  (p.209), and his worked progression raises volume _by_ raising frequency.
- **F&K's tolerance heuristic names a triple** — _"the workout loads, sets, and
  rest periods between sets need to be adjusted"_ (p.60).
- **Zatsiorsky's nearest analogue is a budget, not a count** — ≤2–3 targets per
  mesocycle, ~35–40% of volume each (p.82).

The one place the corpus genuinely isolates a variable is Hammarström's
within-subject study — **and it needed the subject's other leg as a control.**
That is the tell. One-variable-at-a-time is an **attribution** requirement from
experimental design, misapplied as a **prescription** requirement. An app has no
contralateral control.

Taken literally it forbids every deload recipe in the corpus and RP's mesocycle
entirely.

**Replacement — two rules:**

1. **Bounded change per cycle, by magnitude not by count.** Zatsiorsky p.193's
   only hard numeric threshold: _"Use caution with … **large increases in training
   volume (>30%)**."_ Plus RP's err-light rule, stated three separate times
   (Ch2 P281, Ch2 P329, Ch8 P43). Plus ≤2–3 targets per mesocycle.
2. **Attribution requires isolation; prescription does not.** You may move several
   variables at once. You may only _record evidence about_ a variable you moved
   alone with the others pinned. Confounded changes are legal and produce no
   evidence. **This is a property of the ledger, not of the prescriber.**

**And the code needs rule 1 today.** `advanceWeek` on a non-deload week runs three
sequential mutations to the same field:

```ts
// programEngine.ts:2145-2148
workouts = applyWeeklyVolumeShape(workouts, nextWeek); // sets → base±1
workouts = applyFatigue(workouts, fatigue); // sets × 0.9
workouts = applyAdjustment(workouts, action, experience); // sets ±1
```

— and at `nextWeek % 4 === 1` also rotates accessory **identities**. On week 5 a
user can receive a volume ramp, a fatigue shave, an adjustment and an exercise
swap simultaneously, unbudgeted. **Variable count wouldn't catch it (it is one
variable, four times); a magnitude budget would.**

### 4.2 One hierarchy is wrong — you need two ladders, running in opposite directions

The corpus contains three explicit hierarchies and they disagree in a way that is
itself the finding:

| Source         | Ladder                                                                                                              | Direction                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Helms p.17     | Adherence → V/I/F → Progression → Exercise selection → Rest → Tempo                                                 | **Design**: adherence FIRST      |
| F&K p.51, p.56 | Needs analysis → acute vector → chronic → administrative                                                            | **Design**: constraints LAST     |
| RP Ch8 P59–67  | landmarks → fatigue mgmt → SFR → technique/RIR → nutrition → resensitization → patience → realism → **consistency** | **Diagnostic**: consistency LAST |

**RP's last resort is Helms's first tier.** They are near-inverses, and both are
correct, because designing a programme and repairing a stalling one are different
problems. A single ladder collapses them and will be wrong in one of the two modes.

**Design order** (at plan generation):
adherence constraints → weekly volume per muscle → **derived** frequency → split
shape → exercise selection → rest → tempo → **a separate constraint-degradation
pass** (F&K p.69).

**Intervention order** (when something is going wrong), **ordered by
reversibility, not by magnitude**:

```
0  hold                       ← the default, and the modal answer (Schoenfeld p.85: ~47%)
1  technique / setup cue      DL p43-44; RP Ch3 P95 — free, instant, reversible
2  load or rep step size      Zatsiorsky p.186 — a 5-10% intensity cut "can avoid
                              strength decrements entirely"
3  volume                     Helms p54 flowchart
4  rest interval              F&K p.77, p.81 — their primary progression lever
5  deload                     Schoenfeld p.200 (near-free); RP Ch3 P213 (bias early)
6  exercise swap              Zatsiorsky p.93 — and DESTRUCTIVE in this codebase (D7)
7  frequency / split change   Schoenfeld p.87
8  re-baseline / resensitize  RP Ch6 P38-P42
```

Rungs 6 and 7 sit **above** deload, which inverts the intuitive arrangement and is
exactly what the asymmetric-cost evidence requires: a deload is a _large_ change
with a near-zero error cost, while an exercise swap is a _small_ change with an
**unrecoverable** error cost in this codebase (it zeroes `performanceHistory`).

### 4.3 The confidence model is decorative as specified — three changes make it real

"Confidence low/moderate/high constrains action magnitude" is a **monotone
shrink**. A monotone shrink never blocks anything; it only makes wrong actions
smaller. The corpus demands blocking in specific, nameable places:

- Helms p139 — novices use %1RM, **not** RPE, for the first month. A hard gate on
  an _input_, not a magnitude reduction.
- Helms p73 — RIR accuracy is claimed only for advanced **and** RPE-familiar
  **and** near-failure. Outside those three conditions the book makes no accuracy
  claim at all. That is not "low confidence", it is **absence of an instrument**.
- Zatsiorsky p.62 / Schoenfeld p.92 — confidence in a global RM table is not low,
  it is **zero**, and the correct behaviour is refusal.

**Change 1 — add a fourth state, `unavailable`, distinct from `low`.** The repo
already invented this and documented exactly why (`adjustmentRule.ts:24-34`).
Lock it as the pattern. ✔

**Change 2 — per-attribute, never global.** Schoenfeld p.170: hypertrophic
predisposition is _"specific to a given muscle."_ RP Ch7 P34: _"Your quads might
have a high MRV… while your biceps might have low MRV."_ A single confidence
scalar is the wrong shape for the same reason a single readiness scalar is.

**Change 3 — cold start runs on named priors, not on a shrunk adaptive term.** On
day one, for every user, essentially every confidence value is `unavailable`. A
shrink-based model shrinks everything to nothing and the app does nothing. A model
with `unavailable` + explicit displaceable priors does the right thing, and §3.8
lists the priors the corpus supplies.

**Mandatory acceptance criterion:** for every decision the engine can make, ship
the test that proves it does **not** fire at `unavailable`. Without it, confidence
is decorative by construction — and this repo has already been burned by exactly
this class of untested negative (CLAUDE.md's `waitFor` rule: _"5 of
`useLastRunType`'s 7 tests passed while the hook offered a repeat row to every
user including signed-out ones"_).

Existing precedent to reuse rather than reinvent: `src/lib/dataConfidence.ts`
already implements thin-data suppression with typed `SuppressionReason` values,
and honestly labels its thresholds "a working hypothesis".

### 4.4 Confidence maps to **asymmetric thresholds**, not symmetric magnitude — and needs a second axis

The pack's confidence→magnitude mapping is symmetric. The sources are emphatically
asymmetric, in **opposite directions per action type**:

| Action                  | Bias               | Source                                                                                                                               |
| ----------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Deload / volume cut** | toward **firing**  | Schoenfeld p.200 (3-week break didn't interfere); RP Ch3 P213 ("less detrimental" than delaying)                                     |
| **Volume increase**     | **against** firing | RP Ch2 P281/P329 ("almost always err on the lighter side"); Helms p37-38 ("do enough to progress, not as much as possible")          |
| **Load increase**       | **against** firing | Zatsiorsky p.186 (a 5–10% cut avoids strength decrements entirely); p.62 (a true max costs ~1 week light, ~1 month before competing) |

**Rewrite the doctrine as: every decision type carries a declared cost asymmetry,
and confidence shifts the _threshold_ in the cheap direction — it does not scale
the magnitude symmetrically.**

And add the **second axis** from §1.3: **source grade**. Two independent inputs —
_how much do we know about this user_ and _how well-evidenced is the rule we're
about to apply_. A rule whose backing is a personal communication (Schoenfeld
p.84's per-session cap) or zero citations (RP's four algorithms) must not
authorise a large change even on abundant user data.

One more asymmetry that collapses a lot of machinery, and it is about **windows**:

- **Down-regulation may fire on short windows.** Two under-performing sessions
  (RP Ch3 P154). False positives are close to free.
- **Up-regulation requires long windows.** Interference took **8 weeks** to appear
  (Schoenfeld p.164); periodisation diverged only after **week 6** (p.193);
  Hammarström ran **12** (p.85). Any loop concluding "this worked" or "no
  interference" from 4 weeks of one user's data is reading noise.

That single asymmetry replaces most of a general "change budget" system with two
numbers.

---

## 5. Verdicts on the pack's 18 handoffs

**KEEP** = ship roughly as scoped · **REWRITE** = right subject, wrong spec ·
**SPLIT** = two things with different lead times · **STRIKE** = already shipped or
premised on fiction · **DEFER** = specified, not built, reason recorded ·
**BLOCKED** = cannot be evaluated.

| #         | Subject                                                                 | Verdict                                                              | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01**    | npm ci green + baseline fixtures                                        | **REWRITE**                                                          | The premise is false — the repo is green (§1.2). The salvageable idea is baseline fixtures, and `find src functions -name "*fixture*" -o -name "*golden*"` returns **zero files** ◻. Replace with: sweep the 90-config space through `buildPlan`, snapshot, and commit as a golden fixture **including the currently-wrong values, annotated as wrong.** You cannot safely change anything else without it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **02**    | Discipline states, goals, adaptation permission                         | **SPLIT: 1 keep, 1 rewrite, 1 reject**                               | **REJECT** the `RunMode structured → "development"` migration: it violates the Run9a plan-file lock ("Do not reintroduce structured mode"), the migration is already written and deliberately unwired (`run9Migration.ts`), and the rename has a coordinated blast radius including `functions/profileSanitizer.js`'s enum allow-list for zero user-visible gain. **KEEP** adaptation permission (`insights`/`suggest`/`auto`) — cheap, maps onto the existing `ProgramSettings.autoProgression`, needs no schema bump, and Helms p.23 is the argument. **REWRITE** "discipline states" as one concrete change: **pass weekly aerobic minutes into `buildLiftProgram`** (§3.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **03**    | Canonical evidence, eligibility, confidence                             | **REWRITE**                                                          | Right subject, wrong first action. **There is almost nothing to canonicalise** — the write path deletes it (D2). The first task is the _write path_, not the record type. And **extend `computeConfidence`** (`performanceEngine.ts:204-223`, five named signals, parity-tested) rather than inventing a parallel model. Add the `unavailable` state (§4.3) and the source-grade axis (§4.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **04**    | Decision registry, ledger, immutable versions, rollback, change budgets | **REWRITE — cut three of five**                                      | **The ledger is right and nearly free**: `functions/lib/programCommands.js` already has a frozen 16-kind command vocabulary, a durable per-command receipt written _in the same transaction as the state_, and a live callable. Widen `makeCommandReceipt` to carry `{actor, ruleId, ruleVersion, evidenceRefs, before, after, magnitude}` and give engine rows ~400-day retention (the phenomena take 6–8 weeks; a 31-day ledger cannot span what it audits). **CUT the immutable version store and arbitrary rollback** — adaptation is path-dependent, and restoring a 6-week-old programme reinstates prescriptions computed against fatigue that no longer exists. `DeloadSnapshot`'s `weekNumber` guard already refuses exactly this, deliberately. Generalise it to a single-slot `lastEngineChange` + one-tap undo instead. **CUT change budgets** as specified (replaced by §4.1's magnitude budget). **"Shadow only" is currently unimplementable** — `grep -rn "featureFlag\|remoteConfig\|isEnabled(" src/` returns **zero hits** ◻; the only precedent is the deletion kill-switch. That becomes its own small prerequisite. |
| **05–10** | Running arc                                                             | **BLOCKED**                                                          | Daniels/Pfitzinger/Magness were never supplied. Handoffs 06 and 07 are prescriptive training-plan design — without the sources they can be implemented on faith but not reviewed. State this to the owner as a gate. Also: there is **no dependency running → lifting** anywhere in the pack's own structure, so putting six running handoffs ahead of the priority lifting work is pure sequencing, and the wrong choice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **11**    | Exercise metadata + canonical lifting evidence                          | **SPLIT — and 11a is the highest-value item in the whole pack**      | It bundles two things with completely different lead times. **11a (per-set evidence schema)** is ~4 edits and has a **multi-week lead time because nothing can be backfilled**. **11b (one exercise record)** is 150 exercises × ~6 fields of domain-judgement data entry with **no lead-time pressure at all**. Bundled, the urgent half waits on the slow half. Also: **do not add a third catalogue.** `Exercise` (151 rows) and `ExerciseOption` (53 rows, carrying exactly the fields the pack wants, with cited literature) already exist — merge them. And 11b must fix D10 (store `movementCategory`), which is the live push/pull bug.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **12**    | Strength-goal product loop                                              | **REWRITE + DEFER the back-map**                                     | **"e1RM as a RANGE" is correct and I would strengthen it**: the range **width must be a function of the rep count the estimate came from** — narrow at 3–6 reps (Helms p75), widening sharply above 10, and **returning `null` above ~15** rather than a number. A bare Epley (`analytics.ts:26`) has constant implied confidence, which is wrong. **STRIKE "block review is new"** — `blockReviewViewModel.ts` exists and is **locked** by GsPb1 item 5. **DEFER the date back-map**: the corpus specifies it fully and three authors converge (DL p40–41: goal = PR + 10–20 lb, 6 training weeks + 1 rest, top singles at goal−75/−50/−25) — but Hevy and Strong have no such feature, which under CLAUDE.md's reference-app heuristic is evidence _against_, and the repo already parked it as backlog D4. Write the spec into the handoff as _specified-but-unbuilt_ so it isn't re-derived.                                                                                                                                                                                                                                          |
| **13**    | Hypertrophy response engine                                             | **SPLIT — and 13b cannot ship for 12 weeks after 11a reaches users** | "Landmarks as priors" is exactly right and exactly sourced. The rest is the most over-scoped item in the pack and is blocked by two things it cannot see: **(A)** the 10-group muscle taxonomy cannot express the thing (§3.9); **(B)** six of its eight named inputs have no data source and none can be backfilled. **13a** = substrate: taxonomy split, add MV + a `junk` volume status, fix the four attribution defects, decide the currency as an ADR. **No behaviour change.** **13b** = the response engine, with a first-class **null-response state** as the default (§3.7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **14**    | Lifting adaptation + Performance hub                                    | **SPLIT — 14a is repairs and goes FIRST of everything**              | **14a**: fix D1, D3, D4, D6, D7, D8. Every acceptance criterion in 11–14 is unmeasurable in production while these are broken, and all are days of work. **14b**: evidence-triggered deload keeping the existing training-age recipe, plus a hub that shows **decisions, not scores** — RP disclaims its own SFR as _"informal and by no means perfect"_ (Ch3 P47) and Helms says _"we don't really know what optimal is"_ (p.25). One computed metric is allowed: **performance-vs-plan per lift**, which both RP (Ch3 P26) and Zatsiorsky (p.75) name as primary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **15**    | Hybrid stress vector / conflict gate                                    | **STRIKE the vector; KEEP a static rule**                            | A "multidimensional SessionStressVector with a six-part conflict gate" would be **entirely invented**. Schoenfeld contains no quantitative fatigue model anywhere (MRV is qualitative with _"no direct research has been conducted on the topic"_, p.209; the volume budget is explicitly non-fungible **with no exchange rate given**, p.209). Zatsiorsky gives the fitness–fatigue _form_ and **no values** for P₁/P₂/k₁/k₂ (p.13). RP's SFR is self-disclaimed and can divide by zero. And it is unmeasurable anyway: interference takes 8 weeks to appear. **The correct intervention is static and rule-based** — weekly aerobic minutes into `buildLiftProgram`, prefer separate days, F&K p.120's dose.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **16**    | Hybrid, second half                                                     | **REWRITE into §3.4 + §3.12**                                        | Same reasoning. The genuinely valuable, buildable content is the aerobic-minutes coupling and **maintenance dosing**, which is an entire missing construct with F&K numbers you can ship today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **17**    | Historical replay simulator                                             | **STRIKE — merge the useful 1% into 01**                             | **There is nothing to replay.** Persisted sets are 3 fields; `performanceHistory` is capped at 10/20 and last-set-only; the corpus is one pre-launch user. And there is **no ground truth to score against** — the sources do not parameterise what a simulator would fit, so one scored against invented constants will confidently ratify whatever it was seeded with. Replace with golden-fixture regression over the 90-config sweep: that buys the safety property 17 actually wants, today. Revisit after the widened schema has been collecting for months **and** there is more than one user.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **18**    | Rollout, telemetry, block reviews, cleanup                              | **STRIKE two, BLOCK one, REWRITE one**                               | **Telemetry largely exists** — 13 analytics modules behind a provider covering web _and_ native ◻. **Block reviews already exist and are locked** (GsPb1) — re-specifying them is exactly the lock re-derivation CLAUDE.md prohibits. **Rollout is blocked** on the missing flag infrastructure. **The cleanup that matters is not the one the pack means**: finish the command boundary. `saveProgram` has **19 call sites** in `useProgram.ts` against **one** command-boundary caller ◻. **An audit trail over a document that 19 client writers can still clobber is an audit trail over a record that lies** — and that is the decisive argument against Handoff 04 as written, from the repo's own comments (`programCommands.js:5-16`).                                                                                                                                                                                                                                                                                                                                                                                            |

**On the swapped "Likely touchpoints" / "Do not" sections in 02–05:** do **not**
simply swap them back. Every touchpoint list in the pack names files that do not
exist, so restoring the correct-position list restores a wrong list. Delete the
per-handoff "Do not" sections and replace with one global preamble: _verify every
file path against the tree before editing; the pack's repository audit is void._
And **someone must check 11–14 for the same swap** — that defect would make
Handoff 11 refuse to edit `warmupRamp.ts`, which is the entire point of it.

**Mandatory preamble for every rewritten lifting handoff:**

> Before writing code, diff this handoff against `volumeModel.ts`,
> `overlapModel.ts`, `variationBank.ts`, `programEngine.ts`, `adjustmentRule.ts`,
> `blockReviewViewModel.ts`, `trainingBlock.ts`, `muscleRecovery.ts`,
> `startingLoads.ts`, `experienceModel.ts`, and
> `docs/proposals/training-book-reviews.md` §1–5 + backlog STATUS lines. Search
> `git log --all --oneline -- .claude/plans/programme-run-followups.md` for a lock
> covering this decision. **Any deliverable that already exists is struck from the
> handoff, not reimplemented.**

---

## 6. Corrected sequencing

The pack's order is 01 → 18. That governs a **frozen loop** with a **ledger built
on a clobberable document**, using **evidence that is being deleted on save**.

### The dependency graph that actually holds

```
P0 repairs (D1,D3,D4,D6,D7,D8) ──▶ everything      [nothing in the pack depends
                                                     on them; everything in the
                                                     pack depends on them being true]

11a per-set evidence ──▶ 03 ──▶ 12
       │                  └──▶ 13b ──▶ 14b
       ├──▶ 11b ──────────────▶ 12
       └──▶ (starts a 12-week clock — see P5)

13a taxonomy + MV + currency ADR ──▶ 13b     [hard block]
stored movementCategory ──▶ any push/pull or coverage reasoning
golden fixtures ──▶ any landmark work        [don't autoregulate a wrong tally]

04 ledger ──▶ 18                             [does NOT block 11/13 — build the
                                              response engine, wire the ledger
                                              in afterwards]
02 RunMode ──▶ 05-07 only                    [gates nothing on the lift side]

12 ⊥ 13                                      [genuinely parallel — they share
                                              the evidence layer and nothing else]
```

**False prerequisites in the pack** (look ordered, aren't): 05–10 → 11–14;
04 → 11/13; 02 → anything on the lifting side.

**Missing prerequisites the pack cannot see:** the schema widening → everything;
the taxonomy split → 13b; stored `movementCategory` → any coverage reasoning;
golden fixtures → any landmark work.

### The order

| Phase             | Work                                                                                                                                                                                                                                                                                                                                                                                | Why here                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0 — days**     | **The six repairs.** ① Week advance fires for lifters (D1). ② Stop deleting RPE and set type (D2 — this is _also_ 11a's core, and it is the highest value-per-line in the entire pack). ③ Gate progression on set eligibility (D3). ④ Manual deload stashes load (D4). ⑤ Delete or wire the dead prescription fields (D8). ⑥ Move `reorganize` inside the `isAccessory` guard (D7). | All are **live user-visible defects**, all independent of v8, all days of work. Every acceptance criterion in 11–14 is unmeasurable while they're broken.                |
| **P1 — a week**   | Golden fixtures over the 90-config sweep (rewritten 01 + the salvage of 17). Then store `movementCategory` (D10), the `volumeModel` mapping errors, the `isAccessory` mis-tagging, and the template-path load seeds.                                                                                                                                                                | You cannot safely change anything downstream without pinning what today's output actually is — including the wrong values, annotated as wrong.                           |
| **P2 — parallel** | **11a** ships the day P0 lands, **alone**, with **zero consumers by design**. Simultaneously **11b** (one exercise record + backfill) and **13a** (taxonomy + MV + currency ADR) — neither changes behaviour.                                                                                                                                                                       | 11a has the longest lead time and the smallest diff. 11b and 13a are data/substrate work that can proceed while evidence accrues.                                        |
| **P3**            | **14b** — evidence-triggered deload (per-muscle recovery session → whole-body deload) keeping the training-age recipe; the honest hub. Plus the adaptation-permission enum from 02, and weekly aerobic minutes into `buildLiftProgram`.                                                                                                                                             | Needs only load/reps plus P0's recovery input. RP's two-session MRV rule is computable **today**.                                                                        |
| **P4**            | **12** — the strength readout, into the existing block-review anchor slot.                                                                                                                                                                                                                                                                                                          | Needs 11a's RIR provenance for eligible-set baselining.                                                                                                                  |
| **P5**            | **13b** — per-muscle volume response. **Earliest ship = 12 weeks after 11a reaches real users.**                                                                                                                                                                                                                                                                                    | Schoenfeld p.164 (8 weeks), p.193 (6 weeks), p.85 (12 weeks). Shipping sooner means titrating on noise for a population where ~47% won't respond and ~9% will be harmed. |
| **P6**            | Finish the command boundary (18's real cleanup), then the ledger (rewritten 04).                                                                                                                                                                                                                                                                                                    | Until the 19 `saveProgram` writers go through the boundary, every auditability guarantee is defeasible by a second browser tab.                                          |
| **P7**            | Running arc. **Gated on the running sources being supplied.**                                                                                                                                                                                                                                                                                                                       | Not a delay — a gate.                                                                                                                                                    |

**The single structural claim I would defend hardest:** the pack's most valuable
line of code is deleting the projection at `warmupRamp.ts:155-156`, and it is
currently buried inside a handoff that also asks for a versioned metadata store.
**Splitting 11 is worth more than any other change in this document.**

---

## 7. What I would NOT build

Deleting work is as valuable as adding it. Each of these is refused on a source,
not on taste.

| Don't build                                                                   | Why                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A `SessionStressVector` / `hybridStress` scalar**                           | No source in the pile contains a quantitative fatigue model. Zatsiorsky gives the _form_ and no constants (p.13). Schoenfeld's volume budget is explicitly non-fungible with **no exchange rate** (p.209). RP's SFR is self-disclaimed (Ch3 P47) and its denominator can be 0. And Zatsiorsky p.81 forbids a single global fatigue state outright: fatigue is **specific**.                                       |
| **HRV / resting-HR readiness for lifting**                                    | Zatsiorsky p.191: _"Attempts in the lab with stressful resistance exercise have reported **no changes to HRV**."_ Resting HR — _"overtraining may have already occurred by the time resting HR increases."_                                                                                                                                                                                                       |
| **Overtraining detection from strength / e1RM trend**                         | Zatsiorsky pp.192–194: the impairment order is psychological → neural → speed → RFD → power → **1RM last**, and under high-intensity overtraining maximal strength often **never falls at all** (p.186). A strength-trend detector fires after the damage. The earliest signal is a survey item — _"decreased desire to train"_ and _"lack of recovery"_ **precede any documented physiological change** (p.182). |
| **A global %1RM ↔ reps table**                                                | Zatsiorsky p.62 (_"no fixed relationship"_), Schoenfeld p.92 (7–24 reps at 75% 1RM), Helms p44 (unreliable below ~90%). `represcribe.ts:80-90` uses Epley but is correctly bounded to never _raise_ load — **preserve that boundary**.                                                                                                                                                                            |
| **ACWR with a safe-zone threshold**                                           | Zatsiorsky p.205: _"there are no exact values that are necessarily problematic"_ and _"there is **not a large amount of data** to support the effectiveness of this ratio."_ The 0.8–1.3 folklore is not in the book.                                                                                                                                                                                             |
| **Linear vs undulating as a product choice**                                  | Schoenfeld p.194: meta-analysis + 8 primary studies, equivalent. Helms p.79: _"asking 'which type of periodization is the best?' is the wrong question."_ Do not spend engine complexity here.                                                                                                                                                                                                                    |
| **Any displayed "response score", SFR number or readiness percentage**        | RP Ch3 P47/P90, Ch8 P56; Helms p.25. Plus `training-book-reviews.md:683` carries a **locked operator decision**: _"the app is the coach, not the textbook — surface outcomes, hide mechanisms… the jargon budget for a novice is zero."_ The pack's whole vocabulary is engine vocabulary; if any of it reaches the UI it violates that lock.                                                                     |
| **An immutable programme-version store + arbitrary-point rollback**           | Path-dependent domain; ~1 adaptation/week; `weekHistory` already keeps 8. Restoring a 6-week-old version reinstates prescriptions computed against fatigue that no longer exists.                                                                                                                                                                                                                                 |
| **Change budgets as specified**                                               | They govern a loop that structurally cannot fire (D1, D5, D6). Replaced by §4.1's magnitude budget, which the code needs _today_ at `programEngine.ts:2145-2148`.                                                                                                                                                                                                                                                 |
| **A historical replay simulator, now**                                        | Nothing to replay and no ground truth to score against (§5, #17).                                                                                                                                                                                                                                                                                                                                                 |
| **Per-muscle MEV/MRV tables cited to RP Book 1**                              | The book has four tables, none of them a landmark table, and defers the topic twice to a different title. Any such citation is **false**.                                                                                                                                                                                                                                                                         |
| **Supercompensation-window scheduling**                                       | Zatsiorsky p.10 rejects the model: _"too simple to be correct."_ Any engine scheduling "the next session in the overshoot window" implements the theory its own cited authority refuses.                                                                                                                                                                                                                          |
| **A per-exercise `fatigueCost` / SFR scalar on the catalogue**                | Schoenfeld p.209 says a squat set and a curl set are not the same fatigue unit **and gives no exchange rate.** A stored number would be invented precision that downstream handoffs then treat as data.                                                                                                                                                                                                           |
| **The RunMode `structured → development` migration**                          | Violates the Run9a plan-file lock; the migration is already written and deliberately unwired.                                                                                                                                                                                                                                                                                                                     |
| **Cold-plunge / recovery-modality features**                                  | Schoenfeld p.147: cold-water immersion _"negatively affects anabolic processes and appears to be **detrimental to long-term muscle development**."_                                                                                                                                                                                                                                                               |
| **A sleep-hours target or training-time recommendation presented as science** | Schoenfeld pp.201–202: _"no studies have endeavored to directly examine the effects of restricted sleep on exercise-induced changes in muscle growth in humans"_; excessive sleep also correlates with _lower_ lean mass. p.192 on time of day: _"misguided to blindly train based on the concept of an acrophase."_                                                                                              |

---

## 8. Decisions I am making, and why

The user gave final say on these. Each is stated with its reversibility.

### 8.1 Volume currency: **adopt 1:1 and keep the bands** — reversible, one constant + one ADR

The bands at `volumeModel.ts:208-223` came from meta-analyses conducted in 1:1
units (Schoenfeld pp.183–184). Changing the counting is a one-line change;
re-deriving five goal bands into 0.5-weighted equivalents is arithmetic with no
external check and permanently disconnects our numbers from the literature we
cite. **Count 1:1, keep the bands, record the decision as an ADR**, and note in
the ADR that the book itself doubts 1:1 physiologically and recommends it as _the
convention that keeps you comparable_. Expect the tally to rise materially — the
golden fixtures from P1 are what make that safe to do.

### 8.2 Deload load axis: **keep the training-age split exactly as it is**

Meadows p28 and Zatsiorsky's two-factor taper both hold load and cut volume;
Tropos's novice recipe cuts load ×0.85. These are not in conflict — **Helms p65–66
licenses the load cut for novices specifically**, on the grounds that a novice's
stall _is_ the load, while an intermediate's fatigue is volume and dropping bar
weight costs skill exposure. `applyDeload` already implements exactly that split
with the reasoning in its doc comment and a parity-tested server mirror. **This is
one of the best-reasoned things in the codebase. Close M4 as resolved-keep**, and
add the pin that no deload path may reduce session frequency while holding load
(the supercompensation taper Zatsiorsky rejects).

### 8.3 Strength-goal date back-map: **stays deferred, spec preserved**

Three practitioner authors converge on it and the algorithm is fully specified.
But Hevy and Strong have no such feature; CLAUDE.md's reference-app heuristic
treats that as evidence against; and the repo already deferred it deliberately as
backlog D4. **Handoff 12 ships the e1RM range without it**, and the back-map spec
goes into the handoff as _specified-but-unbuilt_ with the objection recorded, so
it is not re-derived a third time.

**The spec, written down so the deferral is a decision rather than a gap**
(DL p40–41; converged on by two further practitioner sources):

> Given a target lift and a date: goal = current PR + 10–20 lb (≈5–10 kg).
> Six training weeks plus one rest week back from the date. Top singles ramp
> at goal − 75 lb, − 50 lb, − 25 lb across the block, with the attempt in the
> final week.

Three things a future implementation must not lose:

1. **It needs a real 1RM, and `estimate1RMRange` will not supply one.** The
   ramp is denominated in absolute plate weights off a known max. Seeding it
   from an estimate — let alone from the midpoint of a band this arc just
   finished widening — would compound the estimate's error across six weeks of
   prescriptions. The back-map wants a tested single or nothing.
2. **The increments are imperial and were authored for a specific population.**
   10–20 lb on a squat and on a press are not the same relative step, and the
   sources do not scale them. Converting to kg is not the hard part.
3. **The objection stands on its own.** Neither Hevy nor Strong offers a
   date-driven peaking plan, and CLAUDE.md's reference-app rule reads three
   apps not having a feature as evidence against building it. Nothing about
   the corpus's convergence answers that — the authors are writing for coached
   powerlifters, which is not who opens Tropos.

### 8.4 Week rollover for lifters: **calendar-based, unattended days archived as `planned`**

D1's fix cannot be "make the button easier to press" — the failure mode is a user
who never presses it. The run side already has the honest-record pattern (archive
what didn't happen rather than leaving zombie planned entries). Apply it: a stale
week rolls over on the calendar, unattended days are archived as `planned`, and
the deload/adjustment tiers run. Adherence-sensitive logic reads the archive.

### 8.5 Beginner RPE: **collect it, label it, never let it gate progression**

Helms p139 says novices should use %1RM, not RPE, for load-setting — but p139
_also_ uses RPE from day one on low-stakes exercises _"as a learning tool… even if
you initially gauge RPE inaccurately, there will be little to no consequences."_
So: show it, store it **with provenance** (`{experience, rpeShownByDefault, source}`),
and make `eligibleForCalibration(set)` return `false` for it. The absolute
`RPE_HOLD_THRESHOLD = 9.5` gate stays advanced-only; everyone gets the _relative_
check instead (Helms p141: final set ≤ first set + 1 RPE), which is robust to an
uncalibrated scale and needs first-and-last set — i.e. it needs 11a.

---

## 9. Open questions I could not resolve

1. **Does the pack's Handoff 11–14 text carry the same swapped
   "Likely touchpoints" / "Do not" defect found in 02–05?** If so, Handoff 11
   would forbid editing `warmupRamp.ts`, which is its entire point. Needs a read
   of the raw text.
2. **How many users are affected by D4 (the manual-deload load loss) today?**
   One pre-launch user, so likely a manual repair — but it should be checked
   rather than assumed, and the repair is "restore `weight` to the pre-deload
   value", which nothing records.
3. **Should the muscle taxonomy expand to ~20–25 groups, or should response
   tracking be scoped to the subset where the literature's coverage failures
   actually occur** (delts ×3, quads RF vs vasti, hamstrings hip- vs
   knee-dominant, triceps long vs lateral/medial)? The narrower version is
   cheaper and covers every case Schoenfeld names. I lean narrow, but this is a
   real fork and it belongs in 13a's ADR.

   **STATUS 2026-08-02 — resolved, and the fork dissolves rather than being
   picked.** Neither branch is right, because both set the taxonomy by
   deciding what we WANT to track. The shipped rule sets it by what the data
   can already say: **split wherever the exercise DB carries the finer label on
   at least one exercise.** Every split is then a distinction the old map was
   discarding, nothing is invented, and no exercise had to be re-labelled.
   That lands at 27 fine muscles — the "20–25" ballpark, arrived at by a rule
   rather than a target.

   Checked against the four cases the question names: **delts ×3 is in** (the
   DB has `Front/Side/Rear Delts` and `Rotator Cuff`). **Quad heads and triceps
   heads are out** — no exercise labels either, so the split is not
   representable; the blocker is the data, not the taxonomy, and when the
   labels exist each split is one row. **Hamstrings hip- vs knee-dominant is
   not a taxonomy question at all** — it is one muscle trained by two movement
   patterns, which `movementCategory` already distinguishes, so putting it in
   the muscle table would have been a category error.

   The reasoning lives in `muscleTaxonomy.ts` rather than an ADR because the
   file IS the decision — an ADR pointing at a table that can drift from it
   would be the second source of truth this arc keeps deleting. What the module
   does carry, and what a response engine must read before titrating, is which
   splits are CITED (delts, back) versus merely data-preserving.

4. **The delt volume target is a live disagreement between two practitioner
   sources** — Meadows's _high_ band for shoulders (11–12 sets) sits below
   Nippard's front-delt-only allocation. Whatever number the engine picks, it is
   picking a side. Prefer the science bands and treat both practitioners as
   out-of-range.
5. **Does `askGeminiText`-style dead-endpoint risk apply to the dead prescription
   fields (D8)?** Deleting `intensityMultiplier`/`volumeModifier` from
   `programTypes.ts` is a persisted-shape change; check the sanitizer allow-list
   and the offline-queue replay path before removing rather than just unwiring.

---

## 10. Confidence and gaps

**High confidence** (verified at source by me, marked ✔ above): all fifteen
defects in §2.3; the pack's audit fiction; the engine description in §2.1–2.2.

**Good confidence, not independently re-run** (marked ◻): the 90-config sweep
measurements, the landmark violations, the `isAccessory` mis-tagging, the 35 kg
lateral raise, the exercise-metadata coverage percentages, the `npm ci`/lint/test
results, the `saveProgram` call-site count, the absence of feature-flag
infrastructure. Each is specific enough to re-check in minutes.

**Book claims** come from parallel full readings of the supplied PDFs. Three
carry stated caveats that propagate:

- **Renaissance Periodization** is a reflowable Kindle EPUB with **no print
  pagination**. All RP citations use a reproducible `Ch<N> P<k>` block locator, not
  page numbers. If a citation must survive review against a print edition, it
  needs re-resolving by full-text search on the quoted sentence.
- **Fleck & Kraemer** is the **1987 first edition**, not the 3rd/4th that most
  modern citations mean. It contains **no** RIR/RPE autoregulation, **no** VBT,
  **no** MEV/MAV/MRV, and none of the post-1985 concurrent-training literature.
  Any pack citation to "Fleck & Kraemer" for those topics is wrong for the book in
  hand. What it _does_ have — the four-stage design architecture, maintenance
  dosing, the runner-who-lifts prescription — is the best in the pile for those
  specific questions.
- **Zatsiorsky** figure values did not survive PDF text extraction. Fig 7.23's
  velocity bands (the most implementable VBT artefact in the book), fig 4.1's
  load–RM curves, and fig 4.7's effect-size plot are captions-only. Nothing above
  depends on reading a curve.

**Known holes in the reading:**

- **Schoenfeld chapters 1–3** (mechanisms, measurement) were not mined. If any
  handoff carries a mechanism-weighted stimulus model (tension vs metabolite vs
  damage), the chapter that adjudicates between them has not been read.
- **Zatsiorsky ch. 3** (athlete-specific strength) was sampled, not read linearly.
  The "neural adaptations come first" claim is reported **absent**, not refuted —
  and what the book _does_ say is the opposite programming order (p.94, p.218).
- **Fleck & Kraemer ch. 11** (resistance-training sports) is unread and is the
  likeliest remaining source of extractable set/rep/frequency schemes.
- **Meadows's weak-point method** is genuinely unavailable — MD p33 refers to
  separate products not in the upload.
- **Two evaluator caveats, disclosed:** one pack evaluator noted it _"was not
  given the text of Handoff 11 or 13"_ and worked from an abridged summary, so its
  claims about pack _wording_ are bounded (its claims about the repo are not, and
  those are the ones reproduced here). And one subagent was reviewed while the
  safety classifier was unavailable; its findings were spot-checked against source
  before inclusion, and its two most load-bearing claims (the `advanceWeek`
  triple-mutation and the `RecoveryState` precedent) are verified ✔ above.
- **Not audited at all:** `injurySubstitutions.ts` (1,017 lines),
  `expressSession.ts`, `sessionSetPolicy.ts`, `migrations.ts`, and the
  `useProgram.ts` persistence layer end to end. Each could hold further coupling
  to the numbers cited here.

---

## Bottom line

The v8 pack's repository audit is fiction, its foundation handoff fixes a bug that
does not exist, and its name overstates its evidence. But three of its instincts
are right and worth keeping: **per-set evidence is the bottleneck**, **landmarks
are priors not constants**, and **every engine decision should be auditable**.

The corrected version is smaller and better ordered. Six repairs, days of work,
fix live user-visible defects and unblock everything else. One four-edit schema
change starts a clock that nothing can rewind. The heaviest item in the pack —
per-muscle volume response — cannot honestly ship for three months after that, and
must default to _hold_ for the ~47% of people it will never help.

And the largest single opportunity in the whole corpus is one the pack never
mentions: **the lift engine has never read a single field of the run plan**, while
the strongest quantified finding in the pile says the coupling variable is weekly
aerobic **minutes**, at r = .75.
