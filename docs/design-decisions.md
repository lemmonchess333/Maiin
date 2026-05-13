# Tropos launch design decisions and settings allocation plan

## Purpose

This is a pre-launch working plan for one specific product problem: Settings has become the fallback home for controls that are really training, running, food, workout, or account workflows. This document defines what should stay in Settings, what should move, the preconditions for moving it, and the guardrails that prevent another broad redesign spiral.

This is not a user-facing document, not a styled design artefact, not a roadmap for a team, and not a second source of truth that overrides the app. Existing in-app implementation, launch specs, and locked decisions remain canonical.

## Non-negotiable launch rule

If a change is not on the critical path to App Store submission, stability, payment readiness, privacy, legal/compliance, or an obvious user-facing UX breakage, do not start it before launch.

Pre-launch improvements must be cheap, reversible, and narrowly scoped. A good pre-launch change removes confusion or risk. A bad pre-launch change creates a new system, new visual language, new migration, or new debate.

## Root cause, not just symptom

The symptom is that Settings feels overloaded.

The root cause is that training-plan management features were added before every workflow had a clear product home. Settings became the dumping ground because it was available, not because it matched the user’s intent.

Prevent this from recurring with one default question for every new control:

> Which surface owns this user intent?

Settings is the answer only when the intent is defaults, account, privacy, notifications, support, legal, subscription management, or an escape hatch. If the intent is planning training, starting a run, adjusting food targets, reviewing progress, or sharing activity, Settings is probably the wrong primary home.

## Locked design direction

Premium means restraint. Use subtraction over addition. Prefer hairline borders, clean spacing, calm hierarchy, and one obvious primary action. Avoid decorative gradients, pastel card floods, noisy illustrations, fake-polished artefacts, and invented parallel token systems.

Use existing implementation tokens and visual decisions. Do not introduce new standalone palettes in docs or mockups. Current locked references include primary purple around `#7C6BF0`, scan/action coral around `#FF6B4A`, and existing macro colors for nutrition.

Do not relitigate locked implementation decisions in broad planning notes. Food has scan/logging as a hero-level experience. Programme has existing interaction decisions such as long-press context menus, swipe delete, and reorder mode. Exercise Picker should stay fast and direct: no extra info buttons and no Done-button clutter unless a proven usability problem requires it.

## Core product principle

Settings controls defaults and account-level choices. Domain surfaces own the work.

- Home answers: what matters today?
- Programme answers: what is my training plan?
- Run answers: what run am I doing now and how do I start it safely?
- Food answers: what am I eating and are today’s targets right?
- Workout/session surfaces answer: how do I execute this session?
- History answers: what happened and what is improving?
- Social answers: what am I sharing or doing with other people?
- Settings answers: what are my defaults, account controls, privacy, notifications, subscription, and support options?

## What belongs in Settings

Keep these in Settings as primary workflows:

1. Profile basics: name, avatar/profile shortcut, height, weight baseline, basic account identity.
2. Units and appearance: metric/imperial, theme, display preferences.
3. Privacy and safety: default visibility, blocked users, privacy zones, auto-post defaults.
4. Notifications: meal reminders, workout reminders, streak reminders, permission-related preferences.
5. Subscription/account: current tier, trial state, manage/cancel links, sign out, account deletion/support paths.
6. Support/legal: privacy policy, terms, diagnostics/support links if needed.
7. Global defaults: default rest timer, default auto-rest preference, default run audio-cue preference, default availability summary.
8. Gear inventory if no stronger dedicated home exists: shoe list, retire shoe, add shoe, default active shoe.

Settings can link to domain surfaces, but it should not duplicate their full workflows.

## What should not be primary in Settings

These can appear as summaries or links, but Settings should not be their main workspace once replacement surfaces exist:

1. Race goal creation.
2. Race plan progress and phase tracking.
3. This week’s run prescriptions.
4. Run-template overrides and swaps.
5. Full weekly schedule planning.
6. Nutrition target editing.
7. TDEE recalculation as a routine food workflow.
8. Per-session audio cue decisions.
9. Live rest-timer adjustment.
10. Running shoe mileage warnings that affect today’s run.
11. Training-plan rebuild flows beyond an escape-hatch link.

## Replacement readiness rule

Do not remove a workflow from Settings until the replacement surface is present, discoverable, and handles the same minimum user need.

Use this binding rule:

> Delete or collapse the Settings workflow in the same PR that introduces the replacement surface, not before and not months later.

This prevents both regressions and duplication rot.

## Move matrix with preconditions

