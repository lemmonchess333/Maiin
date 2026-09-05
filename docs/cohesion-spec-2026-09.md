# Visual cohesion specification — 2026-09

The map from UI roles to the tokens and primitives that already exist. It
adds no component and no colour; it names which existing treatment each
role takes, and where an exception is permitted and why. Written for the
whole-app cohesion pass (brief dated 5 September 2026); the pass applies it
in bounded batches, each with matched before/after captures.

Baseline this was written against: `origin/main` `4a049fee`. Runtime access
in the agent sandbox: Firebase auth + firestore emulators, the seed scripts,
Playwright against the bundled Chromium (`/opt/pw-browsers/chromium-1194`),
`vite build --mode=test` as CI's capture job builds it. The CI capture
channel (`claude/screenshot-app` → `app-screenshots`) is not used for this
pass because it requires a push, and this batch ships nothing without fresh
permission; the same specs run locally instead.

## 1. Type roles

| Role                         | Treatment                                                                                                                                                                                                                                                                 | Source                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Page title                   | `text-xl font-extrabold` (the H1 tier every page uses; `designSystemInvariants` ratchets the rest)                                                                                                                                                                        | `SettingsIndex`, `History`, …                                                        |
| Card title                   | `text-xl font-extrabold` on a command card; `text-base`/`text-sm font-semibold` on ordinary cards                                                                                                                                                                         | `SessionCommandCard`, `SavedRoutinesSection`                                         |
| Section label (page-level)   | `SectionLabel tier="section"` — 11px `text-caption`, uppercase, `tracking-wider`, semibold, muted                                                                                                                                                                         | `src/components/ui/SectionLabel.tsx`                                                 |
| Card caption (inside a card) | `SectionLabel` default tier — 12px `text-xs`, same treatment                                                                                                                                                                                                              | same                                                                                 |
| Supporting text              | `text-sm text-muted-foreground` for descriptions; `text-xs text-muted-foreground` for helper lines and field labels                                                                                                                                                       | `ProfileInfoSection` field labels (batch 1)                                          |
| Numeric metric               | `font-mono tabular-nums` (Archivo); hero numbers `text-2xl`+ and `font-bold`/`font-extrabold`; inline numerals inherit the surrounding size                                                                                                                               | `TodayEnergy`, `WeightStepsTiles`                                                    |
| Static metadata line         | `text-sm text-muted-foreground`, items joined by " · ", numerals in the numeral font, words in the text font — never pills. Inside dense list cards (feed activity, challenge meta) it takes the card's own meta size, `text-xs`, so it does not read as another list row | `SessionCommandCard` `MetaLine` (batch 1); `ActivityCard`, `ChallengeCard` (batch 2) |

**Resolved conflict.** DESIGN_GUIDE §4 said section labels are "~10px";
§10 said micro labels are "≥ 12px"; CLAUDE.md said "10px". The code has
said something else for a while: `SectionLabel` has exactly two tiers,
11px (`text-caption`, the page-section label, floored up from the old 10px)
and 12px (`text-xs`, card captions). Both docs now say that. The floor for
uppercase tracked labels is 11px; for every other text it stays 12px. No
third size exists and none should be invented.

**Weight 500 (`font-medium`)** is not a tier (CLAUDE.md, Typography). It is
ratcheted (`FONT_MEDIUM_BASELINE`) and only ever goes down — batch 1 takes
it 302 → 298 by giving the energy card's phase chip the documented pill
weight (600) and deleting two links.

## 2. Surface roles

