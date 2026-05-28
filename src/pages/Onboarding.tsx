import { useState, useMemo, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { UserProfile } from "@/lib/auth";
import { doc, serverTimestamp } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { calculateTDEE } from "@/lib/tdee";
import type { FitnessGoal, ActivityLevel } from "@/lib/tdee";
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
  SplitType,
} from "@/features/program/programTypes";
import { buildPlan } from "@/features/program/planBuilder";
import {
  generateSchedule,
  SCHEDULE_TYPE_META,
  type ScheduleDay,
} from "@/lib/scheduleUtils";
import { localDateString } from "@/lib/dateHelpers";
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
import OptionCard from "@/components/onboarding/OptionCard";
import Stepper from "@/components/onboarding/Stepper";
import { toast } from "@/lib/toast";
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
type Experience = "beginner" | "intermediate" | "advanced";
type DaysPerWeek = 2 | 3 | 4 | 5 | 6;
type Equipment = "full_gym" | "home_gym" | "minimal";
type PreferredSplit =
  | "full_body"
  | "upper_lower"
  | "ppl"
  | "bro_split"
  | "auto";
type RunFrequency = "regular" | "occasional" | "none";
type RunMode = "freeform" | "structured" | "race_prep";
type RaceDistance = "5k" | "10k" | "half" | "marathon";

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

// P0-5: bumped to 13 to insert "Your week at a glance" between
// injuries (10) and confirmation (12). The preview step renders
// the planBuilder-derived weekSchedule so users see exactly how
// their lift + run choices map onto the seven days before they
// commit. Same step IDs as v6 (0-9 identity + program inputs),
// new 10 = injuries, 11 = preview, 12 = confirm.
const TOTAL_STEPS = 13;

// Sport-coding for the weekly preview step now lives in
// scheduleUtils.SCHEDULE_TYPE_META — single source across
// Onboarding, ConfigurePlanModal, and Programme Week tab.

const STEP_META: { title: string; subtitle: string }[] = [
  {
    title: "What should we call you?",
    subtitle: "We'll show this on your profile and to friends.",
  },
  {
    title: "What's your gender?",
    subtitle: "This helps us personalize your plan",
  },
  {
    title: "How old are you?",
    subtitle: "We'll tailor intensity recommendations",
  },
  {
    title: "Your body metrics",
    subtitle: "Used to calculate calories and macros",
  },
  {
    title: "What's your primary goal?",
    subtitle: "We'll build your program around this",
  },
  {
    title: "Experience level",
    subtitle: "So we program the right volume and intensity",
  },
  {
    title: "Training days per week",
    subtitle: "How many days can you commit?",
  },
  {
    title: "Equipment access",
    subtitle: "We'll choose exercises you can actually do",
  },
  {
    title: "Preferred training style",
    subtitle: "Pick a split or let us decide",
  },
  { title: "Do you run?", subtitle: "We'll weave runs into your schedule" },
  { title: "Any injuries?", subtitle: "We'll program around limitations" },
  {
    title: "Your week at a glance",
    subtitle: "Here's how we'll lay out your training week",
  },
  {
    title: "Your plan is ready",
    subtitle: "Review your selections and let's go",
  },
];

/* ============================
   COMPONENT
============================ */

