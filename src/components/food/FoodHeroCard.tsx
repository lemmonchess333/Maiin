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
import CalorieRing from "./CalorieRing";
import MacroColumn from "./MacroColumn";
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";
import AdaptiveWarmupBar from "./AdaptiveWarmupBar";
import Card from "@/components/ui/Card";
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
  /** Task-first Food entry: full nutrition stays one tap away in Details. */
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
  selectedDate,
  isToday,
  dailyTargets,
  dailyTotals,
  onTapDrillDown,
  drawIn = true,
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

  // One quiet surface keeps the day's calories and macros together. The
  // former two-colour wash and three raised macro cards made the diary's
  // summary look like four competing dashboard widgets.
  return (
    <>
      <Card className="relative overflow-hidden" data-food-summary>
        <div className="relative">
          {/* The ring and the card's three small controls. The controls sit
          in the ring's corners rather than in rows of their own above and
          below it: the week strip above this card took about 80px of the
          page, and those two rows gave it back, so the composer is on
          screen when the page opens on a phone (Food6's pin). The ring's
          round shape leaves each corner free. */}
          <div className="relative">
            {/* Top left: the goal-hit caption, for the two seconds after the
            day's last goal is met. */}
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
            {/* Top right: share on a goal-hit day, and the targets gear.
            The gear deep-links straight to the focused Nutrition editor
            (/settings/nutrition: goal weight, calorie targets, macros,
            activity), so a wrong target is one tap from being fixed, as
            each Train tab's plan edit goes to its own editor. Muted so it
            doesn't compete with the ring for attention. */}
            <div className="absolute -right-2 -top-2 z-10 flex items-center">
              {goalHit && (
                <button
                  type="button"
                  aria-label="Share your day"
                  onClick={() => {
                    haptic("light");
                    setShareOpen(true);
                  }}
                  className="size-11 flex items-center justify-center rounded-lg text-nutrition hover:bg-muted/60 active:scale-95 transition-all"
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
              />
            )}

            {/* Food6 a2: the drill-down, at the bottom right. "Details" and
            a chevron open the breakdown sheet, in the same register as the
            Home and Analytics disclosures (sentence case, text-xs, muted).
            Its own tap target, clear of the ring's mode toggle and the
            gear. */}
            {onTapDrillDown && !beforeJoined && (
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  onTapDrillDown();
                }}
                aria-label="View nutrition breakdown"
                className="absolute -right-2 -bottom-2 z-10 flex items-center gap-1 px-2.5 min-h-[44px] rounded-full text-xs hover:bg-muted/60 active:scale-95 transition-all text-foreground"
              >
                <span>Details</span>
                <ChevronRight aria-hidden="true" className="size-3" />
              </button>
            )}
          </div>

          {/* Nutr2 / #981 — adaptive warmup bar, today-only, ambient under the
          ring. Reads from the single source of truth (useEffectiveTargets).
          Hidden once the gate clears (learned takeover, #982). */}
          {isToday && dailyTargets.showWarmup && (
            <AdaptiveWarmupBar
              fraction={dailyTargets.warmupFraction}
              stalled={dailyTargets.adaptiveStalled}
            />
          )}

          {/* Only actionable setup guidance belongs here; the ring and
              macro cards already show the day's numbers. */}
          {glanceLine && (
            <p
              className={`text-center text-xs font-medium mt-3 px-2 text-muted-foreground`}
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
        </div>
        {/* The numbers share one card with the ring. Their icons and bars
            retain the food colours, while a simple rule gives the
            secondary detail its place without another elevation layer. */}
        {!beforeJoined && (
          <div className="@container mt-4 border-t border-border pt-4">
            <div className="grid grid-cols-3 @max-[10em]:grid-cols-1 gap-3">
              <MacroColumn
                macroKey="protein"
                Icon={Beef}
                consumed={dailyTotals.protein}
                target={
                  dailyTargets.targetInfeasible ? 0 : dailyTargets.protein
                }
                label="Protein"
                color={THEME.macros.protein}
                mode={mode}
                onTap={toggleMode}
                numberDurationSec={LOG_MOMENT_SEC}
                barDurationSec={LOG_MOMENT_SEC}
                drawIn={drawIn}
                size="compact"
              />
              <MacroColumn
                macroKey="carbs"
                Icon={Wheat}
                consumed={dailyTotals.carbs}
                target={dailyTargets.targetInfeasible ? 0 : dailyTargets.carbs}
                label="Carbs"
                color={THEME.macros.carbs}
                mode={mode}
                onTap={toggleMode}
                numberDurationSec={LOG_MOMENT_SEC}
                barDurationSec={LOG_MOMENT_SEC}
                drawIn={drawIn}
                size="compact"
              />
              <MacroColumn
                macroKey="fat"
                Icon={Avocado}
                consumed={dailyTotals.fat}
                target={dailyTargets.fat}
                label="Fat"
                color={THEME.macros.fat}
                mode={mode}
                onTap={toggleMode}
                numberDurationSec={LOG_MOMENT_SEC}
                barDurationSec={LOG_MOMENT_SEC}
                drawIn={drawIn}
                size="compact"
              />
            </div>
          </div>
        )}
      </Card>

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
