import { useState } from "react";
import { THEME } from "@/lib/theme";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useCountUp } from "@/hooks/useCountUp";
const MotionLink = motion.create(Link);
import { Dumbbell, Play, Footprints, Scale, Heart, Droplets, Plus, Minus, Activity, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { getScoreColor, getScoreLabel } from "@/lib/healthScore";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import WaterWave from "@/components/home/WaterWave";
import WaterBubbles from "@/components/home/WaterBubbles";

function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
}

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

  return (
    <div className="space-y-3">
      {showLift && nextWorkout && (
        <motion.button key="w" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
          whileTap={{ scale: 0.97 }}
          onClick={function() { haptic(); navigate("/program"); }}
          className="w-full p-5 rounded-2xl bg-card text-left"
          style={{ background: "linear-gradient(135deg, " + THEME.lifting + "12 0%, transparent 60%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.iconBg }}>
              <Dumbbell className="w-5 h-5" style={{ color: THEME.lifting }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">Today {"\u00B7"} Lift day</p>
              <p className="text-sm font-semibold text-foreground truncate">{nextWorkout.dayName}</p>
              <p className="text-[11px] text-muted-foreground capitalize">{nextWorkout.dayType} {"\u00B7"} {nextWorkout.exercises.length} exercises</p>
            </div>
            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold" style={{ backgroundColor: THEME.lifting, color: "#fff" }}>
              <Play className="w-3.5 h-3.5" />Start
            </div>
          </div>
        </motion.button>
      )}
      {showRun && (
        <motion.button key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
          whileTap={{ scale: 0.97 }}
          onClick={function() { haptic(); navigate("/run" + templateParam); }}
          className="w-full p-5 rounded-2xl bg-card text-left"
          style={{ background: "linear-gradient(135deg, " + THEME.running + "12 0%, transparent 60%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.iconBg }}>
              {runIcon ? <span className="text-xl">{runIcon}</span> : <Footprints className="w-5 h-5" style={{ color: THEME.running }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">Today {"\u00B7"} Run day</p>
              <p className="text-sm font-semibold text-foreground">{runLabel}</p>
              <p className="text-[11px] text-muted-foreground truncate">{runDesc}</p>
            </div>
            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold" style={{ backgroundColor: THEME.running, color: "#fff" }}>
              <Play className="w-3.5 h-3.5" />{todayRun?.completed ? "Done" : "Go"}
            </div>
          </div>
        </motion.button>
      )}
      <motion.div key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="flex gap-2">
        <MotionLink to="/log" onClick={function() { haptic(); }} whileTap={{ scale: 0.95 }} className="flex-1 p-4 rounded-2xl flex flex-col items-center gap-2 transition-transform" style={{ backgroundColor: 'rgba(124, 110, 246, 0.06)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(124, 110, 246, 0.12)' }}><Dumbbell className="w-5 h-5" style={{ color: '#7C6EF6' }} /></div>
          <span className="text-xs font-semibold text-foreground">Quick Log</span>
        </MotionLink>
        <MotionLink to="/run" onClick={function() { haptic(); }} whileTap={{ scale: 0.95 }} className="flex-1 p-4 rounded-2xl flex flex-col items-center gap-2 transition-transform" style={{ backgroundColor: 'rgba(232, 99, 122, 0.06)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(232, 99, 122, 0.12)' }}><Activity className="w-5 h-5" style={{ color: '#E8637A' }} /></div>
          <span className="text-xs font-semibold text-foreground">Start Run</span>
        </MotionLink>
        <MotionLink to="/log" onClick={function() { haptic(); }} whileTap={{ scale: 0.95 }} className="flex-1 p-4 rounded-2xl flex flex-col items-center gap-2 transition-transform" style={{ backgroundColor: 'rgba(237, 139, 78, 0.06)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(237, 139, 78, 0.12)' }}><UtensilsCrossed className="w-5 h-5" style={{ color: '#ED8B4E' }} /></div>
          <span className="text-xs font-semibold text-foreground">Log Food</span>
        </MotionLink>
      </motion.div>
      <motion.div key="qt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
        className="space-y-3">
        {/* Health Score — hero card, full-width */}
        <Link to="/history?tab=health" onClick={function() { haptic(); }} className="block p-4 rounded-2xl bg-card active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: THEME.iconBg }}
            >
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
                <Heart className="w-5 h-5" style={{ color: THEME.semantic.vitals }} />
              </motion.div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.5px] font-medium" style={{ color: THEME.text.muted }}>Health Score</p>
              {healthScore != null ? (
                <div className="flex items-baseline gap-2">
                  <p className="text-[36px] font-extrabold leading-none" style={{ color: getScoreColor(healthScore) }}>
                    <motion.span>{healthDisplay}</motion.span>
                  </p>
                  <p className="text-sm font-medium" style={{ color: getScoreColor(healthScore), opacity: 0.8 }}>
                    {getScoreLabel(healthScore)}
                  </p>
                </div>
              ) : (
                <p className="text-[36px] font-extrabold leading-none" style={{ color: THEME.text.muted }}>--</p>
              )}
            </div>
          </div>
        </Link>
        {/* Water — full-width interactive card */}
        <div className="relative overflow-hidden p-4 rounded-2xl bg-card" style={{
          boxShadow: waterGlasses > 0
            ? 'inset 0 -4px 12px rgba(78, 173, 204, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
            : undefined
        }}>
          {/* Fill-from-bottom gradient */}
          <motion.div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              background: waterGlasses > 0
                ? 'linear-gradient(0deg, rgba(30, 120, 155, 0.35) 0%, rgba(58, 153, 186, 0.22) 40%, rgba(78, 195, 220, 0.12) 100%)'
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
              <p className="text-[11px] uppercase tracking-[0.5px] font-medium" style={{ color: THEME.text.muted }}>Water</p>
              <p className="text-[28px] font-extrabold leading-none text-foreground">{Math.min(waterGlasses, waterTarget)}<span className="text-[14px] font-normal" style={{ color: THEME.text.muted }}>/{waterTarget}</span><span className="text-[11px] font-normal ml-1" style={{ color: THEME.text.muted }}>glasses</span></p>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={function(e) { e.stopPropagation(); haptic(); onRemoveWater(); }} aria-label="Remove water" disabled={waterGlasses <= 0} className={cn("w-8 h-8 rounded-full flex items-center justify-center active:scale-[0.93] transition-transform flex-shrink-0", waterGlasses <= 0 && "opacity-30")} style={{ backgroundColor: THEME.iconBg }}>
                <Minus className="w-3.5 h-3.5" style={{ color: THEME.semantic.hydration }} />
              </button>
              <button onClick={function(e) { e.stopPropagation(); haptic(); onAddWater(); setRippleKey(function(k) { return k + 1; }); }} aria-label="Add water" disabled={waterGlasses >= waterTarget} className={cn("w-8 h-8 rounded-full flex items-center justify-center active:scale-[0.93] transition-transform flex-shrink-0", waterGlasses >= waterTarget && "opacity-30")} style={{ backgroundColor: THEME.iconBg }}>
                <Plus className="w-3.5 h-3.5" style={{ color: THEME.semantic.hydration }} />
              </button>
            </div>
          </div>
        </div>
        {/* Weight & Steps — compact 2-col */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={function() { haptic(); onLogWeight(); }} className="p-3 rounded-xl text-left active:scale-[0.97] transition-transform" style={{ backgroundColor: THEME.neutral[100] }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: THEME.iconBg }}>
                <Scale className="w-4 h-4" style={{ color: THEME.semantic.activity }} />
              </div>
              <p className="text-[11px] uppercase tracking-[0.5px] font-medium" style={{ color: THEME.text.muted }}>Weight</p>
            </div>
            <div className="flex items-baseline gap-1">
              <p className="text-2xl font-extrabold leading-none text-foreground">
                {lastWeight ? lastWeight : "\u2014"}
              </p>
              {lastWeight && <span className="text-xs" style={{ color: THEME.text.muted }}>{weightUnit === "lbs" ? "lb" : weightUnit}</span>}
            </div>
          </button>
          <div className="p-3 rounded-xl" style={{ backgroundColor: THEME.neutral[100] }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: THEME.iconBg }}>
                <Footprints className="w-4 h-4" style={{ color: THEME.semantic.positive }} />
              </div>
              <p className="text-[11px] uppercase tracking-[0.5px] font-medium" style={{ color: THEME.text.muted }}>Steps</p>
            </div>
            <p className="text-2xl font-extrabold leading-none" style={{ color: THEME.text.muted }}>—</p>
            {/* TODO: Use "Connect Google Fit" on Android when platform detection is available */}
            <p className="text-[11px] mt-1" style={{ color: THEME.text.muted }}>Connect Apple Health</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
