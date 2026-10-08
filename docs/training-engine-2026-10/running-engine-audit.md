# Tropos running engine — audit of the RUNNING system

HEAD `55c195a` on `claude/tender-hypatia-qvawvs`, audited 2026-10-06. Read-only on
tracked files. The headless simulation ran the real generator through vitest; it was
deleted afterwards (`git status --porcelain` lists nothing of mine). The harness is
archived at `harnesses/running-sim.test.ts.txt`. Its full output (961 lines) was
not kept; §6 reproduces the tables that matter, and rerunning the harness
regenerates the rest.

> Point-in-time: line numbers and measurements describe `55c195a`. Re-trace a
> claim against the current tree before acting on it. Index and corrections:
> [README.md](README.md).

Files cited below are paths in the repo. A `file:line` reference is the line at HEAD.

---

## 0. Top findings (ranked by how much they block "Runna-level plans + explained sessions")

1. **What a session is, is explained in exactly one place: a collapsed "Why this run"
   disclosure.** `runSessionExplainer.ts:54-116` has 13 one-line strings. They render on
   4 surfaces: the launch card, the Programme day card, the Manage sheet and the Home day
   peek. Every one of them is closed by default (`PurposeDisclosure.tsx:21-28`, a
   `<details>` with no `open`). The explainer is withheld from Home's today card
   (owner decision, pinned in `SessionPurpose.test.tsx:46-66`), from the setup modal, the
   in-run screen, RunSummary, RunDetail, the feed, notifications and freeform runs.

   Effort is never given as a scale. The only effort words are "Conversational pace",
   "Comfortably hard" (shown in-run only), "relaxed fast", "hard" in "4 reps of 1 km hard"
   (the effort is not defined) and "All-out" for races. No glossary or legend exists:
   nothing in GLOSSARY.md, and no "what is a tempo" sheet.

2. **Without a benchmark (the onboarding default), the paces are wrong or absent.**
   - Every tempo targets **4:30/km** for everyone (`workoutTemplates.ts:167,179,191`;
     `runPlanMetadata.ts:809-821`). That is faster than the 5K race pace of a 25:00
     5K runner (5:00/km).
   - Intervals carry no pace at all, and `PaceZoneBar` judges them against **5:00/km**
     (`Run.tsx:1614-1624`).
   - Easy and long runs never carry a pace target, even with a benchmark
     (`runPaces.ts:379-384`).
   - Onboarding asks for no benchmark, time goal or current volume
     (`Onboarding.tsx:950-1124`).

3. **Measurement loops punish correct execution.**
   - The post-run verdict and the live PaceZoneBar both use the **whole-run average**,
     warm-up and cool-down included (`RunSummary.tsx:669-670,784-813`;
     `Run.tsx:1617-1621`). A perfectly run `tempo_20` reads "A touch outside the
     5:16–5:22 /km window (5:41 /km)" and "+22s slow". The verdict tone is persisted
     (`RunSummary.tsx:989`) and feeds the A6 trigger (`easeWeekNudge.ts:47-61`), which
     produces "Take this week easier? 2 of your last 3 judged tempo sessions were slower
     than their pace window."
   - Tempo audio pace alerts fire during the warm-up (`Run.tsx:877-886` has no segment
     awareness).
   - Pace Insight (Pro) takes the best whole-run average of any run as a race effort
     (`runPaces.ts:429-510`). Through a base phase of easy runs it offers "Your saved
     targets may be too quick right now — VDOT 38.3 → 29.4" every week (sim).
   - The silent auto-derive likewise sets VDOT 29.4 for a 38.3 runner (sim).

4. **The marathon long run peaks low, and lowest for exactly the runners who give the app
   a benchmark.** The Run17 ceiling caps a long run at 150 minutes at the runner's easy
   pace (`runScheduler.ts:590-613`):

   | Runner                           | Marathon peak long run | Race / peak |
   | -------------------------------- | ---------------------- | ----------- |
   | Benchmarked, easy pace 6:34/km   | 20 km                  | 2.1×        |
   | Benchmarked, easy pace ≥ 7:40/km | 15 km                  | 2.8×        |
   | Same runners, no benchmark       | 25 km                  | —           |
   | Auto-derived benchmark accepted  | 15 km                  | —           |

   A "New to running" user at the 1-run/week default gets a single 25 km run (≈3.5 h).

5. **A 52-week marathon is mostly flat, then falls off a cliff.**
   - Weeks 1–20 are base: easy runs only, no quality. Volume moves 169 → 207 min
     (+22% in 5 months).
   - The long run sits at 15 km for 29 weeks (weeks 7–35; step-back weeks at 12 km).
   - The first tempo is already 30 min (the quality ramp is indexed on block progress,
     `runScheduler.ts:680-712`).
   - The taper drops volume 61% in one step, to 3 identical weeks with **no long run at
     all**. The last long run is 28 days before the race (`runScheduler.ts:727,1194`).
     The taper sharpener is 8×400 m at interval pace.
   - In every build week a 60–90-min medium-long sits the day before the quality
     session.

6. **The optional running baseline is a one-way ratchet.** It is a hard ceiling that
   "won't increase on its own" (`runningBaseline.ts:60-153`;
   `RunningBaselineSettings.tsx:120-127`). After 28 days it strips all quality.
   Re-confirming it from recorded runs **ratchets down**: 150 → 142 → 129 → 120 min/week,
   and the long run disappears by week 9. A runner who follows the plan can never grow
   it.

7. **Copy drift.**
   - The planner's compressed copy says "a shorter long-run progression"
     (`raceGoalPlanner.ts:249-250`). The cockpit records that wording as backwards: the
     compressed band doubles the long run.
   - Settings says "Lighter caps them at 10K" (`RunPlanSettings.tsx:849`). That is stale
     since Pgm6's 2026-08-02 rescale.
   - The tempo explainer claims "the pace comes from your fitness". That is false when
     there is no benchmark (4:30) and under A2 (goal pace).
   - The A2 label renders "20 min @ goal pace @ 6:03 /km" (`runSegments.ts:213-216`).
   - The race description says "All-out marathon effort" while the explainer says
     "start conservatively".
   - "Hard" has five different definitions across the app (§2.6).

8. **No one can see the plan beyond this week.** Only `weeks[0]` is ever persisted
   (`useProgram.ts:338`, `planBuilder.ts:596-600`). Runna shows the whole calendar.

---

## 1. Pipeline map

Column C classifies each stage: **P** = pure, **FS** = Firestore read/write from the
client, **CMD** = server program command (`applyProgramCommand`), **CF** = Cloud
Function (callable, trigger or scheduled).

