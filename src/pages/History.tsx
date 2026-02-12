import { useState } from "react";
import { useHistoryData } from "@/hooks/useFirestore";
import { cn } from "@/lib/utils";
import { Calendar, TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";

export default function History() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const { data, loading } = useHistoryData(range);

  const chartData = data.map((log) => ({
    date: format(new Date(log.date), "MMM d"),
    workouts: log.workouts,
    meals: log.meals,
    weight: log.weightKg || null,
  }));

  const totalWorkouts = data.reduce((sum, d) => sum + d.workouts, 0);
  const totalMeals = data.reduce((sum, d) => sum + d.meals, 0);
  const prDays = data.filter((d) => d.hasPR).length;
  const activeDays = data.filter((d) => d.workouts > 0 || d.meals > 0).length;

  const weightData = chartData.filter((d) => d.weight !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">History</h1>
        <p className="text-sm text-muted-foreground">
          Track your progress over time
        </p>
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

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: "Workouts",
            value: totalWorkouts,
            icon: "💪",
          },
          {
            label: "Meals Logged",
            value: totalMeals,
            icon: "🥩",
          },
          {
            label: "PR Days",
            value: prDays,
            icon: "🏆",
          },
          {
            label: "Active Days",
            value: activeDays,
            icon: "🔥",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-card rounded-xl border border-border/50 p-4"
          >
            <p className="text-2xl mb-1">{stat.icon}</p>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
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
              <TrendingUp className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Workouts</p>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="workouts"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Meals chart */}
          <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Protein Meals</p>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                    }}
                  />
                  <defs>
                    <linearGradient id="mealsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="meals"
                    stroke="hsl(var(--primary))"
                    fill="url(#mealsGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Weight trend */}
          {weightData.length > 1 && (
            <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <p className="text-sm font-medium text-foreground">
                  Weight Trend
                </p>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weightData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={["dataMin - 2", "dataMax + 2"]}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.5rem",
                        fontSize: "12px",
                      }}
                    />
                    <defs>
                      <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="weight"
                      stroke="#22c55e"
                      fill="url(#weightGradient)"
                      strokeWidth={2}
                    />
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
