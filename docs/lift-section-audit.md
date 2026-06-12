# Lift section audit — programming, exercise selection, logging UX, and the form-guide/animation direction

Research-backed audit of the strength/lift half of Tropos: how programs are
generated, how exercises are selected, the day-split spectrum (full-body →
PPL), the generation bugs, the logging interactions (swipe-to-delete,
press-and-hold, rest timer), and the exercise form-guide — including a
realistic exploration of the **animated / AI-generated demo** direction
(Nano Banana / Gemini image gen, 3D, licensed media).

Every finding is cited to real `file:line`. Three load-bearing claims were
spot-verified against the running code (noted inline). This is an audit +
staged plan, not an implementation — each item in §6 is a shippable unit.

Severity: **P0** = correctness/trust/data-loss or dead code shipped as a
feature · **P1** = core training-quality depth or a real UX gap every user
hits · **P2** = polish / consistency. Effort·Risk is a t-shirt estimate.

---

## 1. How the engine programs lifting today (ground truth)

The lift engine is `src/features/program/programEngine.ts` (pure) +
`planBuilder.ts` (orchestration) + `variationBank.ts` (the exercise pool) +
`templates.ts` (hand-written templates) + `matchTemplate.ts` (equipment/injury
filtering). Two paths produce a program: a **template path** (a hand-written
template matched by `matchTemplate`) and a **procedural path**
(`generateProgram` builders). Exercise _data_ is `src/lib/exercises.ts` (153
exercises); the form guide is `src/components/ExerciseFormContent.tsx`,
reachable only from `History → exercise → Form`.

### Split selection — `chooseSplit(weeklyTarget)` (`programEngine.ts:124`)

Split is a **pure function of lift-days/week** and nothing else:

| Days | Split                      | Per-muscle frequency |
| ---- | -------------------------- | -------------------- |
| 0    | full_body (no lift days)   | —                    |
| 1    | full_body                  | 1×                   |
| 2    | upper_lower                | 2×                   |
| 3    | full_body                  | **3×**               |
| 4    | upper_lower                | 2×                   |
| 5    | ppl_ul (PPL + Upper/Lower) | ~1.5–2×              |
| 6    | ppl_x2 (PPL ×2, Legs B)    | 2×                   |
| 7    | clamped → 6                | 2×                   |

This is a **defensible, frequency-aware mapping** and deliberately never emits
a 1×/week "bro split" procedurally — good, that matches the evidence (see §2).
`preferredSplit` (`programTypes.ts:44`) is **inert in generation** — verified:
`chooseSplit` takes only `weeklyTarget` (`programEngine.ts:124`, `:822`) and
never reads `preferredSplit`; it is used only as a _template-scoring_ signal in
`matchTemplate.ts:55`. That's intentional (Pgm5 Q1) but is a latent UX surprise
(§2 D-LIFT-7).

### Exercise selection — movement-pattern model (`variationBank.ts:14`)

Nine movement categories (horizontal/vertical push & pull, knee/hip dominant,
biceps, triceps, core), each with 2–5 ranked options. `pickExercise`
(`variationBank.ts:81`) returns the **primary** option until `plateauCount ≥ 3`,
then rotates to a random alternative; `pickAccessory` (`:107`) always randomises
a non-primary. This movement-pattern foundation is sound and modern.

### Volume & progression

- Reps come from `GOAL_PROFILES` (`programEngine.ts:28`): strength 5/8,
  hypertrophy 8/12, fat_loss 12/15, general 8/12, running 8/12 (−15% volume).
- Sets = `round(baseSets × goalVolumeMult × nutritionGoalMult)` — cut ×0.9,
  recomp ×1.0, lean-bulk ×1.12 (`:251`).
- Progression: **double** (hypertrophy/general) or **linear**
  (strength/fat_loss/running) in `applyProgression` (`:890`); +2.5kg jumps (or
  +1kg microloading), failure after 3× → backoff + `plateauCount++`.
