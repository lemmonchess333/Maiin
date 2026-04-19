import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
// Nut icon (walnut silhouette) pairs with the Earth-palette fat colour —
// more semantically fat-associated than Cookie (which reads as sugar) and
// avoids avocado (Cal AI convention).
import { Beef, Wheat, Nut, Info, X } from "lucide-react";
import { THEME } from "@/lib/theme";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import { haptic } from "@/lib/haptic";
import { useCoachMarks } from "@/hooks/useCoachMarks";
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
  /** From useEffectiveTargets() — includes effective finalTarget and caption */
  dailyTargets: EffectiveTargets;
  dailyTotals: DailyTotals;
}

interface TrainingBurnToast {
  delta: number;
  source: string;
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
  selectedDate,
  isToday,
  dailyTargets,
  dailyTotals,
}: FoodHeroCardProps) {
  // Synchronous init prevents first-paint flash of wrong mode
  const [mode, setMode] = useState<CalorieRingMode>(() => readInitialMode());

  // Celebration state — driven by a log that completes all three macros today
  const [celebrating, setCelebrating] = useState(false);
  const [showCelebrationCaption, setShowCelebrationCaption] = useState(false);

  // First-time explainer for the "+250 FUEL" adjustment in the caption.
  // Keyed so it's independent of the Home welcome card. Shows once per
  // user, dismissible via X or a tap-outside. Never auto-fires on rest
  // days because there's no adjustment to explain.
  const { showCoachMarks: showFuelExplainer, dismiss: dismissFuelExplainer } =
    useCoachMarks("food-fuel-caption");

  // Previous macro totals for transition detection
  const prevTotalsRef = useRef(dailyTotals);
  const firstMountRef = useRef(true);

  // ── Training-burn toast ────────────────────────────────────────────────
  // Triggers on finalTarget change, NOT on actualBurn change. This handles
  // the "strategic covers actual" case: if a strength-phase user lifts
  // within their strategic surplus, actualBurn increases but finalTarget
  // does not move → no toast → ring stays put.
  const [trainingBurnToast, setTrainingBurnToast] =
    useState<TrainingBurnToast | null>(null);
  const prevTargetRef = useRef<number | undefined>(undefined);
  const prevLiftBurnRef = useRef<number>(0);
  const prevRunBurnRef = useRef<number>(0);
  // lastLogMomentAt: Option A (local ref in FoodHeroCard). The food-log
  // handler doesn't live here, but the log moment manifests via dailyTotals
  // changing — we stamp the ref whenever dailyTotals change, which is the
  // same signal that triggers the 600ms animation. The toast detection
  // effect reads this ref to defer itself when a log is in flight.
  const lastLogMomentAt = useRef<number>(0);

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

    // Stamp the log moment so the training-burn toast detector can defer
    // itself when a food log animation is in flight.
    lastLogMomentAt.current = Date.now();

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

  // ── Toast: reset on date change ──────────────────────────────────────
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    prevTargetRef.current = undefined;
    prevLiftBurnRef.current = 0;
    prevRunBurnRef.current = 0;
    setTrainingBurnToast(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedDate]);

  // ── Toast: detection ─────────────────────────────────────────────────
  const finalTarget = dailyTargets.finalTarget;
  const actualLiftBurn = dailyTargets.actualLiftBurn;
  const actualRunBurn = dailyTargets.actualRunBurn;
  useEffect(() => {
    if (prevTargetRef.current === undefined) {
      // Baseline on first render for this date — no toast
      prevTargetRef.current = finalTarget;
      prevLiftBurnRef.current = actualLiftBurn;
      prevRunBurnRef.current = actualRunBurn;
      return;
    }

    if (finalTarget <= prevTargetRef.current) {
      // Downward or unchanged — never fires a toast (handles deletes).
      // Still update refs so a subsequent upward move has a correct baseline.
      prevTargetRef.current = finalTarget;
      prevLiftBurnRef.current = actualLiftBurn;
      prevRunBurnRef.current = actualRunBurn;
      return;
    }

    const delta = finalTarget - prevTargetRef.current;
    const liftIncreased = actualLiftBurn > prevLiftBurnRef.current;
    const runIncreased = actualRunBurn > prevRunBurnRef.current;
    const source =
      liftIncreased && runIncreased
        ? "lift + run"
        : liftIncreased
          ? "lift"
          : runIncreased
            ? "run"
            : "training";

    // Race resolution — defer by any remaining log-moment time
    const elapsed = Date.now() - lastLogMomentAt.current;
    const defer = elapsed < LOG_MOMENT_MS ? LOG_MOMENT_MS - elapsed : 0;

    const show = () => {
      setTrainingBurnToast({ delta, source });
      haptic("light");
    };

    // Update refs BEFORE scheduling — so overlapping upward moves detect
    // against the latest baseline.
    prevTargetRef.current = finalTarget;
    prevLiftBurnRef.current = actualLiftBurn;
    prevRunBurnRef.current = actualRunBurn;

    if (defer > 0) {
      const t = setTimeout(show, defer);
      return () => clearTimeout(t);
    }
    show();
  }, [finalTarget, actualLiftBurn, actualRunBurn]);

  // ── Toast: auto-dismiss after 3s ─────────────────────────────────────
  useEffect(() => {
    if (!trainingBurnToast) return;
    const t = setTimeout(() => setTrainingBurnToast(null), 3000);
    return () => clearTimeout(t);
  }, [trainingBurnToast]);

  // Build the top-left caption. Suppressed on rest days.
  const caption = dailyTargets.caption;

  // Fuel explainer visibility: only when there's an actual adjustment to
  // explain AND the user hasn't dismissed it yet AND we're not mid-celebration
  // (don't stomp on "DAY N ✓"). Boolean so the auto-dismiss effect below
  // only triggers on the visibility transition, not on every caption update.
  const shouldShowFuelExplainer =
    showFuelExplainer &&
    !!caption &&
    !!caption.adjustment &&
    !showCelebrationCaption;

  // Auto-dismiss the explainer after 10 seconds so it doesn't linger if the
  // user ignores it. Marks it seen permanently, same as tapping the X.
  useEffect(() => {
    if (!shouldShowFuelExplainer) return;
    const t = setTimeout(() => dismissFuelExplainer(), 10000);
    return () => clearTimeout(t);
  }, [shouldShowFuelExplainer, dismissFuelExplainer]);
  const celebrationCaptionText = `GOAL HIT ✓`;

  // Trajectory line — suppressed; can be reinstated by importing
  // computeTrajectory from "@/lib/foodTrajectory" and passing its result.
  const trajectoryLabel = null;

  // Card surface gradient (#FFFFFF to #FAFAFA, 1.6% lightness shift) adds
  // imperceptible depth. Shadow matches Health Score (no 1.2x bump — the
  // calorie card is now short enough that the standard shadow is correct).
  // TODO: dark mode needs a dark-surface gradient.
  return (
    <>
      {/* ── CALORIE CARD — caption, ring, no macros ────────────────────── */}
      <div
        className="p-4 rounded-2xl"
        style={{
          background: "linear-gradient(to bottom, #FFFFFF 0%, #FAFAFA 100%)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)",
        }}
      >
        {/* Top row: caption */}
        <div className="mb-4 min-h-[20px]">
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
                className="text-micro uppercase tracking-wider text-muted-foreground/70"
              >
                {caption.trainingType}
                {caption.adjustment && (
                  <>
                    {' · '}
                    <span style={{ color: THEME.lifting }}>{caption.adjustment}</span>
                  </>
                )}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {/* First-time explainer for the caption's calorie adjustment. */}
        <AnimatePresence initial={false}>
          {shouldShowFuelExplainer && (
            <motion.div
              key="fuel-explainer"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 12 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/50">
                <Info
                  className="w-3.5 h-3.5 mt-0.5 shrink-0"
                  style={{ color: THEME.lifting }}
                  aria-hidden="true"
                />
                <p className="flex-1 text-xs leading-snug text-muted-foreground">
                  Your calorie target is higher today to fuel your planned workout.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    haptic("light");
                    dismissFuelExplainer();
                  }}
                  aria-label="Dismiss explainer"
                  className="p-0.5 -m-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Calorie ring */}
        <CalorieRing
          consumed={dailyTotals.calories}
          target={dailyTargets.finalTarget}
          mode={mode}
          onToggleMode={toggleMode}
          trajectoryLabel={trajectoryLabel}
          glowing={celebrating}
          ringDurationMs={LOG_MOMENT_MS}
          trainingBurnToast={trainingBurnToast}
        />
      </div>

      {/* ── MACRO ROW — three independent floating tiles ───────────────
          mt-4 provides 16px gap to the calorie card above.
          gap-4 provides 16px between individual tiles.
          The variants motion.div in Food.tsx animates both as one unit. */}
      <div className="flex gap-4 mt-4">
        <div
          className="flex-1 flex p-3 rounded-2xl"
          style={{
            background: "#FFFFFF",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)",
          }}
        >
          <MacroColumn
            macroKey="protein"
            Icon={Beef}
            consumed={dailyTotals.protein}
            target={dailyTargets.protein}
            label="PROTEIN"
            color={THEME.macros.protein}
            mode={mode}
            numberDurationSec={LOG_MOMENT_SEC}
            barDurationSec={LOG_MOMENT_SEC}
          />
        </div>
        <div
          className="flex-1 flex p-3 rounded-2xl"
          style={{
            background: "#FFFFFF",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)",
          }}
        >
          <MacroColumn
            macroKey="carbs"
            Icon={Wheat}
            consumed={dailyTotals.carbs}
            target={dailyTargets.carbs}
            label="CARBS"
            color={THEME.macros.carbs}
            mode={mode}
            numberDurationSec={LOG_MOMENT_SEC}
            barDurationSec={LOG_MOMENT_SEC}
          />
        </div>
        <div
          className="flex-1 flex p-3 rounded-2xl"
          style={{
            background: "#FFFFFF",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)",
          }}
        >
          <MacroColumn
            macroKey="fat"
            Icon={Nut}
            consumed={dailyTotals.fat}
            target={dailyTargets.fat}
            label="FAT"
            color={THEME.macros.fat}
            mode={mode}
            numberDurationSec={LOG_MOMENT_SEC}
            barDurationSec={LOG_MOMENT_SEC}
          />
        </div>
      </div>
    </>
  );
}
