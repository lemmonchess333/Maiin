# Tropos launch design decisions and focused settings allocation note

This is a lightweight working note, not a redesign roadmap and not a second source of truth that overrides the app. The app implementation and existing launch specs remain canonical. This note only captures the settings-section question that triggered the review and the small allocation decisions worth keeping.

Pre-launch rule: if a change is not on the critical path to App Store submission, stability, payment readiness, privacy, or obvious UX breakage, do not start it now. Avoid broad redesign work before launch.

Locked visual direction: premium means restraint. Use subtraction over addition. Prefer hairline borders, clean spacing, and calm hierarchy. Avoid decorative gradients, pastel card floods, noisy illustrations, and fake-polished process artefacts. Keep color tied to existing app tokens and implementation: primary purple around #7C6BF0, scan/action coral around #FF6B4A, and existing macro colors for nutrition. Do not create parallel token systems in docs or isolated mockups.

Locked product feel: the app should feel like a practical training companion, not an enterprise dashboard. It should lead the user to the next useful action with minimal ceremony. One primary action per screen or section is the default.

Locked Food direction: Food already has scan/logging as a hero-level experience. Do not redesign Food around planning abstractions. If nutrition target management improves, it should be a small Food-native target sheet or focused control, not a large settings detour and not a new dashboard.

Locked Programme direction: Programme is the training plan surface. Existing interaction decisions such as long-press context menus, swipe delete, and reorder mode should not be relitigated by a broad redesign note. Any running-plan work should fit into Programme without bloating the lift-session flow.

Locked Exercise Picker direction: no extra info buttons and no Done-button clutter unless there is a proven usability problem. Keep selection fast and direct.

Settings principle: Settings should own defaults, account controls, privacy, notifications, units, support, and escape hatches. Settings should not be the primary home for high-intent training workflows that users expect to perform while planning, running, lifting, or logging food.

The original signal: the settings section currently carries too much operational training logic. The useful question is not “redesign the whole app.” The useful question is “which settings items are actually actions that belong closer to where the user performs them?”

Keep in Settings: profile basics, units, appearance, privacy, notifications, subscription/account, support/legal, global workout defaults, global run defaults, default availability summary, and gear inventory if there is not a better dedicated management surface.

Move out of Settings as a primary workflow: race goal creation, race plan progress, this week’s run prescriptions, run-template overrides, full weekly schedule planning, nutrition target editing, TDEE recalculation, and per-session audio/rest decisions.

Home role: Home should be today’s command centre. It should answer what matters today, what should I do next, and am I broadly on track. Home should not become the full race planner, nutrition target calculator, analytics page, or settings hub.

Programme role: Programme should own training structure. If Race Prep becomes more visible, Programme is the right primary home for race goal, weekly run prescriptions, schedule impact, swaps, and rebuild actions. The key constraint is to avoid crowding the strength-session UI. Running plan controls should be grouped behind a compact Running area, tab, or section.

Run role: Run should own pre-run setup and live execution. If a prescribed run exists, Run should lead with that run first and keep Free, Easy, Tempo, Intervals, Long, Race, Treadmill, and Guided as secondary choices. Per-run voice cues and GPS/manual choices belong here more than in Settings.

Food role: Food should own food execution and immediate nutrition target correction. If the calorie or macro target looks wrong on the Food page, the user should be able to adjust or understand it there. Settings can keep defaults, but Food should avoid sending users to the top of Settings just to fix targets.

History role: History should remain evidence and analytics. It can show race-prep adherence, PRs, trends, shoe mileage, and completed-session detail after data exists. It should not become a planning or setup surface.

Social role: Social should remain community, crews, challenges, feed, comments, and shareable milestones. Race Prep can generate share moments, but Social should not own private race planning.

Specific settings allocation: Training Settings should become a compact summary and link pattern. Example: “Training defaults — 10K Race Prep · Week 1/23 · Manage in Programme.” It should not contain the whole race creation form and this week’s run dropdowns once Programme has a proper running-plan area.

Specific settings allocation: Nutrition Settings should shrink once Food has a native target control. Example: “Food defaults — 2,300 kcal · Performance phase · Manage in Food.” Keep advanced defaults in Settings, but do not force target correction through Settings.

Specific settings allocation: Workout Preferences should distinguish defaults from live controls. Default rest timer and default audio-cue preference can stay in Settings. Actual rest-timer adjustment belongs in the workout session. Actual voice-cue choice belongs in Run setup.

Specific settings allocation: Shoes can remain manageable in Settings, but active shoe and mileage warnings should surface near runs and in History where they affect decisions.

Race Prep caution: do not promote Race Prep visually until plan correctness is trustworthy. Check distance-specific minimum dates, incomplete race-prep states, race-week template matching, edit/delete/rebuild behavior, and consistent date formatting first.

UX caution: do not replace a settings problem with Programme clutter. The correct pattern is compact summary card first, details behind a section or sheet, and destructive or structural changes behind confirmation.

UI pattern to use: cards show state, bottom sheets handle decisions, full-screen flows handle complex setup, and compact rows summarize settings. Avoid giant inline forms unless the user explicitly enters an edit mode.

UI hierarchy rule: each surface gets one hero. Home has today’s next action. Programme has this week’s plan. Run has today’s prescribed or chosen run. Food has today’s energy/logging. History has the selected-period overview. Settings has profile/account summary.

Copy principle: use plain operational wording. Prefer “Manage in Programme,” “Adjust in Food,” “Default rest timer,” and “Voice cues for runs” over abstract product language.

Do not do now: do not add a polished HTML design artefact, fake phone mockups, invented tokens, broad before/after claims, or an organization-style roadmap. Those create review burden and will rot.

If the settings issue becomes an implementation ticket, scope it narrowly: replace heavy Training Settings content with compact summaries only after Programme has the replacement running-plan controls. Do the same for Food targets only after Food has the replacement target sheet.

Pasteable Claude instruction: Focus only on launch-safe settings allocation. Do not redesign the whole app. Remove or avoid any standalone styled HTML design document. Preserve locked visual decisions: hairline borders, no pastel card floods, no decorative gradients, premium restraint, existing tokens, Food scan-as-hero, Programme interaction decisions, and Exercise Picker simplicity. Treat Settings as defaults/account/privacy, not as the primary planning surface. Suggest only focused changes that move operational workflows closer to Programme, Run, Food, Workout, or History when there is already a clear replacement surface. Prioritize correctness, launch readiness, and reduced cognitive load over new UI volume.
