# Tropos · Programme + Run · Style Alignment Audit

**Purpose:** Bridge between the design mockups (v3-v8 HTML) and the actual Tropos codebase. The mockups are conceptual — they show layout, logic, and information architecture. The implementation must use the EXISTING components and conventions. This doc maps each mockup element to the real primitive.

**Audit source:** verified read of `src/components/ui/`, `src/components/onboarding/`, `src/components/program/`, `src/pages/Onboarding.tsx`, `src/lib/theme.ts`.

---

## What I drew wrong in v3-v8 mockups (so the build doesn't replicate it)

### 🔴 Off-brand elements in the HTML mockups

| What I drew                                                                              | What the app actually uses                                                                                                                                         | Replace with                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Emojis as UI content** (🏋️ 💪 🔥 🏃 🎯 in option pills, win banner, race strip)        | Lucide icons. ZERO emoji content in the codebase. The closest exception is `StreakFlame.tsx` which renders a custom SVG flame, not the 🔥 emoji.                   | Lucide imports for every visual icon                                                                                                                  |
| **Custom segmented control** for the 4 Programme tabs (white-card-on-grey-bg pill style) | No segmented control primitive exists. Patterns: WorkoutSession uses horizontal scrolling pills; DayStepper uses circular tabs.                                    | Build the segmented control as a new primitive matching WorkoutSession's `flex gap-1.5 px-4 py-3` pill pattern, OR use the DayStepper visual language |
| **Hard `1px solid border` cards**                                                        | Soft `var(--ds-shadow-card)` shadow on `bg-card`. No hard borders on standard cards.                                                                               | `bg-card rounded-2xl p-4` with `style={{ boxShadow: 'var(--ds-shadow-card)' }}`                                                                       |
| **Inline `rgba()` shadows** like `0 1px 3px rgba(0,0,0,0.04)`                            | Token `var(--ds-shadow-card)` (= `0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)`)                                                                        | Use the token                                                                                                                                         |
| **"Doubles banner" with hard left-border accent** in onboarding step 8                   | No precedent for left-border-accented banners in the app. Notice cards use `bg-card` + soft shadow + inline icon                                                   | Style as a `bg-card` rounded-2xl with an icon + text; no left border                                                                                  |
| **"Full-screen modal" for Configure Plan**                                               | `BottomSheet.tsx` (vaul wrapper) is the modal primitive. Can be configured `max-h-[95vh]` for near-full-screen if needed. No "full-screen modal" primitive exists. | Use `BottomSheet` with `max-h-[95vh]` OR set `Drawer.Root snapPoints=[1]` for full-height                                                             |
| **Custom progress bar** for onboarding steps                                             | The current Onboarding doesn't show a progress bar — it shows step number ("Step 4 of 12"). My addition is unnecessary.                                            | Use the existing step indicator pattern (or just step count text)                                                                                     |
| **Win banner gradient** (green-to-gold)                                                  | No celebration banner pattern in the codebase. Closest equivalent: `RunSummary` has stat tiles with colours but no gradient banners.                               | Build a new `WinBanner` component as a `bg-card` with `THEME.semantic.positive` accent + Trophy icon, NOT a gradient                                  |
| **Toggle switches with `width: 40px height: 22px` rounded**                              | Hand-rolled toggle in `ProgramSettingsPanel.tsx`: `w-10 h-6 rounded-full` with `w-4 h-4` slider.                                                                   | Match the existing toggle dimensions/style                                                                                                            |
| **Plain-text option pills** in onboarding                                                | `OptionCard.tsx` exists with a specific shape: icon left, label+description stack, animated Check right.                                                           | Use `OptionCard` for every onboarding option selection                                                                                                |

---

### ✅ Things I drew that DO match conventions

| Element                                                       | Verdict                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Circular DayStepper (40px / 48px today with glow)             | ✅ Matches `DayStepper.tsx`                                          |
| Card-based layout with rounded-2xl                            | ✅ Matches Tropos card system                                        |
| Sport-coding: purple lifts, coral runs, teal "now" indicators | ✅ Matches `THEME.semantic.*`                                        |
| Soft tinted backgrounds for race strip                        | ✅ Aligned with `THEME.teal}18` / `THEME.semantic.vitals}1A` pattern |
| Plus Jakarta Sans + Archivo for stat numbers                  | ✅ Matches CLAUDE.md typography spec                                 |
| Bottom nav structure with active brand-purple state           | ✅ Matches current `Layout.tsx`                                      |
| Coachmark for migration onboarding                            | ✅ `Coachmark.tsx` primitive exists                                  |