| Workflow | Current / likely Settings role | Better primary home | Replacement status | Concrete move trigger | Settings after move |
|---|---|---|---|---|---|
| Race goal creation | Full form or mode setup | Programme → Running | Replacement pending | Programme has a Running section where race distance/date can be created, validated, previewed, saved, edited, and abandoned | Summary row: `Race Prep · 10K · Manage in Programme` |
| Race plan progress | Week/phase/progress block | Programme, with tiny Home/Run context if useful | Replacement pending | Programme displays race, date, current week, phase, next run, and plan health | Read-only summary only |
| This week’s runs | Dropdown list in Training Settings | Programme → Running and Run pre-start | Replacement pending | Programme shows weekly prescriptions and Run can start the next prescribed run | Remove dropdowns from Settings |
| Run swaps / overrides | Raw select menu | Programme swap sheet | Replacement pending | User can swap a run from Programme with recommended alternatives and confirmation | Advanced link only, if any |
| Weekly schedule planning | Day cycle editor | Programme planner / onboarding edit | Replacement pending | Programme can edit availability and show plan impact before save | Default availability summary + Manage link |
| Nutrition target editing | Nutrition Settings controls | Food target sheet | Replacement partially ready only if Food can save target changes | Food has target sheet for calories/macros/phase/TDEE with clear save behavior | Defaults summary + Manage in Food |
| TDEE recalculation | Settings calculator | Food target sheet or onboarding edit | Replacement pending | Food target sheet exposes recalculation without leaving Food | Advanced fallback link only |
| Default rest timer | Settings preference | Settings + workout session | Keep in Settings as default | Workout session can override current rest without changing default | Keep default in Settings |
| Live rest timer | Not a setting | Workout session | Replacement should be session UI | Session allows adjustment while training | No Settings workflow |
| Default voice/audio cues | Settings preference | Settings default + Run setup per-run | Keep in Settings as default | Run setup exposes per-run voice cues | Keep default in Settings |
| Per-run voice cues | Settings today if overused | Run setup | Replacement pending | Run setup lets user toggle for this run | No Settings workflow |
| Shoe inventory | Settings | Settings, with context in Run/History | Keep in Settings | Run/History show warnings and active shoe context | Keep inventory management |
| Shoe mileage warning | Hidden/settings/history | Run pre-start + History | Replacement pending | Run warns if active shoe is near retirement; History shows detail | No primary Settings warning |
| Subscription management | Settings/account | Settings | Replacement ready | N/A | Keep status, tier, manage/cancel links |
| Paywall presentation | Sometimes Settings/Upgrade | Near gated feature plus Upgrade page | Feature-dependent | Gated action explains why Pro is needed and links to upgrade | Settings shows subscription status only |

## Settings section target shape

Settings should read like a calm account/control surface, not an operational planner.

Preferred pattern:

```text
Section title
Short current-state summary
Primary link if the user needs to manage it elsewhere
Optional small default control if it truly belongs in Settings
```

Example Training row after Programme replacement exists:

```text
Training defaults
10K Race Prep · Week 1/23 · 3 lift + 2 run
[Manage in Programme]
```

Example Food row after Food target sheet exists:

```text
Food defaults
2,300 kcal · Performance phase · Macro targets set
[Manage in Food]
```

Example Workout row:

```text
Workout defaults
Rest timer 2:00 · Auto-start on
[Edit defaults]
```

Example Run row:

```text
Run defaults
Voice cues on · Outdoor GPS default
[Edit defaults]
```

Do not show full race setup, full food target calculators, or weekly prescription dropdowns inside Settings once their replacement exists.

## Home constraints

Home is today’s command centre, not a universal dashboard.

Home may show:

1. Today’s next best action: start lift, start prescribed run, log food, rest cue, or streak-protecting action.
2. Today’s schedule at a glance: lift/run/rest/both.
3. Today’s food/energy state at a glance.
4. A streak or momentum signal.
5. One concise insight if it helps today’s decision.
6. Small links into Programme, Run, Food, or History.

Home must not contain:

1. Full forms.
2. Full analytics.
3. Settings controls.
4. Race plan creation.
5. Full race calendar editing.
6. Nutrition target editing.
7. TDEE calculation.
8. Shoe inventory management.
9. Social feed management.
10. Multi-step rebuild flows.

Home creep test: if the user can edit a long-term system from Home, it probably belongs elsewhere. Home can start or link; it should not manage.

## Programme constraints

Programme owns training structure. Race Prep belongs here only when it is implemented as part of plan management rather than as a settings form.

Programme may show:

1. Current week and phase.
2. Strength sessions.
3. Running prescriptions.
4. Race goal summary.
5. Plan adjustments with clear consequences.
6. Run swaps with recommended alternatives.
7. Availability editing when the user is explicitly managing the plan.