| #   | Stage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Where (file:line)                                                                                                                                                                                                                                                                                                                | C            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | **Onboarding run inputs.** Frequency tier New/Occasional/Regular only sets the default runs/week: 1/2/3. `Free running` vs `Race prep`. Runs/week 1–7. Distance 5K/10K/Half/Full. Date with `min=today` and no max. Leg-trim toggle. Live preview from the same engine. **No benchmark, goal time, weekly volume or longest run.**                                                                                                                                                                     | `Onboarding.tsx:953-1011` (tiers), `:1017-1025` (mode), `:1028-1043` (runs/wk), `:1045-1068` (distance/date), `:1086-1093` (preview copy), `:1098-1124` (leg trim)                                                                                                                                                               | UI           |
| 2   | Legacy run-mode pass-through ("structured" → freeform on load)                                                                                                                                                                                                                                                                                                                                                                                                                                         | `onboardingRunMode.ts:15-18`; `useProgram.ts:639-641`                                                                                                                                                                                                                                                                            | P / FS       |
| 3   | **Run-mode resolution.** Freeform substrate vs race overlay, derived from `raceGoal`. JS mirror in functions.                                                                                                                                                                                                                                                                                                                                                                                          | `runModeResolution.ts:50` (`deriveRunMode`), `:94` (`resolveRecoveryExit`), `:129` (`setRaceGoalPatch`); `runPlanResolver.ts:209` (`resolveRunPlanSurface`); `functions/lib/runModeResolution.js`                                                                                                                                | P            |
| 4   | **Race goal planner.** Five states: empty/invalid/healthy/compressed/below-floor. Same generator as the save.                                                                                                                                                                                                                                                                                                                                                                                          | `raceGoalPlanner.ts:127` (`getRaceGoalPlannerState`), `:243-262` (copy); `RaceGoalPlanner.tsx`                                                                                                                                                                                                                                   | P            |
| 5   | **Week schedule.** Counts → weekday types. Runs and lifts alternate over slot order Mon, Wed, Fri, Tue, Thu, Sat, Sun.                                                                                                                                                                                                                                                                                                                                                                                 | `scheduleUtils.ts:111-176` (`generateSchedule`), `:287-302` (`planWeekSchedule`)                                                                                                                                                                                                                                                 | P            |
| 6   | **Plan build.** `buildPlan` → `buildRunPlan` → `generateRacePlanV2` → persists `weeks[0]` plus `runPlan{totalWeeks,currentWeek:0,compressed,belowFloor}`. Freeform: no runDays.                                                                                                                                                                                                                                                                                                                        | `planBuilder.ts:549-622` (`:557-559` freeform)                                                                                                                                                                                                                                                                                   | P            |
| 7   | **Persist plan.** Onboarding goes through the `completeOnboarding` callable (Admin SDK, `validatePlanPayload`). Settings does one `buildPlan` and one atomic `configurePlan`.                                                                                                                                                                                                                                                                                                                          | `Onboarding.tsx:618-628`; `RunPlanSettings.tsx:461,522`; `functions/index.js:937` (`configurePlan`); `functions/lib/validatePlanPayload.js`                                                                                                                                                                                      | CF           |
| 8   | **Generator** (whichever is live: V2). Phase per block week, long-run tier ramp, easy/medium-long ramp, quality ladder, strides, taper and race week, below-floor and detrained branches.                                                                                                                                                                                                                                                                                                              | `runScheduler.ts:954-1440` (`generateRacePlanV2`); `runPlanTiming.ts:13-18` (configs), `:40-68` (phases), `:70-103` (step-back), `:105-145` (floor, timing classes)                                                                                                                                                              | P            |
| 9   | **Placement.** Long run: weekend run-only → run-only → weekend both → both. Quality: a cyclic gap score avoids days next to the long run and prefers non-both days.                                                                                                                                                                                                                                                                                                                                    | `runScheduler.ts:91-110` (`pickLongRunSlot`); `runPlacement.ts:11-55` (`chooseQualityRunSlots`)                                                                                                                                                                                                                                  | P            |
| 10  | **Time limits.** Per-session and long-run minute caps → shorter template of the same type, or `easy_30`.                                                                                                                                                                                                                                                                                                                                                                                               | `runTimeLimits.ts:50-94` (`fitRunToTimeLimit`); applied at `runScheduler.ts:1417-1419`                                                                                                                                                                                                                                           | P            |
| 11  | **Running baseline** (optional, from Settings only). A ceiling on weekly minutes and longest run; easy-only unless experience is "regular" and the baseline is younger than 28 days.                                                                                                                                                                                                                                                                                                                   | `runningBaseline.ts:43-55,60-153`; applied at `runScheduler.ts:1420-1427`                                                                                                                                                                                                                                                        | P            |
| 12  | **Layoff input.** Last eligible run → none/gap/detrained, plus a 21-day re-entry window. Read from Firestore: 20 most recent runs.                                                                                                                                                                                                                                                                                                                                                                     | `layoffDetection.ts:52-79,124-200`; `fetchRecentLayoff.ts:30-64`                                                                                                                                                                                                                                                                 | P + FS       |
| 13  | **Weekly regeneration.** On load, `raceWeekNeedsBuilding` → `regenerateRacePlan`. Monday auto-rollover loops up to 12 weeks: `nextRunWeek` → `regenerateRacePlan`, carrying `currentWeek+1` and `planTotalWeeks`. The recovery branch is `scheduleRecoveryWeekV2`. Writes through `commitProgramTransition`/`saveProgram`, a whole-document write; this sits outside the command boundary (ADR-0011).                                                                                                  | `useProgram.ts:251-378` (`regenerateRacePlan`), `:384-437` (`nextRunWeek`), `:637-682` (load), `:1185-1290` (rollover); `programMaintenance.ts:40-59`; `programTransition.ts:30`                                                                                                                                                 | P → FS       |
| 14  | **Stored rows.** `programState.runDays` holds the **current week only**. `runPlan` holds a mirror of raceGoal, totalWeeks, currentWeek, compressed, belowFloor, phase/recoveryEndDate and completedRaces. Also `manualCompletions`, `easeSnapshot`, `pendingFellBehindPrompt`.                                                                                                                                                                                                                         | `programTypes.ts:472-512` (`ScheduledRunDay`), `:558-` (`RunPlan`)                                                                                                                                                                                                                                                               | FS           |
| 15  | **Home display.** Today card (name + "about N min", no rationale). Week strip (circles, a11y "run day"). Day peek (description + "Why this run"). Rest-day card ("Tomorrow: Long 15K.").                                                                                                                                                                                                                                                                                                               | `RunCTACard.tsx:40-47,65-67,83-87,120-131`; `WeekStrip.tsx:89-120`; `DayPeekCard.tsx:310-323,539-552`; `RestDayCard.tsx:42-47`; `todaySession.ts:229-275`                                                                                                                                                                        | P (view)     |
| 16  | **Programme display.** Race cockpit (week N of M, PhaseRail, compressed/below-floor note). Week selector (compact labels). Selected-day `SessionCommandCard` (meta: week label · dose · pace band · HR zone · type word) plus "Why this run". Manage sheet (`DayActionSheet`).                                                                                                                                                                                                                         | `ProgrammeRunSection.tsx:690-713,771-835,1495-1555`; `RaceCockpitCard.tsx:150-258`; `PhaseRail.tsx:17`; `runProgrammeViewModel.ts:70-93`; `DayActionSheet.tsx:196-385,440-461`                                                                                                                                                   | P (view)     |
| 17  | **Launch.** `computePlanMetadata` → `templateToPrefill` (target, intervals.workPace, segments, A2 enrichment) → `RunLaunchCard` (fast path) or `RunSetupModal` ("Customise": chooser plus structure preview) → `finalisePlanMetadata`.                                                                                                                                                                                                                                                                 | `Run.tsx:613-627,1271-1300`; `runPlanMetadata.ts:298-549,759-887`; `RunLaunchCard.tsx:57-167`; `RunSetupModal.tsx:503-523,1300-1320`                                                                                                                                                                                             | P            |
| 18  | **In-run.** `useSessionPlayer` walks `SessionSegment[]`. `IntervalStepShell` shows step, eyebrow and band. Audio: splits, segment cues, tempo pace alerts, halfway/final for distance targets. `PaceZoneBar` appears for tempo/intervals. Guided runs use `GuidedRunOverlay`.                                                                                                                                                                                                                          | `useSessionPlayer.ts:71-162`; `Run.tsx:425-457,860-897,1036-1052,1614-1624,1765-1810`; `IntervalStepShell.tsx:57-85`; `runSegments.ts:116-376`; `runCueCopy.ts`; `useAudioCues.ts:232-277`                                                                                                                                       | P (view)     |
| 19  | **RunSummary.** Save through `completeRun` (durable offline queue → `users/{uid}/runs`). Hero "{name} complete ✓". Pace verdict. Pace Insight (Pro). "How did it feel?" check-in. Off-plan reconciliation. Share.                                                                                                                                                                                                                                                                                      | `RunSummary.tsx:669-670,758-813,989,1343-1363,1684-1700,1765-1790`; `runCompletion.ts:245-282`; `paceVerdict.ts:43-124`                                                                                                                                                                                                          | FS           |
| 20  | **Scheduled-run completion.** Client claim map matches by date + quality/easy bucket, then day-late. Manual complete, skip, move and override go through server commands. Server `onRunCreated`: recovery entry if a race run on race day covers ≥95% of the distance; also lastActiveAt, challenges, fastest efforts, lifetime stats, PI recompute. `dailyRaceReconciliationSweep` (04:00 UTC): `race_no_show` at T+3, recovery exit at recoveryEndDate+7d.                                           | `scheduledRunCompletion.ts:214-278`; `useClaimMapForProgram.ts:224`; `functions/index.js:4947` (`onRunCreated`), `:3918` (`_decideRecoveryEntry`), `:3835` (sweep), `:3432` (grace 3 d); `functions/lib/programCommands.js:2313-2341`                                                                                            | P + CMD + CF |
| 21  | **Saved runs.** One reader: query ordered by `completedAt`, Lift3 day, queued local runs.                                                                                                                                                                                                                                                                                                                                                                                                              | `savedRuns.ts:167-363` (`fetchSavedRuns`, `SAVED_RUNS`); `useSavedSessions`                                                                                                                                                                                                                                                      | FS           |
| 22  | **Fitness and paces.** Benchmark → VDOT → bands. Consent gate. Auto-derive (once, pending). Pace Insight (Pro). Manual entry. The scheduler reads only `planningEasyPaceSPerKm`.                                                                                                                                                                                                                                                                                                                       | `runPaces.ts:92-107,145-152,222-267,354-388,429-510`; `useRunFitnessAutoDerive.ts:22-88` (mounted `Program.tsx:196`); `usePaceInsight.ts`; `RunFitnessSection.tsx:58`                                                                                                                                                            | P + FS       |
| 23  | **Adaptation.** "Adjust this week": ease = `planEasierWeek` → `applyEaseWeek` **CMD** with snapshot and undo (Run16); re-plan = `realignRacePlan` (client regen + FS write). Ease-week nudge: effort ratings, A6 pace misses, short sessions (pure + local markers). Fell-behind: `weeklyFellBehindCheck` **CF** (Mon 05:00 UTC; run COUNT < 50% of target) → `FellBehindSheet` (detrained register "Welcome back"). Re-entry: layoff → generator. Long-run ceiling: Run17. Easy-run guarantee: Run18. | `adjustWeek.ts`; `AdjustWeekSheet.tsx:119-126,385-551`; `useProgram.ts:3132` (`applyEaseWeek`), `:3420` (`realignRacePlan`); `programCommands.js:1882,1935`; `easeWeekNudge.ts:39-121,205`; `EaseWeekNudgeCard.tsx:46-70`; `functions/lib/fellBehindWeek.js:18,62-157`; `functions/index.js:7164`; `FellBehindSheet.tsx:115-189` | P / CMD / CF |

---

## 2. Session types and how they are explained

### 2.1 Inventory: internal key → user-facing label

The scheduler emits only these keys. Source is `workoutTemplates.ts:37-380` unless noted.