---

## Mockup element → real component map

Use this when building.

### Onboarding (Section B in v8)

| Mockup element                              | Actual component                                                                                                                                                                                                              | Notes                                                                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step container                              | Existing `Onboarding.tsx` layout                                                                                                                                                                                              | Already in place                                                                                                                                               |
| Option pills (training focus, mode, etc.)   | **`src/components/onboarding/OptionCard.tsx`**                                                                                                                                                                                | `bg-card border border-border` (unselected), `bg: THEME.teal}18 border: THEME.teal}50` (selected). Has icon-left + label + description + animated Check right. |
| Number selection (lifting days, runs/week)  | **`src/components/onboarding/Stepper.tsx`** (if input-style) OR new pill grid matching OptionCard styling                                                                                                                     | Stepper for ±, pill grid for tap-to-select. Both exist conceptually.                                                                                           |
| Doubles banner ("3 days will include both") | `bg-card rounded-2xl p-4` with `Lucide.Info` icon + text. **No left-border accent.**                                                                                                                                          | Match existing notice pattern                                                                                                                                  |
| Weekly preview (step 9 NEW)                 | Same `bg-card rounded-2xl` shell. Day rows: `flex justify-between` with day label left + Lucide icon middle + type label right. Reuse `THEME.brand` for lift, `THEME.semantic.vitals` for run, gradient or two-icon for both. | New layout but uses existing tokens                                                                                                                            |
| "Create my plan" button                     | **`src/components/ui/Button.tsx`** (primary variant)                                                                                                                                                                          | Don't roll custom CTAs                                                                                                                                         |

### Home (Section C in v8)

| Mockup element                    | Actual component                                      | Notes                                                                                            |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| WeekStrip                         | **Existing `src/components/home/WeekStrip.tsx`**      | Already there; extend to read `weekSchedule` + show modality dots                                |
| DayPeekCard                       | **Existing `src/components/home/DayPeekCard.tsx`**    | Already there; extend variants per spec v7                                                       |
| "Today's planned run" hero        | Same DayPeekCard with new "planned" state             | Don't introduce new card shape                                                                   |
| Win banner                        | **NEW component** `src/components/home/WinBanner.tsx` | Card-style (bg-card + soft shadow + Trophy/Award lucide icon). NOT gradient. Auto-dismiss timer. |
| Action buttons (Start, View plan) | **`src/components/ui/Button.tsx`**                    | Match existing primary/secondary variants                                                        |

### Programme — segmented control (Section D in v8)

| Mockup element                                          | Actual component                                                                 | Notes                                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Today / Week / Lift / Run tabs                          | **NEW segmented control** matching `WorkoutSession.tsx`'s scrolling-pill pattern | Don't invent a third pattern. Reuse the existing pill style: `flex gap-1.5 px-4 py-3 overflow-x-auto` with active state as filled pill |
| Or alternative — use the DayStepper-style circular tabs | If 4 tabs always fit, simpler full-width pill row                                | Either works; pick one                                                                                                                 |

### Programme — Week tab (Section D in v8)

| Mockup element                                           | Actual component                                                    | Notes                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schedule row (date · type pill · planned items · status) | **NEW** list row pattern                                            | Build as `bg-card rounded-2xl p-3 flex items-center gap-3`. Reuse existing card shadow.                                                                                       |
| Type pill (Lift / Run / Both / Rest)                     | Inline span with `bg: tokens`                                       | Lift = `THEME.brand}18` text `THEME.brand`. Run = `THEME.semantic.vitals}18` text vitals. Both = `linear-gradient` of the two tints. Rest = `bg-muted text-muted-foreground`. |
| Visible ⋯ overflow menu                                  | **`src/components/ui/IconButton.tsx`** with `Lucide.MoreHorizontal` | Has `aria-label` enforcement. 44px touch target.                                                                                                                              |
| Move/Swap/Skip menu                                      | **`src/components/ui/BottomSheet.tsx`** with action list            | Standard sheet pattern for action menus.                                                                                                                                      |