Programme must not become cluttered with account defaults, nutrition calculators, subscription settings, or full analytics.

Concrete trigger for collapsing Training Settings:

> When Programme has a Running area with weekly run prescriptions visible and editable, remove the corresponding run prescription fields/dropdowns from Training Settings in that same PR.

Minimum Programme Running area before moving Race Prep out of Settings:

- Race distance and target date visible.
- Current week and phase visible.
- This week’s runs visible.
- User can start a listed run or reach Run setup with the selected template.
- User can edit, abandon, or rebuild the plan with confirmation.
- Invalid/incomplete race-prep states have a clear recovery path.

## Run constraints

Run owns pre-run setup and live execution.

Run may show:

1. Today’s prescribed run when one exists.
2. Free run and other run type choices as secondary options.
3. GPS/manual/treadmill choice.
4. Per-run voice cues.
5. Pace/target settings.
6. Active shoe context and warnings.
7. Safety or GPS quality warnings.

Run must not own long-term race plan creation, full weekly schedule editing, nutrition target editing, or account-level settings.

Run hierarchy rule: if a prescribed run exists, it is the default hero. Other run types remain available but visually secondary.

## Food constraints

Food owns food execution and immediate target correction.

Food may show:

1. Today’s calorie and macro targets.
2. Why today’s target changed, such as lift/run/both day adjustment.
3. Scan/log/manual input as the main action.
4. Meal sections and quick-add.
5. A target explanation or adjustment sheet.

Food must not become a full training planner or analytics dashboard. It should not send users to the top of Settings just to understand or correct the target displayed on Food.

Concrete trigger for shrinking Nutrition Settings:

> When Food has a native target sheet that can explain and edit calorie/macro/phase/TDEE inputs safely, collapse Nutrition Settings to a summary and Manage in Food link in the same PR.

Minimum Food target sheet before moving target editing out of Settings:

- Shows current calories and macros.
- Explains source of target: default, phase, day type, exercise adjustment, or manual override.
- Allows safe edit or recalculation.
- Clearly distinguishes “today only” from “default going forward” if both exist.
- Saves successfully and updates Food without route hunting.

## History constraints

History owns evidence after the fact.

History may show:

1. Running analytics.
2. Lifting analytics.
3. Nutrition analytics.
4. PRs.
5. Badges.
6. Shoe mileage detail.
7. Race-prep adherence after enough planned/completed data exists.

History must not own setup or editing for Race Prep, weekly schedule, food targets, or workout defaults.

## Social constraints

Social owns community and sharing.

Social may show:

1. Activity feed.
2. Crews.
3. Challenges.
4. Leaderboards.
5. Comments/reactions.
6. Shareable milestones such as race-plan created, long run completed, PR hit, race week started, or race completed.

Social must not own private planning, target setting, or account/privacy defaults beyond links to Settings where needed.

## Subscription and paywall placement

Settings owns subscription status and management:

- Current tier.
- Trial state.
- Renewal/cancel/manage links appropriate to platform.
- Restore purchase path if applicable.
- Account-level billing support.

Paywall presentation belongs near the gated feature:

- If scan quota is reached, the Food scan surface explains the gate and links to upgrade.
- If a Pro analysis is gated, the analysis surface explains the gate and links to upgrade.
- If a social or advanced analytics feature is gated, that feature explains the gate and links to upgrade.

Settings should not be the only place users discover why a feature is locked. Settings is where users manage the subscription after they understand the value.

## Race Prep visibility gate

Do not promote Race Prep visually until all of these are true:

- [ ] Distance-specific minimum dates are enforced.
- [ ] Incomplete race-prep state is handled with resume, abandon, or start-over paths.
- [ ] Race-week template matches the configured race distance.
- [ ] Edit, delete, pause, and rebuild behavior is consistent across surfaces.
- [ ] Date formatting is consistent, locale-aware, and UK-friendly where appropriate.
- [ ] Plan correctness is verified end-to-end on at least one full cycle for each supported distance or an intentionally scoped subset.
- [ ] Changing weekly availability explains whether future prescriptions will move or rebuild.
- [ ] Completed runs are not lost or silently rewritten when the plan changes.
- [ ] Run setup can start a prescribed run without the user manually reselecting the same template.
- [ ] Settings does not show a half-created Race Prep state as if it were active.

If any item is false, keep Race Prep visually modest and avoid making it a homepage/programme hero.

## Implementation sequencing rule

Do not create a broad redesign PR. Use small, linked PRs where each one has a clear replacement and deletion/collapse.

