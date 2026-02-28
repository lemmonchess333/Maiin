import { useState, useMemo } from "react";
import { useHistoryData } from "@/hooks/useFirestore";
import { useMeals } from "@/hooks/useMeals";
import { useWorkouts } from "@/hooks/useWorkouts";
import RunningHistorySection from "@/components/run/RunningHistorySection";
import { cn } from "@/lib/utils";
import { Calendar, TrendingUp, Dumbbell, Download, BarChart3, Activity } from "lucide-react";
import {
  exerciseToMuscleGroup,
  MUSCLE_GROUPS,
  epley1RM,
  strengthSlope,
  momentumDirection,
  fourWeekChange,
  type StrengthPoint,
  type MuscleGroup,
  dailyAdherence,
  weeklyAdherenceScore,
} from "@/lib/analytics";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { format, subDays } from "date-fns";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: "12px",
};

const AXIS_TICK = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

type HistoryFilter = "all" | "lifting" | "running" | "nutrition";

export default function History() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const { data, loading } = useHistoryData(range);
  const { meals } = useMeals();
  const { workouts } = useWorkouts();

  // Build chart data from daily logs
  const chartData = data.map((log) => ({
    date: format(new Date(log.date), "MMM d"),
    workouts: log.workouts,
    meals: log.meals,
    weight: log.weightKg || null,
  }));

  // Build macro trend data from meals
  const macroData = useMemo(() => {
    const startDate = format(subDays(new Date(), range), "yyyy-MM-dd");
    const byDate = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();

    meals
      .filter((m) => m.date >= startDate)
      .forEach((m) => {
        const existing = byDate.get(m.date) || { calories: 0, protein: 0, carbs: 0, fat: 0 };
        existing.calories += m.totalCalories || 0;
        existing.protein += m.totalProtein || 0;
        existing.carbs += m.totalCarbs || 0;
        existing.fat += m.totalFat || 0;
        byDate.set(m.date, existing);
      });

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, macros]) => ({
        date: format(new Date(date + "T12:00:00"), "MMM d"),
        calories: Math.round(macros.calories),
        protein: Math.round(macros.protein),
        carbs: Math.round(macros.carbs),
        fat: Math.round(macros.fat),
      }));
  }, [meals, range]);

  // Build strength trend (E1RM for compound lifts)
  const strengthData = useMemo(() => {
    const startDate = format(subDays(new Date(), range), "yyyy-MM-dd");
    const compoundIds = new Set(["bench-press", "deadlift", "barbell-squat", "overhead-press"]);
    const byDate = new Map<string, Record<string, number>>();

    workouts
      .filter((w) => w.date >= startDate)
      .forEach((w) => {
        w.exercises.forEach((ex) => {
          if (!compoundIds.has(ex.exerciseId)) return;
          const maxSet = ex.sets.reduce((best, s) => {
            const e1rm = s.weightKg * (1 + s.reps / 30);
            return e1rm > best ? e1rm : best;
          }, 0);
          if (maxSet > 0) {
            const existing = byDate.get(w.date) || {};
            const label = ex.exerciseName.replace(/ Press$/, "").replace("Barbell ", "");
            existing[label] = Math.max(existing[label] || 0, Math.round(maxSet));
            byDate.set(w.date, existing);
          }
        });
      });

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, lifts]) => ({
        date: format(new Date(date + "T12:00:00"), "MMM d"),
        ...lifts,
      }));
  }, [workouts, range]);

  const strengthKeys = useMemo(() => {
    const keys = new Set<string>();
    strengthData.forEach((d) => {
      Object.keys(d).forEach((k) => { if (k !== "date") keys.add(k); });
    });
    return Array.from(keys);
  }, [strengthData]);

  // Weekly volume by muscle group
  const volumeData = useMemo(() => {
    const startDate = format(subDays(new Date(), range), "yyyy-MM-dd");
    const byWeek = new Map<string, Record<MuscleGroup, number>>();

    workouts
      .filter((w) => w.date >= startDate)
      .forEach((w) => {
        // Group by ISO week
        const weekLabel = format(new Date(w.date + "T12:00:00"), "'W'ww");
        const existing = byWeek.get(weekLabel) ?? {
          chest: 0,
          back: 0,
          legs: 0,
          shoulders: 0,
          arms: 0,
        };
        w.exercises.forEach((ex) => {
          const group = exerciseToMuscleGroup(ex.category);
          if (group in existing) {
            (existing as any)[group] += ex.sets.length;
          }
        });
        byWeek.set(weekLabel, existing);
      });

    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, vol]) => ({ week, ...vol }));
  }, [workouts, range]);

  // Strength trend engine: per compound lift, slope + momentum
  const strengthTrends = useMemo(() => {
    const compoundIds = new Map([
      ["bench-press", "Bench"],
      ["deadlift", "Deadlift"],
      ["barbell-squat", "Squat"],
      ["overhead-press", "OHP"],
    ]);
    const trends: Array<{
      name: string;
      slope: number;
      momentum: string;
      fourWk: number | null;
      points: StrengthPoint[];
    }> = [];

    for (const [id, name] of compoundIds) {
      const points: StrengthPoint[] = [];
      workouts
        .filter((w) => w.date >= format(subDays(new Date(), 90), "yyyy-MM-dd"))
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((w) => {
          w.exercises
            .filter((ex) => ex.exerciseId === id)
            .forEach((ex) => {
              let maxE1RM = 0;
              ex.sets.forEach((s) => {
                const e = epley1RM(s.weightKg, s.reps);
                if (e > maxE1RM) maxE1RM = e;
              });
              if (maxE1RM > 0) {
                points.push({ date: w.date, e1rm: maxE1RM });
              }
            });
        });

      if (points.length >= 2) {
        const last6 = points.slice(-6);
        const sl = strengthSlope(last6);
        trends.push({
          name,
          slope: sl,
          momentum: momentumDirection(sl),
          fourWk: fourWeekChange(last6),
          points: last6,
        });
      }
    }
    return trends;
  }, [workouts]);

  // Macro adherence (using target of 2200 cal / 160g protein as defaults)
  const adherenceData = useMemo(() => {
    const startDate = format(subDays(new Date(), range), "yyyy-MM-dd");
    const target = { calories: 2200, protein: 160 };
    const dailyScores: number[] = [];

    const byDate = new Map<string, { calories: number; protein: number }>();
    meals
      .filter((m) => m.date >= startDate)
      .forEach((m) => {
        const existing = byDate.get(m.date) ?? { calories: 0, protein: 0 };
        existing.calories += m.totalCalories || 0;
        existing.protein += m.totalProtein || 0;
        byDate.set(m.date, existing);
      });

    for (const [, actual] of byDate) {
      const result = dailyAdherence(actual, target);
      dailyScores.push(result.score);
    }

    const score = weeklyAdherenceScore(dailyScores);
    const band = score >= 80 ? "green" : score >= 50 ? "yellow" : "red";
    return { score, band, daysTracked: dailyScores.length };
  }, [meals, range]);

  // Training-Nutrition Correlation: weekly calories vs training volume
  const correlationData = useMemo(() => {
    const startDate = format(subDays(new Date(), range), "yyyy-MM-dd");

    // Build weekly calorie sums
    const weekCals = new Map<string, number>();
    meals
      .filter((m) => m.date >= startDate)
      .forEach((m) => {
        const weekLabel = format(new Date(m.date + "T12:00:00"), "'W'ww");
        weekCals.set(weekLabel, (weekCals.get(weekLabel) || 0) + (m.totalCalories || 0));
      });

    // Build weekly set volume
    const weekVol = new Map<string, number>();
    workouts
      .filter((w) => w.date >= startDate)
      .forEach((w) => {
        const weekLabel = format(new Date(w.date + "T12:00:00"), "'W'ww");
        const sets = w.exercises.reduce((sum: number, ex: any) => sum + (ex.sets?.length || 0), 0);
        weekVol.set(weekLabel, (weekVol.get(weekLabel) || 0) + sets);
      });

    const allWeeks = new Set([...weekCals.keys(), ...weekVol.keys()]);
    return Array.from(allWeeks)
      .sort()
      .map((week) => ({
        week,
        calories: Math.round(weekCals.get(week) || 0),
        volume: weekVol.get(week) || 0,
      }));
  }, [meals, workouts, range]);

  // Correlation insights
  const correlationInsights = useMemo(() => {
    if (correlationData.length < 2) return [];
    const insights: string[] = [];
    const avgCals = correlationData.reduce((s, d) => s + d.calories, 0) / correlationData.length;
    const avgVol = correlationData.reduce((s, d) => s + d.volume, 0) / correlationData.length;
    const last = correlationData[correlationData.length - 1];

    if (last.calories > avgCals * 1.1 && last.volume > avgVol) {
      insights.push("High fuel + high volume — great training week!");
    } else if (last.calories < avgCals * 0.9 && last.volume > avgVol) {
      insights.push("Training hard on low calories — recovery may be limited.");
    } else if (last.calories > avgCals * 1.1 && last.volume < avgVol * 0.8) {
      insights.push("High intake but lower training volume — consider adjusting.");
    }

    if (avgVol > 0 && avgCals > 0) {
      insights.push(`Avg weekly: ${Math.round(avgCals)} cal, ${Math.round(avgVol)} sets`);
    }
    return insights;
  }, [correlationData]);

  const LIFT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444"];
  const MUSCLE_COLORS: Record<string, string> = {
    chest: "#ef4444",
    back: "#3b82f6",
    legs: "#22c55e",
    shoulders: "#f59e0b",
    arms: "#a855f6",
  };

  const totalWorkouts = data.reduce((sum, d) => sum + d.workouts, 0);
  const totalMeals = data.reduce((sum, d) => sum + d.meals, 0);
  const prDays = data.filter((d) => d.hasPR).length;
  const activeDays = data.filter((d) => d.workouts > 0 || d.meals > 0).length;

  const weightData = chartData.filter((d) => d.weight !== null);

  // CSV export
  const handleExport = () => {
    const rows = [
      ["Date", "Workouts", "Meals", "Weight (kg)", "PR"].join(","),
      ...data.map((d) =>
        [d.date, d.workouts, d.meals, d.weightKg ?? "", d.hasPR ? "Yes" : "No"].join(",")
      ),
    ];
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maiin-history-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">History</h1>
          <p className="text-sm text-muted-foreground">
            Track your progress over time
          </p>
        </div>
        <button
          onClick={handleExport}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title="Export CSV"
        >
          <Download className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Range selector */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {([7, 30, 90] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              range === r
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {r}d
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {(["all", "lifting", "running", "nutrition"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Running History Section */}
      {(filter === "all" || filter === "running") && (
        <RunningHistorySection />
      )}

      {/* Stats grid */}
      <div className={cn("grid grid-cols-4 gap-2 overflow-hidden", filter === "running" && "hidden")}>
        {[
          { label: "Workouts", value: totalWorkouts, bgColor: "#f3e8ff", textColor: "#7c3aed" },
          { label: "Meals", value: totalMeals, bgColor: "#dbeafe", textColor: "#3b82f6" },
          { label: "PRs", value: prDays, bgColor: "#fef3c7", textColor: "#d97706" },
          { label: "Active", value: activeDays, bgColor: "#d1fae5", textColor: "#10b981" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="min-w-0 rounded-2xl p-3 shadow-sm text-center"
            style={{ backgroundColor: stat.bgColor }}
          >
            <p className="text-xl font-bold tabular-nums truncate" style={{ color: stat.textColor }}>
              {stat.value}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Loading history...
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No data yet</p>
          <p className="text-muted-foreground/70 text-xs mt-1">
            Start logging to see your charts
          </p>
        </div>
      ) : (
        <>
          {/* 1. Strength Progression (E1RM) */}
          {(filter === "all" || filter === "lifting") && strengthData.length > 1 && strengthKeys.length > 0 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-indigo-500" />
                <p className="text-sm font-medium text-foreground">Strength Progress (E1RM)</p>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={strengthData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={AXIS_TICK} interval="preserveStartEnd" />
                    <YAxis tick={AXIS_TICK} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    {strengthKeys.map((key, i) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={LIFT_COLORS[i % LIFT_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3, fill: LIFT_COLORS[i % LIFT_COLORS.length] }}
                        name={key}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 2. Strength Trends Summary */}
          {(filter === "all" || filter === "lifting") && strengthTrends.length > 0 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                <p className="text-sm font-medium text-foreground">Strength Trends</p>
              </div>
              <div className="space-y-2">
                {strengthTrends.map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                  >
                    <span className="text-sm font-medium text-foreground">{t.name}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span
                        className={cn(
                          "font-medium",
                          t.momentum === "up"
                            ? "text-green-500"
                            : t.momentum === "down"
                            ? "text-red-500"
                            : "text-muted-foreground"
                        )}
                      >
                        {t.momentum === "up" ? "Rising" : t.momentum === "down" ? "Declining" : "Stable"}
                      </span>
                      {t.fourWk !== null && (
                        <span className="text-muted-foreground">
                          {t.fourWk > 0 ? "+" : ""}
                          {t.fourWk}%
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        E1RM: {t.points[t.points.length - 1]?.e1rm ?? "\u2014"}kg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Weekly Volume by Muscle Group */}
          {(filter === "all" || filter === "lifting") && volumeData.length > 0 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-500" />
                <p className="text-sm font-medium text-foreground">Weekly Volume (sets)</p>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={AXIS_TICK} />
                    <YAxis tick={AXIS_TICK} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    {MUSCLE_GROUPS.map((g) => (
                      <Bar
                        key={g}
                        dataKey={g}
                        stackId="vol"
                        fill={MUSCLE_COLORS[g]}
                        name={g.charAt(0).toUpperCase() + g.slice(1)}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 4. Calorie Trend */}
          {(filter === "all" || filter === "nutrition") && macroData.length > 1 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                <p className="text-sm font-medium text-foreground">Calorie Trend</p>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={macroData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={AXIS_TICK} interval="preserveStartEnd" />
                    <YAxis tick={AXIS_TICK} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <defs>
                      <linearGradient id="calGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="calories" stroke="#f97316" fill="url(#calGradient)" strokeWidth={2} dot={{ r: 2, fill: "#f97316" }} />
                    <ReferenceLine y={2200} stroke="#94a3b8" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "Target", position: "right", fill: "#94a3b8", fontSize: 10 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 5. Macro Trends */}
          {(filter === "all" || filter === "nutrition") && macroData.length > 1 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                <p className="text-sm font-medium text-foreground">Macro Trends</p>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={macroData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={AXIS_TICK} interval="preserveStartEnd" />
                    <YAxis tick={AXIS_TICK} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Line type="monotone" dataKey="protein" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2.5, fill: "#3b82f6" }} name="Protein (g)" />
                    <Line type="monotone" dataKey="carbs" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5, fill: "#f59e0b" }} name="Carbs (g)" />
                    <Line type="monotone" dataKey="fat" stroke="#ec4899" strokeWidth={2} dot={{ r: 2.5, fill: "#ec4899" }} name="Fat (g)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 6. Macro Adherence Ring */}
          {(filter === "all" || filter === "nutrition") && adherenceData.daysTracked > 0 && (() => {
            const radius = 44;
            const strokeW = 8;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (adherenceData.score / 100) * circumference;
            const ringColor =
              adherenceData.band === "green"
                ? "#22c55e"
                : adherenceData.band === "yellow"
                ? "#eab308"
                : "#ef4444";
            return (
              <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <p className="text-sm font-medium text-foreground">Macro Adherence</p>
                </div>
                <div className="flex items-center justify-center">
                  <div className="relative w-28 h-28">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="none"
                        stroke="hsl(var(--muted))"
                        strokeWidth={strokeW}
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth={strokeW}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className="transition-all duration-700 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-foreground">{adherenceData.score}</span>
                      <span className="text-[10px] text-muted-foreground">/ 100</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Based on {adherenceData.daysTracked} days tracked
                </p>
              </div>
            );
          })()}

          {/* 7. Training-Nutrition Correlation */}
          {filter === "all" && correlationData.length > 1 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-500" />
                <p className="text-sm font-medium text-foreground">Training vs Nutrition</p>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={correlationData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={AXIS_TICK} />
                    <YAxis yAxisId="cal" orientation="left" tick={AXIS_TICK} />
                    <YAxis yAxisId="vol" orientation="right" tick={AXIS_TICK} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Bar yAxisId="cal" dataKey="calories" fill="#f97316" opacity={0.7} radius={[4, 4, 0, 0]} name="Calories" />
                    <Line yAxisId="vol" type="monotone" dataKey="volume" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} name="Sets (volume)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {correlationInsights.length > 0 && (
                <div className="space-y-1.5">
                  {correlationInsights.map((insight, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                      {insight}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 8. Workouts chart */}
          {(filter === "all" || filter === "lifting") && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-primary" />
                <p className="text-sm font-medium text-foreground">Workouts</p>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={AXIS_TICK} interval="preserveStartEnd" />
                    <YAxis tick={AXIS_TICK} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="workouts" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 8. Bodyweight vs Performance Overlay */}
          {(filter === "all" || filter === "lifting") && weightData.length > 1 && strengthData.length > 1 && strengthKeys.length > 0 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-500" />
                <p className="text-sm font-medium text-foreground">Weight vs Strength</p>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={AXIS_TICK}
                      interval="preserveStartEnd"
                      allowDuplicatedCategory={false}
                    />
                    <YAxis yAxisId="weight" orientation="left" tick={AXIS_TICK} domain={["dataMin - 2", "dataMax + 2"]} />
                    <YAxis yAxisId="e1rm" orientation="right" tick={AXIS_TICK} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Line
                      yAxisId="weight"
                      data={weightData}
                      type="monotone"
                      dataKey="weight"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      name="Bodyweight (kg)"
                    />
                    <Line
                      yAxisId="e1rm"
                      data={strengthData}
                      type="monotone"
                      dataKey={strengthKeys[0]}
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      name={`${strengthKeys[0]} E1RM`}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 9. Weight trend */}
          {filter !== "running" && weightData.length > 1 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <p className="text-sm font-medium text-foreground">
                  Weight Trend
                </p>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weightData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={AXIS_TICK} interval="preserveStartEnd" />
                    <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={AXIS_TICK} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <defs>
                      <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="weight" stroke="#22c55e" fill="url(#weightGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}