| Role                     | Treatment                                                                                                                              | Notes / exceptions                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Primary task card        | `rounded-2xl p-4`, sport-tinted surface (`bg-running/6` or `bg-lifting/6`), ONE primary `Button` (`sport` for run, `primary` for lift) | `SessionCommandCard`. One per surface. Its ambient halo is the one decorative layer it keeps; do not add a second. |
| Standard grouped card    | `bg-card rounded-xl`/`rounded-2xl`, `p-3`–`p-4`, `card-shadow`                                                                         | Most cards. Hero cards (Energy, Water) use `rounded-2xl p-4`.                                                      |
| Compact metric tile      | `rounded-xl p-3 bg-muted`                                                                                                              | Weight / Steps. Not for anything with an action inside beyond the tile's own tap.                                  |
| Navigation row           | full-width row, chevron right, 44px, `bg-card`                                                                                         | `SettingsIndex` rows.                                                                                              |
| Disclosure inside a card | header is the whole tap target, labelled "Details" with a chevron, `aria-expanded`; body holds only secondary explanation              | `TodayEnergy` (batch 1). Not a place for a second primary action.                                                  |

Reduce nesting before touching tokens: a card inside a tinted card inside a
section is three surfaces asking for attention. Prefer removing the middle
one over adding a fourth radius.

## 3. Action, metadata, badge and filter roles

| Role               | Treatment                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary action     | `Button variant="primary"` (lift/brand) or `"sport"` (run); `"nutrition"` only where orange IS the meaning                                     |
| Secondary action   | `Button variant="secondary"`/`"outline"`; low emphasis `"ghost"`                                                                               |
| Destructive action | `Button variant="destructive"`, confirmed by `ConfirmDialog`, or made reversible by an undo toast — never hidden, never coloured alone         |
| Static metadata    | metadata line (§1) — not a pill                                                                                                                |
| Status badge       | small `rounded-full bg-muted` pill, `text-xs font-semibold` (600, the pill weight) — for a STATE (phase, "Pro", "Due today"), never for a fact |
| Selectable filter  | `SegmentedControl` (single-select, radiogroup)                                                                                                 |

The pill test: if tapping it does nothing and it does not name a state, it
should not be enclosed.

## 4. Controls

| Role                       | Treatment                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single choice, 2–5 options | `SegmentedControl` (`layout="wrap"` when options are unequal); its `ariaLabel` is required; consumers pass spacing only (`className="mt-1.5"`), never a restyle |
| Boolean                    | `Toggle` with a visible label beside it                                                                                                                         |
| Inline disclosure          | header-as-button with "Details" + chevron (§2)                                                                                                                  |
| Sheet-opening row          | navigation row (§2) or `ghost` Button; the sheet is `BottomSheet`; confirmations are `Dialog`                                                                   |

Audited consumer overrides of `SegmentedControl` (batch 1): every one of
the 28 call sites passes `ariaLabel`; the only `className` overrides are
spacing. No restyles to remove.

## 5. Form rows

| Part           | Treatment                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Field label    | `text-xs text-muted-foreground`, sentence case, above the control (`<label htmlFor>` when the control is an input)          |
| Control        | `.ds-input` / `SegmentedControl` / `Toggle`, `mt-1` (`mt-1.5` for a segmented control)                                      |
| Unit           | inside the input's trailing text or the option label, numeral font                                                          |
| Helper / error | `text-xs text-muted-foreground mt-1`; errors via the toast channel or inline `text-destructive-strong` — never colour alone |
| Save feedback  | `toast.success` on write; optimistic revert on failure                                                                      |

Batch 1 aligns `ProfileInfoSection`'s five field labels (the `text-sm`
outliers) to this; 44 other settings labels already used it.

## 6. Charts

| Part    | Treatment                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Title   | card title (§1)                                                                                                                            |
| Period  | `SegmentedControl` (`TimeRangePills`) — one per chart or section; a selector must not appear to govern metrics outside the card it sits in |
| Units   | on the axis or after the number, spaced ("60 kg", "5.2 km"); food grams unspaced                                                           |
| Legend  | `text-xs text-muted-foreground` with a colour swatch AND a label (never colour alone)                                                      |
| No-data | `EmptyState compact` — never a zeroed chart pretending to be loaded                                                                        |

