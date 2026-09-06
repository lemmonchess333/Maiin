import { useEffect, useRef, useState } from "react";
import { readString, writeString } from "@/lib/localStore";
import {
  useCalorieRingMode,
  setCalorieRingMode,
} from "@/hooks/useCalorieRingMode";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Beef,
  Wheat,
  Settings as SettingsIcon,
  ChevronRight,
  Share2,
} from "lucide-react";
import { Avocado } from "@/components/icons/Avocado";
import { THEME } from "@/lib/theme";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import { useAuth, useUidForStorageKey } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import {
  allMacrosHit,
  didJustCompleteAll,
  todayIsoDate,
} from "@/lib/foodCelebration";
import ShareCardSheet from "@/components/share/ShareCardSheet";
import { buildGlanceLine } from "@/lib/foodDailySummary";
import { mealPhotoImage } from "@/lib/editorialImages";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";
import CalorieRing from "./CalorieRing";
import MacroColumn from "./MacroColumn";
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";
import AdaptiveWarmupBar from "./AdaptiveWarmupBar";

interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface FoodHeroCardProps {
  selectedDate: string; // ISO date "YYYY-MM-DD"
  isToday: boolean;
  /** From useEffectiveTargets() — includes effective finalTarget and caption */
  dailyTargets: EffectiveTargets;
  dailyTotals: DailyTotals;
  /** Food6 a2: opens the detailed nutrition-breakdown sheet. Optional
   *  so legacy call sites without drill-down behaviour still render
   *  the hero correctly — the affordance is omitted when no handler
   *  is supplied. */
  onTapDrillDown?: () => void;
}

/* The ring MODE stays flat on purpose: "left vs eaten" is a display
   preference of this DEVICE, not a fact about an account. The celebrated
   DATE is the opposite — it records that a particular user hit their targets
   today, so an unscoped key let one account's celebration swallow the
   other's on a shared phone. */
const CELEBRATED_KEY_BASE = "tropos.food.celebratedDate";

// All log-moment animations share this duration so they finish in sync.
const LOG_MOMENT_MS = 600;
const LOG_MOMENT_SEC = LOG_MOMENT_MS / 1000;

