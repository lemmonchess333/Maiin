import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Beef,
  Wheat,
  Settings as SettingsIcon,
  ChevronRight,
} from "lucide-react";
import { Avocado } from "@/components/icons/Avocado";
import { THEME } from "@/lib/theme";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { didJustCompleteAll, todayIsoDate } from "@/lib/foodCelebration";
import { buildGlanceLine } from "@/lib/foodDailySummary";
import CalorieRing, { type CalorieRingMode } from "./CalorieRing";
import MacroColumn from "./MacroColumn";
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

const MODE_STORAGE_KEY = "tropos.food.calorieRingMode";
const CELEBRATED_STORAGE_KEY = "tropos.food.celebratedDate";

// All log-moment animations share this duration so they finish in sync.
const LOG_MOMENT_MS = 600;
const LOG_MOMENT_SEC = LOG_MOMENT_MS / 1000;

function readInitialMode(): CalorieRingMode {
  if (typeof window === "undefined") return "left";
  try {
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    return stored === "eaten" ? "eaten" : "left";
  } catch {
    return "left";
  }
}

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
  const [mode, setMode] = useState<CalorieRingMode>(() => readInitialMode());

  // Celebration state — driven by a log that completes all three macros today
  const [celebrating, setCelebrating] = useState(false);
  const [showCelebrationCaption, setShowCelebrationCaption] = useState(false);

  // Previous macro totals for transition detection
  const prevTotalsRef = useRef(dailyTotals);
  const firstMountRef = useRef(true);

  const toggleMode = () => {
    haptic("light");
    const next: CalorieRingMode = mode === "left" ? "eaten" : "left";
    setMode(next);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
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
      const celebrated = (() => {
        try {
          return window.localStorage.getItem(CELEBRATED_STORAGE_KEY);
        } catch {
          return null;
        }
      })();
      const todayKey = todayIsoDate();
      if (
        celebrated !== todayKey &&
        didJustCompleteAll(prev, dailyTotals, targets)
      ) {
        shouldCelebrate = true;
        try {
          window.localStorage.setItem(CELEBRATED_STORAGE_KEY, todayKey);
        } catch {
          // ignore
        }
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

  // Dark-aware surface via `bg-card` + `var(--ds-shadow-card)` — the token
  // swaps to a deeper shadow under `.dark` (see tokens.css), so the same
  // markup renders correctly in both themes.
  return (
    <>
      {/* ── CALORIE CARD — caption, ring, glance line ──────────────────── */}
      <div className="p-4 rounded-2xl bg-card card-shadow">
        {/* Top row: caption (left) + adjust-targets gear (right).
            The gear is a small Settings shortcut so users can fix
            a wrong target without hunting through nav → Settings →
            scroll. Subtle muted-foreground colour so it doesn't
            compete with the ring or glance line for attention.
            Routes to the Settings page (top); deep-linking to the
            NutritionSection isn't supported by the route today —
            documented limitation. */}
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
                  style={{ color: THEME.success }}
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
                  className="text-xs font-medium text-muted-foreground/80"
                >
                  {caption.trainingType}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
          <Link
            to="/settings"
            aria-label="Adjust nutrition targets"
            onClick={() => haptic("light")}
            className="shrink-0 -mt-2 -mr-2 size-11 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
          >
            <SettingsIcon className="size-4" aria-hidden="true" />
          </Link>
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
          <p className="text-center text-xs font-medium text-muted-foreground mt-3 px-2">
            {glanceLine}
          </p>
        )}
        {/* Food6 a2: drill-down affordance. Subtle chevron pill at the
            bottom of the calorie card opens the detailed breakdown
            sheet. Distinct tap target so it doesn't conflict with the
            CalorieRing mode-toggle, the Settings link, or any nested
            buttons in the card. */}
        {onTapDrillDown && (
          <div className="flex justify-center mt-3">
            <button
              type="button"
              onClick={() => {
                haptic("light");
                onTapDrillDown();
              }}
              aria-label="View nutrition breakdown"
              className="flex items-center gap-1 px-2.5 min-h-[44px] -my-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:bg-muted/60 active:scale-95 transition-all"
            >
              <span>Details</span>
              <ChevronRight aria-hidden="true" className="size-3" />
            </button>
          </div>
        )}
      </div>

      {/* Macro tile row — three floating tiles. Each reads the SAME shared
          `mode` as the calorie ring, and tapping any tile flips that one
          shared mode (via toggleMode) so the ring + all three tiles stay in
          lockstep. mt-4 = 16px gap to the calorie card above; gap-4 = 16px
          between tiles. */}
      <div className="flex gap-4 mt-4">
        <div className="flex-1 flex p-3 rounded-2xl bg-card card-shadow">
          <MacroColumn
            macroKey="protein"
            Icon={Beef}
            consumed={dailyTotals.protein}
            target={dailyTargets.protein}
            label="PROTEIN"
            color={THEME.macros.protein}
            mode={mode}
            onTap={toggleMode}
            numberDurationSec={LOG_MOMENT_SEC}
            barDurationSec={LOG_MOMENT_SEC}
          />
        </div>
        <div className="flex-1 flex p-3 rounded-2xl bg-card card-shadow">
          <MacroColumn
            macroKey="carbs"
            Icon={Wheat}
            consumed={dailyTotals.carbs}
            target={dailyTargets.carbs}
            label="CARBS"
            color={THEME.macros.carbs}
            mode={mode}
            onTap={toggleMode}
            numberDurationSec={LOG_MOMENT_SEC}
            barDurationSec={LOG_MOMENT_SEC}
          />
        </div>
        <div className="flex-1 flex p-3 rounded-2xl bg-card card-shadow">
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

      {/* Training-aware day label (the free→premium conversion hook). DESCRIBES
          the planned day — "Hard training day" / "Deload week" / "Race week —
          carb load" — and is shown to ALL users (the macro MOVE is Pro-gated in
          useEffectiveTargets, but the rationale is visible to free users; the
          copy never asserts a change that didn't happen). Today-only; the hook
          returns "" on plain rest days so this suppresses on rest + diary
          views, mirroring the glanceLine gating. */}
      {isToday && dailyTargets.annotation && (
        <p className="text-center text-xs font-medium text-muted-foreground mt-3 px-2">
          {dailyTargets.annotation}
        </p>
      )}
    </>
  );
}