| Internal key(s)                                        | Label (template `name`)     | `type`    | Description (exact copy)                                                                                                                                                                                     | Who emits it                                                                             |
| ------------------------------------------------------ | --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `easy_30`, `easy_40`, `easy_50`                        | Easy 30 / Easy 40 / Easy 50 | easy      | "Conversational pace — recovery day" / "— steady aerobic" / "— aerobic base"                                                                                                                                 | Easy ladder (`runScheduler.ts:256-267`)                                                  |
| `easy_10`, `easy_20`                                   | Easy 10 / Easy 20           | easy      | "A short run at conversational effort" / "An easy run at conversational effort"                                                                                                                              | Only the baseline and time-limit fitters                                                 |
| `easy_30/40/50_strides`                                | "Easy 30 + strides" etc.    | easy      | "Conversational pace; finish with 4 × 20s strides — relaxed fast, walk back between"                                                                                                                         | One per base/build week (§2.5)                                                           |
| `easy_60`                                              | **Easy 60**                 | easy      | "Conversational pace — steady aerobic volume"                                                                                                                                                                | Medium-long slot (RUN-EV-11)                                                             |
| `easy_75`, `easy_90`                                   | **Medium-long 75 / 90**     | easy      | "Easy pace, longer midweek run — aerobic depth" / "…longest midweek run — marathon aerobic depth"                                                                                                            | Medium-long slot                                                                         |
| `tempo_20/30/40`                                       | 20/30/40 Min Tempo          | tempo     | "5 min warmup → 20 min tempo → 5 min cooldown" … "10 min warmup → 2×20 min tempo, 3 min float → 5 min cooldown"                                                                                              | Build quality ladder                                                                     |
| `4x1k`, `5x1k`, `6x1k`                                 | N×1K Intervals              | intervals | "**4 reps of 1 km hard** with 90s rest" (no warm-up mentioned, though one exists)                                                                                                                            | Build quality ladder                                                                     |
| `8x400`                                                | 8×400m **Speed**            | intervals | "8 reps of 400m with 60s rest"                                                                                                                                                                               | Taper sharpener only (`runScheduler.ts:1355-1363`)                                       |
| `long_6k` … `long_25k` (`long_30k` is never scheduled) | Long 6K … Long 25K          | long      | 6/8K "Easy effort, time on feet"; 10/12K "Easy-to-moderate effort…"; 15K "**Steady, controlled effort**"; 20K "Extended aerobic effort — half-marathon specific"; 25K "Long aerobic effort — marathon build" | Long ladder (`runScheduler.ts:200-213`)                                                  |
| `5k_race` … `marathon_race`                            | 5K Race … Marathon Race     | race      | "**All-out** 5 km effort" … "All-out marathon effort"                                                                                                                                                        | Race week                                                                                |
| (recovery phase)                                       | Easy 30 every run day       | easy      | as `easy_30`                                                                                                                                                                                                 | `scheduleRecoveryWeekV2` (`runScheduler.ts:818-838`)                                     |
| (A2) long run with a race-pace finish                  | the long template name      | long      | segments "Easy 13 km" → "7 km @ 6:03 /km" with eyebrow **RACE PACE**                                                                                                                                         | `runPlanMetadata.ts:783-789,877-885` (half/marathon, build phase, ≥12 km, goal time set) |
| (A2) tempo at goal pace                                | "20 Min Tempo" (unchanged)  | tempo     | segment "20 min @ goal pace @ 6:03 /km"                                                                                                                                                                      | `runPlanMetadata.ts:777-782,836-841`                                                     |

Run-adjacent vocabularies:

- **Freeform chooser** (`runConfigDefaults.ts:165-245`): "Free Run · Run at your own pace", "Easy Run · **Recovery pace**", "Tempo Run · Sustained effort", "Intervals · Repeats + rest", "Long Run · Distance-focused", "Race · All-out effort", "Treadmill", "Guided".
- **Guided runs** (`guidedRun.ts:59-230`; freeform only):
  - "Easy 30". The name collides with the template "Easy 30".
  - "Build Speed" (a progressive tempo).
  - "**Hard & Fast**": "Sprint 1…5", each 60 s at "90% effort".
  - Difficulty shows as Beginner/Intermediate/Advanced (`GuidedRunPicker.tsx:10-14`).
- **Phase words**: "Base · Build · Taper · Race" (`PhaseRail.tsx:17`). The week label "Build · week 9 of 52" (`runSessionExplainer.ts:46-49`). Planner: "Full Base → Build → Taper → Race progression…" (`raceGoalPlanner.ts:244-245`).
- **In-run eyebrows** (`IntervalStepShell.tsx:73-85`): the raw segment type is upper-cased, giving **WARMUP, EASY, MODERATE, COOLDOWN**, plus REP n/N, AFTER REP n/N, BLOCK n/N and RACE PACE. Tempo work shows "MODERATE".
- **HR chips**: "Z2 · 111–129 bpm" with no zone name, by intensity easy/long→Z2, tempo→Z4, intervals→Z5, race→Z4 (`hrZones.ts:27-33,102-109`).
- **Settings knobs**: "Lighter/Standard/Bigger", "Gentler/Standard/**Harder**" (`RunPlanSettings.tsx:846-873`).
- **Post-run**:
  - "How did it feel? Easier / About right / **Harder**" (`RunSummary.tsx:1684-1700`).
  - Titles "Easy Run / Tempo Run / Intervals / Long Run / Race / Free Run / Guided Run" (`runLabels.ts:294-318`).
  - Feed post name "Interval Run / Guided Run / Run" (`runCompletion.ts:164-171`).

### 2.2 The explainer: every line, its callers, where it renders

`runSessionExplainer.ts:54-116` returns null without plan context. Lines by phase × type:

- **Race week**
  - race: "Race day. The whole block pointed here — trust the plan and start conservatively."
  - other: "Race-week shakeout — short and conversational; there's nothing left to gain from more."
- **Taper**
  - intervals: "Taper sharpener — fast but small, keeping the legs quick while the volume drops."
  - long: "Taper long run — shorter on purpose…". **Unreachable for generated rows.** In taper the long slot is emitted as `easy_30` with `type:"easy"` (`runScheduler.ts:727,1194`).
  - otherwise: "Taper — easy and short on purpose; recovery is the work now."
- **Base / build**
  - long: "The week's anchor run — long-run volume ramps gradually through the base." / "…the long run keeps ramping while quality sharpens around it."
  - tempo: "Tempo — grows how long you can hold your threshold pace. The pace itself comes from your fitness, so the session ramps volume, not speed." This is false with no benchmark (4:30 template pace) and false under A2 (goal pace).
  - intervals: "Intervals — short fast repeats for top-end economy. The recovery between reps is part of the session, not a failure of it."
  - medium-long (`easy_60/75/90`): "The week's medium-long run — extra easy volume midweek, so the long run isn't carrying the whole week."
  - strides: "Easy day with strides — relaxed 20-second accelerations keep leg speed awake at almost no cost. Not a hard session."
  - easy: "Base phase — easy aerobic volume is the foundation everything later stands on." / "Easy day — it makes the hard days work. If it feels too easy, it's right."

Callers. All of them render the line through `RunPurpose` → `PurposeDisclosure`, closed by default:

1. `Run.tsx:1276-1285` → `RunLaunchCard.tsx:143`
2. `ProgrammeRunSection.tsx:771-782` → `RunPlanPurpose` at `:1546-1550`. The week label also appears as a meta chip at `:1529-1531`.
3. `DayActionSheet.tsx:240-255` → `RunPlanPurpose` at `:362-366`
4. `DayPeekCard.tsx:312-323` → `:552`. Race plans only.

**Not rendered on:** Home today card (pinned absent), rest-day card, week strips, setup modal, in-run, RunSummary, RunDetail, feed/share, notifications, Weekly Review, or any freeform run.

`RunPlanPurpose.tsx` adds up to three more lines inside the same disclosure:

- baseline reason: "Easy running matches the starting point you chose." / "…until you review your current training." / "This session was shortened to fit the recent running you confirmed."
- time-limit line
- "Another demanding run is planned for {day}…"

In the simulated 52-week marathon, the base easy line repeats 40×. The build-easy line ("it makes the hard days work") is the most-shown easy copy across scenarios.

### 2.3 Label × surface matrix

Legend:

| Code | Meaning                                     |
| ---- | ------------------------------------------- |
| N    | name/label only, no explanation             |
| D    | template description shown                  |
| W    | "Why this run" (collapsed)                  |
| P    | pace band, **benchmark only**               |
| Z    | HR zone chip                                |
| S    | structure shown                             |
| ⚠    | explanation missing, wrong or contradictory |

| Label                        | Home today                                 | Home peek                                 | Rest-day "Tomorrow" | Week strip                 | Programme day card                                               | Manage sheet                  | Launch card                                         | Setup modal (Customise)                                                                           | In-run                                                             | Audio                                                               | RunSummary                                      | RunDetail / feed             |
| ---------------------------- | ------------------------------------------ | ----------------------------------------- | ------------------- | -------------------------- | ---------------------------------------------------------------- | ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------- |
| Easy N                       | N "About 40 min" ⚠                         | D+W                                       | N                   | "40m" ⚠                    | D+W+P+Z + type word "Easy"                                       | D+W+P+Z                       | D+W (no pace even with a benchmark)                 | chooser "Easy Run · Recovery pace" ⚠ (Z2 is "Easy", Z1 is "Recovery")                             | **nothing**: no time target, no countdown ⚠                        | km splits only                                                      | "Easy 40 complete ✓" + verdict (P)              | "Easy Run" / "Run"           |
| Easy N + strides             | N                                          | D+W                                       | N                   | "30m": strides invisible ⚠ | D+W+P+Z                                                          | D+W                           | D + "30 min total, including strides" + W           | S: "Easy 25 min / Stride 1 of 4 · 20s · Relaxed fast — smooth, not sprinting / Walk back · 1 min" | S: EASY → "REP 1/4" "Stride 1 of 4" → "AFTER REP 1/4" "Walk back"  | "Stride 1 of 4. Relaxed and fast." / "Walk it back. Full recovery." | hero                                            | "Easy Run"                   |
| Easy 60 / Medium-long 75/90  | N ("Easy 60" vs "Medium-long 75" naming ⚠) | D+W                                       | N                   | "60m/75m/90m"              | D+W+P+Z                                                          | D+W (+ fuelling line ≥75 min) | D+W                                                 | —                                                                                                 | nothing ⚠                                                          | splits                                                              | hero                                            | "Easy Run"                   |
| N Min Tempo                  | N                                          | D+W                                       | N                   | "Tempo"                    | D+W+P(T band)+Z4                                                 | D+W+P                         | "4:30 /km" (no benchmark) ⚠ + D + W                 | S: Warm-up / "20 min tempo @ 4:30 /km · Comfortably hard — hold the rhythm" / Cool-down           | WARMUP → **MODERATE** ⚠ → COOLDOWN; PaceZoneBar on whole-run avg ⚠ | "Tempo. Comfortably hard…"; pace alerts during the warm-up ⚠        | "A touch outside the window" on a perfect run ⚠ | "Tempo Run" / "Run"          |
| N×1K Intervals               | N                                          | D ("1 km hard") ⚠ + W                     | N                   | "5×1K"                     | D+W+P(I band)+Z5                                                 | D+W+P                         | "5 × 1K · 4:49 /km" (no pace without a benchmark ⚠) | S per rep                                                                                         | "REP 2/5" "1K @ 4:49 /km" / "1K" with no benchmark ⚠               | "Rep 3 of 5. Two to go… Hold the effort."                           | primary stat "N × 1K @ pace"; no verdict        | "Intervals" / "Interval Run" |
| 8×400m Speed (taper)         | N                                          | D+W ("Taper sharpener")                   | N                   | "8×400"                    | D+W+P (**I** band, not R) ⚠                                      | same                          | same                                                | S                                                                                                 | same                                                               | same                                                                | same                                            | same                         |
| Long NK                      | "15 km · about 80 min" (nominal minutes ⚠) | D+W                                       | N                   | "15K"                      | D ("Steady, controlled effort" ⚠ vs easy band) + W + P + Z2      | D+W+P (+ fuelling)            | "15 km" + D + W                                     | —                                                                                                 | distance target, halfway + final 500 m cues                        | halfway/final                                                       | verdict vs **easy** band                        | "Long Run"                   |
| Long + race-pace finish (A2) | N                                          | D+W (no mention of the race-pace block ⚠) | N                   | "20K"                      | as Long                                                          | as Long                       | as Long                                             | S: "Easy 13 km / 7 km @ 6:03 /km"                                                                 | S: RACE PACE                                                       | "Race-pace block. 7 kilometres…"                                    | verdict vs easy band (sim: "on target")         | —                            |
| Race                         | N                                          | D+W                                       | N                   | "Race"                     | D ("All-out…" ⚠) + W ("start conservatively") + race pace + Z4 ⚠ | race-day variant              | D+W                                                 | —                                                                                                 | distance target                                                    | halfway/final                                                       | finish time                                     | "Race"                       |
| Phase words                  | —                                          | —                                         | —                   | —                          | chip "Build · week 9 of 52" with no definition ⚠                 | —                             | eyebrow "Race prep · Week 9 of 52"                  | —                                                                                                 | —                                                                  | —                                                                   | —                                               | —                            |
| HR zone                      | —                                          | —                                         | —                   | —                          | "Z2 · 111–129 bpm" with no zone name ⚠                           | same                          | —                                                   | —                                                                                                 | live zone                                                          | —                                                                   | zone bars                                       | —                            |

