import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
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
  const { updateProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [athleteType, setAthleteType] = useState("Lifter");
  const [name, setName] = useState("");
  const [weightKg, setWeightKg] = useState(70);
  const [heightCm, setHeightCm] = useState(170);
  const [workoutsTarget, setWorkoutsTarget] = useState(4);
  const [mealsTarget, setMealsTarget] = useState(10);
  const [saving, setSaving] = useState(false);

  const steps = [
    { title: "What's your sport?", subtitle: "Choose your primary activity" },
    { title: "About you", subtitle: "We'll personalize your experience" },
    { title: "Set your goals", subtitle: "Weekly targets to keep you on track" },
  ];

  const handleFinish = async () => {
    setSaving(true);
    await updateProfile({
      displayName: name,
      athleteType,
      weightKg,
      heightCm,
      weeklyWorkoutsTarget: workoutsTarget,
      weeklyMealsTarget: mealsTarget,
      onboardingComplete: true,
    });
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

        {/* Step 0: Sport selection */}
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
                  <div
                    className={cn(
                      "p-2.5 rounded-xl",
                      athleteType === type.id ? "bg-primary/10" : "bg-muted"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-5 h-5",
                        athleteType === type.id
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                    />
                  </div>
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value))}
                  min={30}
                  max={300}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Height (cm)
                </label>
                <input
                  type="number"
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  min={100}
                  max={250}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Goals */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Weekly workouts target
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={7}
                  value={workoutsTarget}
                  onChange={(e) => setWorkoutsTarget(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="text-lg font-bold text-foreground w-8 text-center">
                  {workoutsTarget}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {workoutsTarget <= 2
                  ? "Easy start"
                  : workoutsTarget <= 4
                  ? "Solid routine"
                  : workoutsTarget <= 5
                  ? "Dedicated athlete"
                  : "Beast mode!"}
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Daily protein meals target
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={6}
                  value={Math.round(mealsTarget / 7)}
                  onChange={(e) => setMealsTarget(Number(e.target.value) * 7)}
                  className="flex-1 accent-primary"
                />
                <span className="text-lg font-bold text-foreground w-8 text-center">
                  {Math.round(mealsTarget / 7)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {mealsTarget / 7} meals/day = {mealsTarget} meals/week
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3 rounded-xl font-medium bg-muted text-foreground border border-border/50 hover:bg-muted/80 transition-all flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 py-3 rounded-xl font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className={cn(
                "flex-1 py-3 rounded-xl font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-2",
                saving && "opacity-50 cursor-not-allowed"
              )}
            >
              {saving ? "Saving..." : "Let's Go!"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
