import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useMeals } from "@/hooks/useMeals";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { useSubscription } from "@/lib/subscription";
import { useProgram } from "@/features/program/useProgram";
import { useWeeklyDayMap } from "@/hooks/useFirestore";
import { BadgeEarnedModal } from "@/features/streaks/BadgeEarnedModal";
import { useStreaks } from "@/features/streaks/useStreaks";
import { THEME } from "@/lib/theme";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell, ChevronRight, Sparkles, Settings as SettingsIcon, Flame, Play, Footprints, ClipboardList, X, Scale, Heart, Droplets, Plus, Target, Zap, Leaf } from "lucide-react";
import { useWaterLog } from "@/hooks/useWaterLog";
import { calculateHealthScore } from "@/lib/healthScore";
import { cn } from "@/lib/utils";
import { HomeSkeleton } from "@/components/LoadingSkeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { format } from "date-fns";
import { collection, query, where, getDocs, Timestamp, orderBy, limit as fbLimit, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getTodaySchedule, generateSchedule } from "@/lib/scheduleUtils";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ScheduledRunDay } from "@/features/program/runScheduler";

function computeStreak(wd: string[]): number {
  if (!wd.length) return 0;
  const u = [...new Set(wd)].sort().reverse();
  const t = format(new Date(), "yyyy-MM-dd");
  const y = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
  if (u[0] !== t && u[0] !== y) return 0;
  let s = 1;
  for (let i = 1; i < u.length; i++) {
    if ((new Date(u[i-1]).getTime() - new Date(u[i]).getTime()) / 86400000 === 1) s++;
    else break;
  }
  return s;
}

