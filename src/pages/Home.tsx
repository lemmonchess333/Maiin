import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useMeals } from "@/hooks/useMeals";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { useSubscription } from "@/lib/subscription";
import { useProgram } from "@/features/program/useProgram";
import { useWeeklyDayMap } from "@/hooks/useFirestore";
import BodyweightLogger from "@/components/BodyweightLogger";
import { WaterTracker } from "@/components/nutrition/WaterTracker";
import { HealthScoreCard } from "@/components/nutrition/HealthScoreCard";
import { BadgeEarnedModal } from "@/features/streaks/BadgeEarnedModal";
import { useStreaks } from "@/features/streaks/useStreaks";
import { THEME } from "@/lib/theme";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell, ChevronRight, ChevronLeft, Sparkles, Settings as SettingsIcon, Flame, Play, Footprints, ClipboardList, X } from "lucide-react";
import { format } from "date-fns";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getTodaySchedule, generateSchedule } from "@/lib/scheduleUtils";
import type { ScheduleDay } from "@/lib/scheduleUtils";

function computeStreak(wd: string[]): number {
  if (!wd.length) return 0;
  var u = [...new Set(wd)].sort().reverse();
  var t = format(new Date(), "yyyy-MM-dd");
  var y = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
  if (u[0] !== t && u[0] !== y) return 0;
  var s = 1;
  for (var i = 1; i < u.length; i++) {
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
  var today = new Date();
  var sow = new Date(today);
  sow.setDate(today.getDate() - today.getDay());
  var days = Array.from({ length: 7 }, function(_, i) {
    var d = new Date(sow); d.setDate(sow.getDate() + i);
    var k = format(d, "yyyy-MM-dd");
    var data = dayMap.get(k);
    var isToday = k === format(today, "yyyy-MM-dd");
    var hasAct = !!(data && (data.workouts > 0 || data.meals > 0));
    var st = schedule.find(function(s) { return s.day === i; })?.type || "rest";
    return { date: d, key: k, isToday: isToday, hasActivity: hasAct, sType: st, isSelected: k === selectedDate };
  });
  var tc = function(t: string) { return t === "lift" ? THEME.lifting : t === "run" ? THEME.running : "transparent"; };
  return (
    <div className="flex items-center justify-between px-1">
      {days.map(function(day) {
        var cls = "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all";
        if (day.isSelected && !day.isToday) cls += " ring-2 ring-primary ring-offset-1 ring-offset-card";
        if (day.isToday) cls += " bg-primary text-primary-foreground";
        else if (day.hasActivity) cls += " bg-primary/15 text-primary";
        else cls += " text-muted-foreground";
        return (
          <button key={day.key} onClick={function() { onDayTap(day.key); }} className="flex flex-col items-center gap-1 transition-transform active:scale-90">
            <span className="text-[10px] text-muted-foreground">{format(day.date, "EEE").charAt(0)}</span>
            <div className={cls}>{day.date.getDate()}</div>
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
  workouts: any[];
  dailyTotals: { calories: number; protein: number; carbs: number; fat: number; mealCount: number };
  onClose: () => void;
}) {
  var dow = new Date(dateKey + "T00:00:00").getDay();
  var st = schedule.find(function(s) { return s.day === dow; })?.type || "rest";
  var dayLabel = format(new Date(dateKey + "T00:00:00"), "EEE d MMM");
  var typeLabel = st === "lift" ? "Lift day" : st === "run" ? "Run day" : "Rest day";
  var typeColor = st === "lift" ? THEME.lifting : st === "run" ? THEME.running : THEME.textMuted;
  var tonnage = 0;
  workouts.forEach(function(w: any) {
    (w.exercises || []).forEach(function(ex: any) {
      (ex.sets || []).forEach(function(s: any) {
        tonnage += (s.weightKg || 0) * (s.reps || 0);
      });
    });
  });
  var hasW = workouts.length > 0;
  var hasM = dailyTotals.mealCount > 0;
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
      <div className="pt-3 pb-1 px-1">
        <div className="rounded-xl bg-muted/50 border border-border/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">{dayLabel}</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: typeColor + "18", color: typeColor }}>{typeLabel}</span>
            </div>
            <button onClick={onClose} className="p-0.5 rounded hover:bg-muted transition-colors">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
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
                        {" \u00B7 "}{tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + "t" : Math.round(tonnage) + "kg"}
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

function CyclingCTACard({ nextWorkout, todayType, navigate }: {
  nextWorkout: { dayName: string; dayType: string; exercises: { name: string }[] } | null;
  todayType: "lift" | "run" | "rest";
  navigate: (p: string) => void;
}) {
  var [ci, setCi] = useState(0);
  var cards = useMemo(function() {
    var r: { id: string; type: "scheduled" | "actions" }[] = [];
    if (todayType === "lift" && nextWorkout) r.push({ id: "workout", type: "scheduled" });
    else if (todayType === "run") r.push({ id: "run", type: "scheduled" });
    r.push({ id: "actions", type: "actions" });
    return r;
  }, [todayType, nextWorkout]);
  var cc = cards[ci % cards.length];
  var hasMulti = cards.length > 1;
  var swipe = function(d: number) {
    setCi(function(p) { var n = p + d; return n < 0 ? cards.length - 1 : n % cards.length; });
  };

  return (
    <div>
      <AnimatePresence mode="wait">
        {cc?.type === "scheduled" && cc.id === "workout" && nextWorkout && (
          <motion.button key="w" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }}
            onClick={function() { navigate("/program"); }}
            className="w-full p-5 rounded-2xl border border-border/50 text-left active:scale-[0.99]"
            style={{ background: "linear-gradient(135deg, " + THEME.lifting + "12 0%, transparent 60%)", borderColor: THEME.lifting + "30" }}>
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
        {cc?.type === "scheduled" && cc.id === "run" && (
          <motion.button key="r" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }}
            onClick={function() { navigate("/run"); }}
            className="w-full p-5 rounded-2xl border border-border/50 text-left active:scale-[0.99]"
            style={{ background: "linear-gradient(135deg, " + THEME.running + "12 0%, transparent 60%)", borderColor: THEME.running + "30" }}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.running + "20" }}>
                <Footprints className="w-5 h-5" style={{ color: THEME.running }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Today {"\u00B7"} Run day</p>
                <p className="text-sm font-semibold text-foreground">Start a run</p>
                <p className="text-[11px] text-muted-foreground">Easy run, tempo, or intervals</p>
              </div>
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold" style={{ backgroundColor: THEME.running, color: "#fff" }}>
                <Play className="w-3.5 h-3.5" />Go
              </div>
            </div>
          </motion.button>
        )}
        {cc?.type === "actions" && (
          <motion.div key="a" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }} className="flex gap-2">
            <Link to="/program" className="flex-1 p-4 rounded-2xl bg-card border border-border/50 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform" style={{ borderLeftWidth: 4, borderLeftColor: THEME.lifting }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.lifting + "20" }}><Dumbbell className="w-5 h-5" style={{ color: THEME.lifting }} /></div>
              <span className="text-xs font-medium text-foreground">Log Workout</span>
            </Link>
            <Link to="/run" className="flex-1 p-4 rounded-2xl bg-card border border-border/50 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform" style={{ borderLeftWidth: 4, borderLeftColor: THEME.running }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.running + "20" }}><Footprints className="w-5 h-5" style={{ color: THEME.running }} /></div>
              <span className="text-xs font-medium text-foreground">Start Run</span>
            </Link>
            <Link to="/log" className="flex-1 p-4 rounded-2xl bg-card border border-border/50 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform" style={{ borderLeftWidth: 4, borderLeftColor: THEME.success }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.success + "20" }}><ClipboardList className="w-5 h-5" style={{ color: THEME.success }} /></div>
              <span className="text-xs font-medium text-foreground">Log Food</span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
      {hasMulti && (
        <div className="flex items-center justify-center gap-3 mt-2">
          <button onClick={function() { swipe(-1); }} className="p-1 rounded-full hover:bg-muted"><ChevronLeft className="w-4 h-4 text-muted-foreground" /></button>
          <div className="flex gap-1.5">
            {cards.map(function(_, i) {
              return <div key={i} className={"w-1.5 h-1.5 rounded-full transition-all " + (i === ci % cards.length ? "bg-primary w-3" : "bg-muted-foreground/30")} />;
            })}
          </div>
          <button onClick={function() { swipe(1); }} className="p-1 rounded-full hover:bg-muted"><ChevronRight className="w-4 h-4 text-muted-foreground" /></button>
        </div>
      )}
    </div>
  );
}

