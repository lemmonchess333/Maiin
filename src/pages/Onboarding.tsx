import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { calculateTDEE } from "@/lib/tdee";
import type { FitnessGoal } from "@/lib/tdee";
import { generateSchedule, DAY_LABELS } from "@/lib/scheduleUtils";
import type { ScheduleDay, DayType } from "@/lib/scheduleUtils";
import { THEME } from "@/lib/theme";
import {
  Dumbbell,
  Bike,
  Waves,
  PersonStanding,
  ChevronRight,
  ChevronLeft,
  Check,
  Footprints,
} from "lucide-react";

const ATHLETE_TYPES = [
  { id: "Lifter", label: "Lifter", icon: Dumbbell, desc: "Strength & hypertrophy" },
  { id: "Runner", label: "Runner", icon: PersonStanding, desc: "Cardio & endurance" },
  { id: "Swimmer", label: "Swimmer", icon: Waves, desc: "Swimming & aquatics" },
  { id: "Cyclist", label: "Cyclist", icon: Bike, desc: "Cycling & spinning" },
];

const GOALS = [
  { id: "cut", label: "Cut" },
  { id: "lean bulk", label: "Lean Bulk" },
  { id: "recomp", label: "Recomp" },
];

function SchedulePreview({
  schedule,
  onToggle,
}: {
  schedule: ScheduleDay[];
  onToggle: (day: number) => void;
}) {
  const typeColor = (type: DayType) => {
    if (type === "lift") return THEME.lifting;
    if (type === "run") return THEME.running;
    return undefined;
  };

  const typeLabel = (type: DayType) => {
    if (type === "lift") return "Lift";
    if (type === "run") return "Run";
    return "Rest";
  };

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {schedule
        .slice()
        .sort((a, b) => a.day - b.day)
        .map((s) => {
          const color = typeColor(s.type);
          return (
            <button
              key={s.day}
              onClick={() => onToggle(s.day)}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all text-center",
                s.type !== "rest"
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/50 bg-muted/30"
              )}
            >
              <span className="text-[10px] text-muted-foreground">
                {DAY_LABELS[s.day].charAt(0)}
              </span>
              {color ? (
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ) : (
                <div className="w-3 h-3 rounded-full bg-muted" />
              )}
              <span
                className="text-[9px] font-medium"
                style={{ color: color || "var(--muted-foreground)" }}
              >
                {typeLabel(s.type)}
              </span>
            </button>
          );
        })}
    </div>
  );
}

