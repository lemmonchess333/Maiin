import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useWorkouts } from "@/hooks/useWorkouts";
import { usePerformance } from "@/hooks/usePerformance";
import { useSubscription } from "@/lib/subscription";
import { useProgram } from "@/features/program/useProgram";
import { useWeeklyDayMap } from "@/hooks/useFirestore";
import BodyweightLogger from "@/components/BodyweightLogger";
import { THEME } from "@/lib/theme";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Dumbbell,
  ChevronRight,
  Sparkles,
  Settings as SettingsIcon,
  Flame,
  Play,
  Footprints,
  ClipboardList,
} from "lucide-react";
import { format } from "date-fns";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

function computeStreak(workoutDates: string[]): number {
  if (workoutDates.length === 0) return 0;
  const uniqueDates = [...new Set(workoutDates)].sort().reverse();
  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    if ((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24) === 1)
      streak++;
    else break;
  }
  return streak;
}

function WeekStrip({
  dayMap,
}: {
  dayMap: Map<
    string,
    { workouts: number; meals: number; caloriesHit: boolean }
  >;
}) {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const key = format(d, "yyyy-MM-dd");
    const data = dayMap.get(key);
    const isToday = format(d, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
    const hasActivity = data && (data.workouts > 0 || data.meals > 0);
    return { date: d, key, isToday, hasActivity };
  });

  return (
    <div className="flex items-center justify-between px-1">
      {days.map(({ date, key, isToday, hasActivity }) => (
        <div key={key} className="flex flex-col items-center gap-1">
          <span className="text-[10px] text-muted-foreground">
            {format(date, "EEE").charAt(0)}
          </span>
          <div
            className={[
              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all",
              isToday
                ? "bg-primary text-primary-foreground"
                : hasActivity
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground",
            ].join(" ")}
          >
            {date.getDate()}
          </div>
          {hasActivity && !isToday && (
            <div className="w-1 h-1 rounded-full bg-primary" />
          )}
          {(!hasActivity || isToday) && <div className="w-1 h-1" />}
        </div>
      ))}
    </div>
  );
}

function NextActionCard({
  nextWorkout,
  navigate,
}: {
  nextWorkout: {
    dayName: string;
    dayType: string;
    exercises: { name: string }[];
  } | null;
  navigate: (path: string) => void;
}) {
  if (nextWorkout) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => navigate("/program")}
        className="w-full p-5 rounded-2xl border border-border/50 text-left transition-transform active:scale-[0.99]"
        style={{
          background:
            "linear-gradient(135deg, " +
            THEME.lifting +
            "12 0%, transparent 60%)",
          borderColor: THEME.lifting + "30",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: THEME.lifting + "20" }}
          >
            <Dumbbell className="w-5 h-5" style={{ color: THEME.lifting }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              Up next
            </p>
            <p className="text-sm font-semibold text-foreground truncate">
              {nextWorkout.dayName}
            </p>
            <p className="text-[11px] text-muted-foreground capitalize">
              {nextWorkout.dayType} &middot; {nextWorkout.exercises.length}{" "}
              exercises
            </p>
          </div>
          <div
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ backgroundColor: THEME.lifting, color: "#fff" }}
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </div>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2"
    >
      <Link
        to="/program"
        className="flex-1 p-4 rounded-2xl bg-card border border-border/50 flex flex-col items-center gap-2 transition-transform active:scale-[0.98]"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: THEME.lifting + "20" }}
        >
          <Dumbbell className="w-5 h-5" style={{ color: THEME.lifting }} />
        </div>
        <span className="text-xs font-medium text-foreground">
          Log Workout
        </span>
      </Link>
      <Link
        to="/run"
        className="flex-1 p-4 rounded-2xl bg-card border border-border/50 flex flex-col items-center gap-2 transition-transform active:scale-[0.98]"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: THEME.running + "20" }}
        >
          <Footprints className="w-5 h-5" style={{ color: THEME.running }} />
        </div>
        <span className="text-xs font-medium text-foreground">Start Run</span>
      </Link>
      <Link
        to="/log"
        className="flex-1 p-4 rounded-2xl bg-card border border-border/50 flex flex-col items-center gap-2 transition-transform active:scale-[0.98]"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: THEME.success + "20" }}
        >
          <ClipboardList
            className="w-5 h-5"
            style={{ color: THEME.success }}
          />
        </div>
        <span className="text-xs font-medium text-foreground">Log Food</span>
      </Link>
    </motion.div>
  );
}

