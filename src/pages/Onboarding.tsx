import {
  useState,
  useMemo,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import { useNavigate } from "react-router-dom";
import { haptic } from "@/lib/haptic";
import { useAuth } from "@/lib/auth";
import { doc, serverTimestamp } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
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
import type { ProgramTemplate } from "@/features/program/templates";
import {
  templateExToProgEx,
  templateProgressionFor,
} from "@/features/program/templateConversion";
import {
  matchTemplate,
  applyInjuryFilters,
} from "@/features/program/matchTemplate";
import type {
  ProgramState,
  WorkoutDay,
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
  loadOnboardingDraft,
  saveOnboardingDraft,
  clearOnboardingDraft,
} from "@/lib/onboardingDraft";
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
  Award,
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
  "hypertrophy" | "strength" | "fat_loss" | "general" | "running";
// Experience / Equipment / RunMode / RaceDistance are imported from the
// single-source measure vocabularies (D3) â€” no longer re-declared here.
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
// â€” the nutrition phase now derives from the goal-weight plan (target weight
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

function templateToProgramState(
  template: ProgramTemplate,
  goal: FitnessGoal
): ProgramState {
  const week1 = template.weeks[0];
  // P1 (training-book backlog): the conversion itself lives in
  // features/program/templateConversion.ts so the boundary is unit-tested.
  // Main lifts take the template goal's progression scheme; accessories
  // stay "linear" for parity with the generated-program path.
  const mainProgression = templateProgressionFor(template.goal);
  const workouts: WorkoutDay[] = week1.days
    .filter((d) => d.type === "lift")
    .map((d) => ({
      dayName: d.name,
      dayType: d.type,
      exercises: d.exercises.map((te) =>
        templateExToProgEx(te, mainProgression)
      ),
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

// Fast-start flow (onboarding-fast-start): 13 â†’ 8 steps. We front-load the
// program-shaping questions (goal, days, equipment, run, injuries), collect
// the body metrics once on a single "About you" screen, then preview +
// confirm. Deferred from the flow: name (defaulted from email), experience
// (defaults intermediate), preferred split (defaults auto), and the
// goal-weight slider (target defaults to current weight â†’ maintenance).
// New 0-indexed order: 0 goal Â· 1 days Â· 2 equipment Â· 3 run Â· 4 injuries Â·
// 5 about-you (sex + age + height/weight) Â· 6 preview Â· 7 confirm.
const TOTAL_STEPS = 8;

// Sport-coding for the weekly preview step now lives in
// scheduleUtils.SCHEDULE_TYPE_META â€” single source across
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

// Stable, non-PII step identifiers for funnel analytics â€” parallel to
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

/* D16 â€” quick-tap motivations shown on the confirmation step. Tapping one
   seeds the `trainingWhy` phrase (still editable in the free-text field).
   Short, first-person, and resurfaceable verbatim ("Your why: â€¦"). */
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
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  // D-2 (frontend-design-principles-2026-07): rehydrate any saved draft
  // ONCE, before the state it seeds. A backgrounded PWA reclaim / WKWebView
  // purge / accidental swipe-away no longer restarts the flow â€” the user
  // resumes at their step with every answer intact. uid-scoped + strictly
  // validated in lib/onboardingDraft; null â†’ fresh start at the defaults.
  const [draft] = useState(() =>
    user ? loadOnboardingDraft(user.uid, TOTAL_STEPS - 1) : null
  );

  // Pgm4: Onboarding is now PURELY first-run. The old "retake" mode (jump to
  // step 4 to edit programme fields) was retired â€” editing a programme lives
  // on the unified /settings/training screen, no app re-runs onboarding to
  // change settings. So the flow always starts at step 0 (or the draft's
  // resume point) and walks all TOTAL_STEPS.
  const [step, setStep] = useState(draft?.step ?? 0);
  const [saving, setSaving] = useState(false);

  // Funnel: emit a step-view on mount and on each step change. Fires for
  // every onboarding (not first-only), so dashboards see per-step drop-off.
  // Non-PII â€” stable step id + index only.
  useEffect(() => {
    trackLifecycle("onboarding_step_viewed", {
      step: STEP_IDS[step],
      stepIndex: step,
    });
  }, [step]);

  // â”€â”€ Display name (DEFERRED from the fast-start flow â€” no UI step)
  // The dedicated name step was removed; displayName is now defaulted so the
  // save always writes a valid name and validateDisplayName() passes:
  //   1. Firebase Auth's displayName when available (Google / Apple signin),
  //   2. else the email local-part (before "@"),
  //   3. else "Athlete".
  // Users edit it later from Settings â†’ Profile (progressive profiling).
  const [displayName] = useState<string>(() => {
    if (user?.displayName) return user.displayName;
    const local = user?.email?.split("@")[0]?.trim();
    return local && local.length > 0 ? local : "Athlete";
  });

  // â”€â”€ About you: Gender
  const [gender, setGender] = useState<Gender>(draft?.gender ?? "unspecified");

  // â”€â”€ About you: Age range
  const [ageRange, setAgeRange] = useState<AgeRange>(
    draft?.ageRange ?? "25-34"
  );

  // â”€â”€ About you: Body metrics
  const [heightCm, setHeightCm] = useState(draft?.heightCm ?? 175);
  const [weightKg, setWeightKg] = useState(draft?.weightKg ?? 75);
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft">(
    draft?.heightUnit ?? "cm"
  );
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">(
    draft?.weightUnit ?? "kg"
  );
  // Goal weight (DEFERRED â€” the in-flow slider was removed in fast-start).
  // CRITICAL: the saved goal weight is derived as the entered current weight
  // (see handleFinish: `goalWeightKg: weightKg`, `weeklyRateKg: 0`) so the
  // plan always resolves to maintenance/recomp (zero calorie offset). We no
  // longer keep goal-weight state â€” the slider that drove it is gone, and a
  // stale default (the old 75) would have given a non-75kg user an unintended
  // cut/bulk. The live nutrition preview below uses weightKg for both
  // current and target, which is the same maintenance result.
  const [runFrequency, setRunFrequency] = useState<RunFrequency>(
    draft?.runFrequency ?? "occasional"
  );
  const [runMode, setRunMode] = useState<RunMode>(draft?.runMode ?? "freeform");
  const [weeklyRunDays, setWeeklyRunDays] = useState(draft?.weeklyRunDays ?? 2);
  const [raceDistance, setRaceDistance] = useState<RaceDistance>(
    draft?.raceDistance ?? "10k"
  );
  const [raceTargetDate, setRaceTargetDate] = useState(
    draft?.raceTargetDate ?? ""
  );

  // â”€â”€ Primary goal
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>(
    draft?.primaryGoal ?? "hypertrophy"
  );

  // â”€â”€ Experience
  //
  // Captured on the "About you" step rather than a step of its own â€” the
  // fast-start flow deliberately went 13 â†’ 8 steps, and this belongs with
  // the other "who are you" questions. It was DEFERRED and hardcoded to
  // "intermediate" for every user until 2026-07-28, which meant "beginner"
  // was a value the app could store and never produce: `startingLoads`,
  // `applyDeload`'s novice branch and `matchTemplate` all read it, and all
  // three only ever saw the constant. It now drives movement complexity and
  // whether the week undulates (`experienceModel.ts`).
  const [experience, setExperience] = useState<Experience>(
    draft?.experience ?? "intermediate"
  );

  // â”€â”€ Days per week
  const [daysPerWeek, setDaysPerWeek] = useState<DaysPerWeek>(
    draft?.daysPerWeek ?? 4
  );

  // â”€â”€ Equipment
  const [equipment, setEquipment] = useState<Equipment>(
    draft?.equipment ?? "full_gym"
  );

  // â”€â”€ Preferred split (DEFERRED â€” no UI step; default kept at auto)
  const preferredSplit: PreferredSplit = "auto";

  // â”€â”€ Injuries. Defaults to ["none"] ("No injuries" pre-selected) so the
  // step is advanceable on entry like every other step â€” the fast-start
  // flow auto-selects a sensible default everywhere; injuries was the one
  // step that shipped requiring a manual tap before Continue lit up.
  // A resumed draft's selection wins over the default; a draft can carry
  // [] only from the pre-#1555 window, which restores the old tap-first
  // behaviour for that one resume â€” acceptable and self-healing.
  const [injuries, setInjuries] = useState<string[]>(
    draft?.injuries && draft.injuries.length > 0 ? draft.injuries : ["none"]
  );

  // D16 â€” personal "why". Optional motivation captured on the confirmation
  // step (a tap-chip seeds the phrase; the field stays editable as free
  // text). Never gates advancing; resurfaced later (weekly review).
  const [trainingWhy, setTrainingWhy] = useState<string>(
    draft?.trainingWhy ?? ""
  );

  // D-2: persist the draft on every answer/step change so a kill at ANY
  // moment resumes losslessly. Suppressed while saving (the flow is ending)
  // and permanently once complete (completedRef) so a late effect can't
  // resurrect the draft after clearOnboardingDraft.
  const onboardingCompletedRef = useRef(false);
  useEffect(() => {
    if (!user || saving || onboardingCompletedRef.current) return;
    saveOnboardingDraft(user.uid, {
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
×Ÿ;ÚÚ$z{-®éÜj×·WĞ¢Âö'WGFöãà¢’—Ğ¢ÂöF—cà¢ÂöF—cà¢Å7FWW ¢Æ&VÃÒ%vV–v‡B ¢fÇVS×·vV–v‡D¶wĞ¢F—7Æ•fÇVS×¶F—7Æ•vV–v‡GĞ¢öäFV7&VÖVçC×²‚’Óà¢6WEvV–v‡D¶r‚‡b’Óà¢ÖF‚æÖ‚ƒ3Â'6TfÆöB‚‡bÒvV–v‡E7FW6—¦R’çFôf—†VBƒ’’¢¢Ğ¢öä–æ7&VÖVçC×²‚’Óà¢6WEvV–v‡D¶r‚‡b’Óà¢ÖF‚æÖ–âƒ#SÂ'6TfÆöB‚‡b²vV–v‡E7FW6—¦R’çFôf—†VBƒ’’¢¢Ğ¢óà¢ÂöF—cà¢ÂöF—cà¢—Ğ ¢²ò¢)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y ¢5DUb(	BvVV¶Ç’&Wf–Wr…ÓR¢)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y¢÷Ğ¢·7FWÓÓÒbbb€¢ÆF—`¢6Æ74æÖSÒ'&÷VæFVBÓ'†ÂÓR76R×’ÓB ¢7G–ÆS×·°¢&6¶w&÷VæC¢GµD„TÔRæ'&æGÓ†À¢&÷&FW#¢‚6öÆ–BGµD„TÔRæ'&æGÓ#VÀ¢×Ğ¢à¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2ÓrvÓ"#à¢·&Wf–WuvVVµ66†VGVÆRæÖ‚†BÂ’’Óâ°¢6öç7BF”ÆWGFW'2Ò²%2"Â$Ò"Â%B"Â%r"Â%B"Â$b"Â%2%Ó°¢6öç7BÖWFÒ44„TETÄUõE•UôÔUD¶BçG—UÓ°¢&WGW&â€¢ÆÖ÷F–öâæF—`¢¶W“×¶—Ğ¢–æ—F–Ã×·²÷6—G“¢Â“¢‚×Ğ¢æ–ÖFS×·²÷6—G“¢Â“¢×Ğ¢G&ç6—F–öã×·²FVÆ“¢’¢ãBÂGW&F–öã¢ã#R×Ğ¢6Æ74æÖSÒ'&÷VæFVB×†Â’Ó"‚ÓFW‡BÖ6VçFW" ¢7G–ÆS×·°¢&6¶w&÷VæC¢G¶ÖWFæ6öÆ÷'Ó†À¢&÷&FW#¢‚6öÆ–BG¶ÖWFæ6öÆ÷'ÓCÀ¢×Ğ¢à¢Ç ¢6Æ74æÖSÒ'FW‡BÖ6F–öâWW&66RG&6¶–ær×v–FW" ¢7G–ÆS×·²6öÆ÷#¢&‡6Â‡f"‚ÒÖ×WFVBÖf÷&Vw&÷VæB’òãr’"×Ğ¢à¢¶F”ÆWGFW'5¶•×Ğ¢Â÷à¢Ç ¢6Æ74æÖSÒ'FW‡BÖ6F–öâföçB×6VÖ–&öÆB×BÓÆVF–ær×F–v‡B ¢7G–ÆS×·²6öÆ÷#¢ÖWFæ6öÆ÷"×Ğ¢à¢¶ÖWFæÆ&VÇĞ¢Â÷à¢ÂöÖ÷F–öâæF—cà¢“°¢Ò—Ğ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ2fÆW‚×w&BÓ#à¢²…²&Æ–gB"Â''Vâ"Â&&÷F‚"Â'&W7B%Ò26öç7B’æÖ‚‡B’Óâ°¢6öç7BÖWFÒ44„TETÄUõE•UôÔUD·EÓ°¢6öç7B6÷VçBÒ&Wf–WuvVVµ66†VGVÆRæf–ÇFW"€¢†B’ÓâBçG—RÓÓÒ@¢’æÆVæwFƒ°¢–b†6÷VçBÓÓÒ’&WGW&âçVÆÃ°¢&WGW&â€¢ÆF—b¶W“×·GÒ6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãR#à¢Ç7à¢6Æ74æÖSÒ'6—¦RÓ"&÷VæFVBÖgVÆÂ ¢7G–ÆS×·²&6¶w&÷VæC¢ÖWFæ6öÆ÷"×Ğ¢óà¢Ç7à¢6Æ74æÖSÒ'FW‡B×‡2 ¢7G–ÆS×·²6öÆ÷#¢&‡6Â‡f"‚ÒÖ×WFVBÖf÷&Vw&÷VæB’’"×Ğ¢à¢¶6÷VçGÒ¶ÖWFæÆ&VÂçFôÆ÷vW$66R‚—Ğ¢Â÷7ãà¢ÂöF—cà¢“°¢Ò—Ğ¢ÂöF—cà¢Ç ¢6Æ74æÖSÒ'FW‡B×‡2ÆVF–ær×&VÆ†VB ¢7G–ÆS×·²6öÆ÷#¢&‡6Â‡f"‚ÒÖ×WFVBÖf÷&Vw&÷VæB’òãƒR’"×Ğ¢à¢·&Wf–WuvVVµ66†VGVÆRç6öÖR‚†B’ÓâBçG—RÓÓÒ&&÷F‚"¢ò$&÷F‚F—2—"Æ–gF–æræB'Vææ–æröâöæR6Æ÷B(	BvRvÆÂ66†VGVÆRF†RV6–W"'VâF†BF’â ¢¢%vRvÆÂ7F'B–÷R†W&Râ–÷R6â&V'&ævRF—2ÆFW"g&öÒF†R&öw&ÖÖRF"â'Ğ¢Â÷à¢ÂöF—cà¢—Ğ ¢²ò¢)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y ¢5DUr(	B6öæf—&ÖF–öà¢)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y)Y¢÷Ğ¢·7FWÓÓÒrbb€¢Ãà¢ÆF—`¢6Æ74æÖSÒ'&÷VæFVBÓ'†ÂÓR76R×’Ó ¢7G–ÆS×·°¢&6¶w&÷VæC¢GµD„TÔRæ'&æGÓ†À¢&÷&FW#¢‚6öÆ–BGµD„TÔRæ'&æGÓ#VÀ¢×Ğ¢à¢µ°¢°¢Æ&VÃ¢%–÷W"Æâ"À¢fÇVS¢7Æ—DÆ&VÂ‡&VfW'&VE7Æ—B’À¢6öÆ÷#¢D„TÔRæ'&æBÀ¢ÒÀ¢°¢Æ&VÃ¢%66†VGVÆR"À¢fÇVS¢G¶F—5W%vVV·ÒF—2÷vVV²+rG¶vöÄÆ&VÂ‡&–Ö'”vöÂ—ÖÀ¢6öÆ÷#¢D„TÔRæ'&æBÀ¢ÒÀ¢°¢Æ&VÃ¢%6WGW"À¢fÇVS¢G¶WV—ÖVçDÆ&VÂ†WV—ÖVçB—Ò+rG¶W‡W&–Væ6TÆ&VÂ†W‡W&–Væ6R—ÖÀ¢6öÆ÷#¢D„TÔRæÆ–gF–ærÀ¢ÒÀ¢°¢Æ&VÃ¢%'Vææ–ær"À¢fÇVS ¢'Väg&WVVæ7’ÓÓÒ&æöæR ¢ò$æò'Vææ–ær ¢¢G·'Väg&WÆ&VÂ‡'Väg&WVVæ7’—ÒG·'VäÖöFRÓÒ&g&VVf÷&Ò"ò+rG·'VäÖöFRÓÓÒ'&6U÷&W"ò&6R&W‚G·&6TF—7Fæ6RçFõWW$66R‚—Ò–¢%7G'V7GW&VB'Ö¢"'ÖÀ¢6öÆ÷#¢D„TÔRç'Vææ–ærÀ¢ÒÀ¢°¢Æ&VÃ¢$ÖWG&–72"À¢fÇVS¢G¶F—7Æ”†V–v‡GÒ+rG¶F—7Æ•vV–v‡GÖÀ¢6öÆ÷#¢D„TÔRçv&æ–ærÀ¢ÒÀ¢°¢òò7W&f6W2F†RFW&—fVBçWG&—F–öâ†6R²—G26Æ÷&–P¢òò6öç6WVVæ6R(	BF†RFV6—6–öâvöÅFôf—FæW74vöÂÖ¶W2F†@¢òòv2&Wf–÷W6Ç’–çf—6–&ÆR†öæÇ’F†RçVÖ&W'26†÷vVB&VÆ÷r’à¢òòF–W""(	B†6R6öÖW2g&öÒF†RvöÂ×vV–v‡BÆâà¢Æ&VÃ¢$çWG&—F–öâ"À¢fÇVS¢çWG&—F–öå†6TÆ&VÂ€¢vöÅÆâæf—FæW74vöÂÀ¢FFVRæFVf–6—@¢’À¢6öÆ÷#¢D„TÔRçv&æ–ærÀ¢ÒÀ¢°¢Æ&VÃ¢$F–Ç’F&vWG2"À¢fÇVS¢G·FFVRçF&vWD6Æ÷&–W7Ò6Â+rG·FFVRç&÷FV–çÖr+rG·FFVRæ6&'7Ör2+rG·FFVRæfGÖrfÀ¢6öÆ÷#¢D„TÔRç7V66W72À¢ÒÀ¢ÒæÖ‚‡&÷rÂ’Â&÷w2’Óâ€¢ÆÖ÷F–öâæF—`¢¶W“×·&÷ræÆ&VÇĞ¢–æ—F–Ã×·²÷6—G“¢Â“¢"×Ğ¢æ–ÖFS×·²÷6—G“¢Â“¢×Ğ¢G&ç6—F–öã×·²FVÆ“¢’¢ãÂGW&F–öã¢ã2×Ğ¢6Æ74æÖSÒ&fÆW‚—FV×2×7F'BvÓ2’Ó2 ¢7G–ÆS×·°¢&÷&FW$&÷GFöÓ ¢’Â&÷w2æÆVæwF‚Ò¢ò#‚6öÆ–B‡6Â‡f"‚ÒÖ&÷&FW"’’ ¢¢&æöæR"À¢×Ğ¢à¢ÆF—`¢6Æ74æÖSÒ'6—¦RÓ"&÷VæFVBÖgVÆÂ×BÓãRfÆW‚×6‡&–æ²Ó ¢7G–ÆS×·²&6¶w&÷VæC¢&÷ræ6öÆ÷"×Ğ¢óà¢ÆF—cà¢Ç ¢6Æ74æÖSÒ'FW‡B×‡2WW&66RG&6¶–ær×v–FW" ¢7G–ÆS×·²6öÆ÷#¢&‡6Â‡f"‚ÒÖ×WFVBÖf÷&Vw&÷VæB’òãr’"×Ğ¢à¢·&÷ræÆ&VÇĞ¢Â÷à¢Ç6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆB×BÓãR#à¢·&÷rçfÇVWĞ¢Â÷à¢ÂöF—cà¢ÂöÖ÷F–öâæF—cà¢’—Ğ¢ÂöF—cà¢²ò¢C‚(	BFF—f—G’g&Ö–ærâF†R6–ævÆR†–v†W7B×&WFVçF–öâ6VçFVæ6P¢f÷"6öÆB×7F'C¢—B&Vg&ÖW2F†–âvVV²ÓÆâg&öĞ¢&F—6ö–çF–æròæ÷BW'6öæÆ—6VB"Fò&2FW6–væVB"Âv†–6‚—0¢F†RFö7VÖVçFVB36öÆB×7F'B&—6²â¢÷Ğ¢ÆÖ÷F–öâç ¢–æ—F–Ã×·²÷6—G“¢Â“¢‚×Ğ¢æ–ÖFS×·²÷6—G“¢Â“¢×Ğ¢G&ç6—F–öã×·²FVÆ“¢ãRÂGW&F–öã¢ã2×Ğ¢6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ6VçFW"ÆVF–ær×&VÆ†VB×BÓB‚Ó" ¢7G–ÆS×·²6öÆ÷#¢&‡6Â‡f"‚ÒÖ×WFVBÖf÷&Vw&÷VæB’’"×Ğ¢à¢vVV²—2§W7Bv†W&RvR7F'Bâ–÷W"Æç²"'Ğ¢Ç7â7G–ÆS×·²6öÆ÷#¢D„TÔRæ'&æBÂföçEvV–v‡C¢c×Óà¢FG2WfW'’F–ÖR–÷RÆöp¢Â÷7ãç²"'Ğ¢(	B6W76–öç2Â'Vç2ÂæBvV–v‡BÆÂGVæR—B2–÷Rvòà¢ÂöÖ÷F–öâçà ¢²ò¢Cb(	B÷F–öæÂW'6öæÂ'v‡’"âæ÷B7FW†f7B×7F'@¢öæ&ö&F–ær7F—2‚7FW2’æBæWfW"vFW2F†R5D²FÖ6†— ¢6VVG2F†R‡&6RÂF†R–çWB¶VW2—BVF—F&ÆRâ&W7W&f6V@¢ÆFW"‡vVV¶Ç’&Wf–Wr’Fò&V6öææV7BF†RW6W"v—F‚F†V—"&V6öââ¢÷Ğ¢ÆÖ÷F–öâæF—`¢–æ—F–Ã×·²÷6—G“¢Â“¢‚×Ğ¢æ–ÖFS×·²÷6—G“¢Â“¢×Ğ¢G&ç6—F–öã×·²FVÆ“¢ãbÂGW&F–öã¢ã2×Ğ¢6Æ74æÖSÒ&×BÓR&÷VæFVBÓ'†ÂÓB ¢7G–ÆS×·°¢&6¶w&÷VæC¢&‡6Â‡f"‚ÒÖ×WFVB’òãR’"À¢&÷&FW#¢#‚6öÆ–B‡6Â‡f"‚ÒÖ&÷&FW"’’"À¢×Ğ¢à¢Ç6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆB#à¢v†Bg'7Vó·2G&—f–ær–÷S÷²"'Ğ¢Ç7à¢6Æ74æÖSÒ&föçBÖæ÷&ÖÂ ¢7G–ÆS×·²6öÆ÷#¢&‡6Â‡f"‚ÒÖ×WFVBÖf÷&Vw&÷VæB’’"×Ğ¢à¢÷F–öæÀ¢Â÷7ãà¢Â÷à¢Ç ¢6Æ74æÖSÒ'FW‡B×‡2×BÓãRÆVF–ær×&VÆ†VB ¢7G–ÆS×·²6öÆ÷#¢&‡6Â‡f"‚ÒÖ×WFVBÖf÷&Vw&÷VæB’’"×Ğ¢à¢vRg'7Vó¶ÆÂ'&–ærF†—2&6²öâF†RF—2—B†VÇ2Fò&VÖVÖ&W"à¢Â÷à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ"×BÓ2#à¢µE$”ä”äuõt…•ô4„•2æÖ‚†6†—’Óâ°¢6öç7B6VÆV7FVBÒG&–æ–æuv‡’çG&–Ò‚’ÓÓÒ6†—°¢&WGW&â€¢Æ'WGFöà¢¶W“×¶6†—Ğ¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ°¢†F–2‚“°¢6WEG&–æ–æuv‡’‚†7W"’Óà¢7W"çG&–Ò‚’ÓÓÒ6†—ò""¢6†— ¢“°¢×Ğ¢&–×&W76VC×·6VÆV7FVGĞ¢6Æ74æÖSÒ&Ö–âÖ‚Õ³3g…Ò‚Ó2’ÓãR&÷VæFVBÖgVÆÂFW‡B×‡2föçBÖÖVF—VÒG&ç6—F–öâÖÆÂ7F—fS§66ÆRÕ³ã“uÒ ¢7G–ÆS×°¢6VÆV7FV@¢ò°¢&6¶w&÷VæC¢GµD„TÔRæ'&æGÓÀ¢6öÆ÷#¢D„TÔRæ'&æBÀ¢&÷&FW#¢‚6öÆ–BGµD„TÔRæ'&æGÓSVÀ¢Ğ¢¢°¢&6¶w&÷VæC¢&‡6Â‡f"‚ÒÖ6&B’’"À¢6öÆ÷#¢&‡6Â‡f"‚ÒÖf÷&Vw&÷VæB’’"À¢&÷&FW#¢#‚6öÆ–B‡6Â‡f"‚ÒÖ&÷&FW"’’"À¢Ğ¢Ğ¢à¢¶6†—Ğ¢Âö'WGFöãà¢“°¢Ò—Ğ¢ÂöF—cà¢Æ–çW@¢G—SÒ'FW‡B ¢fÇVS×·G&–æ–æuv‡—Ğ¢öä6†ævS×²†R’Óâ6WEG&–æ–æuv‡’†RçF&vWBçfÇVR—Ğ¢Ö„ÆVæwFƒ×³#Ğ¢&–ÖÆ&VÃÒ%–÷W"v‡’ ¢Æ6V†öÆFW#Ò$÷"w&—FR–÷W"÷vî(
b ¢6Æ74æÖSÒ'rÖgVÆÂ×BÓ2‚Ó2’Ó"ãR&÷VæFVB×†ÂFW‡B×6Ò&rÖ6&B&÷&FW"&÷&FW"Ö&÷&FW"ócFW‡BÖf÷&Vw&÷VæBÆ6V†öÆFW#§FW‡BÖ×WFVBÖf÷&Vw&÷VæBfö7W3¦÷WFÆ–æRÖæöæRfö7W3§&–ærÓ" ¢7G–ÆS×°¢²"Ò×Gr×&–ærÖ6öÆ÷"#¢GµD„TÔRæ'&æGÓSVÒ2555&÷W'F–W0¢Ğ¢óà¢ÂöÖ÷F–öâæF—cà¢Âóà¢—Ğ¢ÂöÖ÷F–öâæF—cà¢Âôæ–ÖFU&W6Væ6Sà ¢²ò¢)H)Hæf–vF–öâ)H)H¢÷Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ2BÓb#à¢·7FWâò€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ6WE7FW‚‡2’Óâ2Ò—Ğ¢6Æ74æÖSÒ'‚ÓR’Ó2ãR&÷VæFVBÓ'†ÂFW‡B×6ÒföçBÖÖVF—VÒ7F—fS§66ÆRÕ³ã“uÒ ¢7G–ÆS×·°¢&6¶w&÷VæC¢&‡6Â‡f"‚ÒÖ×WFVB’’"À¢6öÆ÷#¢&‡6Â‡f"‚ÒÖ×WFVBÖf÷&Vw&÷VæB’’"À¢×Ğ¢à¢&6°¢Âö'WGFöãà¢’¢çVÆÇĞ¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ°¢–b‡7FWÂDõDÅõ5DU2Ò’°¢G&6´Æ–fV7–6ÆR‚&öæ&ö&F–æu÷7FWö6ö×ÆWFVB"Â°¢7FW¢5DUô”E5·7FWÒÀ¢7FW–æFWƒ¢7FWÀ¢Ò“°¢6WE7FW‚‡2’Óâ2²“°¢ÒVÇ6R°¢†æFÆTf–æ—6‚‚“°¢Ğ¢×Ğ¢F—6&ÆVC×²6äGfæ6U·7FWÒÇÂ6f–æwĞ¢6Æ74æÖS×¶6â€¢&fÆW‚ÓfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"’Ó2ãR&÷VæFVBÓ'†ÂFW‡B×6ÒföçBÖ&öÆBG&ç6—F–öâÖÆÂ7F—fS§66ÆRÕ³ã“…Ò"À¢6äGfæ6U·7FWÒbb&÷6—G’ÓC ¢—Ğ¢7G–ÆS×·²&6¶w&÷VæC¢D„TÔRæ'&æBÂ6öÆ÷#¢"6ffb"×Ğ¢à¢·7FWÓÓÒDõDÅõ5DU2Òò€¢6f–ærò€¢%6WGF–ærWâââ ¢’¢€¢Ãà¢7F'B×’&öw&ÒÄ6†Wg&öå&–v‡B6Æ74æÖSÒ'6—¦RÓB"óà¢Âóà¢¢’¢€¢Ãà¢6öçF–çVRÄ6†Wg&öå&–v‡B6Æ74æÖSÒ'6—¦RÓB"óà¢Âóà¢—Ğ¢Âö'WGFöãà¢ÂöF—cà ¢²ò¢fÆ–FF–öâ†–çBv†Vâ'WGFöâ—2F—6&ÆVB¢÷Ğ¢²6äGfæ6U·7FWÒbb6f–ærbb€¢Ç ¢6Æ74æÖSÒ'FW‡BÖ6VçFW"FW‡B×‡2 ¢7G–ÆS×·²6öÆ÷#¢&‡6Â‡f"‚ÒÖ×WFVBÖf÷&Vw&÷VæB’òãr’"×Ğ¢à¢²ò¢7FWB(	B–æ§W&–W3¢BÆV7BöæR6VÆV7F–öâ&WV—&VBâ¢÷Ğ¢·7FWÓÓÒBb`¢–æ§W&–W2æÆVæwF‚ÓÓÒb`¢u6VÆV7BBÆV7BöæR÷F–öâ†÷"$æöæR"’wĞ¢²ò¢7FWR(	B&÷WB–÷S¢vRvFR²&öG’ÖWG&–72âF†RVæFW"ÓbvFP¢F¶W2&–÷&—G“²÷F†W'v—6R&ö×Bf÷"F†RÖ—76–ærÖWG&–2â¢÷Ğ¢·7FWÓÓÒRb`¢vU&ævRÓÓÒ'VæFW"Ób"b`¢%–÷R×W7B&Rb÷"öÆFW"FòW6RG&÷÷2'Ğ¢·7FWÓÓÒRb`¢vU&ævRÓÒ'VæFW"Ób"b`¢$VçFW"–÷W"†V–v‡BæBvV–v‡BFò6öçF–çVR'Ğ¢²ò¢3“sS¢F†R'Vâ7FW‡7FW2’æòÆöævW"vFW2öâ&6RFFR(	@¢—Bw2Çv—2Gfæ6V&ÆRÂ6òæò†–çBF†W&Râ¢÷Ğ¢Â÷à¢—Ğ¢ÂöF—cà¢“°§Ğ 