Notifications and Weekly Review never name a session type. The only run push is "Let's realign this week 🎯" (`functions/lib/pushSend.js:135-136`). The Weekly Review counts runs and km.

### 2.4 Which vocabularies exist

| Word        | Exists?                                      | Where                                                                                   |
| ----------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| easy        | Yes                                          | `easy_*`                                                                                |
| hard        | **Not a session type.** Five meanings (§2.6) | —                                                                                       |
| strides     | Yes                                          | `easy_*_strides`                                                                        |
| tempo       | Yes                                          | `tempo_20/30/40`                                                                        |
| intervals   | Yes                                          | `4/5/6x1k`, `8x400`                                                                     |
| long        | Yes                                          | `long_6k`…`long_25k`                                                                    |
| recovery    | Not a run type                               | Post-race phase of `easy_30`s; Z1 name; "Recover" segment; easy chooser "Recovery pace" |
| race pace   | A2 only                                      | Half/marathon with a goal time: long-run finish + goal-pace tempo                       |
| progression | **No**                                       | Only guided "Build Speed", freeform-only                                                |
| hills       | **No**                                       | —                                                                                       |
| fartlek     | **No**                                       | —                                                                                       |

Also present: **medium-long** and **speed** (8×400). Absent: cruise intervals, marathon-pace runs without A2, and a planned recovery-run type.

### 2.5 What a "strides" session is in this code

- **Template.** `easy_30/40/50_strides` (`workoutTemplates.ts:86-119`): type `easy`, duration equal to the base tier, `config.strides = {reps: 4, workSeconds: 20}`.
- **Dose.** 4 × 20 s "Relaxed fast — smooth, not sprinting", each followed by a 60 s walk-back (`STRIDE_RECOVERY_SECONDS`, `runSegments.ts:102`). The block is carved out of the stated minutes: Easy 30 + strides = "Easy 25 min" + 4 × (20 s + 60 s) (`runSegments.ts:253-293`). There is no pace for strides; no band is passed (`Run.tsx:447-454`).
- **Placement.** Exactly one per base/build week, on the second remaining easy slot (`i === 1`), after the medium-long slot (`runScheduler.ts:1237-1251, 1310-1328, 1333-1347`). The 3-days-or-more requirement follows:

  | Week                       | Strides?                                        |
  | -------------------------- | ----------------------------------------------- |
  | 4-run week                 | strides on day 3                                |
  | 3-run base week            | strides                                         |
  | 3-run build week           | **none** (slots are quality, medium-long, long) |
  | 2-run week                 | none                                            |
  | detrained runner           | none                                            |
  | taper / race / below-floor | none                                            |

  Only the `easy_30/40/50` tiers have a strides variant (`stridesVariantOf`, `runScheduler.ts:649-660`).

- **Player.** Segments run through `useSessionPlayer` and `IntervalStepShell`: eyebrow EASY → REP n/4 → AFTER REP n/4; audio "Easy running. Conversational pace — strides at the end." → "Stride 1 of 4. Relaxed and fast." → "Walk it back…"; a haptic on every stride and every walk-back (`Run.tsx:1051`).
- **Baseline interaction.** The baseline's easy-only mode counts strides as "hard" and strips them (`runningBaseline.ts:119-121`).
- **Visibility.** The week strip collapses strides to "30m" (`runProgrammeViewModel.ts:75-76`). The structure preview exists only in "Customise".

### 2.6 Every "hard", and what it means there

1. **"4 reps of 1 km hard with 90s rest"** (`workoutTemplates.ts:206,222,238`). This is VO2max/interval effort and is never defined. No pace is shown without a benchmark.
2. **"Comfortably hard — hold the rhythm"** and the cue "Tempo. Comfortably hard…" (`runSegments.ts:218-235`). This means threshold, and it appears only in-run or in "Customise".
3. **Guided "Hard & Fast"**, with difficulty "hard" shown as "Advanced", plus "Increase pace — comfortably hard" and "push hard!" (`guidedRun.ts:113,143-230`; `GuidedRunPicker.tsx:10-14`).
4. **"Hard session(s)" as the quality family** (tempo/intervals):
   - Planner: "fewer hard sessions" / "no hard sessions" (`raceGoalPlanner.ts:250,259`).
   - Cockpit (`RaceCockpitCard.tsx:216-224`) and realign (`realignCopy.ts:37`).
   - Explainer: "Not a hard session", "it makes the hard days work".
   - Verdict: "save it for the hard sessions" (`paceVerdict.ts:107-108`).
5. **"Hard run" on the lift side.**
   - `isHardRun` = ≥8 km **or ≥45 min** or tempo/intervals/long (`hybridGuidance.ts:18-34`). An "Easy 50" or "Medium-long 75" therefore counts as hard. The lift chooser then says "**Recommended — hard run yesterday, and this session loads the same legs**" (`easierToday.ts:133-138`), and a leg-lift miss counts half (`sessionCompletion.ts:123-130`; `liftRules.ts:106`).
   - The run plan itself calls `HARD_RUN_TYPES` = long/tempo/intervals/race (`programTypes.ts:416-421`). That set drives `clashesWithLift`, "demanding run" (`runSpacing.ts:10-17`) and `legsBefore` ("Your {long run|tempo run|interval session|hard run} is the next day…", `liftSessionPurpose.ts:123,129-158`).
6. **Internal segment type `"hard"`.** Strides and interval reps carry it; the eyebrow would read "HARD" only for a hard segment with no rep number, which no builder produces.
7. **"Hard session" day-intensity label.** It is computed (`dayIntensity.ts:105-117`) but the Food caption was removed (`FoodHeroCard.tsx:217-222`), so it is dead copy.
8. **"Harder"** as the intensity knob (`RunPlanSettings.tsx:872`) and as the post-run rating (`RunSummary.tsx:1691`). It feeds the Run14 nudge "harder than expected".

---

## 3. Paces

**Model** (`runPaces.ts`):

- One benchmark `{distanceM, timeS}` gives a VDOT through the Daniels–Gilbert oxygen-cost and drop-off formulas (`:60-107`).
- Bands are %VO2max ranges (`:145-152`): easy 62–72%, marathon 81–85%, threshold 86–88%, interval 97–100%, repetition 105–110%.
- Race paces use Riegel with exponent 1.06 (`:172-192`).
- There is no critical-speed model and no lookup table; it is all formula.
- A VDOT-only fitness synthesises an equivalent 5K (`:297-340`).

**Sources of the benchmark**, in practice:

1. Manual entry in Settings → Run fitness.
2. **Silent auto-derive**, once, when `runFitness` is absent and there are ≥3 pace-eligible outdoor runs in the last 90 days. It takes the run whose whole-run average implies the **highest VDOT** (≥2 km) and writes `pendingConfirmation: true` (`useRunFitnessAutoDerive.ts:22-88`; `runPaces.ts:466-510`; mounted on Programme, `Program.tsx:196`).
3. **Pace Insight**, Pro only: ≥3 runs and |ΔVDOT| ≥ 1.5, faster **or slower**. Accepting writes `pendingConfirmation:false` (`runPaces.ts:429-457`; `usePaceInsight.ts`; `PaceInsightCard.tsx:66-68`).
4. The A2 goal time (`RunPlanSettings.tsx:198,492,740`; Settings only, not onboarding). It drives half/marathon goal-pace tempos and long-run blocks. It is gated off as a "long shot" when the goal VDOT is more than 4 above the current one (`runPlanMetadata.ts:728-740`).

**Consent tier.** `prescriptivePaceTableFromFitness` returns null while a derived benchmark is pending (`runPaces.ts:246-251`). Every prescription site uses it. Measurement sites (verdict, predictions, settings grid) use the full table.

**No benchmark:**

- easy/long: no pace anywhere (`resolveSessionPaces`, `runPaces.ts:379-384`)
- tempo: **4:30/km** for everyone (template `targetPace: 270`)
- intervals: no pace; labels read "1K", and PaceZoneBar falls back to **5:00/km** (`Run.tsx:1619-1621`; `runConfigDefaults.ts:134` `target:{type:"none"}`)
- HR zones still show from the age estimate 208 − 0.7 × age (`hrZones.ts:48-51`)

**How paces update after runs:** they don't. A prescription never changes automatically (RUN-EV-08). Free users get one pending derive and manual entry; Pro users get insights. The plan's paces don't respond to training unless the person accepts a change.

Measured problems (sim, 5K 25:00 runner, true VDOT 38.3):

