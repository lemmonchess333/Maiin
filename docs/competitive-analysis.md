# Tropos — Competitive Analysis & Gap Backlog

**Date:** 2026-05-29 · **Method:** web research (2026 reviews, official feature pages, app-store listings, teardowns, Reddit/YouTube) synthesised by 5 parallel research agents, plus the existing run-domain audit in `CONTEXT.md`. **Honesty caveat:** this is research-synthesis, _not_ hands-on app usage — we could not install/drive the iOS apps. Treat specific numbers (pricing, accuracy %) as "as reported," re-verify before quoting externally.

**Scope:** Run/plans (Strava, Nike Run Club, Garmin Connect, TrainingPeaks, Runna) · Food (MyFitnessPal, Cronometer, MacroFactor, Lose It!) · Lifting (Hevy, Strong, Fitbod) · Weight (Renpho, Withings, Happy Scale) · Streaks/Social (Duolingo, Apple Activity, Strava-social).

---

## 1. Tropos — SWOT (the anchor)

Tropos is a pre-launch **hybrid** app doing run-tracking + periodised run plans + lifting programs + nutrition + weight-trend + social + gamification in one product. Almost no competitor spans more than two of those domains well.

**Strengths**

- **The hybrid thesis is real and underserved.** Strava=run/social, MacroFactor=food, Hevy=lift — each owns one lane. The runner-who-lifts / lifter-who-runs has to stitch 3 apps together. TrainingPeaks adding strength and Runna's _weak_ strength side both validate the intersection Tropos targets.
- **Adaptive nutrition is genuinely best-in-class.** Adaptive TDEE from weight trend + plateau detection + **day-type macro targeting (lift/run/rest)** is exactly MacroFactor's moat — the category gold standard — _plus_ a cross-domain twist (fuel by training load) no single-domain app can do. **(2026-06-02 correction: the _day-type macros_ part is real and shipped; _adaptive TDEE from weight trend_ is NOT built yet — TDEE is static Mifflin. Being built in #976. The SWOT "S" claims on lines below that cite an adaptive-TDEE engine are aspirational until then.)**
- **Adaptive training + graceful failure.** Auto-enter recovery (a Tropos innovation per `CONTEXT.md`) and the just-shipped **one-tap Realign / finish-safely** loop match or beat Garmin's adaptive coaching and Runna's "Not Feeling 100%" — and beat NRC/Strava's static plans outright.
- **Lifting intelligence foundation:** performance index (0-100), load bands, deload detection, muscle-group body diagram — Fitbod-class concepts already in the engine.
- **Multi-modal food capture** (camera AI/Gemini, NL, voice, barcode) matches Lose It!/MacroFactor.
- Calm, anti-anxiety design; offline queue; pre-launch agility (can build the right primitives before legacy debt).

**Weaknesses**

