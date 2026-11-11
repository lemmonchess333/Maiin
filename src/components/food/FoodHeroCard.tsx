import { useEffect, useRef, useState } from "react";
import { readString, writeString } from "@/lib/localStore";
import {
  useCalorieRingMode,
  setCalorieRingMode,
} from "@/hooks/useCalorieRingMode";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Share2 } from "lucide-react";
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
import { LOG_MOMENT_MS, WHEEL_GROW_MS } from "./logMoment";
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
  /** A logged food is on its way to the wheel (Food11 call 6): the wheel
   *  keeps the calories it had until this is false again, then grows.
   *  The haptic and the goal-hit moment still time themselves from the
   *  log, not from the wheel. */
  holdWheel?: boolean;
  /** Task-first Food entry: full nutrition stays one tap away in Details. */
}

/* The ring MODE stays flat on purpose: "left vs eaten" is a display
   preference of this DEVICE, not a fact about an account. The celebrated
   DATE is the opposite — it records that a particular user hit their targets
   today, so an unscoped key let one account's celebration swallow the
   other's on a shared phone. */
const CELEBRATED_KEY_BASE = "tropos.food.celebratedDate";

export default function FoodHeroCard({
  selectedDate,
  isToday,
  dailyTargets,
  dailyTotals,
  onTapDrillDown,
  drawIn = true,
  holdWheel = false,
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

  // Single shared display mode for the wheel AND the three macros under it
  // (`FoodMacroRow`): all four read the same left⇄eaten framing from one
  // store. Persisted under the calorie-ring key so the choice survives
  // reloads. Synchronous init prevents a first-paint flash of the wrong
  // mode.
  //
  // Was previously split: the ring owned `mode` while each macro tile carried
  // its own independent state (the #848 per-tile pattern). That let the ring
  // read "2,583 kcal LEFT" while all three tiles read "Xg eaten" — two
  // opposite framings on one screen. With one mode, tapping the ring OR any
  // macro flips all four at once.
  const mode = useCalorieRingMode();

  /* The calories the wheel draws: the day's, except while a logged food
     is in the air, when it stays where it was so the arc grows as the
     food arrives and not before. Set during render, so the release
     reaches the wheel in the same commit as the flag. */
  const [wheelCalories, setWheelCalories] = useState(dailyTotals.calories);
  if (!holdWheel && wheelCalories !== dailyTotals.calories) {
    setWheelCalories(dailyTotals.calories);
  }

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

  // Log-moment haptic fires as the wheel and the macros finish, at
  // LOG_MOMENT_MS from the log. A setTimeout, because the animations are
  // driven by Framer Motion inside the child components.
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

  return (
    <>
      {/* ── THE WHEEL — on the page, the screen's one hero ──────────────── */}
      {/* Food11 call 2. The wheel stood in a card, 176px, under the week
          strip: a quarter of the first screen, starting 170px down. It is
          264px on the page now, with Details under it. No box: the wheel
          is the shape. */}
      {/* `data-hero` is the screen scorer's mark (`npm run score:screens`),
          as on Home's session hero: without it the largest block on the
          screen is the light behind the wheel. */}
      <div data-hero="" className="relative flex flex-col items-center">
        {/* One soft light of the food orange behind the wheel, fading into
            the page (DESIGN_GUIDE §14o; DS4 §14m rule 13: one hue). Faint
            enough to count as colour in neither theme (`.food-hero-glow`,
            components.css, which draws it as a 170px circle at this box's
            centre). The box runs out to the screen's edges and no
            further: a 340px circle of its own would reach 10px past a
            320px screen. */}
        <div
          aria-hidden="true"
          className="food-hero-glow pointer-events-none absolute inset-x-[-16px] top-[-38px] h-[340px]"
        />
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
        {/* Top right: share, on a goal-hit day. The targets gear is in the
            page's header row since Food11 (`FoodTargetsLink`). */}
        {goalHit && (
          <div className="absolute -right-[12px] top-0 z-10 flex items-center">
            <button
              type="button"
              aria-label="Share your day"
              onClick={() => {
                haptic("light");
                setShareOpen(true);
              }}
              className="size-[44px] flex items-center justify-center rounded-lg text-nutrition hover:bg-muted/60 active:scale-95 transition-all"
            >
              <Share2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {beforeJoined ? (
          <div className="relative flex flex-col items-center justify-center gap-1 px-10 py-12 text-center">
            <p className="text-base font-semibold text-foreground">
              Before you joined
            </p>
            <p className="text-sm text-muted-foreground">
              Your days count from the day you joined.
            </p>
          </div>
        ) : (
          <CalorieRing
            consumed={holdWheel ? wheelCalories : dailyTotals.calories}
            target={dailyTargets.finalTarget}
            mode={mode}
            onToggleMode={toggleMode}
            trajectoryLabel={trajectoryLabel}
            glowing={celebrating}
            /* 350 ms and no wait of its own: on a log the page holds the
               wheel for the flight's 250 ms first, so the wheel and the
               macros (600 ms from the log) finish together. */
            ringDurationMs={WHEEL_GROW_MS}
            ringDelayMs={0}
            drawIn={drawIn}
          />
        )}

        {/* Food6 a2: the drill-down, under the wheel. "Details" and a
            chevron open the breakdown sheet. Its own 44px target, clear
            of the wheel's mode toggle. It sat in the card's bottom right
            corner at 12px. */}
        {onTapDrillDown && !beforeJoined && (
          <button
            type="button"
            onClick={() => {
              haptic("light");
              onTapDrillDown();
            }}
            aria-label="View nutrition breakdown"
            className="relative flex min-h-[44px] items-center gap-1 rounded-full px-3 text-sm font-medium text-foreground hover:bg-muted/60 active:scale-95 transition-all"
          >
            <span>Details</span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>

      {/* Nutr2 / #981 — adaptive warmup bar, today-only, ambient under the
          wheel. Reads from the single source of truth
          (useEffectiveTargets). Hidden once the gate clears (learned
          takeover, #982). */}
      {isToday && dailyTargets.showWarmup && (
        <AdaptiveWarmupBar
          fraction={dailyTargets.warmupFraction}
          stalled={dailyTargets.adaptiveStalled}
        />
      )}

      {/* Only actionable setup guidance belongs here; the wheel and the
          macros under it already show the day's numbers. */}
      {glanceLine && (
        <p
          className={`text-center text-xs font-medium mt-3 px-2 text-muted-foreground`}
        >
          {glanceLine}
        </p>
      )}
      {/* A target below the essential-fat floor's own cost: the macros
          under the week strip would otherwise present "0g" as the goal.
          Same sentence as Settings and Home (macroInfeasibility.ts). */}
      {dailyTargets.targetInfeasible && (
        <p
          role="status"
          className="text-center text-xs font-medium mt-3 px-2"
          style={{ color: "hsl(var(--warning-strong))" }}
        >
          {macroInfeasibilityMessage(dailyTargets.minFeasibleKcal)}
        </p>
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