- Periodisation: fixed **4-week cycle**, week 4 deload (intensity ×0.85, volume
  ×0.7) via `generateWeekPrescription` (`:79`) + `applyDeload` (`:1056`).
- Equipment/injury substitution: `matchTemplate.ts` — 3-tier equipment swap
  (`:393`) and 4-tier injury swap (`:238`) with a contraindication index.

This is a competent early-intermediate engine. The gaps below are about
**research-grade depth** and **a few real bugs**, not a broken core.

---

## 2. Programming & exercise-science findings

### D-LIFT-1 · No weekly-sets-per-muscle volume model — **P1 · L·Med**

**The single biggest science gap.** Weekly hard sets per muscle is the primary
hypertrophy driver (Schoenfeld et al. 2017 dose–response; Renaissance
Periodization MEV/MAV/MRV landmarks ≈ 10–20 sets/muscle/week for most
intermediates). The engine has **no muscle-group-week accounting** — volume is
emergent from whichever day-template fires (confirmed: no per-muscle tally
anywhere in `programEngine.ts`). Consequences: a 3-day full-body can leave a
muscle at ~6–9 sets/week while 6-day PPL×2 hits ~16; nothing targets a
landmark, warns on under/over-dosing, or rebalances when a user drops a day.
**Move:** compute weekly sets-per-muscle from the generated split and target a
goal-driven landmark band (hypertrophy ~12–18, strength ~8–12, maintenance
~6–10); surface it ("Chest: 14 sets/wk") and use it to gate accessory count.
**Scope check:** start read-only (compute + display the tally) before letting
it _drive_ selection — the muscle taxonomy already exists via `mapMuscles`.

### D-LIFT-2 · Exercise pool ignores lengthened-bias & SFR — **P1 · M·Low**

Recent hypertrophy work (Maeo et al. 2021/2023; Pedrosa et al. 2022) shows
training at **long muscle lengths** (overhead/incline triceps, deep RDLs,
incline curls, deep-stretch calf work) drives more growth per set. The
`variationBank` ranks by convention, not stimulus-to-fatigue or
lengthened-position quality, so the "primary" pick is often the _traditional_
choice, not the _highest-SFR_ one. **Move:** tag each variation with
`lengthenedBias` + a coarse SFR rank; let `pickExercise` prefer high-SFR /
lengthened options for hypertrophy goals. **Scope check:** data-only tagging +
a ranking tweak; no engine restructure.

### D-LIFT-3 · Push/pull & front/rear balance not enforced — **P1 · M·Low**

Full-body 3-day nets 3 push / 4 pull sessions but **no balancing guard** if a
day is skipped (`buildFullBody` `:258`); lateral/rear-delt, direct hamstring,
and calf work aren't guaranteed. Shoulder-health convention is pull volume ≥
push, and rear-delt/lateral-delt are chronically under-dosed. **Move:** a
post-generation balance pass that checks push:pull and adds rear-delt/lateral
when a threshold is missed. Pairs with D-LIFT-1's tally.

### D-LIFT-4 · No planned variation — only plateau-triggered rotation — **P2 · M·Low**

