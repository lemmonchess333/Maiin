import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { calculateTDEE } from "@/lib/tdee";
import type { FitnessGoal } from "@/lib/tdee";
import {
  Dumbbell,
  Bike,
  Waves,
  PersonStanding,
  ChevronRight,
  ChevronLeft,
  Check,
  Footprints,
  Target,
  Calendar,
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

const RUN_MODES = [
  { id: "freeform", label: "Freeform", icon: Footprints, desc: "Log runs whenever you want" },
  { id: "structured", label: "Structured", icon: Calendar, desc: "Auto-scheduled run days each week" },
  { id: "race_prep", label: "Race Prep", icon: Target, desc: "Periodized plan for a race goal" },
] as const;

const RACE_DISTANCES = [
  { id: "5k", label: "5K" },
  { id: "10k", label: "10K" },
  { id: "half", label: "Half Marathon" },
  { id: "marathon", label: "Marathon" },
] as const;

export default function Onboarding() {
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [athleteType, setAthleteType] = useState("Lifter");
  const [selectedGoal, setSelectedGoal] = useState<"cut" | "lean bulk" | "recomp">("recomp");
  const [name, setName] = useState("");
  const [age, setAge] = useState(25);
  const [weightKg, setWeightKg] = useState(70);
  const [heightCm, setHeightCm] = useState(170);
  const [workoutsTarget] = useState(4);
  const [mealsTarget] = useState(10);
  const [runMode, setRunMode] = useState<"freeform" | "structured" | "race_prep">("freeform");
  const [weeklyRunDays, setWeeklyRunDays] = useState(3);
  const [raceDistance, setRaceDistance] = useState<"5k" | "10k" | "half" | "marathon">("10k");
  const [raceTargetDate, setRaceTargetDate] = useState("");
  const [saving, setSaving] = useState(false);

  const tdee = useMemo(
    () => calculateTDEE(weightKg, heightCm, age, "moderate", selectedGoal as FitnessGoal),
    [weightKg, heightCm, age, selectedGoal]
  );

  const steps = [
    { title: "What's your sport?", subtitle: "Choose your primary activity" },
    { title: "About you", subtitle: "We'll personalize your experience" },
    { title: "Set your goals", subtitle: "Define your training focus" },
    { title: "Running plan", subtitle: "How do you want to run?" },
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
      weeklyWorkoutsTarget: workoutsTarget,
      weeklyMealsTarget: mealsTarget,
      onboardingComplete: true,
      runMode,

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

        {/* Step 0 */}
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

        {/* Step 1 */}
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

        {/* Step 2 */}
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

            {/* TDEE preview from setup data */}
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

        {/* Step 3: Running plan */}
        {step === 3 && (
          <div className="space-y-4">
            {RUN_MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => setRunMode(mode.id)}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-xl border transition-all",
                    runMode === mode.id
                      ? "border-primary bg-primary/5"
                      : "border-border/50 bg-card hover:border-border"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <div className="text-left flex-1">
                    <p className="font-medium text-foreground">{mode.label}</p>
                    <p className="text-xs text-muted-foreground">{mode.desc}</p>
                  </div>
                  {runMode === mode.id && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </button>
              );
            })}

            {runMode !== "freeform" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Run days per week
                </label>
                <div className="flex gap-2">
                  {[2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setWeeklyRunDays(n)}
                      className={cn(
                        "flex-1 py-2 rounded-lg border text-sm",
                        weeklyRunDays === n
                          ? "bg-primary text-white border-primary"
                          : "bg-muted border-border/50"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {runMode === "race_prep" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Race distance
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {RACE_DISTANCES.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setRaceDistance(d.id)}
                        className={cn(
                          "py-2 rounded-lg border text-sm",
                          raceDistance === d.id
                            ? "bg-primary text-white border-primary"
                            : "bg-muted border-border/50"
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Race date
                  </label>
                  <input
                    type="date"
                    value={raceTargetDate}
                    onChange={(e) => setRaceTargetDate(e.target.value)}
                    min={new Date(Date.now() + 21 * 86400000).toISOString().split("T")[0]}
                    className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground"
                  />
                </div>
              </>
            )}
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