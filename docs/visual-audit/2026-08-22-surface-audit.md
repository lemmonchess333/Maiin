# Surface visual audit — 2026-08-22

> Seven surface groups audited against the CI capture frames, then every
> finding put to an adversarial verifier that had to REFUTE it — against the
> source at the cited line, against the same component on other frames (the
> D22 lesson: a frame can lie), against `docs/design-backlog.md` D1-D26, and
> against the ADRs and plan-file locks. 37 of the submitted findings
> survived; the rest were refuted and are not recorded here.
>
> Every row carries the frame it was seen in, the source line it comes from,
> and — where the claim is numeric — a measurement the verifier re-derived
> independently. Ratios are WCAG contrast unless stated.
>
> This file is the evidence. The ranked conclusion, the four consolidations,
> and the "needs a decision" set are at the bottom.

## HIGH (11)

### The run-days slider reads INVERTED in dark mode — its unfilled remainder is 4x brighter than the filled portion

- **Surface group:** onboarding
- **Source:** `src/pages/Onboarding.tsx:1218-1226`
- **Frame:** onboarding-3-race-advisory-tight-dark.png (and -light.png) — crop x=12 y=495 w=372 h=260 @2.5x; probe x=300 y=530 w=60 h=8

**Evidence.** The unfilled track measures the identical #efefef in BOTH themes — probed pixel-for-pixel at the same coordinates in the light and dark frame. Against the dark page (#111113) that is 16.40:1, and its relative luminance (0.863) is ~3.9x that of the filled purple segment #7b72e9 (0.221) sitting to its left. So the brightest, heaviest mass on the dark step is the part of the slider the user has NOT selected, and the control reads as if it were nearly full when it sits at 3 of 7. In light mode the same #efefef fill is 1.03:1 against the page (#ececee) — the fill is invisible and the track survives only as a 1px #b2b2b2 outline at 1.80:1. One colour, wrong at both ends. Verified not a mid-flight capture artifact: the value is byte-identical across two independently-shot frames, and the neighbouring purple fill and thumb render correctly in both.