export default function Onboarding() {
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [athleteType, setAthleteType] = useState("Lifter");
  const [selectedGoal, setSelectedGoal] = useState<"cut" | "lean bulk" | "recomp">("recomp");
  const [name, setName] = useState("");
  const [age, setAge] = useState(25);
  const [weightKg, setWeightKg] = useState(70);
  const [heightCm, setHeightCm] = useState(170);
  const [liftDays, setLiftDays] = useState(3);
  const [runDays, setRunDays] = useState(2);
  const [mealsTarget] = useState(10);
  const [saving, setSaving] = useState(false);
  const [customSchedule, setCustomSchedule] = useState<ScheduleDay[] | null>(null);

  const tdee = useMemo(
    () => calculateTDEE(weightKg, heightCm, age, "moderate", selectedGoal as FitnessGoal),
    [weightKg, heightCm, age, selectedGoal]
  );

  const schedule = useMemo(() => {
    if (customSchedule) return customSchedule;
    return generateSchedule(liftDays, runDays);
  }, [liftDays, runDays, customSchedule]);

  // When sliders change, reset custom schedule
  const handleLiftChange = (val: number) => {
    setLiftDays(val);
    setCustomSchedule(null);
  };

  const handleRunChange = (val: number) => {
    setRunDays(val);
    setCustomSchedule(null);
  };

  // Toggle a day through lift -> run -> rest cycle
  const handleDayToggle = (day: number) => {
    const current = schedule.find((s) => s.day === day);
    if (!current) return;
    const cycle: DayType[] = ["lift", "run", "rest"];
    const nextIdx = (cycle.indexOf(current.type) + 1) % cycle.length;
    const updated = schedule.map((s) =>
      s.day === day ? { ...s, type: cycle[nextIdx] } : s
    );
    setCustomSchedule(updated);
    // Update slider counts to match
    setLiftDays(updated.filter((s) => s.type === "lift").length);
    setRunDays(updated.filter((s) => s.type === "run").length);
  };

  const steps = [
    { title: "What's your sport?", subtitle: "Choose your primary activity" },
    { title: "About you", subtitle: "We'll personalize your experience" },
    { title: "Set your goals", subtitle: "Define your training focus" },
    { title: "Your week", subtitle: "Plan your training schedule" },
  ];

  const totalSteps = steps.length;
  const lastStep = totalSteps - 1;

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);

    await setDoc(
      doc(db, "users", user.uid),
      {
        displayName: name,
        athleteType,
        age,
        weightKg,
        heightCm,
        weeklyWorkoutsTarget: liftDays,
        weeklyRunsTarget: runDays,
        weeklyMealsTarget: mealsTarget,
        weekSchedule: schedule,
        onboardingComplete: true,
        targetCalories: tdee.targetCalories,
        targetProtein: tdee.protein,
        targetCarbs: tdee.carbs,
        targetFat: tdee.fat,
        program: {
          goal: selectedGoal,
          startWeight: Number(weightKg),
          currentPhase: "base",
        },
      },
      { merge: true }
    );

    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Progress dots */}
        <div className="flex justify-center gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                i === step ? "bg-primary w-6" : i < step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Header */}
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-foreground">{steps[step].title}</h2>
          <p className="text-sm text-muted-foreground">{steps[step].subtitle}</p>
        </div>

        {/* Step 0: Sport */}
        {step === 0 && (
          <div className="space-y-3">
            {ATHLETE_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => setAthleteType(type.id)}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-xl border transition-all",
                    athleteType === type.id
                      ? "border-primary bg-primary/5"
                      : "border-border/50 bg-card hover:border-border"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <div className="text-left flex-1">
                    <p className="font-medium text-foreground">{type.label}</p>
                    <p className="text-xs text-muted-foreground">{type.desc}</p>
                  </div>
                  {athleteType === type.id && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Step 1: About you */}
        {step === 1 && (
          <div className="space-y-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground"
            />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value) || 25)}
                placeholder="25"
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Weight (kg)</label>
                <input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Height (cm)</label>
                <input
                  type="number"
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Goals */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-medium">Select Goal</p>
              <div className="flex gap-2">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGoal(g.id as any)}
                    className={cn(
                      "flex-1 py-2 rounded-lg border text-sm",
                      selectedGoal === g.id
                        ? "bg-primary text-white border-primary"
                        : "bg-muted border-border/50"
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-primary/5 rounded-xl p-4 space-y-2 border border-primary/10">
              <p className="text-xs font-medium text-foreground">
                Your daily target: <span className="text-primary">{tdee.targetCalories} cal</span>
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-bold text-blue-500">{tdee.protein}g</p>
                  <p className="text-[10px] text-muted-foreground">Protein</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-500">{tdee.carbs}g</p>
                  <p className="text-[10px] text-muted-foreground">Carbs</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-pink-500">{tdee.fat}g</p>
                  <p className="text-[10px] text-muted-foreground">Fat</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Weekly schedule */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-muted-foreground flex items-center gap-2">
                    <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
                    Lift days
                  </label>
                  <span className="text-sm font-bold" style={{ color: THEME.lifting }}>
                    {liftDays}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={7 - runDays}
                  value={liftDays}
                  onChange={(e) => handleLiftChange(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-muted-foreground flex items-center gap-2">
                    <Footprints className="w-4 h-4" style={{ color: THEME.running }} />
                    Run days
                  </label>
                  <span className="text-sm font-bold" style={{ color: THEME.running }}>
                    {runDays}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={7 - liftDays}
                  value={runDays}
                  onChange={(e) => handleRunChange(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                {7 - liftDays - runDays} rest day{7 - liftDays - runDays !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Your week</p>
              <SchedulePreview schedule={schedule} onToggle={handleDayToggle} />
              <p className="text-[10px] text-muted-foreground text-center">
                Tap a day to change it
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3 rounded-xl bg-muted"
            >
              <ChevronLeft className="w-4 h-4 inline" /> Back
            </button>
          )}

          {step < lastStep ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 py-3 rounded-xl bg-primary text-white"
            >
              Next <ChevronRight className="w-4 h-4 inline" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-primary text-white"
            >
              {saving ? "Saving..." : "Let's Go!"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
