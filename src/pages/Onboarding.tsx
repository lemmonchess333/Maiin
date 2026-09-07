import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { doc, serverTimestamp } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { calculateTDEE, type ActivityLevel } from "@/lib/tdee";
import { resolveGoalWeightPlan } from "@/lib/goalWeightPlan";
import { logger } from "@/lib/logger";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import RangeInput from "@/components/ui/RangeInput";
import OptionCard from "@/components/onboarding/OptionCard";
import BodyInputs from "@/components/onboarding/BodyInputs";
import WeekPreview from "@/components/onboarding/WeekPreview";
import {
  equipmentLabel,
  experienceLabel,
  goalLabel,
} from "@/features/program/programLabels";
import { localDateString } from "@/lib/dateHelpers";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { getRaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
  clearOnboardingDraft,
  DRAFT_AGE_RANGES,
  type OnboardingDraft,
} from "@/lib/onboardingDraft";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import {
  Dumbbell,
  Flame,
  Zap,
  Footprints,
  Heart,
  Warehouse,
  Check,
  Award,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import { validateDisplayName } from "@/lib/displayName";
import { formatWeightInUnit, formatStonePounds } from "@/lib/weightUnits";

// Stable stored step IDs survive the chapter redesign; old preview (6) merges into review (7).
const FLOW = [0, 1, 3, 2, 4, 5, 7];
const STEP_IDS = [
  "goal",
  "days",
  "equipment",
  "run",
  "injuries",
  "about",
  "preview",
  "confirm",
];
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
    "Choose lift sessions per week. You can change this later.",
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
    "Check these starting values. They help set your nutrition targets and initial loads.",
  ],
  ["Review your plan", "Check your answers before creating your plan."],
  [
    "A starting point that fits you",
    "Here’s the plan your answers generate. Edit anything before you start.",
  ],
];
const GOALS = [
  {
    id: "hypertrophy",
    label: "Build muscle",
    desc: "A lifting plan with muscle-building work.",
    icon: Dumbbell,
  },
  {
    id: "strength",
    label: "Get stronger",
    desc: "A lifting plan focused on building strength.",
    icon: Zap,
  },
  {
    id: "fat_loss",
    label: "Lose fat",
    desc: "Lifting to support your goal. Set nutrition separately.",
    icon: Flame,
  },
  {
    id: "general",
    label: "General fitness",
    desc: "A balanced starting point for regular training.",
    icon: Heart,
  },
  {
    id: "running",
    label: "Improve running",
    desc: "Strength work to support running. Choose your run setup next.",
    icon: Footprints,
  },
] as const;

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [draft] = useState(() =>
    user ? loadOnboardingDraft(user.uid, 7) : null
  );
  const [step, setStep] = useState(() =>
    draft?.step === 6
      ? 7
      : draft?.step === 2 && draft.runConfirmed === undefined
        ? 3
        : (draft?.step ?? 0)
  );
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
  const [runConfirmed, setRunConfirmed] = useState(
    draft?.runConfirmed ?? Boolean(draft && draft.step > 3)
  );
  const [primaryGoal, setPrimaryGoal] = useState<
    OnboardingDraft["primaryGoal"]
  >(draft?.primaryGoal ?? "hypertrophy");
  const [daysPerWeek, setDaysPerWeek] = useState<
    OnboardingDraft["daysPerWeek"]
  >(draft?.daysPerWeek ?? 4);
  const [equipment, setEquipment] = useState<OnboardingDraft["equipment"]>(
    draft?.equipment ?? "full_gym"
  );
  const [experience, setExperience] = useState<OnboardingDraft["experience"]>(
    draft?.experience ?? "intermediate"
  );
  const [runFrequency, setRunFrequency] = useState<
    OnboardingDraft["runFrequency"]
  >(draft?.runFrequency ?? "occasional");
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
      displayName,
      weightDisplayUnit,
      returnToReview,
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
      displayName,
      weightDisplayUnit,
      returnToReview,
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
      stepIndex: FLOW.indexOf(step),
    });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);
  const activityLevel: ActivityLevel =
    daysPerWeek >= 6 ? "very_active" : daysPerWeek >= 4 ? "moderate" : "light";
  const goalPlan = useMemo(
    () =>
      resolveGoalWeightPlan({
        currentKg: weightKg,
        targetKg: weightKg,
        rateKgPerWeek: 0,
      }),
    [weightKg]
  );
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
        },
        goalPlan.fitnessGoal,
        currentDate
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
      goalPlan.fitnessGoal,
      currentDate,
    ]
  );
  const effectiveRunMode = plan.profileUpdates.runMode;
  const effectiveRunDays = plan.profileUpdates.weeklyRunDaysTarget;
  const racePreview = useMemo(
    () =>
      getRaceGoalPlannerState({
        distance: raceDistance,
        targetDate: raceTargetDate,
        currentDate,
        liftDays: daysPerWeek,
        weeklyRunDays,
      }),
    [raceDistance, raceTargetDate, currentDate, daysPerWeek, weeklyRunDays]
  );
  const displayNameValidation = validateDisplayName(displayName);
  const validRun =
    runConfirmed &&
    !(
      runFrequency !== "none" &&
      runMode === "race_prep" &&
      racePreview.status === "invalid"
    );
  const validBody =
    ageRange !== "under-16" &&
    metricsValid &&
    weightKg >= 30 &&
    weightKg <= 300 &&
    heightCm >= 100 &&
    heightCm <= 250;
  const canAdvance = [
    goalConfirmed,
    true,
    true,
    validRun,
    injuries.length > 0,
    validBody,
    true,
    goalConfirmed &&
      validRun &&
      injuries.length > 0 &&
      validBody &&
      displayNameValidation.valid,
  ];
  const chapter = CHAPTER_FOR_STEP[step];
  const edit = (next: number) => {
    setReturnToReview(true);
    setSaveError("");
    setStep(next);
  };
  const advance = () => {
    if (!canAdvance[step] || pending.current) return;
    trackLifecycle("onboarding_step_completed", {
      step: STEP_IDS[step],
      stepIndex: FLOW.indexOf(step),
    });
    if (step === 7) {
      void handleFinish();
      return;
    }
    setStep(returnToReview ? 7 : FLOW[FLOW.indexOf(step) + 1]);
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
      logger.error("Onboarding save failed:", err);
      const code = (err as { code?: string })?.code?.replace("functions/", "");
      setSaveError(
        code === "unauthenticated"
          ? "Please sign in again to finish setting up your account. Your answers are saved on this device."
          : code === "resource-exhausted"
            ? "Please wait a moment, then try creating your plan again. Your answers are saved."
            : "We couldn’t save your plan. Check your connection and try again. Your answers are saved."
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const firstWorkout = plan.programState.workouts[0];
  const freeRunning =
    runConfirmed && runFrequency !== "none" && effectiveRunMode === "freeform";
  const runSummary = !runConfirmed
    ? "Choose your running setup"
    : runFrequency === "none"
      ? "No running selected"
      : effectiveRunMode === "freeform"
        ? "Free running · no scheduled runs"
        : `${racePreview.distanceLabel} · ${effectiveRunDays} runs per week · ${raceTargetDate}`;
  return (
    <div
      className="h-dvh flex flex-col bg-background text-foreground px-4 max-w-lg mx-auto"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <header className="shrink-0 py-3 space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="font-semibold">Tropos</span>
          <span className="text-muted-foreground">
            {CHAPTERS[chapter]} ·{" "}
            <span className="font-mono tabular-nums">{chapter + 1} / 5</span>
          </span>
        </div>
        <ol className="flex gap-2" aria-label="Setup chapters">
          {CHAPTERS.map((name, index) => (
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
          {(chapter === 1 || chapter === 2) && (
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
            {STEP_META[step][1]}
          </p>
        </div>
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <legend className="sr-only">{CHAPTERS[chapter]}</legend>
          {step === 0 && (
            <div className="space-y-3">
              {GOALS.map((goal) => (
                <OptionCard
                  key={goal.id}
                  selected={goalConfirmed && primaryGoal === goal.id}
                  onSelect={() => {
                    setPrimaryGoal(goal.id);
                    setGoalConfirmed(true);
                  }}
                  icon={
                    <goal.icon
                      className={cn(
                        "size-5",
                        goal.id === "running" && "text-running-strong"
                      )}
                    />
                  }
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
                  ? "This changes your training emphasis. Nutrition starts at maintenance; you can set a weight goal later."
                  : "Choose one to continue. You can revisit it before creating your plan."}
              </p>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-5">
              <SegmentedControl<OnboardingDraft["daysPerWeek"]>
                ariaLabel="Lift sessions per week"
                value={daysPerWeek}
                options={([2, 3, 4, 5, 6] as const).map((n) => ({
                  value: n,
                  label: (
                    <span className="font-mono tabular-nums text-xl">{n}</span>
                  ),
                }))}
                onChange={setDaysPerWeek}
                tone="lifting"
                className="py-2"
              />
              <p className="text-sm text-muted-foreground">
                Starting suggestion: four lifts. Choose the rhythm that fits
                your week.
              </p>
              <WeekPreview
                schedule={plan.weekSchedule}
                draft
                freeRunning={freeRunning}
              />
              {!runConfirmed && (
                <p className="text-sm text-muted-foreground">
                  Next, choose whether to include running.
                </p>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-3">
                {(
                  [
                    {
                      id: "regular",
                      label: "Regular runner",
                      desc: "Usually three or more runs a week.",
                    },
                    {
                      id: "occasional",
                      label: "Occasional runner",
                      desc: "Usually one or two runs a week.",
                    },
                    {
                      id: "none",
                      label: "I don’t run",
                      desc: "Keep this plan focused on lifting.",
                    },
                  ] as const
                ).map((option) => (
                  <OptionCard
                    key={option.id}
                    selected={runConfirmed && runFrequency === option.id}
                    icon={<Footprints className="size-5 text-running-strong" />}
                    label={option.label}
                    desc={option.desc}
                    onSelect={() => {
                      setRunConfirmed(true);
                      setRunFrequency(option.id);
                      if (option.id === "none") setRunMode("freeform");
                      else setWeeklyRunDays(option.id === "regular" ? 3 : 2);
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
                        <span>Race target date (optional)</span>
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
                          No date yet? You’ll start with free running and can
                          add a race later.
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
                    </div>
                  )}
                </div>
              )}
              {runConfirmed && (
                <WeekPreview
                  schedule={plan.weekSchedule}
                  draft
                  freeRunning={freeRunning}
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
                    },
                    {
                      id: "home_gym",
                      label: "Home gym",
                      desc: "Barbell and dumbbell setup.",
                    },
                    {
                      id: "minimal",
                      label: "Minimal / bodyweight",
                      desc: "Bodyweight and limited equipment.",
                    },
                  ] as const
                ).map((option) => (
                  <OptionCard
                    key={option.id}
                    selected={equipment === option.id}
                    onSelect={() => setEquipment(option.id)}
                    icon={<Warehouse className="size-5" />}
                    label={option.label}
                    desc={option.desc}
                  />
                ))}
              </div>
              <div className="space-y-3">
                <h2 className="text-base font-semibold">Lifting experience</h2>
                <p className="text-sm text-muted-foreground">
                  Starting suggestion: some experience. Change this to match
                  your training.
                </p>
                {(
                  [
                    {
                      id: "beginner",
                      label: "New to lifting",
                      desc: "Up to six months of consistent training.",
                    },
                    {
                      id: "intermediate",
                      label: "Some experience",
                      desc: "Six months to two years.",
                    },
                    {
                      id: "advanced",
                      label: "Experienced",
                      desc: "More than two years of consistent training.",
                    },
                  ] as const
                ).map((option) => (
                  <OptionCard
                    key={option.id}
                    selected={experience === option.id}
                    onSelect={() => setExperience(option.id)}
                    icon={<Award className="size-5" />}
                    label={option.label}
                    desc={option.desc}
                  />
                ))}
              </div>
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
                  icon={<Heart className="size-5" />}
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
                <SegmentedControl<OnboardingDraft["ageRange"]>
                  ariaLabel="Age range"
                  value={ageRange}
                  onChange={setAgeRange}
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
                  starting calories. Activity is derived from your lift
                  frequency. “Prefer not to say” uses the male calculation.
                  These are estimates you can adjust in Settings.
                </p>
              </details>
            </div>
          )}
          {step === 7 && (
            <div className="space-y-5">
              <section
                className="rounded-2xl bg-card card-shadow p-5 space-y-3"
                aria-label="First lift preview"
              >
                <p className="text-caption text-lifting-strong font-semibold">
                  YOUR FIRST LIFT
                </p>
                <h2 className="text-xl font-bold">{firstWorkout.dayName}</h2>
                <p className="text-sm text-muted-foreground">
                  {firstWorkout.exercises.length} exercises ·{" "}
                  {goalLabel(primaryGoal)}
                </p>
                <div className="flex flex-wrap gap-2 text-sm">
                  {firstWorkout.exercises.slice(0, 3).map((exercise) => (
                    <span
                      key={exercise.name}
                      className="rounded-lg bg-muted px-3 py-2"
                    >
                      {exercise.name}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Create your plan to open the full session in Train.
                </p>
              </section>
              <WeekPreview
                schedule={plan.weekSchedule}
                freeRunning={freeRunning}
              />
              <div className="rounded-2xl bg-card card-shadow divide-y divide-border px-4">
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
                    value: `${daysPerWeek} per week`,
                    target: 1,
                  },
                  { label: "Running", value: runSummary, target: 3 },
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
                    value: `${weightDisplayUnit === "st" ? formatStonePounds(weightKg) : `${formatWeightInUnit(weightKg, weightUnit)} ${weightUnit === "lbs" ? "lb" : "kg"}`} · ${Number(heightCm.toFixed(1))} cm · age ${ageRange}`,
                    target: 5,
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground">
                        {row.label}
                      </p>
                      <p className="text-sm font-semibold">{row.value}</p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => edit(row.target)}
                      aria-label={`Edit ${row.label.toLowerCase()}`}
                    >
                      Edit
                    </Button>
                  </div>
                ))}
              </div>
              {validBody && (
                <section
                  className="rounded-2xl bg-card card-shadow p-4 space-y-3"
                  aria-label="Starting nutrition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">
                      Starting nutrition
                    </h2>
                    <Button
                      variant="ghost"
                      onClick={() => edit(5)}
                      aria-label="Edit nutrition inputs"
                    >
                      Edit inputs
                    </Button>
                  </div>
                  <p className="text-2xl font-mono tabular-nums font-bold">
                    {Math.round(tdee.targetCalories).toLocaleString()}{" "}
                    <span className="text-sm font-sans font-normal text-muted-foreground">
                      kcal / day
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Maintenance to begin with. Set a weight goal when you’re
                    ready in Settings → Nutrition.
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
                </section>
              )}
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
                  maxLength={30}
                  aria-invalid={!displayNameValidation.valid}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Other people can see this name on your profile. You can change
                  it later.
                </p>
                {!displayNameValidation.valid && (
                  <p className="text-sm text-destructive-strong" role="alert">
                    Enter a name between 2 and 30 characters.
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
      <footer className="shrink-0 border-t border-border pt-4 space-y-2">
        <div className="flex gap-3">
          {step !== 0 && (
            <Button
              variant="secondary"
              disabled={saving}
              leftIcon={<ArrowLeft className="size-4" />}
              onClick={() => {
                setSaveError("");
                setStep(
                  returnToReview ? 7 : FLOW[Math.max(0, FLOW.indexOf(step) - 1)]
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
                  : "Create my plan"
                : returnToReview
                  ? "Back to review"
                  : "Continue"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