**Why it is a defect.** `accent-color` (the `accent-primary` class) paints only the filled track and thumb; the unfilled groove is UA-painted and follows `color-scheme`, which this app never declares — grep for `color-scheme` returns only the three static legal HTML pages, `RaceGoalPlanner.tsx:254`, and `Onboarding.tsx:1317`. That last one is the date input NINETY LINES BELOW this slider on the SAME step, which explicitly opts in with `[color-scheme:light_dark]`. So the fix pattern is already in the same file, one control away, and this input was simply missed. It also breaks the documented dark palette (surfaces #1A1A1F on #121214 — nothing in the system is near-white).

**Suggested fix.** Add `[color-scheme:light_dark]` to the range input's className, matching the sibling date input at Onboarding.tsx:1317. Better, since `input[type="range"]` is already being restyled globally: give the groove an explicit token background (`bg-muted`) in `src/index.css:723` via `::-webkit-slider-runnable-track` / `::-moz-range-track` so no range input anywhere in the app depends on a UA default. Same defect will exist on `RunSetupModal.tsx:1204`, which uses the identical bare `w-full accent-primary` markup.

**Corrected by the verifier.** Substance stands; three numeric details are slightly off. The filled segment measures #726ae7 in dark and #7d6ff6 in light — not the #7b72e9 token the finding names — so the luminance ratio of unfilled-to-filled is ~4.4x (0.863 vs 0.197), not 3.9x, and dark contrast is 16.54:1 not 16.40:1. The light-mode figures (1.026:1 fill, 1.798:1 border) are exact. Also worth noting the finding did not: the identical bare markup at RunSetupModal.tsx:1213 is the ONLY other range input in the app, so a fix in src/index.css closes the class entirely.

<details><summary>Verifier's refutation attempt</summary>

Reproduced independently and it holds on every axis. SOURCE: Onboarding.tsx:1217-1227 is a bare `type="range"` with `className="w-full accent-primary"` — no color-scheme, no comment. The sibling date input at :1317 does carry `[color-scheme:light_dark]`, so the fix pattern is genuinely 90 lines below in the same file. Grep for `color-scheme` returns exactly the sites named (3 static legal HTML pages, RaceGoalPlanner:254, Onboarding:1317). NOT AN ARTIFACT — this was the strongest refutation candidate and it fails: I row-scanned both frames and the unfilled groove is byte-identical #efefef in dark AND light, while the filled segment DOES flip theme (#726ae7 dark vs #7d6ff6 light). A mid-flight transition cannot produce a byte-identical value in two independent captures, and the fact that accent-color flips while the groove does not is positive proof the groove is UA-painted and theme-blind. MEASUREMENT re-derived myself: #efefef vs dark page #111113 = 16.54:1; vs light page #ececee = 1.026:1; border #b2b2b2 vs #ececee = 1.798:1 — all three match the finding to two decimals. Fill proportion measured 122/343px = 35.6%, consistent with value 3 of 1..7 (33.3% + thumb). NOT LOGGED: no backlog row D1-D23 mentions slider, range, accent, or color-scheme; D16 (the only Onboarding row) is about `trainingWhy` capture. NOT LOCKED: no ADR or plan-file row covers it. FIX BREAKS NOTHING: it copies an in-file pattern and moves a near-white UA default onto a token.

</details>

### The run-days slider's drag target is 6px tall

- **Surface group:** onboarding
- **Source:** `src/index.css:723`
- **Frame:** onboarding-3-race-advisory-tight-light.png — vertical scan at x=196 (track) and x=143 (thumb), y=518..550

**Evidence.** Scanned the slider column: the element box paints from y=531 to y=536 inclusive — 6px. The thumb overflows it to y=527..540 (14px) but pointer events are bounded by the element box, so the draggable strip is 6px. Measured against the flow's own CTA on the same frame (Continue, y=764..811 = 48px) that is one eighth the height of the button directly below it.

**Why it is a defect.** `input[type="range"] { height: 6px }` forces every range input in the app to a 6px box. The standing per-PR invariant in CLAUDE.md is that 'every interactive element clears 44px', and ADR-0003 makes the 44px floor part of the primitives contract. This is the only drag control in the first-run flow, on the step every race-prep user passes through, and it sets weekly run volume.

**Suggested fix.** Move the 6px to the track pseudo-elements and give the input itself a 44px box: `input[type="range"] { height: 44px; background: transparent; }` plus `::-webkit-slider-runnable-track`/`::-moz-range-track { height: 6px; border-radius: 3px; }` and a `margin-top` on `::-webkit-slider-thumb` to re-centre it. One change in `src/index.css` fixes this input and `RunSetupModal.tsx:1204` together.

**Corrected by the verifier.** Two corrections. (1) The CSS rule is at src/index.css:732-736, not :723 — line 723 is a `::placeholder` block. (2) 'pointer events are bounded by the element box' is asserted, not verified: in Chromium/WebKit the thumb is a shadow-tree pseudo-element whose painted box generally remains hit-testable when it overflows, so the effective drag target is more likely the 14px thumb than the 6px box. The finding survives either way — 14px is still ~3x under the 44px floor, and the tap-to-jump track region genuinely is 6px — but the honest claim is 'a 6px track with a 14px thumb' rather than a flat 6px drag target.

<details><summary>Verifier's refutation attempt</summary>

Measurement reproduced exactly. Row-scanning the slider column, the element box paints y=531..536 inclusive = 6px in both frames, and the CTA on the same frame paints y=764..811 = 48px, so the one-eighth comparison is right. The thumb's solid purple runs y=527..540 = 14px with antialiasing at 526/541 — the finding's 14px figure is a careful measurement, not a rounding. RULE CONFIRMED, and it is broader than the finding claimed: DESIGN_GUIDE.md:30 says '44px minimum touch target… Anything smaller needs a real justification' and :328 says 'Touch targets >= 44px for anything interactive (iOS HIG)' — so this does not depend on the Button/IconButton/Toggle phrasing in CLAUDE.md, which would not obviously cover a range input. No justification comment exists at the CSS rule (`/* Range input styling */` is the only annotation). NOT CAUGHT BY CI: the touch-target ratchet in designSystemInvariants.test.ts scans only `role="switch"` elements, so range inputs are invisible to it. Not logged in D1-D23, not locked in any ADR or plan row.

</details>

### The race-distance selector is a 32px hand-rolled pill row — the exact control SegmentedControl was built to replace

- **Surface group:** onboarding
- **Source:** `src/pages/Onboarding.tsx:1268-1289`
- **Frame:** onboarding-3-race-advisory-tight-light.png — crop x=12 y=495 w=372 h=260 @2.5x; vertical scan at x=330, y=565..630

**Evidence.** The 5K/10K/Half/Full pills paint from y=578 to y=609 — exactly 32px (`py-2` 8+8 plus text-xs's 16px line box), against the documented 44px floor and against the 48px Continue button on the same frame. The selected 'Full' pill is a solid #D4637A fill (probed) with the label hardcoded to `#000` at line 1284 — a raw hex literal, and the only solid-fill selection idiom left in a flow where every other selection is a purple tint plus a purple check (OptionCard). No `role="radio"`, no `aria-checked`, no `aria-label` on the group.

**Why it is a defect.** `src/components/ui/SegmentedControl.tsx` exists and its own docstring names this control: 'the hand-rolled `<button>` pill rows that drifted across the app (lift-days / race-distance selectors had NO a11y at all)', and 'the earlier per-screen solid brand-fill pill ... variants were consolidated onto this'. So the primitive was built for exactly this shape, ships a 44px floor (`min-h-[44px]`, line 69), a full radiogroup pattern (lines 142-165) and a `tone="running"` coral option — and the onboarding copy was left behind. ADR-0003's interim exemption was explicitly conditional ('Until a SegmentedControl primitive exists'), so it has expired. The `#000` literal also breaks the per-PR no-hex-literals invariant.

**Suggested fix.** Replace the block with `<SegmentedControl options={[{value:'5k',label:'5K'},{value:'10k',label:'10K'},{value:'half',label:'Half'},{value:'marathon',label:'Full'}]} value={raceDistance} onChange={setRaceDistance} ariaLabel="Race distance" tone="running" />`. That deletes the `#000` literal, restores the app-wide selected-segment language, and clears 44px in one move.

**Corrected by the verifier.** Real, but not a fresh discovery — state it as drift from an already-migrated locked pattern rather than a new defect. ADR-0003 seeds this exact migration, and Run10 (plan file line 615) confirms the sibling surfaces shipped `SegmentedControl tone="running"` for race distance in June; Onboarding.tsx is the only hand-rolled instance left. Two nuances on the `#000`: it is NOT careless — black on #D4637A measures 5.86:1 versus 3.58:1 for white, so it is the accessible choice, merely untokenized. And it is not a lint escape by exemption: eslint's inline-style hex rule matches `#[0-9a-fA-F]{6}`, so 3-digit literals like `#000` (and `#fff` at the CTA, :1961) slip through the guardrail entirely — a gap worth noting separately.

<details><summary>Verifier's refutation attempt</summary>

Every claim verified, and the plan file strengthens rather than refutes it. SOURCE: Onboarding.tsx:1268-1289 — plain `<button type="button">` with onClick/className/style only; no role="radio", no aria-checked, no group aria-label. 32px is arithmetically exact (py-2 = 8+8 plus text-xs's 16px line box) AND frame-exact: the 'Full' pill paints y=578..609 inclusive = 32px, fill #d4637a, label glyphs probing #000000. ADR-0003's exemption is explicitly conditional — 'Until a SegmentedControl primitive exists… the hand-rolled pill rows are the accepted interim' — and its own migration backlog item (2) names the race-distance selector. The primitive now exists, ships min-h-[44px] and the full radiogroup pattern, and its docstring names 'lift-days / race-distance selectors had NO a11y at all'. DECISIVE: ProgrammeSettings.tsx and RunPlanSettings.tsx have already migrated, and plan-file row Run10 (line 615, locked 2026-06-01) records that 'main had already migrated the race-distance picker to SegmentedControl' and that RaceGoalPlanner 'uses the design-system SegmentedControl tone="running" for distance, matching main'. It even logs a process lesson about an agent reverting such a call to a button group by trusting stale code. So the finding's suggested fix is the locked, already-shipped pattern and Onboarding is the lone straggler.

</details>

### Every opacity-dimmed `text-muted-foreground` on the Food page falls below 4.5:1 — the base token has only 0.33 of AA margin, so any fraction of it fails

- **Surface group:** food
- **Source:** `src/components/food/MacroColumn.tsx:325 (/70); src/components/food/FoodRow.tsx:223 (/80); src/components/food/FoodTimeline.tsx:185 (/90); same pattern at src/components/food/CalorieRing.tsx:392, FoodHeroCard.tsx:372, AdaptiveWarmupBar.tsx:34 (/60)`
- **Frame:** food-light.png — crops (48,590,55,12) macro tertiary '125 / 140g'; (45,1131,88,12) diary row 'Dinner · 7:31 PM'; (28,886,132,12) 'FOOD LOG · 4 ITEMS'. Cross-checked on food-zero-light.png, food-muesli-light.png, food-dark.png, macro-tiles-after.png.

**Evidence.** Measured against the white card (rgb 255,255,255), sampling glyph cores on text runs: base `text-muted-foreground` = rgb(113,113,122) → 4.83:1 (passes, but by only 0.33). `/90` ('FOOD LOG · 4 ITEMS') = rgb(127,127,135) → 3.97:1. `/80` ('Dinner · 7:31 PM') = rgb(141,141,149) → 3.29:1. `/70` ('125 / 140g') = rgb(155,155,162) → 2.76:1. Dark mode is better but still short: /70 = 3.76:1, /80 = 4.49:1 against rgb(32,32,34). The /70 value is arithmetically exact for a 70% blend of the base token over white (0.7×113 + 0.3×255 = 155.6), which rules out antialiasing or a mid-transition capture — and it reproduces byte-identically at 2.76:1 on three independently captured light frames (food-light, food-zero-light, food-muesli-light) and at ~3.7:1 on both dark frames (food-dark 3.76, macro-tiles-after 3.70).

**Why it is a defect.** Audit floor: contrast below 4.5:1 for body text or control labels. '125 / 140g' is the only place the macro tile states the actual consumed/target pair, and 'Dinner · 7:31 PM' is the only place a diary row states its meal and time — both are data, not decoration, and both sit inside interactive controls (the tile is a <button>, the row is a tap target). MacroColumn.tsx:335-338 additionally claims the uppercase label is 'intentionally muted (same tone as the X / Yg ratio line above)'; the two are 4.83:1 and 2.76:1, so the code no longer matches the comment that justifies it.

**Suggested fix.** Drop the fractional-opacity modifiers on these three and use the base `text-muted-foreground`, which already clears AA. If a genuinely quieter tier is wanted, add one dimmer token to tokens.css tuned to land at ≥4.5:1 in both themes rather than scaling the existing token's alpha — the base is too close to the floor for any fraction of it to survive. Fixing MacroColumn.tsx:325 also makes its own 'same tone as the ratio line' comment true again.

**Corrected by the verifier.** Three sub-AA text colours on the Food page, from fractional-opacity `text-muted-foreground`: MacroColumn.tsx:325 (/70) at 2.76:1 light / 3.76:1 dark, FoodRow.tsx:223 (/80) at 3.29:1 light / 4.49:1 dark, FoodTimeline.tsx:185 (/90) at 3.97:1 light / 5.33:1 dark. All are 11px (`text-caption`), so the 4.5:1 normal-text bar applies, and all three fail on the worst-case theme.

Two corrections to the framing:

(a) "Any fraction of it fails" is true in LIGHT mode only. The base token is 4.83:1 on the white card, so every fraction lands under 4.5 — correct. In DARK the base is 6.26:1 and /90 clears at 5.33:1, so FoodTimeline's /90 fails in light but passes in dark, and /80 fails dark only by a hair (4.49 vs 4.50). The finding's own body gets this right; the title's universal quantifier does not.

(b) This is an app-wide pattern the Food audit happened to land on, not a Food-specific regression: `grep -rho "muted-foreground/[0-9]*"` over src/\*_/_.tsx returns 69 hits across 42 files (27x /70, 16x /60, 8x /80, 7x /50, 3x /90). Fixing only the three Food sites leaves the same defect everywhere else, so the second half of the suggested fix — a properly-tuned dimmer token plus extending `tokenContrast.test.ts` to scan `text-<token>/<n>` the way it already scans `bg-<token>/<n>` — is the part that actually closes the class.

<details><summary>Verifier's refutation attempt</summary>

SURVIVES all six refutation checks.

(1) SOURCE MATCHES. Verified verbatim: `src/components/food/MacroColumn.tsx:325` = `text-caption text-muted-foreground/70 font-mono tabular-nums`; `src/components/food/FoodRow.tsx:223` = `text-caption text-muted-foreground/80 truncate`; `src/components/food/FoodTimeline.tsx:185` = `text-caption uppercase tracking-[0.14em] text-muted-foreground/90 font-semibold`. Secondary sites also confirmed at CalorieRing.tsx:392 (/70), FoodHeroCard.tsx:372 (/80), AdaptiveWarmupBar.tsx:34 (/60).

(2) NOT A CAPTURE ARTIFACT — and I specifically tried to make it one, given D22's precedent. It is not, on two independent grounds. First, I derived the values from `src/index.css` alone: `--muted-foreground: 240 3.8% 46.1%` -> rgb(113,113,122); blended over `--card: 0 0% 100%` at 0.9/0.8/0.7 gives rgb(127,127,135)/rgb(141,141,149)/rgb(156,156,162) and 3.97/3.29/2.73:1. Second, I re-sampled the frames myself and got byte-exact agreement: food-light.png (48,590,55,12) darkest=rgb(155,155,162) CR 2.76:1; (45,1131,88,12) darkest=rgb(141,141,149) CR 3.29:1; (28,886,132,12) darkest=rgb(127,127,135) CR 3.97:1 — and rgb(127,127,135) is the SECOND most common colour in that region (91px at full glyph coverage), so it is a real fill, not antialiasing or a frozen transition.

(3) NOT LOGGED. Read docs/design-backlog.md in full (D1-D23). D22 is a capture artifact that measured rgb(113,113,122) — the base token, not a fraction of it — and is Fixed. D18 is the same CLASS of defect (opacity-dimmed text under AA) but scoped to the run HUD, and its 2026-08-22 STATUS closes it via `runHudTypography.ts` + `runHudTypeFloor.test.ts`, both run-surface-only. No row covers Food.

(4) NOT LOCKED, and I checked the inline comments specifically. MacroColumn.tsx:335-338's comment justifies the LABEL (line 339, base token, 4.83:1, passes) — it is not a lock on the /70 ratio line at 325, whose own comment (323-324) is about number tweening. No ADR touches this; grep of .claude/plans/programme-run-followups.md found no lock on muted opacity. Food7 locks macro-tile palette (colour off the big number) and says nothing about text opacity.

(5) THE FIX BREAKS NOTHING — it satisfies a documented hard requirement. DESIGN*GUIDE.md §10 "Accessibility floors (hard requirements)": "**WCAG AA contrast** for text. This is \_why* `primary-strong`, `MACROS_TEXT_LIGHT`, and the darker semantic tokens exist — use them." This codebase already treats sub-AA 11px text as a defect worth pinning: `src/components/food/__tests__/CalorieRingChipContrast.test.tsx` exists solely because a chip "lands at ~2.8:1 — under AA".

(6) MEASUREMENT SOUND — re-measured independently, agrees to within rounding (I get 2.73 theoretical / 2.76 sampled where the finding says 2.76). Dark mode re-measured too: on rgb(32,32,34) the blends are /90=5.33, /80=4.49, /70=3.81 theoretical, and food-dark.png samples give 3.76 and 5.33 — matching.

GAP THIS FALLS THROUGH: `src/styles/__tests__/tokenContrast.test.ts` parses the real CSS and enforces AA, but its TOKEN_BARS list is teal/success/running/lifting only, and its tint scan matches `bg-<token>/<n>` (backgrounds), never `text-<token>/<n>`. `muted-foreground` appears nowhere in it. So nothing in the suite can see this class.

</details>

### Bodyweight set-detail in feed workout cards renders at 2.31:1 (light) / 3.11:1 (dark) — below the 4.5:1 body-text floor

- **Surface group:** social
- **Source:** `src/components/social/ActivityCard.tsx:386-390`
- **Frame:** feed-activity-cards-light.png — crop (0,840,393,290)@3x; measured region x295 y941 w68 h14. Dark cross-check: feed-activity-cards-dark.png, same region.

**Evidence.** In one card ("Lower body"), three peer set-detail strings sit in the same right-hand column. Sampled darkest ink occupying >=3px: "3 x 8 60kg" = rgb(113,113,122) = 4.83:1 on white; "5 x 5 100kg" = rgb(113,113,122) = 4.83:1; "3 x 12 BW" = rgb(170,170,175) = 2.31:1. Dark frame, same rows: 6.26:1, 6.26:1, and 3.11:1. Not an antialiasing artifact — 0.6 alpha of #71717A over white composites to exactly 169.8 -> rgb(170,170,175), matching the measurement, and the two siblings in the SAME frame render at full opacity.

**Why it is a defect.** Contrast below 4.5:1 for body text. The code comment above the line explains the intent ('BW rows are quieter than weighted rows...so kg numbers stand out more') and de-emphasis is a fine goal, but /60 alpha overshoots into unreadable in BOTH themes. The rule the comment is serving does not require crossing the contrast floor.

**Suggested fix.** Drop the alpha step and get the de-emphasis from weight or size instead — keep `text-muted-foreground` for BW rows and differentiate with `font-normal` vs `font-medium`, or introduce a `text-muted-foreground/80` step only after checking it clears 4.5:1 on both `bg-card` values. `/60` currently yields 2.31:1 light, 3.11:1 dark.

<details><summary>Verifier's refutation attempt</summary>

Source confirmed: ActivityCard.tsx:386-390 sets `text-muted-foreground/60` for `isBodyweight` rows and plain `text-muted-foreground` otherwise. I re-measured the frames independently (own darkest-ink sampler, min 3px occupancy): feed-activity-cards-light.png BW row = rgb(170,170,175) on rgb(255,255,255) = 2.31:1; the two sibling rows in the SAME card = rgb(113,113,122) = 4.83:1. Dark frame: BW = rgb(108,108,113) on rgb(32,32,34) = 3.11:1 vs sibling 6.26:1. Every figure in the finding reproduced exactly. NOT a capture artifact: --muted-foreground light is `240 3.8% 46.1%` = rgb(113,113,122), and 0.6 alpha over white composites to exactly (169.8, 169.8, 175.2) — the measured pixel — while the two peers on the same frame render at full strength, which no mid-flight colour transition would produce; there is no transition on this text at all. Not in the backlog (D18 is a text-SIZE floor on the Run HUD; D22/D23 are capture-channel rows, and this frame post-dates 616bc61 anyway). No lock in docs/adr/\*.md or programme-run-followups.md. The inline comment at :377-380 justifies the de-emphasis GOAL ('BW rows are quieter... kg numbers should stand out more') but says nothing about the contrast level, so it is not a documented trade-off on this axis. DESIGN_GUIDE.md:330 and its checklist at :419 mandate WCAG AA for text. The suggested fix breaks nothing documented — font-normal vs font-medium is 400/500, outside the 'never mix 700 and 800 in the same tier' rule. Note the siblings clear the floor by only 0.33, so any replacement alpha step needs measuring rather than guessing.

</details>

### Every Circles bottom sheet ships its body with no horizontal padding — the primary CTA sits 2px from the screen edge while the sheet's own title sits at 16px

- **Surface group:** social
- **Source:** `src/components/social/CirclesSection.tsx:1002`
- **Frame:** circle-create-compact-light.png — crop (0,1200,393,300)@3x; also circles-focus-sheet-light.png and circles-detail-focus-light.png. Dark confirmed on circle-create-compact-dark.png / circles-focus-sheet-dark.png.

**Evidence.** Row-by-row left-edge scan, circle-create-compact-light.png: 'Start a circle' title (y1233-1236) L=17; its description (y1258-1260) L=17; the Strength Block focus card border (y1300-1302) L=2; the name input (y1405-1407) L=1; the 'Start circle' button spans the full 393px. circles-focus-sheet-light.png: 'Weekly focus' title (y353-355) L=16, description L=16, option rows L=2-4, 'Set weekly focus' primary button L=2 R=390. circles-detail-focus-light.png: title L=17, 'Copy invite code' L=4, action row L=2. Identical geometry in the dark frames (L=17 header vs L=2 body).

**Why it is a defect.** Breaks the documented px-4 page padding, and does so INSIDE one sheet — BottomSheet.tsx:160 pads its own header `px-4` and its docstring says 'Callers add their own padding inside the children'. Of ~30 BottomSheet call sites, every one passes px-4 or px-5 except these: CirclesSection.tsx (five sheets: 1002, 1114, 1156, 1190, 1366), CircleWeeklyFocusSheet.tsx:74 and SpaceCommentSheet.tsx:117 — all Circles/Spaces surfaces, all `space-y-N pb-2` with no px-\*.

**Suggested fix.** Add `px-4` to the body wrapper on all seven: CirclesSection.tsx:1002/1114/1156/1190/1366, CircleWeeklyFocusSheet.tsx:74, SpaceCommentSheet.tsx:117. That restores the 16px gutter the header already uses and matches the other ~28 callers.

<details><summary>Verifier's refutation attempt</summary>

Confirmed in source and visually. BottomSheet.tsx renders `{children}` with no wrapper (line ~172) and pads only its own header `px-4 pb-3` (line ~158); the docstring at :24-25 says 'Callers add their own padding inside the children'. All seven named sites open their body with `space-y-N pb-2` and no px-\*: CirclesSection.tsx:1002, 1114, 1156, 1190, 1366; CircleWeeklyFocusSheet.tsx:74; SpaceCommentSheet.tsx:117. I spot-checked the counter-claim rather than trusting it — ChoiceSheet (px-5), FeedView (px-5), SkipConfirmSheet (px-5), ExtrasExpandSheet (px-5), SettingsAvatar (px-5), HeroDrillDownSheet (p-4) all pad; HeroDrillDownSheet was the one file my own padding-grep flagged that the finding did not name, and it is fine (p-4). Visual proof independent of any pixel scan: my crop of circle-create-compact-light.png (0,1200,393,300)@3x shows the title and description at a 16px gutter while the focus card, the name input and the filled 'Start circle' button all run to the sheet's rounded corners. Not a capture artifact — padding is static layout, and it reproduces in the dark frames. No backlog row covers it (D1-D23 checked). No ADR or plan-file lock; GsPb1 governs the circle catalogue, not sheet chrome. DESIGN_GUIDE.md:221 states the rule the fix restores: 'Page horizontal padding: px-4 (16px). Don't invent a different gutter.'

</details>

### The exercise row's "Last:" line is dimmed to /80 and drops below WCAG AA — 3.29:1 in light mode — while the identical line in reorder mode is not dimmed

- **Surface group:** programme
- **Source:** `src/pages/Program.tsx:1624 (offending) vs src/pages/Program.tsx:1511 (sibling copy)`
- **Frame:** program-light.png (crop 20,985 200×60 @5x; contrast regions x27 y1016 130×11 and x27 y1034 90×11) and program-dark.png (same y offsets)

**Evidence.** Measured on the Barbell Row card, two adjacent lines of the same <p> stack. LIGHT: target line "3 sets × 10 reps · 32.5kg" renders #71717A on #FFFFFF = 4.83:1; the "Last: 60 kg × 8" line directly beneath renders #8D8D95 on #FFFFFF = 3.29:1. DARK: 6.26:1 (#A0A0A7 on #202022) vs 4.49:1 (#86868C on #202022). The measured pixel values are an exact 80% alpha composite of --muted-foreground over the card background in both themes (0.8×113+0.2×255 = 141 light; 0.8×160+0.2×32 = 134 dark), so this is the class, not a capture artifact. Program.tsx renders the exercise list twice — the reorderMode branch (DndContext, opens line 1453) uses `text-xs mt-0.5 text-muted-foreground` at line 1511; the default branch (opens line 1556) uses `text-xs mt-0.5 text-muted-foreground/80` at line 1624. The default branch is what every user sees, so the copy that actually renders is the one that fails.

**Why it is a defect.** 12px body text must clear 4.5:1 (audit brief's contrast rule; --muted-foreground on white is already only 4.83:1, so the /80 has no headroom to spend). It is also two copies of the same markup that have drifted — the same line renders at two different contrasts depending on whether reorder mode is on.

**Suggested fix.** Delete the `/80` at Program.tsx:1624 so both copies read `text-xs mt-0.5 text-muted-foreground`. If the "Last:" line genuinely needs to sit below the target line in the hierarchy, do it with a token that still clears 4.5:1 rather than an opacity multiplier on an already-marginal one.

**Corrected by the verifier.** Accurate as written, with two scope refinements worth carrying into the fix. (1) Dark mode is 4.49:1 — a marginal fail against the 4.5:1 floor rather than the clear failure light mode shows at 3.29:1; the light frame is the load-bearing evidence. (2) `text-muted-foreground/80` is not unique to Program.tsx — it appears at 8 sites (SaveRoutineSheet.tsx:46, FoodRow.tsx:223, FoodHeroCard.tsx:372, AdaptiveWarmupBar.tsx:30, StatCard.tsx:162, PeriodOverview.tsx:174, Program.tsx:1624, Diagnostics.tsx:337), several on 12px text, so the same AA failure recurs app-wide. The Program.tsx instance is still the sharpest case because its own sibling copy 113 lines away renders the identical markup undimmed, which makes it a drift bug as well as a contrast bug — but a fix that only deletes the `/80` at :1624 leaves the class open elsewhere.

<details><summary>Verifier's refutation attempt</summary>

Source verified exactly: /home/user/Maiin/src/pages/Program.tsx:1624 is `text-xs mt-0.5 text-muted-foreground/80` (default branch, what every user sees) and :1511 is `text-xs mt-0.5 text-muted-foreground` (reorderMode branch). Both line numbers are correct to the digit. Re-measured all four contrast values independently and every one reproduced: light target line 4.83:1 (#71717A on #FFFFFF), light "Last:" 3.29:1 (rgb(141,141,149)); dark target 6.26:1 (rgb(160,160,167) on rgb(32,32,34)), dark "Last:" 4.49:1 (rgb(134,134,140)). Derived --muted-foreground from src/index.css:207 (240 3.8% 46.1% -> #71717A) and :317 (240 4% 64% -> #A0A0A7) and confirmed the measured pixels are exactly the 80% alpha composite, so this is the class rather than a capture artifact — the frame values match the CSS-derived prediction to the byte. Not a capture artifact for a second reason: contrast here has no CSS transition to freeze mid-flight, and the effect is present in BOTH program-light.png and program-dark.png. Not logged: read docs/design-backlog.md in full, rows run D1-D24 and none covers this (D18 is the sub-11px font-size floor in RunBottomSheet, D22/D23 are the capture channel). No lock: nothing in docs/adr/\*.md or .claude/plans/programme-run-followups.md touches it, and there is no explanatory comment at or above :1624 (grepped for dim/de-emphasis rationale — none). The fix breaks no documented rule; it moves toward one, since DESIGN_GUIDE.md:330 and its checklist at :419 require WCAG AA contrast for text.

</details>

### The 10K race pace tile prints its unit twice — "5:34/km/km"

- **Surface group:** settings
- **Source:** `src/components/settings/RunFitnessSection.tsx:313`
- **Frame:** settings-run-plan-light.png (crop x=190 y=560 w=160 h=45 @6x); identical in settings-run-plan-dark.png

**Evidence.** The 10K RACE tile in the "Your running fitness" card renders `5:34/km/km`, while its three sibling tiles in the same grid render correctly (`6:36/km–7:25/km`, `5:38/km–5:44/km`, `5:05/km–5:12/km`). Traced: `PaceRow`'s `value` branch is `` `${paceLabel(value, unit)}${paceUnitLabel(unit)}` ``, but `paceLabel` already appends the unit itself — `runLabels.ts:64-67` returns `` `${paceMinSec(paceSec, unit)}${paceUnitLabel(unit)}` ``. The `band` branch on line 311 calls `paceLabel` alone, which is why only the single-value tile doubles up. Grepped every `paceUnitLabel` call site in src/: this is the only one that composes it with `paceLabel` rather than with the unitless `paceMinSec`.

**Why it is a defect.** A malformed data label sitting inside a card whose whole job is to display four peer pace figures — the same information formatted inconsistently across sibling elements. It also breaks the `paceLabel` contract that every other consumer in the codebase honours.

**Suggested fix.** Drop the redundant suffix on line 313: `: value ? paceLabel(value, unit) : "—"`. `paceUnitLabel` then becomes an unused import in this file (line 8) — remove it too.

<details><summary>Verifier's refutation attempt</summary>

Confirmed three ways. Source: RunFitnessSection.tsx:313 is `` `${paceLabel(value, unit)}${paceUnitLabel(unit)}` `` and runLabels.ts:66 shows paceLabel already returns `` `${paceMinSec(...)}${paceUnitLabel(unit)}` ``. Frame: I cropped settings-run-plan-light.png at 3x over the whole "Personalized paces" grid and read it — the 10K RACE tile renders literally `5:34/km/km` while EASY/THRESHOLD/INTERVAL render correct bands. Not a capture artifact: it is a text-content bug with no transition involved, present in both frames and derivable from source alone. The single-value branch is uniquely reachable — PaceRow is called four times (RunFitnessSection.tsx:215-218) and only `label="10K race" value={paceTable.race["10k"]}` takes the `value` path, which is why only that tile doubles. Grepped every paceUnitLabel call site in src/: this is the only one composed with paceLabel rather than the unitless paceMinSec, so the suggested one-line fix restores the contract the other 20 call sites keep, and the line-8 import does become unused. No backlog row, no ADR, no test pins the string (`grep -rn "km/km" src e2e docs` = 0 hits), and no comment defends it.

</details>

### RunDetail's primary stat row: two of three peer figures fail even the 3:1 large-text floor in light, while the third sits at 19.6:1

- **Surface group:** lightmode
- **Source:** `src/pages/RunDetail.tsx:398 and :403 (StatPill defined at :57)`
- **Frame:** run-detail-light.png — crops (30,440,335,65)@3x for the row; probes (48,452,62,22) TIME, (165,452,62,22) PACE, (283,452,48,22) CAL. Dark comparison: run-detail-dark.png, identical coords.

**Evidence.** Three peer StatPills in one `divide-x` row, all `text-2xl font-bold` (24px/700). Measured text-core vs the white card: TIME `#09090b` = 19.6:1; /KM PACE `#52a3bd` = 2.86:1; CAL `#d9884e` = 2.77:1. The identical coordinates on run-detail-dark.png give 13.54:1 / 5.68:1 / 5.87:1 — both coloured pills PASS on the dark card and fail on the light one. The washout is visible unaided in the 3x crop: '6:00' and '310' read as disabled next to a solid black '30:00'. This is not a mid-transition capture — the buttons two rows below on the SAME frame resolve correctly (Re-run `#ac2f48` = 4.93:1, Delete this run `#ab1c1c` = 5.26:1).

**Why it is a defect.** `THEME.teal` (#52A3BD) and `THEME.warning` (#D9884E) are theme-independent JS literals from `src/lib/theme.ts`, whose file header states they are the dark-mode colour system. The app already carries theme-aware AA steps for exactly this: `src/index.css:227` `--teal: 197 45% 36%` (#326E85) is annotated "5.68:1 on the white card (AA)", and `:237` `--warning-strong: 26 90% 33%` (#A04A08). At 24px/700 WCAG's relaxed large-text threshold is 3:1, and both figures miss it. The same screen already uses `text-running-strong` and `text-destructive-strong` for its buttons, so the pattern is in the file — the hero stats just bypass it.

**Suggested fix.** Stop passing JS literals into StatPill. Change `StatPill`'s `color` prop to a className (or pass `"var(--teal)"` / `"hsl(var(--warning-strong))"`), and set the two call sites to the theme-aware tokens: `color={"hsl(var(--teal))"}` at :398 and `color={"hsl(var(--warning-strong))"}` at :403. Both tokens already carry the dark-mode pairing, so dark is unchanged.

**Corrected by the verifier.** Accurate except two details. (1) TIME measures 19.90:1, not 19.6:1. (2) The suggested fix's claim that 'both tokens already carry the dark-mode pairing, so dark is unchanged' is WRONG — `--teal` in dark is #69A6BF and `--warning-strong` in dark is #F59F0A, neither of which equals the current #52A3BD / #D9884E. Swapping to the CSS tokens shifts the dark rendering too (the warning one noticeably, orange→amber). The fix is still correct, but it needs either acceptance of that dark shift or a light-only step matching today's dark values.

<details><summary>Verifier's refutation attempt</summary>

SOURCE CONFIRMED: src/pages/RunDetail.tsx:398 `color={THEME.teal}` and :403 `color={THEME.warning}`; StatPill at :57 renders `text-2xl font-bold` (24px/700 = WCAG large text, 3:1 floor). RE-MEASURED on run-detail-light.png: TIME 19.90:1 (ink #09090B), /KM PACE 2.86:1 (ink rgb(82,163,189) = #52A3BD exactly), CAL 2.77:1 (ink rgb(217,136,78) = #D9884E exactly). Dark at identical coords: 13.54 / 5.68 / 5.87 — reproduced the audit's numbers to the digit. NOT A CAPTURE ARTIFACT: the measured pixels ARE the source literals byte-for-byte; a frozen colour transition cannot land exactly on the constant. Visual crop confirms '6:00' and '310' read as disabled beside a solid black '30:00'. NOT LOGGED: D3 (RunDetail) is label/legend collision; D10's RunDetail exception is scoped to map-OVERLAY buttons on basemap tiles — this is a `rounded-2xl bg-card` stat row, not an overlay. NO LOCK: no ADR, no plan row, no explanatory comment at either call site. NOT A RULE BREAK: the fix uses existing tokens; DESIGN_GUIDE §10 makes WCAG AA a hard floor and index.css:181 documents the `-strong` family existing for exactly this (`--lifting` 3.87:1 as small text on the light card).

</details>

### The Home PI delta chip is the same element as Weekly Review's, but renders at 2.30:1 where its twin renders at 5.25:1

- **Surface group:** lightmode
- **Source:** `src/components/home/PerformanceHeroCard.tsx:308-315`
- **Frame:** home-light.png — probe (190,394,100,12); confirmed independently on water-home-light.png at the same coords. Peer: weekly-review-light.png — probe (332,146,24,14). Dark comparison: home-dark.png (190,394,100,12).

**Evidence.** Home's '+2 from last week' chip: text `#4db872` on its own 10%-alpha tint `#edf8f1` = **2.30:1** (light). The identical coords on home-dark.png give **5.55:1** — the value was picked for the dark canvas. Weekly Review's '+2' chip, the same PI week-over-week delta, measures `#137236` on `#e7f2eb` = **5.25:1** in the same theme. So the same datum renders twice, 3 stops apart, in one build. The negative branch is the same defect: `THEME.semantic.vitals` (#D4637A) on its /10 tint computes to 3.20:1 on the light canvas.

**Why it is a defect.** `WeeklyReview.tsx:120-127` uses `text-success-strong bg-success/10`. `PerformanceHeroCard` uses inline `color: THEME.semantic.positive` on `THEME.semantic.positive + "1A"`. `src/index.css:233` defines `--success-strong: 142 72% 26%` with a comment naming precisely this case — "the identity is 3.79:1 on a `bg-success/10` chip over the page canvas" — and `:366` documents that in dark the `-strong` step is deliberately identical to the identity, so switching costs nothing on dark. The AA text step exists, is theme-aware, and is already used for this exact element elsewhere; this call site just didn't adopt it.

**Suggested fix.** Replace the inline style at :308-315 with the classes Weekly Review already uses: `delta > 0 ? "text-success-strong bg-success/10" : "text-destructive-strong bg-destructive/10"`. Drop `THEME.semantic.positive` / `THEME.semantic.vitals` from this component.

**Corrected by the verifier.** Real, but 'the same element' is loose — these are two different components (PerformanceHeroCard on Home vs the WeeklyReview page) rendering the same PI week-over-week datum, not one shared component rendering twice. Also the suggested fix invents a pairing that does not exist: WeeklyReview's NEGATIVE branch is `text-muted-foreground bg-muted`, not `text-destructive-strong bg-destructive/10`. Match that, or make the destructive pairing a deliberate new choice rather than claiming precedent.

<details><summary>Verifier's refutation attempt</summary>

SOURCE CONFIRMED: PerformanceHeroCard.tsx:308-315 sets `backgroundColor: (delta>0 ? THEME.semantic.positive : THEME.semantic.vitals) + '1A'` and `color:` the same literal, on a `text-micro` span (tokens.css:56 → --ds-text-micro: 0.75rem = 12px = NORMAL text, 4.5:1 floor). WeeklyReview.tsx:120-127 confirmed using `text-success-strong bg-success/10`. RE-MEASURED: home-light 2.29:1 (ink rgb(77,184,114) = #4DB872 exactly, on rgb(237,248,241)); water-home-light identical; home-dark 5.55:1; weekly-review-light 5.25:1 (ink rgb(19,114,54) = #137236 = --success-strong). Negative branch derived independently: #D4637A on its /10 tint = 3.19:1 over white, 2.94:1 over the page canvas. NOT AN ARTIFACT (measured = literal). NOT LOGGED in D1-D24. NO LOCK: PI1's only pin on this chip is that it is HIDDEN at low confidence (the comment at :302-304 says exactly that and nothing about colour); PI3 locks the ring/glow hue, not the chip. index.css:233 documents --success-strong as the AA step for this precise case ('the identity is 3.79:1 on a bg-success/10 chip'), and I verified #137236 on the measured chip ground = 5.53:1.

</details>

### THEME.text.muted (#8E8E93) is a fixed dark-canvas grey used in 47 places; on light surfaces the whole supporting text layer lands at 3.07-3.26:1

- **Surface group:** lightmode
- **Source:** `src/lib/theme.ts:69`
- **Frame:** home-light.png — probes (270,938,18,14) 'kg', (214,963,68,13) 'From profile', (254,888,48,12) 'WEIGHT', (172,369,160,11) 'Loads high — ease this week', (48,925,27,13) '/ 2 L'. Dark comparison: home-dark.png, identical coords. Control probes (78,147,108,12) and (30,180,330,12) on weekly-review-light.png.

**Evidence.** Every string on Home's WEIGHT tile that resolves to this literal measures **3.07:1** against the tile's `bg-muted` (#f8f8f9): the 'WEIGHT' SectionLabel, the 'kg' unit, and the 'From profile' caption — i.e. the tile's entire supporting layer is below AA at once. On the white card it is **3.26:1** ('Loads high — ease this week', `text-xs`/12px, and the water tile's '/ 2 L'). The same coordinates on home-dark.png give 4.39:1 and 4.99:1. In the very same light frames, text using the app's theme-aware `--muted-foreground` token measures **4.83:1** on white (Weekly Review's 'Performance Index' label and body line, and Home's own water 'WATER' label at 4.83:1) — so the passing alternative is rendering four pixels away from the failing one.

**Why it is a defect.** `--muted-foreground` is defined per-theme (`src/index.css:207` light = 240 3.8% 46.1% ≈ #71717a; `:317` dark = 240 4% 64%) precisely so secondary text tracks the canvas. `THEME.text.muted` is a single hex under a comment block theme.ts labels as the dark-mode colour system, and it cannot track anything. 12px captions and unit glyphs are normal text under WCAG (4.5:1), so 3.07-3.26:1 is a clear miss, and it is systemic rather than local: 47 call sites across home/, program/, social/, food/ components.

**Suggested fix.** Retire `THEME.text.muted` in favour of `text-muted-foreground` / `hsl(var(--muted-foreground))` at the call sites. Start with the ones a light frame shows failing: `WeightStepsTiles.tsx:140,168,175,204,226`, `PerformanceHeroCard.tsx:67,74,114,119,140,145,223,298`, `WaterCard.tsx:141,227`. Where it is used as a non-text value (`PerformanceHeroCard.tsx:58` ring stroke `+"1A"`) it can stay, or move to `--border`.

**Corrected by the verifier.** The measurement and the scale are right; the stated CAUSE is wrong and matters for how the fix is framed. `text: { muted: '#8E8E93' }` does NOT sit under theme.ts's dark-mode block — it sits under its own explicit `// Light mode text helpers` comment (theme.ts:67-70), and CLAUDE.md:429 documents '#8E8E93 (iOS system grey)' as part of the colour system. So this is not a dark value leaking into light; it is a deliberate light-mode grey that misses AA. The sharper framing: TWO tokens claim the same identity — DESIGN_GUIDE:99 calls `text-muted-foreground` the 'iOS grey' secondary-text class (4.83:1) and theme.ts:69 calls #8E8E93 'iOS system grey' (3.07-3.26:1). One clears the documented AA floor, one does not. Retiring it therefore also needs the CLAUDE.md:429 palette line updated, not just call-site swaps. Secondary note: #8E8E93 is also marginal in DARK on the muted tile (4.39:1), so this is not purely a light-mode defect.

<details><summary>Verifier's refutation attempt</summary>

COUNT CONFIRMED: `grep -rn 'THEME.text.muted' src/` = exactly 47 hits across 17 files. RE-MEASURED on home-light.png: 'kg', 'From profile' and 'WEIGHT' all 3.07:1 on the bg-muted tile; 'Loads high — ease this week' and '/ 2 L' both 3.26:1 on the white card — every ink pixel rgb(142,142,147) = #8E8E93 exactly. Controls reproduce too: --muted-foreground measures rgb(113,113,122) = #71717A = 4.83:1 on white in the same theme, and #8E8E93 in dark gives 4.39 / 4.99:1. NOT AN ARTIFACT (measured = literal, five probes, two surfaces). NOT LOGGED in D1-D24. NOT A RULE BREAK — the reverse: DESIGN_GUIDE §10 states 'WCAG AA contrast for text. This is why primary-strong, MACROS_TEXT_LIGHT, and the darker semantic tokens exist — use them', and §3 names `text-muted-foreground` as the class for secondary text. The eslint hex ban (docs/invariant-guards.md:64) covers literals but not `THEME.*`, which is precisely the seam that let this spread.

</details>

## MEDIUM (16)

### The primary CTA changes width and position between step 1 and step 2

- **Surface group:** onboarding
- **Source:** `src/pages/Onboarding.tsx:1953`
- **Frame:** onboarding-0-goal-light.png vs onboarding-1-days-light.png — horizontal span scan of #7b72e9 at y=770 on each

**Evidence.** Measured the purple CTA fill on the same scanline in both frames: step 1 spans x=27..365 (353px box, centre x≈196), step 2 onward spans x=113..365 (268px box, centre x≈239). So on the user's very first Continue tap the button shrinks 85px (24%) and its centre jumps 42px to the right, then stays put for the remaining six taps. Confirmed on every subsequent frame (2-equipment, 4-injuries, 5-about-you, 6-preview, 7-confirm all show the same 268px CTA next to a 74px Back).

**Why it is a defect.** `{step > 0 ? (<button…Back…/>) : null}` collapses the leading slot entirely on step 0, so the flex row re-solves and the CTA — which the user taps eight times in a row at the same vertical position — moves out from under the thumb after the first tap. The prompt's own consistency question ('does the CTA placement stay put?') answers no, and it is the one element in the flow whose geometry is otherwise fixed across all eight steps (header, progress bar and footer y-positions are identical frame to frame — verified).

**Suggested fix.** Reserve the slot rather than removing it: render the Back button on step 0 with `invisible aria-hidden tabIndex={-1}` (or a plain `<div className="w-[74px]" aria-hidden />` spacer) so the Continue box is byte-identical on all eight steps. Alternatively make the CTA full-width on every step and move Back to a text link above it — either way the geometry stops moving.

**Corrected by the verifier.** Accurate as written. Minor: the measured box widths are 351px and 265px (86px delta, 43px centre shift) rather than 353/268/85/42 — the finding's figures include antialiased edge pixels. The naming is also slightly confusing: the shift is between step 0 and step 1 (the frames are onboarding-0 and onboarding-1), described as 'step 1 and step 2' in 1-indexed prose.

<details><summary>Verifier's refutation attempt</summary>

Reproduced to the pixel. Scanning the same scanline in both frames: step 0 purple spans x=27..365 at y=770, step 1 spans x=113..365 — exactly the finding's numbers. At the widest row (y=780) the boxes are x=21..371 (351px) and x=107..371 (265px), so the shrink is 86px and the centre moves from 196 to 239 = 43px right (finding said 85px/42px — within antialiasing). Both frames show the button spanning y=764..811, so the vertical position is indeed fixed while the horizontal geometry is not. SOURCE CONFIRMED: the footer at Onboarding.tsx:1951-1964 is `{step > 0 ? (<button…Back…/>) : null}` in a `flex items-center gap-3` row with the CTA carrying `flex-1` — so the slot collapses entirely on step 0 and the flex row re-solves. No explanatory comment anywhere in the footer. Not logged in D1-D23, not locked in any ADR or plan row, and the suggested fix (reserve the slot) breaks no documented rule.

</details>

### Three registers for one label rank on a single step, and SectionLabel is unused across the whole first-run flow

- **Surface group:** onboarding
- **Source:** `src/pages/Onboarding.tsx:977`
- **Frame:** onboarding-3-race-advisory-tight-light.png — crop x=12 y=495 w=372 h=260 @2.5x (all three stacked); onboarding-5-about-you-light.png — crops x=18 y=84 w=180 h=16 @5x and x=18 y=193 w=180 h=16 @5x

**Evidence.** The race step stacks four field labels in three different treatments within ~180 vertical pixels: 'How should we schedule your runs?' (12px sentence case, font-medium — :1171), 'Run days per week (3)' (12px sentence case, weight 400 — :1215), then 'RACE DISTANCE' and 'TARGET DATE (OPTIONAL)' (12px uppercase tracking-wider, weight 400 — :1266, :1302). The crop shows all three registers in one image. Across the page, `grep uppercase` returns 8 hand-rolled label sites in 3 treatments: tracking-widest 12px (:977, the 'STEP N OF 8' indicator), tracking-wider 12px (:1263, :1299, :1479, :1512, :1550, :1840), and tracking-wider 11px (:1713, the week-preview day letters). None is semibold. The 5x crops of 'STEP 6 OF 8' and 'SEX' from the same frame show the tracking difference at the same size, colour and rank.

**Why it is a defect.** `src/components/ui/SectionLabel.tsx` defines ONE treatment for this rank — `font-semibold uppercase tracking-wider text-muted-foreground` at 11px or 12px — and its docstring states it 'Consolidates the ~60 hand-rolled variants that had drifted across size (10/11/12px), tracking (wide/wider/widest/[0.14em]), weight (medium/semibold/bold)'. Onboarding.tsx has ZERO imports from `@/components/ui` (grepped) across all 2026 lines, so the entire flow every new user passes through sits outside the consolidation, reproducing the precise drift axes the primitive was written to close. This is a different signature from the D21 survivors (`text-xs font-medium` + `THEME.text.muted` on Home/Analytics), so it is not that row.

**Suggested fix.** Import `SectionLabel` and replace the 8 sites: `tier="section"` for the 'Step N of 8' indicator and the week-preview day letters, `tier="caption"` for SEX / AGE / RACE DISTANCE / TARGET DATE / the confirm-card row labels. Then bring the two sentence-case stragglers into the same rank — 'Run days per week (3)' should be a `SectionLabel` with the count in the value position, and 'How should we schedule your runs?' is a sub-question, not a field label, so either promote it to a real heading or demote it to the label treatment; it should not be a third thing.

**Corrected by the verifier.** Claims are accurate; two citation slips. The race-step uppercase labels are at :1263 and :1299 (the className lines), not :1266/:1302, and the sentence-case sub-question is at :1168, not :1171. One caveat the finding does not raise: Onboarding deliberately maintains its own component directory (OptionCard, Stepper), so some flow-specific styling is intentional — but no comment, ADR, or plan row documents an exemption from SectionLabel, so this reads as drift rather than a decision.

<details><summary>Verifier's refutation attempt</summary>

Every factual claim checks out. `grep -n uppercase src/pages/Onboarding.tsx` returns exactly 8 sites in exactly 3 treatments: :977 `text-xs uppercase tracking-widest`; :1263, :1299, :1479, :1512, :1550, :1840 `text-xs uppercase tracking-wider`; :1713 `text-caption uppercase tracking-wider` (11px). None carries font-semibold — verified. The race step does stack three registers: :1168 `text-xs font-medium` ('How should we schedule your runs?'), :1212 bare `text-xs` ('Run days per week (N)'), then :1263/:1299 uppercase tracking-wider. Onboarding.tsx imports zero `@/components/ui` modules — the only component imports are `@/components/onboarding/OptionCard` and `Stepper`. SectionLabel's docstring confirms one treatment (`font-semibold uppercase tracking-wider text-muted-foreground`) at caption=12px / section=11px, consolidating '~60 hand-rolled variants' across exactly the size/tracking/weight axes reproduced here. NOT D21: that row is scoped to the `text-xs font-medium` + `THEME.text.muted` signature in PerformanceHeroCard/WaterCard and is explicitly 'blocked on D20', a Home-surface product call — Onboarding uses `hsl(var(--muted-foreground))` and would not be caught by D21's grep. The finding pre-empted this correctly. Fix respects the 11px floor (text-caption = 0.6875rem = 11px).

</details>

### Uppercase micro labels one screen apart render at four tracking values and two weights; `SectionLabel` has zero adoption anywhere in the Food surface

- **Surface group:** food
- **Source:** `src/components/food/FoodComposerCard.tsx:297 vs src/components/food/MacroColumn.tsx:339 vs src/components/food/FoodTimeline.tsx:185 (and FoodHeroCard.tsx:463); primitive at src/components/ui/SectionLabel.tsx:55`
- **Frame:** food-light.png — crops at 6x: (12,726,120,20) 'ADD TO', (40,606,120,20) 'PROTEIN', (24,882,180,20) 'FOOD LOG · 4 ITEMS'. All three sit within ~280px of each other on one scroll.

**Evidence.** Same tier (all `text-caption`), three different treatments on one screen: 'ADD TO' = `uppercase tracking-wide text-muted-foreground` with NO font-weight class, so it inherits 400; 'PROTEIN' = `font-semibold uppercase tracking-wider`; 'FOOD LOG · 4 ITEMS' = `uppercase tracking-[0.14em] text-muted-foreground/90 font-semibold`; FoodHeroCard.tsx:463 adds a fourth, `tracking-[0.12em]`. The weight gap is visible at 6x — 'ADD TO' has visibly thinner strokes than 'PROTEIN' at identical size and identical glyph colour (both measured rgb(113,113,122)), so the only variable is weight. The tighter `tracking-wide` also collapses the word gap: the label renders as 'ADDTO' at 1x (visible in the 3x composer crop at 8,650,380,105). `grep -rn SectionLabel src/components/food/ src/pages/Food.tsx` returns nothing — 19 hand-rolled uppercase labels, zero uses of the primitive.

**Why it is a defect.** DESIGN_GUIDE bars mixing weights within one visual tier ('Never mix 700 and 800 in the same visual tier'); this is 400 against 600 in the same tier. SectionLabel.tsx:33-43 exists specifically to end this — its docstring says it 'consolidates the ~60 hand-rolled variants that had drifted across size, tracking, weight and colour', naming `tracking-wide/wider/widest/[0.14em]` and `muted / muted/70 / muted/90` as the exact drift axes. The Food page reproduces all of them. (Related to backlog D21, but that row is scoped to the three 'Performance' labels on Home/Analytics and is blocked on D20; this is a different surface and unblocked.)

**Suggested fix.** Route all four through `SectionLabel` — `tier="section"` for the page-section labels ('FOOD LOG · N ITEMS') and the default caption tier for card-internal ones ('ADD TO', 'PROTEIN'/'CARBS'/'FAT'), passing only spacing via className. That fixes the weight mismatch, normalises tracking to `tracking-wider`, and drops the /90 in FoodTimeline.tsx:185 — which is also one of the three contrast failures in the first finding.

**Corrected by the verifier.** The inconsistency is real and verified; two supporting details in the finding are wrong and should not be repeated.

(a) THE DESIGN_GUIDE CITATION IS MISAPPLIED. DESIGN_GUIDE.md:212 says "**Never mix 700 and 800 in the same visual tier**" — literally about bold vs extrabold, not 400 vs 600. The rule that actually applies is two lines further down (DESIGN_GUIDE.md:214-215): "Section labels are a deliberate style: ~10px, UPPERCASE, wide letter-spacing, muted colour. That's intentional, not a bug — match it." Plus `SectionLabel`'s docstring naming weight as a consolidated drift axis. Cite those, not the 700/800 line.

(b) THE 'ADDTO' DIAGNOSIS IS BACKWARDS, AND THE SUGGESTED FIX WOULD NOT FIX IT. The collapse is real — column ink-profile of food-light.png over x=12..70, y=727..738 gives gaps of 2px between A|D, 2px between D|D, and 2px between D|T. The word space is pixel-identical to the letter gaps at 11px. But that is not caused by `tracking-wide` being TIGHTER: `SectionLabel` would apply `tracking-wider` (0.05em, i.e. MORE letter-spacing), which widens letter gaps and word gap alike and does not restore the distinction. Routing 'ADD TO' through the primitive fixes the weight and normalises the tracking, but the word-gap legibility needs its own answer (sentence-case, a different label, or a non-uppercase treatment for this one control) — do not ship the primitive swap believing it closed that half.

Minor: the label count is 18 `uppercase` occurrences across `src/components/food/*.tsx` + `src/pages/Food.tsx`, not 19.

<details><summary>Verifier's refutation attempt</summary>

SURVIVES, with the rule citation corrected.

(1) SOURCE MATCHES on every count. All four are the same tier (`text-caption`, 11px per `--ds-text-caption: 0.6875rem`): FoodComposerCard.tsx:297 `text-caption uppercase tracking-wide text-muted-foreground shrink-0` — no font-weight class; MacroColumn.tsx:339 `text-caption font-semibold uppercase tracking-wider`; FoodTimeline.tsx:185 `text-caption uppercase tracking-[0.14em] text-muted-foreground/90 font-semibold`; FoodHeroCard.tsx:463 `text-caption font-semibold uppercase tracking-[0.12em]`. Four tracking values, two weights. Adoption claim verified: `grep -rn SectionLabel src/components/food/ src/pages/Food.tsx` returns zero.

(2) NOT A CAPTURE ARTIFACT. Confirmed visually at 6x from food-light.png: 'ADD TO' has visibly thinner strokes than 'PROTEIN' at identical size and identical glyph colour (both `text-muted-foreground`, rgb(113,113,122)), leaving weight as the only variable. The 'ADDTO' collapse also reproduces in the pixel data — see the correction below.

(3) NOT A DUPLICATE OF D21, and the finding says so accurately. D21 is scoped to three `PerformanceHeroCard` labels on Home/Analytics, its evidence names the specific drifted signature it grepped (`<p className="text-xs font-medium" style={{ color: THEME.text.muted }}>`), which none of the Food sites match, and it is explicitly blocked on D20 (the duplicate "Performance" wording). None of that touches Food; D21's own text even says "Worth re-running that grep after any label change; it is the cheapest way to find this class."

(4) NOT LOCKED. No comment at any of the four sites justifies the treatment; no ADR or plan-file row covers label tracking/weight.

(5) SUPPORTED BY THE PRIMITIVE'S OWN CHARTER. `src/components/ui/SectionLabel.tsx:33-43` says it "Consolidates the ~60 hand-rolled variants that had drifted across size (10/11/12px), tracking (wide/wider/widest/[0.14em]) and weight (medium/semibold/bold) and colour (muted / muted/70 / muted/90)" — the Food page reproduces those exact axes, including the literal `tracking-[0.14em]` and `muted/90` the docstring names. Routing through it also lands the FoodTimeline /90 on the base token, which is one of the three contrast failures in finding 1.

</details>

### The macro progress bar reverses direction between the tile and the breakdown sheet one tap away — same macro, same numbers, opposite fill

- **Surface group:** food
- **Source:** `src/components/food/HeroDrillDownSheet.tsx:78 (`width: ${pct}%`, pct = clampPct(consumed, target)) vs src/components/food/MacroColumn.tsx:73 (`barFillPct = isLeftMode ? (isOver ? 1 : 1 - pct) : pct`)`
- **Frame:** food-light.png macro tiles (crop 8,475,380,165) vs nutrition-breakdown-light.png macro rows (bars sampled at y=413/486/558). Same seeded day, and the breakdown sheet is reached by the 'DETAILS ›' control visible on the same hero card.

**Evidence.** Scanned the bar rows pixel-by-pixel. Tile (LEFT mode, the default in every captured frame): PROTEIN fill rgb(236,72,153) spans x29-36 = 8px of an 87px track = 9.2%; CARBS 32/87 = 36.8%; FAT 5/87 = 5.7% — i.e. remaining/target (15/140, 101/273, 5/61). Breakdown sheet, identical data: PROTEIN fill spans x16-336 = 321px of the 362px track = 88.7%; CARBS 227/362 = 62.7%; FAT 332/362 = 91.7% — i.e. consumed/target, matching the sheet's own '89%' / '63%' / '92%' captions. So protein reads as a 9%-full bar on the tile and an 89%-full bar in the sheet. `grep -n mode src/components/food/HeroDrillDownSheet.tsx` returns nothing: the sheet never receives the LEFT/EATEN mode at all, so the divergence cannot resolve itself when the user toggles.

**Why it is a defect.** The same information placed inconsistently across sibling elements. The tile's drain direction is deliberate and documented (MacroColumn.tsx:63-73) and should not change — but that comment justifies it by saying it 'mirrors the calorie ring's fill direction in CalorieRing.tsx', and the drill-down sheet was never brought along. The result is that the one surface a user opens to disambiguate the tile contradicts it, and the tile's own 'left' framing (big number counts down, bar drains) is silently inverted behind the DETAILS tap.

**Suggested fix.** Thread the existing `CalorieRingMode` down into HeroDrillDownSheet and apply the same `isLeftMode ? 1 - pct : pct` expression in `MacroRow` (HeroDrillDownSheet.tsx:78), so tile, ring and sheet all move together — the lockstep property MacroColumn.tsx:63-73 already claims. Factor that expression into one shared helper rather than copying it a third time, since a fourth consumer (the sheet's calorie bar at HeroDrillDownSheet.tsx:247, which uses `consumedPct` and so contradicts the draining CalorieRing in the same way) needs it too.

<details><summary>Verifier's refutation attempt</summary>

SURVIVES, and it is the cleanest of the three — I could not find a way to refute it.

(1) SOURCE MATCHES EXACTLY. `MacroColumn.tsx:73` = `const barFillPct = isLeftMode ? (isOver ? 1 : 1 - pct) : pct;`. `HeroDrillDownSheet.tsx:78` = `style={{ width: `${pct}%`, background: color }}` where line 55 sets `const pct = clampPct(consumed, target)`. The fourth-consumer claim also checks out: `HeroDrillDownSheet.tsx:247` uses `consumedPct` (defined line 186) for the calorie bar, while `CalorieRing.tsx:153` is `const fillRatio = isLeftMode ? 1 - progress : progress` — so the ring drains and the sheet's calorie bar fills.

(2) THE 'NO MODE' CLAIM IS LITERALLY TRUE. `grep -n "mode\|Mode" src/components/food/HeroDrillDownSheet.tsx` returns nothing at all — not a prop, not an import, not a comment. The divergence cannot resolve itself on toggle. And LEFT is the default: `FoodHeroCard.tsx:62-67` (`readInitialMode`) returns "left" for SSR, for a parse failure, and for any stored value that is not exactly "eaten".

(3) NOT A CAPTURE ARTIFACT — verified pixel-wise on both frames, same seeded data. food-light.png row y=578: track x28-118 (~90px), pink rgb(236,72,153) fill x28-37 (~10px) = ~11%, matching remaining 15/140 = 10.7%. nutrition-breakdown-light.png row y=413: track x16-376 (360px), identical pink fill x16-337 (321px) = 89.2%, matching consumed 125/140 = 89%. Cropped and eyeballed both: the tile reads "15g left" over a nearly EMPTY bar; the sheet reads "125 / 140g" and "15g left · 89%" over a nearly FULL bar. Same numbers, opposite fill, one tap apart.

(4) NOT LOCKED — and the one comment in play cuts the finding's way, not against it. MacroColumn.tsx:63-73 documents the tile's drain direction as deliberate and says it "Mirrors the calorie ring's fill direction in CalorieRing.tsx". The finding explicitly preserves that and proposes bringing the sheet into the same lockstep, so it is not re-deriving a locked decision — it is pointing out the one surface the lock never reached. No comment in HeroDrillDownSheet justifies a fixed consumed-direction. Grepped .claude/plans/programme-run-followups.md for drill-down / CalorieRing / left / eaten / drains: Food6 locks the page IA, Food7 locks the macro-tile palette, neither touches bar direction. No ADR covers it.

(5) NOTHING PINS THE CURRENT BEHAVIOUR. `HeroDrillDownSheet.test.tsx` is scoped to the training-aware fuel story and the Pro gate — its header says so, and it contains no assertion on mode, width or pct. So threading the mode through breaks no test.

(6) FIX BREAKS NO DOCUMENTED RULE — it is a prop thread plus reuse of an expression that already exists twice, and the finding correctly proposes extracting it once rather than copying it a third time.

</details>

### The circle-focus catalogue exists twice with drifted labels and descriptions — the focus you pick is renamed on the very next screen

- **Surface group:** social
- **Source:** `src/components/social/CirclesSection.tsx:100-124 (COLD_START_OPTIONS) vs src/features/goalSpace/goalSpaceTypes.ts:99-119 (LAUNCH_TEMPLATES)`
- **Frame:** circles-crews-light.png (chooser rows, y~1310-1640) and circle-create-compact-light.png — crop (0,1200,393,300)@3x (confirmation row)

**Evidence.** Frame-visible: the chooser renders 'Strength Block / A shared 4-12 week lifting focus.'; tapping it opens the create sheet, which renders the same focus as 'Strength Block / A shared 4-12 week lifting focus with weekly check-ins.' Source shows the drift is wider — the two arrays disagree on LABEL as well as copy: race is 'Race' in the chooser (CirclesSection.tsx:111-113) and 'Race Journey' in the sheet (goalSpaceTypes.ts:111-113); nutrition_consistency is 'Nutrition Consistency' / 'logging steadily' vs 'Consistency Reset' / 'logging consistently'. CirclesSection.tsx:717 renders COLD_START_OPTIONS; lines 1009 and 1047-1048 render LAUNCH_TEMPLATES + HYBRID_TEMPLATE. A third copy, HYBRID_TEMPLATE at CirclesSection.tsx:132-140, restates hybrid's description a fourth way ('Lifting + running together — one shared push.' vs 'Lifting + running, one shared push.').

**Why it is a defect.** The same information rendered inconsistently across two steps of one flow. A user who taps 'Race' is shown a confirmation for 'Race Journey' and cannot tell whether they picked the right thing. LAUNCH_TEMPLATES is lock-pinned (GsPb1) to three entries, so the chooser's array was written alongside it rather than derived from it — a second source of truth for one catalogue.

**Suggested fix.** Make the chooser derive its label/description from LAUNCH_TEMPLATES (plus HYBRID_TEMPLATE) by `type`, keeping only the extra 'Private Progress' row local to CirclesSection. Deleting COLD_START_OPTIONS's label/description fields leaves the locked constant untouched while removing the divergence.

<details><summary>Verifier's refutation attempt</summary>

Source confirmed at both cited locations. CirclesSection.tsx:99-124 COLD_START_OPTIONS: strength_block 'A shared 4–12 week lifting focus.', race → label 'Race', nutrition_consistency → 'Nutrition Consistency' / 'logging steadily'. goalSpaceTypes.ts:99-119 LAUNCH_TEMPLATES: same types with 'A shared 4–12 week lifting focus with weekly check-ins.', 'Race Journey', 'Consistency Reset' / 'logging consistently'. HYBRID_TEMPLATE at CirclesSection.tsx:132-140 is a fourth phrasing ('Lifting + running together — one shared push.' vs the chooser's 'Lifting + running, one shared push.'). The flow claim is real, not inferred: the chooser at :717 calls setTemplate + setGoalPrechosen(true) + setShowCreate(true), and the create sheet's confirmed header resolves the label/description via `[...LAUNCH_TEMPLATES, HYBRID_TEMPLATE].find(t => t.type === template)` — so tapping 'Race' renders 'Race Journey' one screen later. Both halves verified in the frames I cropped myself: circles-crews-light.png shows 'Strength Block / A shared 4–12 week lifting focus.'; circle-create-compact-light.png shows '...with weekly check-ins.'. Checked the locks rather than assuming: GsPb1 in .claude/plans/programme-run-followups.md:640 pins LAUNCH_TEMPLATES to three entries and names them 'Strength Block, Race Journey, Consistency Reset' — so the lock is on the constant the chooser DIVERGES from, which strengthens the finding rather than excusing it. The inline comments at :95-98 and :127-131 explain why hybrid is appended separately; neither explains the label drift. Not in D1-D23.

</details>

### UserProfile stacks two same-size headings 37px apart for one section, in two different registers

- **Surface group:** social
- **Source:** `src/pages/UserProfile.tsx:510`
- **Frame:** user-profile-light.png — crop (0,225,393,120)@4x; dark cross-check user-profile-dark.png same region

**Evidence.** Row scan over x14-200: 'Progress photos' ink rows 236-248 (cap height 13px), 'Progress Vault' ink rows 273-286 (cap height 14px) — 37.5px apart, same type size, both `h3 text-sm font-semibold`. The wrapper heading is UserProfile.tsx:510; the component renders its own heading at ProgressPhotos.tsx:572. One is sentence case, the other Title Case. 'Activity' (UserProfile.tsx:515) is a third heading on the same class.

**Why it is a defect.** Labels duplicated, and in mismatched register — the section reads as two sections when there is one. It also bypasses the SectionLabel primitive that every peer social section uses: CirclesSection.tsx:672 renders the 'CIRCLES' label as `<SectionLabel as="h2">`, and the Social frames show SPACES / RACES & EVENTS / YOUR CHALLENGES in that uppercase treatment, so the profile's sentence-case 14px headings are the odd ones on the surface family.

**Suggested fix.** Delete the wrapper heading at UserProfile.tsx:510 (the `aria-label="Progress photos"` on the section already names it for AT) and let ProgressPhotos own its title, or keep the wrapper and drop ProgressPhotos.tsx:572. Then route the surviving headings ('Progress Vault', 'Activity') through `SectionLabel as="h3"` so the profile matches the peer Social sections.

**Corrected by the verifier.** Accurate as written. One scoping note for whoever fixes it: the SectionLabel half of the suggested fix is a separate, optional change — D21 deliberately parks three PerformanceHeroCard labels pending D20, but that hold is specific to those labels and does not block routing the profile's headings through the primitive.

<details><summary>Verifier's refutation attempt</summary>

Both cited lines are exactly as claimed: UserProfile.tsx:510 `<h3 className="text-sm font-semibold">Progress photos</h3>` inside `<section aria-label="Progress photos">`, and ProgressPhotos.tsx:572 `<h3 className="text-sm font-semibold">Progress Vault</h3>` — identical classes, sentence case vs Title Case. My own crop of user-profile-light.png (0,180,393,180)@4x shows them stacked with nothing between, ~38px apart, matching the claimed 37.5px. Static layout, reproduces in dark; no transition involved. The comment above :502-508 explains why ProgressPhotos was MOVED to the profile, not why the section is titled twice — so there is no inline justification. Checked the backlog carefully because it is close to D20: D20 is scoped to Home's 'Performance' word rendered by SectionLabel + PerformanceHeroCard, and D21's survivor grep signature is `<p className="text-xs font-medium" style={{ color: THEME.text.muted }}>`, which does not match `<h3 className="text-sm font-semibold">`. Neither row covers this surface or these components — same shape, new instance. Verified the peer-treatment claim instead of taking it: CirclesSection.tsx:672 does use `<SectionLabel as="h2">`, and a repo-wide grep finds only three hand-rolled `h3 text-sm font-semibold` headings in the whole social/profile family — the two here plus 'Activity' at UserProfile.tsx:515. Deleting the wrapper heading is safe for AT because the section's aria-label already names it.

</details>

### The week navigator ("Week 7 · RECOMP") is separated from the day selector it heads by a ~460px suggestion card

- **Surface group:** programme
- **Source:** `src/pages/Program.tsx:1146 (ExperienceSuggestionCard rendered between WeekPhaseRow at :1130 and ProgrammeWeekSelector at :1161)`
- **Frame:** experience-suggestion-dark.png (crops 0,175 393×80 @3x and 0,585 393×160 @3x); compare program-dark.png where the same pair is adjacent (header y≈345, circles y≈370)

**Evidence.** On experience-suggestion-dark the "Week 7 RECOMP" row ends at y≈200 and the day circles (1 Full Body / 2 Full Body) do not start until y≈663 — the ExperienceSuggestionCard occupies the ~460px between them. On every other Programme frame (program-dark, program-light, reorder-header-rest-dark, train-header-lift-*) the header sits directly on top of the circles with ~25px between. WeekPhaseRow is the week *navigator\* — it owns the prev/next-week chevrons and the week number that the selector's cells belong to — so when it is displaced the day circles read as belonging to the suggestion card above them instead. The two neighbouring banners (DeloadBanner :1097, RecoveryReductionBanner :1119) are deliberately placed ABOVE WeekPhaseRow with a comment stating the rationale ("Sits ABOVE the week-phase row … deload is a week-level signal"); ExperienceSuggestionCard breaks that established order and its comment only discusses internal spacing, never placement.

**Why it is a defect.** A header and the control it labels must stay adjacent; inserting an unrelated card between them severs the label-control relationship and puts the page's only card-shaped element between two halves of one navigation unit. It also contradicts the sibling banners' own documented placement convention on the same screen.

**Suggested fix.** Move the `<ExperienceSuggestionCard>` block (Program.tsx:1146-1152) above `<WeekPhaseRow>` so it joins DeloadBanner/RecoveryReductionBanner in the banner stack, keeping WeekPhaseRow and ProgrammeWeekSelector contiguous. If it must stay lower, place it after the selector instead.

**Corrected by the verifier.** Real and correctly measured (~470px measured against ~460px claimed), with two qualifications on the remedy. The state is conditional — the card's own comment says it "renders null almost always", firing only on the v2 exhaustion criteria — so this is an edge state rather than the steady-state Programme view; CLAUDE.md's design-for-the-user-base rule means that is not grounds to dismiss it, but it does bound the severity. More importantly the finding's primary fix is the weaker of the two it offers: moving a 434px interactive card with two buttons above WeekPhaseRow would push the week navigator and its selector far down the page, and it would join a banner stack whose documented rationale ("week-level signal") does not apply to a programme-level suggestion. The finding's own fallback — placing it after ProgrammeWeekSelector — is the fix that restores header/control adjacency without burying the navigator, and should be the recommendation.

<details><summary>Verifier's refutation attempt</summary>

Source verified: in /home/user/Maiin/src/pages/Program.tsx the order is DeloadBanner (~:1097) -> RecoveryReductionBanner (~:1119) -> WeekPhaseRow (:1130) -> ExperienceSuggestionCard (:1146) -> ProgrammeWeekSelector (:1161), exactly as claimed. Re-measured the geometry rather than accepting it: ran a per-row ink/background profile over experience-suggestion-dark.png (393x1602) — the "Week 7 RECOMP" ink ends at y=200, the card surface (#202022) runs y=224 to y=658, and the first day circle begins near y=670, giving ~470px of separation against the claimed ~460px. Rendered the band to confirm the profile was reading the right elements, and the crop shows the header, the full suggestion card with its Review level / Dismiss buttons, then the 1 Full Body / 2 Full Body circles. Verified the stated baseline too: cropping program-dark.png shows "Week 1 RECOMP" sitting directly on the circles with ~20px between, so the contrast between the two states is real. Not a capture artifact — this is layout order, not a transitioning property. Not logged in D1-D24. No lock: zero hits for ExperienceSuggestionCard in .claude/plans/programme-run-followups.md and none in docs/adr/. The comment at :1144-1149 discusses only the null-render and internal spacing, never placement, while the two sibling banners immediately above carry explicit placement rationale ("Sits ABOVE the week-phase row ... deload is a week-level signal") — so the asymmetry the finding points at is genuinely undocumented.

</details>

### "Sign Out" is the loudest destructive CTA on the Account page while "Delete Account" — the irreversible one — is a quieter outline, 42px tall (below the 44px floor) and a type step smaller

- **Surface group:** settings
- **Source:** `src/components/settings/AccountSection.tsx:337-343 (Sign Out) and :346-364 (Delete Account)`
- **Frame:** settings-account-light.png (crop x=16 y=495 w=343 h=115 @3x); confirmed identical in settings-account-dark.png (same crop)

**Evidence.** Column scan at x=30 on both light and dark frames: the filled red Sign Out button spans rows 502–547 = 46px tall; the Delete Account outline spans its borders at rows 564 and 605 = 42px tall, i.e. 2px under the documented 44px minimum touch target. Cap-height scan of the two labels: "Sign Out" glyphs occupy rows 519–531 (13px cap) vs "Delete Account" rows 580–590 (11px cap) — consistent with 16px vs 14px, since the Sign Out button sets no text-size class (inherits 16px base) while Delete Account carries `text-sm`. Both are hand-rolled (`px-4 py-2.5 rounded-xl` on a `motion.button` / bare `<button>`), not the Button primitive. Sign Out uses `bg-destructive text-destructive-foreground`; Delete Account uses only `border border-destructive/30`.

**Why it is a defect.** Three documented rules at once. (a) The CTA mapping table in CLAUDE.md assigns `destructive` to destructive actions — and Button.tsx's own docstring names the exact case: "the red `destructive` variant which stays for genuinely destructive flows (delete account, end subscription)". Sign Out is reversible and is wearing that variant; Delete Account, the named example, is not. (b) "every interactive element clears 44px via the Button/IconButton/Toggle primitives" — a per-PR invariant; the hand-rolled Delete Account measures 42px. (c) Two stacked peer buttons render at different type sizes (16px vs 14px) and different heights (46px vs 42px), which is the "peer elements of equal rank at different type sizes" defect.

**Suggested fix.** Route both through the Button primitive: `<Button variant="outline" fullWidth leftIcon={<LogOut className="size-4" />}>Sign Out</Button>` and `<Button variant="destructive" fullWidth leftIcon={<Trash2 className="size-4" />}>Delete Account</Button>`. That inverts the emphasis to match the docstring, gives both the same 44px `md` height and the same label size, and removes two bespoke class strings. (The same hand-rolled outline string is repeated at AccountSection.tsx:394 — fix it in the same pass.)

**Corrected by the verifier.** Accurate except the cap-height numbers. Measured with icons excluded (the LogOut/Trash2 glyphs sit at x145-156 and x127-138 and dominate a naive scan): Sign Out label ink 519→530 = 12px, Delete Account 580→590 = 11px — a 1px delta, not 2px. The type-size claim itself is right and is settled by source, not pixels: Sign Out inherits the 16px body size, Delete Account carries `text-sm` (14px). Heights (46px vs 42px) and the 44px miss are confirmed as stated.

<details><summary>Verifier's refutation attempt</summary>

Source matches at AccountSection.tsx:337-343 and :346-363 exactly as cited: Sign Out is a motion.button with `bg-destructive text-destructive-foreground` and NO text-size class; Delete Account is a bare <button> with only `border border-destructive/30 text-destructive-strong text-sm`. Both hand-rolled, neither uses the Button primitive. I re-measured both frames myself rather than trusting the crop: column scan at x=30 on settings-account-light.png gives the filled button rows 502-547 (46px) and the outline's borders at rows 564 and 605 (42px) — dark frame identical. The arithmetic corroborates independently: src/index.css:492-493 sets body 16px/1.6, so py-2.5 + 25.6 = 46px; text-sm (14/20) + py-2.5 + 2px border = 42px. Grepped src/styles/\*.css for any global 44px min-height — there is none, so nothing rescues the 42px. Not a capture artifact (static, both themes, and derivable from source without the frame). Not logged: `grep -ci "delete account" docs/design-backlog.md` = 0, and no D1-D24 row covers Account. Not locked — the only inline comment is "Account Deletion (App Store Guideline 5.1.1(v))", which is about existence, not emphasis. The fix breaks no rule and is affirmatively required by three: Button.tsx's docstring names "delete account" as the case the red `destructive` variant "stays for"; ADR-0003's table says "Buttons, including destructive → Button (variant=\"destructive\" for destructive actions)" and explicitly scopes its AccountSection exception to the multi-step MODAL, not these two buttons; DESIGN_GUIDE.md:30 and :328 set the 44px floor.

</details>

### The Weekly Distance chart is the one analytics chart that never adopted the shared axis/grid tokens — it renders axis lines, tick marks and 9px labels beside a sibling chart with none of those

- **Surface group:** analytics
- **Source:** `src/components/run/RunningHistorySection.tsx:47-60`
- **Frame:** analytics-loaded-dark.png crop 16 1530 361 200 @3x (Weekly Distance) vs crop 16 1965 361 175 @3x (kg lifted); same pair populated in history-dark.png crop 16 3420 361 260 @3x

**Evidence.** Two bar charts on the same scroll, ~430px apart. Weekly Distance: a solid 2px vertical Y-axis at x=62-63 lit on 81 of 82 plot rows, plus left-pointing tick stubs at every label (y=1587, 1627, 1647, 1667 all show '####' at x=60-63), plus a solid X-axis rule at y=1667 (lit=210/210 vs the dashed gridlines' 105/210). kg lifted chart in the same frame: zero columns lit in the x=60-100 gutter over y=2016-2117 — no axis line, no tick marks. Tick glyph heights measured 7px (Weekly Distance) vs 8px (kg lifted), consistent with fontSize 9 vs 10. Source confirms: RunningHistorySection re-declares `<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>` inline (a verbatim copy of CHART_GRID_PROPS), passes `tick={{fontSize: 9}}` on both axes with no `fill`, and omits `axisLine={false} tickLine={false}` — Recharts then defaults both to true. It is one of only two non-sparkline chart files that do not import chartStyles (the other, CalorieBalanceChart, is off this surface).

**Why it is a defect.** src/components/analytics/chartStyles.ts:1-17 is explicit that this drift already happened once and was closed: 'the identical CartesianGrid block lived in five chart files (one of which had already drifted) ... Every analytics chart now imports these instead of re-declaring them.' That sentence is false for this file, and it is the kind of prose claim CLAUDE.md warns rots. CHART_AXIS_TICK is documented as 'The one axis tick treatment (10px, muted token)'; 9px with no fill is also below the app's 10px micro-label floor and uses currentColor, the dialect chartStyles was written to retire.

**Suggested fix.** Import CHART_GRID_PROPS and CHART_AXIS_TICK from @/components/analytics/chartStyles, spread them onto CartesianGrid and both axes' `tick`, and add `axisLine={false} tickLine={false}` to XAxis and YAxis so the card matches VolumeChart. Consider adding a test that asserts every non-sparkline Recharts file imports chartStyles, so the docstring's claim is held by something.

**Corrected by the verifier.** RunningHistorySection.tsx:44-61 re-declares CHART_GRID_PROPS inline and omits axisLine={false} tickLine={false}, so the Weekly Distance bar chart renders a solid Y-axis, tick stubs and a solid X-axis rule ~430px above VolumeChart, which shows dashed horizontal rules only. Fix by importing CHART_GRID_PROPS/CHART_AXIS_TICK and adding the two false props. Do NOT raise the 9px tick to 10px on accessibility grounds — D18 carved Recharts ticks out explicitly and runHudTypeFloor.test.ts encodes that carve-out for the tick prop; changing it is a consistency choice only. TrendWeight.tsx is a third chart file that skips the import (it duplicates the token values by hand), so a lint/test that asserts the import should expect three call sites, not two.

<details><summary>Verifier's refutation attempt</summary>

Source verified at src/components/run/RunningHistorySection.tsx:44-61: CartesianGrid is re-declared inline, both axes pass tick={{fontSize:9}} with no fill, and axisLine/tickLine are omitted so Recharts defaults both to true. Frames confirm it visually rather than by pixel-counting: my crop of analytics-loaded-dark.png at 16,1530 shows a solid Y-axis, left-pointing tick stubs at 8/4/2/0 and a solid X-axis rule; the crop at 16,1965 (VolumeChart, 'kg lifted', which does import chartStyles) shows dashed horizontal rules only, no axis line, no ticks. Not a capture artifact — it follows deterministically from the omitted props. No backlog row covers chart axis-line drift (D18 is text size, D21 is the 'Performance' label, Hist5f locked only the tooltip treatment across the three analytics/ charts). BUT the finding's most alarming sub-claim is refuted as a re-derived locked decision: D18 explicitly carves out Recharts ticks — 'Chart axis ticks (TrendWeight, CalorieBalanceChart, 9-10px) are a separate and more defensible case — Recharts ticks are not body text' — and src/components/run/**tests**/runHudTypeFloor.test.ts encodes that carve-out with a regex scoped to the tick={{…}} prop, which is exactly this call site. Two further inaccuracies: it is not 'one of only two' non-sparkline chart files skipping chartStyles (TrendWeight.tsx is a third — it hand-rolls fontSize 10 + muted-foreground + axisLine/tickLine false by value), and the chartStyles docstring is not falsified, because it is scoped to src/components/analytics/ and every grid-drawing file in that directory does import it. Severity dropped from high to medium: this is visual consistency between two sibling cards, and the a11y-flavoured half of the argument is a documented exemption.

</details>

### Badge cards are top-flowed blocks, so the status line — the row's most scannable element — lands at three different heights in a single row

- **Surface group:** analytics
- **Source:** `src/features/streaks/BadgeGrid.tsx:172-217`
- **Frame:** badges-grid-dark.png crop 16 430 361 175 @3x (CONSISTENCY row 1); also crop 16 605 361 175 @3x (row 2) and crop 16 2140 361 175 @3x (HYBRID row 1)

**Evidence.** CONSISTENCY row 1 — all three cards span y=443-597 (identical 155px height, so the grid IS stretching them), yet their footers do not align: 'First Step' date occupies rows 558-565 (mid 561.5); 'Week Warrior' bar 554-557 + counter 566-573 (mid 569.5); 'Getting Started' — whose title wraps to two lines, 536-548 and 552-561 — date at 573-581 (mid 577). Spread 15.5px. Trailing bottom whitespace varies 16/24/32px across the row. Row 2 repeats it: 'Two Week Wonder' (2-line title) puts its bar at y=734 and counter at 746-753, while 'Month Master' and 'Unbroken' put theirs at y=719 and 731-740 — a flat 15px offset. HYBRID row 1 shows the smaller 8px variant of the same fault: earned 'Hybrid Athlete' date at 2261-2268 vs in-progress 'Balanced'/'Iron Runner' counters at 2269-2276.

**Why it is a defect.** 'Alignment: peer figures off a shared baseline.' The card is `<motion.div className="relative p-3 rounded-xl bg-card border border-border/50 text-center">` — a plain block with no flex column and no bottom-pinned footer, so a variable-height name (leading-tight, 1 or 2 lines) and two different status renderers (a `<p className="...mt-1">` for earned vs the taller `ProgressBar` for in-progress) both push the footer down by different amounts. The grid equalises the boxes but nothing equalises the content.

**Suggested fix.** Make the card `flex flex-col` and let the name block take `flex-1` (or give the name a `min-h` of two lines), so the date / progress footer pins to the bottom of every card. Give the earned-date `<p>` and ProgressBar the same rendered height so earned and in-progress footers also share a baseline.

**Corrected by the verifier.** Same defect, but the columns are mislabelled: left-to-right the row is First Step / Getting Started / Week Warrior, not First Step / Week Warrior / Getting Started. The measured spread (15.5px) and the diagnosis are correct.

<details><summary>Verifier's refutation attempt</summary>

Source verified at src/features/streaks/BadgeGrid.tsx:172 — the card is `relative p-3 rounded-xl bg-card border border-border/50 text-center` with no flex column and no bottom-pinned footer, inside a `grid grid-cols-3 gap-2` (line 145) whose default align-items:stretch equalises the boxes but not the content. Two different status renderers follow a variable-height name: an earned-date <p className="...mt-1"> (line 200-207) vs the taller ProgressBar (line 208-213). I re-measured the ink rows off badges-grid-dark.png myself rather than trusting the report: col1 date 558-565 (mid 561.5), col3 bar 554-557 + counter 566-575 (mid ~569.5), col2 two-line title 536-548/552-562 with date 573-581 (mid 577) — a 15.5px spread, exactly as claimed. Not a capture artifact (no transition involved; layout, not colour). No backlog row, no ADR, no explanatory comment at the cited lines. The fix (flex-col + flex-1 on the name block) breaks no documented rule — it touches no colour, no type size, no touch target.

</details>

### Two hand-rolled text-only sparse states in the weight-trend card, on a page where the neighbouring cards use the hexagon EmptyState primitive

- **Surface group:** analytics
- **Source:** `src/components/progress/TrendWeight.tsx:88-96 (and 64-85)`
- **Frame:** history-dark.png crop 16 3840 361 95 @3x; compare analytics-loaded-dark.png crop 16 165 361 260 @3x ('No sessions logged yet') and crop 16 1140 361 300 @3x ('Race predictions unlock after a few runs')

**Evidence.** The <3-weigh-in state renders as a bare card containing one centred grey sentence — 'Log 3+ weigh-ins to see your trend' — with no mark, no icon, no CTA, and no card title to say what the card even is. Two cards up the same scroll, the Performance card renders the branded hexagon + headline + 'Start a workout' button, and RacePredictionsCard renders hexagon + headline + 'Set a race time'. Source: `<div className="p-4 rounded-2xl bg-card text-center py-8"><p className="text-sm text-muted-foreground">…</p></div>`. TrendWeight imports no EmptyState; grep of src/components/analytics + src/components/progress shows RacePredictionsCard, PerformanceSection, SectionEmptyCTA and TrainingLoadCard all do.

**Why it is a defect.** 'Empty/cold-start states that read as broken rather than designed' and 'hand-rolled controls where a primitive exists (… EmptyState)'. docs/design-backlog.md D6 ('Text-only empty states', Home/History/Social) is marked **Fixed / swept** — this card survived that sweep, so the row overstates coverage. CLAUDE.md is explicit: 'Empty states go through the EmptyState primitive (compact for in-card use) — no hand-rolled centered-icon-tile blocks.' Per the design-for-the-user-base rule this is also one of the most-seen states: every new user has <3 weigh-ins.

**Suggested fix.** Replace both branches with `<EmptyState compact headline="Log 3+ weigh-ins to see your trend" icon={Scale} … />`, with a 'Log weight' action where one exists. While there, fix the single-entry branch's `toLocaleDateString("en-US", …)` on line 79 (see the badge-date finding — same drift).

**Corrected by the verifier.** It is ONE hand-rolled empty state, not two. The single-entry branch (TrendWeight.tsx:65-87) does render `<SectionLabel>Weight Trend</SectionLabel>`, the weight figure in font-mono, the date and 'Log daily for better trend tracking' — so 'no card title' and 'text-only' are false of it; it is a legitimately designed sparse state. The live defect is the `<3` branch at :89-96, which is also the 0-entry state, i.e. what every brand-new user sees.

<details><summary>Verifier's refutation attempt</summary>

The `<3` branch is verified at src/components/progress/TrendWeight.tsx:89-96: `<div className="p-4 rounded-2xl bg-card text-center py-8"><p className="text-sm text-muted-foreground">Log 3+ weigh-ins to see your trend</p></div>` — no title, no icon, no CTA. My crop of history-dark.png at 16,3790 confirms a bare card with one centred grey sentence, directly under the macro donut. TrendWeight imports no EmptyState; RacePredictionsCard, PerformanceSection, SectionEmptyCTA and TrainingLoadCard all do. CLAUDE.md is explicit that empty states go through the EmptyState primitive. D6 ('Text-only empty states', Home/History/Social) is marked Fixed/swept, but grep of docs/cold-start-payoff-audit.md finds no mention of TrendWeight or weigh-ins, so this instance survived that sweep rather than restating it. Reachability checked: data.length 0 AND 2 both fall into this branch (the ===1 case is handled above), so it is what every user with no weigh-ins sees — a genuine cold-start state under the design-for-the-user-base rule. One over-reach corrected below.

</details>

### RunDetail's header Share is a hand-rolled near-copy of the sport-tinted Button variant, and its label collides with a different Share action 20px below

- **Surface group:** analytics
- **Source:** `src/pages/RunDetail.tsx:381-387`
- **Frame:** run-detail-dark.png crop 16 350 361 160 @3x (header) and crop 16 505 361 160 @3x (action row); identical in run-detail-light.png

**Evidence.** Two controls labelled exactly 'Share' render 165px apart and do different things. The header one is `<button className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl text-xs font-medium active:scale-[0.97] transition-transform bg-running/8 text-running-strong">↗ Share</button>` — a raw element reproducing the Button primitive's floor, radius and press by hand, tinted `bg-running/8` where the existing `sport-tinted` variant is `bg-running/10 text-running-strong` (buttonClasses.ts:81), at `text-xs` where `md` is `text-sm` (buttonClasses.ts:97), with a literal '↗' glyph instead of a lucide icon. The row button 20px below is a real `<Button variant="outline">` with `<Share2 className="size-4"/>`. So the same word renders at two type sizes with two icon systems on one screen.

**Why it is a defect.** ADR-0003 / CLAUDE.md: 'Every CTA / action button uses the shared Button primitive — never a hand-rolled <button> with bespoke Tailwind', and reusing it is how the 44px invariant is satisfied rather than re-declared. The label collision is separately a defect: the code comment at RunDetail.tsx:407-408 calls the row action 'Share route (.gpx …). Distinct from the header "Share"' — the source has a distinguishing name for it that the UI does not render, so the comment documents the ambiguity rather than resolving it.

**Suggested fix.** Swap the header button for `<Button variant="sport-tinted" size="sm" leftIcon={<Share2 className="size-3.5"/>}>Share</Button>` (dropping the ↗ glyph and the /8 tint), and rename the row action to the name the comment already uses — 'Route' or 'Export GPX' — so the two Shares are distinguishable. See the next finding: that row cannot take a longer label as-is.

**Corrected by the verifier.** Accurate as written; line cite is :380-387 (the report said :381-387) and the comment is at :406-409.

<details><summary>Verifier's refutation attempt</summary>

Verified verbatim at src/pages/RunDetail.tsx:380-387 — a raw <button> with `inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl text-xs font-medium active:scale-[0.97] transition-transform bg-running/8 text-running-strong` and a literal '↗ Share'. buttonClasses.ts:81 confirms sport-tinted is `bg-running/10 text-running-strong` and :97 confirms md is `text-sm gap-2`, so it is a near-copy at a different tint and type size. The row control at :430-436 is a real `<Button variant="outline">` with `<Share2 className="size-4"/>` labelled 'Share'. Both crops (run-detail-dark.png and -light.png at 16,350 and 16,505) show the two 'Share' labels ~165px apart at two type sizes with two icon systems. ADR-0003 does not exempt this — its Known-exceptions list covers only multi-step modals and segmented selectors, and its Consequences section names 'a naked <button> that duplicates a Button variant' as drift to migrate. The comment at :406-409 documents the distinction ('Distinct from the header "Share"') but resolves nothing in the UI, so it is not a locked trade-off. D3 is a different RunDetail row (PaceLegend/offline pill). Note the fix is constrained by finding 5: the row cannot absorb a longer third label as it stands.

</details>

### "Save route" wraps to two lines in the three-up action row — the only wrapping button in a row of equal-width peers

- **Surface group:** analytics
- **Source:** `src/pages/RunDetail.tsx:421-429 (label at :428), sizing from src/components/ui/buttonClasses.ts:97`
- **Frame:** run-detail-dark.png crop 16 505 361 160 @3x; identical wrap in run-detail-light.png

**Evidence.** 'Save' renders on one line and 'route' on the next, while 'Re-run' and 'Share' each sit on one. Measured: page px-4 leaves 361px; three flex-1 buttons with gap-2 give (361-16)/3 = 115px each; `md` size is `px-4 … gap-2` so the content box is 83px, minus a 16px leftIcon and an 8px gap = 59px of label room. Rendered glyph runs measured off the frame: 'Save' ≈38px and 'route' ≈37px, so 'Save route' on one line needs ≈79px — 20px more than exists. Button box height is a correct 44px (tint spans y=524-567 at x=70 and x=100), so this is purely a horizontal overflow, and buttonClasses carries no `whitespace-nowrap`.

**Why it is a defect.** 'Text that truncates, overflows, or collides' and the documented rhythm of a peer row. The wrap also pushes the bookmark icon off the label's optical centre and makes the middle button read as a different control class than its neighbours. It constrains the fix for the Share-label collision above: any longer label on the third button wraps too.

**Suggested fix.** Either shorten to 'Save' (the bookmark icon already carries 'route'), or drop the leftIcons in this row to reclaim 24px per button, or move to a 2+1 layout. Adding `whitespace-nowrap` alone would overflow rather than wrap — the row needs the label to actually fit.

<details><summary>Verifier's refutation attempt</summary>

Confirmed visually in BOTH themes from my own crops at 16,505 of run-detail-dark.png and run-detail-light.png: 'Save' sits above 'route' while 'Re-run' and 'Share' each fit one line. Source at src/pages/RunDetail.tsx:421-429 is a flex-1 Button with a Bookmark leftIcon and the label 'Save route'; buttonClasses.ts:97 confirms md = `min-h-[44px] px-4 text-sm gap-2` and the file carries no whitespace-nowrap. I re-measured the box myself rather than accepting the report's number: a column scan of run-detail-light.png at x=196 and x=320 puts the button border at y=524 and y=567 inclusive — exactly 44px — so the wrap is horizontal overflow inside a correct touch target, as claimed. Arithmetic re-derived independently: 393px viewport − 32px page padding = 361px; minus 16px of gap over three flex-1 children = 115px each; minus 32px px-4 = 83px content; minus a 16px icon and 8px gap = 59px of label room, which 'Save route' at 14px cannot take. Not a capture artifact (identical in both frames, and text wrapping is not transitioned). No backlog row, no comment, no ADR. The suggested fixes break no documented rule.

</details>

### Deload banner: warning heading at 2.20:1 and body at 3.84:1 in light — the AA warning step exists and is unused

- **Surface group:** lightmode
- **Source:** `src/components/program/DeloadBanner.tsx:205 (body at :212, tint at :186)`
- **Frame:** program-light.png — probes (64,196,160,14) heading, (64,219,240,12) body, (300,260,60,20) banner tint. Dark comparison: program-dark.png, identical coords.

**Evidence.** 'Consider a deload week' renders `#d9884e` (`THEME.warning`) on the banner's own `+"14"` tint, measured `#eae4e1` → **2.20:1**. It is `text-sm font-semibold` (14px/600) = normal text, so the bar is 4.5:1. The same coords on program-dark.png put the identical hex on `#221c19` → **6.07:1**. The supporting paragraph beneath it uses `text-muted-foreground` correctly but still lands at **3.84:1**, because the token is tuned for the white card and this tint is materially darker than one.

**Why it is a defect.** `src/index.css:237` defines `--warning-strong: 26 90% 33%` (#A04A08) with the comment "identity is 3.76:1 on a /10 chip" — the token was created for exactly this failure mode and this banner is a worse case than the one the comment describes. This is NOT design-backlog D19: that row is about the warning/nutrition HUE alias and is blocked on a palette decision. The AA text step is a separate, already-shipped, theme-aware token, so fixing the contrast does not touch the hue question or pre-empt D19.

**Suggested fix.** At :197 and :205 swap `THEME.warning` for `hsl(var(--warning-strong))` and `THEME.success` for `hsl(var(--success-strong))` (both are no-ops in dark by design — see the index.css:359 note). For the body at :212, either lighten the tint at :186 from `"14"` toward `"0D"` or move the paragraph to `text-foreground/80`. The sibling instance to fix in the same pass is `PerformanceHeroCard.tsx:291`, covered below.

**Corrected by the verifier.** Real, but the parenthetical 'both are no-ops in dark by design — see the index.css:359 note' is wrong. That note says the `-strong` steps equal their CSS IDENTITIES in dark — and the CSS identities are not the JS literals this banner uses. Dark `--warning` is hsl(38 92% 50%) = #F59F0A and dark `--success` is hsl(142 69% 58%) = #4ADE80, versus today's #D9884E / #4DB872. So the swap visibly re-colours the dark banner (orange → amber). Accept that or add a light-only step. The body-text half is the more interesting finding and is understated: `text-muted-foreground` is correct-by-the-book and STILL fails at 3.84:1, because the token is calibrated for the white card and every tinted banner in the app darkens the ground beneath it — worth checking the sibling banners (RecoveryReductionBanner.tsx:122, NotificationsSheet.tsx:121) which use the same `+'14'` recipe.

<details><summary>Verifier's refutation attempt</summary>

SOURCE CONFIRMED: DeloadBanner.tsx:186 tint `(deloadActive ? THEME.success : THEME.warning) + '14'`, :197 icon, :205 heading `text-sm font-semibold` (14px/600 = normal text, 4.5:1 floor). RE-MEASURED on program-light.png: heading 2.20:1, ink rgb(217,136,78) = #D9884E exactly on rgb(234,228,225); body 3.84:1, ink rgb(113,113,122) = --muted-foreground. Crop viewed — the orange heading is visibly washed out on the warm tint. NOT AN ARTIFACT (measured = literal). NOT LOGGED AS THIS DEFECT: D19 names the deload banner, but D19's finding is the HUE ALIAS (warning === nutrition orange) and its blocker is 'picking a warning hue is a design decision'. This is a luminance defect, and the fix (`--warning-strong` = hsl 26 90% 33%, hue 26 vs the identity's 25) keeps the hue, so it neither restates nor pre-empts D19. Verified the fix works: #A04A08 on the measured tint = 4.80:1. NO LOCK, no justifying comment at :186/:197/:205.

</details>

### Water quick-add '+' glyph is 2.30:1 in light (4.03:1 in dark) — below even the 3:1 non-text floor for a primary control

- **Surface group:** lightmode
- **Source:** `src/components/home/WaterCard.tsx:173 and :179 (compact branch, entered at :84)`
- **Frame:** home-light.png — context crop (16,865,190,145)@3x; probe (151,965,16,16). Confirmed on water-home-light.png at the same coords. Dark comparison: water-home-dark.png (151,965,16,16).

**Evidence.** The add-a-glass button paints `backgroundColor: THEME.semantic.hydration + "26"` (renders `#e5f1f5` on the white card) with a `#52a3bd` Plus glyph on top: **2.30:1**. The same coordinates on water-home-dark.png measure **4.03:1**. The button also carries `borderColor: "transparent"`, so nothing else defines the control's edge — its tint against the card is 1.08:1 — leaving the 2.30:1 glyph as the only thing marking the primary action on the tile. (The '-' beside it measures 1.21:1, but that one is legitimately `disabled` at 0 ml and is not the finding.)

**Why it is a defect.** WCAG 1.4.11 sets 3:1 for graphical objects and control affordances; 2.30:1 misses it. The cause is the same class as the findings above — `THEME.semantic.hydration` is a fixed hex from theme.ts's dark-mode block — and the app already ships the theme-aware answer: `src/index.css:227` `--teal: 197 45% 36%` (#326E85), annotated "5.68:1 on the white card (AA)", with a dark pairing at `:355` (#69A6BF, "6.08:1 on the dark card").

**Suggested fix.** Point the glyph colour at the theme-aware token — `style={{ color: "hsl(var(--teal))" }}` at :179 (and :266 for the non-compact branch) — while leaving the tint on the identity so the fill reads the same. Same treatment for the Minus at :164/:251 and the Droplets icon at :118/:218.

**Corrected by the verifier.** Two numbers are slightly off, neither changing the verdict. (1) 2.30:1 is measured off anti-aliased pixels — the glyph is a thin stroke at 16px with no pure core pixel. The TRUE value for #52A3BD on its own rgb(229,241,245) tint is 2.49:1. Still under 3:1. (2) The tint-vs-card ratio is 1.15:1, not 1.08:1. Also worth folding into the same pass: the Minus button one line up (:155-160) is painted with `THEME.iconBg` — a PURPLE tint — on a hydration control, which is a sport-coding inconsistency independent of contrast.

<details><summary>Verifier's refutation attempt</summary>

SOURCE CONFIRMED: WaterCard.tsx compact branch entered at :84; :173 `backgroundColor: THEME.semantic.hydration + '26'`, `borderColor: 'transparent'`; :179 Plus `color: THEME.semantic.hydration`. RE-MEASURED: home-light 2.30:1 and water-home-light 2.30:1 at (151,965,16,16); water-home-dark 4.03:1. Tint composites to rgb(229,241,245), which matches 0x26 (14.9%) teal over a white card to the pixel — confirming the source recipe rather than a transition state. Crop viewed: the '+' is pale teal on pale teal and is visibly the faintest thing on the tile. Audit is also right to exclude the '-' (it carries `opacity-30` at 0 ml, source :155). NOT LOGGED in D1-D24. NO LOCK, no justifying comment. WCAG 1.4.11's 3:1 floor for control affordances applies and is missed on both available cues.

</details>

### Performance hero verb label renders at 3.19:1 in light on three separate frames — the band hue is a raw JS literal with no light step

- **Surface group:** lightmode
- **Source:** `src/lib/performanceColour.ts:47 (consumed at src/components/home/PerformanceHeroCard.tsx:291)`
- **Frame:** home-light.png — probe (172,347,90,15); reproduced at identical coords on energy-collapsed-light.png and day-peek-strip-light.png. Context crop (160,335,220,80)@4x.

**Evidence.** 'Backing off' is `text-base font-bold` (16px/700) painted with `hue` = `THEME.amber` (#d97706) on the white card: **3.19:1**, measured identically on three independently captured light frames, which rules out a mid-transition capture. 16px/700 is below WCAG's large-text threshold (18.66px bold), so the requirement is 4.5:1. The same hex on the dark card computes to ~4.96:1. Derived, not measured (the seeded account never leaves the amber band): the other branch returns `THEME.brand` (#7B72E9), and `src/index.css:47` records that identity as 3.87:1 on the light card — so 'Cruising' / 'Sharpening' would fail light too.

**Why it is a defect.** `getCardColour` returns raw `THEME.amber` / `THEME.brand` hexes, which are theme-independent by construction. The categorical brand-vs-amber signalling is locked by plan row PI3 and this finding does not reopen it — `--lifting-strong` (#574AE3) and `--warning-strong` (#A04A08) are the SAME hues at an AA-safe lightness, so the two-channel mapping survives verbatim. What is missing is a light text step for the verb, not a different hue.

**Suggested fix.** Give `CardColour` a second field — e.g. `textHue` returning `"hsl(var(--warning-strong))"` / `"hsl(var(--lifting-strong))"` — and use it at PerformanceHeroCard.tsx:291 (the verb) and :282 (the numeral, if it drops below 24px). Keep `hue` as-is for the ring gradient, glow and radial wash at :214/:238/:251/:260, where the identity is correct and contrast does not apply.

**Corrected by the verifier.** Accurate, with one hedge that can be dropped: the numeral at :282 is `text-display` (3rem/48px per DESIGN_GUIDE), which is unambiguously WCAG large text, so 3.19:1 clears its 3:1 floor and it does NOT need the new textHue. Confine the change to the verb at :291. Note also that PI3's trade-off (5) already accepts 'dark mode glow more dramatic than light mode' as a product call — so a light/dark asymmetry on this card has precedent, but that pin is about GLOW intensity, not about text legibility, and cannot be read as covering this.

<details><summary>Verifier's refutation attempt</summary>

SOURCE CONFIRMED: performanceColour.ts:47 returns `{ hue: THEME.amber }` for the deload/overreach branch; PerformanceHeroCard.tsx:291 applies it as `style={{ color: hue }}` on `text-base font-bold` (16px/700 — under WCAG's 18.66px bold large-text threshold, so 4.5:1 applies). RE-MEASURED at (172,347,90,15): home-light 3.19:1, energy-collapsed-light 3.19:1, day-peek-strip-light 3.19:1 — ink rgb(217,119,6) = #D97706 exactly on white; home-dark 5.11:1. Three separate capture specs, identical result: artifact refuted twice over. LOCK CHECKED AND RESPECTED: I read PI3 in full — it locks the two-channel signalling (`hue` = stroke colour categorically, glow = score continuously) and the amber-for-Backing-off choice. It says nothing about the verb LABEL's text colour, and the audit is explicit that it is not reopening the hue. Verified the proposed steps preserve the mapping: --lifting-strong #574AE3 and --warning-strong #A04A08 are the same hues at AA lightness (6.01:1 and 4.80:1). The derived brand-branch claim also checks out — #7B72E9 on white = 3.87:1, exactly what index.css:181 records.

</details>

## LOW (10)

### The confirm card's METRICS row is bulleted in the food-domain orange, indistinguishable from the NUTRITION row below it

- **Surface group:** onboarding
- **Source:** `src/pages/Onboarding.tsx:1801`
- **Frame:** onboarding-7-confirm-dark.png — crop x=20 y=190 w=353 h=500 @2x; bullet probes at x=43 y=505 and x=43 y=569, w=8 h=8

**Evidence.** Probed the two bullets: METRICS renders #d9884e exactly; NUTRITION renders the same hue (#c07947 in this frame only because the row was still fading in under the card's staggered reveal — same token, `THEME.warning` at :1813). The bullet is the card's only per-row category key, and the row it keys is height and weight — '175 cm · 75 kg' — rendered in the colour the design system reserves for food.

**Why it is a defect.** CLAUDE.md's semantic rule is 'orange always = nutrition'; `theme.ts:32` maps weight to `semantic.activity` (purple), not orange. `THEME.warning` is also not a category colour — it is a severity colour, and nothing about a body-metrics summary row is a warning. D19 is the separate, open question of whether `warning` should get its own hue at all; this finding is the consumer side — a non-warning, non-nutrition row reaching for the warning token as decoration — and it would still be wrong if D19 were resolved tomorrow.

**Suggested fix.** Give the METRICS row a category token rather than a severity one — `THEME.semantic.activity` matches theme.ts's own 'purple — weight' mapping, or `THEME.semantic.vitals` if the three-purple run at the top of the card is the concern. Leave NUTRITION on the orange, which is correct. Note the same misuse pattern sits at :1001 and :1132, where `THEME.warning` tints the 'Get stronger' lightning bolt and the 'Occasional runner' footprints — neither is a warning either.

**Corrected by the verifier.** Real, but the headline picks the weakest instance and overstates the card's colour scheme. 'The bullet is the card's only per-row category key' is not supported: the card already runs THREE identical purples (Your plan / Schedule / Setup all resolve to #7B72E9 via THEME.brand and THEME.lifting), so shared bullet colours are already its norm, and an 'orange = body-and-food grouping' reading of METRICS+NUTRITION is defensible. The strongest instance is the one the finding buries in its closing note: at :1132 'Occasional runner' uses `THEME.warning` while its immediate sibling 'Regular runner' at :1125 uses `text-running` — two Footprints icons in the same option group, one coral and one food-orange, which contradicts CLAUDE.md's 'coral always = running' directly. Lead with that; the accurate general claim is 'THEME.warning is used as a category tint on three non-warning surfaces (:1001, :1132, :1801) when the documented severity token is THEME.amber'.

<details><summary>Verifier's refutation attempt</summary>

Source and pixels both confirm, and it is genuinely distinct from D19. SOURCE: Onboarding.tsx:1801 gives the Metrics row `color: THEME.warning` and :1813 gives Nutrition the same `THEME.warning`. theme.ts:51 sets `warning: "#D9884E"`, byte-identical to `semantic.nutrition` at :35, whose own comment reads 'warm orange — food, calories, macros'; :32 maps `activity: "#7B72E9" // purple — weight, brand, lifting`, so theme.ts itself assigns weight to purple. DESIGN_GUIDE.md:174/:178 confirms orange = 'Nutrition / calories / macros' and that the real severity hue is a SEPARATE token, `amber #D97706`, 'Warning banners only'. FRAME: I probed both bullets in onboarding-7-confirm-dark and both are exactly #d9884e — the finding's '#c07947 mid-fade' hedge was unnecessary, they are identical. NOT D19: that row is the token-collision palette decision; this is a consumer pointing non-warning content at a severity alias, and fixing D19 would leave METRICS rendering in whatever new warning hue lands — still wrong for a height/weight row.

</details>

### The elevation cell's caption sits 20px inboard of the stat grid it shares — every peer caption is flush with its numeral

- **Surface group:** social
- **Source:** `src/components/social/ActivityCard.tsx:315-329`
- **Frame:** feed-activity-cards-light.png — crops (0,480,393,290)@3x and (0,1330,393,130)@3x

**Evidence.** Left-edge scan of the 4-metric run card (x20-200, threshold 170): '21.10' value L=33 and its 'KM' caption L=33 (flush); the elevation cell's content L=33 (that is the Mountain icon) but its 'ELEV' caption L=53 — a 20px offset, exactly `size-4` (16px) + `gap-1` (4px). The second run card ('Morning run', crop at y1330) shows the same: '/KM' flush under '5:18', 'TIME' flush under '43:41', 'ELEV' indented off the column edge. The icon is a sibling of the value/label stack inside a `flex items-start gap-1`, so it pushes both the numeral and the caption right while every other cell starts at its column edge.

**Why it is a defect.** Peer figures off a shared baseline / icons off-grid. The comment immediately above (lines 320-325) states the intent was that 'the four cells finally agree' after the unit treatment was fixed — the left-edge disagreement is the residue that fix did not reach. The same block is duplicated for hybrid cards at ActivityCard.tsx:654-666.

**Suggested fix.** Move the Mountain icon inside the inner stack (render it inline before the numeral, or absolutely position it) so the cell's value and caption both start at the grid column's left edge like KM / /KM / TIME. Apply to both ActivityCard.tsx:315 and :654.

**Corrected by the verifier.** The primary case is the 4-metric card, where ELEV's caption is 20px right of the KM caption directly above it in the same grid column. The finding's second example is described loosely: on the 3-metric 'Morning run' card the elevation cell sits in column 3 with nothing stacked above it, so there the offset reads as content starting 20px into its own column rather than as a caption misaligned with a peer beneath.

<details><summary>Verifier's refutation attempt</summary>

Source confirmed: ActivityCard.tsx:312-331 wraps the elevation cell as `<div className="min-w-0 flex items-start gap-1">` with `<Mountain className="size-4 ...">` as a SIBLING of the value/label stack, so the icon (16px) + gap-1 (4px) pushes both the numeral and the SectionLabel 20px right of the cell's own edge. The container at :278 is `grid grid-cols-3`, so with four metrics the elevation cell lands in column 1, directly beneath the distance cell. I re-measured with my own left-edge scan of feed-activity-cards-light.png rather than trusting the numbers: 'KM' caption L=33, ELEV caption L=53 — exactly 20px, with the mountain icon occupying L=33-46. The duplicate exists at ActivityCard.tsx:652-668 (finding said 654-666, off by two lines, harmless). Static layout, not a capture artifact. Nothing in D1-D23, no ADR, no plan-file lock, and the comment the finding cites at :316-322 genuinely does state the intent that 'the four cells finally agree' — it addresses only the unit treatment. Graded down from the submitted medium: it is one metric cell on one card variant, and an icon-led cell is a defensible treatment somebody could have meant, so it should not outrank the padding or contrast items.

</details>

### Streak flames render #FF6900 — raw Tailwind orange-500, not any Tropos token

- **Surface group:** social
- **Source:** `src/features/partnerStreak/PartnerStreakHero.tsx:22-23`
- **Frame:** solo-feed-light.png — sampled x44 y240 w28 h28 (partner-streak flame tile); user-profile-light.png — sampled x14 y200 w14 h14 ('3-day streak' flame)

**Evidence.** Dominant warm pixel in both regions is rgb(255,105,0) = #FF6900 (Tailwind v4 orange-500). The achievement accent measured in the same surface family is rgb(170,116,9) = #AA7409 (`text-achievement-strong`, feed-activity-cards-light.png PR star at x30 y1020 and the '2 PRs' chip at x295 y1520). src/styles/tokens.css:24-31 defines `--ds-orange-500: #e87316` and its comment names this exact use — 'GENERIC warm orange ramp — PR-celebration flash, streak flame, the NEW badge'. THEME.amber is #D97706, and the canonical StreakFlame.tsx:44-45 hardcodes #ea580c/#fb923c. None of those is #FF6900.

**Why it is a defect.** Breaks the standing per-PR invariant that every colour is a THEME/token. It is a fresh instance rather than backlog D10 — D10 tokenized the streak MODAL's flame to THEME.amber and left these surfaces untouched; the raw class appears at PartnerStreakHero.tsx:22-23, PartnerStreakCard.tsx:68-69 and 122-123, and UserProfile.tsx:497.

**Suggested fix.** Repoint the four call sites off `text-orange-500` / `bg-orange-500/10` onto the documented streak-flame ramp — `--ds-orange-500` (#E87316) or THEME.amber, whichever StreakFlame.tsx is reconciled to — so the four warm oranges currently claiming 'streak flame' collapse to one.

**Corrected by the verifier.** Two details to fix before acting on it. (1) The comparison colour measured on the PR star, rgb(170,116,9) = #AA7409, is `--achievement` (`40 90% 35%`), not `text-achievement-strong` — that token is `40 90% 26.5%` = #805807. (2) Worth stating why this survived the sweeps: the standing 'every colour is a THEME/token' invariant is lint-enforced on HEX LITERALS only (eslint no-restricted-syntax, per the header of src/lib/**tests**/designSystemInvariants.test.ts:9), so a Tailwind palette class is invisible to the guardrail. If this is fixed, extending that rule to raw palette classes is the change that stops it recurring; the four repoints alone will not.

<details><summary>Verifier's refutation attempt</summary>

All four call sites confirmed: PartnerStreakHero.tsx:22-23 (`bg-orange-500/10` + `text-orange-500`), PartnerStreakCard.tsx:68-69 and 122-123, UserProfile.tsx:497. I sampled the frames myself: solo-feed-light.png at (44,240,28,28) is dominated by rgb(255,105,0) x52, and user-profile-light.png at (14,200,14,14) carries the same rgb(255,105,0). Verified the provenance rather than assuming — node_modules/tailwindcss/theme.css declares `--color-orange-500: oklch(70.5% 0.213 47.604)`, which is #FF6900. tokens.css:22-31 does name this exact use ('GENERIC warm orange ramp — PR-celebration flash, streak flame...') at `--ds-orange-500: #e87316`, a different colour. Checked the D10 defence and it does not cover this: that row's resolution text names only the streak MODAL flame (→ THEME.amber), plus RunDetail overlay buttons and RunMap as documented map-canvas exceptions. Checked whether raw palette classes are sanctioned: DESIGN_GUIDE §3 states Tropos has TWO colour mechanisms — HSL token classes (§3a) and the THEME object (§3b) — and `orange-500` is neither. No ADR or plan-file lock. Low severity is right: it is token hygiene, the flame still reads as a flame, and nothing is illegible.

</details>

### Weight units are formatted two different ways two lines apart inside the same exercise card — "32.5kg" then "60 kg × 8"

- **Surface group:** programme
- **Source:** `src/pages/Program.tsx:1619 (no space) vs src/pages/Program.tsx:1638 (space)`
- **Frame:** program-dark.png (crop 16,910 361×350 @3x — Barbell Row card); same in program-light.png (crop 20,985 200×60 @5x)

**Evidence.** The Barbell Row card renders "3 sets × 10 reps · 32.5kg" and, on the very next line, "Last: 60 kg × 8". At 3x the closed-up "32.5kg" and the spaced "60 kg" are unmistakably different. In source, the target line closes `<span className="font-mono tabular-nums">{ex.weight}</span>` and then emits the bare literal `kg` (line 1619 — no separating `{" "}`), while the Last line emits `{lastPerf.weight}</span>{" "}` then `kg ×{" "}` (line 1638). The same pair is duplicated in the reorderMode branch at lines 1506 and 1525, so all four sites disagree in the same way. Program.tsx:129 (`${Math.round(kg)}kg`) follows the no-space form; TrainingBlockCard.tsx:641 (`+{gain} kg`) follows the spaced form.

**Why it is a defect.** The same unit, on the same card, in the same type tier, rendered with two different glyph treatments. Numeric display is a documented invariant in this repo (font-mono + tabular-nums everywhere); a unit suffix that changes shape line-to-line breaks the same consistency the tabular-nums rule exists to protect.

**Suggested fix.** Pick one form and route both sites through it — add a `weightLabel(kg)` helper next to the existing `formatRepTarget` in Program.tsx and use it at 1506/1525/1619/1638, so the fix cannot drift again between the reorder and default branches.

**Corrected by the verifier.** The visual observation is real and confirmed on both frames, but the stated justification overreaches and the scope is mis-set. There is no documented rule on unit spacing: CLAUDE.md's numeric invariant is font-mono + tabular-nums, which both lines already satisfy, and DESIGN\*GUIDE.md says nothing about whether a unit suffix takes a leading space. So this is a convention gap, not a rule violation. It is also app-wide rather than a Program.tsx defect — roughly 54 spaced (` kg`) against 24 unspaced sites across src/\*\*/\_.tsx — so a local `weightLabel(kg)` helper in Program.tsx fixes the visible adjacency but leaves the app split. The defensible finding is the narrow one: the same unit rendered two ways two lines apart on one card is a visible inconsistency worth normalising, best done by picking one form repo-wide rather than patching four call sites.

<details><summary>Verifier's refutation attempt</summary>

Source verified: the target line closes the font-mono span and emits a bare `kg` on the next JSX line (no `{" "}`), which JSX renders with no separating space; the Last line emits `</span>{" "}` then `kg ×{" "}`. The same disagreeing pair is duplicated in the reorderMode branch, so all four sites are as described. Confirmed visually rather than trusting the source read: cropped the Barbell Row card at 5x from both program-dark.png and program-light.png and the frames plainly show "3 sets × 10 reps · 32.5kg" above "Last: 60 kg × 8". Not a capture artifact (glyph spacing has no transition, and it is identical in both themes). Not logged in D1-D24; no lock in docs/adr/\*.md or the plan file; no explanatory comment at either site. The finding's rule basis is the weak part and is why severity drops, not the observation.

</details>

### Every Settings sub-page renders its H1 a full typographic step LARGER than the Settings index it drilled down from, and larger than every other page title in the app

- **Surface group:** settings
- **Source:** `src/components/settings/SettingsSection.tsx:80 (`text-h2`) vs src/pages/SettingsIndex.tsx:183 (`text-xl`)`
- **Frame:** settings-light.png (cap scan x=88-103 y=25-60) vs settings-account-light.png (cap scan x=16-36 y=82-115); same delta visible in settings-run-plan-light/-dark and settings-subscription-light/-dark

**Evidence.** Row-profile scan of the "S" in "Settings" on the index: ink rows 35–49 = 15px cap height. Scan of the "A" in "Account" on the sub-page: ink rows 91–108 = 18px cap height — 20% taller. Sources confirm the exact tokens: the index h1 is `text-xl font-extrabold` (20px), the shared sub-page wrapper is `text-h2 font-extrabold`, and tokens.css:52 defines `--ds-text-h2: 1.563rem` = 25px. Grepped every `<h1>` in src/pages: Food, Program, Social, Support, Upgrade, PrivacyPolicy, TermsOfService, RunSummary, Diagnostics and SettingsIndex are all `text-xl`; `SettingsSection` is the only app-surface component on `text-h2`, and it supplies the title for all 15 nested settings pages.

**Why it is a defect.** The 1.25 modular scale documented in CLAUDE.md puts these one full tier apart (20px H-tier vs 25px H2). A child page's title outranking its own parent inverts the hierarchy the nested-page IA is built on, and it makes Settings the only tab in the app whose sub-pages don't share the tab's title size. Same defect class as D17 ("peer compact tiles a full typographic tier apart"), which was accepted and fixed.

**Suggested fix.** Change SettingsSection.tsx:80 to `text-xl font-extrabold` so all 15 sub-pages match SettingsIndex and the rest of the app. (If the intent is instead that page titles should be the documented ~31px H1, that is an app-wide call for a separate PR — but the two must not disagree inside one tab.)

**Corrected by the verifier.** The disagreement is real; the assignment of blame is not. DESIGN_GUIDE.md's type table says `text-h1` (~31px) is for page titles and `text-h2` (25px) is for section headers — so SettingsSection at 25px is the title in the app CLOSEST to the written rule, and the ~14 page titles sitting at `text-xl` (20px) are the actual documented drift. The defensible finding is "the Settings index and its 15 sub-pages disagree by one tier inside a single tab"; which side moves is a product/design call (one that would touch every page if resolved toward the guide), not a one-line fix to SettingsSection. Severity is low, not medium: the sub-page title reads as a heading either way and no rule the repo currently follows is being broken.

<details><summary>Verifier's refutation attempt</summary>

The measurement is sound and I reproduced it. SettingsSection.tsx:80 is `text-h2 font-extrabold`; SettingsIndex.tsx:183 is `text-xl font-extrabold`; index.css:137 bridges --text-h2 to --ds-text-h2 = 1.563rem (tokens.css:52) = 25px, vs text-xl = 20px. Frames: "Settings" cap ink rows 35-49 = 15px, "Account" cap ink 90-108 = 18px (ratio 1.20 against the expected 1.25). I checked the two frames are comparable despite different widths (393 vs 375) by measuring a shared text-sm element in each — both subtitles give a 10px cap — so this is a real type-size difference, not a DPR artifact. Grep of every <h1> in src/pages confirms SettingsSection is the only app-surface component on text-h2 (Login.tsx is the one other user, an auth shell). No backlog row, no ADR, no plan-file lock, and no explanatory comment at the header (the only comment in that block is about the back-arrow's 44px target).

</details>

### Nutrition sub-page hand-rolls a copy of AccordionSection, re-introducing the collapse that `inline` mode exists to remove on nested pages

- **Surface group:** settings
- **Source:** `src/components/settings/NutritionSection.tsx:118-141 (hand-rolled), vs the primitive it imports at :25 and passes `inline` to at :111-112`
- **Frame:** nutrition-settings-dark.png (crop x=8 y=150 w=380 h=160 @3x)

**Evidence.** The frame shows the first card on the page, "TDEE Calculator / 2500 cal/day target", collapsed behind a chevron-down — the only collapsed block on any Settings sub-page (account, run-plan and subscription frames all render fully expanded). Directly beneath it, "Goal Weight / Sets your calorie target — current 70.0 kg" uses a visually identical header row (same `size-5` primary icon, same `text-sm font-medium` title, same `text-xs text-muted-foreground` subtitle) but is NOT collapsible — the chevron is the only cue, and it is on the far right edge. The hand-rolled block reproduces AccordionSection's chrome verbatim: `bg-card rounded-2xl overflow-hidden`, `w-full flex items-center justify-between p-4`, ChevronUp/Down `size-4 text-muted-foreground`, and body `px-4 pb-4 space-y-4 border-t border-border/50 pt-4`.

**Why it is a defect.** Hand-rolled control where a primitive exists. AccordionSection's own docstring states the rule this violates: `inline` skips the collapsible shell because "the nested-page Settings IA … the user has already drilled into a single section, so the toggle adds noise without value". SettingsNutrition passes `inline`, honouring that decision, and the page then hand-builds a toggle that contradicts it — and hides the page's headline number (the calorie target) behind it. Two identical-looking header rows with different interaction models is also the "same information placed inconsistently across sibling elements" case.

**Suggested fix.** Replace the hand-rolled block at NutritionSection.tsx:118-141 with `<AccordionSection inline={inline} icon={<Calculator className="size-5 text-primary" />} title="TDEE Calculator" subtitle={`${tdee.targetCalories} cal/day target`}>` so it inherits the nested-page `inline` decision from the same prop the outer section already receives — on the sub-page it renders expanded like every sibling, and the duplicated chrome disappears.

**Corrected by the verifier.** Real as a primitive-duplication defect, wrong in its stated why and its fix. (1) FALSE that it "hides the page's headline number": I read the frame — the collapsed header renders the subtitle "2500 cal/day target", so the calorie target is visible while collapsed. (2) The `inline` docstring governs the SECTION-level shell ("the user has already drilled into a single section"); this is a nested sub-block deliberately marked `{/* TDEE Calculator (sub-collapsible) */}` at :117, and the suggested `inline={inline}` fix would force a long age/height/weight/activity form permanently open on the page — a behaviour change, not a de-duplication. (3) The "identical-looking sibling" claim is weak: the Goal Weight card visibly continues into its 70.0 stepper beneath the header, so it does not read as a collapsed row. The accurate defect is narrower and is an a11y one the finding never mentions: the hand-rolled toggle omits everything the primitive wires — `aria-expanded`, `aria-controls`, the panel's `role="region"`/`aria-labelledby`, and the `haptic("light")` tap feedback — which is exactly the drift ADR-0003 describes. The correct fix is `<AccordionSection>` WITHOUT `inline`, preserving the collapse.

<details><summary>Verifier's refutation attempt</summary>

The duplication half verifies: NutritionSection.tsx:118-141 reproduces AccordionSection.tsx's chrome string-for-string (`bg-card rounded-2xl overflow-hidden`, `w-full flex items-center justify-between p-4`, `size-4 text-muted-foreground` chevrons, `px-4 pb-4 space-y-4 border-t border-border/50 pt-4`), while the file imports the primitive at :25 and passes it `inline` at :111-112. It is also the only collapsible left anywhere in Settings — grep for ChevronUp across src/components/settings and src/pages/settings returns this file alone — and NutritionSection is now only ever rendered with `inline` (SettingsNutrition.tsx:122 is the sole caller since the legacy stacked page went, D13). But two of the three stated reasons fail on inspection, which is why the claim needs rewriting rather than adopting.

</details>

### "Full programme settings" is the only cross-page navigation row in Settings with no chevron and no leading icon

- **Surface group:** settings
- **Source:** `src/components/program/RunPlanSettings.tsx:598-609`
- **Frame:** settings-run-plan-light.png (crop x=8 y=170 w=360 h=200 @3x — row at y≈305-365); same in settings-run-plan-dark.png

**Evidence.** The row uses the exact index/subscription row typography (`text-sm font-medium text-foreground` title + `text-xs text-muted-foreground` description, here "Goal, nutrition, lifting, equipment, injuries") and navigates to another settings page (`onOpenFullSettings` → `navigate("/settings/training")` in SettingsRunPlan.tsx:106), but renders neither affordance. Grepped `ChevronRight` across src/components/settings and src/pages/settings: every other navigation row carries `<ChevronRight className="size-4 text-muted-foreground" />` — SettingsIndex.tsx (13 rows), SupportLegalSection.tsx:85/103/114/125, SettingsSubscription.tsx:55, AiUsageSection.tsx:83. The subscription frame in this same set shows both of its rows with icon + chevron; this row has neither.

**Why it is a defect.** SettingsIndex.tsx:227 states the convention explicitly — "The chevron on the right is the iOS Settings affordance for 'tap to drill into this section.'" A row that looks exactly like a drill-in row but withholds the affordance reads as a static description card, so the escape hatch to the full programme editor is easy to miss.

**Suggested fix.** Give the row the standard treatment: wrap the text block in `flex items-center justify-between`, add `<ChevronRight className="size-4 text-muted-foreground" />` on the right, and a `size-8 rounded-lg bg-muted` container with a `size-4` icon (e.g. `Settings`/`Cog`) on the left to match the index rows.

**Corrected by the verifier.** Two citation corrections, neither material. The convention comment quoted from SettingsIndex is at line 230, not 227. And the row does carry an explanatory comment — `{/* ── Full programme settings escape hatch ── */}` at RunPlanSettings.tsx:597 — but it names the row's purpose, not a reason to withhold the affordance, so it does not make this a documented trade-off.

<details><summary>Verifier's refutation attempt</summary>

Verified in source and frame. RunPlanSettings.tsx:598-609 is a full-width button with `rounded-2xl bg-card border border-border/40` and two <p> lines, no ChevronRight and no icon; SettingsRunPlan.tsx:102 wires onOpenFullSettings to navigate("/settings/training"), and App.tsx:523 confirms that route is live, so it is genuinely a drill-in. I cropped settings-run-plan-light.png over the row at 3x: it renders as a plain text card with no affordance on either edge — and dark matches. The convention it departs from is real and holds on sub-pages too, not just the index: ChevronRight appears on all 13 SettingsIndex rows, SupportLegalSection.tsx:85/103/114/125, SettingsSubscription.tsx:55 and AiUsageSection.tsx:83, and a grep for other in-Settings navigations turns up no third chevron-less case. Not a capture artifact (no transition), not in the backlog (D14 covers run-plan editing DUPLICATION, marked Fixed, not this affordance), and no ADR or lock touches it.

</details>

### The running section is announced twice on the Analytics tab, in two different registers, 450px apart

- **Surface group:** analytics
- **Source:** `src/components/run/RunningHistorySection.tsx:36 (the inner one); outer at src/pages/History.tsx:1369-1371`
- **Frame:** history-dark.png crop 0 1786 200 26 @5x ('RUNNING') and crop 0 2238 200 30 @5x ('Running'); same pair in analytics-loaded-dark.png at y≈1010 and y≈1515

**Evidence.** At y=1798 the page prints 'RUNNING' — coral (`text-running-strong`), uppercase, letter-tracked, ~10px — through the SectionLabel primitive. At y=2251, still inside that same section and after the StatCards and Race-predictions card, RunningHistorySection prints 'Running' again as a hand-rolled `<h3 className="text-sm font-semibold flex items-center gap-2">` with a coral Footprints icon, in foreground white sentence case at 14px. Both crops attached show the two side by side; nothing between them changes topic.

**Why it is a defect.** 'Labels duplicated, or in the wrong register (sentence vs uppercase)', plus SectionLabel exists as the primitive for exactly this. This is the same shape as backlog D21 but a distinct instance: D21 is scoped to the three 'Performance' labels and is blocked on the D20 product call about that word. Nothing blocks this one — the inner heading is redundant with the outer, not a competing product decision.

**Suggested fix.** Delete the `<h3>` from RunningHistorySection (History.tsx already labels the section), or if the component must stand alone elsewhere, gate the heading behind a `showHeading` prop that History passes false, and render it via SectionLabel rather than a hand-rolled h3 when it is shown.

**Corrected by the verifier.** Accurate, and the suggested fix can be simplified: RunningHistorySection has exactly ONE call site (History.tsx:1447, lazy-imported at :76-78), all of it inside the already-labelled `analytics-running` section — so the h3 can simply be deleted; no `showHeading` prop is needed for a stand-alone case that does not exist. History.tsx cite is :1368-1371.

<details><summary>Verifier's refutation attempt</summary>

Both cites verified. src/pages/History.tsx:1368-1371 renders `<SectionLabel className="mt-6 mb-2 text-running-strong">Running</SectionLabel>` inside `<section id="analytics-running">`; src/components/run/RunningHistorySection.tsx:36 renders a hand-rolled `<h3 className="text-sm font-semibold flex items-center gap-2">` with a coral Footprints icon and the word 'Running'. My crops of history-dark.png at y=1786 and y=2238 show coral uppercase tracked 'RUNNING' and white sentence-case 'Running' respectively, and a 393-wide crop of the whole span between them confirms only StatCards and the Race-predictions card sit in between — nothing changes topic. Not a capture artifact. Not D21: that row is scoped to the three hand-rolled 'Performance' labels and is explicitly blocked on the D20 product call about that word; nothing blocks this one. No ADR or comment defends the inner heading. Deleting it breaks no rule.

</details>

### Badge earned-dates render as US M/D/YYYY while every other dated surface in the app pins en-GB

- **Surface group:** analytics
- **Source:** `src/features/streaks/BadgeGrid.tsx:206`
- **Frame:** badges-grid-dark.png crop 16 430 361 175 @3x (reads '8/22/2026'); compare run-detail-dark.png crop 16 350 361 160 @3x from the same capture run (reads 'Friday, 21 August 2026')

**Evidence.** Three earned badges in the frame show '8/22/2026'. The call is bare: `new Date(badge.earnedAt!).toLocaleDateString()` — no locale, no options, so it takes the runtime locale and the numeric default. Every other dated surface passes an explicit locale and option set: RunDetail.tsx:187 and :520, WorkoutDetail.tsx:164 and :170, FeedView.tsx:199, SoloFirstFeed.tsx:85, FoodHeroCard.tsx:546, TrendWeight.tsx:277 and RunSummary.tsx:1995 all use "en-GB". Two frames from the same capture run therefore disagree about how this app writes a date.

**Why it is a defect.** 'The same information placed inconsistently across sibling elements.' For a UK-targeted product (troposfit.com, kg, km, en-GB everywhere else) an unqualified toLocaleDateString is also a correctness risk, not only a style one: 8/22 and 22/8 are indistinguishable to the reader for the first twelve days of any month.

**Suggested fix.** Pin it like its siblings — `toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })` — which also reads better than a numeric date in a 115px-wide card. Two other unqualified-or-en-US call sites are worth sweeping at the same time: TrendWeight.tsx:79 and RunSummary.tsx:1259.

**Corrected by the verifier.** BadgeGrid.tsx:206 is the only rendered date in the app that passes neither a locale NOR options to toLocaleDateString, so it is the only one that renders as an all-numeric, device-dependent date. It is not true that every other site pins en-GB — five pass `undefined` and three pass en-US — but all of those pass {month:"short"}-style options, so none is ambiguous. The specific '8/22/2026' in the frame reflects the CI runner's default locale (playwright.config.ts sets no `locale`); a UK device would show 22/08/2026. Fix by pinning locale AND options like the siblings; the TrendWeight:79 and RunSummary:1259 en-US sweeps remain worthwhile.

<details><summary>Verifier's refutation attempt</summary>

The source claim is exact: src/features/streaks/BadgeGrid.tsx:206 is a bare `new Date(badge.earnedAt!).toLocaleDateString()` with neither locale nor options, and my crop of badges-grid-dark.png shows '8/22/2026' on three earned badges while run-detail-dark.png from the same run reads 'Friday, 21 August 2026'. The eight enumerated en-GB siblings all check out. Two things needed correcting, both of which narrow the claim without killing it. First, 'every other dated surface pins en-GB' is false: five sites pass `undefined` as the locale (ExerciseCompareSheet:39, CirclesSection:146, HeroDrillDownSheet:210, RunFitnessSection:161, RunSetupModal:191) and three pass en-US (TrendWeight:79, ScanQuotaIndicator:8, RunSummary:1259). What is actually unique about BadgeGrid is that it passes no OPTIONS, so it is the only rendered surface producing an all-numeric date; every other site passes month/day options that stay unambiguous under any locale. Second, the exact string in the frame is partly a capture artifact of the runner: playwright.config.ts sets no `locale`, so the CI browser defaults to en-US — a UK device would render '22/08/2026' there, not '8/22/2026'. The underlying defect (a device-dependent, ambiguous numeric date on a surface whose siblings are pinned) is real either way. No backlog row, no comment, no ADR. Low severity is right.

</details>

### Analytics 'RUNNING' summary: the middle of three peer stat tiles omits the sport colour its siblings carry

- **Surface group:** lightmode
- **Source:** `src/components/run/RunningHistorySection.tsx:97`
- **Frame:** analytics-loaded-light.png — crop (12,1690,375,110)@3x; probes (60,1755,30,18), (190,1755,14,18), (298,1755,44,18).

**Evidence.** One `grid grid-cols-3 gap-2` with three tiles of identical markup. Measured value colours: '5.2 total km' = `#ac2f48`, '1 total runs' = `#09090b`, '5:35 best pace' = `#ac2f48`. The `<p>` at :86 and :104 carry `text-lg font-bold font-mono tabular-nums text-running-strong`; the one at :97 is byte-identical minus `text-running-strong`. No comment in the file justifies the difference, and all three are running aggregates of equal rank.

**Why it is a defect.** DESIGN_GUIDE's 'Sport-coding everywhere — run content uses coral tints' and the peer-consistency rule: three tiles of equal rank in one grid should not render in two different colour registers. Honest scoping note: unlike the findings above this is theme-agnostic — it reads the same way in dark — but it was found in a light frame and is a one-token fix.

**Suggested fix.** Add `text-running-strong` to the `<p>` at RunningHistorySection.tsx:97 so the three peers match. If the black was intentional (e.g. counts vs measurements), the other two should drop the class instead and the reason belongs in a comment — right now nothing records a decision.

**Corrected by the verifier.** Real and correctly described. Two additions: the exact line is :97, and I checked the 'maybe counts differ from measurements' defence — it does not hold, because the app's other peer stat grid (SessionCompleteScreen.tsx:205/217/238) puts counts AND measurements all on one register (`text-foreground`). So no convention exists that :97 could be following. Scope caveat the audit already makes honestly: this is theme-agnostic and does not belong to the light-mode group it was found in.

<details><summary>Verifier's refutation attempt</summary>

SOURCE CONFIRMED: RunningHistorySection.tsx:86 and :103 read `text-lg font-bold font-mono tabular-nums text-running-strong`; :97 is byte-identical minus the class. RE-MEASURED on analytics-loaded-light.png: 5.2 = rgb(172,47,72) = #AC2F48 = --running-strong (6.45:1), 1 = rgb(9,9,11) = --foreground (19.90:1), 5:35 = #AC2F48 (6.45:1). Crop viewed — two coral, one black, in one `grid grid-cols-3`. NOT AN ARTIFACT: this is a missing class, not a colour value, and it reads the same in dark. NOT LOGGED in D1-D24. NO LOCK, no comment. Not a rule break — `text-running-strong` is the existing token and DESIGN_GUIDE's sport-coding rule points the same way.

</details>

---

# Conclusion

# Visual audit — conclusion

## Consolidation

Four sets collapsed; nothing was a straight duplicate of a `docs/design-backlog.md` row (D19 and D21 are adjacent but differently scoped, per the verifier notes, and D18 explicitly carves out Recharts ticks — that half is dropped).

| Merged into                                        | Absorbed                                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Fractional-opacity `text-muted-foreground`**  | Food (`/70`, `/80`, `/90`), Social `ActivityCard` (`/60`), Programme `Program.tsx` (`/80`) — one defect, 69 call sites across 42 files |
| **B. Theme-blind `THEME.*` hex on light surfaces** | RunDetail stat pills, PI delta chip, `THEME.text.muted` (47 sites), DeloadBanner, WaterCard `+`, Performance verb label                |
| **C. The range input**                             | Inverted dark groove + 6px track — same control, both fixes land in `src/index.css:732`                                                |
| **D. A section announced twice**                   | Analytics `RUNNING`/`Running`, UserProfile `Progress photos`/`Progress Vault`                                                          |

Dropped outright: the 9px Recharts tick (documented D18 carve-out, pinned by `runHudTypeFloor.test.ts`); the "`inline` mode" rationale in the Nutrition accordion finding (refuted — the collapse is deliberate, only the a11y wiring is missing).

---

## Fix now

Mechanical, low-risk, no product or palette call.

**STATUS 2026-08-22 — 18 of 19 shipped.** Everything below is
implemented except **#1**, whose two halves came apart: the 6px track is
fixed (the input box is 44px now) but the groove is NOT. Three attempts
failed for three different reasons, all recorded in `docs/design-backlog.md`
D27; the short version is that on Chromium `accent-color`'s fill IS the
track background, so painting the track erases the fill, and
`color-scheme` follows the DEVICE, not the app's `.dark` class. The
remaining fix is a gradient-painted track driven by a per-value custom
property with an explicit thumb, dropping `accent-color` entirely.

Three things worth carrying forward from the implementation, none of them
predictable from the audit:

- **#5 could not ship alone.** Moving race distance onto
  `SegmentedControl` gives its options an explicit `role="radio"`, which
  overrides the implicit button role — so
  `onboarding.screens.capture.spec.ts`'s `tap(page, /full/i)` helper
  (a `getByRole("button")`) stopped matching. `tap` is best-effort and
  swallows misses, so the distance would have stayed at its `10k`
  default and the two Run15 assertions below it would have failed
  against a scenario nobody wrote. Any migration onto this primitive
  needs its e2e locators moved in the same commit.
- **#8's existing test asserted the drifted side.** Every test in
  `CirclesSection.together.test.tsx` rendered ONE of the two surfaces,
  never both, so the rename was invisible to a green suite. The
  replacement walks each option end to end — and had to be scoped to the
  confirmed header, because the chooser stays mounted under the sheet and
  a document-wide query finds its own copy of the string. Mutation-checked.
- **#13's sweep was incomplete as written.** It named TrendWeight and
  RunSummary; `ScanQuotaIndicator` was a third site, and its unit test
  pinned the en-US form.

#11's second half (the label rename) is done because the row was
restacked 1 + 2 first — the "needs a decision" framing rested on the
three-up row's ~59px of label room, which no longer applies.

1. **The run-days slider reads inverted in dark and has a 6px track.** The unfilled groove is UA-painted (`#EFEFEF` in _both_ themes — 16.5:1 against the dark page, invisible at 1.03:1 on light), and `input[type="range"] { height: 6px }` puts the whole control ~3× under the 44px floor. `src/index.css:732-736`. Give the track pseudo-elements the 6px and a `bg-muted` fill, set the input box to 44px with a transparent background, and re-centre the thumb — that closes `Onboarding.tsx:1219` and `RunSetupModal.tsx:1204` together. **This is the only drag control in the first-run flow.**

2. **Every Circles bottom sheet ships its body with zero horizontal padding.** The primary CTA runs to the sheet edge while the sheet's own header sits at 16px. Add `px-4` to the body wrapper at `CirclesSection.tsx:1002, 1114, 1156, 1190, 1366`, `CircleWeeklyFocusSheet.tsx:74`, `SpaceCommentSheet.tsx:117` — the other ~28 `BottomSheet` callers already do.

3. **The macro bar reverses direction one tap apart.** Tile drains (remaining), drill-down sheet fills (consumed) — protein reads 9% full on the tile and 89% in the sheet, same data. `HeroDrillDownSheet.tsx:78` never receives the mode at all. Thread `CalorieRingMode` in and apply the existing `isLeftMode ? 1 - pct : pct`; factor it into one helper, since the sheet's calorie bar at `:247` contradicts the draining `CalorieRing` the same way.

4. **`5:34/km/km`.** `RunFitnessSection.tsx:313` composes `paceLabel(value, unit)` with `paceUnitLabel(unit)`, but `paceLabel` (`runLabels.ts:66`) already appends the unit. Drop the suffix; the `paceUnitLabel` import on line 8 then goes unused.

5. **Race-distance pills are the last hand-rolled instance of an already-migrated pattern.** 32px targets, no `role="radio"`, a `#000` literal. `Onboarding.tsx:1268-1289` → `SegmentedControl tone="running"`. Run10 (plan file :615) records the sibling surfaces shipping exactly this in June; Onboarding is the straggler. Note the `#000`/`#fff` 3-digit literals slip the eslint hex guard (`#[0-9a-fA-F]{6}`) — worth widening that rule in the same pass.

6. **Sign Out outshouts Delete Account.** `AccountSection.tsx:337-343` wears `bg-destructive` at 16px/46px; `:346-364` — the irreversible one — is a 42px outline at 14px. Route both through `Button` (`outline` / `destructive`, `fullWidth`), which also fixes the 42px miss. Same bespoke string at `:394`.

7. **The onboarding CTA moves after the first tap.** `Onboarding.tsx:1953` collapses the Back slot on step 0, so Continue shrinks 86px and its centre jumps 43px right between the first and second of eight identical taps. Reserve the slot (`invisible aria-hidden tabIndex={-1}`).

8. **The circle you pick is renamed on the next screen.** `COLD_START_OPTIONS` (`CirclesSection.tsx:100-124`) and the lock-pinned `LAUNCH_TEMPLATES` (`goalSpaceTypes.ts:99-119`) disagree on label _and_ copy — tap "Race", confirm "Race Journey". Derive the chooser's label/description from `LAUNCH_TEMPLATES` by `type`.

9. **A section announced twice.** `RunningHistorySection.tsx:36`'s hand-rolled `<h3>Running</h3>` sits 450px below `History.tsx:1368`'s coral uppercase `SectionLabel` — one call site, just delete it. Same at `UserProfile.tsx:510` vs `ProgressPhotos.tsx:572` (`Progress photos` / `Progress Vault`, 37px apart, mismatched register) — delete the wrapper heading; the section's `aria-label` already names it.

10. **The Weekly Distance chart draws axis lines and tick stubs; its sibling 430px below draws none.** `RunningHistorySection.tsx:44-61` re-declares `CHART_GRID_PROPS` inline and omits `axisLine={false} tickLine={false}`. Import from `chartStyles` and add the two props. Leave the 9px tick alone. (`TrendWeight.tsx` is a third file duplicating the values by hand — expect 3 call sites, not 2, if you add a lint.)

11. **RunDetail's header "Share" is a hand-copy of `sport-tinted`, and collides with a different "Share" 165px below.** `RunDetail.tsx:380-387` — raw `<button>` at `bg-running/10`→`/8`, `text-xs` not `text-sm`, a literal `↗` instead of lucide. Swap to `<Button variant="sport-tinted" size="sm" leftIcon={<Share2/>}>`, and rename the row action to the name its own comment at `:406` already uses ("Export GPX"). Note `Save route` in that row already wraps to two lines (59px of label room), so the row needs the icons dropped or a 2+1 layout before it can take a longer third label.

12. **Badge card footers land at three heights in one row.** `BadgeGrid.tsx:172` is a plain block, so a 1- vs 2-line name and a date-vs-progress-bar footer push the status line 15.5px apart across peers the grid has already equalised. Make the card `flex flex-col` with `flex-1` on the name block.

13. **`BadgeGrid.tsx:206` is the only rendered date in the app passing neither locale nor options** to `toLocaleDateString` — an all-numeric, device-dependent date (`8/22/2026`) beside `Friday, 21 August 2026` on a sibling surface. Pin `"en-GB"` + `{day, month:"short", year}`. Sweep `TrendWeight.tsx:79` and `RunSummary.tsx:1259` (en-US) while there.

14. **The `<3`-weigh-in weight card is a bare centred sentence** — no mark, no title, no CTA — two cards from `EmptyState` hexagons. `TrendWeight.tsx:89-96`, and it is the 0-entry state, i.e. what every new user sees. Use `<EmptyState compact>`. (The single-entry branch at `:65-87` is fine — it has a `SectionLabel` and the figure.)

15. **The TDEE block hand-rolls `AccordionSection` verbatim** (`NutritionSection.tsx:118-141`) in a file that imports the primitive on line 25 — losing `aria-expanded`, `aria-controls`, `role="region"` and the haptic. Swap to `<AccordionSection>` **without** `inline`; keeping the collapse is correct.

16. **"Full programme settings" is the only drill-in row in Settings with no chevron and no icon** (`RunPlanSettings.tsx:598-609`), so the escape hatch to `/settings/training` reads as a static description card. Add the standard `<ChevronRight className="size-4 text-muted-foreground" />` + icon container.

17. **Middle of three peer run tiles omits the sport colour.** `RunningHistorySection.tsx:97` is byte-identical to `:86`/`:103` minus `text-running-strong` — two coral figures and one black in one `grid-cols-3`. Add the class.

18. **Elevation cell content starts 20px inboard of its grid column** (`ActivityCard.tsx:312-331`, duplicated `:652-668`) because the Mountain icon is a sibling of the value/label stack. Move it inside the stack.

19. **Streak flames render `#FF6900`** — raw Tailwind `orange-500`, not any Tropos token, at `PartnerStreakHero.tsx:22-23`, `PartnerStreakCard.tsx:68-69, 122-123`, `UserProfile.tsx:497`. Repoint to `--ds-orange-500`, whose own comment names "streak flame". The hex-literal lint can't see palette classes — extend it, or this recurs.

---

## Needs a decision

Each of these has a correct fix that changes something a person has to choose. Guessing is the defect.

**1. Theme-blind `THEME.*` hex constants fail AA across the light build.** _(Cluster B — highest user impact of anything here.)_

Measured, all light-mode, all confirmed against the source literal byte-for-byte:

| Site                                                                   | Ratio           | Floor        |
| ---------------------------------------------------------------------- | --------------- | ------------ |
| `RunDetail.tsx:398,:403` — PACE / CAL hero stats                       | 2.86:1 / 2.77:1 | 3:1 (large)  |
| `PerformanceHeroCard.tsx:308-315` — PI delta chip                      | 2.30:1          | 4.5:1        |
| `WaterCard.tsx:179` — quick-add `+` glyph                              | 2.49:1          | 3:1 (1.4.11) |
| `DeloadBanner.tsx:205` — "Consider a deload week"                      | 2.20:1          | 4.5:1        |
| `performanceColour.ts:47` → `PerformanceHeroCard.tsx:291` — verb label | 3.19:1          | 4.5:1        |
| `theme.ts:69` `THEME.text.muted` — **47 sites, 17 files**              | 3.07–3.26:1     | 4.5:1        |

The AA-safe, theme-aware steps already exist (`--teal`, `--warning-strong`, `--success-strong`, `--lifting-strong`, `--muted-foreground`) and are annotated in `index.css` for exactly these cases. **The decision:** every one of those CSS tokens has a _different dark value_ from the JS literal it replaces, so no swap is dark-neutral — `--warning-strong` turns the deload banner amber, `--success-strong` shifts the delta chip green, `--muted-foreground` lightens 47 captions. Choose: (a) adopt the CSS tokens and accept the dark re-colour, or (b) add light-only steps matching today's dark values. Also note `theme.ts:69` sits under an explicit `// Light mode text helpers` comment and `CLAUDE.md:429` documents `#8E8E93` as part of the palette — so retiring it edits the documented palette, not just call sites. This is _not_ D19 (that's the warning/nutrition hue alias); these fixes keep the hue.

**2. Fractional-opacity `text-muted-foreground` — 69 sites, 42 files.** _(Cluster A.)_ The base token clears AA by 0.33 on the white card, so in light mode **every** fraction of it fails. Worst measured: `MacroColumn.tsx:325` (`/70`) 2.76:1 — the only place a macro tile states consumed/target, inside a `<button>`; `Program.tsx:1624` (`/80`) 3.29:1, whose own sibling copy 113 lines up at `:1511` renders the identical markup undimmed; `ActivityCard.tsx:386-390` (`/60`) 2.31:1 on bodyweight set details, beside peers at 4.83:1; `FoodRow.tsx:223` (`/80`) 3.29:1. **The decision:** delete the modifiers (losing a de-emphasis tier the code comments say is deliberate), or introduce one dimmer token tuned to ≥4.5:1 in both themes. Either way, extend `src/styles/__tests__/tokenContrast.test.ts` to scan `text-<token>/<n>` the way it already scans `bg-<token>/<n>` — nothing in the suite can currently see this class, which is why it spread. `MacroColumn.tsx:335-338`'s comment claiming the label is "the same tone as the ratio line" is false today (4.83 vs 2.76).

**3. `SectionLabel` has zero adoption in Onboarding or Food.** Onboarding: 8 hand-rolled uppercase labels in 3 treatments plus two sentence-case stragglers, three registers stacked within 180px on the race step (`Onboarding.tsx:1168, 1212, 1263, 1299`); the file imports nothing from `@/components/ui`. Food: 18 labels, 4 tracking values, 2 weights on one screen (`FoodComposerCard.tsx:297` at weight 400 vs `MacroColumn.tsx:339` at 600, `FoodTimeline.tsx:185` at `tracking-[0.14em]`, `FoodHeroCard.tsx:463` at `[0.12em]`) — precisely the drift axes `SectionLabel`'s docstring says it consolidated. **The decision:** which tier each label takes, and separately what to do about "ADD TO", which collapses to `ADDTO` at 11px — routing it through the primitive applies _wider_ tracking and does not fix that; it needs sentence case or a different label. Onboarding also maintains its own component directory deliberately, so an exemption is arguable — but nothing documents one.

**4. Settings sub-pages render their H1 one full tier above the index they drilled from.** `SettingsSection.tsx:80` is `text-h2` (25px) for all 15 nested pages; `SettingsIndex.tsx:183` and ~14 other page titles are `text-xl` (20px). **The decision:** `DESIGN_GUIDE`'s type table says page titles are `text-h1` (~31px) — so `SettingsSection` is the one closest to the written rule and every other page title is the drift. Which side moves is an app-wide call, not a one-line edit.

**5. `THEME.warning` used as a category tint on three non-warning surfaces.** Sharpest instance: `Onboarding.tsx:1132` renders "Occasional runner" in food-orange while its immediate sibling "Regular runner" (`:1125`) is `text-running` coral — two Footprints icons in one option group, contradicting "coral always = running". Also `:1001` (Get stronger) and `:1801` (the METRICS bullet, where `theme.ts:32` maps weight to purple). **The decision:** these want a category token, but picking it is the same family of call as D19 — `THEME.warning` and `semantic.nutrition` are the same hex today, so any move here is a semantics choice, not a repaint.

**6. `ExperienceSuggestionCard` splits the week navigator from its day selector by ~470px** (`Program.tsx:1146`, between `WeekPhaseRow` at `:1130` and `ProgrammeWeekSelector` at `:1161`), so the day circles read as belonging to the suggestion card. The two sibling banners carry explicit "sits ABOVE the week-phase row" rationale; this one's comment discusses only internal spacing. **The decision:** moving it above `WeekPhaseRow` (as the banners do) buries the navigator behind a 434px card with two buttons; placing it _below_ `ProgrammeWeekSelector` restores adjacency without that cost. Pick one — the card is a rare state ("renders null almost always"), which bounds severity but, per the design-for-the-user-base rule, does not dismiss it.

**7. Weight units are formatted two ways two lines apart** — `32.5kg` above `Last: 60 kg × 8` on the same card (`Program.tsx:1619` vs `:1638`, duplicated at `:1506`/`:1525`). No documented rule covers unit spacing, and the app is split ~54 spaced to ~24 unspaced. **The decision:** pick one form repo-wide; a local helper in `Program.tsx` fixes the visible adjacency and leaves the split.