### Programme — Lift tab

| Mockup element | Actual component                          | Notes                                                   |
| -------------- | ----------------------------------------- | ------------------------------------------------------- |
| **EVERYTHING** | **Existing `Program.tsx` lift code path** | ZERO regression. Just gate it behind the new tab state. |

### Programme — Run tab (Section D in v8)

| Mockup element                                   | Actual component                               | Notes                                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Race strip                                       | **NEW** `src/components/program/RaceStrip.tsx` | `bg-card rounded-2xl p-4` with `THEME.semantic.vitals}1A` overlay, NO hard border, soft shadow. Trophy icon from Lucide for celebration variant. |
| Schedule row                                     | Same as Week tab schedule row                  | Reuse the new primitive                                                                                                                          |
| Plan controls (race goal · run days · view plan) | List row pattern from settings                 | Reuse Settings-style `flex justify-between` rows                                                                                                 |
| "Pause plan" button                              | `Button` secondary variant                     | Existing primitive                                                                                                                               |

### Configure Plan modal (Section E in v8)

| Mockup element                         | Actual component                                                                   | Notes                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Full-screen wizard shell               | **`BottomSheet` with `max-h-[95vh]`** OR **vaul `Drawer` with `snapPoints={[1]}`** | NOT a custom "modal-fullscreen". Tropos uses vaul drawers for this. |
| Step content (training focus, etc.)    | Reuse `OptionCard` from onboarding                                                 | Don't duplicate styling                                             |
| Weekly preview step                    | Same as onboarding step 9 weekly preview                                           | Reuse the same component                                            |
| Confirm step with destruction warnings | `bg-card rounded-2xl p-4` notice cards with `Lucide.AlertTriangle` for warnings    | Notice pattern, not custom gradients                                |
| Progress indicator (Step 5 of 6)       | Step count text only, OR optional `<div>` progress bar matching app patterns       | Don't introduce a new pattern if not needed                         |
| Cancel / Next / Confirm buttons        | `Button` primitive (primary, secondary variants)                                   | Existing                                                            |

### Settings post-migration (Section F in v8)

| Mockup element   | Actual component                                                                      | Notes                |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------- |
| Deep-link banner | `bg-card rounded-2xl p-3` with `Lucide.LayoutGrid` (or similar) icon + text + chevron | Standard notice card |
| Settings rows    | Existing rows in `Settings.tsx` / settings sections                                   | Already in place     |
| Toggle switches  | Existing hand-rolled `w-10 h-6 rounded-full` pattern in `ProgramSettingsPanel.tsx`    | Match this exactly   |

### /run setup (Section G in v8)

| Mockup element | Actual component                 | Notes                                                      |
| -------------- | -------------------------------- | ---------------------------------------------------------- |
| **EVERYTHING** | **Existing `RunSetupModal.tsx`** | Preserved as-is. Only URL param change (`scheduledRunId`). |

### Status states (Section H in v8)

| Mockup element                          | Actual component                                                  | Notes                                      |
| --------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Completion celebration in Today tab     | DayPeekCard with new "completed" state + WinBanner above          | Reuse existing components                  |
| Stats grid (vs target / distance / cal) | `grid grid-cols-3 gap-2` of `bg-muted rounded-xl p-3` tiles       | Existing stat-tile pattern from RunSummary |
| Missed session card                     | `bg-card rounded-2xl p-4` with `Lucide.AlertTriangle` orange icon | Notice pattern with warning colour         |
| Mismatch reconciliation modal           | **`BottomSheet` with title + 2-3 action buttons**                 | Same sheet pattern as elsewhere            |

### Migration UX (Section I in v8)

| Mockup element    | Actual component                      | Notes                                                                      |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| Coachmark on tabs | **`src/components/ui/Coachmark.tsx`** | Already a primitive. Just pass `storageKey="programme-tabs-migration-v1"`. |

---

## Concrete rules for implementation

