import { useState } from "react";
import { AdaptiveSummary } from "./components/AdaptiveSummary";
import { cn } from "@/lib/utils";
import { Sun, Moon } from "lucide-react";

function App() {
  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [compactMode, setCompactMode] = useState(false);
  const [dark, setDark] = useState(false);

  // Demo data
  const demoProps = {
    athleteType: "Lifter",
    weightKg: 82,
    heightCm: 178,
    weeklyWorkoutsDone: 3,
    weeklyWorkoutsTarget: 4,
    weeklyMealsDone: 8,
    weeklyMealsTarget: 10,
    weeklyPR: true,
    monthlyWorkoutsDone: 14,
    monthlyWorkoutsTarget: 16,
    monthlyMealsDone: 35,
    monthlyMealsTarget: 40,
    monthlyPR: true,
  };

  return (
    <div className={cn(dark && "dark")}>
      <div className="min-h-screen bg-background transition-colors">
        <div className="max-w-md mx-auto px-4 py-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">Adaptive Summary</h1>
              <p className="text-sm text-muted-foreground">Fitness tracking dashboard</p>
            </div>
            <button
              onClick={() => setDark(!dark)}
              className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            {/* Mode toggle */}
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {(["weekly", "monthly"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {/* Compact toggle */}
            <button
              onClick={() => setCompactMode(!compactMode)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                compactMode
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Compact
            </button>
          </div>

          {/* Summary Card */}
          <AdaptiveSummary
            {...demoProps}
            mode={mode}
            compactMode={compactMode}
          />

          {/* Second card with different data */}
          <AdaptiveSummary
            athleteType="Runner"
            mode={mode}
            compactMode={compactMode}
            weightKg={68}
            heightCm={175}
            weeklyWorkoutsDone={5}
            weeklyWorkoutsTarget={5}
            weeklyMealsDone={10}
            weeklyMealsTarget={10}
            weeklyPR={false}
            monthlyWorkoutsDone={20}
            monthlyWorkoutsTarget={20}
            monthlyMealsDone={40}
            monthlyMealsTarget={40}
            monthlyPR={false}
          />

          {/* Third card - early progress */}
          <AdaptiveSummary
            athleteType="Swimmer"
            mode={mode}
            compactMode={compactMode}
            weightKg={74}
            heightCm={182}
            weeklyWorkoutsDone={1}
            weeklyWorkoutsTarget={4}
            weeklyMealsDone={3}
            weeklyMealsTarget={10}
            weeklyPR={false}
            monthlyWorkoutsDone={4}
            monthlyWorkoutsTarget={16}
            monthlyMealsDone={12}
            monthlyMealsTarget={40}
            monthlyPR={false}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