export default function FoodHeroCard({
  isToday,
  dailyTargets,
  dailyTotals,
  onTapDrillDown,
}: FoodHeroCardProps) {
  /* Targets-set detection. When a user hasn't customised
     `profile.targetCalories`, useDailyTargets falls back to a
     2200 cal default (and 160/250/60 macro defaults), which the
     glance-line helper can't tell apart from a real personal
     target. Reading `profile?.targetCalories` directly here is
     the smallest-surface-area way to surface the distinction
     without changing the useEffectiveTargets contract — a single
     call site needs the signal today, so the leak is contained
     to one line. If a second consumer ever needs it, promote to
     the hook. */
  const { profile } = useAuth();
  const celebratedKey = `${useUidForStorageKey()}:${CELEBRATED_KEY_BASE}`;
  const targetsAreDefault = !profile?.targetCalories;

  // Single shared display mode for the whole hero — the calorie ring AND
  // all three macro tiles read the same left⇄eaten framing. Persisted under
  // the calorie-ring key so the choice survives reloads. Synchronous init
  // prevents a first-paint flash of the wrong mode.
  //
  // Was previously split: the ring owned `mode` while each macro tile carried
  // its own independent state (the #848 per-tile pattern). That let the ring
  // read "2,583 kcal LEFT" while all three tiles read "Xg eaten" — two
  // opposite framings on one card. Unifying to one mode makes the hero speak
  // with a single voice; tapping the ring OR any tile flips all four at once.
  const mode = useCalorieRingMode();

  // Celebration state — driven by a log that completes all three macros today
  const [celebrating, setCelebrating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // S2 item 3: the share affordance appears ONLY on a goal-hit day (all
  // macros met) and only for today — a single, low-key entry point, not a
  // campaign. allMacrosHit is the steady predicate (consumed ≥ target),
  // so the entry persists for the day rather than flashing during the
  // brief celebration animation window.
  const goalHit =
    isToday &&
    allMacrosHit(dailyTotals, {
      protein: dailyTargets.protein,
      carbs: dailyTargets.carbs,
      fat: dailyTargets.fat,
    });
  const [showCelebrationCaption, setShowCelebrationCaption] = useState(false);

  // Previous macro totals for transition detection
  const prevTotalsRef = useRef(dailyTotals);
  const firstMountRef = useRef(true);

  const toggleMode = () => {
    haptic("light");
    // The store owns persistence AND notifies the drill-down sheet, which
    // renders from Food.tsx and used to be unable to see this at all.
    setCalorieRingMode(mode === "left" ? "eaten" : "left");
  };

  // Log-moment haptic fires on completion of the main ring animation.
  // We fire it via a setTimeout aligned with LOG_MOMENT_MS because the ring
  // animation is driven by Framer Motion inside the child component.
  useEffect(() => {
    if (firstMountRef.current) {
      // Skip haptic on first mount / day switch
      firstMountRef.current = false;
      prevTotalsRef.current = dailyTotals;
      return;
    }

    const prev = prevTotalsRef.current;
    const changed =
      prev.calories !== dailyTotals.calories ||
      prev.protein !== dailyTotals.protein ||
      prev.carbs !== dailyTotals.carbs ||
      prev.fat !== dailyTotals.fat;

    if (!changed) return;

    const targets = {
      protein: dailyTargets.protein,
      carbs: dailyTargets.carbs,
      fat: dailyTargets.fat,
    };

    // Check for celebration trigger BEFORE updating prevRef
    let shouldCelebrate = false;
    if (isToday) {
      const celebrated = readString(celebratedKey);
      const todayKey = todayIsoDate();
      if (
        celebrated !== todayKey &&
        didJustCompleteAll(prev, dailyTotals, targets)
      ) {
        shouldCelebrate = true;
        writeString(celebratedKey, todayKey);
      }
    }

    prevTotalsRef.current = dailyTotals;

    // Log-moment haptic at the 600ms mark (ring animation completion)
    const logHapticTimer = setTimeout(() => {
      haptic("light");
    }, LOG_MOMENT_MS);

    // Celebration sequence — state updates are deferred via setTimeout(0) so
    // they don't cascade synchronously inside the effect body.
    let celebrationStartTimer: ReturnType<typeof setTimeout> | undefined;
    let celebrationHapticTimer: ReturnType<typeof setTimeout> | undefined;
    let celebrationGlowTimer: ReturnType<typeof setTimeout> | undefined;
    let celebrationCaptionTimer: ReturnType<typeof setTimeout> | undefined;
    if (shouldCelebrate) {
      celebrationStartTimer = setTimeout(() => {
        setCelebrating(true);
        setShowCelebrationCaption(true);
      }, 0);
      celebrationHapticTimer = setTimeout(
        () => haptic("light"),
        LOG_MOMENT_MS + 100
      );
      celebrationGlowTimer = setTimeout(() => setCelebrating(false), 800);
      celebrationCaptionTimer = setTimeout(
        () => setShowCelebrationCaption(false),
        2200
      );
    }

    return () => {
      clearTimeout(logHapticTimer);
      if (celebrationStartTimer) clearTimeout(celebrationStartTimer);
      if (celebrationHapticTimer) clearTimeout(celebrationHapticTimer);
      if (celebrationGlowTimer) clearTimeout(celebrationGlowTimer);
      if (celebrationCaptionTimer) clearTimeout(celebrationCaptionTimer);
    };
  }, [
    dailyTotals,
    dailyTargets.protein,
    dailyTargets.carbs,
    dailyTargets.fat,
    isToday,
    celebratedKey,
  ]);

  // Build the top-left caption. Suppressed on rest days.
  // Nutr1 (expenditure-inclusive): the caption is just the day-type label —
  // there's no calorie bonus to surface, so the old "+X cal" adjustment, its
  // first-time fuel explainer, and the training-burn toast were all removed.
  const caption = dailyTargets.caption;

  const celebrationCaptionText = `GOAL HIT ✓`;

  // Trajectory line — suppressed; can be reinstated by importing
  // computeTrajectory from "@/lib/foodTrajectory" and passing its result.
  const trajectoryLabel = null;

  /* Today-at-a-glance line. Pure copy derived from totals +
     targets; helper handles priority rules, on-track guard,
     tiny-deficit suppression, and the missing-target prompt.
     Renders inside the calorie card below the ring so it
     summarises what the ring + macro tiles already show
     without claiming a separate card surface. Skipped on
     non-today views — past/future dates are diary-mode and
     a "Still need 40g protein" line for yesterday's record
     reads wrong. */
  const glanceLine = isToday
    ? buildGlanceLine(dailyTotals, dailyTargets, { targetsAreDefault })
    : null;

  /* Ambient time-of-day food photo behind the calorie hero (breakfast /
     lunch / dinner, same windows as meal slots). Today only — a past day
     keeps the clean look. Null (→ purple halo) until the operator drops
     the licensed asset.

     BOTH themes, but they need OPPOSITE treatments of the same file. The
     shipped asset is graded dark so light text reads on it (see the
     editorial README); light mode brightens it back up via a filter and
     lays a WHITE scrim, because there the card's text is DARK and needs a
     light backdrop. Using a filter rather than a second asset keeps this
     to one file per meal — a light-graded twin would double the bytes for
     the same pixels.

     Consequence worth knowing: light mode's photo is inherently PALER
     than dark mode's. That's structural — dark text forces the image to
     sit back — not a fixable property of the photo. */
  const isDark = useIsDarkMode();
  const mealPhoto = isToday ? mealPhotoImage(new Date().getHours()) : null;

  /* Over a LIGHT-mode photo the card's muted greys stop working: they're
     tuned to sit quietly on flat white, and against even a pale wash they
     drop below readable. Promote them to full foreground for that case
     only — dark mode's light-on-scrim text is already fine, and with no
     photo the muted greys are exactly right. Measured 11-18:1 after. */
  const photoTextClass = mealPhoto && !isDark ? "text-foreground" : null;

  // Dark-aware surface via `bg-card` + `var(--ds-shadow-card)` — the token
  // swaps to a deeper shadow under `.dark` (see tokens.css), so the same
  // markup renders correctly in both themes.
  return (
    <>
      {/* ── CALORIE CARD — caption, ring, glance line ──────────────────── */}
      <div className="relative overflow-hidden p-5 rounded-2xl bg-card card-shadow">
        {mealPhoto ? (
          /* Ambient food-photo hero. Reuses the Social/Spaces
             editorial-photo + scrim recipe: the photo fills the card
             behind a scrim so the ring, number and captions stay legible.
             Replaces the purple halo when present. Decorative +
             aria-hidden. */
          <>
            <img
              src={mealPhoto}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full object-cover select-none"
              /* Light mode brightens the dark-graded asset back up so it
                 reads as an airy wash under DARK text; dark mode uses it
                 as-graded. Static filter — never animated (the
                 WKWebView rule is about animating filter values). */
              style={isDark ? undefined : { filter: "brightness(1.35)" }}
              draggable={false}
            />
            {/* Scrim via the --food-photo-scrim CSS vars, which flip with
                the theme: a radial wash centred on the ring/number keeps
                the value legible whatever the photo, over a vertical one
                for the caption + glance line. DARK mode = black scrim (a
                moody hero under light text); LIGHT mode = white scrim (an
                airy wash under dark text). */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle 92px at 50% 47.5%, var(--food-photo-ring-bed) 0%, var(--food-photo-ring-bed) 55%, var(--food-photo-ring-bed-soft) 78%, transparent 100%), radial-gradient(circle at 50% 47.5%, var(--food-photo-scrim) 0%, var(--food-photo-scrim-soft) 46%, var(--food-photo-scrim) 100%), linear-gradient(to bottom, var(--food-photo-scrim) 0%, var(--food-photo-scrim-soft) 48%, var(--food-photo-scrim) 100%)",
              }}
            />
          </>
        ) : (
          /* Brand-hue ambient halo behind the calorie ring — the cross-screen
             cohesion twin of the Performance hero's band-state halo. The ring
             is a fixed brand-purple identity (CalorieRing COLOR_RING), so the
             halo is brand purple, centered behind the ring. Decorative-free:
             functional state/identity wash, low alpha, fades to transparent. */
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-6 size-64 -translate-x-1/2 rounded-full"
            style={{
              background: `radial-gradient(circle, ${THEME.brand}33, transparent 70%)`,
            }}
          />
        )}
        {/* Content sits above the absolute halo (positioned siblings paint
            in DOM order; a non-positioned block would render beneath it). */}
        <div className="relative">
          {/* Top row: caption (left) + adjust-targets gear (right).
            The gear deep-links straight to the focused Nutrition editor
            (/settings/nutrition — goal weight, calorie targets, macros,
            activity), so users fix a wrong target in one tap instead of
            landing on the generic Settings list and hunting for it. This
            mirrors the Train tabs' "Edit run/lift plan" pattern: each
            tab's day-to-day surface routes to its OWN plan editor.
            (Historically this pointed at /settings because the nutrition
            sub-route didn't exist; it does now.) Subtle muted-foreground
            colour so it doesn't compete with the ring for attention. */}
          <div className="mb-4 min-h-[20px] flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <AnimatePresence mode="wait">
                {showCelebrationCaption ? (
                  <motion.p
                    key="celebration"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3 }}
                    className="text-micro uppercase tracking-wider font-semibold"
                    style={{
                      /* Photo hero: bright identity over the dark scrim
                         (the photo, not the theme, is the surface). Plain
                         card: the theme-aware -strong step — the identity
                         is 2.36:1 as 12px text on the light card (DS2). */
                      color: photoTextClass
                        ? THEME.success
                        : "hsl(var(--success-strong))",
                    }}
                  >
                    {celebrationCaptionText}
                  </motion.p>
                ) : caption ? (
                  <motion.p
                    key="caption"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3 }}
                    className={`text-xs font-medium truncate ${photoTextClass ?? "text-muted-foreground"}`}
                  >
                    {/* Wave3 G — the day annotation is merged INTO the hero
                      caption as one line ("{dayType} · {rationale}") instead
                      of a second, container-less line orphaned below the
                      macro tiles. Rationale is today-only (matching the old
                      annotation gating); truncates to one line at 393px. */}
                    {caption.trainingType}
                    {isToday && dailyTargets.annotation
                      ? ` · ${dailyTargets.annotation}`
                      : ""}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
            <div className="shrink-0 flex items-center">
              {goalHit && (
                <button
                  type="button"
                  aria-label="Share your day"
                  onClick={() => {
                    haptic("light");
                    setShareOpen(true);
                  }}
                  className="-mt-2 size-11 flex items-center justify-center rounded-lg text-nutrition hover:bg-muted/60 active:scale-95 transition-all"
                >
                  <Share2 className="size-4" aria-hidden="true" />
                </button>
              )}
              <Link
                to="/settings/nutrition"
                aria-label="Adjust nutrition targets"
                onClick={() => haptic("light")}
                className="-mt-2 -mr-2 size-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
              >
                <SettingsIcon className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Calorie ring */}
          <CalorieRing
            consumed={dailyTotals.calories}
            target={dailyTargets.finalTarget}
            mode={mode}
            onToggleMode={toggleMode}
            trajectoryLabel={trajectoryLabel}
            glowing={celebrating}
            ringDurationMs={LOG_MOMENT_MS}
          />

          {/* Nutr2 / #981 — adaptive warmup bar, today-only, ambient under the
            ring. Reads from the single source of truth (useEffectiveTargets).
            Hidden once the gate clears (learned takeover, #982). */}
          {isToday && dailyTargets.showWarmup && (
            <AdaptiveWarmupBar
              fraction={dailyTargets.warmupFraction}
              stalled={dailyTargets.adaptiveStalled}
            />
          )}

          {/* Today-at-a-glance line. One sentence, protein-priority,
            neutral over-target language. Sits inside the calorie
            card below the ring so it summarises what the ring +
            macro tiles already show without claiming a separate
            card surface. Helper handles the priority rules,
            on-track guard, tiny-deficit suppression, and the
            missing-target prompt copy; component just routes
            inputs and renders the result. Skips on past/future
            dates (diary-mode views). */}
          {glanceLine && (
            <p
              className={`text-center text-xs font-medium mt-3 px-2 ${photoTextClass ?? "text-muted-foreground"}`}
            >
              {glanceLine}
            </p>
          )}
          {/* A target below the essential-fat floor's own cost: the macro
              tiles below would otherwise present "0g" as the goal. Same
              sentence as Settings and Home (macroInfeasibility.ts). */}
          {dailyTargets.targetInfeasible && (
            <p
              role="status"
              className="text-center text-xs font-medium mt-3 px-2"
              style={{ color: "hsl(var(--warning-strong))" }}
            >
              {macroInfeasibilityMessage(dailyTargets.minFeasibleKcal)}
            </p>
          )}
          {/* Food6 a2: drill-down affordance. "Details" + chevron at the
            bottom of the calorie card opens the breakdown sheet — the same
            label register as the Home and Analytics disclosures (sentence
            case, text-xs, muted), not the uppercase section-label one.
            Distinct tap target so it doesn't conflict with the CalorieRing
            mode-toggle, the Settings link, or any nested buttons. */}
          {onTapDrillDown && (
            <div className="flex justify-center mt-3">
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  onTapDrillDown();
                }}
                aria-label="View nutrition breakdown"
                className={`flex items-center gap-1 px-2.5 min-h-[44px] -my-2 rounded-full text-xs hover:bg-muted/60 active:scale-95 transition-all ${photoTextClass ?? "text-muted-foreground"}`}
              >
                <span>Details</span>
                <ChevronRight aria-hidden="true" className="size-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Macro tile row — three floating tiles. Each reads the SAME shared
          `mode` as the calorie ring, and tapping any tile flips that one
          shared mode (via toggleMode) so the ring + all three tiles stay in
          lockstep. mt-4 = 16px gap to the calorie card above.

          An explicit 3-column GRID rather than flex-1 children: flex-1
          sizes from content, so the widest macro number could take space
          from its neighbours and the three tiles stopped being the same
          width exactly when the numbers got long. grid-cols-3 makes the
          columns equal by construction, and `min-w-0` on each cell lets a
          long number shrink inside its own tile instead of pushing the
          row wider. gap-2 matches the compact-grid rule in the design
          system and the sibling PeriodOverview grid. */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="min-w-0 flex p-3 rounded-2xl bg-card card-shadow">
          <MacroColumn
            macroKey="protein"
            Icon={Beef}
            consumed={dailyTotals.protein}
            target={dailyTargets.targetInfeasible ? 0 : dailyTargets.protein}
            label="PROTEIN"
            color={THEME.macros.protein}
            mode={mode}
            onTap={toggleMode}
            numberDurationSec={LOG_MOMENT_SEC}
            barDurationSec={LOG_MOMENT_SEC}
          />
        </div>
        <div className="min-w-0 flex p-3 rounded-2xl bg-card card-shadow">
          <MacroColumn
            macroKey="carbs"
            Icon={Wheat}
            consumed={dailyTotals.carbs}
            target={dailyTargets.targetInfeasible ? 0 : dailyTargets.carbs}
            label="CARBS"
            color={THEME.macros.carbs}
            mode={mode}
            onTap={toggleMode}
            numberDurationSec={LOG_MOMENT_SEC}
            barDurationSec={LOG_MOMENT_SEC}
          />
        </div>
        <div className="min-w-0 flex p-3 rounded-2xl bg-card card-shadow">
          <MacroColumn
            macroKey="fat"
            Icon={Avocado}
            consumed={dailyTotals.fat}
            target={dailyTargets.fat}
            label="FAT"
            color={THEME.macros.fat}
            mode={mode}
            onTap={toggleMode}
            numberDurationSec={LOG_MOMENT_SEC}
            barDurationSec={LOG_MOMENT_SEC}
          />
        </div>
      </div>

      {/* Wave3 G — the training-aware day annotation (the free→premium
          conversion hook: "Hard training day" / "Race week — carb load")
          moved INTO the hero caption above as one merged line. It no longer
          renders here as a separate, container-less line below the macro
          tiles (audit: duplicate day-labels, the lower one orphaned). The
          rationale text + its all-users visibility + today-only gating are
          unchanged — only the render location moved. */}

      {/* S2: goal-hit macro-day share card (nutrition template) */}
      <ShareCardSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        data={{
          template: "nutrition",
          handle: profile?.displayName || "Athlete",
          date: new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
          calories: dailyTotals.calories,
          calorieTarget: dailyTargets.finalTarget,
          protein: dailyTotals.protein,
          carbs: dailyTotals.carbs,
          fat: dailyTotals.fat,
        }}
      />
    </>
  );
}