function WeeklySnapshotCompact({ liftSessions, runSessions, liftTonnage, runKm, adherenceScore }: {
  liftSessions: number; runSessions: number; liftTonnage: number; runKm: number; adherenceScore: number | null;
}) {
  var allZero = liftSessions === 0 && runSessions === 0 && liftTonnage === 0 && runKm === 0 && adherenceScore == null;
  var stats = [
    { label: "Sessions", value: String(liftSessions + runSessions), color: THEME.brand },
    { label: "Tonnage", value: liftTonnage >= 1000 ? (liftTonnage / 1000).toFixed(1) + "t" : Math.round(liftTonnage) + "kg", color: THEME.lifting },
    { label: "Distance", value: runKm.toFixed(1) + "km", color: THEME.running },
    { label: "Adherence", value: adherenceScore != null ? adherenceScore + "%" : "\u2014", color: THEME.success },
  ];
  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">This Week</p>
      {allZero ? (
        <div className="text-center py-4 space-y-1.5 bg-gradient-to-br from-muted/30 to-transparent rounded-xl">
          <p className="text-lg">🎯</p>
          <p className="text-sm font-semibold text-foreground">Fresh week</p>
          <p className="text-[11px] text-muted-foreground">Log a workout or run to see your weekly stats</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {stats.map(function(s) {
            return (
              <div key={s.label} className="text-center">
                <p className="text-lg font-bold font-mono tabular-nums" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InsightStrip({ title, bullet, loadBand }: { title: string; bullet: string; loadBand: string }) {
  var emoji = loadBand === "overreach" ? "\uD83D\uDD25" : loadBand === "high" ? "\u26A1" : loadBand === "moderate" ? "\uD83D\uDCAA" : "\uD83C\uDF31";
  return (
    <Link to="/history?tab=performance">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="p-4 rounded-2xl bg-card border border-border/50 flex items-start gap-3 active:scale-[0.99]">
        <span className="text-lg mt-0.5">{emoji}</span>
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

function TodayIntake({ calories, protein, targetCalories: initCal, targetProtein: initProt }: {
  calories: number; protein: number; targetCalories: number; targetProtein: number;
}) {
  var tCal = initCal;
  var tProt = initProt;
  if (tCal <= 0 && tProt <= 0) { tCal = 2200; tProt = 160; }
  var bars = [
    { label: "Calories", current: calories, target: tCal || 2200, unit: "", color: THEME.warning },
    { label: "Protein", current: protein, target: tProt || 160, unit: "g", color: THEME.teal },
  ];
  return (
    <Link to="/log">
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2.5 active:scale-[0.99]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Today's Intake</p>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        {bars.map(function(b) {
          var rawPct = b.target > 0 ? (b.current / b.target) * 100 : 0;
          var pct = Math.min(rawPct, 100);
          var barColor = rawPct > 120 ? "#f59e0b" : rawPct > 100 ? "#22c55e" : b.color;
          return (
            <div key={b.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{b.label}</span>
                <span className="text-[11px] font-mono tabular-nums text-foreground">{b.current}{b.unit} / {b.target}{b.unit}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: (rawPct > 100 ? 100 : Math.max(pct, b.current > 0 ? 2 : 0)) + "%" }} transition={{ duration: 0.6, ease: "easeOut" }} className="h-full rounded-full" style={{ backgroundColor: barColor, minWidth: b.current > 0 ? 4 : 0 }} />
              </div>
            </div>
          );
        })}
      </div>
    </Link>
  );
}

export default function Home() {
  var { user, profile, updateProfile } = useAuth();
  var { workouts, getWorkoutsForDate } = useWorkouts();
  var { getDailyTotals } = useMeals();
  var { currentWeek: perfDoc } = usePerformanceWeeks();
  var { isPro, isInTrial, trialDaysLeft } = useSubscription();
  var { programState, loading: programLoading } = useProgram();
  var weeklyDayMap = useWeeklyDayMap();
  var navigate = useNavigate();
  var { newBadge, dismissNewBadge } = useStreaks();

  var schedule = useMemo<ScheduleDay[]>(function() {
    if (profile?.weekSchedule && profile.weekSchedule.length === 7) return profile.weekSchedule;
    return generateSchedule(profile?.weeklyWorkoutsTarget || 3, profile?.weeklyRunsTarget || 2);
  }, [profile?.weekSchedule, profile?.weeklyWorkoutsTarget, profile?.weeklyRunsTarget]);

  var todayType = (getTodaySchedule(schedule)?.type || "rest") as "lift" | "run" | "rest";

  var streak = useMemo(function() { return computeStreak(workouts.map(function(w) { return w.date; })); }, [workouts]);

  useEffect(function() {
    if (profile && streak !== profile.currentStreak) updateProfile({ currentStreak: streak });
  }, [streak, profile, updateProfile]);

  var [dailyCal, setDailyCal] = useState(0);
  var [dailyProt, setDailyProt] = useState(0);

  useEffect(function() {
    if (!user?.uid) return;
    (async function() {
      try {
        var ts = new Date();
        ts.setHours(0, 0, 0, 0);
        var snap = await getDocs(query(collection(db, "users", user.uid, "meals"), where("createdAt", ">=", Timestamp.fromDate(ts))));
        var c = 0;
        var p = 0;
        snap.forEach(function(d) { var dd = d.data(); c += dd.totalCalories || dd.calories || 0; p += dd.totalProtein || dd.protein || 0; });
        setDailyCal(c);
        setDailyProt(p);
      } catch (e) { console.error(e); }
    })();
  }, [user]);

  var [peekDate, setPeekDate] = useState<string | null>(null);
  var handleDayTap = useCallback(function(dk: string) { setPeekDate(function(p) { return p === dk ? null : dk; }); }, []);
  var peekW = useMemo(function() { return peekDate ? getWorkoutsForDate(peekDate) : []; }, [peekDate, getWorkoutsForDate]);
  var peekT = useMemo(function() { return peekDate ? getDailyTotals(peekDate) : { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 }; }, [peekDate, getDailyTotals]);

  var nextWorkout = programState?.workouts.find(function(d) { return !d.completed; }) || null;

  var [snapData, setSnapData] = useState({ ls: 0, rs: 0, lt: 0, rk: 0, ad: null as number | null });

  useEffect(function() {
    if (perfDoc) {
      setSnapData({
        ls: perfDoc.aggregates.liftSessions,
        rs: perfDoc.aggregates.runSessions,
        lt: perfDoc.aggregates.liftTonnage,
        rk: perfDoc.aggregates.runKm,
        ad: perfDoc.adherenceScore,
      });
      return;
    }

    var now = new Date();
    var ws = new Date(now);
    ws.setDate(now.getDate() - now.getDay());
    ws.setHours(0, 0, 0, 0);

    var ww = workouts.filter(function(w) { return new Date(w.date) >= ws; });
    var t = 0;
    ww.forEach(function(w) { w.exercises?.forEach(function(ex) { ex.sets?.forEach(function(s) { t += (s.weightKg || 0) * (s.reps || 0); }); }); });

    if (!user?.uid) {
      setSnapData({ ls: ww.length, rs: 0, lt: t, rk: 0, ad: null });
      return;
    }

    var startTs = Timestamp.fromDate(ws);
    var endTs = Timestamp.fromDate(new Date(now.getTime() + 86400000));
    getDocs(query(collection(db, "users", user.uid, "runs"),
      where("completedAt", ">=", startTs),
      where("completedAt", "<=", endTs)
    )).then(function(snap) {
      var rc = 0;
      var km = 0;
      snap.docs.forEach(function(d) {
        rc++;
        km += ((d.data().distance || 0) / 1000);
      });
      setSnapData({ ls: ww.length, rs: rc, lt: t, rk: Math.round(km * 10) / 10, ad: null });
    }).catch(function() {
      setSnapData({ ls: ww.length, rs: 0, lt: t, rk: 0, ad: null });
    });
  }, [perfDoc, workouts, user]);

  if (!profile) return <div className="p-8 text-center text-muted-foreground">Loading your profile…</div>;

  return (
    <motion.div
      className="flex flex-col gap-4 pb-6"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Hey, {profile.displayName || "Athlete"}</h1>
          <p className="text-xs text-muted-foreground">
            {programState ? "Week " + programState.weekNumber + " \u00B7 " + programState.currentPhase + " phase" : "Let's put in work today."}
          </p>
        </div>
        <Link to="/settings" className="p-2 rounded-lg hover:bg-muted transition-colors">
          <SettingsIcon className="w-5 h-5 text-muted-foreground" />
        </Link>
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

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }} className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <WeekStrip dayMap={weeklyDayMap} schedule={schedule} selectedDate={peekDate} onDayTap={handleDayTap} />
        <div className="flex items-center justify-center gap-4 pt-1">
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: THEME.lifting }} /><span className="text-[9px] text-muted-foreground">Lift</span></div>
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: THEME.running }} /><span className="text-[9px] text-muted-foreground">Run</span></div>
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: THEME.success }} /><span className="text-[9px] text-muted-foreground">Done</span></div>
        </div>
        <AnimatePresence>
          {peekDate && (
            <DayPeekCard dateKey={peekDate} schedule={schedule} workouts={peekW} dailyTotals={peekT} onClose={function() { setPeekDate(null); }} />
          )}
        </AnimatePresence>
        {streak > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/30">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-medium text-orange-500">{streak} day streak</span>
            <span className="text-[10px] text-muted-foreground">{streak >= 14 ? "\u2014 on fire" : streak >= 7 ? "\u2014 crushing it" : "\u2014 keep building"}</span>
          </div>
        )}
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
      {programLoading ? (
        <div className="h-20 rounded-2xl bg-muted animate-pulse" />
      ) : (
        <CyclingCTACard nextWorkout={nextWorkout} todayType={todayType} navigate={navigate} />
      )}
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
      <WeeklySnapshotCompact liftSessions={snapData.ls} runSessions={snapData.rs} liftTonnage={snapData.lt} runKm={snapData.rk} adherenceScore={snapData.ad} />
      </motion.div>

      {perfDoc && perfDoc.insight && (
        <InsightStrip title={perfDoc.insight.title} bullet={perfDoc.insight.bullets[0] || ""} loadBand={perfDoc.loadBand} />
      )}

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
        <TodayIntake calories={dailyCal} protein={dailyProt} targetCalories={profile.targetCalories || 2200} targetProtein={profile.targetProtein || 160} />
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
        <HealthScoreCard />
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
        <WaterTracker />
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}>
        <BodyweightLogger />
      </motion.div>

      {!isPro && (
        <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }} className="p-3 rounded-2xl bg-card border border-border/50 text-center space-y-1">
          <p className="text-sm font-medium text-foreground">Unlock AI Photo Logging &amp; Performance Engine</p>
          <p className="text-xs text-muted-foreground">Upgrade to Pro &mdash; from just &pound;2.99/mo</p>
        </motion.div>
      )}

      <BadgeEarnedModal badge={newBadge} onDismiss={dismissNewBadge} />
    </motion.div>
  );
}
