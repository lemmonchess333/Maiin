# Why the research did not become a programme he trusts

Forensic read of the repo's own record at a checkout of main at `a199cfd7` (main, HEAD `a199cfd7`, 2026-11-11). Paths are relative to that root. "Plan file" is `.claude/plans/programme-run-followups.md`; a row id (Lift4, Pgm7) is a row in it.

## Verdict

1. The research was real and was checked against its sources. It was turned into rules and prohibitions, never into a target session or week, so nothing in the pipeline could say "this day is wrong".
2. The shape he dislikes is the rules working as written: sets are cut to two before any lift goes, lifts are added for "every muscle twice", then lifts are deleted for per-muscle ceilings counted 1:1. Each step was locked and tested on its own count.
3. Acceptance was "conforms to Lift4" plus green tests the implementer wrote plus a simulator that scores strength gain and time fit. None of those looks at a printed day.
4. The project named this failure in its own words on 2026-07-28 ("A rule can be implemented perfectly and still produce a bad programme") and repeated it on 2026-10-13, when a two-lift pull day was committed to the golden snapshot.
5. The owner decided by delegation or by picking short labels. Every time he changed the outcome, it was because he saw the app, not a document.

---

## 1. Timeline: researched, decided, built

Git history in this worktree is shallow (first commit 2026-09-22; path history for `src/features/program` starts 2026-10-11), so entries before October are from documents, not commits.