- The auto-derive from the first week's easy and long runs gives **VDOT 29.4**. Its easy pace is 8:04/km against a true 6:34/km.
- Pace Insight shows a **"slower" suggestion every week** of the 20-week base (38.3 → 29.4…30.7). It flips to "faster" only once tempos appear (34.9 → 37.6) and reaches the true value only on race day.
- Accepting the derived or insight value lowers `planningEasyPaceSPerKm`, which lowers the Run17 ceiling. The marathon peak long run drops to **15 km**, as in (a-derived-accepted).

**How paces reach the screen:**

| Surface                             | What it shows                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Programme day card and Manage sheet | `sessionPaceDisplay`, band first (`runLabels.ts:104-118`; `ProgrammeRunSection.tsx:790-803`; `DayActionSheet.tsx:206-226`) |
| Launch card                         | Target pace only for tempo; "N × 1K · pace" for intervals; nothing for easy or long (`RunLaunchCard.tsx:81-85,133-137`)    |
| Setup chooser                       | `chooserPaceFor`                                                                                                           |
| In-run headline                     | Band for tempo/intervals (`Run.tsx:447-454`; `IntervalStepShell.tsx:57-71`)                                                |
| PaceZoneBar                         | Whole-run average ⚠                                                                                                        |
| Audio                               | Tempo pace alerts on a 30 s rolling pace, ignoring segment ⚠                                                               |
| RunSummary                          | Verdict on the whole-run average ⚠                                                                                         |

**Scheduler use:** only the confirmed easy midpoint (`planningEasyPaceSPerKm`, `runPaces.ts:259-267`) for the 150-minute ceiling and the minute math in the time-limit and baseline fitters.

---

## 4. Week composition

- **Distances.** 5K, 10K, half and marathon only (`runPlanTiming.ts:13-18`). There is no ultra.
- **Runway.**

  | Distance | Ideal (`minWeeks`) | Taper-safe floor (taper + 1) |
  | -------- | ------------------ | ---------------------------- |
  | 5K       | 4                  | 2                            |
  | 10K      | 6                  | 2                            |
  | Half     | 8                  | 3                            |
  | Marathon | 12                 | 4                            |

  Classes are healthy / compressed / below-floor (`runPlanTiming.ts:105-145`). **There is no maximum.** A 52-week marathon is "Good runway" and gets a 20-week base (sim). Below the floor, every non-race week is three `easy_30`s and nothing else (Run15 correction).

- **Days per week.** 1–7 are allowed by both onboarding and settings (`Onboarding.tsx:1037-1038`; `RunPlanSettings.tsx:789,804`). The comment at `runScheduler.ts:1017-1018` ("race_prep requires at least 2 runs per week and the UI enforces it") is false. A 1-day week is the long run alone; a 2-day week is long + quality or easy (Run18).
- **Phases** (`runPlanTiming.ts:50-68`):
  - race = the last week
  - taper = the 1/1/2/3 weeks before it
  - base = the first 40% of pre-taper weeks
  - build = the rest
  - step-back every 4th ramp week, never the peak (`:70-86`), at ×0.75 on long km, easy minutes and quality volume (`runScheduler.ts:379`)
- **Long run.**
  - Tiers are 6/8/10/12/15/20/25 km; `long_30k` is never scheduled (`runScheduler.ts:200-244`).
  - The base long run is the config `baseLongKm` snapped down: 5K 4 → **6 km floor**, 10K → 6, half → 10, marathon 14 → **12**.
  - The ramp is linear to `min(volume-adjusted peakLongKm, ceiling × 1.1)`, where the ceiling is the largest tier with km × easy pace ≤ 150 min at the confirmed pace, or nominal minutes without one (`runScheduler.ts:475-524,590-636`).
  - Measured ceiling: 5:00/km → 30 km; 5:30–6:00/km → 25; 6:34–7:30/km → 20; ≥7:40/km → 15; no benchmark → 25.
  - **Taper and race weeks have no long run** (`runScheduler.ts:727`).
- **Easy and medium-long.**
  - Easy runs ramp 30 → 50 min.
  - One medium-long ramps 30 → 50/60/75/90 min (5K/10K/half/marathon) (`runScheduler.ts:256-300,534-579`).
  - Taper, race and below-floor weeks are all `easy_30`.
- **Quality.**
  - Base: none.
  - Build: one session, alternating tempo (even block week) and intervals (odd).
  - Volume ramps to a peak held from 70% of the ramp (`runScheduler.ts:337-375,680-712`): tempo peaks at 20/30/40/40 min and intervals at 6 reps for all distances.
  - Taper: `8x400` (`runScheduler.ts:1349-1385`).
  - Compressed: hard cap and skip rules (`:1200-1230`). Detrained: no quality at all (`:1228`).
- **Intensity distribution** (sim, marathon peak). Tempo week: 40 of 297 min at threshold (13%). Interval week: about 9%. Base weeks: 100% easy plus 4×20 s strides.
- **Pgm6 knobs** (`runScheduler.ts:147-185,396-414,1211-1230`):
  - volume `lighter` = ×0.75 of the distance's peak and a lighter easy ramp
  - volume `bigger` = ×1.25, clamped
  - difficulty `gentler` = tempo-only quality every other build week, held at the base rung, no taper quality
  - difficulty `harder` = a second quality session in uncompressed build weeks with ≥4 run days (Run18)
  - Settings copy "Lighter caps them at 10K" is stale (`RunPlanSettings.tsx:849`).
- **Freeform** generates **nothing**: no runDays and no runPlan (`planBuilder.ts:557-559`; `useProgram.ts:432-437`). It offers an optional weekly goal of runs or minutes with progress (`nonRaceGoal.ts`), a cadence line, guided runs and one-tap tiles. The Intervals tile is unstructured without a benchmark; with one it is 5×1 km straight in, with **no warm-up** (`runConfigDefaults.ts:142-146,266-285`). There is **no progression over 16+ weeks** and no plan.

---

## 5. Run ↔ lift coupling

| Rule                                                                         | Mechanism (file:line)                                                                                                                                                        | What the person sees                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hard runs prefer run-only days                                               | `pickLongRunSlot` (`runScheduler.ts:91-110`); `chooseQualityRunSlots` both-day penalty (`runPlacement.ts:32-44`)                                                             | Nothing, unless forced                                                                                                                                                                                                                                                                    |
| `clashesWithLift`                                                            | Hard types on a "both" day are flagged (`runScheduler.ts:1407-1437`)                                                                                                         | Week-strip dumbbell + ", shares a day with lifting". Manage sheet: "Quality run and a lift share this day — if recovery's tight, go easier on one of them." (`DayActionSheet.tsx:330-339`; `runProgrammeViewModel.ts:104-114`). Planner/onboarding: "Some days include a lift and a run." |
| Lift lighter weeks follow the run step-backs (`raceLighterWeeks`, Lift4 (9)) | `calendarLighterWeek` → `isRunStepBackWeek` (`weekPrescription.ts:182-189`; `runPlanTiming.ts:94-103`); the rollover computes the run week first (`useProgram.ts:1240-1262`) | Lift purpose: "Your lighter weeks fall on your run plan's easier weeks." / "This is the last full week before a lighter one…" / "This is a lighter week, with half the sets at the same weights…" (`liftSessionPurpose.ts:106-213`)                                                       |
| `raceLegTrim` (Lift4 (10))                                                   | Leg lifts −⅓ sets from the run build until the two lighter race weeks; the marathon's first taper week included (`weekPrescription.ts:159-176`; `programEngine.ts:2651`)     | Onboarding/settings toggle "Lighten leg sessions while your runs build — A third fewer sets on leg lifts…". Lift purpose: "Your leg lifts have a third fewer sets… as you chose."                                                                                                         |
| Race final weeks                                                             | Two lighter lift weeks before the race, race week one short session, the week after light (`weekPrescription.ts:131-157`)                                                    | `RACE_TAPER` / `RACE_WEEK` ("one short session, with nothing heavy for your legs. Lift by {date}, three days before the race.") / `RACE_AFTER`                                                                                                                                            |
| `raceRest`                                                                   | The last 2 days and race day: unfinished lift sessions are skipped through the `skipWorkoutDay` command (`raceRest.ts:21-50`)                                                | The day shows skipped once it arrives                                                                                                                                                                                                                                                     |
| Heavy legs before a long/key run                                             | Note only; nothing moves (`liftSessionPurpose.ts:123,129-158,279-287`)                                                                                                       | "Your long run is the next day, and heavy leg work can leave your legs tired for it."                                                                                                                                                                                                     |
| `easierToday`                                                                | Hard run (`isHardRun`) yesterday + a lower-body day → Recommended (`easierToday.ts:123-138`; `useEasierTodayRecommendation.ts:43-62`)                                        | "Recommended — hard run yesterday, and this session loads the same legs". Fires after an Easy 50 too.                                                                                                                                                                                     |
| `afterHardRun`                                                               | A leg miss within 24 h after a long/hard run counts half (`sessionCompletion.ts:35-37,123-130`; `useHardRunBefore`)                                                          | Only in the rules sheet (`liftRules.ts:106`)                                                                                                                                                                                                                                              |
| `overlapModel`                                                               | Lift-only posterior-chain spacing; **no run input** (`overlapModel.ts`)                                                                                                      | —                                                                                                                                                                                                                                                                                         |
| Nutrition                                                                    | Run type → day tier → carb shift (`dayIntensity.ts:120-205`)                                                                                                                 | Label not rendered                                                                                                                                                                                                                                                                        |

What does not exist:

- The run scheduler does not know which lift session (legs) sits on which day; it knows only `weekSchedule` day types.
- No rule keeps quality off the day after heavy legs.
- No run-side response to lift load.
- The default `generateSchedule` packs runs onto adjacent days: Tue+Wed and Sat+Sun for 3 lifts + 4 runs; Tue+Wed+Thu for 2 lifts + 3 runs.

---

## 6. Simulation seam + proof of concept

### 6.1 Feasibility and the glue

Yes, the run plan can be simulated headlessly. Every plan decision is pure. The PoC called the real `generateRacePlanV2` exactly as production does:

- creation as in `planBuilder.ts:576-590`
- each Monday as in `nextRunWeek` → `regenerateRacePlan`: `currentDate = weekStart = Monday`, `planTotalWeeks = runPlan.totalWeeks`, `currentWeek+1`

