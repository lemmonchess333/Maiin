# Tropos Visual Audit — 2026-06-09

**Rig:** built app (`npm run preview`) against Firebase Auth+Firestore emulators, seeded rich hybrid user (race plan, programState, meals, favourites, bodyweight logs, GPS run). 393×852 @3x, `isMobile`, `hasTouch`, simulated safe areas (`--safe-top` 59px / `--safe-bottom` 34px). Captures: `screens/{light,dark}/` — top, fullPage, and scroll-state variants.

**Rig caveats (read before trusting any single pixel):**

- **Engine: chromium-1194, NOT webkit.** The environment's network policy blocks Playwright browser downloads; chromium was pre-provisioned. Layout/spacing/colour/safe-area findings hold; WebKit-only rendering quirks are not covered.
- Map tiles are blocked by the same network policy → RunDetail shows its offline-map state (which produced a real finding anyway).
- These captures pre-date the Phase-2 fixes (that is intended — they are the audited state). After-fix evidence lives in `fixes/`.
- The capture user is **free tier** — Pro-gated surfaces show their gated state (also intended; the paywall is an audit target).

**Phase-2 fixes shipped alongside this report (separate commits):**
A. Status-bar occluder survives scroll (compositor layer + z-40) — `fixes/A-*`
B. Webview scrollbar suppression — CSS-only, rig can't show the before state
C. Selected meal pill → nutrition identity orange — `fixes/C-*`

---

## Per-page findings

### 01 Home — `screens/light/01-home-top.png` · `screens/dark/01-home-scrolled.png`

