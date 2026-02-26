import { useState, useMemo } from "react";
import { useHistoryData } from "@/hooks/useFirestore";
import { useMeals } from "@/hooks/useMeals";
import { useWorkouts } from "@/hooks/useWorkouts";
import { cn } from "@/lib/utils";
import { Calendar, TrendingUp, Dumbbell, Download } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { format, subDays } from "date-fns";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: "12px",
};

const AXIS_TICK = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

export default function History() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
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

  const LIFT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444"];

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

      {/* Stats grid - lighter backgrounds exactly like AI Macro Targets / Today's Intake (no icons) */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Workouts", value: totalWorkouts, bgColor: "#f3e8ff", textColor: "#7c3aed" },
          { label: "Meals", value: totalMeals, bgColor: "#dbeafe", textColor: "#3b82f6" },
          { label: "PRs", value: prDays, bgColor: "#fef3c7", textColor: "#d97706" },
          { label: "Active", value: activeDays, bgColor: "#d1fae5", textColor: "#10b981" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl p-4 shadow-sm text-center"
            style={{ backgroundColor: stat.bgColor }}
          >
            <p className="text-2xl font-bold" style={{ color: stat.textColor }}>
              {stat.value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
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
          {/* Workouts chart */}
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

          {/* Macro Trend chart */}
          {macroData.length > 1 && (
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
                    <Line type="monotone" dataKey="protein" stroke="#3b82f6" strokeWidth={2} dot={false} name="Protein (g)" />
                    <Line type="monotone" dataKey="carbs" stroke="#f59e0b" strokeWidth={2} dot={false} name="Carbs (g)" />
                    <Line type="monotone" dataKey="fat" stroke="#ec4899" strokeWidth={2} dot={false} name="Fat (g)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Calorie Trend */}
          {macroData.length > 1 && (
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
                    <Area type="monotone" dataKey="calories" stroke="#f97316" fill="url(#calGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Strength Progression */}
          {strengthData.length > 1 && strengthKeys.length > 0 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-indigo-500" />
                <p className="text-sm font-medium text-foreground">Strength (E1RM)</p>
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
                        dot={{ r: 3 }}
                        name={key}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Weight trend */}
          {weightData.length > 1 && (
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