import { useEffect, useRef, useState } from "react";
import { readString, writeString } from "@/lib/localStore";
import {
  useCalorieRingMode,
  setCalorieRingMode,
} from "@/hooks/useCalorieRingMode";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Settings as SettingsIcon, ChevronRight, Share2 } from "lucide-react";
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
import { foodHeroFigure, foodHeroLine } from "@/lib/foodHero";
import CalorieRing from "./CalorieRing";
import MacroColumn from "./MacroColumn";
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";
import AdaptiveWarmupBar from "./AdaptiveWarmupBar";
import { beforeStart, startDayKey } from "@/lib/startDay";

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
  /** Draw the ring and tiles in from zero on mount (the default).
   *  Food passes false once the person has switched day: the card is
   *  remounted per day, and a remount is a browse, not a log. */
  drawIn?: boolean;
  /** Whether the diary holds any meal at all, on any day it has loaded.
   *  Without one, today's hero carries the first use's line (DS4). */
  hasAnyMeal?: boolean;
  /** The account began inside the diary's window, so an empty diary is
   *  a first use ("Log your first meal …") rather than a return. */
  isNew?: boolean;
}

const MACROS = [
  { key: "protein", label: "Protein" },
  { key: "carbs", label: "Carbs" },
  { key: "fat", label: "Fat" },
] as const;

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
  selectedDate,
  isToday,
  dailyTargets,
  dailyTotals,
  onTapDrillDown,
  drawIn = true,
  hasAnyMeal = true,
  isNew = false,
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
  /* A day before the account began, with nothing logged on it (Food10
     (3)): no ring and no tiles, since "2,200 left" would claim a target
     and an empty day the app knows nothing about. */
  const beforeJoined =
    beforeStart(selectedDate, startDayKey(profile?.createdAt)) &&
    dailyTotals.calories === 0;

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

  // The top-left line carries ONLY the celebration now. The day-type
  // caption ("Lift day · Hard session") that sat there is gone — owner
  // call from the hero-glow options: the card is the ring and its
  // number, not a briefing. The day type and its rationale still exist
  // on the targets and still render in the Details sheet, which is
  // where a person who wants the why goes.
  const celebrationCaptionText = `Goal hit ✓`;

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
  const glanceLine =
    isToday && targetsAreDefault
      ? buildGlanceLine(dailyTotals, dailyTargets, { targetsAreDefault })
      : null;

  const figure = foodHeroFigure({
    consumed: dailyTotals.calories,
    target: dailyTargets.finalTarget,
    mode,
  });
  const heroLine = foodHeroLine({
    isToday,
    beforeJoined,
    hasAnyMeal,
    isNew,
    target: dailyTargets.finalTarget,
    mode,
  });

  /* Food's hero (DS4, DESIGN_GUIDE §14m): open on the page, not a card,
     so it is dressed differently from the cards under it (rule 4). The
     ring is the screen's one picture of the person's data and holds its
     largest text, the day's figure. Its colour is the food orange alone,
     on the arc, the macro bars and the week's rings (rule 11), over a
     glow of the same orange that fades into the page (rule 13) and stays
     under what counts as colour in both themes (rule 15). It replaced a
     card washed from orange into purple, the only two-hue gradient on an
     everyday screen in 178 measured, and 7.2% colour in dark against
     2.9% in light. */
  return (
    <>
      <div className="relative">
        <div
          aria-hidden="true"
          className="food-hero-glow pointer-events-none absolute left-1/2 top-1/2 aspect-square w-full max-w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        />
        {/* The ring and its three small controls, in its corners: the
            goal-hit caption top left, share and the targets' gear top
            right, the breakdown bottom right. The ring's round shape
            leaves each corner free. */}
        <div className="relative">
          <div className="absolute left-0 top-0 max-w-[40%]">
            <AnimatePresence mode="wait">
              {showCelebrationCaption ? (
                <motion.p
                  key="celebration"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="text-micro font-semibold"
                  style={{
                    color: "hsl(var(--success-strong))",
                  }}
                >
                  {celebrationCaptionText}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
          {/* Share on a goal-hit day, and the targets gear, which goes
              straight to the Nutrition editor so a wrong target is one tap
              from being fixed. Muted, so they don't compete with the
              figure. */}
          <div className="absolute -right-2 -top-2 z-10 flex items-center">
            {goalHit && (
              <button
                type="button"
                aria-label="Share your day"
                onClick={() => {
                  haptic("light");
                  setShareOpen(true);
                }}
                className="size-11 flex items-center justify-center rounded-lg text-nutrition-strong hover:bg-muted/60 active:scale-95 transition-all"
              >
                <Share2 className="size-4" aria-hidden="true" />
              </button>
            )}
            <Link
              to="/settings/nutrition"
              aria-label="Adjust nutrition targets"
              onClick={() => haptic("light")}
              className="size-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
            </Link>
          </div>

          {beforeJoined ? (
            <div className="flex flex-col items-center justify-center gap-1 px-10 py-12 text-center">
              <p className="text-base font-semibold text-foreground">
                Before you joined
              </p>
              <p className="text-sm text-muted-foreground">
                Your days count from the day you joined.
              </p>
            </div>
          ) : (
            <CalorieRing
              consumed={dailyTotals.calories}
              target={dailyTargets.finalTarget}
              mode={mode}
              onToggleMode={toggleMode}
              trajectoryLabel={trajectoryLabel}
              glowing={celebrating}
              ringDurationMs={LOG_MOMENT_MS}
              drawIn={drawIn}
              caption={figure.caption}
            />
          )}

          {/* Food6 a2: the breakdown, at the bottom right. Its own tap
              target, clear of the ring's mode switch and the gear. A verb
              and its object (DS4's words rules). */}
          {onTapDrillDown && !beforeJoined && (
            <button
              type="button"
              onClick={() => {
                haptic("light");
                onTapDrillDown();
              }}
              aria-label="View nutrition breakdown"
              className="absolute -right-2 -bottom-4 z-10 flex items-center gap-1 px-2.5 min-h-[44px] rounded-full text-xs hover:bg-muted/60 active:scale-95 transition-all text-foreground"
            >
              <span>See nutrients</span>
              <ChevronRight aria-hidden="true" className="size-3" />
            </button>
          )}
        </div>

        {/* The first use's one line: the first step, and the number it
            fills (DS4, rule 41). */}
        {heroLine && (
          <p className="relative mt-2 px-4 text-center text-sm font-medium text-muted-foreground text-balance">
            {heroLine}
          </p>
        )}

        {/* Nutr2 / #981 — adaptive warmup bar, today-only, ambient under the
            ring. Reads from the single source of truth (useEffectiveTargets).
            Hidden once the gate clears (learned takeover, #982). */}
        {isToday && dailyTargets.showWarmup && (
          <div className="relative">
            <AdaptiveWarmupBar
              fraction={dailyTargets.warmupFraction}
              stalled={dailyTargets.adaptiveStalled}
            />
          </div>
        )}

        {/* Only actionable setup guidance belongs here; the ring and
            the macros already show the day's numbers. */}
        {glanceLine && (
          <p className="relative text-center text-xs font-medium mt-3 px-2 text-muted-foreground">
            {glanceLine}
          </p>
        )}
        {/* A target below the essential-fat floor's own cost: the macros
            below would otherwise present "0g" as the goal. Same sentence
            as Settings and Home (macroInfeasibility.ts). */}
        {dailyTargets.targetInfeasible && (
          <p
            role="status"
            className="relative text-center text-xs font-medium mt-3 px-2"
            style={{ color: "hsl(var(--warning-strong))" }}
          >
            {macroInfeasibilityMessage(dailyTargets.minFeasibleKcal)}
          </p>
        )}
      </div>

      {/* The three macros, in the hero rather than in three cards under
          it. Each reads the SAME shared `mode` as the ring, and tapping
          any flips that one mode, so the ring and the macros stay in
          lockstep. Every bar is the food orange and the word under it
          names the macro, so the first screen holds one hue where it
          held four (DS4, rule 11); the breakdown sheet keeps each macro's
          own colour. No icons: they cost the hero the height that keeps
          Scan above the tab bar on a 13 mini (companion-food's pin).
          Equal columns by construction (grid-cols-3, min-w-0), stacked
          under 10em (double text on a 320px phone). */}
      {!beforeJoined && (
        <div className="@container mt-5">
          <div className="grid grid-cols-3 @max-[10em]:grid-cols-1 gap-2">
            {MACROS.map(({ key, label }) => (
              <div key={key} className="min-w-0 flex">
                <MacroColumn
                  macroKey={key}
                  consumed={dailyTotals[key]}
                  target={
                    key !== "fat" && dailyTargets.targetInfeasible
                      ? 0
                      : dailyTargets[key]
                  }
                  label={label}
                  color={THEME.semantic.nutrition}
                  mode={mode}
                  onTap={toggleMode}
                  numberDurationSec={LOG_MOMENT_SEC}
                  barDurationSec={LOG_MOMENT_SEC}
                  drawIn={drawIn}
                  size="compact"
                />
              </div>
            ))}
          </div>
        </div>
      )}

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