1. **Hue count: ~6 on one viewport** (scrolled): brand purple (nav, day bubble), coral (run card, calendar dots), orange (Recomp chip, energy bar, Log food), pink/yellow/green (macro rings). Flagged (>4).
2. Type: sizes look on-scale post-#1220; section labels at the 11px caption step.
3. Spacing rhythm: WeekStrip → Performance → Today's Energy are three same-weight white cards; only the hero day-bubble breaks the rhythm.
4. **Empty-state quality — two text-only empties on a RICH account:** the "Welcome to Tropos!" checklist card still renders for a user with 18 workouts + an active race plan, and ~~the Performance card says "appears after your first logged session" despite seeded sessions (rollup hasn't run in the rig, but the empty itself is an undesigned grey-dash + sentence)~~. Both are prime cold-start surfaces (CLAUDE.md: cold-start is a most-seen state). **Performance half fixed** (Wave3 F): the no-doc branch now renders the hexagon `EmptyState` primitive with a "Start a workout" CTA (`PerformanceHeroCard.tsx`). The "Welcome to Tropos!" stale-checklist half remains open — tracked as ranked #7.
5. Dark parity: good. No unreadable content found.
6. Safe areas: top occluder dims scrolled content (pre-fix capture shows partial dimming; post-fix verified in `fixes/A-*`). Bottom nav clears the 34px inset.
7. Redundant affordances: none egregious on Home.
8. Nothing overflowing at 393px.

### 02 Food — `screens/{light,dark}/02-food-*.png`

1. **Hue count: 7+ on the scrolled viewport** — pink/yellow/green macro tiles, orange pill + amber (pre-fix) selected pill, coral paywall, purple nav. The loudest screen in the app.
2. Type: dense but on-scale.
3. Spacing: the diary cards (BREAKFAST/LUNCH…) are uniform white cards — fine; the zone above them (Quick Add → composer → ADD TO → paywall → Log manually) stacks five different control shapes with no grouping.
4. Empty states: n/a (seeded).
5. Dark parity: good; macro bar colours read well on dark.
6. **Safe-area: Bug A reproduced here** — scrolled content entered the clock zone unprotected (`fixes/A-before-ring-through-statusbar.png`). Fixed.
7. **Redundant affordances — FOUR simultaneous "add food" entry points in one viewport:** Quick Add chips, the NL composer, the scan CTA (locked → paywall), and "Log manually" — plus a fifth (per-meal "+" buttons) one scroll below. This is the single biggest simplification opportunity on the page.
8. **Selected meal pill (pre-fix) amber-brown vs coral paywall adjacency** — Bug C, fixed (`fixes/C-*`).
9. Details sheet + pantry typeahead (`02-food-details-sheet`, `02-food-typeahead`): render correctly; typeahead returns the seeded "Pizza slice".

### 03 Programme — `screens/light/03-program-*.png`

1. Hue: purple-dominant, disciplined (lift purple / run coral split via the Lift|Run toggle).
2. The **streak-priming modal fires on first Programme visit** and stacks over the page (captured); it intercepted taps in the rig — on device it lands mid-task (you came here to train, not to configure reminders).
3. Spacing: exercise rows are uniform; week header + RECOMP chip give some hierarchy.
   4–8. No dark-parity, overflow, or safe-area issues found.

### 04 Active workout session — `screens/light/04-workout-session-*.png`

1. Hue: clean (purple + neutrals). Best-disciplined screen in the app.
2. Set table: mono tabular numerals ✓; clear targets; 44px controls.
3. Spacing: generous; single sticky CTA ("Complete Set 1") reads unambiguous.
4. The exercise-pill rail (Bench Press | Barbell Row | Overhead Press) scrolls horizontally with no edge-fade affordance — at 393px the third pill is cut and there's no visual hint more exist.
5. Dark parity: fine.

### 05 Run setup / treadmill — `screens/light/05-run-*.png`

1. Run setup: coral-coded, race-prep context strip ("Race prep · Week 4 of 8 · 10K") — strong. Hue discipline good.
2. **Treadmill live screen OVERFLOWS at 393px** — the distance input and "Save Treadmill Run" button run off the right edge (`05-run-treadmill-live-top.png`). `TreadmillMode`'s column appears to take content width inside its centring flex parent instead of `w-full`. Functional but visually broken. (Observation only — not in the Phase-2 fix list.)
3. The treadmill screen is always-dark by design; in "light" theme captures it renders dark — by design (active-run surfaces are theme-independent), but the _transition_ light page → black countdown → black screen is an abrupt flash sequence.
4. Safe area: Run-family screens render **without the Layout occluder** (they're full-screen, outside Layout). Their layouts keep content out of the clock zone by construction; the lock-screen + map screens pin chrome below `--safe-top` manually. Consistent, but worth knowing there are two safe-area systems.

### 06 RunDetail — `screens/light/06-run-detail-top.png`

1. **Text collision at 393px:** the "FREE RUN" label and the pace legend ("Faster / On pace / Slower") overlap; the Share pill also crowds the legend row. Genuine layout bug at this width.
2. The offline-map toast renders **on top of the back button** (top-left) — z/placement collision in the toast position.
3. Hue count: 6 (legend green/purple/coral + teal pace + orange cal + pink share tint).
4. **Bottom-nav active state is WRONG: the Food tab is highlighted on `/run/:id`** (also wrong on `/upgrade` — see 10). The active-tab matcher appears to fall through to a default rather than reflecting the current route.
5. Stat cards: mono numerals ✓, "0 SPLITS" shows a raw zero rather than hiding or explaining the empty splits state.

### 07 History / Analytics — `screens/light/07-history-*.png`

1. Range pills (1W|1M|3M|6M|1Y) + tab pills (Analytics|PRs|Badges) + THIS MONTH rings — three stacked control rows before any content; hierarchy is flat.
2. Hue: coral/purple/orange rings + pink charts ≈ 5; borderline.
3. ~~**Performance empty-state again text-only** ("will appear after your first logged session") — same undesigned pattern as Home.~~ — **fixed** (Wave3 F): the no-doc branch renders the hexagon `EmptyState` primitive (icon + headline + "Start a workout" CTA) in `PerformanceSection.tsx`.
4. Charts render with seeded data ✓; mono numerals ✓.
5. Dark parity (spot-checked scrolled variant): fine.

### 08 Social — `screens/dark/08-social-top.png`

1. ~~**Empty states are the page**: "Join a crew or follow people…" is a text-only box; the one designed element (Invite a training partner card) is good. Feed/Crews tabs (captured in fullPage variants) are similarly text-first.~~ — **fixed** (Soc8 solo-first + Wave3 F): the cold-start Social tab now renders the curated `SoloFirstFeed` stack (PartnerStreak hero → global hybrid challenge → share-your-training → aspirational crew row), and the Following / suggestions / crews empties use designed states (`HexEmptyState` or icon-tile rows with a CTA) rather than plain text — `src/components/social/SoloFirstFeed.tsx` + `src/pages/Social.tsx`.
2. Hue: disciplined (purple + neutrals).
3. Dark parity: good.

### 09 Settings — `screens/light/09-settings-*.png`

1. Long uniform list — expected for settings; section headers give adequate rhythm.
2. Toggle thumbs white-on-track in both themes (verified correct in #1220's audit — tracks are theme-aware).
3. No safe-area or overflow issues found.

### 10 Upgrade — `screens/dark/10-upgrade-top.png`

1. Clean two-column compare, gradient CTA (the documented brandCta gradient — the only sanctioned gradient), green "Save 27%". Good hierarchy.
2. **Bottom-nav active state wrong again** (Food highlighted on /upgrade) — confirms finding 06.4 is systemic.
3. Free column uses muted text on dark — borderline-low contrast for the feature list (legible but faint).

### 11–12 Login / Onboarding — `screens/{light,dark}/11-login*, 12-onboarding*`

1. Auth shell renders centred with ambient treatment; no safe-area issues.
2. Onboarding step 1 captured; later steps not walked (timeboxed — sign-up flow creates a real emulator user; step 1 evidences the entry visuals).

---

## Ranked top-10 visual issues

1. **Food page redundancy — four simultaneous "add" entry points** (Quick Add / composer / scan / Log manually, + per-meal "+" below). One viewport, five shapes. The page's information architecture problem dwarfs any colour tweak. (`02-food-scrolled`)
2. ~~Status-bar collision on scroll~~ — **fixed (A)**: compositor-layer drop + z-tie; occluder now survives scroll on every page.
3. **RunDetail text collision at 393px** — "FREE RUN" × pace-legend overlap + Share pill crowding; plus the toast covering the back button. (`06-run-detail-top`)
4. **TreadmillMode overflows the viewport** — input + save button clipped off-right at 393px. (`05-run-treadmill-live-top`)
5. **Bottom-nav active-tab mismatch** — Food highlighted on `/run/:id` and `/upgrade`. Systemic route-matching bug, visible on every non-tab route. (`06-run-detail-top`, `10-upgrade-top`)
6. ~~**Undesigned text-only empty states on the highest-traffic surfaces** — Home Performance, History Performance, Social feed/suggestions. All are sentence-in-a-grey-box; none offer a designed next action beyond prose. Cold-start is a most-seen state for the user base.~~ — **fixed** (Wave3 F + Soc8): all three now use the hexagon `EmptyState` primitive (or the curated `SoloFirstFeed` stack on Social) with a clear next action — Home/History Performance → "Start a workout"; Social → solo-first stack + "Create a crew" / "Find people". Covered by `EmptyState.test.tsx`, `PerformanceHeroCard.test.tsx`, `SoloFirstFeed.test.tsx`. (`01-home-top`, `07-history-top`, `08-social-top`)
7. **Stale cold-start artifacts on rich accounts** — "Welcome to Tropos!" checklist still rendering for an account with months of data. (`01-home-top`)
8. **Hue overload on Home + Food** (6–7 distinct hues per viewport vs the documented 4-ish semantic system). Macro pink/yellow/green + sport coral/purple + nutrition orange all co-present; the semantic system is intact but the _density_ of simultaneous accents is the issue. (`01-home-scrolled`, `02-food-scrolled`)
9. ~~Webview desktop scrollbar~~ — **fixed (B)** (suppression CSS; rig cannot render the before state — see device screenshots).
10. **Streak-priming modal interrupts first Programme visit** — lands mid-task, stacks over the page the user explicitly navigated to. (`03-program-top`)

_(Bug C — amber selected-pill clash — fixed; would have ranked ~#8.)_

---

_Observations only beyond the three sanctioned Phase-2 fixes. No layout, colour-direction, or typography changes were made from this report's findings — design direction is being decided separately._