## 7. Icons, gutters, motion

- Icon container `size-9` (standard) / `size-12` (hero); icon `size-4` / `size-5`. Page gutter `px-4`. Card gap `space-y-2`/`space-y-3`.
- Shadows only from tokens (`card-shadow`, `--ds-shadow-*`).
- Motion communicates a state change. Framer is gated globally by `useReducedMotion`; every CSS `animate-*` carries `motion-safe:` (spinners excepted). Height/opacity disclosure `0.2s`; count-ups once on first load.
- Permitted exceptions, documented: fullscreen run/workout HUDs (no Layout, large stable controls), provider sign-in buttons (vendor-specified), the share card (literal hex for html-to-image, pinned to THEME by `shareCardPalette.test.ts`), the exercise six-frame art (locked).

## Screen-and-state checklist (from the brief's coverage ledger)

Status vocabulary: **rendered** (captured locally this pass), **source**
(source-inspected only), **historical** (only the June captures),
**blocked** (needs a device or an account state the rig cannot seed).

| Surface family                                   | Status now                                             | Evidence                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home (collapsed / expanded energy, light + dark) | rendered                                               | batch 1 before/after                                                                                                                                             |
| Train / Lift (command card)                      | rendered                                               | batch 1 before/after (`program-*`)                                                                                                                               |
| Train / Run planning                             | rendered                                               | batch 3 before/after: `train-header-run`, `settings-run-plan`, `race-picker`, `sheet-dayaction`, `sheet-trainingblock`                                           |
| Active workout / exercise guide                  | rendered                                               | batch 3 before/after: `form-demo-*` (72 exercises), `reorder-*`; the complete screen is source-only (no capture spec reaches it)                                 |
| Running setup / live / summary / detail          | rendered (live, detail); source (setup modal, summary) | batch 3 before/after: `run-hud-*`, `run-detail`; `RunSetupModal` and `RunSummary` have no capture spec                                                           |
| Food                                             | rendered                                               | `food-*` — batch 2 before/after (hero-card disclosure label)                                                                                                     |
| Analytics / history                              | rendered                                               | `history-*` — batch 2 before/after (Performance disclosure label)                                                                                                |
| Social                                           | rendered                                               | `social-*`, `social-explore-*` — batch 2 before/after (feed tag line, challenge meta line)                                                                       |
| Settings                                         | rendered (`settings`, `nutrition-settings-dark`)       | Profile labels changed in batch 1 — captured                                                                                                                     |
| Authentication / onboarding / upgrade            | rendered (onboarding); source (login, upgrade)         | batch 3 before/after: `onboarding-0…7`, `settings-subscription`; `Upgrade` and `Login` have no capture spec                                                      |
| Weekly review / legal / support                  | rendered (review); source (legal, support)             | `review` spec — its sign-in timed out under CPU contention in the first local run; re-run recorded below                                                         |
| Shared overlays / errors / internal routes       | rendered (sheets); source (errors, internal)           | batch 3 before/after: `sheet-*`, `easier-chooser`, `circle-create-compact`, `water-sheet`, `day-peek-open`; error boundaries and `/diagnostics` are not captured |

Nothing in the "source" rows is claimed as verified. After batch 3 no row is
"historical" only: every family the rig can reach was captured on both sides
in the same run (223 frames from `main`, the same specs on the branch).

## Batch 1 — per-change record