export default function Onboarding() {
  const { user, profile, updateProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isRetake = !!(location.state as { retake?: boolean } | null)?.retake;

  // In retake mode, skip the identity steps (name, gender, age, body metrics)
  // that can't meaningfully change. The user jumps straight to the program-
  // relevant steps starting at "What's your primary goal?" (STEP_META index 4).
  const START_STEP = isRetake ? 4 : 0;
  const VISIBLE_STEPS = TOTAL_STEPS - START_STEP;

  const [step, setStep] = useState(START_STEP);
  const [saving, setSaving] = useState(false);

  // ── Step 0: Display name
  // Pre-populated from Firebase Auth's displayName when available (e.g. Google
  // / Apple signin often supplies one). Users can edit it. Empty string when
  // plain email signup — the input collects it.
  const [displayName, setDisplayName] = useState<string>(
    user?.displayName || ""
  );
  // Tracks first blur — the validation hint only appears after the user has
  // interacted with the input, not on the initial empty state.
  const [displayNameTouched, setDisplayNameTouched] = useState(false);

  // ── Step 1: Gender
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
  const [runMode, setRunMode] = useState<RunMode>("freeform");
  const [weeklyRunDays, setWeeklyRunDays] = useState(2);
  const [raceDistance, setRaceDistance] = useState<RaceDistance>("10k");
  const [raceTargetDate, setRaceTargetDate] = useState("");

  // ── Step 9: Injuries
  const [injuries, setInjuries] = useState<string[]>([]);

  // ── Pre-populate from profile in retake mode
  useEffect(() => {
    if (isRetake && profile) {
      if (profile.displayName) setDisplayName(profile.displayName);
      if (profile.gender) setGender(profile.gender);
      if (profile.ageRange) setAgeRange(profile.ageRange);
      if (profile.heightCm) setHeightCm(profile.heightCm);
      if (profile.weightKg) setWeightKg(profile.weightKg);
      if (profile.preferredHeightUnit)
        setHeightUnit(profile.preferredHeightUnit);
      if (profile.preferredWeightUnit)
        setWeightUnit(profile.preferredWeightUnit);
      if (profile.primaryGoal) setPrimaryGoal(profile.primaryGoal);
      if (profile.experience) setExperience(profile.experience);
      if (profile.daysPerWeek) setDaysPerWeek(profile.daysPerWeek);
      if (profile.equipment) setEquipment(profile.equipment);
      if (profile.preferredSplit) setPreferredSplit(profile.preferredSplit);
      if (profile.runFrequency) setRunFrequency(profile.runFrequency);
      // P0-5: retake prefills run-plan state so users editing an
      // existing plan don't have to re-pick mode + targets. Mode +
      // weekly count + race goal are independent of the higher-level
      // runFrequency control — a "regular runner" can still be in
      // race_prep, etc.
      if (profile.runMode) setRunMode(profile.runMode as RunMode);
      if (
        typeof profile.weeklyRunDaysTarget === "number" &&
        profile.weeklyRunDaysTarget > 0
      ) {
        setWeeklyRunDays(profile.weeklyRunDaysTarget);
      }
      if (profile.raceGoal) {
        setRaceDistance(profile.raceGoal.distance as RaceDistance);
        setRaceTargetDate(profile.raceGoal.targetDate);
      }
      if (profile.injuries) {
        const knownInjuries = [
          "none",
          "lower_back",
          "shoulder",
          "knee",
          "wrist",
          "elbow",
        ];
        // Pre-W1c "other" / free-text injury values are ignored on retake —
        // the filter only acts on the three known categories, so surfacing
        // stale free-text would only re-confuse the user.
        setInjuries(profile.injuries.filter((i) => knownInjuries.includes(i)));
      }
    }
  }, [isRetake, profile]);

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

  // TDEE computation
  const tdee = useMemo(
    () =>
      calculateTDEE(
        weightKg,
        heightCm,
        AGE_MIDPOINTS[ageRange],
        activityLevel,
        goalToFitnessGoal(primaryGoal),
        gender === "female" ? "female" : "male"
      ),
    [weightKg, heightCm, ageRange, activityLevel, primaryGoal, gender]
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

  // Split compatibility check
  function isSplitDisabled(split: PreferredSplit): boolean {
    if (split === "ppl" && daysPerWeek < 5) return true;
    if (split === "bro_split" && daysPerWeek < 5) return true;
    if (split === "upper_lower" && daysPerWeek < 4) return true;
    return false;
  }

  // Display-name validation derived once per render. Both `canAdvance[0]` and
  // the inline error message consume the same result.
  const displayNameValidation = validateDisplayName(displayName);

  // Can advance per step
  const canAdvance: boolean[] = [
    displayNameValidation.valid, // 0: display name (2-30 chars after trim)
    true, // 1: gender (always has default)
    ageRange !== "under-16", // 2: age range (blocks under 16)
    weightKg > 0 && heightCm > 0, // 3: body metrics
    true, // 4: primary goal
    true, // 5: experience
    true, // 6: days per week
    true, // 7: equipment
    !isSplitDisabled(preferredSplit), // 8: preferred split
    // P0-5: doubles blocker dropped. `daysPerWeek + weeklyRunDays > 7`
    // is no longer a constraint — generateSchedule emits Both days
    // when the total exceeds 7 (see P0-B). The only remaining
    // run-step gate is the race-prep date selector.
    runFrequency === "none" || runMode !== "race_prep" || raceTargetDate !== "", // 9: run frequency + mode
    injuries.length > 0, // 10: injuries (must select at least one, including "none")
    true, // 11: weekly preview (always advanceable)
    true, // 12: confirmation
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

      const profileData: Record<string, unknown> = {
        displayName: trimmedDisplayName,
        email: user.email || "",
        currentStreak: 0,
        longestStreak: 0,
        lastLogDate: null,
        darkMode: false,
        weeklyWorkoutsTarget: daysPerWeek,
        weeklyMealsTarget: 10,
        weeklyRunsTarget: effectiveRunDays,
        weeklyRunDaysTarget: effectiveRunDays,
        athleteType: "Lifter",
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
        runMode: runFrequency === "none" ? "freeform" : runMode,
        ...(runMode === "race_prep" && runFrequency !== "none" && raceTargetDate
          ? { raceGoal: { distance: raceDistance, targetDate: raceTargetDate } }
          : {}),
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
        preferredSplit: preferredSplit as
          | "full_body"
          | "upper_lower"
          | "ppl"
          | "bro_split"
          | "auto",
        primaryGoal,
        experience,
        runFrequency,
        injuries: injuriesForSave,
      };
      const fitnessGoal = goalToFitnessGoal(primaryGoal);

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
        liftDays: daysPerWeek,
        preferredSplit: preferredSplit as SplitType,
        runMode: runFrequency === "none" ? ("freeform" as const) : runMode,
        weeklyRunDays: effectiveRunDays,
        ...(runMode === "race_prep" && runFrequency !== "none" && raceTargetDate
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
        const isColdStart =
          code === "functions/internal" ||
          code === "internal" ||
          msg.toUpperCase().includes("INTERNAL");
        if (!isColdStart) throw err;
        await new Promise((r) => setTimeout(r, 1200));
        await callCF();
      }

      // Data is saved server-side. Update local state to trigger router transition.
      // Try Firestore write first; if rules block it, the CF already
      // persisted everything — toast the user before reloading so they
      // don't see a silent app refresh. Sprint 2: previously this
      // called window.location.reload() with no toast which read as
      // the app crashing.
      try {
        await updateProfile(
          { onboardingComplete: true } as Partial<UserProfile>,
          { allowProtected: true }
        );
      } catch (localUpdateErr) {
        logger.warn(
          "Onboarding: local profile update failed; reloading to pick up server state",
          localUpdateErr
        );
        toast.success("Setting up your program…");
        // Brief delay so the toast renders before the reload swallows it.
        await new Promise((r) => setTimeout(r, 600));
        window.location.reload();
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
    <div className="min-h-screen flex flex-col px-5 pb-10 pt-safe bg-background text-foreground">
      {/* ── Progress bar ── */}
      <div className="flex gap-1.5 pt-14 pb-6">
        {Array.from({ length: VISIBLE_STEPS }).map((_, i) => {
          const stepIdx = i + START_STEP;
          return (
            <div
              key={stepIdx}
              className="h-1 flex-1 rounded-full overflow-hidden bg-muted"
            >
              <motion.div
                className="h-full rounded-full"
                animate={{ width: stepIdx <= step ? "100%" : "0%" }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                style={{ background: THEME.teal }}
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
          className="flex-1 overflow-y-auto"
        >
          <p className="text-xs uppercase tracking-widest mb-2 text-muted-foreground">
            Step {step - START_STEP + 1} of {VISIBLE_STEPS}
          </p>
          <h1 className="text-2xl font-bold mb-1">{STEP_META[step].title}</h1>
          <p className="text-sm mb-8 text-muted-foreground">
            {STEP_META[step].subtitle}
          </p>

          {/* ════════════════════════════════
             STEP 0 — Display name
          ════════════════════════════════ */}
          {step === 0 && (
            <div className="space-y-3">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => setDisplayNameTouched(true)}
                onKeyDown={(e) => {
                  // Enter advances when valid, matching the Continue button.
                  if (e.key === "Enter" && canAdvance[0] && !saving) {
                    e.preventDefault();
                    setStep((s) => s + 1);
                  }
                }}
                placeholder="Your name"
                aria-label="Your name"
                aria-invalid={
                  displayNameTouched && !displayNameValidation.valid
                }
                // Dedicated single-input onboarding step; focus is the
                // intended behaviour. iOS Safari may still withhold the
                // keyboard until tap — accepted platform constraint.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                autoCapitalize="words"
                autoComplete="nickname"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                className="w-full p-4 rounded-2xl text-base outline-none border bg-muted text-foreground border-border focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-transparent"
              />
              {displayNameTouched && !displayNameValidation.valid && (
                <p className="text-xs text-destructive" role="alert">
                  Please enter a name between 2 and 30 characters.
                </p>
              )}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 1 — Gender
          ════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-2">
              {[
                {
                  id: "male" as Gender,
                  label: "Male",
                  icon: <User size={22} style={{ color: THEME.lifting }} />,
                },
                {
                  id: "female" as Gender,
                  label: "Female",
                  icon: <Heart size={22} style={{ color: THEME.running }} />,
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
          )}

          {/* ════════════════════════════════
             STEP 1 — Age Range
          ════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-2">
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
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span className="font-medium">Age requirement not met</span>
                  </div>
                  <p className="text-xs text-red-500/80 dark:text-red-400/80">
                    Tropos is only available for users aged 16 and over. Please
                    check back when you meet the age requirement.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 2 — Body Metrics
          ════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Height */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Ruler size={16} style={{ color: THEME.teal }} />
                    <span className="text-xs font-medium">Height</span>
                  </div>
                  <div className="flex gap-1">
                    {(["cm", "ft"] as const).map((u) => (
                      <button
                        type="button"
                        key={u}
                        onClick={() => setHeightUnit(u)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background:
                            heightUnit === u ? THEME.teal : "hsl(var(--muted))",
                          color:
                            heightUnit === u
                              ? "#000"
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
                    <Dumbbell size={16} style={{ color: THEME.teal }} />
                    <span className="text-xs font-medium">Weight</span>
                  </div>
                  <div className="flex gap-1">
                    {(["kg", "lbs"] as const).map((u) => (
                      <button
                        type="button"
                        key={u}
                        onClick={() => setWeightUnit(u)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background:
                            weightUnit === u ? THEME.teal : "hsl(var(--muted))",
                          color:
                            weightUnit === u
                              ? "#000"
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
             STEP 3 — Primary Goal
          ════════════════════════════════ */}
          {step === 4 && (
            <div className="space-y-2">
              {[
                {
                  id: "hypertrophy" as PrimaryGoal,
                  label: "Build muscle",
                  desc: "Maximize muscle growth with hypertrophy training",
                  icon: <Dumbbell size={22} style={{ color: THEME.lifting }} />,
                },
                {
                  id: "strength" as PrimaryGoal,
                  label: "Get stronger",
                  desc: "Focus on compound lifts and progressive overload",
                  icon: <Zap size={22} style={{ color: THEME.warning }} />,
                },
                {
                  id: "fat_loss" as PrimaryGoal,
                  label: "Lose fat",
                  desc: "Calorie deficit with muscle preservation",
                  icon: <Flame size={22} style={{ color: THEME.running }} />,
                },
                {
                  id: "general" as PrimaryGoal,
                  label: "General fitness",
                  desc: "Balanced strength, cardio, and mobility",
                  icon: <Heart size={22} style={{ color: THEME.success }} />,
                },
                {
                  id: "running" as PrimaryGoal,
                  label: "Improve running",
                  desc: "Run-focused with complementary strength work",
                  icon: (
                    <Footprints size={22} style={{ color: THEME.running }} />
                  ),
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
             STEP 4 — Experience Level
          ════════════════════════════════ */}
          {step === 5 && (
            <div className="space-y-2">
              {[
                {
                  id: "beginner" as Experience,
                  label: "Beginner",
                  desc: "0 – 6 months of consistent training",
                  icon: <Target size={22} style={{ color: THEME.success }} />,
                },
                {
                  id: "intermediate" as Experience,
                  label: "Intermediate",
                  desc: "6 months – 2 years of training",
                  icon: <Award size={22} style={{ color: THEME.brand }} />,
                },
                {
                  id: "advanced" as Experience,
                  label: "Advanced",
                  desc: "2+ years of structured training",
                  icon: <Sparkles size={22} style={{ color: THEME.warning }} />,
                },
              ].map((opt, i) => (
                <OptionCard
                  key={opt.id}
                  selected={experience === opt.id}
                  onSelect={() => setExperience(opt.id)}
                  icon={opt.icon}
                  label={opt.label}
                  desc={opt.desc}
                  index={i}
                />
              ))}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 5 — Days Per Week
          ════════════════════════════════ */}
          {step === 6 && (
            <div className="grid grid-cols-5 gap-2">
              {([2, 3, 4, 5, 6] as DaysPerWeek[]).map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => {
                    setDaysPerWeek(d);
                    // Reset split if incompatible
                    if (
                      d < 5 &&
                      (preferredSplit === "ppl" ||
                        preferredSplit === "bro_split")
                    ) {
                      setPreferredSplit("auto");
                    }
                    if (d < 4 && preferredSplit === "upper_lower") {
                      setPreferredSplit("auto");
                    }
                  }}
                  className="flex flex-col items-center gap-2 py-5 rounded-2xl transition-all active:scale-[0.95]"
                  style={{
                    background:
                      daysPerWeek === d
                        ? `${THEME.teal}20`
                        : "hsl(var(--muted) / 0.5)",
                    border: `1px solid ${daysPerWeek === d ? THEME.teal + "50" : "hsl(var(--muted))"}`,
                  }}
                >
                  <span
                    className="text-2xl font-bold font-mono"
                    style={{
                      color:
                        daysPerWeek === d
                          ? THEME.teal
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
             STEP 6 — Equipment Access
          ════════════════════════════════ */}
          {step === 7 && (
            <div className="space-y-2">
              {[
                {
                  id: "full_gym" as Equipment,
                  label: "Full gym",
                  desc: "Barbells, dumbbells, cables, machines",
                  icon: (
                    <Warehouse size={22} style={{ color: THEME.lifting }} />
                  ),
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
             STEP 7 — Preferred Split
          ════════════════════════════════ */}
          {step === 8 && (
            <div className="space-y-2">
              {[
                {
                  id: "full_body" as PreferredSplit,
                  label: "Full Body",
                  desc: "Hit everything each session",
                  icon: <User size={22} style={{ color: THEME.success }} />,
                },
                {
                  id: "upper_lower" as PreferredSplit,
                  label: "Upper / Lower",
                  desc: "Alternate upper and lower days (4+ days)",
                  icon: <LayoutGrid size={22} style={{ color: THEME.brand }} />,
                },
                {
                  id: "ppl" as PreferredSplit,
                  label: "Push / Pull / Legs",
                  desc: "Classic PPL rotation (5-6 days)",
                  icon: <Dumbbell size={22} style={{ color: THEME.lifting }} />,
                },
                {
                  id: "bro_split" as PreferredSplit,
                  label: "Bro Split",
                  desc: "One muscle group per day (5-6 days)",
                  icon: <Flame size={22} style={{ color: THEME.running }} />,
                },
                {
                  id: "auto" as PreferredSplit,
                  label: "No preference",
                  desc: "We'll pick the best split for you",
                  icon: <Sparkles size={22} style={{ color: THEME.teal }} />,
                },
              ].map((opt, i) => (
                <OptionCard
                  key={opt.id}
                  selected={preferredSplit === opt.id}
                  onSelect={() => setPreferredSplit(opt.id)}
                  index={i}
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
             STEP 8 — Run Frequency + Mode
          ════════════════════════════════ */}
          {step === 9 && (
            <div className="space-y-4">
              <div className="space-y-2">
                {[
                  {
                    id: "regular" as RunFrequency,
                    label: "Regular runner",
                    desc: "3+ runs per week",
                    icon: (
                      <Footprints size={22} style={{ color: THEME.running }} />
                    ),
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
                    icon: (
                      <Dumbbell size={22} style={{ color: THEME.lifting }} />
                    ),
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
                        icon={
                          <Target size={20} style={{ color: THEME.running }} />
                        }
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
                          Target date
                        </p>
                        <input
                          type="date"
                          value={raceTargetDate}
                          onChange={(e) => setRaceTargetDate(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none bg-muted text-foreground border border-border focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-transparent [color-scheme:light_dark]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════
             STEP 9 — Injuries
          ════════════════════════════════ */}
          {step === 10 && (
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
             STEP 11 — Weekly preview (P0-5)
          ════════════════════════════════ */}
          {step === 11 && (
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
                        className="text-[10px] uppercase tracking-wider"
                        style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}
                      >
                        {dayLetters[i]}
                      </p>
                      <p
                        className="text-[11px] font-semibold mt-1 leading-tight"
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
             STEP 12 — Confirmation
          ════════════════════════════════ */}
          {step === 12 && (
            <div
              className="rounded-2xl p-5 space-y-0"
              style={{
                background: `${THEME.teal}08`,
                border: `1px solid ${THEME.teal}25`,
              }}
            >
              {[
                {
                  label: "Your plan",
                  value: splitLabel(preferredSplit),
                  color: THEME.teal,
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
                      i < 5 ? "1px solid hsl(var(--border))" : "none",
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
        {step > START_STEP ? (
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
        ) : isRetake ? (
          <button
            type="button"
            onClick={async () => {
              // Entry handler flipped this to false before sending the user
              // into retake; restore it so bailing out doesn't leave the app
              // treating them as mid-onboarding on next load.
              await updateProfile({ onboardingComplete: true });
              navigate("/settings");
            }}
            className="px-5 py-3.5 rounded-2xl text-sm font-medium active:scale-[0.97]"
            style={{
              background: "hsl(var(--muted))",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            Exit
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (step < TOTAL_STEPS - 1) {
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
          style={{ background: THEME.teal, color: "#000" }}
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
          {step === 2 &&
            ageRange === "under-16" &&
            "You must be 16 or older to use Tropos"}
          {step === 3 && "Enter your height and weight to continue"}
          {step === 8 && "This split requires more training days"}
          {step === 9 &&
            runMode === "race_prep" &&
            !raceTargetDate &&
            "Select a target race date"}
          {step === 10 &&
            injuries.length === 0 &&
            'Select at least one option (or "None")'}
        </p>
      )}
    </div>
  );
}