Simulated completed runs were fed back through the real `layoffFromRuns`, `deriveBenchmarkFromRuns`/`resolvePaceInsight`, `planningEasyPaceSPerKm` and `recentRunningContext` → `fitWeekToRunningBaseline`.

Lift coupling used the real `calendarLighterWeek`, `raceLiftWeek` and `isRaceBuildWeek`. Explainer copy came from the real `runSessionExplainer`. The generator's date-derived block position matched the carried `currentWeek` in every week; no `POS≠` flag fired.

**Smallest glue** for the ultracode run:

1. Move `regenerateRacePlan` and `nextRunWeek` out of `useProgram.ts:251-437`, where they are module-private inside a 3,576-line hook, into a pure module such as `runWeekRollover.ts`. The simulation then calls the production function rather than a mirror.
2. Add a runner model plus a feedback adapter: auto-derive, insight acceptance policy, baseline refresh, effort ratings, verdict tones for the A6 nudge.
3. Add pure wrappers for the client adaptations: `planEasierWeek` and `realignRacePlan`, which is a regen with `prior` carry.

**Higher fidelity:**

- `renderHook(useProgram)` with the ADR-0009 Firestore fake, stepping the system clock a week at a time. `useProgramLayoffWiring.test.ts` already drives the real auto-rollover this way through `@/test/firestoreHarness` (`seedFirestore`, `readDoc`, `writeLog`) and `savedRunDoc`.
- `computeClaims` (`scheduledRunCompletion.ts:214`) is pure and can mark slots complete.

**Server-only steps** (CommonJS in `functions/`):

- `onRunCreated` → `_maybeWriteRecoveryEntryForRun` / `_decideRecoveryEntry` (`index.js:3918`, exported). This is the recovery entry and `completedRaces`.
- `dailyRaceReconciliationSweep` (`:3835`): `race_no_show` at T+3 (`:3432`), and the recovery-exit materialization through the JS `resolveRecoveryExit`.
- `weeklyFellBehindCheck` (`:7164`; pure `functions/lib/fellBehindWeek.js`): run COUNT below 50% of target sets `pendingFellBehindPrompt`.
- `applyProgramCommand` (`:1156`; pure core at `programCommands.js:1003`): `applyEaseWeek`, `revertEaseWeek`, `applyDeloadWeek`, `overrideRunDay`, `moveRunDay`, `transitionRunDay`, `setManualRunCompletion`.
- `configurePlan` (`:937`) and `completeOnboarding`.
- The PI recompute.

Exported test seams: `_decideRecoveryEntry`, `_needsRaceNoShowEvaluation`, `_recoveryEndDateForRace`, `_decideFellBehindFlag`.

**Not modelled in the PoC:** the post-race recovery weeks, user overrides and moves, realign and ease mutations, time limits, the lift engine's own progression, and the 20-run cap on the layoff read.

### 6.2 Runner model

| Item                  | Setting                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| Fitness               | True VDOT from a 5K time; it grows a fixed amount per week of training (+0.06 to +0.15) |
| Execution             | Every planned session as prescribed, at the true Daniels band midpoints                 |
| Plan creation         | Tuesday 2026-10-06                                                                      |
| Races                 | Sundays                                                                                 |
| Weekly minutes and km | At the runner's true paces                                                              |
| "lift week" column    | Lift4 calendar functions; "lighter" presumes intermediate+ with ≥3 lift days            |

### 6.3 (a) Marathon 52 weeks out — ~25 km/week runner, 4 run days + 3 lift days, 5K 25:00 (VDOT 38.3) benchmark confirmed, standard knobs

Schedule: Sun run · Mon lift · Tue run · Wed run · Thu lift · Fri lift · Sat run. True easy 6:34/km, threshold 5:19, interval 4:49.

| wk    | phase        | step-back | sessions                                                                 | min     | ~km     | long km | long % | quality         | flags                              | lift week        |
| ----- | ------------ | --------- | ------------------------------------------------------------------------ | ------- | ------- | ------- | ------ | --------------- | ---------------------------------- | ---------------- |
| 1     | base         |           | Tue easy_30 · Wed easy_30_strides · Sat easy_30 · Sun long_12k           | 169     | 25.7    | 12      | 47%    | –               |                                    |                  |
| 2     | base         |           | same                                                                     | 169     | 25.7    | 12      | 47%    | –               |                                    |                  |
| 3     | base         |           | same                                                                     | 169     | 25.7    | 12      | 47%    | –               |                                    |                  |
| 4     | base         | yes       | same                                                                     | 169     | 25.7    | 12      | 47%    | –               |                                    | lighter          |
| 5     | base         |           | same                                                                     | 168     | 25.8    | 12      | 47%    | –               |                                    |                  |
| 6     | base         |           | same                                                                     | 168     | 25.8    | 12      | 47%    | –               |                                    |                  |
| 7     | base         |           | easy_30 · easy_30_strides · easy_30 · long_15k                           | 188     | 28.8    | 15      | 52%    | –               |                                    |                  |
| 8     | base         | yes       | … long_12k                                                               | 168     | 25.8    | 12      | 46%    | –               |                                    | lighter          |
| 9–11  | base         |           | easy_40 · easy_30_strides · easy_30 · long_15k                           | 198     | 30.4    | 15      | 49%    | –               |                                    |                  |
| 12    | base         | yes       | easy_30 · … · long_12k                                                   | 168     | 25.9    | 12      | 46%    | –               |                                    | lighter          |
| 13–15 | base         |           | easy_40 · … · long_15k                                                   | 197     | 30.5    | 15      | 49%    | –               |                                    |                  |
| 16    | base         | yes       | … long_12k                                                               | 167     | 26.0    | 12      | 46%    | –               |                                    | lighter          |
| 17–19 | base         |           | easy_50 · easy_30_strides · easy_30 · long_15k                           | 207     | 32.1    | 15      | 47%    | –               | +23% (wk17)                        |                  |
| 20    | base         | yes       | easy_40 · … · long_12k                                                   | 177     | 27.6    | 12      | 44%    | –               |                                    | lighter          |
| 21    | build        |           | Tue easy_50 · **Wed tempo_30** · Sat easy_30_strides · Sun long_15k      | 221     | 35.6    | 15      | 43%    | tempo_30        | +25%                               | leg-trim         |
| 22    | build        |           | easy_50 · 5x1k · easy_30_strides · long_15k                              | 216     | 34.8    | 15      | 45%    | 5x1k            |                                    | leg-trim         |
| 23    | build        |           | easy_50 · tempo_30 · … · long_15k                                        | 221     | 35.7    | 15      | 43%    | tempo_30        |                                    | leg-trim         |
| 24    | build        | yes       | easy_40 · 4x1k · … · long_12k                                            | 180     | 29.1    | 12      | 43%    | 4x1k            |                                    | lighter+leg-trim |
| 25–27 | build        |           | **Tue easy_60 → Wed tempo_30/5x1k** · Sat easy_40_strides · Sun long_15k | 235–241 | 38–39   | 15      | 40%    | tempo_30 / 5x1k | **b2b ML→quality**; +34% (wk25)    | leg-trim         |
| 28    | build        | yes       | easy_40 · 4x1k · easy_30_strides · long_12k                              | 179     | 29.2    | 12      | 43%    | 4x1k            |                                    | lighter+leg-trim |
| 29–31 | build        |           | easy_60 · tempo_30/5x1k · easy_40_strides · long_15k                     | 234–240 | 38–39   | 15      | 40%    | …               | b2b; +34%                          | leg-trim         |
| 32    | build        | yes       | easy_50 · 4x1k · … · long_12k                                            | 189     | 30.8    | 12      | 40%    | 4x1k            |                                    | lighter+leg-trim |
| 33–35 | build        |           | easy_60 · tempo_30 / 6x1k / tempo_40 · easy_40_strides · long_15k        | 240–253 | 39–41.5 | 15      | 37–40% | …               | b2b; +27%                          | leg-trim         |
| 36    | build        | yes       | easy_50 · 4x1k · … · long_12k                                            | 189     | 30.9    | 12      | 40%    | 4x1k            |                                    | lighter+leg-trim |
| 37–39 | build        |           | **easy_75 → tempo_40/6x1k** · easy_40_strides · **long_20k**             | 286–299 | 47–49   | 20      | 42–44% | …               | b2b; **+59%** (wk37; +18% vs wk35) | leg-trim         |
| 40    | build        | yes       | easy_50 · 4x1k · … · long_15k                                            | 207     | 33.9    | 15      | 45%    | 4x1k            |                                    | lighter+leg-trim |
| 41–43 | build        |           | easy_75 · tempo_40/6x1k · easy_40_strides · long_20k                     | 285–298 | 47–49   | 20      | 42–44% | …               | b2b; +44%                          | leg-trim         |
| 44    | build        | yes       | easy_60 · 4x1k · easy_30_strides · long_15k                              | 216     | 35.6    | 15      | 43%    | 4x1k            | b2b                                | lighter+leg-trim |
| 45–47 | build        |           | easy_75 · tempo_40/6x1k · easy_40_strides · long_20k                     | 285–298 | 47–49   | 20      | 42–44% | …               | b2b; +38%                          | leg-trim         |
| 48    | build (peak) |           | **easy_90 → 6x1k** · easy_50_strides · long_20k                          | 309     | 51.1    | 20      | 40%    | 6x1k            | b2b                                | leg-trim         |
| 49    | taper        |           | Tue 8x400 · Wed easy_30 · Sat easy_30 · **Sun easy_30**                  | 122     | 20.2    | —       | —      | 8x400           | **−61%**                           | leg-trim         |
| 50    | taper        |           | same                                                                     | 122     | 20.2    | —       | —      | 8x400           |                                    | taper            |
| 51    | taper        |           | same                                                                     | 122     | 20.3    | —       | —      | 8x400           |                                    | taper            |
| 52    | race         |           | easy_30 ×3 (Tue/Wed/Sat) + Sun marathon_race                             | 314     | 56.8    | —       | —      | –               |                                    | race             |

Explainer exposure over the plan: "Base phase…" 40×; strides line 48×; long 48×; medium-long 20×; tempo 14×; intervals 14×; taper 9× + sharpener 3×; race 1×.

