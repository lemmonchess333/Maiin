import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { calculateTDEE } from "@/lib/tdee";
import type { FitnessGoal } from "@/lib/tdee";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  Dumbbell,
  Bike,
  Waves,
  PersonStanding,
  ChevronRight,
  ChevronLeft,
  Check,
} from "lucide-react";

const ATHLETE_TYPES = [
  { id: "Lifter", label: "Lifter", icon: Dumbbell, desc: "Strength & hypertrophy" },
  { id: "Runner", label: "Runner", icon: PersonStanding, desc: "Cardio & endurance" },
  { id: "Swimmer", label: "Swimmer", icon: Waves, desc: "Swimming & aquatics" },
  { id: "Cyclist", label: "Cyclist", icon: Bike, desc: "Cycling & spinning" },
];

export default function Onboarding() {
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [athleteType, setAthleteType] = useState("Lifter");
  const [selectedGoal, setSelectedGoal] = useState<"cut" | "lean bulk" | "recomp">("recomp");
  const [name, setName] = useState("");
  const [age, setAge] = useState(25);
  const [weightKg, setWeightKg] = useState(70);
  const [heightCm, setHeightCm] = useState(170);
  const [liftDays] = useState(3);
  const [runDays] = useState(2);
  const [mealsTarget] = useState(10);
  const [runMode] = useState<"freeform" | "structured" | "race_prep">("freeform");
  const [weeklyRunDays] = useState(3);
  const [raceDistance] = useState<"5k" | "10k" | "half" | "marathon">("10k");
  const [raceTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [activityLevel, setActivityLevel] = useState<"sedentary" | "light" | "moderate" | "active" | "very_active">("moderate");

  const tdee = useMemo(
    () => calculateTDEE(weightKg, heightCm, age, activityLevel, selectedGoal as FitnessGoal),
    [weightKg, heightCm, age, selectedGoal, activityLevel]
  );

  const schedule = useMemo(() => {
    return generateSchedule(liftDays, runDays);
  }, [liftDays, runDays]);

  const ACTIVITY_OPTIONS = [
    { id: "sedentary" as const, label: "Sedentary", example: "Desk job, little exercise" },
    { id: "light" as const, label: "Lightly Active", example: "1-3 days/week" },
    { id: "moderate" as const, label: "Moderately Active", example: "3-5 days/week" },
    { id: "active" as const, label: "Very Active", example: "6-7 days/week" },
    { id: "very_active" as const, label: "Athlete", example: "Twice daily training" },
  ];

  const steps = [
    { title: "What's your name?", subtitle: "Let's get to know you" },
    { title: "What's your goal?", subtitle: "We'll tailor everything to this" },
    { title: "How do you train?", subtitle: "Select all that apply" },
    { title: "Quick stats", subtitle: "For accurate calorie targets" },
    { title: "Activity level", subtitle: "How active are you day-to-day?" },
    { title: "Here's your plan", subtitle: "Personalized just for you" },
  ];

  const lastStep = steps.length - 1;

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);

    const data: Record<string, unknown> = {
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
      runMode,
      tdeeBase: tdee.targetCalories,
      aiCalorieAdjustment: 0,
      targetCalories: tdee.targetCalories,
      targetProtein: tdee.protein,
      targetCarbs: tdee.carbs,
      targetFat: tdee.fat,
      macroTargets: {
        calories: tdee.targetCalories,
        protein: tdee.protein,
        carbs: tdee.carbs,
        fat: tdee.fat,
      },
      program: {
        goal: selectedGoal,
        startWeight: Number(weightKg),
        currentPhase: "base",
      },
    };

    if (runMode !== "freeform") {
      data.weeklyRunDaysTarget = weeklyRunDays;
    }
    if (runMode === "race_prep" && raceTargetDate) {
      data.raceGoal = { distance: raceDistance, targetDate: raceTargetDate };
    }

    await setDoc(doc(db, "users", user.uid), data, { merge: true });

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

        {/* Step 0: Name */}
        {step === 0 && (
          <div className="space-y-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              className="w-full px-4 py-4 rounded-xl bg-muted border border-border/50 text-foreground text-lg text-center"
            />
          </div>
        )}

        {/* Step 1: Goal */}
        {step === 1 && (
          <div className="space-y-3">
            {[
              { id: "cut", label: "Lose Fat", icon: "🔥", desc: "Reduce body fat while preserving muscle" },
              { id: "lean bulk", label: "Build Muscle", icon: "💪", desc: "Gain lean mass with minimal fat" },
              { id: "recomp", label: "Get Faster", icon: "⚡", desc: "Improve performance and body composition" },
            ].map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGoal(g.id as any)}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-xl border transition-all",
                  selectedGoal === g.id
                    ? "border-primary bg-primary/5"
                    : "border-border/50 bg-card hover:border-border"
                )}
              >
                <span className="text-2xl">{g.icon}</span>
                <div className="text-left flex-1">
                  <p className="font-medium text-foreground">{g.label}</p>
                  <p className="text-xs text-muted-foreground">{g.desc}</p>
                </div>
                {selectedGoal === g.id && <Check className="w-5 h-5 text-primary" />}
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Training type */}
        {step === 2 && (
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
                  {athleteType === type.id && <Check className="w-5 h-5 text-primary" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Step 3: Quick stats */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value) || 25)}
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

        {/* Step 4: Activity level */}
        {step === 4 && (
          <div className="space-y-2">
            {ACTIVITY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setActivityLevel(opt.id)}
                className={cn(
                  "w-full flex items-center justify-between p-4 rounded-xl border transition-all",
                  activityLevel === opt.id
                    ? "border-primary bg-primary/5"
                    : "border-border/50 bg-card hover:border-border"
                )}
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.example}</p>
                </div>
                {activityLevel === opt.id && <Check className="w-5 h-5 text-primary" />}
              </button>
            ))}
          </div>
        )}

        {/* Step 5: Plan reveal */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="bg-primary/5 rounded-2xl p-6 space-y-4 border border-primary/10">
              <p className="text-center text-xs font-medium text-muted-foreground">YOUR DAILY TARGETS</p>
              <p className="text-center text-4xl font-bold text-primary">{tdee.targetCalories}</p>
              <p className="text-center text-xs text-muted-foreground">calories per day</p>
              <div className="grid grid-cols-3 gap-3 text-center pt-2">
                <div>
                  <p className="text-lg font-bold text-blue-500">{tdee.protein}g</p>
                  <p className="text-[10px] text-muted-foreground">Protein</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-500">{tdee.carbs}g</p>
                  <p className="text-[10px] text-muted-foreground">Carbs</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-pink-500">{tdee.fat}g</p>
                  <p className="text-[10px] text-muted-foreground">Fat</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              These targets adapt as you log meals and workouts
            </p>
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


