import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Beef, Wheat, Cookie } from "lucide-react";
import { THEME } from "@/lib/theme";
import type { DailyTargets } from "@/hooks/useDailyTargets";
import { haptic } from "@/lib/haptic";
import { StreakFlame } from "@/components/StreakFlame";
import { computeTrajectory } from "@/lib/foodTrajectory";
import { didJustCompleteAll, todayIsoDate } from "@/lib/foodCelebration";
import CalorieRing, { type CalorieRingMode } from "./CalorieRing";
import MacroColumn from "./MacroColumn";

interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface FoodHeroCardProps {
  selectedDate: string;   // ISO date "YYYY-MM-DD"
  isToday: boolean;
  dailyTargets: DailyTargets;
  dailyTotals: DailyTotals;
  streak: number;
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
  selectedDate: _selectedDate,
  isToday,
  dailyTargets,
  dailyTotals,
  streak,
}: FoodHeroCardProps) {
  // Synchronous init prevents first-paint flash of wrong mode
  const [mode, setMode] = useState<CalorieRingMode>(() => readInitialMode());

  // Celebration state — driven by a log that completes all three macros today
  const [celebrating, setCelebrating] = useState(false);
  const [showCelebrationCaption, setShowCelebrationCaption] = useState(false);

  // Previous macro totals for transition detection
  const prevTotalsRef = useRef(dailyTotals);
  const firstMountRef = useRef(true);

  const toggleMode = () => {
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
      if (celebrated !== todayKey && didJustCompleteAll(prev, dailyTotals, targets)) {
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
      celebrationHapticTimer = setTimeout(() => haptic("light"), LOG_MOMENT_MS + 100);
      celebrationGlowTimer = setTimeout(() => setCelebrating(false), 800);
      celebrationCaptionTimer = setTimeout(() => setShowCelebrationCaption(false), 2200);
    }

    return () => {
      clearTimeout(logHapticTimer);
      if (celebrationStartTimer) clearTimeout(celebrationStartTimer);
      if (celebrationHapticTimer) clearTimeout(celebrationHapticTimer);
      if (celebrationGlowTimer) clearTimeout(celebrationGlowTimer);
      if (celebrationCaptionTimer) clearTimeout(celebrationCaptionTimer);
    };
  }, [dailyTotals, dailyTargets.protein, dailyTargets.carbs, dailyTargets.fat, isToday]);

  // Build the top-left caption. Suppressed on rest days.
  const caption = dailyTargets.caption;
  const celebrationCaptionText = `DAY ${streak || 1} ✓`;

  // Trajectory line
  const trajectoryLabel = isToday
    ? computeTrajectory(dailyTotals.calories, dailyTargets.finalTarget)
    : null;

  return (
    <div className="p-4 rounded-2xl bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)]">
      {/* Top row: caption + streak flame */}
      <div className="flex items-start justify-between mb-4 min-h-[20px]">
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
                style={{ color: "#4CAF50" }}
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
                className="text-micro uppercase tracking-wider"
                style={{ color: THEME.lifting }}
              >
                {caption.trainingType}
                {caption.adjustment && <span> · {caption.adjustment}</span>}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
        <StreakFlame streak={streak} celebrate={celebrating} />
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

      {/* Whitespace separator — no divider */}
      <div className="h-6" />

      {/* Macro columns */}
      <div className="flex gap-2">
        <MacroColumn
          macroKey="protein"
          Icon={Beef}
          consumed={dailyTotals.protein}
          target={dailyTargets.protein}
          label="PROTEIN"
          color={THEME.macros.protein}
          numberDurationSec={LOG_MOMENT_SEC}
          barDurationSec={LOG_MOMENT_SEC}
        />
        <MacroColumn
          macroKey="carbs"
          Icon={Wheat}
          consumed={dailyTotals.carbs}
          target={dailyTargets.carbs}
          label="CARBS"
          color={THEME.macros.carbs}
          numberDurationSec={LOG_MOMENT_SEC}
          barDurationSec={LOG_MOMENT_SEC}
        />
        <MacroColumn
          macroKey="fat"
          Icon={Cookie}
          consumed={dailyTotals.fat}
          target={dailyTargets.fat}
          label="FAT"
          color={THEME.macros.fat}
          numberDurationSec={LOG_MOMENT_SEC}
          barDurationSec={LOG_MOMENT_SEC}
        />
      </div>

    </div>
  );
}