### 6.4 Variants of (a): only the rows that differ

| Variant                                                                | Week 1                                                                                 | Key later rows                                                                                                                                                                                                                                                                             | Feedback events                                                                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **(a-nobench)** no benchmark (onboarding default)                      | identical                                                                              | wk25 **long_20k** (273 min); wk41 easy_75 · tempo_40 · easy_40_strides · **long_25k** (330 min); peak wk48 340 min, long 25 km; taper identical                                                                                                                                            | wk1 auto-derive: 12 km in 79 min → **VDOT 29.4** (true 38.3), easy 8:04 vs 6:34/km; pending, so no effect |
| **(a-derived-accepted)** derived benchmark accepted                    | identical                                                                              | Long run **never exceeds 15 km**: wk9–17 long_12k; wk25–48 long_15k; peak 278 min                                                                                                                                                                                                          | Pace Insight "faster" weekly from wk21 (29.4 → 37.6); true value reached only by the race (41.3)          |
| **(a-insight)** confirmed + Pro insights auto-accepted                 | identical                                                                              | Long run 12 km through base, 15 km in early build, **20 km from wk41**                                                                                                                                                                                                                     | wk1 "slower 38.3 → 29.4" ACCEPTED; wk21 "faster → 34.9"; wk34 → 37.0; wk52 → 41.3                         |
| **(a-baseline)** baseline set once (regular, 150 min/wk, longest 70)   | Sun **long_8k** (143 min)                                                              | **wk6 onward the review (28 d) makes everything easy:** Sun easy_60 → easy_40 → wk25–48 **easy_40 ×3 + easy_30** (150 min, no long run, no quality); taper easy_20 + easy_30 ×3; then a marathon                                                                                           | Pace Insight "slower" all year                                                                            |
| **(a-baseline-refresh)** re-confirmed from recorded runs every 4 weeks | long_8k                                                                                | Baseline **ratchets 150 → 142 → 129 → 120 min/wk; longest 70 → 53 → 39 → 30 min**. wk9+ Sun **easy_30** (long run gone). Build: easy_30 · tempo_20 · easy_30_strides · easy_30 = 120 min all year                                                                                          | —                                                                                                         |
| **(a-layoff)** 4 weeks off (wk21–24)                                   | —                                                                                      | wk22–23 "gap": full plan unchanged (5x1k etc.). wk24 detrained: easy_30 ×3 + long_12k. wk25–28 re-entry: **easy_40 ×3 + long_12k = 197 min**, about 90% of pre-layoff 206–221 min. wk29 back to full build **+44%**                                                                        | —                                                                                                         |
| **(a-5days)** 5 run days (Mon = both)                                  | Mon easy_30 · Tue easy_30_strides · Thu easy_30 · Sat easy_30 · Sun long_12k (199 min) | wk47–48 **Mon easy_75/90 the day after Sun long_20k, on a lift day**; peak 359 min / 59 km. wk49 taper **8x400 on Monday, the day after the 20 km peak long run, on a lift day** (clashesWithLift). The taper branch takes `remaining[0]` (`runScheduler.ts:1358`) and bypasses placement. | —                                                                                                         |

### 6.5 (b) Half marathon 16 weeks out — 3 run days + 3 lift days, 5K 27:30 (VDOT 34.2) confirmed

Schedule: Tue/Wed/Sat runs, Sun rest.

| wk    | phase             | sessions                                         | min     | ~km  | long | long % | quality                          | flags                       |
| ----- | ----------------- | ------------------------------------------------ | ------- | ---- | ---- | ------ | -------------------------------- | --------------------------- |
| 1–4   | base              | Tue easy_30 · Wed easy_30_strides · Sat long_10k | 131–132 | 18.4 | 10   | 54%    | –                                | wk4 step-back, lift lighter |
| 5–6   | base              | easy_40 · easy_30_strides · long_12k             | 155–156 | 21.8 | 12   | 55%    | –                                |                             |
| 7     | build             | **tempo_30** · easy_50 · long_15k                | 202     | 29.4 | 15   | 53%    | tempo_30 (first tempo is 30 min) | +30%                        |
| 8     | build (step-back) | 4x1k · easy_40 · long_10k                        | 146     | 21.6 | 10   | 48%    | 4x1k                             |                             |
| 9     | build             | tempo_30 → easy_60 · long_15k                    | 211     | 30.8 | 15   | 50%    | tempo_30                         | b2b; +44%                   |
| 10    | build             | **6x1k** → easy_60 · long_15k                    | 214     | 31.8 | 15   | 49%    | 6x1k (skips 5x1k)                | b2b                         |
| 11    | build             | tempo_40 → easy_60 · long_15k                    | 224     | 33.1 | 15   | 47%    | tempo_40                         | b2b                         |
| 12    | build (step-back) | 4x1k · easy_50 · long_12k                        | 170     | 25.0 | 12   | 50%    | 4x1k                             |                             |
| 13    | build (peak)      | tempo_40 → easy_75 · **long_20k**                | 274     | 40.3 | 20   | 51%    | tempo_40                         | b2b; **+61%**               |
| 14–15 | taper             | 8x400 · easy_30 · easy_30                        | 93      | 14.0 | —    | —      | 8x400                            | −66%                        |
| 16    | race              | easy_30 ×3 + Sun half_race                       | 217     | 34.0 | —    | —      | –                                |                             |

`harder` changes nothing at 3 days, as Run18 intends.

### 6.6 (c) 5K 10 weeks out — near-beginner (5K 36:00, VDOT 24.7), 3 run days + 2 lift days, no benchmark

Schedule: Tue/Wed/Thu runs on three consecutive days; no weekend run, so the long run lands on Tuesday.

| wk  | phase        | sessions                                                         | min | ~km  | long | quality  | flags                             |
| --- | ------------ | ---------------------------------------------------------------- | --- | ---- | ---- | -------- | --------------------------------- |
| 1–4 | base         | Tue **long_6k (55 min)** · Wed easy_30 · Thu easy_30_strides     | 115 | 12.5 | 6    | –        | wk4 lift lighter                  |
| 5   | build        | long_6k · easy_40 · tempo_20 **@ 4:30/km** (race pace 7:12)      | 124 | 14.3 | 6    | tempo_20 |                                   |
| 6   | build        | long_6k · easy_40 · **6x1k** (first-ever intervals at peak dose) | 151 | 18.3 | 6    | 6x1k     | +22%                              |
| 7   | build        | long_6k · easy_40 · tempo_20                                     | 124 | 14.3 | 6    | tempo_20 |                                   |
| 8   | build (peak) | long_8k (73 min) · easy_50 · 6x1k                                | 178 | 21.5 | 8    | 6x1k     | **+44%**; lift already in "taper" |
| 9   | taper        | easy_30 · 8x400 · easy_30                                        | 98  | 11.8 | —    | 8x400    |                                   |
| 10  | race         | easy_30 ×3 + Sun 5k_race                                         | 128 | 15.2 | —    | –        |                                   |

Variants:

- **(c-baseline)** "building", 60 min/wk, longest 25: **Tue/Wed/Thu easy_20, identical for all 10 weeks**, then the 5K.
- **(c-0lift)**: Mon long_6k · Wed easy_30 · Fri easy_30_strides; otherwise the same.

### 6.7 Two more personas

**(d) "New to running" + Full marathon, onboarding default 1 run/week.** One run a week:

| Week  | Run                                         |
| ----- | ------------------------------------------- |
| 1     | Wed long_12k: 116 min for a 38:00 5K runner |
| 21    | long_15k                                    |
| 41    | **long_25k (214 min)**                      |
| 49–51 | easy_30                                     |

The race follows. The long run is 100% of each week. No benchmark, so the nominal ceiling applies.

**(e) 10K 20 weeks out, 2 run days, 4 lift days** (5K 30:00, confirmed). Runs are Tue/Wed.

- Every build week is **long run Tuesday → quality Wednesday**: long_8k → tempo_20/5x1k, up to long_12k → 6x1k at the peak.
- The long run is 55–67% of weekly minutes.
- Week 18 is the peak, while the lift side is already in its "taper".

### 6.8 Session-level evidence

From the real `computePlanMetadata`:

| Session             | No benchmark                                                                     | Benchmark 38.3                                 | Benchmark + A2 marathon goal 4:15                   |
| ------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| easy_30/40/60/90    | target none; **no segments** (the in-run screen has no countdown)                | same                                           | same                                                |
| easy_30_strides     | [EASY] Easy 25 min → [REP 1/4] Stride 1 of 4 → [AFTER REP 1/4] Walk back ×4      | same                                           | same                                                |
| tempo_20            | target **4:30/km**; [WARMUP] → [MODERATE] "20 min tempo @ 4:30 /km" → [COOLDOWN] | 5:19/km                                        | target 6:03/km; "**20 min @ goal pace @ 6:03 /km**" |
| 4x1k / 6x1k / 8x400 | workPace undefined; reps labelled "1K"/"400m"; PaceZoneBar 5:00                  | "1K @ 4:49 /km"; 8×400 also at 4:49 (I, not R) | same as benchmark                                   |
| long_15k / 20k      | distance target only                                                             | same                                           | [EASY] Easy 13 km → [RACE PACE] 7 km @ 6:03 /km     |

Post-run verdict and live bar for a **perfect** session (benchmark confirmed):

| Session                                  | Whole-run average | Verdict                                                                             | PaceZoneBar |
| ---------------------------------------- | ----------------- | ----------------------------------------------------------------------------------- | ----------- |
| tempo_20                                 | 5:41              | "A touch outside the 5:16–5:22 /km window (5:41 /km). Still a deposit in the bank." | "+22s slow" |
| tempo_40                                 | 5:39              | same                                                                                | "+20s slow" |
| 4x1k                                     | —                 | none                                                                                | "+44s slow" |
| 6x1k                                     | —                 | none                                                                                | "+40s slow" |
| easy / long                              | —                 | "Right on target"                                                                   | —           |
| A2 long_20k with a 7 km goal-pace finish | 6:23              | "Right on target"                                                                   | —           |

The tempo verdicts all persist tone `slow`, which feeds the A6 "Take this week easier?" nudge.