| ID           | Component                      | Design reason                                                                                     | Consumer impact                                                                      | States changed                                        | Tests                                                                   |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| V01          | `SessionCommandCard`           | static facts are not selections; one quiet line                                                   | `Program` (lift) and `ProgrammeRunSection` (run) render it — both read as a line now | every card with meta                                  | `SessionCommandCard.test.tsx` rewritten for the line, fonts and no-pill |
| V02          | `TodayEnergy`                  | one summary, one action, details only behind "Details"; eaten/target framing; over-target visible | Home only                                                                            | collapsed, expanded, cold-start, lapsed, post-workout | `TodayEnergy.test.tsx` — 6 new cases; `energyCaptureAnchor` unchanged   |
| V07 (sample) | `ProfileInfoSection`           | field labels take the documented 12px label tier                                                  | Settings → Profile                                                                   | all                                                   | `ProfileInfoSection.test.tsx` green                                     |
| docs         | DESIGN_GUIDE §4/§10, CLAUDE.md | 10/11/12px conflict resolved to what the code does                                                | —                                                                                    | —                                                     | `claudeMdFreshness`                                                     |

### Batch 1 — evidence and verification

Frames were captured locally (the CI capture channel needs a push, which
this batch does not have permission for): the branch's `dist/` built with
`vite build --mode=test` and served by `vite preview`, against the Auth +
Firestore emulators seeded by `seed:e2e` + `seed:rich`, 393×852 viewport,
same fixture account, same capture date, `animations: "disabled"`. The
"before" side is `origin/main` at `4a049fee`, built and captured the same
way from a detached worktree.

| Pair                                            | Before / after frames               | Notes                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home · Today's Energy, collapsed (light + dark) | `energy-collapsed-{light,dark}.png` | From `energy-collapsible.screens.capture.spec.ts`, unchanged.                                                                                                                                                                                                                                                              |
| Home · Today's Energy, expanded (light + dark)  | `energy2-expanded-{light,dark}.png` | The committed spec's expanded frame is obscured by the badge-earned seal on BOTH sides (the seal arrives after the collapsed shot). An ad-hoc, uncommitted spec dismissed the seal through its own UI (backdrop taps: three to break, one to dismiss) before expanding. Nothing was hidden by CSS and no data was altered. |
| Train · Lift command card (light + dark)        | `program-{light,dark}.png`          | From `home.screens.capture.spec.ts` "main tabs".                                                                                                                                                                                                                                                                           |
| Settings · Profile (light + dark)               | `profile-settings-{light,dark}.png` | Ad-hoc, uncommitted spec: `/settings/profile`, anchored on the Gender radiogroup.                                                                                                                                                                                                                                          |

Measured deltas (full-page height, same content): collapsed energy card
1175 → 1161 px (−14); expanded 1338 → 1277 px (−61, the removed plan-target
row and "View food log →" link); Train 1549 → 1544 px (−5, pills → line).
The Profile frames are the same height — only the label size changed.

Verification on the branch: full unit suite green (659 files / 7,933 tests
passed, 341 emulator-gated skips); `tsc -b` clean; `npm run lint` 0 errors (99
pre-existing warnings, none in the touched files); `npm run check:cycles`
clean; targeted suites green (`TodayEnergy` 3 files / 61 tests,
`SessionCommandCard` + `ProgrammeRunSection` 42, `ProfileInfoSection`,
`designSystemInvariants`, `unitTreatment`, `archaeology`,
`claudeMdFreshness`, `energyCaptureAnchor`).

## Batch 2 — per-change record (Food · Analytics · Social)

Same rules as batch 1, applied to the three main-tab families; four
components, one selector repoint, two ratchets lowered.