`pickExercise` keeps the same main lift for _every_ week until a 3-fail plateau
(`variationBank.ts:81`); accessories randomise but mains are static for months.
Some periodic novelty (and movement rotation across a meso) aids adherence and
joint health. **Move:** optional per-mesocycle accessory rotation; keep mains
stable (they're the progression anchor) — don't over-rotate.

### D-LIFT-5 · Hardcoded starting weights, no strength benchmark — **P1 · M·Med**

Builders hardcode absolute loads (bench 60kg, squat 80kg — `programEngine.ts:275`)
for **everyone** — a beginner and an advanced lifter start identically; regen
resets to these unless prior history exists. There is **no strength analogue to
the running `runFitness` benchmark** we just shipped. Cold-start (every new
user — a most-seen state) shows unrealistic loads. **Move:** a lightweight
strength benchmark at onboarding (bodyweight-relative or a 1–3 set estimate →
e/1RM) seeding starting loads; mirror the `runFitness` capture pattern.
**Scope check:** estimate ranges, not a 1RM test; let progression correct fast.

### D-LIFT-6 · Progression ignores logged RPE/RIR — **P2 · M·Med**

The logging UI captures RPE (`WorkoutSession.tsx` RPE selector) but
`applyProgression` (`:890`) only reads reps-vs-target — **RPE is recorded and
discarded** for programming. Autoregulation (RIR-targeted load steps) is the
modern standard. **Move:** feed logged RPE into the load step (e.g. hold/regress
when RPE ≫ target). **Scope check:** additive signal on top of the existing
double/linear logic; gate behind enough logged RPE history.

### D-LIFT-7 · `preferredSplit` is inert (silent override) — **P2 · S·Low**

A user who explicitly picks "full body" or "bro split" gets a days-derived
split instead (verified §1). Defensible (Pgm5 Q1: structure follows frequency)
but a UX surprise. **Move:** either honour an explicit non-`auto` preference, or
show _why_ ("5 days → PPL+Upper/Lower for 2× frequency") so it doesn't read as
a bug. Decide deliberately.

---

## 3. Generation bugs (errors in selection/generation) — fix-first

### D-LIFT-8 · `fatigueScore` is never computed → `applyFatigue` is dead — **P0 · S·Low**

**Verified.** `applyFatigue` (`programEngine.ts:1044`) reduces volume only when
`fatigueScore > 20`, but nothing ever raises it: it's only ever _carried over_
(`planBuilder.ts:419`, `useProgram.ts:1384` pass `?? 0`) — no client or Cloud
Function increments it. So fatigue-based autoregulation **never fires in
production** (the unit test sets `50` by hand, masking it). Either wire a real
fatigue signal (rolling failed-sets / RPE / missed sessions) or delete the dead
path so it stops reading as a shipped feature. (Recurring-mistake rule: dead
config that looks live.)

### D-LIFT-9 · Microloading not consistently threaded from settings — **P1 · S·Low**

`ProgramSettings.microloading` (`programTypes.ts:165`) is read as a
**parameter** to `applyProgression`, not from canonical state — a settings
change won't retroactively govern progression and call sites can pass a stale
value. Thread it from one source (mirrors the D2 nutrition-phase single-source
fix).

### D-LIFT-10 · Injury "no safe substitute" warning never reaches the user — **P1 · S·Low**

When injury filtering can't swap, it writes a note to `TemplateExercise.notes`
(`matchTemplate.ts:176`) that is **not carried onto `ProgramExercise`** — the
user only sees it in the template viewer, not their actual program. A
contraindicated lift can sit in a plan with the warning invisible. Carry the
note onto the program exercise and surface it.

### D-LIFT-11 · Bodyweight rep ceiling unbounded — **P2 · S·Low**

Bodyweight progression increments reps with **no cap** (`programEngine.ts:949`,
`:979`); a pull-up can drift to "20+ reps" with no load path. Cap (~15–20) then
prompt loading (weighted vest / band-assist → weighted).

### D-LIFT-12 · Accessory de-dup not enforced in builders — **P2 · S·Low**

`makeAccessory` accepts `excludeId` to avoid same-day duplicates but several
builders don't pass it (`programEngine.ts:214`), so randomisation can repeat a
variation within a day. Pass `excludeId` consistently.

---

## 4. Logging interactions (swipe-to-delete, press-and-hold, rest, guide)

The active session is `src/components/WorkoutSession.tsx`; the editable
programme list is `src/pages/Program.tsx` + `SortableExerciseRow.tsx`.

### D-LIFT-13 · Exercise delete has NO undo (swipe + long-press) — **P1 · S·Low**

Swipe-to-delete (`SortableExerciseRow.tsx:37`, reveals an 80px trash panel) and
the long-press "Remove Exercise" (`Program.tsx:331` context menu) both delete
**immediately, irreversibly** — while _set_ completion has a 4s undo
(`WorkoutSession.tsx:671`). Asymmetric and data-loss-prone. **Move:** a 3–4s
toast + undo after exercise delete (reuse the set-undo pattern).

### D-LIFT-14 · No way to see the form guide mid-workout — **P1 · M·Low**

`WorkoutSession` renders no instructions/demo; to check form a user must exit →
History → exercise → Form tab (`ExerciseFormContent.tsx`). **Move:** a "How to"
affordance in the session's exercise header opening a sheet with the same
`ExerciseFormContent` (muscle diagram + steps + tip). This is the natural home
for the visual demo in §5. Highest-leverage UX fix here.

### D-LIFT-15 · Touch targets below the 44px invariant — **P2 · S·Low**

CLAUDE.md mandates a 44px floor on interactive elements; in the session the
**rest-timer presets (~32px)** (`RestTimerRing.tsx`), **RPE buttons**
(`px-1.5 py-0.5`), and **set-type popover rows (~24px h)** are under it
(`WorkoutSession.tsx`). This is a recurring DS regression — fold into the
`Button`/`IconButton` primitives. (Aligns with the D15 ratchet that just
landed.)

### D-LIFT-16 · Rest timer auto-starts with no confirmation — **P2 · S·Low**

Completing a set immediately starts the rest timer (`WorkoutSession.tsx:689`);
an accidental tap locks a 90s rest (undo is only 4s). Consider a brief grace
window or a manual-start affordance.

### D-LIFT-17 · Discoverability + parity gaps — **P2 · S·Low**

Swipe-to-delete has no visual affordance (chevron/handle); long-press has **no
desktop equivalent** (touch-only — `Program.tsx:331`); number inputs and the
exercise rail fire **no haptics** while other taps do. Add a hint chevron, a
3-dot menu for desktop, and input/rail haptics.

---

## 5. The exercise form guide & the animated-demo direction

### Current state (verified)

- 153 exercises; ~142 have multi-step `instructions`, ~65 have a `tip`
  (`exercises.ts:1`, Bench example `:27`) — genuinely good, coach-voiced prose.
- `ExerciseFormContent.tsx` renders a **react-body-highlighter** anterior/
  posterior muscle diagram + numbered steps + a "watch out" tip callout.
- **Dead media pipeline:** `exerciseDemo.ts:15` defines `images: string[]` and
  _fetches_ start/end photos from free-exercise-db (`:128`), but **no `<img>`
  ever renders them** — verified (no `<img>` in `ExerciseFormContent.tsx`).
- No GIF/video/3D/animation; guide unreachable mid-workout (§4 D-LIFT-14).

### Missing data for a research-grade guide (`exercises.ts` shape gaps)

No `difficulty`, `tempo`, `lengthenedBias`, structured `commonMistakes`,
`alternatives`/`regressions`, or `recommendedRPE`. A richer demo needs these
fields first (they also power D-LIFT-2/5/11).

### The visual-demo options, evaluated honestly

The hard constraint that dominates every option: **showing WRONG form is worse
than showing none** — bad joint angles / bar paths are an injury-credibility
risk. And Tropos is **iOS-first** (CLAUDE.md): the demo must work in the native
WKWebView and shouldn't ship a heavy runtime — favour **pre-generated static
assets**, never runtime generation on-device.

1. **Render the free-exercise-db images we already fetch — D-LIFT-18, P1·S·Low.**
   The cheapest, highest-trust win: the start/end photos are _already in the
   data pipeline_ and just aren't drawn. A 2-frame start↔end toggle/cross-fade
   in `ExerciseFormContent` (and the mid-workout sheet) gives real visual demos
   at ~zero cost and zero accuracy risk (they're real photos). **Do this first**
   regardless of the fancier routes.

2. **Nano Banana / Gemini image gen (Gemini 2.5 Flash Image).** Tropos already
   integrates Gemini (`src/lib/gemini.ts`), and Nano Banana's strength is
   _character-consistent_ edits — a single on-brand "coach" avatar rendered
   across exercises. Realistic verdict:
   - **Good for:** a stylised, brand-consistent coach producing **2–3 keyframes**
     (start / stretch / contract) per exercise, **generated offline, human-QA'd
     against the existing text instructions, committed as static assets.**
   - **Not good for:** unreviewed auto-generation or smooth multi-frame
     _animation_ — image models still mangle joint angles, grip, bar path, and
     limb counts; sequence-to-sequence motion consistency is not reliable enough
     to ship as form guidance. Anatomical QA at 153×N frames is the real cost.
   - **Recommendation — D-LIFT-20, P2·L·Med (pilot):** generate keyframes for
     the **top ~30 lifts**, QA each against its `instructions`, ship as static
     WebP. Only scale to 153 if the pilot clears a form-accuracy bar; otherwise
     fall back to (1) or (3). Pre-generate — never runtime, never on-device.

3. **Licensed / open media (GIF or short clip libraries).** Musclewiki-style
   GIFs, wger, Everkinetic (SVG), ExRx — real humans, accurate, but
   licensing/attribution must be cleared. A licensed GIF set is the most
   reliable path to _animated_ demos if (1)'s stills aren't enough.

4. **Rigged 3D avatar / pre-rendered loops ("animate the man").** The gold
   standard and what the user is picturing: a rigged humanoid + per-exercise
   motion, **pre-rendered to short WebM/Lottie** (don't ship a 3D engine to the
   WKWebView). Cost is the motion authoring × 153 (mocap licensing or hand-key)
   — a multi-month art effort. Best as a _later_ phase once the data model
   (fields in §5) and the mid-workout surface (D-LIFT-14) exist to house it.

**Staging the visual demo:** (1) now → (D-LIFT-19) extend the data model →
(2 pilot) evaluate Nano Banana on 30 lifts → choose (2-scaled), (3 licensed),
or (4 3D) based on the pilot. Each phase is independently shippable and
web-visible.

### D-LIFT-19 · Extend the Exercise data model — **P1 · M·Low**

Add `difficulty`, `tempo`, `lengthenedBias`, `commonMistakes[]`,
`alternatives[]`/`regressions[]`, `media?` to the `Exercise` type. Foundation
for D-LIFT-2, D-LIFT-5, D-LIFT-11, and every demo route above. Backfill
incrementally (the type stays optional-field tolerant).

---

## 6. Suggested sequencing (each a `/goal`-able unit)

1. **D-LIFT-8** (dead `fatigueScore`) + **D-LIFT-10** (invisible injury warning)
   - **D-LIFT-9** (microloading source) — P0/P1 correctness, all small. Fix the
     bugs first.
2. **D-LIFT-18** (render the images we already fetch) + **D-LIFT-14** (form
   guide mid-workout) + **D-LIFT-13** (delete undo) — the highest-leverage UX
   wins, all small/medium, all web-visible.
3. **D-LIFT-1** (weekly sets-per-muscle tally, read-only first) — the headline
   science upgrade; unblocks D-LIFT-3.
4. **D-LIFT-19** (data-model fields) → **D-LIFT-2** (lengthened/SFR ranking) +
   **D-LIFT-5** (strength benchmark / cold-start loads).
5. **D-LIFT-15/16/17** DS + interaction polish; **D-LIFT-11/12** progression
   guards; **D-LIFT-4/6/7** depth (variation, RPE autoreg, split-preference).
6. **D-LIFT-20** the Nano Banana keyframe **pilot** (30 lifts, QA-gated) — only
   after the data model + mid-workout surface exist to house it.

Notes for whoever implements: `programEngine.ts` is correctness-critical and
mirrored to `functions/` in places — plan against the recurring-mistake rules
(single source of truth, cross-tests, persist-every-mirrored-field) and pin new
behaviour with tests before editing. The exercise-science items (D-LIFT-1/2/3/5)
are the kind worth a `/grill-me` against the reference apps (Hevy, Strong,
Fitbod, RP) before locking.