function WeekStrip({ dayMap, schedule, selectedDate, onDayTap }: {
  dayMap: Map<string, { workouts: number; meals: number; caloriesHit: boolean }>;
  schedule: ScheduleDay[];
  selectedDate: string | null;
  onDayTap: (dk: string) => void;
}) {
  const today = new Date();
  const sow = new Date(today);
  sow.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, function(_, i) {
    const d = new Date(sow); d.setDate(sow.getDate() + i);
    const k = format(d, "yyyy-MM-dd");
    const data = dayMap.get(k);
    const isToday = k === format(today, "yyyy-MM-dd");
    const hasAct = !!(data && (data.workouts > 0 || data.meals > 0));
    const st = schedule.find(function(s) { return s.day === i; })?.type || "rest";
    return { date: d, key: k, isToday: isToday, hasActivity: hasAct, sType: st, isSelected: k === selectedDate };
  });
  const tc = function(t: string) { return t === "lift" ? THEME.lifting : t === "run" ? THEME.running : t === "both" ? THEME.lifting : "transparent"; };
  return (
    <div className="flex items-center justify-between px-1">
      {days.map(function(day) {
        let cls = "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all";
        let st: React.CSSProperties = {};
        if (day.isToday && day.isSelected) {
          cls += " bg-primary text-primary-foreground";
          st = { boxShadow: "0 0 8px rgba(109,40,217,0.4)" };
        } else if (day.isToday) {
          cls += " text-primary";
          st = { border: "2px dashed rgba(109,40,217,1)" };
        } else if (day.isSelected) {
          cls += " text-primary";
          st = { border: "2px solid rgba(109,40,217,1)", backgroundColor: "#ede9fe" };
        } else if (day.hasActivity) {
          cls += " ring-2 ring-green-500 text-primary";
        } else {
          cls += " text-muted-foreground";
          st = { border: "2px dashed rgba(109,40,217,0.33)" };
        }
        return (
          <button key={day.key} onClick={function() { onDayTap(day.key); }} aria-label={format(day.date, "EEEE, MMMM d") + (day.hasActivity ? " (activity logged)" : "") + (day.isToday ? " (today)" : "")} className="flex flex-col items-center gap-1 transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:rounded-lg">
            <span className="text-[10px] text-muted-foreground">{format(day.date, "EEE").charAt(0)}</span>
            <div className={cls} style={st}>{day.date.getDate()}</div>
            {day.sType !== "rest" ? (
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: day.hasActivity ? THEME.success : tc(day.sType) }} />
            ) : (
              <div className="w-1.5 h-1.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function DayPeekCard({ dateKey, schedule, workouts, dailyTotals, onClose }: {
  dateKey: string;
  schedule: ScheduleDay[];
  workouts: { exercises?: { sets?: { weightKg?: number; reps?: number }[] }[] }[];
  dailyTotals: { calories: number; protein: number; carbs: number; fat: number; mealCount: number };
  onClose: () => void;
}) {
  const dow = new Date(dateKey + "T00:00:00").getDay();
  const st = schedule.find(function(s) { return s.day === dow; })?.type || "rest";
  const dayLabel = format(new Date(dateKey + "T00:00:00"), "EEE d MMM");
  const typeLabel = st === "lift" ? "Lift day" : st === "run" ? "Run day" : st === "both" ? "Lift + Run day" : "Rest day";
  const typeColor = st === "lift" ? THEME.lifting : st === "run" ? THEME.running : st === "both" ? THEME.lifting : THEME.textMuted;
  let tonnage = 0;
  workouts.forEach(function(w) {
    (w.exercises || []).forEach(function(ex) {
      (ex.sets || []).forEach(function(s) {
        tonnage += (s.weightKg || 0) * (s.reps || 0);
      });
    });
  });
  const hasW = workouts.length > 0;
  const hasM = dailyTotals.mealCount > 0;
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
      <div className="pt-3 pb-1 px-1">
        <div className="rounded-xl bg-muted/50 border border-border/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">{dayLabel}</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: typeColor + "18", color: typeColor }}>{typeLabel}</span>
            </div>
            <button onClick={onClose} aria-label="Close day details" className="p-0.5 rounded hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-primary">
              <X aria-hidden="true" className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          {(hasW || hasM) ? (
            <div className="flex items-center gap-4 text-[11px]">
              {hasW && (
                <div className="flex items-center gap-1.5">
                  <Dumbbell className="w-3.5 h-3.5" style={{ color: THEME.lifting }} />
                  <span className="text-foreground">
                    {workouts.length} session{workouts.length !== 1 ? "s" : ""}
                    {tonnage > 0 && (
                      <span className="text-muted-foreground">
                        {" \u00B7 "}{tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + "k kg" : Math.round(tonnage) + "kg"}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {hasM && (
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" style={{ color: THEME.success }} />
                  <span className="text-foreground">{dailyTotals.calories} cal {"\u00B7"} {dailyTotals.protein}g prot</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">No activity logged</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StackedCTACards({ nextWorkout, todayType, navigate, waterGlasses, waterTarget, onAddWater, lastWeight, lastWeightDate, weightUnit, onLogWeight, todayRun, healthScore }: {
  nextWorkout: { dayName: string; dayType: string; exercises: { name: string }[] } | null;
  todayType: "lift" | "run" | "both" | "rest";
  navigate: (p: string) => void;
  waterGlasses: number;
  waterTarget: number;
  onAddWater: () => void;
  lastWeight: string | null;
  lastWeightDate: string | null;
  weightUnit: string;
  onLogWeight: () => void;
  todayRun: ScheduledRunDay | null;
  healthScore: number | null;
}) {
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
          onClick={function() { navigate("/program"); }}
          className="w-full p-5 rounded-2xl bg-card border border-border/50 text-left active:scale-[0.99]"
          style={{ background: "linear-gradient(135deg, " + THEME.lifting + "12 0%, transparent 60%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.lifting + "20" }}>
              <Dumbbell className="w-5 h-5" style={{ color: THEME.lifting }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Today {"\u00B7"} Lift day</p>
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
          onClick={function() { navigate("/run" + templateParam); }}
          className="w-full p-5 rounded-2xl bg-card border border-border/50 text-left active:scale-[0.99]"
          style={{ background: "linear-gradient(135deg, " + THEME.running + "12 0%, transparent 60%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.running + "20" }}>
              {runIcon ? <span className="text-xl">{runIcon}</span> : <Footprints className="w-5 h-5" style={{ color: THEME.running }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Today {"\u00B7"} Run day</p>
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
        <Link to="/log" className="flex-1 p-4 rounded-2xl bg-card border border-border/50 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.lifting + "20" }}><Dumbbell className="w-5 h-5" style={{ color: THEME.lifting }} /></div>
          <span className="text-xs font-medium text-foreground">Log Workout</span>
        </Link>
        <Link to="/run" className="flex-1 p-4 rounded-2xl bg-card border border-border/50 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.running + "20" }}><Footprints className="w-5 h-5" style={{ color: THEME.running }} /></div>
          <span className="text-xs font-medium text-foreground">Start Run</span>
        </Link>
        <Link to="/log" className="flex-1 p-4 rounded-2xl bg-card border border-border/50 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.success + "20" }}><ClipboardList className="w-5 h-5" style={{ color: THEME.success }} /></div>
          <span className="text-xs font-medium text-foreground">Log Food</span>
        </Link>
      </motion.div>
      <motion.div key="qt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
        className="p-4 rounded-2xl bg-card border border-border/50">
        <div className="grid grid-cols-2 gap-3">
          {/* Health Score */}
          <Link to="/history?tab=health" className="flex items-center gap-2.5 p-3 rounded-xl" style={{ backgroundColor: "rgba(236,72,153,0.06)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(236,72,153,0.10)" }}>
              <Heart className="w-4 h-4 text-pink-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Health</p>
              {healthScore != null ? (
                <p className={cn("text-sm font-bold", healthScore >= 80 ? "text-green-500" : healthScore >= 60 ? "text-amber-500" : "text-red-500")}>
                  {healthScore}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">--</p>
              )}
            </div>
          </Link>
          {/* Water */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl" style={{ backgroundColor: "rgba(59,130,246,0.06)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(59,130,246,0.10)" }}>
              <Droplets className="w-4 h-4 text-blue-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Water</p>
              <p className="text-sm font-bold text-foreground">{waterGlasses}/{waterTarget}</p>
            </div>
            <button onClick={function(e) { e.stopPropagation(); onAddWater(); }} className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform flex-shrink-0" style={{ backgroundColor: "rgba(59,130,246,0.10)" }}>
              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </button>
          </div>
          {/* Weight */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl" style={{ backgroundColor: "rgba(139,92,246,0.06)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(139,92,246,0.10)" }}>
              <Scale className="w-4 h-4 text-purple-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Weight</p>
              <p className={cn("text-muted-foreground truncate", lastWeight && (lastWeight + " " + (weightUnit === "lbs" ? "lb" : weightUnit)).length > 7 ? "text-[10px]" : "text-xs")}>
                {lastWeight ? lastWeight + " " + (weightUnit === "lbs" ? "lb" : weightUnit) : "Log"}
              </p>
              {lastWeightDate && (
                <p className="text-[10px] text-muted-foreground/60">{lastWeightDate}</p>
              )}
            </div>
            <button onClick={function(e) { e.stopPropagation(); onLogWeight(); }} className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform flex-shrink-0" style={{ backgroundColor: "rgba(139,92,246,0.10)" }}>
              <Plus className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            </button>
          </div>
          {/* Steps */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl" style={{ backgroundColor: "rgba(34,197,94,0.06)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(34,197,94,0.10)" }}>
              <Footprints className="w-4 h-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Steps</p>
              <p className="text-xs text-muted-foreground">—</p>
              <p className="text-[10px] text-muted-foreground/60">Connect in app</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Improved WeeklySnapshotCompact with tinted stat pills ────────────────────
function WeeklySnapshotCompact({ liftSessions, runSessions, liftTonnage, runKm, adherenceScore }: {
  liftSessions: number; runSessions: number; liftTonnage: number; runKm: number; adherenceScore: number | null;
}) {
  const allZero = liftSessions === 0 && runSessions === 0 && liftTonnage === 0 && runKm === 0 && adherenceScore == null;
  const stats = [
    { label: "Sessions", value: String(liftSessions + runSessions), color: THEME.brand },
    { label: "Volume", value: liftTonnage >= 1000 ? (liftTonnage / 1000).toFixed(1) + "k kg" : Math.round(liftTonnage) + "kg", color: THEME.lifting },
    { label: "Distance", value: runKm.toFixed(1) + "km", color: THEME.running },
    { label: "Adherence", value: adherenceScore != null ? adherenceScore + "%" : "\u2014", color: THEME.success },
  ];
  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3">This Week</p>
      {allZero ? (
        <div className="text-center py-4 space-y-1.5 bg-gradient-to-br from-muted/30 to-transparent rounded-xl">
          <p className="text-lg"><Target size={24} className="text-purple-500" /></p>
          <p className="text-sm font-semibold text-foreground">Fresh week</p>
          <p className="text-[11px] text-muted-foreground">Log a workout or run to see your weekly stats</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {stats.map(function(s) {
            return (
              <div key={s.label} className="text-center p-2 rounded-xl" style={{ background: s.color + "10" }}>
                <p className="text-base font-bold font-mono tabular-nums leading-none" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{s.label}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InsightStrip({ title, bullet, loadBand }: { title: string; bullet: string; loadBand: string }) {
  const icon = loadBand === "overreach" ? <Flame size={20} className="text-orange-500" /> : loadBand === "high" ? <Zap size={20} className="text-yellow-500" /> : loadBand === "moderate" ? <Dumbbell size={20} className="text-orange-500" /> : <Leaf size={20} className="text-green-400" />;
  return (
    <Link to="/history?tab=performance">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="p-4 rounded-2xl bg-card border border-border/50 flex items-start gap-3 active:scale-[0.99]">
        <span className="mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{bullet}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <span className="text-[10px] text-primary font-medium">Details</span>
          <ChevronRight className="w-3.5 h-3.5 text-primary" />
        </div>
      </motion.div>
    </Link>
  );
}

// ── Improved TodayIntake with macro rings ────────────────────────────────────
function MacroRing({ value, target, color, label, unit = "" }: {
  value: number; target: number; color: string; label: string; unit?: string;
}) {
  const size = 68;
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / Math.max(target, 1), 1);
  const done = pct >= 0.98;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color + "18"} strokeWidth="4.5" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={done ? THEME.success : color}
            strokeWidth="4.5" strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.5s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold font-mono tabular-nums leading-none text-foreground">
            {Math.round(value)}{unit}
          </span>
          {done && <span className="text-[8px]" style={{ color: THEME.success }}>✓</span>}
        </div>
      </div>
      <div className="text-center">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground/50">{target}{unit}</p>
      </div>
    </div>
  );
}

function TodayIntake({ calories, protein, targetCalories: initCal, targetProtein: initProt }: {
  calories: number; protein: number; targetCalories: number; targetProtein: number;
}) {
  const tCal = initCal > 0 ? initCal : 2200;
  const tProt = initProt > 0 ? initProt : 160;
  const tCarbs = Math.round((tCal * 0.45) / 4);
  const tFat = Math.round((tCal * 0.28) / 9);
  // Estimate carbs/fat from remaining calories after protein
  const proteinCal = protein * 4;
  const remaining = Math.max(calories - proteinCal, 0);
  const estimatedCarbs = Math.round((remaining * 0.62) / 4);
  const estimatedFat = Math.round((remaining * 0.38) / 9);
  const calPct = Math.min((calories / tCal) * 100, 100);
  const caloriesLeft = Math.max(tCal - calories, 0);

  return (
    <Link to="/log" state={{ tab: 'food' }}>
      <div className="rounded-2xl bg-card border border-border/50 overflow-hidden active:scale-[0.99] transition-transform">
        {/* Calorie header */}
        <div className="px-4 pt-4 pb-3 border-b border-border/30"
          style={{ background: "linear-gradient(135deg, " + THEME.warning + "08 0%, transparent 70%)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Today's Intake</p>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="flex items-baseline gap-2 mb-2.5">
            <span className="text-3xl font-bold font-mono tabular-nums leading-none" style={{ color: THEME.warning }}>
              {(calories || 0).toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">/ {tCal.toLocaleString()} kcal</span>
            {caloriesLeft > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">{caloriesLeft} left</span>
            )}
          </div>
          <div className="h-2 rounded-full overflow-hidden bg-muted">
            <motion.div initial={{ width: 0 }} animate={{ width: calPct + "%" }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: calPct >= 98 ? THEME.success : "linear-gradient(90deg, " + THEME.warning + ", " + THEME.running + ")" }} />
          </div>
        </div>
        {/* Macro rings */}
        <div className="flex items-center justify-around px-4 py-4">
          <MacroRing value={protein} target={tProt} color={THEME.teal} label="Protein" unit="g" />
          <MacroRing value={estimatedCarbs} target={tCarbs} color={THEME.brand} label="Carbs" unit="g" />
          <MacroRing value={estimatedFat} target={tFat} color={THEME.warning} label="Fat" unit="g" />
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const { user, profile, updateProfile } = useAuth();
  const { workouts, getWorkoutsForDate } = useWorkouts();
  const { getDailyTotals } = useMeals();
  const { currentWeek: perfDoc } = usePerformanceWeeks();
  const { isPro, isInTrial, trialDaysLeft } = useSubscription();
  const { programState, loading: programLoading } = useProgram();
  const weeklyDayMap = useWeeklyDayMap();
  const navigate = useNavigate();
  const { newBadge, dismissNewBadge } = useStreaks();
  const { glasses: waterGlasses, target: waterTarget, logWater } = useWaterLog();
  const [lastWeightInfo, setLastWeightInfo] = useState<{ weight: string; date: string } | null>(null);
  const [showWeightSheet, setShowWeightSheet] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [proUpsellDismissed, setProUpsellDismissed] = useState(false);

  const schedule = useMemo<ScheduleDay[]>(function() {
    if (profile?.weekSchedule && profile.weekSchedule.length === 7) return profile.weekSchedule;
    return generateSchedule(profile?.weeklyWorkoutsTarget || 3, profile?.weeklyRunsTarget || 2);
  }, [profile?.weekSchedule, profile?.weeklyWorkoutsTarget, profile?.weeklyRunsTarget]);

  const todayType = (getTodaySchedule(schedule)?.type || "rest") as "lift" | "run" | "both" | "rest";
  const streak = useMemo(function() { return computeStreak(workouts.map(function(w) { return w.date; })); }, [workouts]);

  useEffect(function() {
    if (profile && streak !== profile.currentStreak) updateProfile({ currentStreak: streak });
  }, [streak, profile, updateProfile]);

  const [dailyCal, setDailyCal] = useState(0);
  const [dailyProt, setDailyProt] = useState(0);

  useEffect(function() {
    if (!user?.uid) return;
    (async function() {
      try {
        const ts = new Date();
        ts.setHours(0, 0, 0, 0);
        const snap = await getDocs(query(collection(db, "users", user.uid, "meals"), where("createdAt", ">=", Timestamp.fromDate(ts))));
        let c = 0; let p = 0;
        snap.forEach(function(d) { const dd = d.data(); c += dd.totalCalories || dd.calories || 0; p += dd.totalProtein || dd.protein || 0; });
        setDailyCal(c); setDailyProt(p);
      } catch (e) { console.error(e); }
    })();
  }, [user]);

  const weightUnit = profile?.preferredWeightUnit || "kg";

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const todayTotals = getDailyTotals(todayKey);
  const todayWorkoutCount = useMemo(function() {
    const tk = format(new Date(), "yyyy-MM-dd");
    return workouts.filter(function(w) { return w.date === tk; }).length;
  }, [workouts]);

  const healthScoreResult = useMemo(function() {
    return calculateHealthScore(
      {
        calories: todayTotals.calories,
        protein: todayTotals.protein,
        fiber: todayTotals.fiber,
        sugar: todayTotals.sugar,
        sodium: todayTotals.sodium,
        mealCount: todayTotals.mealCount,
      },
      {
        calories: profile?.targetCalories || 2200,
        protein: profile?.targetProtein || 160,
        fiber: profile?.targetFiber || 30,
        sugar: profile?.targetSugar || 30,
        sodium: profile?.targetSodium || 2300,
      },
      {
        workoutsToday: todayWorkoutCount,
        waterGlasses: waterGlasses,
        waterTarget: waterTarget,
      }
    );
  }, [todayTotals, profile, todayWorkoutCount, waterGlasses, waterTarget]);
  const healthScore = healthScoreResult.score;

  useEffect(function() {
    if (!user?.uid) return;
    getDocs(query(collection(db, "users", user.uid, "bodyweightLogs"), orderBy("date", "desc"), fbLimit(1))).then(function(snap) {
      if (snap.empty) {
        if (profile?.weightKg) {
          const w = weightUnit === "lbs" ? (profile.weightKg * 2.20462).toFixed(1) : profile.weightKg.toFixed(1);
          setLastWeightInfo({ weight: w, date: "From profile" });
        }
        return;
      }
      const d = snap.docs[0].data();
      if (typeof d.weight === "number") {
        const w = weightUnit === "lbs" ? (d.weight * 2.20462).toFixed(1) : d.weight.toFixed(1);
        setLastWeightInfo({ weight: w, date: format(new Date(d.date + "T12:00:00"), "MMM d") });
      }
    }).catch(function() {});
  }, [user, weightUnit, profile?.weightKg]);

  const handleLogWeight = async function() {
    if (!weightInput || !user) return;
    setWeightSaving(true);
    try {
      const raw = Number(weightInput);
      const storeW = weightUnit === "lbs" ? raw / 2.20462 : raw;
      const today = format(new Date(), "yyyy-MM-dd");
      await addDoc(collection(db, "users", user.uid, "bodyweightLogs"), { date: today, weight: storeW, createdAt: serverTimestamp() });
      const disp = weightUnit === "lbs" ? (storeW * 2.20462).toFixed(1) : storeW.toFixed(1);
      setLastWeightInfo({ weight: disp, date: format(new Date(), "MMM d") });
      setWeightInput(""); setShowWeightSheet(false);
    } catch (e) { console.error(e); }
    setWeightSaving(false);
  };

  const [peekDate, setPeekDate] = useState<string | null>(null);
  const handleDayTap = useCallback(function(dk: string) { setPeekDate(function(p) { return p === dk ? null : dk; }); }, []);
  const peekW = useMemo(function() { return peekDate ? getWorkoutsForDate(peekDate) : []; }, [peekDate, getWorkoutsForDate]);
  const peekT = useMemo(function() { return peekDate ? getDailyTotals(peekDate) : { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 }; }, [peekDate, getDailyTotals]);
  const nextWorkout = programState?.workouts?.find(function(d) { return !d.completed; }) || null;

  // Find today's scheduled run (if any)
  const todayDayIndex = new Date().getDay(); // 0=Sun, 6=Sat
  const todayRun = useMemo(function() {
    if (!programState?.runDays) return null;
    const rd = programState.runDays.find(function(r) { return r.dayIndex === todayDayIndex && !r.completed; });
    return rd || null;
  }, [programState?.runDays, todayDayIndex]);

  const [snapData, setSnapData] = useState({ ls: 0, rs: 0, lt: 0, rk: 0, ad: null as number | null });

  useEffect(function() {
    if (perfDoc) {
      const agg = perfDoc.aggregates || { liftSessions: 0, runSessions: 0, liftTonnage: 0, runKm: 0 };
      setSnapData({ ls: agg.liftSessions || 0, rs: agg.runSessions || 0, lt: agg.liftTonnage || 0, rk: agg.runKm || 0, ad: perfDoc.adherenceScore ?? null });
      return;
    }
    const now = new Date();
    const ws = new Date(now); ws.setDate(now.getDate() - now.getDay()); ws.setHours(0, 0, 0, 0);
    const ww = workouts.filter(function(w) { return new Date(w.date) >= ws; });
    let t = 0;
    ww.forEach(function(w) { w.exercises?.forEach(function(ex) { ex.sets?.forEach(function(s) { t += (s.weightKg || 0) * (s.reps || 0); }); }); });
    if (!user?.uid) { setSnapData({ ls: ww.length, rs: 0, lt: t, rk: 0, ad: null }); return; }
    const startTs = Timestamp.fromDate(ws);
    const endTs = Timestamp.fromDate(new Date(now.getTime() + 86400000));
    getDocs(query(collection(db, "users", user.uid, "runs"), where("completedAt", ">=", startTs), where("completedAt", "<=", endTs))).then(function(snap) {
      let rc = 0; let km = 0;
      snap.docs.forEach(function(d) { rc++; km += ((d.data().distance || 0) / 1000); });
      setSnapData({ ls: ww.length, rs: rc, lt: t, rk: Math.round(km * 10) / 10, ad: null });
    }).catch(function() { setSnapData({ ls: ww.length, rs: 0, lt: t, rk: 0, ad: null }); });
  }, [perfDoc, workouts, user]);

  if (!profile) return <HomeSkeleton />;

  return (
    <motion.div className="flex flex-col gap-4 pb-6" initial="hidden" animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }} className="flex items-center justify-between pt-2 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#9b6ff7"/>
                  <stop offset="100%" stopColor="#7c3aed"/>
                </linearGradient>
              </defs>
              <polygon points="512,152 780,305 780,611 512,764 244,611 244,305" fill="url(#hexGrad)"/>
              <polygon points="512,290 640,480 600,480 512,330 424,480 384,480" fill="white"/>
            </svg>
            <span className="text-lg font-extrabold tracking-wider text-gray-900 dark:text-gray-100 uppercase">TROPOS</span>
          </div>
          <span className="text-sm text-gray-400 mt-0.5">
            {programState ? "Week " + programState.weekNumber + " \u00B7 " + programState.currentPhase + " phase" : "Let's put in work today."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <motion.div key={streak}
            initial={[7, 30, 100, 365].includes(streak) ? { scale: 1.2 } : undefined}
            animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300 }}
            className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full", streak > 0 ? "bg-orange-50 dark:bg-orange-950/30" : "bg-muted")}>
            <Flame className={cn("w-3.5 h-3.5", streak > 0 ? "text-orange-500" : "text-muted-foreground")} />
            <span className={cn("text-sm font-bold", streak > 0 ? "text-orange-500" : "text-muted-foreground")}>
              {streak >= 1000 ? Math.floor(streak / 100) / 10 + "k" : streak}
            </span>
          </motion.div>
          <Link to="/settings" aria-label="Settings" className="p-2 rounded-lg hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:rounded-lg">
            <SettingsIcon aria-hidden="true" className="w-5 h-5 text-muted-foreground" />
          </Link>
        </div>
      </motion.div>

      {isInTrial && (
        <motion.div variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } } }} className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
          <Sparkles className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Pro Trial &mdash; {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left</p>
            <p className="text-xs text-muted-foreground">Full access to all features.</p>
          </div>
        </motion.div>
      )}

      {/* Streak at-risk nudge — show when streak > 2 and nothing logged today */}
      {streak >= 3 && !weeklyDayMap.get(format(new Date(), "yyyy-MM-dd"))?.workouts && !weeklyDayMap.get(format(new Date(), "yyyy-MM-dd"))?.meals && dailyCal === 0 && (
        <motion.div
          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
          className="flex items-center gap-3 p-3 rounded-xl border"
          style={{ background: "rgba(249,115,22,0.08)", borderColor: "rgba(249,115,22,0.2)" }}>
          <Flame className="w-5 h-5 text-orange-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-500">{streak}-day streak at risk</p>
            <p className="text-xs text-muted-foreground">Log a workout, run or meal to keep it alive.</p>
          </div>
        </motion.div>
      )}

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }} className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <WeekStrip dayMap={weeklyDayMap} schedule={schedule} selectedDate={peekDate} onDayTap={handleDayTap} />
        <div className="flex items-center justify-center gap-4 pt-1">
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: THEME.lifting }} /><span className="text-[9px] text-muted-foreground">Lift</span></div>
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: THEME.running }} /><span className="text-[9px] text-muted-foreground">Run</span></div>
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: THEME.success }} /><span className="text-[9px] text-muted-foreground">Done</span></div>
        </div>
        <AnimatePresence>
          {peekDate && <DayPeekCard dateKey={peekDate} schedule={schedule} workouts={peekW} dailyTotals={peekT} onClose={function() { setPeekDate(null); }} />}
        </AnimatePresence>
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
        {programLoading ? <div className="h-20 rounded-2xl bg-muted animate-pulse" /> : (
          <StackedCTACards nextWorkout={nextWorkout} todayType={todayType} navigate={navigate}
            waterGlasses={waterGlasses} waterTarget={waterTarget} onAddWater={function() { logWater(1); }}
            lastWeight={lastWeightInfo?.weight || null} lastWeightDate={lastWeightInfo?.date || null}
            weightUnit={weightUnit} onLogWeight={function() { setShowWeightSheet(true); }} todayRun={todayRun} healthScore={healthScore} />
        )}
      </motion.div>

      {(snapData.ls > 0 || snapData.rs > 0 || snapData.lt > 0 || snapData.rk > 0) && (
        <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
          <WeeklySnapshotCompact liftSessions={snapData.ls} runSessions={snapData.rs} liftTonnage={snapData.lt} runKm={snapData.rk} adherenceScore={snapData.ad} />
        </motion.div>
      )}

      {perfDoc && perfDoc.insight && (
        <InsightStrip title={perfDoc.insight.title} bullet={perfDoc.insight.bullets[0] || ""} loadBand={perfDoc.loadBand} />
      )}

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
        <SectionErrorBoundary sectionName="today-intake">
          <TodayIntake calories={dailyCal} protein={dailyProt} targetCalories={profile.targetCalories || 2200} targetProtein={profile.targetProtein || 160} />
        </SectionErrorBoundary>
      </motion.div>

      {!isPro && !proUpsellDismissed && (
        <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }} className="p-3 rounded-2xl bg-card border border-border/50 text-center space-y-1 relative">
          <button onClick={function() { setProUpsellDismissed(true); }} aria-label="Dismiss" className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <p className="text-sm font-medium text-foreground">Unlock AI Photo Logging &amp; Performance Engine</p>
          <p className="text-xs text-muted-foreground">Upgrade to Pro &mdash; from just &pound;2.99/mo</p>
        </motion.div>
      )}

      {/* Weight Log Bottom Sheet */}
      <AnimatePresence>
        {showWeightSheet && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={function() { setShowWeightSheet(false); }} className="fixed inset-0 bg-black/40 z-40" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl safe-area-pb bg-card border-t border-border/50" style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
              <div className="max-w-md mx-auto p-5 space-y-4">
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-foreground">Log Weight</p>
                  <button onClick={function() { setShowWeightSheet(false); }} aria-label="Close weight log" className="p-1 rounded hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"><X aria-hidden="true" className="w-4 h-4 text-muted-foreground" /></button>
                </div>
                <div className="flex gap-3">
                  <input type="number" step="0.1" value={weightInput} onChange={function(e) { setWeightInput(e.target.value); }} placeholder={"Weight in " + weightUnit} aria-label={"Body weight in " + weightUnit} className="flex-1 px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <button onClick={handleLogWeight} disabled={!weightInput || weightSaving} className={cn("px-6 py-3 rounded-xl font-medium text-sm transition-all", weightInput ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground", (!weightInput || weightSaving) && "opacity-50 cursor-not-allowed")}>
                    {weightSaving ? "..." : "Log"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BadgeEarnedModal badge={newBadge} onDismiss={dismissNewBadge} />
    </motion.div>
  );
}