---

## 7. Quality concerns a running coach would raise (with generated evidence)

1. **Weekly volume jumps.**
   - The week after every step-back jumps +25% to +59% (a: wk25 +34%, wk37 +59%, wk41 +44%).
   - The real step from the last full week is about +18% (wk35 253 → wk37 299 min): the long run 15 → 20 km and the medium-long 60 → 75 min both rise in the same week.
   - The half peak (b wk13) is +61% over its step-back and +22% over wk11.
   - The compressed band doubles the long run in one week: 6-week marathon 12 → 25 km, 5-week half 10 → 20 km, 4-week 10K 6 → 12 km. This is pinned at `racePlanSafetySweep.test.ts:382-398` and RUN-EV-06 holds it as an owner decision.
2. **The long run's share of the week.**

   | Plan           | Long-run share of weekly minutes |
   | -------------- | -------------------------------- |
   | 4-day marathon | 39–54%                           |
   | 3-day half     | 47–55%                           |
   | 2-day 10K      | 55–67%                           |
   | 1-day marathon | 100%                             |

   Daniels' 25–30% is unreachable at three to four days. The code concedes this (`runScheduler.ts:225-235`), but the planner never says so to the runner.

3. **Back-to-back demanding days.**
   - The medium-long (60–90 min) is not treated as demanding, so in every build week of the 4-day marathon it sits the day before quality (Tue → Wed). The 3-day half has quality → medium-long.
   - Two-day weeks put long → quality on consecutive days every week (e).
   - The beginner 5K runs Tue/Wed/Thu in a row.
   - In the 5-day marathon, the Sunday 20 km long run is followed on Monday by a 75–90-min medium-long, then by 8×400 in taper week 1, both on a lift day.
   - Cause: `generateSchedule`'s alternating slot order (`scheduleUtils.ts:111-147`) plus the taper branch's `remaining[0]` (`runScheduler.ts:1356-1362`).
4. **Quality ramps start mid-ladder.** The quality ladder is indexed on block progress (`runScheduler.ts:699-707`), not on exposure.
   - The 52-week marathon's first quality session (wk21) is already tempo_30 / 5x1k.
   - The half's first intervals are 6x1k, skipping 5x1k.
   - The beginner 5K's first-ever interval session is 6×1K at VO2max (c wk6).
   - Peak quality is then held from 70% of the ramp onward.
5. **Quality during re-entry.**
   - Detrained correctly removes quality, strides and the medium-long.
   - But volume stays at about 90% of pre-layoff (197 vs 206–221 min), with a 12 km long run in week one back. The Run15 row itself cites ~50% as standard return guidance.
   - When the 21-day window closes it jumps +44% straight back into the full build (a-layoff wk29).
   - A "gap" class (7–20 days off) changes nothing.
6. **Taper shape.**
   - The marathon taper cuts volume 61% in one step and holds three identical weeks.
   - There is **no long run at all** in the last 4 weeks (the final one is 28 days out): the long slot becomes `easy_30` (`runScheduler.ts:727,1194`). Pfitzinger and Daniels both keep a reduced long run 2–3 weeks out.
   - The only quality is 8×400 m at interval pace, not race-specific work.
   - The half: −66% to 93 min for two weeks.
   - A 5K/10K's lift "taper" starts during its run peak week.
7. **Marathon peak vs the input runner** (~25 km/week, VDOT 38).
   - Peak week is 309 min / ~51 km, which is plausible.
   - The peak long run is **20 km**: about 2:11 at 6:34/km, then a race of about 4:15. Ordinary novice plans reach 29–32 km; Hansons, the most conservative, about 26 km.
   - Without a benchmark the same runner reaches 25 km.
   - A slow runner without a benchmark is prescribed 25 km ≈ 4 h (d), against a "150-minute ceiling" that only holds at nominal pace.
   - "New to running" + 1 run/week produces a single 12 → 25 km run each week.
8. **A year-out marathon's first 30 weeks.**
   - 20 weeks of base: easy, strides and medium-long creeping 30 → 50 min, long 12 → 15 km, no quality, volume 169 → 207 min.
   - Then 10 weeks of build at the same 15 km long run, with tempo_30 / 5x1k alternating.
   - The long run sits at 15 km from wk7 to wk35.
   - No race-specific work exists unless a goal time is set in Settings.
   - Nothing uses the 52-week runway for a tune-up race, a 5K/10K speed block or a maintenance phase.
9. **Execution signals inverted.** Perfect tempos read as misses and trigger the ease nudge. Interval PaceZoneBar is always red on the whole-run average. Pace Insight tells a fit runner their paces are too quick throughout base. Tempo audio says "behind target" during the warm-up.
10. **Effort mislabels.**
    - "All-out marathon effort".
    - Long 15K "Steady, controlled effort" while it is judged against the easy band.
    - "Easy Run · Recovery pace" against Z2 "Easy".
    - Race HR shown as Z4 for every distance.
    - Easy HR at 60–70% of max HR (`hrZones.ts:35-41`), which makes conversational running feel like a walk for many recreational runners.
11. **No guard for 1 run/week race prep.** The planner accepts a marathon on 1 run per week, and onboarding defaults "New to running" to 1 run (`Onboarding.tsx:1004-1010`).
12. **The baseline cannot drive progression**, as shown in (a-baseline) and (a-baseline-refresh). This contradicts the handoff's own "Progress the dose from eligible completed exposure" rule.

---

## 8. RUN-EV ledger at HEAD (re-verified, not taken from the doc)

| ID                                                       | Status at HEAD                                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RUN-EV-01 (Structured offered in onboarding)             | **Closed**                                                                     | Onboarding offers only Free running / Race prep (`Onboarding.tsx:1017-1025`). Legacy "structured" passes through (`onboardingRunMode.ts:15-18`) and loads as freeform (`useProgram.ts:639-641`).                                                                                                                                                                                    |
| RUN-EV-02 (two schedule authorities, non-atomic)         | **Closed**                                                                     | One `buildPlan` + one `configurePlan` commit (`RunPlanSettings.tsx:461,522`; `functions/index.js:937`).                                                                                                                                                                                                                                                                             |
| RUN-EV-03 (async layoff not a regen dependency)          | **Closed**                                                                     | The rollover waits for `layoffRead.uid === user.uid` (`useProgram.ts:1205-1217`). Load awaits `fetchRecentLayoff` (`:656`).                                                                                                                                                                                                                                                         |
| RUN-EV-04 (individualised exposure model)                | **Open**, with new failure modes                                               | Only proxies exist: the Run17 pace ceiling, the self-reported/recorded baseline ceiling (`runningBaseline.ts`) and the layoff class. Onboarding's experience tier never reaches the generator. The baseline ratchets down when refreshed (sim).                                                                                                                                     |
| RUN-EV-05 (finish-safely label)                          | **Label closed**; a sibling copy is open                                       | "Mostly-easy plan" ships everywhere. The planner's compressed text still says "a shorter long-run progression" (`raceGoalPlanner.ts:249-250`), which the cockpit's own note calls backwards (`RaceCockpitCard.tsx:226-250`). Onboarding shows it verbatim (`Onboarding.tsx:1086-1093`).                                                                                             |
| RUN-EV-06 (150-min ceiling and 6 km floor as heuristics) | **Decided/labelled** (`runScheduler.ts:215-244`; Run17); **consequences open** | Benchmarked runners at or slower than 6:34/km peak at 20 km (≤ 2.1× to the marathon), and slower than 7:40 at 15 km. Without a benchmark, slow runners still get 25 km ≈ 4 h. The 6 km floor puts a 55-minute "long run" on a 36:00 5K runner in week 1.                                                                                                                            |
| RUN-EV-07 (migration/reconciliation ownership)           | **Partial**                                                                    | `raceRunDaysReconcile` is now a runtime path (`programMaintenance.ts:6,40-59` → load effect). `run9Migration.migrateRunStateToRun9` still has **no runtime caller** (grep: comment references only); the live migration is inline (`useProgram.ts:639-641`). Client document writes vs server lifecycle are guarded only by `ProgrammeConflictError` refetch (`useProgram.ts:703`). |
| RUN-EV-08 (benchmark consent)                            | **Closed** as policy; the **quality of the derived benchmark is open**         | The two-tier gate is shipped (`runPaces.ts:246-251`). The derived and insight benchmarks treat easy whole-run averages as race efforts: ~9 VDOT low, and "slower" suggestions throughout base.                                                                                                                                                                                      |
| RUN-EV-09 (planned dose survives end to end)             | **Open**                                                                       | No e2e covers generated row → launch → GPS run → summary → claim → history (`e2e/journeys.auth.spec.ts:106` covers only race-goal setup). Dose losses found: easy and medium-long carry no duration into the player (`runPlanMetadata.ts:790-822`; easy templates `config: {}`); tempo verdict and bar on the whole-run average; A2 tempo judged against threshold.                 |
| RUN-EV-10 (hard-session placement model)                 | **Partial**                                                                    | Cyclic long/quality spacing (`runPlacement.ts`) and `clashesWithLift` exist. Still missing: medium-long ignored as demanding; long and quality adjacent in 2-day weeks; the taper sharpener bypasses placement (`runScheduler.ts:1356-1362`); `generateSchedule` clusters run days; no lift-session awareness.                                                                      |

---

## Appendix — rerunning the harness

1. Copy `harnesses/running-sim.test.ts.txt` to `src/features/program/__tests__/zz_scratch_run_audit.test.ts`.
2. Create the output directory: it writes to `$SIM_OUT_DIR/running-sim-output.md` (default `/tmp/tropos-sim`).
3. Run `SIM_OUT_DIR=/tmp/tropos-sim npx vitest run src/features/program/__tests__/zz_scratch_run_audit.test.ts --project node` (about 2 s).
4. Delete the file afterwards.

It calls the private `nextRunWeek` / `regenerateRacePlan` logic through a
re-implementation (they are module-private in `useProgram.ts`). Treat it as a
seed: the real simulator calls the extracted production function.

The `simulate()` options cover: distance, race date, lift and run days, starting 5K, VDOT gain per week, benchmark (confirmed/none), auto-accept policies, baseline (once or refreshed every N weeks), a layoff window and the Pgm6 tuning.