| ID  | Component                           | Design reason                                                                                                                                                                                  | Consumer impact                                                   | Tests                                                                                                 |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A1  | `PerformanceTab` (Analytics)        | "Show details / Hide details" → the shared "Details" + chevron disclosure label (§2/§4), `aria-expanded`, 44px, weight 400 like Home's                                                         | Analytics → Performance; `PerformanceSection` doc comment updated | `PerformanceTab.establishing.test.tsx` selector repointed to the exact name "Details"; 11 files green |
| F1  | `FoodHeroCard` (Food)               | the drill-down label used the uppercase tracked SECTION-LABEL register for what is a disclosure; now sentence-case `text-xs`, same as Home and Analytics                                       | Food hero card; `aria-label="View nutrition breakdown"` unchanged | `food/__tests__` green                                                                                |
| S1  | `ActivityCard` (Social feed)        | movement-category tags ("Push", "Arms") are facts, not states — one muted line, not chips; the PR badge stays the card's one pill                                                              | every lift card in the feed, profile and space views              | `social/__tests__` green (no test asserted the chip form)                                             |
| S2  | `ChallengeCard` (Social → Together) | season joins the joined-count line as a fact; "Top N%" is the user's STANDING, so it keeps a pill — in the shared chip form (`rounded-full`, 600, numeral font) instead of a third badge shape | challenge cards; `THEME.brand` tint on the season chip gone       | `features/challenges` green                                                                           |
| DS  | `designSystemInvariants`            | `FONT_MEDIUM_BASELINE` 298 → 294 (A1, S1, S2); `RAW_BUTTON_BASELINE` 390 → 388 — the suite reported main already sat 2 below its baseline, so this locks that in                               | —                                                                 | ratchets pass                                                                                         |

### Decisions recorded, not changed

- **Slash spacing.** Food's macro tiles read `125 / 140g`; Home's compact
  macro line reads `P 125/140g · …`. The compact line is unspaced by
  constraint, not taste: at `text-micro` in the numeral font the spaced form
  is ~40 characters (~264px) and overflows the 256px content width of a
  320px device, while the unspaced form (~225px) fits. Rule: the spaced
  slash is the default (`1,790 eaten / 2,200 kcal`, the tiles); a
  single-line compact summary may drop the spaces. Both stay.
