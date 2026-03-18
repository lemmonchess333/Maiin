import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { UserProfile } from "@/lib/auth";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { calculateTDEE } from "@/lib/tdee";
import type { FitnessGoal, ActivityLevel } from "@/lib/tdee";
import { THEME } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
import { PROGRAM_TEMPLATES } from "@/features/program/templates";
import type { ProgramTemplate, TemplateExercise } from "@/features/program/templates";
import { matchTemplate, applyInjuryFilters } from "@/features/program/matchTemplate";
import type { ProgramState, WorkoutDay, ProgramExercise, SplitType } from "@/features/program/programTypes";
import {
  ChevronRight,
  Check,
  Dumbbell,
  Flame,
  Zap,
  Footprints,
  User,
  Heart,
  Ruler,
  Target,
  Award,
  Calendar,
  Warehouse,
  LayoutGrid,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ============================
   TYPES
============================ */

type Gender = "male" | "female" | "unspecified";
type AgeRange = "under-16" | "16-24" | "25-34" | "35-44" | "45-54" | "55+";
type PrimaryGoal = "hypertrophy" | "strength" | "fat_loss" | "general" | "running";
type Experience = "beginner" | "intermediate" | "advanced";
type DaysPerWeek = 2 | 3 | 4 | 5 | 6;
type Equipment = "full_gym" | "home_gym" | "minimal";
type PreferredSplit = "full_body" | "upper_lower" | "ppl" | "bro_split" | "auto";
type RunFrequency = "regular" | "occasional" | "none";

/* ============================
   HELPERS
============================ */

const AGE_MIDPOINTS: Record<AgeRange, number> = {
  "under-16": 14,
  "16-24": 20,
  "25-34": 30,
  "35-44": 40,
  "45-54": 50,
  "55+": 60,
};

function goalToFitnessGoal(g: PrimaryGoal): FitnessGoal {
  if (g === "fat_loss") return "cut";
  if (g === "hypertrophy") return "lean bulk";
  return "recomp";
}

function templateSplitToSplitType(s: ProgramTemplate["split"]): SplitType {
  switch (s) {
    case "full_body": return "full_body";
    case "upper_lower": return "upper_lower";
    case "ppl": return "ppl";
    case "bro_split": return "ppl"; // closest match
  }
}

function templateExToProgEx(te: TemplateExercise): ProgramExercise {
  const repNum = parseInt(te.reps, 10) || 8;
  return {
    name: te.name,
    exerciseId: te.exerciseId,
    movementCategory: "horizontal_push",
    sets: te.sets,
    reps: repNum,
    weight: 0,
    progressionType: "linear",
    lastSuccessfulWeight: 0,
    lastAttemptedWeight: 0,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  };
}

function templateToProgramState(template: ProgramTemplate, goal: FitnessGoal): ProgramState {
  const week1 = template.weeks[0];
  const workouts: WorkoutDay[] = week1.days
    .filter(d => d.type === "lift")
    .map(d => ({
      dayName: d.name,
      dayType: d.type,
      exercises: d.exercises.map(templateExToProgEx),
      completed: false,
    }));

  return {
    goal,
    currentPhase: "base",
    weekNumber: 1,
    splitType: templateSplitToSplitType(template.split),
    workouts,
    fatigueScore: 0,
    updatedAt: Date.now(),
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
  };
}

function splitLabel(s: PreferredSplit): string {
  switch (s) {
    case "full_body": return "Full Body";
    case "upper_lower": return "Upper / Lower";
    case "ppl": return "Push / Pull / Legs";
    case "bro_split": return "Bro Split";
    case "auto": return "Auto-assigned";
  }
}

function goalLabel(g: PrimaryGoal): string {
  switch (g) {
    case "hypertrophy": return "Hypertrophy focus";
    case "strength": return "Strength focus";
    case "fat_loss": return "Fat loss focus";
    case "general": return "General fitness";
    case "running": return "Running focus";
  }
}

function runFreqLabel(r: RunFrequency): string {
  switch (r) {
    case "regular": return "Runs 3x/week integrated";
    case "occasional": return "Runs 1-2x/week integrated";
    case "none": return "No running";
  }
}

function experienceLabel(e: Experience): string {
  switch (e) {
    case "beginner": return "Beginner";
    case "intermediate": return "Intermediate";
    case "advanced": return "Advanced";
  }
}

function equipmentLabel(e: Equipment): string {
  switch (e) {
    case "full_gym": return "Full gym";
    case "home_gym": return "Home gym";
    case "minimal": return "Minimal";
  }
}

/* ============================
   STEP DEFINITIONS
============================ */

const TOTAL_STEPS = 11;

const STEP_META: { title: string; subtitle: string }[] = [
  { title: "What's your gender?", subtitle: "This helps us personalize your plan" },
  { title: "How old are you?", subtitle: "We'll tailor intensity recommendations" },
  { title: "Your body metrics", subtitle: "Used to calculate calories and macros" },
  { title: "What's your primary goal?", subtitle: "We'll build your program around this" },
  { title: "Experience level", subtitle: "So we program the right volume and intensity" },
  { title: "Training days per week", subtitle: "How many days can you commit?" },
  { title: "Equipment access", subtitle: "We'll choose exercises you can actually do" },
  { title: "Preferred training style", subtitle: "Pick a split or let us decide" },
  { title: "Do you run?", subtitle: "We'll weave runs into your schedule" },
  { title: "Any injuries?", subtitle: "We'll program around limitations" },
  { title: "Your plan is ready", subtitle: "Review your selections and let's go" },
];

/* ============================
   COMPONENT
============================ */

export default function Onboarding() {
  const { user, profile, updateProfile } = useAuth();
  const location = useLocation();
  const isRetake = !!(location.state as { retake?: boolean } | null)?.retake;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Step 0: Gender
  const [gender, setGender] = useState<Gender>("unspecified");

  // ── Step 1: Age range
  const [ageRange, setAgeRange] = useState<AgeRange>("25-34");

  // ── Step 2: Body metrics
  const [heightCm, setHeightCm] = useState(175);
  const [weightKg, setWeightKg] = useState(75);
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("cm");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");

  // ── Step 3: Primary goal
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>("hypertrophy");

  // ── Step 4: Experience
  const [experience, setExperience] = useState<Experience>("intermediate");

  // ── Step 5: Days per week
  const [daysPerWeek, setDaysPerWeek] = useState<DaysPerWeek>(4);

  // ── Step 6: Equipment
  const [equipment, setEquipment] = useState<Equipment>("full_gym");

  // ── Step 7: Preferred split
  const [preferredSplit, setPreferredSplit] = useState<PreferredSplit>("auto");

  // ── Step 8: Run frequency
  const [runFrequency, setRunFrequency] = useState<RunFrequency>("occasional");

  // ── Step 9: Injuries
  const [injuries, setInjuries] = useState<string[]>([]);
  const [otherInjuryText, setOtherInjuryText] = useState("");

  // ── Pre-populate from profile in retake mode
  useEffect(() => {
    if (isRetake && profile) {
      if (profile.gender) setGender(profile.gender);
      if (profile.ageRange) setAgeRange(profile.ageRange);
      if (profile.heightCm) setHeightCm(profile.heightCm);
      if (profile.weightKg) setWeightKg(profile.weightKg);
      if (profile.preferredHeightUnit) setHeightUnit(profile.preferredHeightUnit);
      if (profile.preferredWeightUnit) setWeightUnit(profile.preferredWeightUnit);
      if (profile.primaryGoal) setPrimaryGoal(profile.primaryGoal);
      if (profile.experience) setExperience(profile.experience);
      if (profile.daysPerWeek) setDaysPerWeek(profile.daysPerWeek);
      if (profile.equipment) setEquipment(profile.equipment);
      if (profile.preferredSplit) setPreferredSplit(profile.preferredSplit);
      if (profile.runFrequency) setRunFrequency(profile.runFrequency);
      if (profile.injuries) {
        const knownInjuries = ["none", "lower_back", "shoulder", "knee"];
        const known = profile.injuries.filter(i => knownInjuries.includes(i));
        const other = profile.injuries.filter(i => !knownInjuries.includes(i) && i !== "other");
        setInjuries([...known, ...(other.length > 0 ? ["other"] : [])]);
        if (other.length > 0) setOtherInjuryText(other.join(", "));
      }
    }
  }, [isRetake, profile]);

  // ── Derived values
  const displayHeight = heightUnit === "ft"
    ? `${Math.floor(heightCm / 30.48)}'${Math.round((heightCm % 30.48) / 2.54)}"`
    : `${heightCm} cm`;

  const displayWeight = weightUnit === "lbs"
    ? `${Math.round(weightKg * 2.205)} lbs`
    : `${weightKg} kg`;

  const heightStepSize = heightUnit === "ft" ? 2.54 : 1; // ~1 inch or 1 cm
  const weightStepSize = weightUnit === "lbs" ? 0.45 : 1; // ~1 lb or 1 kg

  // Activity level from days per week
  const activityLevel = useMemo((): ActivityLevel => {
    if (daysPerWeek >= 6) return "very_active";
    if (daysPerWeek >= 4) return "moderate";
    return "light";
  }, [daysPerWeek]);

  // TDEE computation
  const tdee = useMemo(
    () => calculateTDEE(
      weightKg,
      heightCm,
      AGE_MIDPOINTS[ageRange],
      activityLevel,
      goalToFitnessGoal(primaryGoal),
      gender === "female" ? "female" : "male",
    ),
    [weightKg, heightCm, ageRange, activityLevel, primaryGoal, gender]
  );

  // Split compatibility check
  function isSplitDisabled(split: PreferredSplit): boolean {
    if (split === "ppl" && daysPerWeek < 5) return true;
    if (split === "bro_split" && daysPerWeek < 5) return true;
    if (split === "upper_lower" && daysPerWeek < 4) return true;
    return false;
  }

  // Can advance per step
  const canAdvance: boolean[] = [
    true,                                   // 0: gender (always has default)
    ageRange !== "under-16",                // 1: age range (blocks under 16)
    weightKg > 0 && heightCm > 0,           // 2: body metrics
    true,                                   // 3: primary goal
    true,                                   // 4: experience
    true,                                   // 5: days per week
    true,                                   // 6: equipment
    !isSplitDisabled(preferredSplit),        // 7: preferred split
    true,                                   // 8: run frequency
    injuries.length > 0,                    // 9: injuries (must select at least one, including "none")
    true,                                   // 10: confirmation
  ];

  // ── Save handler
  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Build injuries array for Firestore
      const injuriesForSave = injuries.includes("other") && otherInjuryText.trim()
        ? [...injuries.filter(i => i !== "other"), otherInjuryText.trim()]
        : injuries;

      const data: Record<string, unknown> = {
        gender,
        ageRange,
        heightCm,
        weightKg,
        preferredHeightUnit: heightUnit,
        preferredWeightUnit: weightUnit,
        primaryGoal,
        experience,
        daysPerWeek,
        equipment,
        preferredSplit,
        runFrequency,
        injuries: injuriesForSave,
        onboardingComplete: true,
        // TDEE targets
        age: AGE_MIDPOINTS[ageRange],
        sex: gender === "female" ? "female" : "male",
        activityLevel,
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
          goal: goalToFitnessGoal(primaryGoal),
          startWeight: weightKg,
          currentPhase: "base",
        },
      };

      // ── Match & assign program template ──
      const profileForMatch = {
        daysPerWeek,
        equipment,
        gender,
        preferredSplit: preferredSplit as "full_body" | "upper_lower" | "ppl" | "bro_split" | "auto",
        primaryGoal,
        experience,
        runFrequency,
        injuries: injuriesForSave,
      };
      const matched = matchTemplate(profileForMatch as Parameters<typeof matchTemplate>[0], PROGRAM_TEMPLATES);
      const filtered = applyInjuryFilters(matched, injuriesForSave);
      const fitnessGoal = goalToFitnessGoal(primaryGoal);
      const programState = templateToProgramState(filtered, fitnessGoal);
      const programRef = doc(db, "users", user.uid, "programState", "current");
      await setDoc(programRef, programState);

      // Update profile last — this updates local state and triggers router transition
      await updateProfile(data as Partial<UserProfile>);
    } catch (err) {
      console.error("Onboarding save failed:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /* ────────────────────────────────
     OPTION CARD COMPONENT
  ──────────────────────────────── */

  function OptionCard({
    selected,
    onSelect,
    icon,
    label,
    desc,
    disabled,
  }: {
    selected: boolean;
    onSelect: () => void;
    icon: React.ReactNode;
    label: string;
    desc?: string;
    disabled?: boolean;
  }) {
    return (
      <button
        onClick={onSelect}
        disabled={disabled}
        className={cn(
          "w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.93]",
          disabled && "opacity-30 pointer-events-none"
        )}
        style={{
          background: selected ? `${THEME.teal}18` : "rgba(255,255,255,0.05)",
          border: `1px solid ${selected ? THEME.teal + "50" : "rgba(255,255,255,0.08)"}`,
        }}
      >
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          {desc && (
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {desc}
            </p>
          )}
        </div>
        {selected && !disabled && (
          <Check className="w-4 h-4 flex-shrink-0" style={{ color: THEME.teal }} />
        )}
      </button>
    );
  }

  /* ────────────────────────────────
     STEPPER COMPONENT
  ──────────────────────────────── */

  function Stepper({
    label,
    value,
    displayValue,
    onDecrement,
    onIncrement,
    unit,
  }: {
    label: string;
    value: number;
    displayValue?: string;
    onDecrement: () => void;
    onIncrement: () => void;
    unit?: string;
  }) {
    return (
      <div
        className="rounded-2xl p-4 text-center"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <p
          className="text-[9px] uppercase tracking-wider mb-2"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {label}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onDecrement}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold active:scale-[0.93] transition-transform"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            −
          </button>
          <span className="text-xl font-bold font-mono tabular-nums min-w-[60px] text-center">
            {displayValue ?? value}
          </span>
          <button
            onClick={onIncrement}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold active:scale-[0.93] transition-transform"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            +
          </button>
        </div>
        {unit && (
          <p className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
            {unit}
          </p>
        )}
      </div>
    );
  }

  /* ────────────────────────────────
     RENDER
  ──────────────────────────────── */

  return (
    <div
      className="min-h-screen flex flex-col px-5 pb-10 pt-safe"
      style={{ background: THEME.bg, color: THEME.textPrimary }}
    >
      {/* ── Progress bar ── */}
      <div className="flex gap-1.5 pt-14 pb-6">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            <motion.div
              className="h-full rounded-full"
              animate={{ width: i <= step ? "100%" : "0%" }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{ background: THEME.teal }}
            />
          </div>
        ))}
      </div>

      {/* ── Step content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22 }}
          className="flex-1 overflow-y-auto"
        >
          <p
            className="text-[10px] uppercase tracking-widest mb-2"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Step {step + 1} of {TOTAL_STEPS}
          </p>
          <h1 className="text-2xl font-bold mb-1">{STEP_META[step].title}</h1>
          <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.45)" }}>
            {STEP_META[step].subtitle}
          </p>

          {/* ════════════════════════════════
             STEP 0 — Gender
          ════════════════════════════════ */}
          {step === 0 && (
            <div className="space-y-2">
              {([
                { id: "male" as Gender, label: "Male", icon: <User size={22} style={{ color: THEME.lifting }} /> },
                { id: "female" as Gender, label: "Female", icon: <Heart size={22} style={{ color: THEME.running }} /> },
                { id: "unspecified" as Gender, label: "Prefer not to say", icon: <User size={22} style={{ color: THEME.textSecondary }} /> },
              ]).map(opt => (
                <OptionCard
                  key={opt.id}
                  selected={gender === opt.id}
                  onSelect={() => setGender(opt.id)}
                  icon={opt.icon}
                  label={opt.label}
                />
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 1 — Age Range
          ════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-2">
              {([
                { id: "under-16" as AgeRange, label: "Under 16" },
                { id: "16-24" as AgeRange, label: "16 – 24" },
                { id: "25-34" as AgeRange, label: "25 – 34" },
                { id: "35-44" as AgeRange, label: "35 – 44" },
                { id: "45-54" as AgeRange, label: "45 – 54" },
                { id: "55+" as AgeRange, label: "55+" },
              ]).map(opt => (
                <OptionCard
                  key={opt.id}
                  selected={ageRange === opt.id}
                  onSelect={() => setAgeRange(opt.id)}
                  icon={<Calendar size={22} style={{ color: THEME.brand }} />}
                  label={opt.label}
                />
              ))}
              {ageRange === "under-16" && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="font-medium">Age requirement not met</span>
                  </div>
                  <p className="text-xs text-red-500/80 dark:text-red-400/80">
                    Tropos is only available for users aged 16 and over. Please check back when you meet the age requirement.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 2 — Body Metrics
          ════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Height */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Ruler size={16} style={{ color: THEME.teal }} />
                    <span className="text-xs font-medium">Height</span>
                  </div>
                  <div className="flex gap-1">
                    {(["cm", "ft"] as const).map(u => (
                      <button
                        key={u}
                        onClick={() => setHeightUnit(u)}
                        className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all"
                        style={{
                          background: heightUnit === u ? THEME.teal : "rgba(255,255,255,0.08)",
                          color: heightUnit === u ? "#000" : "rgba(255,255,255,0.5)",
                        }}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                <Stepper
                  label="Height"
                  value={heightCm}
                  displayValue={displayHeight}
                  onDecrement={() => setHeightCm(v => Math.max(100, Math.round(v - heightStepSize)))}
                  onIncrement={() => setHeightCm(v => Math.min(250, Math.round(v + heightStepSize)))}
                />
              </div>

              {/* Weight */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Dumbbell size={16} style={{ color: THEME.teal }} />
                    <span className="text-xs font-medium">Weight</span>
                  </div>
                  <div className="flex gap-1">
                    {(["kg", "lbs"] as const).map(u => (
                      <button
                        key={u}
                        onClick={() => setWeightUnit(u)}
                        className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all"
                        style={{
                          background: weightUnit === u ? THEME.teal : "rgba(255,255,255,0.08)",
                          color: weightUnit === u ? "#000" : "rgba(255,255,255,0.5)",
                        }}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                <Stepper
                  label="Weight"
                  value={weightKg}
                  displayValue={displayWeight}
                  onDecrement={() => setWeightKg(v => Math.max(30, parseFloat((v - weightStepSize).toFixed(1))))}
                  onIncrement={() => setWeightKg(v => Math.min(250, parseFloat((v + weightStepSize).toFixed(1))))}
                />
              </div>
            </div>
          )}

          {/* ════════════════════════════════
             STEP 3 — Primary Goal
          ════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-2">
              {([
                { id: "hypertrophy" as PrimaryGoal, label: "Build muscle", desc: "Maximize muscle growth with hypertrophy training", icon: <Dumbbell size={22} style={{ color: THEME.lifting }} /> },
                { id: "strength" as PrimaryGoal, label: "Get stronger", desc: "Focus on compound lifts and progressive overload", icon: <Zap size={22} style={{ color: THEME.warning }} /> },
                { id: "fat_loss" as PrimaryGoal, label: "Lose fat", desc: "Calorie deficit with muscle preservation", icon: <Flame size={22} style={{ color: THEME.running }} /> },
                { id: "general" as PrimaryGoal, label: "General fitness", desc: "Balanced strength, cardio, and mobility", icon: <Heart size={22} style={{ color: THEME.success }} /> },
                { id: "running" as PrimaryGoal, label: "Improve running", desc: "Run-focused with complementary strength work", icon: <Footprints size={22} style={{ color: THEME.running }} /> },
              ]).map(opt => (
                <OptionCard
                  key={opt.id}
                  selected={primaryGoal === opt.id}
                  onSelect={() => setPrimaryGoal(opt.id)}
                  icon={opt.icon}
                  label={opt.label}
                  desc={opt.desc}
                />
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 4 — Experience Level
          ════════════════════════════════ */}
          {step === 4 && (
            <div className="space-y-2">
              {([
                { id: "beginner" as Experience, label: "Beginner", desc: "0 – 6 months of consistent training", icon: <Target size={22} style={{ color: THEME.success }} /> },
                { id: "intermediate" as Experience, label: "Intermediate", desc: "6 months – 2 years of training", icon: <Award size={22} style={{ color: THEME.brand }} /> },
                { id: "advanced" as Experience, label: "Advanced", desc: "2+ years of structured training", icon: <Sparkles size={22} style={{ color: THEME.warning }} /> },
              ]).map(opt => (
                <OptionCard
                  key={opt.id}
                  selected={experience === opt.id}
                  onSelect={() => setExperience(opt.id)}
                  icon={opt.icon}
                  label={opt.label}
                  desc={opt.desc}
                />
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 5 — Days Per Week
          ════════════════════════════════ */}
          {step === 5 && (
            <div className="grid grid-cols-5 gap-2">
              {([2, 3, 4, 5, 6] as DaysPerWeek[]).map(d => (
                <button
                  key={d}
                  onClick={() => {
                    setDaysPerWeek(d);
                    // Reset split if incompatible
                    if (d < 5 && (preferredSplit === "ppl" || preferredSplit === "bro_split")) {
                      setPreferredSplit("auto");
                    }
                    if (d < 4 && preferredSplit === "upper_lower") {
                      setPreferredSplit("auto");
                    }
                  }}
                  className="flex flex-col items-center gap-2 py-5 rounded-2xl transition-all active:scale-[0.93]"
                  style={{
                    background: daysPerWeek === d ? `${THEME.teal}20` : "rgba(255,255,255,0.05)",
                    border: `1px solid ${daysPerWeek === d ? THEME.teal + "50" : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  <span
                    className="text-2xl font-bold font-mono"
                    style={{ color: daysPerWeek === d ? THEME.teal : "rgba(255,255,255,0.5)" }}
                  >
                    {d}
                  </span>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                    days
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 6 — Equipment Access
          ════════════════════════════════ */}
          {step === 6 && (
            <div className="space-y-2">
              {([
                { id: "full_gym" as Equipment, label: "Full gym", desc: "Barbells, dumbbells, cables, machines", icon: <Warehouse size={22} style={{ color: THEME.lifting }} /> },
                { id: "home_gym" as Equipment, label: "Home gym", desc: "Dumbbells, bench, pull-up bar", icon: <Dumbbell size={22} style={{ color: THEME.brand }} /> },
                { id: "minimal" as Equipment, label: "Minimal / bodyweight", desc: "Bands, bodyweight, maybe dumbbells", icon: <User size={22} style={{ color: THEME.success }} /> },
              ]).map(opt => (
                <OptionCard
                  key={opt.id}
                  selected={equipment === opt.id}
                  onSelect={() => setEquipment(opt.id)}
                  icon={opt.icon}
                  label={opt.label}
                  desc={opt.desc}
                />
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 7 — Preferred Split
          ════════════════════════════════ */}
          {step === 7 && (
            <div className="space-y-2">
              {([
                { id: "full_body" as PreferredSplit, label: "Full Body", desc: "Hit everything each session", icon: <User size={22} style={{ color: THEME.success }} /> },
                { id: "upper_lower" as PreferredSplit, label: "Upper / Lower", desc: "Alternate upper and lower days (4+ days)", icon: <LayoutGrid size={22} style={{ color: THEME.brand }} /> },
                { id: "ppl" as PreferredSplit, label: "Push / Pull / Legs", desc: "Classic PPL rotation (5-6 days)", icon: <Dumbbell size={22} style={{ color: THEME.lifting }} /> },
                { id: "bro_split" as PreferredSplit, label: "Bro Split", desc: "One muscle group per day (5-6 days)", icon: <Flame size={22} style={{ color: THEME.running }} /> },
                { id: "auto" as PreferredSplit, label: "No preference", desc: "We'll pick the best split for you", icon: <Sparkles size={22} style={{ color: THEME.teal }} /> },
              ]).map(opt => (
                <OptionCard
                  key={opt.id}
                  selected={preferredSplit === opt.id}
                  onSelect={() => setPreferredSplit(opt.id)}
                  icon={opt.icon}
                  label={opt.label}
                  desc={
                    isSplitDisabled(opt.id)
                      ? `${opt.desc} — needs ${opt.id === "upper_lower" ? "4+" : "5-6"} days/week`
                      : opt.desc
                  }
                  disabled={isSplitDisabled(opt.id)}
                />
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 8 — Run Frequency
          ════════════════════════════════ */}
          {step === 8 && (
            <div className="space-y-2">
              {([
                { id: "regular" as RunFrequency, label: "Regular runner", desc: "3+ runs per week", icon: <Footprints size={22} style={{ color: THEME.running }} /> },
                { id: "occasional" as RunFrequency, label: "Occasional runner", desc: "1 – 2 runs per week", icon: <Footprints size={22} style={{ color: THEME.warning }} /> },
                { id: "none" as RunFrequency, label: "I don't run", desc: "Lifting only, no cardio programming", icon: <Dumbbell size={22} style={{ color: THEME.lifting }} /> },
              ]).map(opt => (
                <OptionCard
                  key={opt.id}
                  selected={runFrequency === opt.id}
                  onSelect={() => setRunFrequency(opt.id)}
                  icon={opt.icon}
                  label={opt.label}
                  desc={opt.desc}
                />
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 9 — Injuries
          ════════════════════════════════ */}
          {step === 9 && (
            <div className="space-y-2">
              {([
                { id: "none", label: "No injuries", desc: "All clear — no limitations", icon: <Check size={22} style={{ color: THEME.success }} /> },
                { id: "lower_back", label: "Lower back", desc: "We'll avoid heavy axial loading", icon: <AlertTriangle size={22} style={{ color: THEME.warning }} /> },
                { id: "shoulder", label: "Shoulder", desc: "We'll modify pressing movements", icon: <AlertTriangle size={22} style={{ color: THEME.warning }} /> },
                { id: "knee", label: "Knee", desc: "We'll adjust squat and lunge variations", icon: <AlertTriangle size={22} style={{ color: THEME.warning }} /> },
                { id: "other", label: "Other", desc: "Tell us more below", icon: <AlertTriangle size={22} style={{ color: THEME.danger }} /> },
              ]).map(opt => {
                const isSelected = injuries.includes(opt.id);
                const isNone = opt.id === "none";
                return (
                  <div key={opt.id}>
                    <OptionCard
                      selected={isSelected}
                      onSelect={() => {
                        if (isNone) {
                          // "None" clears all others
                          setInjuries(isSelected ? [] : ["none"]);
                          setOtherInjuryText("");
                        } else {
                          // Any other option removes "none"
                          setInjuries(prev => {
                            const withoutNone = prev.filter(i => i !== "none");
                            return isSelected
                              ? withoutNone.filter(i => i !== opt.id)
                              : [...withoutNone, opt.id];
                          });
                        }
                      }}
                      icon={opt.icon}
                      label={opt.label}
                      desc={opt.desc}
                    />
                    {/* Other free text input */}
                    {opt.id === "other" && isSelected && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="overflow-hidden mt-2 ml-10"
                      >
                        <input
                          autoFocus
                          type="text"
                          value={otherInjuryText}
                          onChange={e => setOtherInjuryText(e.target.value)}
                          placeholder="Describe your injury..."
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                          style={{
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: THEME.textPrimary,
                          }}
                        />
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 10 — Confirmation
          ════════════════════════════════ */}
          {step === 10 && (
            <div
              className="rounded-2xl p-5 space-y-0"
              style={{
                background: `${THEME.teal}08`,
                border: `1px solid ${THEME.teal}25`,
              }}
            >
              {[
                { label: "Your plan", value: splitLabel(preferredSplit), color: THEME.teal },
                { label: "Schedule", value: `${daysPerWeek} days/week · ${goalLabel(primaryGoal)}`, color: THEME.brand },
                { label: "Setup", value: `${equipmentLabel(equipment)} · ${experienceLabel(experience)}`, color: THEME.lifting },
                { label: "Running", value: runFreqLabel(runFrequency), color: THEME.running },
                { label: "Metrics", value: `${displayHeight} · ${displayWeight}`, color: THEME.warning },
                {
                  label: "Daily targets",
                  value: `${tdee.targetCalories} cal · ${tdee.protein}g P · ${tdee.carbs}g C · ${tdee.fat}g F`,
                  color: THEME.success,
                },
              ].map((row, i) => (
                <motion.div
                  key={row.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.3 }}
                  className="flex items-start gap-3 py-3"
                  style={{
                    borderBottom:
                      i < 5 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: row.color }}
                  />
                  <div>
                    <p
                      className="text-[10px] uppercase tracking-wider"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      {row.label}
                    </p>
                    <p className="text-sm font-semibold mt-0.5">{row.value}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Navigation ── */}
      <div className="flex items-center gap-3 pt-6">
        {step > 0 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="px-5 py-3.5 rounded-2xl text-sm font-medium active:scale-[0.97] transition-transform"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Back
          </button>
        )}
        <button
          onClick={() => {
            if (step < TOTAL_STEPS - 1) {
              setStep(s => s + 1);
            } else {
              handleFinish();
            }
          }}
          disabled={!canAdvance[step] || saving}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98]",
            !canAdvance[step] && "opacity-40"
          )}
          style={{ background: THEME.teal, color: "#000" }}
        >
          {step === TOTAL_STEPS - 1 ? (
            saving ? (
              "Setting up..."
            ) : (
              <>
                Start my program <ChevronRight className="w-4 h-4" />
              </>
            )
          ) : (
            <>
              Continue <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* Validation hint when button is disabled */}
      {!canAdvance[step] && !saving && (
        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {step === 1 && ageRange === 'under-16' && 'You must be 16 or older to use Tropos'}
          {step === 2 && 'Enter your height and weight to continue'}
          {step === 7 && 'This split requires more training days'}
          {step === 9 && injuries.length === 0 && 'Select at least one option (or "None")'}
        </p>
      )}
    </div>
  );
}