function WeeklySnapshotCompact({
  liftSessions,
  runSessions,
  liftTonnage,
  runKm,
  adherenceScore,
}: {
  liftSessions: number;
  runSessions: number;
  liftTonnage: number;
  runKm: number;
  adherenceScore: number | null;
}) {
  const stats = [
    {
      label: "Sessions",
      value: String(liftSessions + runSessions),
      color: THEME.brand,
    },
    {
      label: "Tonnage",
      value:
        liftTonnage >= 1000
          ? (liftTonnage / 1000).toFixed(1) + "t"
          : Math.round(liftTonnage) + "kg",
      color: THEME.lifting,
    },
    {
      label: "Distance",
      value: runKm.toFixed(1) + "km",
      color: THEME.running,
    },
    {
      label: "Adherence",
      value: adherenceScore != null ? adherenceScore + "%" : "\u2014",
      color: THEME.success,
    },
  ];

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        This Week
      </p>
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p
              className="text-lg font-bold font-mono tabular-nums"
              style={{ color: s.color }}
            >
              {s.value}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightStrip({
  title,
  bullet,
  loadBand,
}: {
  title: string;
  bullet: string;
  loadBand: string;
}) {
  const emoji =
    loadBand === "overreach"
      ? "\uD83D\uDD25"
      : loadBand === "high"
        ? "\u26A1"
        : loadBand === "moderate"
          ? "\uD83D\uDCAA"
          : "\uD83C\uDF31";

  return (
    <Link to="/history?tab=performance">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="p-4 rounded-2xl bg-card border border-border/50 flex items-start gap-3 transition-transform active:scale-[0.99]"
      >
        <span className="text-lg mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
            {bullet}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <span className="text-[10px] text-primary font-medium">Details</span>
          <ChevronRight className="w-3.5 h-3.5 text-primary" />
        </div>
      </motion.div>
    </Link>
  );
}

function TodayIntake({
  calories,
  protein,
  targetCalories: initialTargetCalories,
  targetProtein: initialTargetProtein,
}: {
  calories: number;
  protein: number;
  targetCalories: number;
  targetProtein: number;
}) {
  let targetCalories = initialTargetCalories;
  let targetProtein = initialTargetProtein;

  if (targetCalories <= 0 && targetProtein <= 0) {
    targetCalories = 2200;
    targetProtein = 160;
  }

  const bars = [
    {
      label: "Calories",
      current: calories,
      target: targetCalories || 2200,
      unit: "",
      color: THEME.warning,
    },
    {
      label: "Protein",
      current: protein,
      target: targetProtein || 160,
      unit: "g",
      color: THEME.teal,
    },
  ];

  return (
    <Link to="/log">
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2.5 transition-transform active:scale-[0.99]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Today&apos;s Intake
          </p>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        {bars.map((b) => {
          const pct = Math.min((b.current / b.target) * 100, 100);
          return (
            <div key={b.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {b.label}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-foreground">
                  {b.current}
                  {b.unit} / {b.target}
                  {b.unit}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: pct + "%" }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: b.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Link>
  );
}

export default function Home() {
  const { user, profile, updateProfile } = useAuth();
  const { workouts } = useWorkouts();
  const { current: perfDoc } = usePerformance();
  const { isPro, isInTrial, trialDaysLeft } = useSubscription();
  const { programState } = useProgram();
  const weeklyDayMap = useWeeklyDayMap();
  const navigate = useNavigate();

  const computedStreak = useMemo(() => {
    return computeStreak(workouts.map((w) => w.date));
  }, [workouts]);

  useEffect(() => {
    if (profile && computedStreak !== profile.currentStreak) {
      updateProfile({ currentStreak: computedStreak });
    }
  }, [computedStreak, profile, updateProfile]);

  const [dailyCal, setDailyCal] = useState(0);
  const [dailyProt, setDailyProt] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const snap = await getDocs(
          query(
            collection(db, "users", user.uid, "meals"),
            where("createdAt", ">=", Timestamp.fromDate(todayStart))
          )
        );
        let cal = 0;
        let prot = 0;
        snap.forEach((d) => {
          const data = d.data();
          cal += data.totalCalories || data.calories || 0;
          prot += data.totalProtein || data.protein || 0;
        });
        setDailyCal(cal);
        setDailyProt(prot);
      } catch (e) {
        console.error("Error fetching today's meals:", e);
      }
    })();
  }, [user]);

  const nextWorkout =
    programState?.workouts.find((d) => !d.completed) || null;

  const snapshotData = useMemo(() => {
    if (perfDoc) {
      return {
        liftSessions: perfDoc.aggregates.liftSessions,
        runSessions: perfDoc.aggregates.runSessions,
        liftTonnage: perfDoc.aggregates.liftTonnage,
        runKm: perfDoc.aggregates.runKm,
        adherenceScore: perfDoc.adherenceScore,
      };
    }
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const thisWeekWorkouts = workouts.filter(
      (w) => new Date(w.date) >= weekStart
    );
    let tonnage = 0;
    thisWeekWorkouts.forEach((w) => {
      w.exercises?.forEach((ex) => {
        ex.sets?.forEach((s) => {
          tonnage += (s.weightKg || 0) * (s.reps || 0);
        });
      });
    });

    return {
      liftSessions: thisWeekWorkouts.length,
      runSessions: 0,
      liftTonnage: tonnage,
      runKm: 0,
      adherenceScore: null,
    };
  }, [perfDoc, workouts]);

  if (!profile) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading your profile...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Hey, {profile.displayName || "Athlete"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {programState
              ? "Week " +
                programState.weekNumber +
                " \u00B7 " +
                programState.currentPhase +
                " phase"
              : "Let's put in work today."}
          </p>
        </div>
        <Link
          to="/settings"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <SettingsIcon className="w-5 h-5 text-muted-foreground" />
        </Link>
      </motion.div>

      {isInTrial && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10"
        >
          <Sparkles className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Pro Trial &mdash; {trialDaysLeft} day
              {trialDaysLeft !== 1 ? "s" : ""} left
            </p>
            <p className="text-xs text-muted-foreground">
              Full access to all features.
            </p>
          </div>
        </motion.div>
      )}

      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <WeekStrip dayMap={weeklyDayMap} />
        {computedStreak > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/30">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-medium text-orange-500">
              {computedStreak} day streak
            </span>
            <span className="text-[10px] text-muted-foreground">
              {computedStreak >= 14
                ? "\u2014 on fire"
                : computedStreak >= 7
                  ? "\u2014 crushing it"
                  : "\u2014 keep building"}
            </span>
          </div>
        )}
      </div>

      <NextActionCard nextWorkout={nextWorkout} navigate={navigate} />

      <WeeklySnapshotCompact
        liftSessions={snapshotData.liftSessions}
        runSessions={snapshotData.runSessions}
        liftTonnage={snapshotData.liftTonnage}
        runKm={snapshotData.runKm}
        adherenceScore={snapshotData.adherenceScore}
      />

      {perfDoc && perfDoc.insight && (
        <InsightStrip
          title={perfDoc.insight.title}
          bullet={perfDoc.insight.bullets[0] || ""}
          loadBand={perfDoc.loadBand}
        />
      )}

      <BodyweightLogger />

      <TodayIntake
        calories={dailyCal}
        protein={dailyProt}
        targetCalories={profile.targetCalories || 2200}
        targetProtein={profile.targetProtein || 160}
      />

      {!isPro && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-3 rounded-xl bg-card border border-border/50 text-center space-y-1"
        >
          <p className="text-sm font-medium text-foreground">
            Unlock AI Photo Logging &amp; Performance Engine
          </p>
          <p className="text-xs text-muted-foreground">
            Upgrade to Pro &mdash; from just &pound;2.99/mo
          </p>
        </motion.div>
      )}
    </div>
  );
}
