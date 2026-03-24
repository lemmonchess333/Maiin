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
  const healthDisplay = useCountUp(healthScore ?? 0, { sessionKey: "health", duration: 1 });
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
        {/* Health Score — hero card with 270° ring */}
        <Link to="/history?tab=health" onClick={function() { haptic(); }} className="block p-4 rounded-2xl bg-card active:scale-[0.98]">
          {(() => {
            const zoneColor = healthScore != null ? getScoreColor(healthScore) : THEME.text.muted;
            // 270° arc: circumference = 2πr, arc = 270/360 * circumference
            const radius = 28;
            const circumference = 2 * Math.PI * radius;
            const arcLength = (270 / 360) * circumference;
            const fillLength = healthScore != null ? (healthScore / 100) * arcLength : 0;
            // Rotate so gap is at bottom center: start at 135° (bottom-left)
            const startAngle = 135;

            return (
              <>
                <div className="flex items-center gap-4">
                  {/* Ring */}
                  <div className="relative flex-shrink-0" style={{ width: 72, height: 72 }}>
                    <svg className="w-full h-full" viewBox="0 0 72 72" style={{ transform: `rotate(${startAngle}deg)` }}>
                      {/* Background track */}
                      <circle cx="36" cy="36" r={radius} fill="none"
                        stroke={zoneColor} strokeOpacity={0.15} strokeWidth="8"
                        strokeDasharray={`${arcLength} ${circumference}`}
                        strokeLinecap="round" />
                      {/* Animated fill */}
                      {healthScore != null && (
                        <motion.circle cx="36" cy="36" r={radius} fill="none"
                          stroke={zoneColor} strokeWidth="8"
                          strokeDasharray={`${arcLength} ${circumference}`}
                          strokeLinecap="round"
                          initial={{ strokeDashoffset: arcLength }}
                          animate={{ strokeDashoffset: arcLength - fillLength }}
                          transition={{ duration: 1, ease: "easeOut" }} />
                      )}
                    </svg>
                    {/* Heart icon centered */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Heart className="w-4 h-4" style={{ color: zoneColor }} fill={zoneColor} fillOpacity={0.2} />
                    </div>
                  </div>
                  {/* Score + label */}
                  <div className="flex-1 min-w-0">
                    {healthScore != null ? (
                      <>
                        <p className="text-display font-extrabold leading-none font-mono tabular-nums" style={{ color: zoneColor }}>
                          <motion.span>{healthDisplay}</motion.span>
                        </p>
                        <motion.p
                          className="text-sm font-medium mt-0.5"
                          style={{ color: zoneColor, opacity: 0.8 }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 0.8 }}
                          transition={{ delay: 1.2, duration: 0.2 }}
                        >
                          {getScoreLabel(healthScore)}
                        </motion.p>
                        {/* Trend indicator */}
                        {scoreDelta != null && scoreDelta !== 0 && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-medium"
                              style={{
                                backgroundColor: (scoreDelta > 0 ? THEME.semantic.positive : THEME.semantic.vitals) + "1A",
                                color: scoreDelta > 0 ? THEME.semantic.positive : THEME.semantic.vitals,
                              }}>
                              {scoreDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {scoreDelta > 0 ? "+" : ""}{scoreDelta} from yesterday
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-display font-extrabold leading-none font-mono tabular-nums" style={{ color: THEME.text.muted }}>--</p>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
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
                {waterGlasses}
                <span className="text-sm font-normal mx-1" style={{ color: THEME.text.muted }}>/</span>
                <span className="text-sm font-normal" style={{ color: THEME.text.muted }}>{waterTarget}</span>
              </p>
              <p className="text-xs font-mono tabular-nums mt-0.5" style={{ color: THEME.text.muted }}>
                {(waterGlasses * 250 / 1000).toFixed(2).replace(/\.?0+$/, "")} L
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