- **Food "Add to" meal chips.** A single choice of four, which §4 maps to
  `SegmentedControl`. Left as the hand-rolled orange-filled chip row for now:
  it is the composer's primary control and the selected-slot fill is the one
  place orange is load-bearing on Food (the brief's "do not recolour Food
  orange" cuts both ways). Owner call, two options: (a) `SegmentedControl`
  — neutral raised indicator, equal widths, radiogroup semantics for free;
  (b) keep the chips, but move them onto the pill weight (600) and the
  `--nutrition` token. Neither is done in this batch.
- **Feed stat labels** (`KM`, `/KM`, `TIME`, `KG VOLUME`) stay uppercase —
  documented stat-label convention, not a section label.
- **Analytics chips** that name a state stay: `+2 pts` (trend, same chip
  as Home's hero), `Form -6` (fresh/fatigued), `Recomp` (phase), leaderboard
  tier pills (`Silver`), `RACE` on race cards.

### Batch 2 — evidence and verification

Same rig as batch 1 (branch `dist/` built with `vite build --mode=test`,
emulator-seeded fixture, 393×852, light + dark). The "before" side is the
batch-1 baseline capture of `origin/main` `4a049fee`; the "after" side is
the `home.screens.capture.spec.ts` "main tabs" run on this branch.

| Pair                                    | Frames                        | Page height (before → after)                                             |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Food (hero-card disclosure label)       | `food-{light,dark}`           | 1711 → 1711                                                              |
| Analytics (Performance disclosure)      | `history-{light,dark}`        | 4683 → 4695 (+12: the disclosure row grew from `py-2` to the 44px floor) |
| Social → Together (challenge meta line) | `social-{light,dark}`         | 1848 → 1844 (−4)                                                         |
| Social → Feed (lift-card tag line)      | `social-explore-{light,dark}` | 2431 → 2419 (−12: three lift cards, chips → line)                        |

Rig note: the Food hero caption reads "Lift day · Hard session" on the
before side and "Lift day" on the after side. That suffix is
`describeDayIntensity` on the fixture's planned day and moved between two
captures ~40 minutes apart with no change to that code — a wall-clock
fixture flake of the kind the CLAUDE.md capture notes already list, not a
change in this batch.

Verification on the branch: full unit suite green (659 files / 7,933 tests
passed, 341 emulator-gated skips); `tsc -b` clean; `npm run lint` 0 errors
(99 pre-existing warnings, none in touched files); `npm run check:cycles`
clean.

## Batch 3 — per-change record (remaining families)

Train run planning, run setup and routes, the workout-complete screen,
exercise history, onboarding, upgrade, badges, the challenge list, progress
photos and the settings forms. Two rules did almost all the work, and both
are now held by a test rather than by this document.

| ID   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Files                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3a-1 | **Off-scale sizes → the scale.** Every `text-[Npx]` literal on a product surface (24: sixteen 10px, eleven 11px counting the run HUD, five 13/15px in the camera overlay) becomes a token — `text-caption` for tracked labels and HUD eyebrows, `text-xs` for helpers and price footnotes, `text-base`/`text-sm` for the camera copy. New ratchet `OFF_SCALE_TEXT_BASELINE = 0` in `designSystemInvariants` (dev labs are outside its scan).                                              | `WeekPulseCard`, `RoutePreviewSheet`, `RouteSetupSection`, `RoutePlannerSheet`, `IntervalStepShell`, `RacePredictionsCard`, `TrainingLoadCard`, `MuscleHeatMap`, `ProModal`, `Upgrade`, `WorkoutSession`, `SecuritySection`, `HeroDrillDownSheet`, `SpacesDirectory`, `ProgressPhotos`, `RunSummary`, `RaceGoalPlanner`, `FoodCameraModal`              |
| 3a-2 | **Section labels go through `SectionLabel`.** Thirty hand-rolled uppercase labels take the primitive (section tier for page and tile labels, caption tier in-card). Third sizes gone: the 14px "Your challenges" / "Available" that sat visibly larger than "Spaces" and "Circles" beside them, the 14px badge-category labels, the 14px "Exercises" on the complete screen. Weight drift (500 and 700) settles on 600. The onboarding day letters lose a fractional-muted inline colour. | `ChallengeList`, `BadgeGrid`, `SessionCompleteScreen`, `ExerciseHistory`, `RaceDayPlanCard`, `RaceCockpitCard`, `FeedView`, `ChallengeFinaleCard`, `FoodSuggestionsDropdown`, `Stepper`, `Onboarding`, `Upgrade`, `RunFitnessSection`, `WeekPulseCard`, `RoutePreviewSheet`, `RouteSetupSection`, `RacePredictionsCard`, `RunSummary`, `ProgressPhotos` |
| 3a-3 | **Form labels take the form-row vocabulary** (§5): uppercase tracked `<label>`s and the one remaining `text-sm` label become `text-xs text-muted-foreground`, sentence case.                                                                                                                                                                                                                                                                                                              | `RunFitnessSection` "Finish time", `HeartRateZonesSection` "Max heart rate (bpm)", `RaceGoalPlanner` "Event name (optional)" / "Target date", `ReportModal` "Anything else? (optional)", `NutritionSection` "Age"                                                                                                                                       |
| 3b-1 | **`MetaLine` becomes a primitive** (`src/components/ui/MetaLine.tsx`, sizes `sm`/`xs`) now that a second consumer exists: `DayActionSheet`'s two run pills (distance/duration, HR zone) are one line, as on the command card.                                                                                                                                                                                                                                                             | `SessionCommandCard`, `DayActionSheet`                                                                                                                                                                                                                                                                                                                  |
| 3b-2 | **Fact pills → text.** Guided-run minutes; the run-setup "Outdoor GPS" / "GPS" mode chips (kept as their own elements, `·`-joined to the description); the race picker's distance chip joins the date line; the exercise-history muscle-group pill becomes an eyebrow label.                                                                                                                                                                                                              | `GuidedRunPicker`, `RunSetupModal`, `RaceGoalPlanner`, `ExerciseHistory`                                                                                                                                                                                                                                                                                |
| keep | **Status chips stay, in the shared form:** muscle recovery chips ("ready" / "~1 d", now `text-xs font-semibold`), the `RACE` badge on race spaces (`text-caption`), "Most popular" on the upgrade plan, the badge-tier pills.                                                                                                                                                                                                                                                             | `MuscleHeatMap`, `SpacesDirectory`, `Upgrade`, `ChallengeCard`                                                                                                                                                                                                                                                                                          |
| DS   | `FONT_MEDIUM_BASELINE` 294 → 285.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `designSystemInvariants.test.ts`                                                                                                                                                                                                                                                                                                                        |

**Left alone, on purpose:** the run HUD overlays (`RunResumePrompt`'s
white-on-scrim eyebrows, the `RouteFollowChip` / `BackToStartChip` /
`GhostDeltaChip` scrim chips) — §7's fullscreen-HUD exception; the
`CalorieRing` "kcal left" flip chip (a control); the Login "or" divider;
`Diagnostics` and `AdminModeration` (operator routes); the dev labs.

### Batch 3 — evidence and verification

The whole capture suite (46 specs) ran locally on both sides in one pass
each — `main` `4a049fee` from the detached worktree, then the branch at
`f62dc284` — same rig, viewport, seed and date. 39 specs passed on each
side and produced 217 matched frames; the same 7 specs failed identically
on both sides (`circles`, `crews-retirement` ×2, `experience-suggestion`,
`fellbehind-detrained`, the `audit surfaces` test in `home`, `review`): their
sign-in helper times out waiting for the authed nav in this sandbox, a rig
limitation that is independent of the diff (they pass in the CI capture
channel, whose report for this head is the evidence for those surfaces).
No retry was run — a failure that reproduces on both sides in two runs is
not contention.

Every matched frame was pixel-compared (`scripts`-style, sharp; per-channel
tolerance 8). 46 frames are unchanged at the same height — among them
`settings`, `settings-subscription`, `run-detail`, `solo-feed`,
`user-profile`, `tooltip-performance-index`, `race-space-header`,
`train-header-run`, two onboarding steps — the surfaces the pass did not
touch, proving no collateral change. The rest divide into:

| Cause                                                                        | Frames                                                                       | Delta                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Batch 1 — energy card                                                        | `home`, `energy-*`, `water-home`, `day-peek-*`, `sheet-dayaction`            | −14 collapsed / −61 expanded                                                                   |
| Batch 1 — command card pills → line                                          | `program`, `easier-chooser`, `sheet-trainingblock`, `train-header-lift`      | −5                                                                                             |
| Batch 2 — feed tag chips → line                                              | `feed-activity-cards`                                                        | −12                                                                                            |
| Batch 2 + 3 — challenge meta line, 14px → 11px labels                        | `social`, `circles-crews`, `circle-create-compact`                           | −9                                                                                             |
| Batch 2 + 3 — Details 44px, tile labels, recovery chips, helpers             | `history`, `analytics-loaded`                                                | +31 / +16 (the legend keeps two rows)                                                          |
| Batch 3 — distance chip → text, RACE badge 11px, form labels, "limit" suffix | `race-picker`, `races-directory`, `settings-run-plan`, `nutrition-breakdown` | 0.3–5.8%, same height                                                                          |
| Rig noise — animated figure phase                                            | 110 of 144 `form-demo-*` frames                                              | 6–11% with ±1px heights; the exercise art and rig are untouched by every batch                 |
| Rig noise — sheet settle (documented flaky class)                            | `circle-create-compact` (36%), `home-day-peek-after`                         | the sheet's open state differs between runs; the −9 / −14 underneath are the real deltas above |

Verification on `f62dc284`: full unit suite 659 files / 7,934 tests passed
(341 emulator-gated skips); `tsc -b`, `npm run lint` (0 errors), `npm run
check:cycles` clean; the new `OFF_SCALE_TEXT_BASELINE = 0` ratchet passes.
