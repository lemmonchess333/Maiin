import { useState } from "react";
import { THEME } from "@/lib/theme";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useCountUp } from "@/hooks/useCountUp";
const MotionLink = motion.create(Link);
import { Dumbbell, Play, Footprints, Scale, Heart, Droplets, Plus, Minus, Activity, UtensilsCrossed, Route, PersonStanding, Zap, RefreshCw, Wind, Flag, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { getScoreColor, getScoreLabel } from "@/lib/healthScore";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import WaterWave from "@/components/home/WaterWave";
import WaterBubbles from "@/components/home/WaterBubbles";

const RUN_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'person-standing': PersonStanding,
  'zap': Zap,
  'refresh-cw': RefreshCw,
  'wind': Wind,
  'route': Route,
  'flag': Flag,
};

export default function StackedCTACards({ nextWorkout, todayType, navigate, waterGlasses, waterTarget, onAddWater, onRemoveWater, lastWeight, weightUnit, onLogWeight, todayRun, healthScore, prevHealthScore }: {
  nextWorkout: { dayName: string; dayType: string; exercises: { name: string }[] } | null;
  todayType: "lift" | "run" | "both" | "rest";
  navigate: (p: string) => void;
  waterGlasses: number;
  waterTarget: number;
  onAddWater: () => void;
  onRemoveWater: () => void;
  lastWeight: string | null;
  weightUnit: string;
  onLogWeight: () => void;
  todayRun: ScheduledRunDay | null;
  healthScore: number | null;
  prevHealthScore: number | null;
}) {
  const [rippleKey, setRippleKey] = useState(0);
  const healthDisplay = useCountUp(healthScore ?? 0, { sessionKey: "health", duration: 0.8 });
  const showLift = (todayType === "lift" || todayType === "both") && nextWorkout;
  const showRun = todayType === "run" || todayType === "both";
  const tmpl = todayRun ? RUN_TEMPLATES.find(function(t) { return t.id === (todayRun.userOverride || todayRun.templateId); }) : null;
  const runLabel = tmpl ? tmpl.name : "Start a run";
  const runDesc = tmpl ? tmpl.description : "Easy run, tempo, or intervals";
  const runIcon = tmpl?.icon;
  const templateParam = tmpl ? "?template=" + tmpl.id : "";
  const RunIconComp = runIcon && RUN_ICON_MAP[runIcon] ? RUN_ICON_MAP[runIcon] : Footprints;

  // Extract key metric from run description (e.g. "10km" or "5K")
  const runKeyMetric = runDesc ? (runDesc.match(/(\d+\.?\d*\s*k(?:m|ilom[ei]t[er]*))/i)?.[1] || runDesc.match(/(\d+\.?\d*\s*mi(?:les?)?)/i)?.[1] || null) : null;

  // Health score trend
  const scoreDelta = healthScore != null && prevHealthScore != null ? healthScore - prevHealthScore : null;

  return (
    <div className="space-y-2">
      {/* Quick Action Pills — promoted above hero cards */}
      <motion.div key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="flex gap-2">
        <MotionLink to="/log" onClick={function() { haptic(); }} whileTap={{ scale: 0.95 }}
          className="flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-xl transition-transform"
          style={{ backgroundColor: THEME.lifting + "18" }}>
          <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
          <span className="text-sm font-semibold text-foreground">Log Lift</span>
        </MotionLink>
        <MotionLink to="/run" onClick={function() { haptic(); }} whileTap={{ scale: 0.95 }}
          className="flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-xl transition-transform"
          style={{ backgroundColor: THEME.running + "18" }}>
          <Activity className="w-4 h-4" style={{ color: THEME.running }} />
          <span className="text-sm font-semibold text-foreground">Start Run</span>
        </MotionLink>
        <MotionLink to="/log" onClick={function() { haptic(); }} whileTap={{ scale: 0.95 }}
          className="flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-xl transition-transform"
          style={{ backgroundColor: THEME.semantic.nutrition + "18" }}>
          <UtensilsCrossed className="w-4 h-4" style={{ color: THEME.semantic.nutrition }} />
          <span className="text-sm font-semibold text-foreground">Log Food</span>
        </MotionLink>
      </motion.div>

      {/* Today's Workout / Run CTA */}
      {showLift && nextWorkout && (
        <motion.button key="w" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
          whileTap={{ scale: 0.97 }}
          onClick={function() { haptic(); navigate("/program"); }}
          className="w-full p-4 rounded-xl bg-card text-left"
          style={{ backgroundColor: THEME.lifting + "08" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: THEME.iconBg }}>
              <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-micro uppercase tracking-wider mb-0.5" style={{ color: THEME.lifting }}>Today · Lift day</p>
              <p className="text-sm font-semibold text-foreground truncate">{nextWorkout.dayName}</p>
              <p className="text-micro text-muted-foreground capitalize">{nextWorkout.dayType} · {nextWorkout.exercises.length} exercises</p>
            </div>
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm" style={{ backgroundColor: THEME.lifting, color: "white" }}>
              <Play className="w-3 h-3" fill="white" />Start
            </div>
          </div>
        </motion.button>
      )}
      {showRun && (
        <motion.button key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
          whileTap={{ scale: 0.97 }}
          onClick={function() { haptic(); navigate("/run" + templateParam); }}
          className="w-full p-4 rounded-xl bg-card text-left"
          style={{ backgroundColor: THEME.running + "08" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: THEME.iconBg }}>
              <RunIconComp className="w-4 h-4" style={{ color: THEME.running }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-micro uppercase tracking-wider mb-0.5" style={{ color: THEME.running }}>Today · Run day</p>
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-semibold text-foreground truncate">{runLabel}</p>
                {runKeyMetric && (
                  <span className="text-sm font-bold font-mono tabular-nums" style={{ color: THEME.running }}>{runKeyMetric}</span>
                )}
              </div>
              <p className="text-micro text-muted-foreground truncate">{runDesc}</p>
            </div>
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm" style={{ backgroundColor: THEME.running, color: "white" }}>
              <Play className="w-3 h-3" fill="white" />{todayRun?.completed ? "Done" : "Go"}
            </div>
          </div>
        </motion.button>
      )}
      <motion.div key="qt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
        className="space-y-3">
        {/* Health Score — hero card with trend */}
        <Link to="/history?tab=health" onClick={function() { haptic(); }} className="block p-4 rounded-2xl bg-card active:scale-[0.98]">
          <div className="flex items-center gap-4">
            <div className="relative w-12 h-12 flex-shrink-0">
              {/* Progress ring around icon */}
              <svg className="absolute inset-0 w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke={THEME.text.muted + "15"} strokeWidth="3" />
                {healthScore != null && (
                  <circle cx="24" cy="24" r="20" fill="none" stroke={getScoreColor(healthScore)} strokeWidth="3"
                    strokeDasharray={`${(healthScore / 100) * 125.66} 125.66`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 0.8s ease-out" }} />
                )}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={
                    healthScore != null && prevHealthScore != null && healthScore > prevHealthScore
                      ? (healthScore >= 70 && prevHealthScore < 70
                        ? { scale: [1, 1.3, 0.95, 1.2, 1] }
                        : { scale: [1, 1.25, 1] })
                      : { scale: 1 }
                  }
                  transition={{ duration: healthScore != null && prevHealthScore != null && healthScore >= 70 && prevHealthScore < 70 ? 0.6 : 0.4 }}
                >
                  <Heart className="w-5 h-5" style={{ color: "#E74C3C" }} fill="#E74C3C" fillOpacity={0.2} />
                </motion.div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: THEME.text.muted }}>Health Score</p>
              {healthScore != null ? (
                <div className="flex items-baseline gap-2">
                  <p className="text-display font-extrabold leading-none" style={{ color: getScoreColor(healthScore) }}>
                    <motion.span>{healthDisplay}</motion.span>
                  </p>
                  <p className="text-sm font-semibold" style={{ color: getScoreColor(healthScore) }}>
                    {getScoreLabel(healthScore)}
                  </p>
                  {scoreDelta != null && scoreDelta !== 0 && (
                    <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: scoreDelta > 0 ? THEME.semantic.positive : THEME.semantic.vitals }}>
                      {scoreDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-display font-extrabold leading-none" style={{ color: THEME.text.muted }}>--</p>
              )}
            </div>
          </div>
        </Link>
        {/* Water — full-width interactive card */}
        <div className="relative overflow-hidden p-4 rounded-2xl bg-card" style={{
          boxShadow: waterGlasses > 0
            ? 'inset 0 -4px 12px rgba(82, 163, 189, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
            : undefined
        }}>
          {/* Fill-from-bottom gradient */}
          <motion.div
            className="absolute inset-x-0 bottom-0 pointer-events-none rounded-2xl"
            style={{
              background: waterGlasses > 0
                ? 'linear-gradient(0deg, rgba(30, 120, 155, 0.25) 0%, rgba(58, 153, 186, 0.15) 40%, rgba(82, 163, 189, 0.08) 100%)'
                : 'transparent'
            }}
            initial={{ height: 0 }}
            animate={{ height: Math.min((waterGlasses / waterTarget) * 100, 100) + "%" }}
            transition={{ type: "spring", stiffness: 120, damping: 14 }}
          >
            {waterGlasses > 0 && (
              <WaterWave
                width={320}
                fillPercent={Math.min((waterGlasses / waterTarget) * 100, 100)}
                splash={rippleKey}
              />
            )}
          </motion.div>
          {/* Ripple on add */}
          <AnimatePresence>
            {rippleKey > 0 && (
              <motion.div
                key={rippleKey}
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(circle at 50% 80%, ${THEME.semantic.hydration}4D, transparent 70%)` }}
                initial={{ opacity: 1, scale: 0.5 }}
                animate={{ opacity: 0, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              />
            )}
          </AnimatePresence>
          {waterGlasses > 2 && <WaterBubbles />}
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: THEME.iconBg }}>
              <Droplets className="w-5 h-5" style={{ color: THEME.semantic.hydration }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: THEME.text.muted }}>Water</p>
              <p className="text-2xl font-extrabold leading-none text-foreground font-mono tabular-nums">
                {Math.min(waterGlasses, waterTarget)}
                <span className="text-sm font-normal mx-1" style={{ color: THEME.text.muted }}>of</span>
                <span className="text-sm font-normal" style={{ color: THEME.text.muted }}>{waterTarget}</span>
                <span className="text-xs font-normal ml-1" style={{ color: THEME.text.muted }}>glasses</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={function(e) { e.stopPropagation(); haptic(); onRemoveWater(); }} aria-label="Remove water" disabled={waterGlasses <= 0} className={cn("size-11 rounded-full flex items-center justify-center active:scale-[0.95] flex-shrink-0 border", waterGlasses <= 0 && "opacity-30")} style={{ backgroundColor: THEME.iconBg, borderColor: THEME.semantic.hydration + "30" }}>
                <Minus className="w-4 h-4" style={{ color: THEME.semantic.hydration }} />
              </button>
              <button onClick={function(e) { e.stopPropagation(); haptic(); onAddWater(); setRippleKey(function(k) { return k + 1; }); }} aria-label="Add water" disabled={waterGlasses >= waterTarget} className={cn("size-11 rounded-full flex items-center justify-center active:scale-[0.95] flex-shrink-0 border", waterGlasses >= waterTarget && "opacity-30")} style={{ backgroundColor: THEME.iconBg, borderColor: THEME.semantic.hydration + "30" }}>
                <Plus className="w-4 h-4" style={{ color: THEME.semantic.hydration }} />
              </button>
            </div>
          </div>
        </div>
        {/* Weight & Steps — compact 2-col */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={function() { haptic(); onLogWeight(); }} className="p-3 rounded-xl text-left active:scale-[0.97] bg-muted">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: THEME.iconBg }}>
                <Scale className="w-3.5 h-3.5" style={{ color: THEME.semantic.activity }} />
              </div>
              <p className="text-micro uppercase tracking-wider font-medium" style={{ color: THEME.text.muted }}>Weight</p>
            </div>
            <div className="flex items-baseline gap-1">
              <p className="text-xl font-bold leading-none text-foreground font-mono tabular-nums">
                {lastWeight ? lastWeight : "\u2014"}
              </p>
              {lastWeight && <span className="text-xs" style={{ color: THEME.text.muted }}>{weightUnit === "lbs" ? "lb" : weightUnit}</span>}
            </div>
          </button>
          <button onClick={function() { haptic(); }} className="p-3 rounded-xl text-left active:scale-[0.97] bg-muted group">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: THEME.iconBg }}>
                <Footprints className="w-3.5 h-3.5" style={{ color: THEME.semantic.positive }} />
              </div>
              <p className="text-micro uppercase tracking-wider font-medium" style={{ color: THEME.text.muted }}>Steps</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium" style={{ color: THEME.brand }}>Connect Health</span>
              <ArrowRight className="w-3 h-3" style={{ color: THEME.brand }} />
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