1. **No emojis as UI content.** Every visual icon = `lucide-react` import. The mockup emojis (🏋️ 💪 🔥 🏃 🎯) map to: `Dumbbell`, `Zap`/`TrendingUp`, `Flame`, `Footprints`, `Target`.

2. **No hard borders.** Cards use `bg-card` + `var(--ds-shadow-card)` only. The mockup's `border: 1px solid` should be deleted.

3. **No `rgba()` inline.** Use `THEME.*` constants from `src/lib/theme.ts` OR Tailwind tokens.

4. **No custom modal-fullscreen.** Use `BottomSheet` (vaul). For Configure Plan: set `max-h-[95vh]` or use `snapPoints={[0.95]}`.

5. **No new button variants.** 5 existing variants (primary, secondary, destructive, ghost, outline) cover everything.

6. **OptionCard for selections.** Onboarding option pills, Configure Plan choices, mode toggles — all use the same `OptionCard` shape.

7. **Segmented control TBD.** No existing primitive. Build it once, reuse it: match the WorkoutSession scrolling-pill aesthetic (`flex gap-1.5 px-4 py-3` + active state as filled pill).

8. **Schedule row TBD.** New primitive for Week tab. Build to match existing card patterns: `bg-card rounded-2xl p-3` with `var(--ds-shadow-card)` and inline elements (date pill / type pill / content / overflow icon).

9. **WinBanner = card, not gradient.** Soft card with Trophy icon + text + auto-dismiss. Reuses card primitive.

10. **Coachmark exists** — just consume it with the right storageKey.

---

## New primitives needed (build these once, reuse everywhere)

Only **3 net-new components** required across the whole v7 spec:

1. **`SegmentedControl.tsx`** — for the 4-tab Programme. Matches WorkoutSession pill aesthetic.
2. **`ScheduleRow.tsx`** — for Week tab list rows. Matches existing card patterns.
3. **`WinBanner.tsx`** — for completion celebration. Card-style, NOT gradient.

Plus 4 component MODIFICATIONS (extending existing):

1. `WeekStrip.tsx` — extend to read `weekSchedule` + show modality dots
2. `DayPeekCard.tsx` — extend with planned/missed/completed/doubles variants
3. `RunSetupModal.tsx` — accept `scheduledRunId` URL param
4. `DayStepper.tsx` — optional coral dot for doubles days

Plus 3 NEW components for spec v7 features:

1. **`RaceStrip.tsx`** — race-prep flagship surface
2. **`ConfigurePlanSheet.tsx`** — wraps BottomSheet with the 6-step wizard
3. **`MismatchReconciliationSheet.tsx`** — wraps BottomSheet for save-time reconciliation

**Total new components: 6.** Plus modifications to 4 existing. The architecture is reuse-heavy by design.

---

## What this means for the mockups

The v3-v8 HTML mockups remain useful for:

- ✅ Layout structure (where things go)
- ✅ Information architecture (what's on which screen)
- ✅ State variants (what each surface looks like in different conditions)
- ✅ Copy + interaction logic

But during BUILD, ignore:

- ❌ Specific colours/shadows from the HTML (use `THEME.*` / tokens instead)
- ❌ Emoji content (substitute lucide icons per map above)
- ❌ Custom CSS patterns (use existing primitives)
- ❌ Gradient backgrounds where the mockup invented them (cards stay flat)

The mockups are **storyboards**. The components are the **actors**. Don't ship the storyboard styling — ship the components.

---

## Recommended build sequence (style-aligned)

1. **P0-A (types + helpers)** — no UI yet
2. **P0-B / P0-C** — pure functions, no UI
3. **NEW: P0-X · component primitives**:
   - `SegmentedControl.tsx`
   - `ScheduleRow.tsx`
   - `WinBanner.tsx`
     Build these first; everything else consumes them. ~0.75 days.
4. P1-1: Programme.tsx adopts SegmentedControl
5. P1-2: TodayTab using existing DayPeekCard + new WinBanner
6. P1-3: ScheduleTab using new ScheduleRow + BottomSheet for action menus
7. ...continue per v7 spec

Total estimate adjusted: still ~17.5 days. The component primitives slot into P0 before the tabs.

---

**End of style alignment audit.**

Send this to the build owner alongside spec v7. Together they prevent mockup styling from leaking into the implementation.