- **No network effects (cold-start social).** Strava (14B kudos/yr) and Hevy's free social graph are moats built on millions of users. Tropos's feed/crews launch _empty_ — the hardest moat to bootstrap.
- **No wearable app.** Every serious rival has wrist-native run tracking and/or standalone watch set-logging (Garmin, Apple, Hevy, Fitbod). PWA+Capacitor has no Apple Watch / Wear OS story — a major gap for runs especially.
- **Breadth-vs-depth risk.** Four domains means each can be shallower than the category specialist: in-session lifting logging vs Hevy, micronutrient depth vs Cronometer, segments/leaderboard culture vs Strava.
- **Table-stakes primitives** — **VERIFIED 2026-06-02: most are already shipped.** Present: streak _forgiveness_ (Streak1), previous-session set prefill (`WorkoutSession.tsx`), raw-vs-trend weight overlay + goal-date projection (`TrendWeight.tsx`). Genuinely missing: **plate calculator** (#985) and an optional **weekly streak cadence**. So this is a much smaller weakness than originally assumed.
- Small team → high maintenance cost for broad surface area (the `functions/` deploy gotchas and god-component history in `CLAUDE.md` show the strain).

**Opportunities**

- **Own the hybrid intersection** with cross-domain intelligence: a single adaptive system that fuels nutrition by training load and adjusts training by recovery — structurally impossible for single-lane apps.
- **Calm positioning** against Strava KOM toxicity, Duolingo guilt-notifications, and Apple ring burnout — a real, differentiated brand wedge.
- Pre-launch is the cheap moment to build **forgiveness, weekly cadence, and anti-cheat** in from day one (rivals are retrofitting).

**Threats**

- **Strava now owns Runna** — run + adaptive plans + the dominant social graph + IPO-scale monetisation muscle, bundled.
- **Apple Fitness/Health** — free, wrist-native, default, outcome-credible.
- The "**3 best-in-class free/cheap apps**" alternative: Garmin (free adaptive run coaching) + Hevy (free lift+social) + Cronometer (free, accurate food). A hybrid must beat the sum, not just match parts.
- Network-effect moats are very hard to cold-start; breadth is expensive to maintain.

---

## 2. Per-app SWOTs (condensed)

### Run & training plans

**Strava** — social network for endurance; freemium (~$80/yr; now bundles Runna at $149.99/yr).

- _S:_ dominant social graph, segment/KOM moat, broad device sync. _W:_ weak as a structured coach, "Athlete Intelligence" AI mocked, paywall-clawback resentment. _O:_ Runna integration adds the coaching it lacked. _T:_ IPO monetisation eroding goodwill.
- **Tropos lesson:** the kudos/segment loop drives retention; _don't_ claw back free value (the #1 Strava grievance).

**Nike Run Club** — free, brand-funded, beginner-friendly; ~300 celebrity **audio-guided runs**.

- _S:_ free, motivating audio coaching, brand reach. _W:_ GPS inaccuracy, **static non-adaptive plans**, stagnant roadmap. _O:_ cheap to add adaptation. _T:_ Runna/Garmin out-coach it.
- **Tropos lesson:** human-voice audio coaching is a proven motivator; NRC's static plans are exactly what Tropos's adaptive scheduler beats; **weekly** (not daily) streak cadence is the right call for running.

**Garmin Connect** — companion to the hardware; **Garmin Coach is free + adaptive**.

- _S:_ free adaptive coaching off completed workouts, deep biometrics (VO2max, recovery, Body Battery), wrist-native real-time guidance. _W:_ only 5K/10K/half (no marathon), plans plateau ~wk8, re-asks owned data. _O:_ AI coaching, strength. _T:_ app-only rivals personalise better.
- **Tropos lesson:** adaptive-off-completed-workouts is table stakes (validates Realign); **don't re-ask data you already own** — pre-fill aggressively; gate intensity on readiness.

**TrainingPeaks** — serious-endurance / coach-athlete standard; ~$135/yr + per-athlete coach fees.

- _S:_ the CTL/ATL/TSB load model (the lingua franca of coaching), device ecosystem, coach-plan marketplace, **strength + endurance on one calendar**. _W:_ dated UI, steep learning curve, data overload, no in-app messaging. _O:_ AI planning, UX modernisation. _T:_ free Intervals.icu, AI-native rivals.
- **Tropos lesson:** a coherent, _legible_ load model is what serious users trust (Tropos's PI) — but complexity is the liability; Tropos can surface the rigor without chart-overload. Hybrid-on-one-calendar is the validated thesis.

**Runna** — #1 personalised adaptive run plans (Strava-owned 2025); ~$120/yr.

- _S:_ best adaptive run plans, **life-aware adjustment** ("Not Feeling 100%", reschedule without penalty), pre-run audio briefings. _W:_ paces too aggressive, **weak auto-generated strength plans**, buggy/over-frequent pace notifications. _O:_ Strava distribution. _T:_ paywall-aggressive new parent.
- **Tropos lesson:** life-aware adaptation is the gold standard (informs Realign + gap handling); **pre-run "Workout Briefings"** are cheap and high-adherence; **Runna's weak strength side is Tropos's single biggest opening** — a genuinely good hybrid run+lift periodisation is a differentiator Runna does not deliver.

### Food logging

**MyFitnessPal** — incumbent mass-market counter; aggressive monetisation (~$80-100/yr).

- _S:_ largest database (20M+), ubiquity, ecosystem, recipe-URL importer. _W:_ **barcode behind paywall** (loudest grievance), dirty crowdsourced data, static non-adaptive targets, thin micros. _O:_ AI photo, adaptive targets. _T:_ MacroFactor/Cronometer/AI upstarts.
- **Tropos lesson:** never paywall core logging; recipe-URL import is genuinely loved; curated data beats raw crowdsourcing.

**MacroFactor** — science-first, **adaptive expenditure algorithm**; subscription-only (~$72/yr, single tier, barcode included).

- _S:_ the adaptive TDEE-from-data engine (category gold standard), **adherence-neutral** coaching (never shames a bad day), fastest verified logging (~50% fewer taps than MFP, "Describe" NL entry), 54 nutrients. _W:_ no free tier, "only as good as your data," learning curve. _O:_ photo AI. _T:_ rivals adding adaptive features.
- **Tropos lesson:** this is _Tropos's own moat_ — surface adaptive TDEE as a visible **coach**, frame it **adherence-neutrally**, and minimise taps relentlessly (recents/Describe/Quick-Add).

**Cronometer** — accuracy/micronutrient reference; generous free tier, Gold ~$40-50/yr.

- _S:_ **verified multi-source database**, 84 nutrients, strong free tier, **Oracle** (nutrient-gap food suggestions). _W:_ slower logging, dense utilitarian UI, smaller DB. _O:_ CGM/clinical. _T:_ casual users prefer faster apps.
- **Tropos lesson:** a verified-data layer earns trust; **nutrient-gap coaching maps onto Tropos's health-score/insights** ("low on X → log Y"); a useful free tier drives adoption.

**Lose It!** — approachable, gamified; free barcode, cheapest premium (~$40/yr); **Snap It** photo logging.

- _S:_ friendly gamified UX, free barcode, complete-dish photo recognition. _W:_ photo **portion** accuracy shaky (needs editing), static targets, shallow micros. _O:_ better portioning, adaptive targets. _T:_ AI-photo upstarts, MacroFactor.
- **Tropos lesson:** photo-AI is table-stakes but treat portions as an **editable estimate** (matches reality); **gamification demonstrably drives logging adherence** — validates Tropos's streaks/badges/challenges; keep barcode free.

### Lifting

**Hevy** — the default free, social strength logger; Pro ~$24/yr (cheapest).

- _S:_ **free social graph** (follow, see real logged workouts, kudos, leaderboards), fastest clean logging, cross-platform watch. _W:_ not a coach (no auto-programming/recovery model), Apple-Watch rough edges. _O:_ AI coaching. _T:_ AI-native apps.
- **Tropos lesson:** lifting workouts should be **first-class feed citizens**; the **set-complete → auto-rest-timer** flow is the gold standard; reusable routine templates editable mid-session.

**Strong** — veteran "think less, lift more" logger; Pro ~$30/yr.

- _S:_ rock-solid reliability, **previous-session weight/rep prefill** (biggest speed win), mature **plate calculator**, correct superset/dropset rest logic. _W:_ dated UI, no AI/auto-generation, minimal social, 3-routine free cap. _O:_ modernise. _T:_ Hevy + Fitbod squeezing both ends.
- **Tropos lesson:** **previous-session prefill + plate calculator + correct rest-timer behaviour are table-stakes** for a credible lifting side — adopt all three.

**Fitbod** — AI auto-coaching; subscription-only (~$96/yr, priciest).

- _S:_ per-muscle **recovery/fatigue heat-map** (0-100% per group), auto-generated recovery-aware sessions, **auto-regulated progressive overload** (suggests next load from history + est 1RM). _W:_ expensive, output can feel repetitive, weak for advanced lifters, no social. _O:_ deeper personalisation. _T:_ cheaper logger+AI hybrids.
- **Tropos lesson:** the per-muscle recovery model maps directly onto Tropos's PI/deload engine + body diagram — **visualise recovery state**; **auto-regulated next-load suggestion** is the intelligence Hevy/Strong lack and Tropos can own.

### Weight tracking

**Renpho** — hardware-first ($12-45 scales), free app, ~13 BIA metrics.

- _S:_ price, metric breadth, multi-user auto-recognition, ecosystem sync. _W:_ BIA accuracy on cheap models (≈30% vs 21% lab), sync failures, **data-loss-on-update**, ad clutter (~67% negative sentiment). _O:_ trend smoothing. _T:_ Withings, first-party.
- **Tropos lesson:** don't present noisy BIA-style numbers as truth (Tropos's smoothed trend is the corrective); bulletproof data persistence is table stakes.

**Withings** — premium hardware + Withings+ (~$10/mo); near-clinical health hub.

- _S:_ class-leading accuracy, trust/design, **multi-year trends**, health-hub aggregation, "**hide the number**" anti-obsession mode. _W:_ paywall-the-graphs backlash, price, occasional data-loss bugs. _O:_ coaching subscription. _T:_ Apple Health.
- **Tropos lesson:** auto-smoothing daily noise is the right default, but **let users see their data** (don't paywall basic charts); multi-year longevity builds trust; the **hide-the-number** mode is a thoughtful anti-anxiety pattern.

**Happy Scale** — pure software (iOS-only), the canonical "tame the noisy scale" app.

- _S:_ **4 smoothing methods** (incl. proprietary trend-slope estimator), **raw-dots-vs-trend-line overlay**, **self-correcting goal-date projection** (updates every weigh-in from trend slope, not last reading), milestone framing through plateaus. _W:_ iOS-only, single-purpose, paywall. _O:_ expand projections. _T:_ smoothing now built into rivals.
- **Tropos lesson:** **this is the exact UX Tropos's weight-trend should ship** — show noise _not_ moving the trend; add a self-correcting goal-date projection; pair milestone framing with plateau detection so a stall reads as "expected," not failure.

### Streaks / Gamification / Social

**Duolingo** — gold standard of streak gamification.

- _S:_ best-in-class retention; **streak freeze/repair** safety net (cuts at-risk churn ~21%); weekly **leagues with promotion/relegation**; XP-before-screen-close dopamine timing. _W:_ "Duo anxiety" — guilt notifications can erode intrinsic motivation; hearts feel punitive. _O:_ ethical "time well spent" framing. _T:_ notification backlash.
- **Tropos lesson:** ship **streak freeze/repair before launch** (cold-start + rest days demand forgiveness); borrow **weekly leagues** for crews; keep reminders _encouraging_, never guilt-laden (Tropos's calm brand can't carry Duo's passive-aggression).

**Apple Activity Rings** — ambient single-loop goal closure.

- _S:_ glanceable one-loop goal, **personalised monthly-challenge targets calibrated to your trailing average**, outcome-backed credibility, limited-edition collectible badges. _W:_ no rest-day intelligence (punishes recovery), streak pressure, hardware-locked. _O:_ recovery-aware goals. _T:_ burnout backlash.
- **Tropos lesson:** **personalise challenge/badge targets to a user's trailing average** (fits the adaptive engine; avoids locking out light-trainers); keep one **glanceable** hero score on Home; use seasonal limited-edition badges sparingly for FOMO without grind.

**Strava (social mechanics)** — the fitness-social flywheel.

- _S:_ network effects, **kudos reciprocity loop**, segments-as-leaderboards, clubs with sub-feeds + challenges. _W:_ **leaderboard cheating** (removed 2.3M e-bike rides via ML), uneven moderation, KOM toxicity, GPS-privacy concerns. _O:_ better fraud ML. _T:_ feed fatigue.
- **Tropos lesson:** build the **kudos reciprocity loop** (one-tap kudos + "X gave you kudos" return-driver, weight PRs & crew activities for extra reward); give **crews their own sub-feed + challenges**; **plan leaderboard anti-cheat early** (sanity-check pace/distance) or the social layer rots; offer **friends-only leaderboard filtering** (NRC) to keep crews encouraging.

---

## 3. Cross-cutting patterns (3+ apps converge → the convention)

- **Adaptive beats static** everywhere: plans (Garmin/Runna), calorie targets (MacroFactor), challenge targets (Apple). Tropos is already adaptive across run/food — extend to lifting loads + challenge targets.
- **Keep core logging free; paywall depth.** MFP's barcode-paywall and Withings'/Strava's graph-clawback are the loudest grievances in the whole field.
- **Minimise logging friction** — the daily-logging tap-count is the retention battleground (MacroFactor's ~50%-fewer-taps, Strong's prefill, Lose It!'s photo).
- **Forgiveness & rest-day awareness** — Duolingo freeze/repair, NRC's _weekly_ streaks; daily streaks punish the recovery that good training requires (directly relevant to Tropos's hybrid + design-for-the-user-base mandate).
- **Trend over noise** — Happy Scale/Withings smoothing is the expected default for weight.
- **Social reward steers behaviour** — kudos/feed loops (Strava/Hevy) are the deepest moats and the hardest to cold-start.

---

## 4. Prioritised gap / implementation backlog (the actionable part)

Ranked by **impact × effort**. "Verify" = confirm whether Tropos already has it before building. Module names reference the actual codebase.

> **STATUS 2026-06-02 — backlog reconciled against the codebase** (grill + verification session; issues #961–#986 filed). Several Tier-1 items below were found **already shipped**, and item 4's "adaptive TDEE is already a moat" was found **false** — TDEE is static Mifflin-St Jeor; the adaptive-from-data engine does **not** exist and is being built in #976 / #979–983. Per-item `STATUS` notes are inline. The genuinely high-ROI _net-new_ work is **server-side push (#961)** and the **adaptive TDEE engine (#976)**; most other Tier-1 items are done or small polish.

### Tier 1 — high impact, low/med effort (pre-launch candidates)

1. **Streak forgiveness + hybrid-aware cadence** — add streak **freeze/repair** and a **weekly-consistency** streak option (not pure daily) so rest days / light-trainers / illness gaps don't churn users. _Why:_ Duolingo's biggest retention lever + NRC's weekly cadence + Tropos's own design-for-the-user-base rule. _Where:_ `features/streaks/useStreaks.ts`, `badges.ts`. _Effort:_ low-med.
   - **STATUS 2026-06-02 — mostly SHIPPED.** The **grace/forgiveness model is implemented** (Streak1 — `useStreaks.tsx:154`, bridges ≤1 forgiven day per rolling 7; rest/illness gaps don't break the streak). Open: an explicit user-facing "freeze token" affordance + a weekly-consistency cadence option, if wanted — not built. The core retention lever is done.
2. **Weight: trend-vs-noise overlay + self-correcting goal-date projection + milestone framing** — render raw daily dots against the smoothed trend line (show a water spike _not_ moving the trend), and project "goal by [date]" that recomputes each weigh-in from trend slope; tie milestone celebration to existing plateau detection so a stall reads "expected." _Why:_ Happy Scale's entire moat; strengthens Tropos's adaptive-TDEE story. _Where:_ `useBodyweightTrend`, `utils/weight trend`, progress charts. _Effort:_ low-med.
   - **STATUS 2026-06-02 — SHIPPED (Hist5d arc).** `TrendWeight.tsx` already renders raw `actual` dots + EMA-smoothed `trend` line (`calculateEMA`), a goal `ReferenceLine`, and a **slope-based goal-date projection** that honestly suppresses itself when the trend is flat or moving away from goal (`:146`). Only open piece is the "hide the number" mode → **#984**.
3. **Lifting in-session logging primitives (verify, then close)** — previous-session weight/rep **prefill**, **plate calculator**, and correct **rest-timer** across supersets/dropsets. _Why:_ table stakes vs Hevy/Strong; without them the lifting side feels toy. _Where:_ program/workout logging UI. _Effort:_ med.
   - **STATUS 2026-06-02 — mostly SHIPPED.** `WorkoutSession.tsx:204` already does previous-session **prefill**, **per-set logging**, **PR tracking**, and the **rest timer** (`RestTimerRing`). Only the **plate calculator** is genuinely missing → **#985**. (Superset/dropset rest nuance is a smaller follow-up.)
4. **Surface adaptive TDEE as a visible "coach" + adherence-neutral framing + faster food entry** — make the adaptive expenditure number legible (a trend, a "your targets updated" coach message), never shame a high day, and add recents/favourites/meal-copy + a prominent NL "describe a meal" quick-add. _Why:_ it's already Tropos's MacroFactor-class moat — present it like one. _Where:_ nutrition UI, `adaptiveTDEE.ts`, `nlFoodParser.ts`, `nutritionInsights.ts`. _Effort:_ low-med (mostly surfacing what exists).
   - **STATUS 2026-06-02 — CORRECTION: the premise is FALSE.** There is **no adaptive TDEE** — `tdee.ts` is static Mifflin-St Jeor, computed once; `adaptiveTDEE.ts` does **not** exist; `calorieBalance` compares intake to the _static_ target (no weight-trend recalibration). The `adaptive_tdee`/`adaptive_macros` paywall keys advertised a feature that isn't built. The real engine (regression on EWMA trend + warmup + expenditure-inclusive model) is being **built** in **#976 / #979–983**, where it becomes a legitimate Pro anchor. The **food-entry half IS shipped** (frequency-ranked recents, time-relevant favourites, copy-yesterday, NL quick-add) — only a long-tail "log again" remains → **#986**.
5. **Guardrail: keep core logging free.** Audit the Pro paywall so barcode/basic food/basic charts stay free; paywall depth (rollover, AI text analysis, advanced analytics). _Why:_ the field's #1 trust-killer. _Effort:_ low (policy).
   - **STATUS 2026-06-02 — paywall reconciliation filed → #977/#978.** Audit found the paywall advertised **three unenforced keys** (`ai_coaching`, `adaptive_tdee`, `adaptive_macros`); #977 strips them, #978 makes the gate contextual. Core logging stays free; the honest paid layer is AI food analysis (now) + adaptive TDEE (once #976 ships).

### Tier 2 — high impact, med/high effort

6. **Auto-regulated progressive overload + visual muscle-recovery** — suggest next-session load from logged history + estimated 1RM, and show per-muscle recovery state on the body diagram. _Why:_ Fitbod's moat; Hevy/Strong lack it; Tropos's PI/deload engine + body-highlighter are already most of the way there. _Where:_ `performanceEngine.ts`, `features/program/programEngine.ts`. _Effort:_ med-high.
7. **Social loop hardening** — one-tap kudos + "X gave you kudos" return notification; **crew sub-feeds + crew-scoped challenges**; **friends-only leaderboard filter**; make **lift workouts first-class** in the feed (Hevy). _Why:_ the kudos reciprocity loop is the deepest retention moat. _Where:_ `socialApi.ts`, `useSocialFeed`, `useCrews`, social components. _Effort:_ med.
8. **Leaderboard / challenge anti-cheat** — plausibility sanity-checks on pace/distance/volume before challenges & leaderboards scale. _Why:_ Strava removed millions of fake rides; integrity rot kills social trust. _Where:_ `socialApi.ts`, challenge progress (functions `syncChallengeProgress`). _Effort:_ med.
9. **Pre-run "Workout Briefing" + warmer audio coaching** — a short pre-session brief ("today: 5×1k, here's why") and warmer guided-run voice. _Why:_ Runna/NRC adherence win, cheap. _Where:_ `guidedRun.ts`, `useGuidedRun`, `useAudioCues`. _Effort:_ low-med.
10. **Nutrient-gap coaching + verified-data layer** — "you're low on X this week → log Y" tied to the health score; lean on a verified food-data source for trust. _Why:_ Cronometer's Oracle; maps onto existing insights. _Where:_ `healthScore.ts`, `nutritionInsights.ts`, food data source. _Effort:_ med.

### Tier 3 — strategic / high effort / later

11. **Wearable app (Apple Watch / Wear OS)** — standalone run tracking + set logging. _Why:_ the single biggest structural gap vs every serious rival; but high effort (Capacitor doesn't give this for free). _Effort:_ high. _Flag as a strategic decision, not a quick win._
12. **Recipe-URL import + meal builder** (MFP's loved feature). _Effort:_ med.
13. **Personalised challenge targets calibrated to trailing average** (Apple) — leverage the adaptive engine so challenges don't lock out light-trainers. _Effort:_ med.
14. **"Hide the number" anti-anxiety weight mode** (Withings) — fits Tropos's calm brand. _Effort:_ low. — **STATUS 2026-06-02: filed → #984** (the overlay + projection it sits alongside are already shipped — see item 2).
15. **Cross-domain intelligence as the wedge** — lean explicitly into "fuel by training load / train by recovery" (day-type macros × training load) in product + marketing. _Why:_ the one thing no single-lane app can copy. _Effort:_ mostly positioning + small features.

---

## 5. What Tropos already does well — don't rebuild, _defend_

- **Day-type macros + plateau-aware programming + cross-domain hybrid** — genuinely differentiated; defend + headline. **(2026-06-02 correction: "adaptive TDEE" is NOT yet a Tropos strength — TDEE is static Mifflin; the adaptive-from-data engine is being built in #976. It becomes a defensible moat once shipped, not before. Don't market it as live until then.)**
- **Auto-recovery + one-tap Realign / finish-safely** — already ahead of NRC/Strava (static) and competitive with Garmin/Runna.
- **GPS quality (Kalman filter)** — protect it; GPS inaccuracy is NRC's top complaint.
- **Hybrid-in-one-app** — the structural advantage; the whole strategy is to make the intersection better than 3 stitched apps.
- **Calm design** — a real differentiator against KOM toxicity / guilt notifications / ring burnout.

---

## 6. Sources

Run/plans: strava.com/pricing · support.strava.com · nike.com/nrc-app · garmin.com/garmin-coach · shoulditrain.com/blog/garmin-coach-review · coachbox.app (TrainingPeaks) · dcrainmaker.com · runna.com/pricing · support.runna.com · runwithrachel.co.uk · runningwestwardho.co.uk · mostly.media.
Food: fitbudd.com · nutriscan.app · macrofactorapp.com (algorithm-accuracy, expenditure-modifiers) · best-nutrition-apps.com · calorie-trackers.com · cronometer.com/gold · feastgood.com · snapcalorie.com · amyfoodjournal.com.
Lifting: hevy.com/pricing · hevyapp.com/features · repreturn.com · prpath.app · smartrabbitfitness.com · fitbod.me/blog (algorithm, muscle-recovery) · help.fitbod.me · arvo.guru.
Weight: happyscale.com · iphonejd.com · livescience.com (Renpho, Withings) · medgrade.org · tomsguide.com · cybernews.com · techradar.com · support.withings.com · justuseapp.com.
Streaks/Social: deconstructoroffun.com · trophy.so (Duolingo/Strava/NRC case studies) · orizon.co · webdesignerdepot.com · apple.com/newsroom · wareable.com · macrumors.com · strivecloud.io · latterly.org · bikerumor.com · nike.com/help.

_Full per-app mechanics, pricing detail, and the complete source list per app live in the session research transcripts (5 agents, 2026-05-29)._