| Date             | What happened                                                                                                                                                                                                                                                                 | Where recorded                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| by 2026-07-04    | First lift audit. D-LIFT-1 calls the missing weekly-sets-per-muscle model "the single biggest science gap" and says to start it read-only "before letting it drive selection". All items marked done.                                                                         | `docs/lift-section-audit.md` 83-97, 322-337                                                                              |
| 2026-07-27       | Seven books reviewed (Juggernaut, Mountain Dog, Nippard, Helms). A 17-item backlog ships item by item: day roles, effort cues, volume ramp, deload by age, overlap caps, warm-up ramp.                                                                                        | `docs/proposals/training-book-reviews.md` 8-13, 28-44                                                                    |
| 2026-07-28       | Owner stops a merge: "it was doing the squat three days a week, which obviously is ridiculous". Generator audit reads the generated programme. Adds `capRepeatedLifts`, `MAX_SETS_PER_SESSION` 18, a ceiling guard. Records: "reasoned about carefully and verified loosely". | same file 458-491                                                                                                        |
| 2026-08-01       | Follow-up audit: "The audit was testing the programme the generator returns, not the programme a user opens."                                                                                                                                                                 | same file 642-689                                                                                                        |
| 2026-08-02       | "v8 pack" evaluated against five academic books. Says frequency must be derived from volume and that Tropos "inverts the dependency". Decides 1:1 set counting.                                                                                                               | `docs/proposals/lifting-v8-evaluation.md` 3, 661-677, 708                                                                |
| 2026-08-03       | ADR-0010: reconciler added (floors: accessories 2, mains 3), 14-group judgement layer, 1:1 flip lands. An agent "coach-read" fixes 2-day splits and side-delt slots.                                                                                                          | `docs/adr/0010-volume-currency.md` 114-187; `programEngine.test.ts` 2300-2306                                            |
| 2026-08-04       | Lift1: untrained weeks.                                                                                                                                                                                                                                                       | plan file, Lift1                                                                                                         |
| 2026-08-07 to 09 | Evidence handoffs written (five lifting books, three running books). They bar importing "set landmarks", sample programmes, universal muscle frequency. Owner-decision session; second batch delegated ("you choose").                                                        | `docs/training-programming-claude-handoff.md` 84-86, 100-103, 189-225; `docs/lift-programming-claude-handoff.md` 972-995 |
| 2026-09-06       | Lift2, Lift3, Run17, Run18 locked "delegated".                                                                                                                                                                                                                                | plan file                                                                                                                |
| 2026-10-05       | Lift4 locked: the whole lifting system. "Round 1 (foundations) was accepted with 'Do it' and rounds 2–5 were answered on the owner's behalf." Retires nine older mechanisms. Reverses Lift2.                                                                                  | plan file, Lift4                                                                                                         |
| 2026-10-06       | Lift4 built in one day (#2593). Six agents audit code and gather evidence with primary sources blocked. Owner supplies six Sebastian Oreb transcripts. Owner: "a lot of the programming needs to be fixed".                                                                   | `docs/training-engine-2026-10/README.md` 5-8, 20-28; `docs/agents/training-engine-prompt.md` 523-528                     |
| 2026-10-07       | Evidence read against sources: lifting 390 confirmed, 115 corrected, 47 unsupported. Owner delegates: "you answer the decisions". Locked as Pgm7.                                                                                                                             | README 100-104; `owner-answers.md` 3-10; Pgm7                                                                            |
| 2026-10-08 to 12 | Training-engine pass: simulator, journeys, 98 PRs merged. 53 questions: 27 built, 17 kept, 9 "measuring". On 10-11 owner: "Yeah do all, merge what you can and make descisoon the the rest" (Pgm8).                                                                           | `final-report.md` 13-18, 337-350; Pgm8                                                                                   |
| 2026-10-13       | Lift8 to Lift16 in one day, from a Train pass, a History pass and sweeps of 900, 675 and 4,725 generated plans. Commits `32d9a776` `9259f958` `dddfc699` `ddcb340c` `98a41c59` `d2c49493` `0abf910e` `d16e00d7`.                                                              | plan file, Lift8-Lift16                                                                                                  |
| 2026-10-14       | Lift17: sessions hollowed by Lift12 get a floor of three lifts (`ddddc618`). Lift18 lb loads.                                                                                                                                                                                 | plan file                                                                                                                |
| 2026-10-17       | Lift19: day names become Push A, Pull B (`3912a8c3`). Owner asks that renaming "must not undo the programming the simulator sweeps checked".                                                                                                                                  | plan file, Lift19                                                                                                        |
| 2026-10-27 to 31 | Workout screen work: add exercise, supersets by hand, empty workouts (`2f953edb`, `5f314c23`). No generator change.                                                                                                                                                           | git log                                                                                                                  |
| 2026-11-01 to 02 | Running: starter goal for new runners; race plans start from the runner's own running (owner-approved, `65300a86`). The owner's own setup is added as a run persona.                                                                                                          | Run9 and Run15 STATUS; `src/test/sim/runPersonas.ts` 320-352                                                             |
| 2026-11-09       | Lift4 STATUS: a fourth "No equipment" preset.                                                                                                                                                                                                                                 | plan file, Lift4                                                                                                         |

---

## 2. The session-shape problem: which rules produce it, and who decided each

### 2a. The rule that makes an exercise two sets

Four rules, in the order they run.

| Rule                                                                                                                                                 | Where                                            | Who decided                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A beginner's non-main lifts start at 2 sets. Everyone else starts at 3 (4 on strength mains).                                                        | `roleTable.ts` 20-23, 93-100                     | Owner lock, Lift4 (5): "beginners three on main lifts and two elsewhere". Answered on his behalf in rounds 2-5. The evidence doc grades it SUP but says the 2-set dose "rests on it only by extension" (`lifting-evidence.md` row L7, line 2171).                                                                               |
| The time fit cuts isolations' sets to two, then other compounds' sets to two, before it drops any lift.                                              | `sessionFit.ts` 14-16, 42-46, 74-75, 279-281     | Implementer. Lift4 (5) says only "built to fit" and "main lifts keep at least two sets". The cut order first appears in the build note of 2026-10-05 (`docs/lift-programming-claude-handoff.md` 285-296). Stated reason: "Sets are cut before exercises so a short session keeps its calf, side-delt and ab work while it can". |
| Main lifts go to two sets before a muscle loses its second day.                                                                                      | `sessionFit.ts` 28-33, 288                       | Lift11, 2026-10-13, "owner-approved: picked from the engine sweep's findings, 'Second day before 3rd set'". Measured cost in the row: "main-lift sets −4.8%". Lift9 (delegated) had already accepted that "a main lift or a compound can give its third set to keep a two-set lateral raise".                                   |
| The reconciler cuts accessories to 2 for a muscle over its ceiling. Later re-fits (rollover, level change) remove more sets and never give one back. | `volumeModel.ts` 761-768, 844-897; Lift7, Lift15 | ADR-0010 addendum 2026-08-03 (implementer); Lift7 and Lift15 owner-delegated.                                                                                                                                                                                                                                                   |

Why two-set slots dominate: the app prices a working set at 45 s plus its rest, a warm-up set at 60 s, and each exercise at 90 s of setup (`expressSession.ts` 125-130, 185-187). Rests are 180 s on mains of six reps or fewer (Lift4 (5)). My arithmetic from those constants: one heavy main at 3 sets with a 4-set ramp costs about 17 minutes, so two mains take over half an hour. The remaining slots fit only at two sets, and the cut order guarantees sets go before lifts. The audit said so on 2026-10-06: the cause is "the time model's 3-minute rests on 4–6-rep 'heavier day' mains, 4 warm-up sets per barbell main, and 90 s setup per exercise" (`lifting-engine-audit.md` 60-64, 683-687).

In the committed golden snapshot (90 plans, intermediates only, 60 minutes, so the role table started every lift at 3 or 4 sets): 804 of 1,650 slots are at 2 sets (49%), 803 at 3, 43 at 4. Mean 5.2 lifts and 13.3 sets a day. Counted from `src/features/program/__tests__/__snapshots__/planSweep.golden.test.ts.snap`.

### 2b. The rule that decides how many exercises a day gets

It is not one rule. It is a hand-written list, then additions, then three kinds of removal.

1. **Hand-written day lists.** `buildFullBody`, `buildUpperLower`, `buildPPL`, `buildLegsB` (`programEngine.ts` 669, 879, 1062, 1250). Implementer templates from the July arc. The days were uneven before the October rules ran: in the golden before Lift12 the six-day push day already held six lifts and "Pull - Row Focus" four (snapshot at `9259f958^`).
2. **Lifts added so every muscle has two days.** `addTwiceWeeklyLifts` (`programEngine.ts` 1620-1659, `weeklyFrequency.ts` 1-13, 26). Owner lock, Lift4 (5): "every muscle at least twice a week on 2+ days".
3. **Lifts dropped for time.** `sessionFit.ts` steps 3 and 5-7. Lift4 (5) "Time decides the volume", order by the implementer, amended by Lift9 and Lift11.
4. **Lifts dropped for per-muscle ceilings.** `extraPastCeiling` (Lift10), the hinge drop (decisions L7, Pgm8), `accessoriesPastCeiling` (Lift12, "owner-approved: picked from the engine sweep's findings, 'Trim over-ceiling volume'"). `volumeModel.ts` 945-987; `programEngine.ts` 2121-2160. Ceilings are counted with every indirect set as a full set (ADR-0010).
5. **A floor of three lifts** on ceiling drops only: `SESSION_LIFT_FLOOR = 3` (`programEngine.ts` 1727-1735). Lift17, "decided under the owner's delegation". "a session the time fit made short stays as the fit made it."
6. **A cap of 18 sets** a session (`volumeModel.ts` 989-1008). Implementer, from the 2026-07-28 audit.

### 2c. The rule that fits a session to its minutes

`fitSessionsToTime` (`sessionFit.ts` 332-394) against `estimateSessionSeconds` (`expressSession.ts` 175-189). Owner lock in outline (Lift4 (5): "priced with the app's own estimator"). The constants are implementer defaults that "have never been checked against saved sessions" (`decisions.md` 372-375; Lift7 "Not here"). Warm-ups are priced for "an 80 kg intermediate" whoever the person is (`sessionFit.ts` 92-106). The limit works one way. A day estimated at 60.25 minutes loses a set (`measuring-l4-l5.md` 166-172). Nothing fills a day that prices well under its length: the floor-chasing top-up was retired with Lift4 (`docs/lift-programming-claude-handoff.md` 294-297), and the push/pull balancer adds nothing to a muscle at its ceiling.

### 2d. The thin pull day: its exact history

The golden snapshot for six days, Build muscle, full gym, 60 minutes, read at each commit:

| Commit                                 | "Pull - Row Focus"                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| before `9259f958` (2026-10-13)         | barbell-row 3, lat-pulldown 3, seated-row 2, db-curl 2. Four lifts, ten sets.                |
| `98a41c59` Lift12 (2026-10-13)         | barbell-row 3, lat-pulldown 4. **Two lifts, seven sets.** Committed, merged, golden updated. |
| `ddddc618` Lift17 (2026-10-14) to HEAD | barbell-row 3, lat-pulldown 3, seated-row 2. Three lifts, eight sets.                        |

At HEAD the same plan's "Push - Chest Focus" has six lifts and 15 sets (snap line 2277 onward). That is the Push A against Pull B he describes. The pull day is not short because of the clock: by my arithmetic from the estimator's constants it prices at roughly half the hour. It is short because Lift12 removed its curl for the biceps ceiling, and Lift17 stopped the removals at three.

The owner's own setup, as the repo records it, is six lift days, General fitness, intermediate, set up 2026-11-01 (`runPersonas.ts` 320-335). The golden for that (snap line 2349, assuming full gym and 60 minutes): Pull A is pull-ups 3, barbell-row 3, lat-pulldown 2. Pull B is barbell-row 3, lat-pulldown 2, seated-row 2. No curl on any of six days. Push A is six lifts, four of them at two sets. The same snapshot still marks Lats, Triceps and Upper back "HIGH".

### 2e. Stated as a goal, noticed as a risk, or measured?

- **Goal: no.** No lock, handoff or evidence table sets a target for lifts per session, sets per lift, or balance between days. `lifting-evidence.md` has no such figure (searched; its §3 tables give weekly sets and frequency only).
- **Noticed: yes, in pieces, and accepted each time.** Audit 2026-10-06, item 4: "Short Build muscle sessions hold too few working sets" (`lifting-engine-audit.md` 683-687). Its own table shows a 3-exercise day beside a 6-exercise day, both priced at 60 minutes, with no comment (615-625; printed in `measurements/lifting-plans.md` 65, 82). decisions L5 deferred it: calibration is "an operator task", supersets "wait for the 4c design" (`decisions.md` 379-381). Lift9: "The cost is accepted". Lift12: "Accepted trade". Lift17: "Left open: filling a hollowed day with a muscle under its target".
- **Measured: only by proxy.** Sweeps counted muscles on one day, readings over a ceiling, sessions under three lifts. No count of two-set slots or of unevenness between paired days exists anywhere in the record.

---

## 3. What is measured, against what he experiences

**What the simulator and tests measure**

- Twelve lifting rules of the app's own, such as `over-time`, `off-grid`, `week-sets`, `unexplained` (`simulator.md` 150-163).
- Five "coaching checks": `stall`, `misses`, `acsm-coverage`, `acsm-heavy`, `acsm-size` (194-213; `src/test/sim/liftCoaching.ts` 1-20).
- Gain in true 1RM on four lifts against a table the model was fitted to: "Fitted by construction" (`simulator.md` 565).
- Traces: for each week, four tracked lifts, sets and days per muscle, and a minutes range (176-192; see `__traces__/intermediate-woman.txt`). A trace never prints a day as a list of lifts.
- The golden sweep: 90 week-one plans, intermediates, 60 minutes. Its one volume assertion is a ratchet on configurations over a ceiling (`planSweep.golden.test.ts` 269-280).
- Unit tests that restate the rule they implement, for example "then takes a main lift to two sets before a muscle loses its second day (Lift11)" (`sessionFit.test.ts` 99).

**What none of them measure**

- Sets per lift, lifts per session, evenness between Push A and Push B, whether a pull day has a curl.
- Muscle size: "Not modelled" (`simulator.md` 110-117). Fatigue across weeks: none, "so a lighter week costs it dose and buys nothing" (`final-report.md` 463-466).
- Real session length. `over-time` is "the app's estimate against the length it promised, not a stopwatch" (`measuring-l4-l5.md` 182-185).
- A six-day lifter. The fifteen lifting personas train 2 to 5 days (`src/test/sim/liftPersonas.ts`). The owner trains six.

**The checks are one-sided.** Running a minute over is a hard rule. Too little is not a defect: since Lift4, "a reading under a floor is no longer a defect" (`planSweep.golden.test.ts` 235-241). The Weekly volume card judges a muscle against "what a fresh plan for the same days, focus, level and length gives the muscle" (`docs/lift-programming-claude-handoff.md` 306-309), so the generator is its own yardstick. A set removed costs nothing the model can see: "A set a week less on one lift is a cost the lifter model can't price" (`measuring-l4-l5.md` 185-187).

**Is there a check that a printed session looks like a coach wrote it? No.**

**Golden plans a human reviewed? No.** The golden states it is not approval ("asserted so the snapshot is not read as approval", `planSweep.golden.test.ts` 163-171). Three agent "coach-reads" exist (2026-07-28, 2026-08-03, 2026-10-06). Each found real defects the rule tests had passed. None became a standing gate. The record shows no printed week put in front of the owner or a coach before a lock.

---

## 4. Evidence-to-engine gaps and open ledger items

**Where the research says one thing and the engine does another**

| Research in the record                                                                                                                                                                                                                                                                                                                                                                                                        | Engine                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Twice a week per muscle is a way to fit the weekly sets, not a floor of its own" (`lifting-evidence.md` 1449-1452). "a sensible default, not a proven floor" (696-699). ACSM 2026 "does not say each muscle twice a week" (693-695). v8 evaluation: frequency is "a vehicle to manage weekly volume" and Tropos "has it backwards" (661-677). Handoff non-adoption: universal "muscle frequency" (976-977).                  | Twice a week for all 14 judged muscles is a first rule (Lift4 (5)) and outranks a main lift's third set (Lift11). The engine gives up volume to buy frequency.                                                                                                                                                                         |
| Pelland 2025: an indirect set is worth about 0.4-0.5. The 1:1 flip "runs against the newest evidence" (`lifting-evidence.md` 248-260).                                                                                                                                                                                                                                                                                        | Plan keeps 1.0 (owner-answers A1). The simulator's lifter counts 0.5. Lifts are deleted against ceilings counted at 1.0 (Lift12).                                                                                                                                                                                                      |
| Pelland publishes "no maximum" (ADR-0010 196-199). Lift17: "the ceiling is the most that still pays, not a harm line". July audit: "Trimming real training to satisfy a miscalibrated number is not the fix either" (`training-book-reviews.md` 510-512).                                                                                                                                                                     | Ceilings are enforced by removing lifts (ADR-0010 209-240). ADR-0010 still rests on "over-MRV volume is unrecoverable" (67-69).                                                                                                                                                                                                        |
| The owner's coach: "Per session on a big lift, 4–6 working sets" (OREB-07, `owner-lifting-sources.md` 104-109). A session is "main lift, a complementary second lift, a low-cost third" built "to fit about an hour rather than counting sets" (OREB-27, 282-291). Supersetting accessories is "the smart default" for an hour (OREB-48, 483-487). Six days means "the same weekly volume spread thinner" (OREB-24, 263-268). | Mains at 2-3 sets. Sessions built by cutting a long list. No supersets in the generator. The comparison table marks the time fit "AGREES" (line 530) and sets per lift "CHECK" (line 523). The six generator checks the doc lists (543-565) were never built: the simulator's coaching checks are the five ACSM and stall checks only. |
| Helms 2015: "roughly 40–70 reps per muscle group per session" (`lifting-evidence.md` 545-547).                                                                                                                                                                                                                                                                                                                                | A two-set slot of 4-8 or 10-15 reps is 8 to 30 reps. Not compared anywhere.                                                                                                                                                                                                                                                            |
| Intermediate strength: bench 2-3 times a week, squat twice, 6-12 direct sets per lift a week; the counts are graded convention (`lifting-evidence.md` 1463-1464).                                                                                                                                                                                                                                                             | Get stronger on four days: squat and bench as mains once a week (`lifting-engine-audit.md` 674-676). Decisions L2: "Kept", with "The model can't test Pelland's frequency effect here".                                                                                                                                                |
| Reconciler: "3 is the lowest main-set prescription anywhere in the corpus's worked examples" (`volumeModel.ts` 761-768).                                                                                                                                                                                                                                                                                                      | Time fit takes mains to 2 (`sessionFit.ts` 74-75).                                                                                                                                                                                                                                                                                     |
| "18 sets is an hour of work plus warm-up" (`volumeModel.ts` 994-997).                                                                                                                                                                                                                                                                                                                                                         | The estimator fills an hour at about 13 sets (golden mean 13.3). Two models of time in one engine.                                                                                                                                                                                                                                     |

**Open items never closed**

- LIFT-EV-08 (the base shape is a default, not capacity): open, "Lift4 listed this row for amendment; not done" (`lifting-engine-audit.md` 718). LIFT-EV-09 and -10 (Performance Index): open (719-720). LIFT-EV-04: row never updated (714).
- Prompt phase 4b: "calibrate the session estimator against real saved durations; superset the accessories" (`training-engine-prompt.md` 326-328). Neither done.
- Prompt phase 4c, "The most advanced lifting model" (337-388): decisions L19, "Not run yet (2026-10-10). Each design is written first; none is." (`decisions.md` 623-632).
- Decisions still "measuring" or not run: L9 (triceps, biceps over ceiling; "needs a size model"), L13 (Support my running), R5 for runners above the curve, R18, R25. Kept because the model could not separate options: L1, L2, L10, L16, R15, R16, R19 (`final-report.md` 343-347, 463-468).
- Simulator findings still pinned: F4 (novice presses miss 38-55 of 100 sessions), F9 (light lifts wait), F12 (quads 9 sets), F23 (`final-report.md` 297-310).
- Lift17: "Left open: filling a hollowed day". Lift7: the re-fit path gives 5 of 15 personas a set the generator does not, "its own finding".
- Running: RUN-EV-04 open and RUN-EV-07 partial as audited on 2026-10-06 (`running-engine-audit.md` 688, 691); the 2026-11-02 starting-point work answers part of RUN-EV-04 (Run15 STATUS). R18, the year-out marathon ("20 weeks of easy base, a 15 km long run for 29 weeks"), not run (`decisions.md` 1012-1021). Run17 kept: a benchmarked runner at 6:34 /km peaks at 20 km for a marathon (`running-engine-audit.md` 59-70). The simulator's own outcome table: recreational runners finish at -0.1 to -1.3 VDOT against an expected +1.5 to 3, "No sub-3:30", year-out marathon -0.2 (`simulator.md` 452-486). Plan-file Run13 item 5 (volume suggestions): deferred.
- Named sources: Layne Norton appears once, as the author of PHAT in a source row (`lifting-evidence.md` 225). Brett Gibbs does not appear in the repo.

---

## 5. Locks that pull against each other or against the evidence

1. **Lift12 against Lift17.** Lift12 deletes lifts for ceilings. A day later Lift17 stops it at three lifts and loosens the ceiling ratchet "on purpose" from 20 to 26. Net: days parked at exactly three.
2. **Lift4 (5) frequency against Lift4 (5) "time decides the volume".** Lifts are added for a second day, then the fit cuts everything to two sets to pay for them. Lift9 and Lift11 settle each clash in favour of more lifts with fewer sets.
3. **ADR-0010 against its own evidence review.** Owner-answers A1 keeps 1.0 for the plan and 0.5 for the simulator "because they use Pelland's curves". The instrument that judges the plan counts differently from the plan.
4. **The handoff's non-adoptions against Lift4.** August: no universal muscle frequency, no "exact personal volume landmarks", no supersets as defaults (`lift-programming-claude-handoff.md` 976-987). October: a universal twice-a-week rule and landmark ceilings that delete lifts.
5. **The handoff's non-adoptions against the owner's goal.** The prompt's goal is "the most advanced lifting model there is" (34-42). The handoff bars %1RM, top sets, peaking, set additions and supersets as defaults. The evidence doc routes all of it to an "opt-in strength track" that was never designed.
6. **Lift4 (4) against the owner's own use.** "Defaults centre on beginners and intermediates, 2–4 days, 45–60 minutes". He trains six days.
7. **Pgm7 rule 2 against a blind model.** "within the simulation's noise, keep what the app does". The model has no size and no lasting fatigue, so most options land within noise and are kept.
8. **Pgm5 and Lift4 (2) against repair.** Every fix from Lift8 to Lift17 is "new plans only". A plan a person already has keeps its shape until rebuilt.
9. **Two floors for one main lift.** 3 in the reconciler, 2 in the time fit (section 4).
10. **Running handoff against "Runna level".** It bars "set calendar plans" and any "source-derived" taper, long-run cap or predictor (`running-programming-claude-handoff.md` 486-499). decisions R7, R8 and R24 are each "held back by the running handoff". The taper's 75% and 60% are labelled Tropos heuristics.

---

## 6. Why repeated passes did not converge

**M1. Rules were decided and tested one at a time. Nobody read the week.**
The project wrote this down itself on 2026-07-28: "every test written for #10 asserted the rule it implemented ... and none of them opened the week a user would receive" (`training-book-reviews.md` 466-470). Lift1's method note says the same: bugs were found "by writing a throwaway probe test that PRINTS the real state ... never by reading the diff". It recurred on 2026-10-13: Lift12 shipped with "readings over a ceiling 1,580 → 919" and a two-lift pull day in the golden. The lesson was recorded three times and never became a gate.

**M2. The acceptance spec was the lock, not the programme.**
"Lift4 is the acceptance spec for the lifting system as built" (`training-engine-prompt.md` 88). When the owner said "a lot of the programming needs to be fixed", the response was "measuring Lift4 as built, fixing what departs from its text, and bringing everything else as a question" (523-528). Conformance was achieved. Whether the result is good was a separate phase (4c) that was not run.

**M3. The owner answered abstractions, or handed the answer back.**
Lift4: rounds 2 to 5 "answered on the owner's behalf". Pgm7: "you answer the decisions". Pgm8: "make descisoon the the rest". Lift8: "You decide and run a grill me session on yourself". Lift10-12: "picked from the engine sweep's findings" by labels such as "Second day before 3rd set". Lift20: "You figure the owner calls out grill yourself". His recorded interventions that changed the product came from looking at it: squat three days (2026-07-28), the run tab that "looks terrible, a lot is wrong" (Run9), two controls opening one sheet, "there's two and it's not needed" (`docs/lift-programming-claude-handoff.md` 672-675), "who's going to pull the table?" (Lift4 STATUS 2026-11-09).

**M4. The measuring instrument cannot see the complaint.**
Strength in the model saturates at 3-4 sets a week and there is no size model, so removing sets and lifts is free. Time over-run is punished. The report says it plainly: "Several answers are 'kept' because of these limits, not because the options were shown equal" (`final-report.md` 466-468). Lift19 shows the owner believed the sweeps had checked the programming.

**M5. Research was translated into prohibitions and clause grades, not into a target.**
The handoffs tell agents not to "import a sample plan, numeric protocol, or competitor behaviour" (`training-programming-claude-handoff.md` 162-165). The October evidence grades each Lift4 clause SUP, DEF or SHORT (`lifting-evidence.md` 2150-2206). Grading clauses cannot find a fault that lives in how clauses combine. GZCL is judged at the level of a principle: "Lift4 already matches it" (448-455). The one concrete set of coach templates in the record (OREB-41, OREB-42) was filed and not used as a comparison.

**M6. Patches stack; few come out.**
Fair point first: Lift4 (13) retired nine mechanisms. After it, nine more locks on the plan a person gets landed in four days (Lift7, Lift9-Lift15, Lift17), several answering the side effect of an earlier one: twice-weekly adds (Lift4) to Lift9 to Lift10 to Lift11 to Lift12 to Lift17. The settle step is now three nested fit-and-rebalance loops (`programEngine.ts` 2098-2160).

**M7. Speed.**
Lift4 locked 10-05, built 10-06, audited 10-06, evidence gathered 10-06 and corrected 10-07 (both after the lock), 98 PRs merged "on green" by 10-12, nine locks on 10-13. Review at that rate is a snapshot diff and a count.

**M8. The work that matched his goal was deferred.**
Strength track, hypertrophy track, priority muscles, supersets for short sessions, estimator calibration, the year-out marathon's shape: all in phase 4c or "measuring", none delivered (section 4).

**M9. The first evidence draft was written blind.**
"the first draft (2026-10-06) opened no paper or web page" (README 20-23). It was corrected the next day, to the project's credit, but Lift4 was already locked and built, and the correction that mattered most for volume (0.5 counting) was declined (A1).

---

## 7. What would make the next pass land

**Acceptance criteria**

1. **A printed week is the unit of acceptance.** For a fixed panel of setups, print the week as Train shows it: day name, lifts in order, sets x reps, estimated minutes. Start the panel with his own (6 days, General, intermediate, his real kit and session length), then 3, 4 and 5 days at 45, 60 and 75 minutes, beginner and intermediate.
2. **He accepts or rejects each print.** Accepted prints become the goldens, stamped with reviewer and date. Any diff reopens his review. A count in a PR body is not acceptance.
3. **Shape checks, with numbers he sets from prints, not the implementer.** Candidates the record already supports:
   - a main lift keeps 3 working sets at 45 minutes and above (the reconciler's own floor);
   - a cap on two-set slots per session;
   - paired days (Push A and B, Pull A and B) within a set tolerance of lifts and sets;
   - a session fills most of the time he chose unless he asked for less;
   - a pull day has direct arm or rear-delt work, a push day direct triceps or side-delt work.
4. **"Too little" is a defect again.** Give every over-time or over-ceiling check a matching under check, or drop the one-sided one.
5. **A reference beside every print.** Two or three named programmes for the same days and time as a test oracle: lifts per day, sets per lift, sets per session. OREB-41 and OREB-42 are already in the repo. This needs one owner call to amend the handoff: samples may be used to judge output, not copied as defaults.

**Decisions to put to him as two prints side by side, not as labels**

6. Frequency first (today) against sets first: every small muscle twice at two sets, or fewer lifts at three to four sets.
7. Ceilings at 1.0 (today) against 0.5, and whether a ceiling may ever delete a lift.
8. Cut sets before lifts (today) against cut lifts before sets.
9. Build then cut (today) against build each day from a session template sized to the time: main, second lift, accessories, as his own coach describes it.

**Review steps**

10. Calibrate the estimator from his saved sessions before time removes anything. Until then allow a tolerance: no set lost for 15 seconds.
11. Add a six-day lifter to the lifting simulator, and make every trace print full sessions for week 1 and week 8.
12. One rule in, one rule out. A new generator rule ships with a before-and-after print and names the rule it replaces or merges with.
13. No delegation on shape. He can delegate copy, plumbing and defects. He signs prints.
14. Small batches. One generator change per review, not nine locks in a day.
15. Running gets the same gate. Print the full calendar for his marathon and three personas, week by week, beside a reference plan's structure. Decide R18 and R17 by reading it.

---

## Not verified

- **Git before 2026-09-22.** The worktree is shallow. PRs #1486 to #2593 and the Lift4 build are cited from documents. The Lift4 grill transcript is not in the repo.
- **The brief's first-look figures** (64% at two sets, 4.9 lifts and 12 sets at 60 minutes across 300 weeks). I did not re-run the generator. My counts come from the committed golden (intermediates, 60 minutes, week 1).
- **The owner's stored plan.** His kit and session length are not in the record. The six-day General plan quoted assumes full gym and 60 minutes.
- **Pull B's price** (about half the hour) and the 17-minute main lift are my arithmetic from the estimator's constants, not a run of the estimator.
- **The October sweeps** (900, 675 and 4,725 plans; the "interaction pass"). No script or report is stored. Numbers are as the lock rows state them. How the options were shown to the owner is not stored beyond the quoted labels.
- **Whether the owner ever saw** `measurements/lifting-plans.md` or any printed week. The record is silent.
- **Read in part only:** `lifting-evidence.md` (read: head, §0, §1 in part, §2.1-2.4, §3, §6, §7, §8), `running-evidence.md` (§0 only), `test-infrastructure-audit.md` (summary and §1.5), `running-engine-audit.md` (§0, §7, §8), `running-programming-claude-handoff.md` (design rules, non-adoptions), `lifting-v8-evaluation.md` and `training-book-reviews.md` (selected sections; not on the brief's list). Plan-file rows Run9 (59 KB), RP1-4, P1-2, Pgm3-4, Run7-16 read at their heads and STATUS lines. ADR-0002 and ADR-0011 skimmed.
- **Not read:** `explanation-ux.md`, `measuring-r17.md` (Run17's STATUS and decisions R17 used instead), the harness files.
- **Builder slot counts** are read from the golden snapshot's history, not counted line by line in the builders.
- **Nothing was executed.** No test, simulator or build was run. Current behaviour is inferred from source, the golden snapshot and the documents.
- **Layne Norton and Brett Gibbs.** Searched `docs/`, the plan file and `GLOSSARY.md` only. Material supplied in chat and never committed would not show.
