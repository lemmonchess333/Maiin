import { useState, useMemo, useEffect, useRef } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { doc, serverTimestamp } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { calculateTDEE, type ActivityLevel } from "@/lib/tdee";
import { resolveGoalWeightPlan } from "@/lib/goalWeightPlan";
import { HEIGHT_CM, WEIGHT_KG, formatHeight } from "@/lib/bodyMetrics";
import { logger } from "@/lib/logger";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { IconButton } from "@/components/ui/IconButton";
import RangeInput from "@/components/ui/RangeInput";
import OptionCard from "@/components/onboarding/OptionCard";
import BodyInputs from "@/components/onboarding/BodyInputs";
import WeekPreview from "@/components/onboarding/WeekPreview";
import {
  equipmentLabel,
  experienceLabel,
  goalLabel,
} from "@/features/program/programLabels";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { getRaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
  clearOnboardingDraft,
  ONBOARDING_STEP_IDS,
  DRAFT_AGE_RANGES,
  DRAFT_SESSION_MINUTES,
  type OnboardingDraft,
  type OnboardingActivity,
} from "@/lib/onboardingDraft";
import {
  buildOnboardingPlan,
  onboardingActivity,
  onboardingFlow,
} from "@/lib/onboardingPlan";
import InlineNumerals from "@/components/ui/InlineNumerals";
import SectionLabel from "@/components/ui/SectionLabel";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { formatDayMonth, formatDayMonthYear } from "@/utils/formatters";
import { Check, ChevronRight, ArrowLeft, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import ChoiceArt from "@/components/onboarding/ChoiceArt";
import SessionLengthLabel from "@/components/program/SessionLengthLabel";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { toast } from "@/lib/toast";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import { DISPLAY_NAME_MAX, validateDisplayName } from "@/lib/displayName";
import { describeRejection } from "@/lib/callableErrors";
import { formatWeightInUnit, formatStonePounds } from "@/lib/weightUnits";
import { newRunnerUntil } from "@/features/program/newRunner";
import { runDoseLine } from "@/lib/runDose";
import { planningEasyPaceSPerKm } from "@/lib/runPaces";

const STEP_IDS = ONBOARDING_STEP_IDS;
const CHAPTERS = ["Your aim", "Your week", "Your setup", "About you", "Start"];
const CHAPTER_FOR_STEP = [0, 1, 2, 1, 2, 3, 4, 4];
const AGE_MIDPOINTS = {
  "under-16": 14,
  "16-24": 20,
  "25-34": 30,
  "35-44": 40,
  "45-54": 50,
  "55+": 60,
};
const STEP_META = [
  [
    "What would you like to work towards?",
    "Choose the focus for your training plan.",
  ],
  [
    "Find your starting rhythm",
    "Choose the training you want in your week. You can change this later.",
  ],
  [
    "Make the plan fit your setup",
    "Equipment and experience shape the exercises in your plan.",
  ],
  ["How does running fit in?", "Keep runs flexible, or work towards a race."],
  [
    "Anything to work around?",
    "Choose any relevant limitations, or select None.",
  ],
  [
    "Start with your numbers",
    "These set your nutrition targets and your initial loads.",
  ],
  ["Review your plan", "Check your answers before creating your plan."],
  [
    "Your plan",
    "Your first week, built from your answers. Change anything before you start.",
  ],
];
const GOALS = [
  {
    id: "hypertrophy",
    label: goalLabel("hypertrophy"),
    desc: "A lifting plan with muscle-building work.",
    art: { kind: "exercise", id: "db-curl" },
  },
  {
    id: "strength",
    label: goalLabel("strength"),
    desc: "A lifting plan focused on building strength.",
    art: { kind: "exercise", id: "squat" },
  },
  {
    id: "fat_loss",
    label: goalLabel("fat_loss"),
    desc: "Lifting to support your goal. Set nutrition separately.",
    art: { kind: "muscles", category: "Full Body" },
  },
  {
    id: "general",
    label: goalLabel("general"),
    desc: "A balanced starting point for regular training.",
    art: { kind: "exercise", id: "push-ups" },
  },
  {
    id: "running",
    label: goalLabel("running"),
    desc: "Free running or a race goal, with optional lifting alongside it.",
    art: { kind: "route", distance: 2 },
  },
] as const;

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [draft] = useState(() =>
    user ? loadOnboardingDraft(user.uid, 7) : null
  );
  const [trainingActivity, setTrainingActivity] = useState<OnboardingActivity>(
    () => onboardingActivity(draft)
  );
  const hasLifting = trainingActivity !== "running";
  const flow = onboardingFlow(trainingActivity);
  const [step, setStep] = useState(() => {
    const storedStep =
      draft?.step === 6
        ? 7
        : draft?.step === 2 && draft.runConfirmed === undefined
          ? 3
          : (draft?.step ?? 0);
    return flow.includes(storedStep) ? storedStep : 1;
  });
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const onboardingCompletedRef = useRef(false);
  const [saveError, setSaveError] = useState("");
  const [returnToReview, setReturnToReview] = useState(
    draft?.returnToReview ?? false
  );
  const [displayName, setDisplayName] = useState(
    draft?.displayName ??
      user?.displayName ??
      user?.email?.split("@")[0]?.trim() ??
      "Athlete"
  );
  const [goalConfirmed, setGoalConfirmed] = useState(
    draft?.goalConfirmed ?? Boolean(draft && draft.step > 0)
  );
  const [runningConfirmed, setRunConfirmed] = useState(
    draft?.runConfirmed ?? Boolean(draft && draft.step > 3)
  );
  /* The same shape as goalConfirmed above: the VALUE a control sits on and
     the fact that the user chose it are two different things, and only the
     second may become a personal input. Equipment, experience and age range
     all arrived on a value and were written to the profile unread —
     equipment shapes the generated plan, experience sets the starting
     loads, and the age range's midpoint feeds the calorie estimate. */
  const [equipmentConfirmed, setEquipmentConfirmed] = useState(
    draft?.equipmentConfirmed ?? Boolean(draft && draft.step > 2)
  );
  const [experienceConfirmed, setExperienceConfirmed] = useState(
    draft?.experienceConfirmed ?? Boolean(draft && draft.step > 2)
  );
  const [ageConfirmed, setAgeConfirmed] = useState(
    draft?.ageConfirmed ?? Boolean(draft && draft.step > 5)
  );
  /* Height and weight keep their numbers — a spin dial has to point
     somewhere, and the plan preview on the steps BEFORE this one needs a
     figure to estimate against. What changes is that the number is not
     treated as the user's until they supply it: the fields render empty
     and `BodyInputs` reports unanswered as invalid. */
  const [bodyAnswered, setBodyAnswered] = useState(
    draft?.bodyAnswered ?? Boolean(draft && draft.step > 5)
  );
  const [primaryGoal, setPrimaryGoal] = useState<
    OnboardingDraft["primaryGoal"]
  >(draft?.primaryGoal ?? "hypertrophy");
  const [liftDaysPreference, setDaysPerWeek] = useState<
    Exclude<OnboardingDraft["daysPerWeek"], 0>
  >(draft?.liftDaysPreference ?? (draft?.daysPerWeek || 4));
  const daysPerWeek = hasLifting ? liftDaysPreference : 0;
  // Lift4 (5): asked with the days, and the plan is built to fit it.
  const [sessionMinutes, setSessionMinutes] = useState<
    NonNullable<OnboardingDraft["sessionMinutes"]>
  >(draft?.sessionMinutes ?? 60);
  const [equipment, setEquipment] = useState<OnboardingDraft["equipment"]>(
    draft?.equipment ?? "full_gym"
  );
  // "What do you have?" (Lift4 (11)): optional, beside the three setups.
  const [barbellAtHome, setBarbellAtHome] = useState(
    draft?.barbellAtHome ?? false
  );
  const [smallPlates, setSmallPlates] = useState(draft?.smallPlates ?? false);
  // Lift4 (10): asked with a race. Unanswered, the plan takes yes for
  // Support my running and no otherwise (`buildOnboardingPlan`).
  const [raceLegTrim, setRaceLegTrim] = useState<boolean | undefined>(
    draft?.raceLegTrim
  );
  // Until the person picks one, the draft week is a beginner's: an unknown
  // level is a beginner's everywhere (Lift4 (5)).
  const [experience, setExperience] = useState<OnboardingDraft["experience"]>(
    draft?.experience ?? "beginner"
  );
  const [chosenRunFrequency, setRunFrequency] = useState<
    OnboardingDraft["runFrequency"]
  >(draft?.runFrequency ?? "occasional");
  const runFrequency =
    trainingActivity === "lifting" ? "none" : chosenRunFrequency;
  const runConfirmed = trainingActivity === "lifting" || runningConfirmed;
  const [runMode, setRunMode] = useState<"freeform" | "race_prep">(
    draft?.runMode === "race_prep" ? "race_prep" : "freeform"
  );
  const [weeklyRunDays, setWeeklyRunDays] = useState(draft?.weeklyRunDays ?? 2);
  const [raceDistance, setRaceDistance] = useState<
    OnboardingDraft["raceDistance"]
  >(draft?.raceDistance ?? "10k");
  const [raceTargetDate, setRaceTargetDate] = useState(
    draft?.raceTargetDate ?? ""
  );
  const [injuries, setInjuries] = useState<string[]>(draft?.injuries ?? []);
  const [gender, setGender] = useState<OnboardingDraft["gender"]>(
    draft?.gender ?? "unspecified"
  );
  const [ageRange, setAgeRange] = useState<OnboardingDraft["ageRange"]>(
    draft?.ageRange ?? "25-34"
  );
  const [heightCm, setHeightCm] = useState(draft?.heightCm ?? 175);
  const [weightKg, setWeightKg] = useState(draft?.weightKg ?? 75);
  const [heightUnit, setHeightUnit] = useState<OnboardingDraft["heightUnit"]>(
    draft?.heightUnit ?? "cm"
  );
  const [weightDisplayUnit, setWeightDisplayUnit] = useState<
    "kg" | "lbs" | "st"
  >(draft?.weightDisplayUnit ?? draft?.weightUnit ?? "kg");
  const weightUnit = weightDisplayUnit === "st" ? "lbs" : weightDisplayUnit;
  const [metricsValid, setMetricsValid] = useState(true);
  // Existing optional motivation is retained in resumed drafts; no extra setup prompt.
  const trainingWhy = draft?.trainingWhy ?? "";
  const currentDate = useLocalDateKey();
  const answers = useMemo<OnboardingDraft>(
    () => ({
      step,
      primaryGoal,
      daysPerWeek,
      equipment,
      runFrequency,
      runMode,
      weeklyRunDays,
      raceDistance,
      raceTargetDate,
      injuries,
      gender,
      ageRange,
      heightCm,
      weightKg,
      heightUnit,
      weightUnit,
      trainingWhy,
      experience,
      goalConfirmed,
      runConfirmed,
      equipmentConfirmed,
      experienceConfirmed,
      ageConfirmed,
      bodyAnswered,
      displayName,
      weightDisplayUnit,
      returnToReview,
      trainingActivity,
      liftDaysPreference,
      sessionMinutes,
      barbellAtHome,
      smallPlates,
      raceLegTrim,
    }),
    [
      step,
      primaryGoal,
      daysPerWeek,
      equipment,
      runFrequency,
      runMode,
      weeklyRunDays,
      raceDistance,
      raceTargetDate,
      injuries,
      gender,
      ageRange,
      heightCm,
      weightKg,
      heightUnit,
      weightUnit,
      trainingWhy,
      experience,
      goalConfirmed,
      runConfirmed,
      equipmentConfirmed,
      experienceConfirmed,
      ageConfirmed,
      bodyAnswered,
      displayName,
      weightDisplayUnit,
      returnToReview,
      trainingActivity,
      liftDaysPreference,
      sessionMinutes,
      barbellAtHome,
      smallPlates,
      raceLegTrim,
    ]
  );
  useEffect(() => {
    if (user && !saving && !onboardingCompletedRef.current)
      saveOnboardingDraft(user.uid, answers);
  }, [user, saving, answers]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    trackLifecycle("onboarding_step_viewed", {
      step: STEP_IDS[step],
      stepIndex: onboardingFlow(trainingActivity).indexOf(step),
    });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [step, trainingActivity]);
  const activityLevel: ActivityLevel =
    daysPerWeek >= 6 ? "very_active" : daysPerWeek >= 4 ? "moderate" : "light";
  /* Goal weight (optional): the target weight owns the nutrition direction
     (goalWeightPlan's locked MacroFactor model), so an empty box holds the
     current weight, as before. Typed in the person's weight unit. */
  const [goalWeightText, setGoalWeightText] = useState("");
  const [paceKgPerWeek, setPaceKgPerWeek] = useState<0.25 | 0.5 | 0.75>(0.5);
  const goalWeightKgInput = useMemo(() => {
    const n = Number.parseFloat(goalWeightText.replace(",", "."));
    if (!Number.isFinite(n)) return null;
    const kg = weightUnit === "lbs" ? n / 2.20462 : n;
    return kg >= 30 && kg <= 300 ? kg : null;
  }, [goalWeightText, weightUnit]);
  const goalPlan = useMemo(
    () =>
      resolveGoalWeightPlan({
        currentKg: weightKg,
        targetKg: goalWeightKgInput ?? weightKg,
        rateKgPerWeek: paceKgPerWeek,
      }),
    [weightKg, goalWeightKgInput, paceKgPerWeek]
  );
  const paceLabel = (kg: number) =>
    weightUnit === "lbs"
      ? `${Math.round(kg * 2.20462 * 2) / 2} lb`
      : `${kg} kg`;
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
  const plan = useMemo(
    () =>
      buildOnboardingPlan(
        {
          primaryGoal,
          daysPerWeek,
          equipment,
          gender,
          experience,
          runFrequency,
          runMode,
          weeklyRunDays,
          raceDistance,
          raceTargetDate,
          injuries,
          weightKg,
          sessionMinutes,
          barbellAtHome: equipment !== "full_gym" && barbellAtHome,
          smallPlates,
          raceLegTrim,
        },
        goalPlan.fitnessGoal,
        currentDate,
        {
          runningBaseline: profile?.runningBaseline ?? null,
          runTimeLimits: profile?.runTimeLimits,
          runFitness: profile?.runFitness,
        }
      ),
    [
      primaryGoal,
      daysPerWeek,
      equipment,
      gender,
      experience,
      runFrequency,
      runMode,
      weeklyRunDays,
      raceDistance,
      raceTargetDate,
      injuries,
      weightKg,
      sessionMinutes,
      barbellAtHome,
      smallPlates,
      raceLegTrim,
      goalPlan.fitnessGoal,
      currentDate,
      profile?.runningBaseline,
      profile?.runTimeLimits,
      profile?.runFitness,
    ]
  );
  const effectiveRunMode = plan.profileUpdates.runMode;
  const effectiveRunDays = plan.profileUpdates.weeklyRunDaysTarget;
  // Run21 (5): a long run's minutes at a confirmed easy pace, the one the
  // plan itself uses.
  const easyPaceSPerKm = planningEasyPaceSPerKm(profile?.runFitness);
  const racePreview = useMemo(
    () =>
      getRaceGoalPlannerState({
        distance: raceDistance,
        targetDate: raceTargetDate,
        currentDate,
        liftDays: daysPerWeek,
        weeklyRunDays,
        newRunnerUntil: newRunnerUntil(runFrequency, currentDate),
      }),
    [
      raceDistance,
      raceTargetDate,
      currentDate,
      daysPerWeek,
      weeklyRunDays,
      runFrequency,
    ]
  );
  const displayNameValidation = validateDisplayName(displayName);
  /* A race with no date is not a race plan. Run9a lands a persisted
     race_prep with no usable date on the freeform substrate rather than
     leaving a dangling raceGoal — correct, and it stays as the backstop for
     resumed drafts and dates that expire. But as the FIRST answer it meant
     the segmented control read "Race prep" while the plan being built was
     free running, with a muted line under the date field carrying the whole
     difference. Requiring the date here means onboarding never creates the
     state Run9a exists to absorb: pick a race and say when, or pick free
     running. */
  const validRun =
    runConfirmed &&
    !(
      runFrequency !== "none" &&
      runMode === "race_prep" &&
      (racePreview.status === "invalid" || racePreview.status === "empty")
    );
  const validBody =
    ageConfirmed &&
    bodyAnswered &&
    ageRange !== "under-16" &&
    metricsValid &&
    weightKg >= WEIGHT_KG.min &&
    weightKg <= WEIGHT_KG.max &&
    heightCm >= HEIGHT_CM.min &&
    heightCm <= HEIGHT_CM.max;
  const canAdvance = [
    goalConfirmed,
    true,
    equipmentConfirmed && experienceConfirmed,
    validRun,
    injuries.length > 0,
    validBody,
    true,
    goalConfirmed &&
      validRun &&
      (!hasLifting || injuries.length > 0) &&
      validBody &&
      displayNameValidation.valid,
  ];
  const chapters = hasLifting
    ? CHAPTERS
    : CHAPTERS.filter((name) => name !== "Your setup");
  const chapter = chapters.indexOf(CHAPTERS[CHAPTER_FOR_STEP[step]]);
  const edit = (next: number) => {
    setReturnToReview(true);
    setSaveError("");
    setStep(next);
  };
  const advance = () => {
    if (!canAdvance[step] || pending.current) return;
    trackLifecycle("onboarding_step_completed", {
      step: STEP_IDS[step],
      stepIndex: flow.indexOf(step),
    });
    if (step === 7) {
      void handleFinish();
      return;
    }
    setStep(returnToReview ? 7 : flow[flow.indexOf(step) + 1]);
    setReturnToReview(false);
  };
  const handleFinish = async () => {
    if (!user || pending.current || !canAdvance[7]) return;
    pending.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const profileData: Record<string, unknown> = {
        displayName: displayNameValidation.trimmed,
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
        athleteType:
          trainingActivity === "running"
            ? "Runner"
            : trainingActivity === "both"
              ? "Hybrid"
              : "Lifter",
        gender,
        ageRange,
        heightCm,
        weightKg,
        // Fast-start: the goal-weight step was deferred, so we persist the
        // target weight as the current weight with a 0 rate → maintenance /
        // recomp (zero offset). This is the same maintenance result the
        // goalPlan above resolves to; a stale non-current default would have
        // written an unintended cut/bulk. Editable later via Settings.
        goalWeightKg: goalWeightKgInput ?? weightKg,
        weeklyRateKg: goalPlan.effectiveRateKgPerWeek,
        preferredHeightUnit: heightUnit,
        preferredWeightUnit: weightUnit,
        primaryGoal,
        experience,
        daysPerWeek,
        equipment,
        ...(equipment !== "full_gym" ? { barbellAtHome } : {}),
        preferredSplit: "auto",
        runFrequency,
        // #975: race_prep without a date → freeform substrate (Run9a),
        // never a dangling race_prep with no raceGoal. Single source of
        // truth for the branch is resolveOnboardingRunMode.
        runMode: effectiveRunMode,
        /* `min` on the input constrains the picker, not a typed or
           programmatically-set value, so the persist refuses a past date as
           well. A race_prep user with no usable date lands on the freeform
           substrate exactly as #975 intended for the no-date case — never a
           dangling raceGoal pointing backwards. */
        ...(effectiveRunMode === "race_prep" &&
        raceTargetDate &&
        raceTargetDate >= localDateString(new Date())
          ? { raceGoal: { distance: raceDistance, targetDate: raceTargetDate } }
          : {}),
        injuries,
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
        program: {
          // Nutrition phase comes from the goal-weight plan (target weight
          // owns direction), not goalToFitnessGoal(primaryGoal).
          goal: goalPlan.fitnessGoal,
          startWeight: weightKg,
          currentPhase: "base",
        },
      };

      const programState = plan.programState;
      // Merge planBuilder's profileUpdates onto profileData. The
      // server-side validator (P0-4 validatePlanPayload) reads
      // weekSchedule + weekScheduleVersion + runMode + raceGoal
      // off profileData; the merge keeps the v6 onboarding fields
      // (TDEE, body metrics, etc.) intact while adding the v7
      // plan-shape fields. plan.profileUpdates.weeklyRunsTarget
      // and weeklyRunDaysTarget overwrite the locally-derived
      // counts above so the values match the actual generated plan.
      // planBuilder's `program` carries only the nutrition phase (`goal`),
      // so it is merged into the map above rather than assigned over it:
      // a shallow assign dropped startWeight and currentPhase.
      const { program: planProgram, ...planShape } = plan.profileUpdates;
      Object.assign(profileData, planShape);
      profileData.program = {
        ...(profileData.program as Record<string, unknown>),
        ...planProgram,
      };

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

      onboardingCompletedRef.current = true;
      clearOnboardingDraft(user.uid);

      // Data is saved server-side (the CF flipped onboardingComplete=true
      // and wrote the chosen experience/plan fields via the Admin SDK).
      // Re-read that authoritative profile so App.tsx switches route sets
      // without a reload AND the first session sees the chosen experience.
      try {
        await refreshProfile();
      } catch (localUpdateErr) {
        logger.warn(
          "Onboarding: local profile update failed; reloading to pick up server state",
          localUpdateErr
        );
        toast.success("Setting up your program…");
        // Brief delay so the toast renders before the reload swallows it.
        await new Promise((r) => setTimeout(r, 600));
        // Re-read the completed profile on Home, where the first-visit
        // walk starts. Preserve the hosting basename.
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
            // No photoURL: sign-up already wrote the Google or Apple photo
            // here (writeNewProfileDocs), and onboarding has none of its
            // own. Writing null erased it from everyone else's view.
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
      // route set. The first screen of the app is the Pro offer (the
      // Cal AI / MacroFactor placement: the product, shown once, right
      // after the plan is made), and its "Continue with Free" lands on Home,
      // whose first card is the session the review led with and where the
      // first-visit walk starts (FV1; until then it opened Train on the
      // review's activity). `replace` keeps Back from returning into the
      // finished onboarding flow; `state.next` carries the destination so
      // the offer page needs no knowledge of the plan.
      navigate("/upgrade?from=onboarding", {
        replace: true,
        state: { next: "/" },
      });
    } catch (err) {
      logger.error("Onboarding save failed:", err);
      const code = (err as { code?: string })?.code?.replace("functions/", "");
      // A failed-precondition carries a sentence written for the person
      // (e.g. the server refusing a display name the word filter flags).
      const refusal =
        code === "failed-precondition" ? describeRejection(err) : null;
      setSaveError(
        code === "unauthenticated"
          ? "Please sign in again to finish setting up your account. Your answers are saved on this device."
          : code === "resource-exhausted"
            ? "Please wait a moment, then try creating your plan again. Your answers are saved."
            : refusal
              ? refusal
              : code === "invalid-argument"
                ? // The server refused an answer, so a retry on a better
                  // connection would fail the same way.
                  "We couldn’t save your plan: one of your answers wasn’t accepted. Check your answers and try again."
                : "We couldn’t save your plan. Check your connection and try again. Your answers are saved."
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const firstWorkout = plan.programState.workouts[0];
  const runningFirst =
    trainingActivity === "running" ||
    (trainingActivity === "both" && primaryGoal === "running");
  const firstRun = plan.programState.runDays
    ?.filter((run) => run.date && run.date >= currentDate)
    .sort((a, b) => a.date!.localeCompare(b.date!))[0];
  const firstRunTemplate =
    firstRun &&
    RUN_TEMPLATES.find(
      (template) =>
        template.id === (firstRun.userOverride || firstRun.templateId)
    );
  const freeRunning =
    runConfirmed && runFrequency !== "none" && effectiveRunMode === "freeform";
  const runSummary = !runConfirmed
    ? "Choose your running setup"
    : runFrequency === "none"
      ? "No running selected"
      : effectiveRunMode === "freeform"
        ? "Free running · no scheduled runs"
        : `${racePreview.distanceLabel} · ${effectiveRunDays} runs per week${raceTargetDate ? ` · ${formatDayMonthYear(parseLocalDate(raceTargetDate))}` : ""}`;
  return (
    <div
      className="h-dvh flex flex-col bg-background text-foreground px-[16px] max-w-lg mx-auto"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <header className="shrink-0 py-3 space-y-3">
        <div className="flex justify-between items-center text-sm">
          <IconButton
            aria-label="Account settings"
            onClick={() => navigate("/settings/account")}
            icon={<UserRound aria-hidden="true" />}
          />
          <span className="text-muted-foreground">
            {chapters[chapter]} ·{" "}
            <span className="font-mono tabular-nums">
              {chapter + 1} / {chapters.length}
            </span>
          </span>
        </div>
        <ol className="flex gap-2" aria-label="Setup chapters">
          {chapters.map((name, index) => (
            <li
              key={name}
              aria-current={chapter === index ? "step" : undefined}
              aria-label={`${name}${index < chapter ? ", completed" : ""}`}
              className={cn(
                "h-1 flex-1 rounded-full",
                index <= chapter ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </ol>
      </header>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 pt-5 pb-6 space-y-6"
      >
        <div className="space-y-3">
          {((step === 1 && trainingActivity !== "lifting") ||
            step === 3 ||
            step === 2 ||
            step === 4) && (
            <p className="text-caption text-muted-foreground">
              {step === 1 || step === 2 ? "1 of 2" : "2 of 2"} in this chapter
            </p>
          )}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-h1 leading-tight tracking-tight font-extrabold focus:outline-none"
          >
            {STEP_META[step][0]}
          </h1>
          <p className="text-base text-muted-foreground">
            {step === 5 && !hasLifting
              ? "Check these starting values. They help estimate your nutrition targets."
              : STEP_META[step][1]}
          </p>
        </div>
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <legend className="sr-only">{chapters[chapter]}</legend>
          {step === 0 && (
            <div className="space-y-3">
              {GOALS.map((goal) => (
                <OptionCard
                  key={goal.id}
                  tone={goal.id === "running" ? "running" : "lifting"}
                  selected={goalConfirmed && primaryGoal === goal.id}
                  onSelect={() => {
                    setPrimaryGoal(goal.id);
                    setGoalConfirmed(true);
                    if (goal.id === "running" && !goalConfirmed) {
                      setTrainingActivity("running");
                      if (chosenRunFrequency === "none")
                        setRunFrequency("occasional");
                      setRunConfirmed(false);
                    }
                  }}
                  /* DS3: a drawing of the training each goal leads to,
                     where a generic icon stood. Running has no drawing of
                     its own, so it shows a route, in the running coral. */
                  icon={<ChoiceArt art={goal.art} />}
                  label={goal.label}
                  desc={
                    goalConfirmed && primaryGoal === goal.id
                      ? goal.desc
                      : undefined
                  }
                />
              ))}
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {goalConfirmed
                  ? "This sets your training focus. You can add a goal weight when you get to About you."
                  : "Choose one to continue. You can revisit it before creating your plan."}
              </p>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-5">
              <SegmentedControl<OnboardingActivity>
                ariaLabel="Training activities"
                value={trainingActivity}
                options={[
                  { value: "lifting", label: "Lifting" },
                  { value: "running", label: "Running" },
                  { value: "both", label: "Both" },
                ]}
                onChange={(activity) => {
                  if (trainingActivity === "lifting" && activity !== "lifting")
                    setRunConfirmed(false);
                  setTrainingActivity(activity);
                  if (activity !== "lifting" && chosenRunFrequency === "none") {
                    setRunFrequency("occasional");
                    setRunConfirmed(false);
                  }
                }}
                tone={trainingActivity === "running" ? "running" : "lifting"}
              />
              {hasLifting && (
                <SegmentedControl<Exclude<OnboardingDraft["daysPerWeek"], 0>>
                  ariaLabel="Lift sessions per week"
                  value={liftDaysPreference}
                  options={([2, 3, 4, 5, 6] as const).map((n) => ({
                    value: n,
                    label: (
                      <span className="font-mono tabular-nums text-xl">
                        {n}
                      </span>
                    ),
                  }))}
                  onChange={setDaysPerWeek}
                  tone="lifting"
                  className="py-2"
                />
              )}
              {hasLifting && (
                <SegmentedControl<
                  NonNullable<OnboardingDraft["sessionMinutes"]>
                >
                  ariaLabel="Minutes per lift session"
                  value={sessionMinutes}
                  options={DRAFT_SESSION_MINUTES.map((n) => ({
                    value: n,
                    label: <SessionLengthLabel minutes={n} />,
                  }))}
                  onChange={setSessionMinutes}
                  tone="lifting"
                  className="@container"
                />
              )}
              <p className="text-sm text-muted-foreground">
                {hasLifting
                  ? "Choose lift sessions per week and about how long each one is. The draft below updates with your plan."
                  : "No lifts will be scheduled. Next, choose free running or prepare for a race."}
              </p>
              {hasLifting && (
                <WeekPreview
                  schedule={plan.weekSchedule}
                  workouts={plan.programState.workouts}
                  runDays={plan.programState.runDays}
                  draft
                  freeRunning={freeRunning}
                  easyPaceSPerKm={easyPaceSPerKm}
                />
              )}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-3">
                {(
                  [
                    {
                      id: "new",
                      label: "New to running",
                      desc: "Starting out, or coming back after a long gap.",
                      distance: 1,
                    },
                    {
                      id: "occasional",
                      label: "Occasional runner",
                      desc: "Usually one or two runs a week.",
                      distance: 2,
                    },
                    {
                      id: "regular",
                      label: "Regular runner",
                      desc: "Usually three or more runs a week.",
                      distance: 3,
                    },
                  ] as const
                ).map((option) => (
                  <OptionCard
                    key={option.id}
                    selected={runConfirmed && runFrequency === option.id}
                    tone="running"
                    /* A route that grows with the running: one footprint
                       icon three times over said nothing about which. */
                    icon={
                      <ChoiceArt
                        art={{ kind: "route", distance: option.distance }}
                      />
                    }
                    label={option.label}
                    desc={option.desc}
                    onSelect={() => {
                      setRunConfirmed(true);
                      setRunFrequency(option.id);
                      /* This lands on the RACE-PREP plan only. Freeform
                         is a substrate with no scheduled runs (Run9a), so
                         its weekly target is 0 whichever tier is picked —
                         pinned in Onboarding.test.tsx. The beginner tier
                         earns its place on the default path by letting
                         someone starting out say so, instead of filing
                         themselves under "occasional runner"; it does not
                         change a freeform plan, and reading it as a
                         freeform scheduling lever is reading it wrong.
                         One a week when a race IS set, for the same
                         volume-preserving reason ADR-0002 gives for not
                         punishing a light trainer. */
                      setWeeklyRunDays(
                        option.id === "regular"
                          ? 3
                          : option.id === "new"
                            ? 1
                            : 2
                      );
                    }}
                  />
                ))}
              </div>
              {runConfirmed && runFrequency !== "none" && (
                <div className="space-y-4">
                  <SegmentedControl<"freeform" | "race_prep">
                    ariaLabel="Running plan"
                    tone="running"
                    value={runMode}
                    onChange={setRunMode}
                    options={[
                      { value: "freeform", label: "Free running" },
                      { value: "race_prep", label: "Race prep" },
                    ]}
                  />
                  {runMode === "race_prep" && (
                    <div className="space-y-4 rounded-2xl bg-card card-shadow p-4">
                      <label className="block text-sm">
                        Runs per week ·{" "}
                        <span className="font-mono tabular-nums">
                          {weeklyRunDays}
                        </span>
                        <RangeInput
                          className="min-h-11"
                          aria-label="Runs per week"
                          min={1}
                          max={7}
                          step={1}
                          value={weeklyRunDays}
                          onChange={(event) =>
                            setWeeklyRunDays(Number(event.target.value))
                          }
                        />
                      </label>
                      <SegmentedControl<OnboardingDraft["raceDistance"]>
                        ariaLabel="Race distance"
                        tone="running"
                        value={raceDistance}
                        onChange={setRaceDistance}
                        options={[
                          { value: "5k", label: "5K" },
                          { value: "10k", label: "10K" },
                          { value: "half", label: "Half" },
                          { value: "marathon", label: "Full" },
                        ]}
                      />
                      <label className="block text-sm space-y-2">
                        <span>Race target date</span>
                        <input
                          type="date"
                          className="ds-input min-h-11 w-full"
                          min={currentDate}
                          value={raceTargetDate}
                          onChange={(event) =>
                            setRaceTargetDate(event.target.value)
                          }
                          aria-invalid={racePreview.status === "invalid"}
                        />
                      </label>
                      {racePreview.status === "empty" ? (
                        <p className="text-sm text-muted-foreground">
                          Pick your race date, or choose Free running to start
                          without one.
                        </p>
                      ) : (
                        <div
                          role={
                            racePreview.status === "invalid"
                              ? "alert"
                              : "status"
                          }
                          className="space-y-1 text-sm"
                        >
                          <p className="font-semibold">
                            {racePreview.statusTitle}
                          </p>
                          <p className="text-muted-foreground">
                            {racePreview.statusDescription}
                          </p>
                        </div>
                      )}
                      {racePreview.doubleDays > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Some days include a lift and a run.
                        </p>
                      )}
                      {hasLifting && (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-foreground">
                              Lighten leg sessions while your runs build
                            </p>
                            <p className="text-xs text-muted-foreground">
                              A third fewer sets on leg lifts, at the same
                              weights, from your plan's build weeks until the
                              two lighter weeks before your race.
                            </p>
                          </div>
                          <Toggle
                            checked={raceLegTrim ?? primaryGoal === "running"}
                            label="Lighten leg sessions while your runs build"
                            className="ml-3"
                            onChange={() =>
                              setRaceLegTrim(
                                !(raceLegTrim ?? primaryGoal === "running")
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {runConfirmed && (
                <WeekPreview
                  schedule={plan.weekSchedule}
                  workouts={plan.programState.workouts}
                  runDays={plan.programState.runDays}
                  draft
                  freeRunning={freeRunning}
                  easyPaceSPerKm={easyPaceSPerKm}
                />
              )}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h2 className="text-base font-semibold">Equipment access</h2>
                {(
                  [
                    {
                      id: "full_gym",
                      label: "Full gym",
                      desc: "Barbells, dumbbells, cables and machines.",
                      art: "chest-press-machine",
                    },
                    {
                      id: "home_gym",
                      label: "Home gym",
                      desc: "Dumbbells, a bench and a pull-up bar.",
                      art: "db-bench",
                    },
                    {
                      id: "minimal",
                      label: "Minimal / bodyweight",
                      desc: "Bodyweight and limited equipment.",
                      art: "bodyweight-squat",
                    },
                  ] as const
                ).map((option) => (
                  <OptionCard
                    key={option.id}
                    selected={equipmentConfirmed && equipment === option.id}
                    onSelect={() => {
                      setEquipmentConfirmed(true);
                      setEquipment(option.id);
                    }}
                    /* The kit each setup means, drawn: a machine, dumbbells
                       on a bench, no equipment at all. */
                    icon={
                      <ChoiceArt art={{ kind: "exercise", id: option.art }} />
                    }
                    label={option.label}
                    desc={option.desc}
                  />
                ))}
              </div>
              {equipmentConfirmed && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">What do you have?</h3>
                    <p className="text-xs text-muted-foreground">
                      Optional. The plan uses what you have.
                    </p>
                  </div>
                  {equipment !== "full_gym" && (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">
                          A barbell and a rack
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Squats, deadlifts and presses with the bar.
                        </p>
                      </div>
                      <Toggle
                        checked={barbellAtHome}
                        label="A barbell and a rack"
                        className="ml-3"
                        onChange={() => setBarbellAtHome((v) => !v)}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Small plates</p>
                      <p className="text-xs text-muted-foreground">
                        Barbell lifts go up 1.25 kg at a time instead of 2.5 kg.
                      </p>
                    </div>
                    <Toggle
                      checked={smallPlates}
                      label="Small plates"
                      className="ml-3"
                      onChange={() => setSmallPlates((v) => !v)}
                    />
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <h2 className="text-base font-semibold">Lifting experience</h2>
                {(
                  [
                    {
                      id: "beginner",
                      label: "New to lifting",
                      desc: "Up to six months of consistent training.",
                      level: 1,
                    },
                    {
                      id: "intermediate",
                      label: "Some experience",
                      desc: "Six months to two years.",
                      level: 2,
                    },
                    {
                      id: "advanced",
                      label: "Experienced",
                      desc: "More than two years of consistent training.",
                      level: 3,
                    },
                  ] as const
                ).map((option) => (
                  <OptionCard
                    key={option.id}
                    selected={experienceConfirmed && experience === option.id}
                    onSelect={() => {
                      setExperienceConfirmed(true);
                      setExperience(option.id);
                    }}
                    icon={
                      <ChoiceArt art={{ kind: "level", level: option.level }} />
                    }
                    label={option.label}
                    desc={option.desc}
                  />
                ))}
              </div>
              {/* Optional here, open everywhere else it appears. The draft
                  week renders on four screens, and on three of them it is
                  the thing being decided: steps 1 and 3 are the "Your week"
                  chapter, and the last step is the review. This step is
                  "Your setup" — equipment and experience change the
                  EXERCISES inside the days, not the shape of the week, so
                  an always-open week rail here repeated a picture that had
                  not moved.

                  Collapsed, not deleted: tapping a day in this preview is
                  the only place the app shows that switching to minimal
                  kit rebuilt your sessions, which is why the summary says
                  so rather than reading "Preview". */}
              <details className="text-sm">
                <summary className="min-h-11 py-3 cursor-pointer text-muted-foreground">
                  See the exercises this builds
                </summary>
                <WeekPreview
                  schedule={plan.weekSchedule}
                  workouts={plan.programState.workouts}
                  runDays={plan.programState.runDays}
                  draft
                  freeRunning={freeRunning}
                  easyPaceSPerKm={easyPaceSPerKm}
                />
              </details>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              {[
                { id: "none", label: "None" },
                { id: "lower_back", label: "Lower back" },
                { id: "shoulder", label: "Shoulder" },
                { id: "knee", label: "Knee" },
                { id: "elbow", label: "Elbow" },
                { id: "wrist", label: "Wrist" },
              ].map((option) => (
                <OptionCard
                  key={option.id}
                  selected={injuries.includes(option.id)}
                  label={option.label}
                  onSelect={() =>
                    setInjuries((previous) =>
                      option.id === "none"
                        ? ["none"]
                        : previous.includes(option.id)
                          ? previous.filter((id) => id !== option.id)
                          : [
                              ...previous.filter((id) => id !== "none"),
                              option.id,
                            ]
                    )
                  }
                />
              ))}
              <details className="text-sm text-muted-foreground">
                <summary className="min-h-11 py-3 cursor-pointer">
                  How this affects your plan
                </summary>
                <p>
                  The existing exercise filters use these choices when selecting
                  movements. You can review the exercises in Train and change
                  limitations in Settings.
                </p>
              </details>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-6">
              <BodyInputs
                answered={bodyAnswered}
                onAnsweredChange={setBodyAnswered}
                weightKg={weightKg}
                heightCm={heightCm}
                weightUnit={weightDisplayUnit}
                heightUnit={heightUnit}
                onWeight={setWeightKg}
                onHeight={setHeightCm}
                onWeightUnit={setWeightDisplayUnit}
                onHeightUnit={setHeightUnit}
                onValidityChange={setMetricsValid}
              />
              <div className="space-y-3">
                <h2 className="text-base font-semibold">
                  Sex for calorie calculation
                </h2>
                <SegmentedControl<OnboardingDraft["gender"]>
                  ariaLabel="Sex for calorie calculation"
                  value={gender}
                  onChange={setGender}
                  options={[
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                    { value: "unspecified", label: "Prefer not to say" },
                  ]}
                />
              </div>
              <div className="space-y-3">
                <h2 className="text-base font-semibold">Age range</h2>
                <SegmentedControl<OnboardingDraft["ageRange"] | "">
                  ariaLabel="Age range"
                  value={ageConfirmed ? ageRange : ""}
                  onChange={(next) => {
                    if (next === "") return;
                    setAgeConfirmed(true);
                    setAgeRange(next);
                  }}
                  layout="wrap"
                  options={DRAFT_AGE_RANGES.map((value) => ({
                    value,
                    label:
                      value === "under-16"
                        ? "Under 16"
                        : value.replace("-", "–"),
                  }))}
                />
                {ageRange === "under-16" && (
                  <p role="alert" className="text-sm text-destructive-strong">
                    You need to be at least 16 to use Tropos.
                  </p>
                )}
              </div>
              <details className="text-sm text-muted-foreground">
                <summary className="min-h-11 py-3 cursor-pointer">
                  Why these details?
                </summary>
                <p>
                  Height, weight and the midpoint of your age range estimate
                  starting calories. The initial activity estimate uses planned
                  lifting frequency; running is accounted for as you log it.
                  “Prefer not to say” uses the male calculation. These are
                  estimates you can adjust in Settings.
                </p>
              </details>
              <div className="space-y-3">
                <label
                  htmlFor="onboarding-goal-weight"
                  className="block text-base font-semibold"
                >
                  Goal weight{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="onboarding-goal-weight"
                    inputMode="decimal"
                    className="ds-input w-32 min-h-11 font-mono tabular-nums"
                    value={goalWeightText}
                    placeholder={formatWeightInUnit(weightKg, weightUnit)}
                    onChange={(event) => setGoalWeightText(event.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {weightUnit === "lbs" ? "lb" : "kg"}
                  </span>
                </div>
                {goalPlan.direction === "maintain" ? (
                  <p className="text-sm text-muted-foreground">
                    {primaryGoal === "fat_loss"
                      ? "To lose fat, enter the weight you’re aiming for. Empty holds your current weight."
                      : "Leave it empty to hold your current weight."}
                  </p>
                ) : (
                  <SegmentedControl<0.25 | 0.5 | 0.75>
                    ariaLabel="Weekly pace"
                    value={paceKgPerWeek}
                    options={([0.25, 0.5, 0.75] as const).map((kg) => ({
                      value: kg,
                      label: (
                        <span className="font-mono tabular-nums">
                          {paceLabel(kg)}
                        </span>
                      ),
                    }))}
                    onChange={setPaceKgPerWeek}
                    tone="lifting"
                  />
                )}
                {goalPlan.direction !== "maintain" && (
                  <p className="text-sm text-muted-foreground">
                    {goalPlan.direction === "lose" ? "Lose" : "Gain"} about{" "}
                    {paceLabel(paceKgPerWeek)} a week.
                    {goalPlan.direction === "lose" &&
                      paceKgPerWeek === 0.5 &&
                      " Most people manage this pace."}
                  </p>
                )}
              </div>
            </div>
          )}
          {step === 7 && (
            <div className="space-y-5">
              <section
                className="rounded-2xl bg-card card-shadow p-5 space-y-3"
                aria-label={
                  runningFirst ? "First run preview" : "First lift preview"
                }
              >
                <SectionLabel
                  className={
                    runningFirst ? "text-running-strong" : "text-lifting-strong"
                  }
                >
                  {runningFirst
                    ? firstRunTemplate
                      ? "Your first planned run"
                      : effectiveRunMode === "race_prep"
                        ? "Your race plan"
                        : "Your running setup"
                    : "Your first lift"}
                </SectionLabel>
                <h2 className="text-xl font-bold">
                  {runningFirst
                    ? (firstRunTemplate?.name ??
                      (effectiveRunMode === "race_prep"
                        ? `${racePreview.distanceLabel} plan`
                        : "Free running"))
                    : firstWorkout?.dayName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  <InlineNumerals>
                    {runningFirst
                      ? firstRunTemplate
                        ? `${runDoseLine(firstRunTemplate, easyPaceSPerKm)} · ${firstRun?.date ? formatDayMonth(parseLocalDate(firstRun.date)) : ""}`
                        : effectiveRunMode === "race_prep"
                          ? `${effectiveRunDays} runs per week · see your upcoming week in Train.`
                          : "Choose your route and pace. No scheduled runs or weekly quota."
                      : `${firstWorkout?.exercises.length ?? 0} exercises · ${goalLabel(primaryGoal)}`}
                  </InlineNumerals>
                </p>
                {!runningFirst && firstWorkout && (
                  <ul className="space-y-2">
                    {firstWorkout.exercises.slice(0, 3).map((exercise) => (
                      <li
                        key={exercise.instanceId ?? exercise.name}
                        className="flex items-center gap-3"
                      >
                        <ExerciseThumb
                          exerciseId={exercise.exerciseId}
                          size="sm"
                        />
                        <span className="text-sm font-medium">
                          {exercise.name}
                        </span>
                      </li>
                    ))}
                    {firstWorkout.exercises.length > 3 && (
                      <li className="text-sm text-muted-foreground pl-[3.25rem]">
                        <InlineNumerals>
                          {`and ${firstWorkout.exercises.length - 3} more`}
                        </InlineNumerals>
                      </li>
                    )}
                  </ul>
                )}
                {runningFirst && firstRunTemplate && (
                  <p className="text-sm text-muted-foreground">
                    {firstRunTemplate.description}
                  </p>
                )}
              </section>
              <WeekPreview
                schedule={plan.weekSchedule}
                workouts={plan.programState.workouts}
                runDays={plan.programState.runDays}
                freeRunning={freeRunning}
                easyPaceSPerKm={easyPaceSPerKm}
              />
              {effectiveRunMode === "race_prep" &&
                (profile?.runTimeLimits?.sessionMinutes ||
                  profile?.runTimeLimits?.longRunMinutes) && (
                  <p className="text-sm text-muted-foreground">
                    This plan uses your saved running time limits. You can
                    change them in Run plan settings.
                  </p>
                )}

              {validBody && (
                <section
                  className="rounded-2xl bg-card card-shadow p-5 space-y-2"
                  aria-label="Your daily target"
                >
                  <SectionLabel className="text-nutrition-strong">
                    Your daily target
                  </SectionLabel>
                  <p className="text-3xl font-mono tabular-nums font-extrabold">
                    {Math.round(tdee.targetCalories).toLocaleString()}{" "}
                    <span className="text-base font-sans font-semibold text-muted-foreground">
                      kcal
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {tdee.protein} g
                    </span>{" "}
                    protein ·{" "}
                    <span className="font-mono tabular-nums">
                      {tdee.carbs} g
                    </span>{" "}
                    carbs ·{" "}
                    <span className="font-mono tabular-nums">{tdee.fat} g</span>{" "}
                    fat
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {goalPlan.direction === "maintain"
                      ? "Enough to hold your weight while you start. Set a goal weight any time in Settings → Nutrition."
                      : `To ${goalPlan.direction === "lose" ? "lose" : "gain"} about ${paceLabel(paceKgPerWeek)} a week.`}
                  </p>
                </section>
              )}
              <details className="rounded-2xl bg-card card-shadow px-4">
                <summary className="min-h-11 py-3 cursor-pointer text-base font-semibold">
                  Your answers
                </summary>
                <div className="divide-y divide-border">
                  {[
                    {
                      label: "Training focus",
                      value: goalConfirmed
                        ? goalLabel(primaryGoal)
                        : "Choose your goal",
                      target: 0,
                    },
                    {
                      label: "Lift sessions",
                      value: hasLifting
                        ? `${daysPerWeek} per week`
                        : "No lifting planned",
                      target: 1,
                    },
                    {
                      label: "Running",
                      value: runSummary,
                      target: trainingActivity === "lifting" ? 1 : 3,
                    },
                    {
                      label: "Setup",
                      value: `${equipmentLabel(equipment)} · ${experienceLabel(experience)}`,
                      target: 2,
                    },
                    {
                      label: "Limitations",
                      value: injuries.length
                        ? injuries
                            .map((id) =>
                              id === "none" ? "None" : id.replaceAll("_", " ")
                            )
                            .join(", ")
                        : "Choose limitations or None",
                      target: 4,
                    },
                    {
                      label: "About you",
                      value: `${weightDisplayUnit === "st" ? formatStonePounds(weightKg) : `${formatWeightInUnit(weightKg, weightUnit)} ${weightUnit === "lbs" ? "lb" : "kg"}`} · ${formatHeight(heightCm, heightUnit)} · age ${ageRange}`,
                      target: 5,
                    },
                  ]
                    .filter(
                      (row) =>
                        hasLifting || (row.target !== 2 && row.target !== 4)
                    )
                    .map((row) => (
                      <div
                        key={row.label}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3"
                      >
                        {/* Edit drops under the answer when the two no
                            longer fit (larger text), rather than leaving a
                            word like "Intermediate" too little room. */}
                        <div className="flex-1 min-w-[min(100%,9em)]">
                          <p className="text-sm text-muted-foreground">
                            {row.label}
                          </p>
                          <p className="text-sm font-semibold">{row.value}</p>
                        </div>
                        <Button
                          variant="ghost"
                          className="ml-auto"
                          onClick={() => edit(row.target)}
                          aria-label={`Edit ${row.label.toLowerCase()}`}
                        >
                          Edit
                        </Button>
                      </div>
                    ))}
                </div>
              </details>
              <div className="space-y-2">
                <label
                  htmlFor="onboarding-name"
                  className="text-base font-semibold"
                >
                  Your public display name
                </label>
                <input
                  id="onboarding-name"
                  className="ds-input w-full min-h-11"
                  value={displayName}
                  maxLength={DISPLAY_NAME_MAX}
                  aria-invalid={!displayNameValidation.valid}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Other people can see this name on your profile. You can change
                  it later.
                </p>
                {!displayNameValidation.valid && (
                  <p className="text-sm text-destructive-strong" role="alert">
                    {displayNameValidation.message}
                  </p>
                )}
              </div>
              {!canAdvance[7] && (
                <p role="alert" className="text-sm text-destructive-strong">
                  Check the answers above before creating your plan.
                </p>
              )}
            </div>
          )}
        </fieldset>
        {saveError && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive-strong"
          >
            {saveError}
          </p>
        )}
      </div>
      {/* Under 15em of footer (larger text on the phone) Back and the main
          button no longer fit side by side, and "Continue" is one word that
          cannot wrap: the main button goes on top, Back under it, each the
          full width. Wide-first. */}
      <footer className="@container shrink-0 border-t border-border pt-4 space-y-2">
        <div className="flex gap-3 @max-[15em]:flex-col-reverse">
          {step !== 0 && (
            <Button
              variant="secondary"
              disabled={saving}
              leftIcon={<ArrowLeft className="size-4" />}
              onClick={() => {
                setSaveError("");
                setStep(
                  returnToReview ? 7 : flow[Math.max(0, flow.indexOf(step) - 1)]
                );
                setReturnToReview(false);
              }}
            >
              Back
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1"
            loading={saving}
            disabled={!canAdvance[step]}
            onClick={advance}
            rightIcon={
              step === 7 ? (
                <Check className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )
            }
          >
            {saving
              ? "Creating your plan…"
              : step === 7
                ? saveError
                  ? "Try creating my plan again"
                  : "Start my plan"
                : returnToReview
                  ? "Back to review"
                  : "Continue"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
