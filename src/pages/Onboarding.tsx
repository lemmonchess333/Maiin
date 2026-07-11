import { useState, useMemo, useEffect, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { haptic } from "@/lib/haptic";
import { useAuth } from "@/lib/auth";
import type { UserProfile } from "@/lib/auth";
import { doc, serverTimestamp } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { calculateTDEE } from "@/lib/tdee";
import type { FitnessGoal, ActivityLevel } from "@/lib/tdee";
import { nutritionPhaseLabel } from "@/lib/nutritionPhaseLabel";
import { resolveGoalWeightPlan } from "@/lib/goalWeightPlan";
import { THEME } from "@/lib/theme";
import { logger } from "@/lib/logger";
import { motion, AnimatePresence } from "framer-motion";
import { PROGRAM_TEMPLATES } from "@/features/program/templates";
import type {
  ProgramTemplate,
  TemplateExercise,
} from "@/features/program/templates";
import {
  matchTemplate,
  applyInjuryFilters,
} from "@/features/program/matchTemplate";
import type {
  ProgramState,
  WorkoutDay,
  ProgramExercise,
  PreferredSplit,
  SplitType,
  Experience,
  Equipment,
  RaceDistance,
} from "@/features/program/programTypes";
import { buildPlan, type RunMode } from "@/features/program/planBuilder";
import {
  generateSchedule,
  SCHEDULE_TYPE_META,
  type ScheduleDay,
} from "@/lib/scheduleUtils";
import { localDateString } from "@/lib/dateHelpers";
import { resolveOnboardingRunMode } from "@/lib/onboardingRunMode";
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
  Calendar,
  Warehouse,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import OptionCard from "@/components/onboarding/OptionCard";
import Stepper from "@/components/onboarding/Stepper";
import { toast } from "@/lib/toast";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import { validateDisplayName } from "@/lib/displayName";

/* ============================
   TYPES
============================ */

type Gender = "male" | "female" | "unspecified";
type AgeRange = "under-16" | "16-24" | "25-34" | "35-44" | "45-54" | "55+";
type PrimaryGoal =
  | "hypertrophy"
  | "strength"
  | "fat_loss"
  | "general"
  | "running";
// Experience / Equipment / RunMode / RaceDistance are imported from the
// single-source measure vocabularies (D3) — no longer re-declared here.
type DaysPerWeek = 2 | 3 | 4 | 5 | 6;
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

// Note: the old goalToFitnessGoal(primaryGoal) mapping was removed in Tier 2
// — the nutrition phase now derives from the goal-weight plan (target weight
// owns direction), so primaryGoal no longer determines the nutrition phase.

function templateSplitToSplitType(s: ProgramTemplate["split"]): SplitType {
  switch (s) {
    case "full_body":
      return "full_body";
    case "upper_lower":
      return "upper_lower";
    case "ppl":
      return "ppl";
    case "bro_split":
      return "ppl"; // closest match
  }
}

function templateExToProgEx(te: TemplateExercise): ProgramExercise {
  const repNum = parseInt(te.reps, 10) || 8;
  return {
    name: te.name,
    exerciseId: te.exerciseId,
    /* Was hardcoded "horizontal_push" — caused every template-derived
       day to mis-tag muscle groups on the social activity card (Pull A
       showed "horizontal_push" because every exercise inherited the
       default). Inference is name-based: see lib/exerciseMovementCategory. */
    movementCategory: inferMovementCategory(te.name, te.exerciseId),
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
    // Carry `notes` from the template through to program state so the
    // injury-substitution rationale written by `applyInjuryFilters`
    // survives the conversion — previously dropped, so users saw their
    // swapped exercises with no context for why.
    ...(te.notes !== undefined ? { notes: te.notes } : {}),
  };
}

function templateToProgramState(
  template: ProgramTemplate,
  goal: FitnessGoal
): ProgramState {
  const week1 = template.weeks[0];
  const workouts: WorkoutDay[] = week1.days
    .filter((d) => d.type === "lift")
    .map((d) => ({
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
    case "full_body":
      return "Full Body";
    case "upper_lower":
      return "Upper / Lower";
    case "ppl":
      return "Push / Pull / Legs";
    case "bro_split":
      return "Bro Split";
    case "auto":
      return "Auto-assigned";
  }
}

function goalLabel(g: PrimaryGoal): string {
  switch (g) {
    case "hypertrophy":
      return "Hypertrophy focus";
    case "strength":
      return "Strength focus";
    case "fat_loss":
      return "Fat loss focus";
    case "general":
      return "General fitness";
    case "running":
      return "Running focus";
  }
}

function runFreqLabel(r: RunFrequency): string {
  switch (r) {
    case "regular":
      return "Runs 3x/week integrated";
    case "occasional":
      return "Runs 1-2x/week integrated";
    case "none":
      return "No running";
  }
}

function experienceLabel(e: Experience): string {
  switch (e) {
    case "beginner":
      return "Beginner";
    case "intermediate":
      return "Intermediate";
    case "advanced":
      return "Advanced";
  }
}

function equipmentLabel(e: Equipment): string {
  switch (e) {
    case "full_gym":
      return "Full gym";
    case "home_gym":
      return "Home gym";
    case "minimal":
      return "Minimal";
  }
}

/* ============================
   STEP DEFINITIONS
============================ */

// Fast-start flow (onboarding-fast-start): 13 → 8 steps. We front-load the
// program-shaping questions (goal, days, equipment, run, injuries), collect
// the body metrics once on a single "About you" screen, then preview +
// confirm. Deferred from the flow: name (defaulted from email), experience
// (defaults intermediate), preferred split (defaults auto), and the
// goal-weight slider (target defaults to current weight → maintenance).
// New 0-indexed order: 0 goal · 1 days · 2 equipment · 3 run · 4 injuries ·
// 5 about-you (sex + age + height/weight) · 6 preview · 7 confirm.
const TOTAL_STEPS = 8;

// Sport-coding for the weekly preview step now lives in
// scheduleUtils.SCHEDULE_TYPE_META — single source across
// Onboarding, ConfigurePlanModal, and Programme Week tab.

const STEP_META: { title: string; subtitle: string }[] = [
  {
    title: "What's your primary goal?",
    subtitle: "We'll build your program around this",
  },
  {
    title: "Training days per week",
    subtitle: "How many days can you commit?",
  },
  {
    title: "Equipment access",
    subtitle: "We'll choose exercises you can actually do",
  },
  { title: "Do you run?", subtitle: "We'll weave runs into your schedule" },
  { title: "Any injuries?", subtitle: "We'll program around limitations" },
  {
    title: "About you",
    subtitle: "Used to calculate your calories and macros",
  },
  {
    title: "Your week at a glance",
    subtitle: "Here's how we'll lay out your training week",
  },
  {
    title: "Your plan is ready",
    subtitle: "Based on your answers, here's where we'll start you",
  },
];

// Stable, non-PII step identifiers for funnel analytics — parallel to
// STEP_META (same order). Used as the `step` dimension on
// onboarding_step_viewed / _completed so dashboards attribute drop-off to a
// named step rather than a bare index.
const STEP_IDS = [
  "goal",
  "days",
  "equipment",
  "run",
  "injuries",
  "about",
  "preview",
  "confirm",
] as const;

/* D16 — quick-tap motivations shown on the confirmation step. Tapping one
   seeds the `trainingWhy` phrase (still editable in the free-text field).
   Short, first-person, and resurfaceable verbatim ("Your why: …"). */
const TRAINING_WHY_CHIPS = [
  "Feel stronger",
  "More energy",
  "Build a habit",
  "Look my best",
  "Run a race",
  "Longevity",
] as const;

/* ============================
   COMPONENT
============================ */

export default function Onboarding() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  // Pgm4: Onboarding is now PURELY first-run. The old "retake" mode (jump to
  // step 4 to edit programme fields) was retired — editing a programme lives
  // on the unified /settings/training screen, no app re-runs onboarding to
  // change settings. So the flow always starts at step 0 and walks all
  // TOTAL_STEPS.
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Funnel: emit a step-view on mount and on each step change. Fires for
  // every onboarding (not first-only), so dashboards see per-step drop-off.
  // Non-PII — stable step id + index only.
  useEffect(() => {
    trackLifecycle("onboarding_step_viewed", {
      step: STEP_IDS[step],
      stepIndex: step,
    });
  }, [step]);

  // ── Display name (DEFERRED from the fast-start flow — no UI step)
  // The dedicated name step was removed; displayName is now defaulted so the
  // save always writes a valid name and validateDisplayName() passes:
  //   1. Firebase Auth's displayName when available (Google / Apple signin),
  //   2. else the email local-part (before "@"),
  //   3. else "Athlete".
  // Users edit it later from Settings → Profile (progressive profiling).
  const [displayName] = useState<string>(() => {
    if (user?.displayName) return user.displayName;
    const local = user?.email?.split("@")[0]?.trim();
    return local && local.length > 0 ? local : "Athlete";
  });

  // ── About you: Gender
  const [gender, setGender] = useState<Gender>("unspecified");

  // ── About you: Age range
  const [ageRange, setAgeRange] = useState<AgeRange>("25-34");

  // ── About you: Body metrics
  const [heightCm, setHeightCm] = useState(175);
  const [weightKg, setWeightKg] = useState(75);
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("cm");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");
  // Goal weight (DEFERRED — the in-flow slider was removed in fast-start).
  // CRITICAL: the saved goal weight is derived as the entered current weight
  // (see handleFinish: `goalWeightKg: weightKg`, `weeklyRateKg: 0`) so the
  // plan always resolves to maintenance/recomp (zero calorie offset). We no
  // longer keep goal-weight state — the slider that drove it is gone, and a
  // stale default (the old 75) would have given a non-75kg user an unintended
  // cut/bulk. The live nutrition preview below uses weightKg for both
  // current and target, which is the same maintenance result.
  const [runFrequency, setRunFrequency] = useState<RunFrequency>("occasional");
  const [runMode, setRunMode] = useState<RunMode>("freeform");
  const [weeklyRunDays, setWeeklyRunDays] = useState(2);
  const [raceDistance, setRaceDistance] = useState<RaceDistance>("10k");
  const [raceTargetDate, setRaceTargetDate] = useState("");

  // ── Primary goal
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>("hypertrophy");

  // ── Experience (DEFERRED — no UI step; default kept at intermediate)
  const experience: Experience = "intermediate";

  // ── Days per week
  const [daysPerWeek, setDaysPerWeek] = useState<DaysPerWeek>(4);

  // ── Equipment
  const [equipment, setEquipment] = useState<Equipment>("full_gym");

  // ── Preferred split (DEFERRED — no UI step; default kept at auto)
  const preferredSplit: PreferredSplit = "auto";

  // ── Injuries. Defaults to ["none"] ("No injuries" pre-selected) so the
  // step is advanceable on entry like every other step — the fast-start
  // flow auto-selects a sensible default everywhere; injuries was the one
  // step that shipped requiring a manual tap before Continue lit up.
  const [injuries, setInjuries] = useState<string[]>(["none"]);

  // D16 — personal "why". Optional motivation captured on the confirmation
  // step (a tap-chip seeds the phrase; the field stays editable as free
  // text). Never gates advancing; resurfaced later (weekly review).
  const [trainingWhy, setTrainingWhy] = useState<string>("");

  // ── Derived values
  const displayHeight =
    heightUnit === "ft"
      ? `${Math.floor(heightCm / 30.48)}'${Math.round((heightCm % 30.48) / 2.54)}"`
      : `${heightCm} cm`;

  const displayWeight =
    weightUnit === "lbs"
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

  // Fast-start: the goal-weight slider was deferred out of the flow, so the
  // target weight equals the current weight and the rate is 0 → the plan
  // resolves to recomp / maintenance (zero calorie offset). This guarantees
  // a user of any body weight gets maintenance rather than the unintended
  // cut/bulk a stale default would have produced. Target weight can be set
  // later via the goal-weight surface; `primaryGoal` still drives the lift
  // programme.
  const goalPlan = useMemo(
    () =>
      resolveGoalWeightPlan({
        currentKg: weightKg,
        targetKg: weightKg,
        rateKgPerWeek: 0,
      }),
    [weightKg]
  );

  // TDEE computation — nutrition phase + offset come from the goal-weight
  // plan, not goalToFitnessGoal(primaryGoal).
  const tdee = useMemo(
    () =>
      calculateTDEE(
        weightKg,
        heightCm,
        AGE_MIDPOINTS[ageRange],
        activityLevel,
        goalPlan.fitnessGoal,
        gender === "female" ? "female" : "male",
        goalPlan.dailyOffset
      ),
    [weightKg, heightCm, ageRange, activityLevel, goalPlan, gender]
  );

  // P0-5: derived run-day count for previews + planBuilder input.
  // Freeform-regular → 3 default runs, freeform-occasional → 1.
  // Structured/race_prep use the slider value directly. Same
  // derivation as handleFinish so the preview reflects exactly what
  // the save call will request.
  const effectiveRunDays = useMemo(() => {
    if (runFrequency === "none") return 0;
    if (runMode === "freeform") {
      return runFrequency === "regular" ? 3 : 1;
    }
    return weeklyRunDays;
  }, [runFrequency, runMode, weeklyRunDays]);

  // P0-5: weekly preview rendered on step 11. Pure derivation off
  // generateSchedule — no Firestore read, no planBuilder call (the
  // preview only needs the day-type structure, not the workouts).
  // Both days appear automatically when liftDays + runDays > 7.
  const previewWeekSchedule = useMemo<ScheduleDay[]>(
    () => generateSchedule(daysPerWeek, effectiveRunDays),
    [daysPerWeek, effectiveRunDays]
  );

  // Display-name validation derived once per render. displayName is now
  // defaulted (email local-part / "Athlete"), so this is always valid; it's
  // consumed by handleFinish for the trimmed value written to the profile.
  const displayNameValidation = validateDisplayName(displayName);

  // Can advance per step (fast-start 8-step order)
  const canAdvance: boolean[] = [
    true, // 0: primary goal (always has default)
    true, // 1: days per week (always has default)
    true, // 2: equipment (always has default)
    // #975: the race-prep date is OPTIONAL — selecting race_prep no longer
    // blocks advancing without a date. A no-date race_prep lands on the
    // freeform substrate (Run9a); the date can be set later via the Race
    // Goal Planner. So the run step is always advanceable.
    true, // 3: run intent
    injuries.length > 0, // 4: injuries (must select at least one, including "none")
    ageRange !== "under-16" && weightKg > 0 && heightCm > 0, // 5: about you (age gate + metrics)
    true, // 6: weekly preview (always advanceable)
    true, // 7: confirmation
  ];

  // ── Save handler — uses Cloud Function (Admin SDK) to bypass Firestore rules
  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const injuriesForSave = injuries;
      // effectiveRunDays comes from the useMemo above so previews +
      // save use the same value. Keep this reference in scope for
      // the rest of the function.

      // Historical note: before this change, Onboarding did not collect
      // displayName. The only pre-existing user (the solo founder) was
      // fixed manually via Settings → Profile. All users onboarded after
      // this change are guaranteed to have a non-empty displayName.
      const trimmedDisplayName = displayNameValidation.trimmed;

      // #975: resolve the run mode once. race_prep without a target date
      // collapses to the freeform substrate (Run9a); both the profile write
      // and the planBuilder input below read this single value.
      const effectiveRunMode = resolveOnboardingRunMode({
        runFrequency,
        runMode,
        hasRaceDate: !!raceTargetDate,
      });

      const profileData: Record<string, unknown> = {
        displayName: trimmedDisplayName,
        email: user.email || "",
        currentStreak: 0,
        longestStreak: 0,
        lastLogDate: null,
        // Dark is the app default (see public/init.js + auth.tsx).
        darkMode: true,
        weeklyWorkoutsTarget: daysPerWeek,
        weeklyMealsTarget: 10,
        weeklyRunsTarget: effectiveRunDays,
        weeklyRunDaysTarget: effectiveRunDays,
        athleteType: "Lifter",
        gender,
        ageRange,
        heightCm,
        weightKg,
        // Fast-start: the goal-weight step was deferred, so we persist the
        // target weight as the current weight with a 0 rate → maintenance /
        // recomp (zero offset). This is the same maintenance result the
        // goalPlan above resolves to; a stale non-current default would have
        // written an unintended cut/bulk. Editable later via Settings.
        goalWeightKg: weightKg,
        weeklyRateKg: 0,
        preferredHeightUnit: heightUnit,
        preferredWeightUnit: weightUnit,
        primaryGoal,
        experience,
        daysPerWeek,
        equipment,
        preferredSplit,
        runFrequency,
        // #975: race_prep without a date → freeform substrate (Run9a),
        // never a dangling race_prep with no raceGoal. Single source of
        // truth for the branch is resolveOnboardingRunMode.
        runMode: effectiveRunMode,
        ...(effectiveRunMode === "race_prep" && raceTargetDate
          ? { raceGoal: { distance: raceDistance, targetDate: raceTargetDate } }
          : {}),
        injuries: injuriesForSave,
        // D16 — only persist a non-empty "why" (trimmed, ≤120). Omitted when
        // the user skips it, so we never write an empty string.
        ...(trainingWhy.trim()
          ? { trainingWhy: trainingWhy.trim().slice(0, 120) }
          : {}),
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
          // Nutrition phase comes from the goal-weight plan (target weight
          // owns direction), not goalToFitnessGoal(primaryGoal).
          goal: goalPlan.fitnessGoal,
          startWeight: weightKg,
          currentPhase: "base",
        },
      };

      // ── Match & assign program template ──
      const profileForMatch = {
        daysPerWeek,
        equipment,
        gender,
        preferredSplit,
        primaryGoal,
        experience,
        runFrequency,
        injuries: injuriesForSave,
      };
      // Nutrition phase = goal-weight plan (target weight owns direction);
      // primaryGoal still drives the lift programme via profileForMatch.
      const fitnessGoal = goalPlan.fitnessGoal;

      // P0-5: planBuilder is the single source of truth for plan
      // shape (lift workouts + weekSchedule + runDays + runPlan).
      // The template-match path is preserved as a preference signal
      // for the lift programme — when matchTemplate finds an exact
      // primaryGoal hit, we feed its workouts in via existingState
      // so planBuilder reuses them instead of regenerating. When
      // there's no match, planBuilder falls through to generateProgram
      // internally with the same primaryGoal threaded through.
      const matchResult = matchTemplate(
        profileForMatch as Parameters<typeof matchTemplate>[0],
        PROGRAM_TEMPLATES
      );
      let existingStateSeed: ProgramState | undefined;
      let templateIdForState: string | undefined;
      if (matchResult.isGoalMatch) {
        const filtered = applyInjuryFilters(
          matchResult.template,
          injuriesForSave,
          PROGRAM_TEMPLATES
        );
        existingStateSeed = templateToProgramState(filtered, fitnessGoal);
        existingStateSeed.primaryGoal = primaryGoal;
        templateIdForState = filtered.id;
      }

      // P0-5: drive everything through planBuilder. Pure call with
      // currentDate injected so the generated week anchors to the
      // user's local Sunday — never the server's UTC.
      const planInput = {
        primaryGoal,
        nutritionPhase: fitnessGoal,
        experience,
        // D-LIFT-5: seed bodyweight-relative cold-start loads for the first plan.
        bodyweightKg: weightKg,
        sex: gender === "female" ? "female" : "male",
        liftDays: daysPerWeek,
        preferredSplit,
        runMode: effectiveRunMode,
        weeklyRunDays: effectiveRunDays,
        ...(effectiveRunMode === "race_prep" && raceTargetDate
          ? { raceGoal: { distance: raceDistance, targetDate: raceTargetDate } }
          : {}),
        equipment,
        injuries: injuriesForSave,
        currentDate: localDateString(new Date()),
        existingState: existingStateSeed,
        preserveHistory: false,
      };
      const plan = buildPlan(planInput);
      const programState: ProgramState = plan.programState;
      if (templateIdForState) {
        programState.templateId = templateIdForState;
      }

      // Merge planBuilder's profileUpdates onto profileData. The
      // server-side validator (P0-4 validatePlanPayload) reads
      // weekSchedule + weekScheduleVersion + runMode + raceGoal
      // off profileData; the merge keeps the v6 onboarding fields
      // (TDEE, body metrics, etc.) intact while adding the v7
      // plan-shape fields. plan.profileUpdates.weeklyRunsTarget
      // and weeklyRunDaysTarget overwrite the locally-derived
      // counts above so the values match the actual generated plan.
      Object.assign(profileData, plan.profileUpdates);

      // Call Cloud Function — uses Admin SDK, bypasses Firestore security rules.
      // Retry once on "internal" error: the function has no minInstances, so the
      // first invocation after idle spins up a cold instance that can exceed the
      // client SDK's default wait window and surface as functions/internal even
      // though the warm instance will handle the second call fine.
      const completeOnboarding = httpsCallable(functions, "completeOnboarding");
      // P0-5: payload now includes weekSchedule as an explicit
      // top-level field. validatePlanPayload reads either the
      // top-level field or profileData.weekSchedule; sending both
      // keeps the contract explicit on the wire.
      const callCF = () =>
        completeOnboarding({
          profileData,
          programState,
          weekSchedule: plan.weekSchedule,
        });
      try {
        await callCF();
      } catch (err) {
        const code = (err as { code?: string })?.code;
        const msg = (err as { message?: string })?.message || "";
        // The CF has no minInstances, so the first call after idle
        // cold-starts and can exceed the client SDK's wait window. That
        // surfaces as `internal`, but ALSO as `deadline-exceeded` /
        // `unavailable` depending on where the timeout bites — all three
        // are transient cold-start signals a warm retry fixes. (The old
        // check only caught `internal`, so a cold start that timed out as
        // deadline-exceeded fell straight through to the error toast.)
        const isTransient =
          code === "functions/internal" ||
          code === "internal" ||
          code === "functions/deadline-exceeded" ||
          code === "deadline-exceeded" ||
          code === "functions/unavailable" ||
          code === "unavailable" ||
          msg.toUpperCase().includes("INTERNAL");
        if (!isTransient) throw err;
        await new Promise((r) => setTimeout(r, 1200));
        await callCF();
      }

      // Data is saved server-side (the CF flipped onboardingComplete=true
      // via the Admin SDK). Mirror it into local state so App.tsx switches
      // to the authenticated route set WITHOUT a reload. If that local
      // write fails for ANY reason, the SERVER is already authoritative —
      // reload to pick up the completed profile instead of stranding the
      // user on onboarding.
      //
      // CRITICAL: pass `throwOnError` so a failed write actually throws.
      // Without it, updateProfile returns `{ ok: false }` (and shows its
      // own toast), the optimistic setProfile never runs, and the old
      // `catch` here never fired — so navigate("/") below landed straight
      // back on Onboarding (onboardingComplete still locally false). That
      // was the "Start my program just loads and won't progress" hang.
      try {
        const res = await updateProfile(
          { onboardingComplete: true } as Partial<UserProfile>,
          { allowProtected: true, throwOnError: true }
        );
        if (!res.ok)
          throw res.error ?? new Error("local-profile-update-failed");
      } catch (localUpdateErr) {
        logger.warn(
          "Onboarding: local profile update failed; reloading to pick up server state",
          localUpdateErr
        );
        toast.success("Setting up your program…");
        // Brief delay so the toast renders before the reload swallows it.
        await new Promise((r) => setTimeout(r, 600));
        // Reload to the app root (basename-aware) so we re-read the
        // server's completed profile and land on Home, not back here.
        window.location.assign(import.meta.env.BASE_URL || "/");
        return;
      }

      // Seed the cross-user-readable public profile doc. Best-effort: if this
      // fails (e.g. offline), the next streak mutation or the backfill script
      // will populate it lazily. Not in the same batch as the server-side
      // profile write because that path is admin-SDK.
      try {
        await setDocGuarded(
          doc(db, "users", user.uid, "public", "profile"),
          {
            uid: user.uid,
            displayName:
              (profileData.displayName as string | undefined) || null,
            photoURL: (profileData.photoURL as string | undefined) || null,
            athleteType:
              (profileData.athleteType as string | undefined) ?? "Lifter",
            currentStreak: 0,
            longestStreak: 0,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (publicErr) {
        logger.warn(
          "Onboarding: public profile seed failed (will be populated lazily):",
          publicErr
        );
      }

      // Save succeeded — close the top of the activation funnel before
      // leaving. Non-PII dimensions only (goal enum, days/week, run mode).
      // first_plan_generated marks the first plan ever (onboarding runs once),
      // distinct from onboarding_completed; both fire on full save success.
      trackLifecycle("first_plan_generated", {
        primaryGoal,
        daysPerWeek,
        runMode: effectiveRunMode,
      });
      trackLifecycle("onboarding_completed", {
        primaryGoal,
        daysPerWeek,
        runMode: effectiveRunMode,
      });

      // Save succeeded — leave the onboarding surface explicitly. Flipping
      // onboardingComplete=true makes App.tsx switch to the authenticated
      // route set; navigating to "/" lands the user on Home. `replace` so
      // Back doesn't return into the finished onboarding flow.
      navigate("/", { replace: true });
    } catch (err) {
      // Sprint 2: the raw fallback toast used to leak Firebase
      // error codes to the user (e.g. "Save failed: functions/
      // internal — ..."). That read as a technical crash. Now every
      // branch returns plain-English copy and the raw error is
      // logged server-side via logger.error for operator triage.
      logger.error("Onboarding save failed:", err);
      const code = (err as { code?: string })?.code;
      const msg = (err as { message?: string })?.message || String(err);
      if (code === "permission-denied") {
        toast.error(
          "We couldn't save your setup. Try again, or contact support if it keeps happening."
        );
      } else if (
        code === "unavailable" ||
        code === "deadline-exceeded" ||
        msg.includes("INTERNAL")
      ) {
        toast.error(
          "Connection issue — check your internet and tap Continue again."
        );
      } else if (code === "unauthenticated" || code === "permission-denied") {
        toast.error("Please sign in again to finish setting up your account.");
      } else if (code === "resource-exhausted") {
        /* Server's rate limiter (functions/index.js) returns this
           after ~5 attempts in a short window. The msg is already
           user-friendly ("Too many attempts. Please wait."), so
           surface it verbatim. Falling through to the generic
           "Something went wrong" — which is what happened on
           Tropos's first lived recovery scenario — leads users
           to keep tapping, which compounds the rate-limit hit. */
        toast.error(
          msg ||
            "You're trying too fast — wait a minute and try Continue again."
        );
      } else if (code === "invalid-argument") {
        /* Validation failures from the Cloud Function — missing
           profileData / programState fields, malformed payload,
           etc. The server msg is specific enough to act on
           ("Missing required field: weightKg"). */
        toast.error(
          msg ||
            "Some setup details are missing — go back and check your inputs."
        );
      } else {
        toast.error(
          "Something went wrong. Tap Continue to try again, or contact support if it keeps happening."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  // OptionCard and Stepper are now imported from @/components/onboarding/

  /* ────────────────────────────────
     RENDER
  ──────────────────────────────── */

  return (
    // Sprint 2: page background + foreground come from design-system
    // tokens (bg-background, text-foreground) so the flow renders
    // correctly in light AND dark mode. Pre-Sprint-2 this was locked
    // to THEME.bg = #121214 which produced a black page in light mode
    // — the single biggest first-impression bug per the audit.
    <div className="h-[100dvh] flex flex-col px-5 pb-10 pt-safe bg-background text-foreground">
      {/* ── Progress bar ── */}
      <div className="flex gap-1.5 pt-14 pb-6">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
          return (
            <div
              key={i}
              className="h-1 flex-1 rounded-full overflow-hidden bg-muted"
            >
              <motion.div
                className="h-full rounded-full"
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                style={{ background: THEME.brand }}
              />
            </div>
          );
        })}
      </div>

      {/* ── Step content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22 }}
          className="flex-1 min-h-0 overflow-y-auto"
        >
          <p className="text-xs uppercase tracking-widest mb-2 text-muted-foreground">
            Step {step + 1} of {TOTAL_STEPS}
          </p>
          <h1 className="text-2xl font-bold mb-1">{STEP_META[step].title}</h1>
          <p className="text-sm mb-8 text-muted-foreground">
            {STEP_META[step].subtitle}
          </p>

          {/* ════════════════════════════════
             STEP 0 — Primary Goal
          ════════════════════════════════ */}
          {step === 0 && (
            <div className="space-y-2">
              {[
                {
                  id: "hypertrophy" as PrimaryGoal,
                  label: "Build muscle",
                  desc: "Hypertrophy training with a small calorie surplus",
                  icon: <Dumbbell size={22} className="text-lifting" />,
                },
                {
                  id: "strength" as PrimaryGoal,
                  label: "Get stronger",
                  desc: "Heavy compound lifts with maintenance calories",
                  icon: <Zap size={22} style={{ color: THEME.warning }} />,
                },
                {
                  id: "fat_loss" as PrimaryGoal,
                  label: "Lose fat",
                  desc: "Calorie deficit with muscle preservation",
                  icon: <Flame size={22} className="text-running" />,
                },
                {
                  id: "general" as PrimaryGoal,
                  label: "General fitness",
                  desc: "Balanced training with maintenance calories",
                  icon: <Heart size={22} style={{ color: THEME.success }} />,
                },
                {
                  id: "running" as PrimaryGoal,
                  label: "Improve running",
                  desc: "Run-focused training with maintenance calories",
                  icon: <Footprints size={22} className="text-running" />,
                },
              ].map((opt, i) => (
                <OptionCard
                  key={opt.id}
                  selected={primaryGoal === opt.id}
                  onSelect={() => setPrimaryGoal(opt.id)}
                  icon={opt.icon}
                  label={opt.label}
                  desc={opt.desc}
                  index={i}
                />
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 1 — Days Per Week
          ════════════════════════════════ */}
          {step === 1 && (
            <div className="grid grid-cols-5 gap-2">
              {([2, 3, 4, 5, 6] as DaysPerWeek[]).map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setDaysPerWeek(d)}
                  className="flex flex-col items-center gap-2 py-5 rounded-2xl transition-all active:scale-[0.95]"
                  style={{
                    background:
                      daysPerWeek === d
                        ? `${THEME.brand}20`
                        : "hsl(var(--muted) / 0.5)",
                    border: `1px solid ${daysPerWeek === d ? THEME.brand + "50" : "hsl(var(--muted))"}`,
                  }}
                >
                  <span
                    className="text-2xl font-bold font-mono"
                    style={{
                      color:
                        daysPerWeek === d
                          ? THEME.brand
                          : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {d}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    days
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 2 — Equipment Access
          ════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-2">
              {[
                {
                  id: "full_gym" as Equipment,
                  label: "Full gym",
                  desc: "Barbells, dumbbells, cables, machines",
                  icon: <Warehouse size={22} className="text-lifting" />,
                },
                {
                  id: "home_gym" as Equipment,
                  label: "Home gym",
                  desc: "Dumbbells, bench, pull-up bar",
                  icon: <Dumbbell size={22} style={{ color: THEME.brand }} />,
                },
                {
                  id: "minimal" as Equipment,
                  label: "Minimal / bodyweight",
                  desc: "Bands, bodyweight, maybe dumbbells",
                  icon: <User size={22} style={{ color: THEME.success }} />,
                },
              ].map((opt, i) => (
                <OptionCard
                  key={opt.id}
                  selected={equipment === opt.id}
                  onSelect={() => setEquipment(opt.id)}
                  icon={opt.icon}
                  label={opt.label}
                  desc={opt.desc}
                  index={i}
                />
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 3 — Run Frequency + Mode
          ════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                {[
                  {
                    id: "regular" as RunFrequency,
                    label: "Regular runner",
                    desc: "3+ runs per week",
                    icon: <Footprints size={22} className="text-running" />,
                  },
                  {
                    id: "occasional" as RunFrequency,
                    label: "Occasional runner",
                    desc: "1 – 2 runs per week",
                    icon: (
                      <Footprints size={22} style={{ color: THEME.warning }} />
                    ),
                  },
                  {
                    id: "none" as RunFrequency,
                    label: "I don't run",
                    desc: "Lifting only, no cardio programming",
                    icon: <Dumbbell size={22} className="text-lifting" />,
                  },
                ].map((opt, i) => (
                  <OptionCard
                    key={opt.id}
                    selected={runFrequency === opt.id}
                    index={i}
                    onSelect={() => {
                      setRunFrequency(opt.id);
                      if (opt.id === "none") {
                        setRunMode("freeform");
                        setWeeklyRunDays(0);
                      } else if (opt.id === "occasional") {
                        setWeeklyRunDays(Math.min(2, 7 - daysPerWeek));
                      } else {
                        setWeeklyRunDays(Math.min(3, 7 - daysPerWeek));
                      }
                    }}
                    icon={opt.icon}
                    label={opt.label}
                    desc={opt.desc}
                  />
                ))}
              </div>

              {/* Run mode sub-questions — only if they run */}
              {runFrequency !== "none" && (
                <div className="space-y-3 pt-2">
                  <p
                    className="text-xs font-medium"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    How should we schedule your runs?
                  </p>
                  <div className="space-y-2">
                    {[
                      {
                        id: "freeform" as RunMode,
                        label: "Freeform",
                        desc: "Run whenever you want, no auto-scheduling",
                      },
                      {
                        id: "structured" as RunMode,
                        label: "Structured",
                        desc: "Auto-assign run types to your run days",
                      },
                      {
                        id: "race_prep" as RunMode,
                        label: "Race Prep",
                        desc: "Periodised plan for a specific race",
                      },
                    ].map((opt, i) => (
                      <OptionCard
                        key={opt.id}
                        selected={runMode === opt.id}
                        onSelect={() => setRunMode(opt.id)}
                        index={i}
                        icon={<Target size={20} className="text-running" />}
                        label={opt.label}
                        desc={opt.desc}
                      />
                    ))}
                  </div>

                  {/* Run days slider for structured/race_prep */}
                  {runMode !== "freeform" && (
                    <div>
                      <label
                        className="text-xs"
                        style={{ color: "hsl(var(--muted-foreground))" }}
                      >
                        Run days per week ({weeklyRunDays})
                      </label>
                      <input
                        type="range"
                        aria-label="Run days per week"
                        min="1"
                        max={7}
                        value={weeklyRunDays}
                        onChange={(e) =>
                          setWeeklyRunDays(Number(e.target.value))
                        }
                        className="w-full accent-primary"
                      />
                      {daysPerWeek + weeklyRunDays > 7 && (
                        // P0-5: this is no longer a hard block. When
                        // total > 7, generateSchedule packs the spare
                        // workouts into Both days (one slot, one lift
                        // + one run). The copy stays informational so
                        // users understand the implication of the
                        // combination they're picking.
                        <p
                          className="text-xs mt-1"
                          style={{ color: "hsl(var(--muted-foreground))" }}
                        >
                          {daysPerWeek} lift + {weeklyRunDays} run ={" "}
                          {daysPerWeek + weeklyRunDays}. You'll see{" "}
                          {Math.min(
                            daysPerWeek + weeklyRunDays - 7,
                            Math.min(daysPerWeek, weeklyRunDays)
                          )}{" "}
                          double day
                          {Math.min(
                            daysPerWeek + weeklyRunDays - 7,
                            Math.min(daysPerWeek, weeklyRunDays)
                          ) === 1
                            ? ""
                            : "s"}{" "}
                          (lift + run on the same day).
                        </p>
                      )}
                    </div>
                  )}

                  {/* Race prep: distance + target date */}
                  {runMode === "race_prep" && (
                    <div className="space-y-3">
                      <div>
                        <p
                          className="text-xs uppercase tracking-wider mb-1.5"
                          style={{ color: "hsl(var(--muted-foreground))" }}
                        >
                          Race distance
                        </p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(
                            ["5k", "10k", "half", "marathon"] as RaceDistance[]
                          ).map((d) => (
                            <button
                              type="button"
                              key={d}
                              onClick={() => setRaceDistance(d)}
                              className="py-2 rounded-lg text-xs font-medium transition-all"
                              style={{
                                background:
                                  raceDistance === d
                                    ? THEME.running
                                    : "hsl(var(--muted) / 0.7)",
                                color:
                                  raceDistance === d
                                    ? "#000"
                                    : "hsl(var(--muted-foreground))",
                              }}
                            >
                              {d === "half"
                                ? "Half"
                                : d === "marathon"
                                  ? "Full"
                                  : d.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p
                          className="text-xs uppercase tracking-wider mb-1.5"
                          style={{ color: "hsl(var(--muted-foreground))" }}
                        >
                          Target date (optional)
                        </p>
                        <input
                          type="date"
                          aria-label="Race target date"
                          value={raceTargetDate}
                          onChange={(e) => setRaceTargetDate(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none bg-muted text-foreground border border-border focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-transparent [color-scheme:light_dark]"
                        />
                        {/* #975: date is optional — no date completes on the
                            freeform substrate and the Race Goal Planner on the
                            Programme page is the richer place to set one. */}
                        <p className="text-xs mt-1.5 text-muted-foreground">
                          No date yet? You can set a race goal later from the
                          Programme page.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 4 — Injuries
          ════════════════════════════════ */}
          {step === 4 && (
            <div className="space-y-2">
              {[
                {
                  id: "none",
                  label: "No injuries",
                  desc: "All clear — no limitations",
                  icon: <Check size={22} style={{ color: THEME.success }} />,
                },
                {
                  id: "lower_back",
                  label: "Lower back",
                  desc: "We'll avoid heavy axial loading",
                  icon: (
                    <AlertTriangle size={22} style={{ color: THEME.warning }} />
                  ),
                },
                {
                  id: "shoulder",
                  label: "Shoulder",
                  desc: "We'll modify pressing movements",
                  icon: (
                    <AlertTriangle size={22} style={{ color: THEME.warning }} />
                  ),
                },
                {
                  id: "knee",
                  label: "Knee",
                  desc: "We'll adjust squat and lunge variations",
                  icon: (
                    <AlertTriangle size={22} style={{ color: THEME.warning }} />
                  ),
                },
                {
                  id: "elbow",
                  label: "Elbow",
                  desc: "We'll swap heavy curls and dips for cable/machine work",
                  icon: (
                    <AlertTriangle size={22} style={{ color: THEME.warning }} />
                  ),
                },
                {
                  id: "wrist",
                  label: "Wrist",
                  desc: "We'll pick neutral-grip and machine variants",
                  icon: (
                    <AlertTriangle size={22} style={{ color: THEME.warning }} />
                  ),
                },
              ].map((opt, i) => {
                const isSelected = injuries.includes(opt.id);
                const isNone = opt.id === "none";
                return (
                  <OptionCard
                    key={opt.id}
                    selected={isSelected}
                    index={i}
                    onSelect={() => {
                      if (isNone) {
                        setInjuries(isSelected ? [] : ["none"]);
                      } else {
                        setInjuries((prev) => {
                          const withoutNone = prev.filter((i) => i !== "none");
                          return isSelected
                            ? withoutNone.filter((i) => i !== opt.id)
                            : [...withoutNone, opt.id];
                        });
                      }
                    }}
                    icon={opt.icon}
                    label={opt.label}
                    desc={opt.desc}
                  />
                );
              })}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 5 — About you (fast-start merge of the old gender +
             age + body-metrics steps onto one scrollable screen). These
             are the TDEE inputs (calculateTDEE(weightKg, heightCm, age,
             activityLevel, sex)); activity level stays DERIVED from
             daysPerWeek (no input here). Goal weight + weekly rate were
             deferred — the saved target is the current weight at a 0 rate
             (→ maintenance), see handleFinish.
          ════════════════════════════════ */}
          {step === 5 && (
            <div className="space-y-7">
              {/* Sex / gender */}
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Sex
                </p>
                {[
                  {
                    id: "male" as Gender,
                    label: "Male",
                    icon: <User size={22} className="text-lifting" />,
                  },
                  {
                    id: "female" as Gender,
                    label: "Female",
                    icon: <Heart size={22} className="text-running" />,
                  },
                  {
                    id: "unspecified" as Gender,
                    label: "Prefer not to say",
                    icon: <User size={22} className="text-muted-foreground" />,
                  },
                ].map((opt, i) => (
                  <OptionCard
                    key={opt.id}
                    selected={gender === opt.id}
                    onSelect={() => setGender(opt.id)}
                    icon={opt.icon}
                    label={opt.label}
                    index={i}
                  />
                ))}
              </div>

              {/* Age band */}
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Age
                </p>
                {[
                  { id: "under-16" as AgeRange, label: "Under 16" },
                  { id: "16-24" as AgeRange, label: "16 – 24" },
                  { id: "25-34" as AgeRange, label: "25 – 34" },
                  { id: "35-44" as AgeRange, label: "35 – 44" },
                  { id: "45-54" as AgeRange, label: "45 – 54" },
                  { id: "55+" as AgeRange, label: "55+" },
                ].map((opt, i) => (
                  <OptionCard
                    key={opt.id}
                    selected={ageRange === opt.id}
                    onSelect={() => setAgeRange(opt.id)}
                    icon={<Calendar size={22} style={{ color: THEME.brand }} />}
                    label={opt.label}
                    index={i}
                  />
                ))}
                {ageRange === "under-16" && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="size-4 shrink-0" />
                      <span className="font-medium">
                        Age requirement not met
                      </span>
                    </div>
                    <p className="text-xs text-destructive/80">
                      Tropos is only available for users aged 16 and over.
                      Please check back when you meet the age requirement.
                    </p>
                  </div>
                )}
              </div>

              {/* Height */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Ruler size={16} style={{ color: THEME.brand }} />
                    <span className="text-xs font-medium">Height</span>
                  </div>
                  <div className="flex gap-1">
                    {(["cm", "ft"] as const).map((u) => (
                      <button
                        type="button"
                        key={u}
                        onClick={() => setHeightUnit(u)}
                        className="px-3 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background:
                            heightUnit === u
                              ? THEME.brand
                              : "hsl(var(--muted))",
                          color:
                            heightUnit === u
                              ? "#fff"
                              : "hsl(var(--muted-foreground))",
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
                  onDecrement={() =>
                    setHeightCm((v) =>
                      Math.max(100, Math.round(v - heightStepSize))
                    )
                  }
                  onIncrement={() =>
                    setHeightCm((v) =>
                      Math.min(250, Math.round(v + heightStepSize))
                    )
                  }
                />
              </div>

              {/* Weight */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Dumbbell size={16} style={{ color: THEME.brand }} />
                    <span className="text-xs font-medium">Weight</span>
                  </div>
                  <div className="flex gap-1">
                    {(["kg", "lbs"] as const).map((u) => (
                      <button
                        type="button"
                        key={u}
                        onClick={() => setWeightUnit(u)}
                        className="px-3 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background:
                            weightUnit === u
                              ? THEME.brand
                              : "hsl(var(--muted))",
                          color:
                            weightUnit === u
                              ? "#fff"
                              : "hsl(var(--muted-foreground))",
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
                  onDecrement={() =>
                    setWeightKg((v) =>
                      Math.max(30, parseFloat((v - weightStepSize).toFixed(1)))
                    )
                  }
                  onIncrement={() =>
                    setWeightKg((v) =>
                      Math.min(250, parseFloat((v + weightStepSize).toFixed(1)))
                    )
                  }
                />
              </div>
            </div>
          )}

          {/* ════════════════════════════════
             STEP 6 — Weekly preview (P0-5)
          ════════════════════════════════ */}
          {step === 6 && (
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{
                background: `${THEME.brand}08`,
                border: `1px solid ${THEME.brand}25`,
              }}
            >
              <div className="grid grid-cols-7 gap-2">
                {previewWeekSchedule.map((d, i) => {
                  const dayLetters = ["S", "M", "T", "W", "T", "F", "S"];
                  const meta = SCHEDULE_TYPE_META[d.type];
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.25 }}
                      className="rounded-xl py-2 px-1 text-center"
                      style={{
                        background: `${meta.color}18`,
                        border: `1px solid ${meta.color}40`,
                      }}
                    >
                      <p
                        className="text-caption uppercase tracking-wider"
                        style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}
                      >
                        {dayLetters[i]}
                      </p>
                      <p
                        className="text-caption font-semibold mt-1 leading-tight"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 flex-wrap pt-1">
                {(["lift", "run", "both", "rest"] as const).map((t) => {
                  const meta = SCHEDULE_TYPE_META[t];
                  const count = previewWeekSchedule.filter(
                    (d) => d.type === t
                  ).length;
                  if (count === 0) return null;
                  return (
                    <div key={t} className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: meta.color }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: "hsl(var(--muted-foreground))" }}
                      >
                        {count} {meta.label.toLowerCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p
                className="text-xs leading-relaxed"
                style={{ color: "hsl(var(--muted-foreground) / 0.85)" }}
              >
                {previewWeekSchedule.some((d) => d.type === "both")
                  ? "Both days pair lifting and running on one slot — we'll schedule the easier run that day."
                  : "We'll start you here. You can rearrange days later from the Programme tab."}
              </p>
            </div>
          )}

          {/* ════════════════════════════════
             STEP 7 — Confirmation
          ════════════════════════════════ */}
          {step === 7 && (
            <>
              <div
                className="rounded-2xl p-5 space-y-0"
                style={{
                  background: `${THEME.brand}08`,
                  border: `1px solid ${THEME.brand}25`,
                }}
              >
                {[
                  {
                    label: "Your plan",
                    value: splitLabel(preferredSplit),
                    color: THEME.brand,
                  },
                  {
                    label: "Schedule",
                    value: `${daysPerWeek} days/week · ${goalLabel(primaryGoal)}`,
                    color: THEME.brand,
                  },
                  {
                    label: "Setup",
                    value: `${equipmentLabel(equipment)} · ${experienceLabel(experience)}`,
                    color: THEME.lifting,
                  },
                  {
                    label: "Running",
                    value:
                      runFrequency === "none"
                        ? "No running"
                        : `${runFreqLabel(runFrequency)}${runMode !== "freeform" ? ` · ${runMode === "race_prep" ? `Race prep (${raceDistance.toUpperCase()})` : "Structured"}` : ""}`,
                    color: THEME.running,
                  },
                  {
                    label: "Metrics",
                    value: `${displayHeight} · ${displayWeight}`,
                    color: THEME.warning,
                  },
                  {
                    // Surfaces the derived nutrition phase + its calorie
                    // consequence — the decision goalToFitnessGoal makes that
                    // was previously invisible (only the numbers showed below).
                    // Tier 2 — phase comes from the goal-weight plan.
                    label: "Nutrition",
                    value: nutritionPhaseLabel(
                      goalPlan.fitnessGoal,
                      tdee.deficit
                    ),
                    color: THEME.warning,
                  },
                  {
                    label: "Daily targets",
                    value: `${tdee.targetCalories} cal · ${tdee.protein}g P · ${tdee.carbs}g C · ${tdee.fat}g F`,
                    color: THEME.success,
                  },
                ].map((row, i, rows) => (
                  <motion.div
                    key={row.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1, duration: 0.3 }}
                    className="flex items-start gap-3 py-3"
                    style={{
                      borderBottom:
                        i < rows.length - 1
                          ? "1px solid hsl(var(--border))"
                          : "none",
                    }}
                  >
                    <div
                      className="size-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: row.color }}
                    />
                    <div>
                      <p
                        className="text-xs uppercase tracking-wider"
                        style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}
                      >
                        {row.label}
                      </p>
                      <p className="text-sm font-semibold mt-0.5">
                        {row.value}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
              {/* D8 — adaptivity framing. The single highest-retention sentence
                for cold-start: it reframes a thin Week-1 plan from
                "disappointing / not personalised" to "as designed", which is
                the documented #1 cold-start risk. */}
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.3 }}
                className="text-xs text-center leading-relaxed mt-4 px-2"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Week 1 is just where we start. Your plan{" "}
                <span style={{ color: THEME.brand, fontWeight: 600 }}>
                  adapts every time you log
                </span>{" "}
                — sessions, runs, and weight all tune it as you go.
              </motion.p>

              {/* D16 — optional personal "why". Not a step (fast-start
                  onboarding stays 8 steps) and never gates the CTA; a tap-chip
                  seeds the phrase, the input keeps it editable. Resurfaced
                  later (weekly review) to reconnect the user with their reason. */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.3 }}
                className="mt-5 rounded-2xl p-4"
                style={{
                  background: "hsl(var(--muted) / 0.5)",
                  border: "1px solid hsl(var(--border))",
                }}
              >
                <p className="text-sm font-semibold">
                  What&rsquo;s driving you?{" "}
                  <span
                    className="font-normal"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    Optional
                  </span>
                </p>
                <p
                  className="text-xs mt-0.5 leading-relaxed"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  We&rsquo;ll bring this back on the days it helps to remember.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {TRAINING_WHY_CHIPS.map((chip) => {
                    const selected = trainingWhy.trim() === chip;
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          haptic();
                          setTrainingWhy((cur) =>
                            cur.trim() === chip ? "" : chip
                          );
                        }}
                        aria-pressed={selected}
                        className="min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.97]"
                        style={
                          selected
                            ? {
                                background: `${THEME.brand}1A`,
                                color: THEME.brand,
                                border: `1px solid ${THEME.brand}55`,
                              }
                            : {
                                background: "hsl(var(--card))",
                                color: "hsl(var(--foreground))",
                                border: "1px solid hsl(var(--border))",
                              }
                        }
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={trainingWhy}
                  onChange={(e) => setTrainingWhy(e.target.value)}
                  maxLength={120}
                  aria-label="Your why"
                  placeholder="Or write your own…"
                  className="w-full mt-3 px-3 py-2.5 rounded-xl text-sm bg-card border border-border/60 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2"
                  style={
                    { "--tw-ring-color": `${THEME.brand}55` } as CSSProperties
                  }
                />
              </motion.div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Navigation ── */}
      <div className="flex items-center gap-3 pt-6">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="px-5 py-3.5 rounded-2xl text-sm font-medium active:scale-[0.97]"
            style={{
              background: "hsl(var(--muted))",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (step < TOTAL_STEPS - 1) {
              trackLifecycle("onboarding_step_completed", {
                step: STEP_IDS[step],
                stepIndex: step,
              });
              setStep((s) => s + 1);
            } else {
              handleFinish();
            }
          }}
          disabled={!canAdvance[step] || saving}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98]",
            !canAdvance[step] && "opacity-40"
          )}
          style={{ background: THEME.brand, color: "#fff" }}
        >
          {step === TOTAL_STEPS - 1 ? (
            saving ? (
              "Setting up..."
            ) : (
              <>
                Start my program <ChevronRight className="size-4" />
              </>
            )
          ) : (
            <>
              Continue <ChevronRight className="size-4" />
            </>
          )}
        </button>
      </div>

      {/* Validation hint when button is disabled */}
      {!canAdvance[step] && !saving && (
        <p
          className="text-center text-xs"
          style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}
        >
          {/* Step 4 — injuries: at least one selection required. */}
          {step === 4 &&
            injuries.length === 0 &&
            'Select at least one option (or "None")'}
          {/* Step 5 — about you: age gate + body metrics. The under-16 gate
              takes priority; otherwise prompt for the missing metric. */}
          {step === 5 &&
            ageRange === "under-16" &&
            "You must be 16 or older to use Tropos"}
          {step === 5 &&
            ageRange !== "under-16" &&
            "Enter your height and weight to continue"}
          {/* #975: the run step (step 3) no longer gates on a race date —
              it's always advanceable, so no hint there. */}
        </p>
      )}
    </div>
  );
}