Preferred sequencing:

1. Fix correctness and state issues first.
2. Add replacement surface capability.
3. Collapse or delete the old Settings workflow in the same PR.
4. Add a regression test or at least an explicit manual check for the moved workflow.
5. Keep copy and visuals minimal.

Bad sequencing:

1. Remove Settings controls before replacement exists.
2. Add replacement but leave duplicate Settings controls indefinitely.
3. Create a new dashboard to justify the move.
4. Add mockups, tokens, or broad roadmap docs instead of app behavior.

## Detailed PR acceptance criteria

A PR touching this area is acceptable if all are true:

- It states the exact user intent being moved or clarified.
- It identifies the owning surface.
- It does not contradict locked visual decisions.
- It does not introduce styled documentation artefacts.
- It does not create a second source of truth for tokens or design.
- It preserves existing user paths until replacement is ready.
- It reduces Settings complexity or prevents future Settings bloat.
- It is small enough to review against the original task.

A PR should be closed or re-prompted if any are true:

- It expands a Settings task into a whole-app redesign.
- It adds a polished static HTML planning artefact.
- It invents visual tokens or mockups disconnected from the app.
- It proposes changes to locked Food, Programme, or Exercise Picker decisions without evidence.
- Its diff is more than about three times the size implied by the task and mostly process/documentation.
- It requires future-you to review a manifesto before shipping a small fix.

## Concrete copy patterns

Use direct, operational copy.

Good Settings row labels:

- `Training defaults`
- `Food defaults`
- `Run defaults`
- `Workout defaults`
- `Privacy`
- `Subscription`
- `Notifications`

Good action labels:

- `Manage in Programme`
- `Adjust in Food`
- `Edit defaults`
- `Manage subscription`
- `View in History`
- `Start run`
- `Swap run`

Avoid vague or inflated labels:

- `Optimize your journey`
- `Unlock your potential`
- `Training command center`
- `Athlete operating system`
- `Revolutionize plan`

## Concrete compact-summary examples

Training summary before replacement:

```text
Training
Weekly schedule, run mode
[Current expanded controls remain until Programme replacement exists]
```

Training summary after replacement:

```text
Training defaults
10K Race Prep · Week 1/23 · 3 lift + 2 run
Manage in Programme
```

Food summary after target sheet exists:

```text
Food defaults
2,300 kcal · Performance phase · Protein 150g
Adjust in Food
```

Run defaults:

```text
Run defaults
Voice cues on · Outdoor GPS · Auto-pause on
Edit defaults
```

Workout defaults:

```text
Workout defaults
Rest timer 2:00 · Auto-start on
Edit defaults
```

Subscription:

```text
Subscription
Pro trial · 5 days left
Manage subscription
```

## Practical prompt guardrail for future AI tasks

Use this at the top of any future Claude/Codex task touching Settings, Programme allocation, Home/Food/Run roles, or design structure:

```text
Working notes in docs/design-decisions.md and the existing in-app implementation are canonical. Do not propose alternatives to locked decisions. Do not redesign the whole app. Do not produce styled-HTML design artefacts. Preserve hairline borders, no pastel card floods, no decorative gradients, premium restraint, existing tokens, Food scan-as-hero, Programme interaction decisions, and Exercise Picker simplicity. Treat Settings as defaults/account/privacy/subscription/support, not as the primary planning surface. Only suggest or implement focused launch-safe changes that move operational workflows closer to Programme, Run, Food, Workout, or History when there is already a clear replacement surface. Prioritize correctness, launch readiness, and reduced cognitive load over UI volume.
```

## One-block pasteable Claude instruction

Focus only on launch-safe settings allocation. Do not redesign the whole app. Working notes in docs/design-decisions.md and existing in-app implementation are canonical. Do not propose alternatives to locked decisions. Do not produce styled-HTML design artefacts. Preserve locked visual decisions: hairline borders, no pastel card floods, no decorative gradients, premium restraint, existing tokens, Food scan-as-hero, Programme interaction decisions, and Exercise Picker simplicity. Treat Settings as defaults/account/privacy/subscription/support, not as the primary planning surface. Before moving anything out of Settings, identify the replacement surface and mark it replacement-ready or replacement-pending. Only remove or collapse a Settings workflow in the same PR that introduces a working replacement. Home may show today’s next action and glanceable state, but no full forms, analytics, settings, race planning, or nutrition target editing. Race Prep must not be promoted until distance-specific dates, incomplete states, race-week templates, edit/delete/rebuild behavior, date formatting, and end-to-end plan correctness are verified. Prioritize correctness, launch readiness, and reduced cognitive load over new UI volume.
