/**
 * Pgm4 â€” Unified Programme Settings editor.
 *
 * The single, FREE, scrollable destination for editing an existing
 * programme. Replaces three overlapping surfaces:
 *   - the onboarding-RETAKE (the "50%-cut-off onboarding"),
 *   - the 6-step Pro-gated ConfigurePlanModal wizard, and
 *   - the lighter ProgramSettingsPanel bottom-sheet.
 *
 * Reference-app audit (Pgm4 lock): Fitbod / Hevy / MacroFactor / Garmin /
 * Nike Run Club / Strava all edit goals/plan/equipment via grouped SETTINGS
 * fields with the plan re-deriving â€” none re-run onboarding, none use a
 * separate wizard, none gate basic plan-editing behind a paywall. This
 * screen matches that pattern.
 *
 * Save model:
 *   - The two engine toggles (auto-progression, microloading) live-save via
 *     `updateSettings` â€” no rebuild.
 *   - Every plan-shaping field (focus, nutrition phase, experience, lift
 *     days, split, equipment, injuries, run mode/days, race goal) is a DRAFT.
 *     A single "Save changes" action runs `buildPlan` then the `configurePlan`
 *     CF with `preserveHistory: true` (week number / weekHistory / fatigue
 *     survive â€” only the lift workouts + run plan regenerate), gated behind a
 *     single confirmation. This is the ConfigurePlanModal save path, now with
 *     equipment + injuries sourced from the form instead of threaded
 *     read-only â€” the capability gap the retake was poorly serving.
 *   - "Reset programme" calls the destructive `regenerateProgram` (Week 1 +
 *     cleared weekHistory), behind its own confirmation.
 *
 * NOT here (Pgm4 lock): identity edits (name/gender/age/body metrics/units)
 * stay in Settings â†’ Profile / Units. The day-by-day weekly layout stays in
 * ScheduleLayoutSheet â€” this screen links to it.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  Dumbbell,
  Footprints,
  Apple,
  Warehouse,
  User,
  Award,
  Sparkles,
  Check,
  AlertTriangle,
  BicepsFlexed,
  Flame,
  Heart,
  ChevronRight,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { getNutritionPhase } from "@/lib/nutritionPhase";
import { THEME } from "@/lib/theme";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import BaseSectionLabel from "@/components/ui/SectionLabel";
import { logger } from "@/lib/logger";
import { buildPlan } from "@/features/program/planBuilder";
import { runTuningFromProfile } from "@/features/program/runScheduler";
import {
  chooseSplit,
  splitLabel,
  splitRationale,
} from "@/features/program/programEngine";
import {
  computeProgrammeChanges,
  RACE_DISTANCE_LABELS,
  programmePreservationNote,
} from "@/lib/programmeChanges";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import { localDateString } from "@/lib/dateHelpers";
import ProgrammeSettingsGroup from "./ProgrammeSettingsGroup";
import CurrentProgrammeSummary from "./CurrentProgrammeSummary";
import PendingChangesSummary from "./PendingChangesSummary";
import type {
  PrimaryGoal,
  Goal,
  ProgramState,
  ProgramSettings,
  Experience,
  Equipment,
  RaceDistance,
} from "@/features/program/programTypes";
import type { UserProfile } from "@/lib/auth";

// RunMode / RaceDistance / Experience / Equipment are imported from the
// single-source measure vocabularies (D3) â€” no longer re-declared here.
// The editor's split vocabulary IS the normalisation allow-list â€” derive it
// from VALID_SPLIT_CHOICES so the type can't drift from the runtime guard.
// (auto / full_body / upper_lower / ppl â€” a subset of PreferredSplit; the old
// `SplitType | "auto"` wrongly admitted ppl_ul/ppl_x2/ppl_x2_fb, which the
// guard at line ~373 can never produce.)
type SplitChoice = (typeof VALID_SPLIT_CHOICES)[number];

interface ProgrammeSettingsProps {
  profile: UserProfile;
  programState: ProgramState | null;
  /** Live-saves the engine toggles (auto-progression / microloading). */
  updateSettings: (patch: Partial<ProgramSettings>) => Promise<void> | void;
  /** Destructive rebuild from scratch (Week 1, clears weekHistory). */
  regenerateProgram: (
    goal?: string,
    weeklyTarget?: number
  ) => Promise<void> | void;
  /** Re-hydrates profile state after the atomic server-side rebuild. */
  refreshProfile: () => Promise<void>;
  /** Opens the day-by-day weekly-layout editor (ScheduleLayoutSheet). */
  onOpenWeeklyLayout: () => void;
  /** Optional hook so the host can refresh after a save. */
  onSaved?: () => void;
  /**
   * Which slice of the programme this instance edits (Section-Split, 2026-07).
   *   - "full" (default): the whole programme â€” goal, nutrition, experience,
   *     lifting, running, equipment, injuries, engine toggles, reset. This is
   *     the Settings â†’ "Edit programme" destination (onboarding parity).
   *   - "lift": ONLY the lifting-shaping controls â€” training focus, experience,
   *     lift days + split, equipment, injuries, engine toggles. The nutrition
   *     block, the Running block and the whole-programme reset are hidden.
   *     Their DRAFT state still initialises from the profile and is threaded
   *     unchanged through the save, so committing a lift edit preserves the
   *     user's nutrition phase and run plan untouched. Running has its own
   *     focused editor (RunPlanSettings) â€” this is its lifting counterpart.
   */
  variant?: "full" | "lift";
  /**
   * Blk1 (5): initialises the training-focus DRAFT (mount only) so the
   * block-creation hand-off lands on a prefilled form. The saved profile
   * value is untouched until the user commits through the normal save â€”
   * the per-field diff then flags the change like any manual edit.
   */
  prefillGoal?: PrimaryGoal;
}

/* Programme-settings convenience wrapper â€” the page's section labels
   are the 10px section tier with a consistent mb-2. Delegates to the
   shared SectionLabel primitive so the treatment can't drift. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <BaseSectionLabel tier="section" className="mb-2">
      {children}
    </BaseSectionLabel>
  );
}

interface SettingsOptionCardProps {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  desc?: string;
  disabled?: boolean;
  index?: number;
  accent?: string;
}

function SettingsOptionCard({
  selected,
  onSelect,
  icon,
  label,
  desc,
  disabled,
  index = 0,
  accent = THEME.brand,
}: SettingsOptionCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: index * 0.025 }}
      className={cn(
        "w-full min-h-[68px] flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left",
        "bg-card text-foreground shadow-sm transition-all active:scale-[0.98]",
        selected ? "border-transparent" : "border-border/70",
        disabled && "opacity-35 pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
      style={
        selected
          ? {
              background: `${accent}14`,
              borderColor: `${accent}45`,
            }
          : undefined
      }
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/50">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-bold leading-tight">{label}</span>
        {desc ? (
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
            {desc}
          </span>
        ) : null}
      </span>
      {selected && !disabled ? (
        <Check className="size-4 shrink-0" style={{ color: accent }} />
      ) : null}
    </motion.button>
  );
}

// Each focus card gets a distinct GLYPH for scannability, but all keep the
// purple lifting accent â€” every option here is a lifting goal (primaryGoal
// drives the lift split's rep ranges; "Running support" is lifting that
// complements runs, NOT run scheduling). So per sport-coding, purple is
// correct; only the icon varies. Do not recolour these to coral.
const FOCUS_OPTIONS: {
  id: PrimaryGoal;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "hypertrophy",
    label: "Build muscle",
    desc: "Higher reps, more volume",
    icon: <BicepsFlexed size={18} style={{ color: THEME.brand }} />,
  },
  {
    id: "strength",
    label: "Get stronger",
    desc: "Lower reps, heavier compounds",
    icon: <Dumbbell size={18} style={{ color: THEME.brand }} />,
  },
  {
    id: "fat_loss",
    label: "Lose fat",
    desc: "Higher density, more conditioning",
    icon: <Flame size={18} style={{ color: THEME.brand }} />,
  },
  {
    id: "general",
    label: "Stay fit",
    desc: "Balanced general training",
    icon: <Heart size={18} style={{ color: THEME.brand }} />,
  },
  {
    id: "running",
    label: "Running support",
    desc: "Lifting that complements your runs",
    icon: <Footprints size={18} style={{ color: THEME.brand }} />,
  },
];

const NUTRITION_OPTIONS: { id: Goal; label: string; desc: string }[] = [
  {
    id: "cut",
    label: "Cutting",
    desc: "Calorie deficit â€” lose fat, keep muscle",
  },
  {
    id: "lean bulk",
    label: "Lean bulk",
    desc: "Small surplus â€” build muscle slowly",
  },
  {
    id: "recomp",
    label: "Recomp",
    desc: "Maintenance â€” recompose at current weight",
  },
];

const EXPERIENCE_OPTIONS: {
  id: Experience;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "beginner",
    label: "Beginner",
    desc: "0 â€“ 6 months of consistent training",
    icon: <Target size={20} style={{ color: THEME.success }} />,
  },
  {
    id: "intermediate",
    label: "Intermediate",
    desc: "6 months â€“ 2 years of training",
    icon: <Award size={20} style={{ color: THEME.brand }} />,
  },
  {
    id: "advanced",
    label: "Advanced",
    desc: "2+ years of structured training",
    icon: <Sparkles size={20} style={{ color: THEME.warning }} />,
  },
];

// Pgm5 (Q1): the split is a DERIVED DISPLAY, not a user chooser â€” the engine
// owns structure (chooseSplit from weekly lift days). VALID_SPLIT_CHOICES is
// retained only to normalise a legacy stored profile.preferredSplit (which may
// be "bro_split", a value the engine's SplitType can't build) before it's
// threaded â€” inertly â€” back through buildPlan.
const VALID_SPLIT_CHOICES = [
  "auto",
  "full_body",
  "upper_lower",
  "ppl",
] as const;

const EQUIPMENT_OPTIONS: {
  id: Equipment;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "full_gym",
    label: "Full gym",
    desc: "Barbells, dumbbells, cables, machines",
    icon: <Warehouse size={20} className="text-lifting" />,
  },
  {
    id: "home_gym",
    label: "Home gym",
    desc: "Dumbbells, bench, pull-up bar",
    icon: <Dumbbell size={20} style={{ color: THEME.brand }} />,
  },
  {
    id: "minimal",
    label: "Minimal / bodyweight",
    desc: "Bands, bodyweight, maybe dumbbells",
    icon: <User size={20} style={{ color: THEME.success }} />,
  },
];

const INJURY_OPTIONS: {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "none",
    label: "No injuries",
    desc: "All clear â€” no limitations",
    icon: <Check size={20} style={{ color: THEME.success }} />,
  },
  {
    id: "lower_back",
    label: "Lower back",
    desc: "We'll avoid heavy axial loading",
    icon: <AlertTriangle size={20} style={{ color: THEME.warning }} />,
  },
  {
    id: "shoulder",
    label: "Shoulder",
    desc: "We'll modify pressing movements",
    icon: <AlertTriangle size={20} style={{ color: THEME.warning }} />,
  },
  {
    id: "knee",
    label: "Knee",
    desc: "We'll adjust squat and lunge variations",
    icon: <AlertTriangle size={20} style={{ color: THEME.warning }} />,
  },
  {
    id: "elbow",
    label: "Elbow",
    desc: "We'll swap heavy curls/dips for cable work",
    icon: <AlertTriangle size={20} style={{ color: THEME.warning }} />,
  },
  {
    id: "wrist",
    label: "Wrist",
    desc: "We'll pick neutral-grip and machine variants",
    icon: <AlertTriangle size={20} style={{ color: THEME.warning }} />,
  },
];

// Run9 (3a): `structured` retired as a user-selectable mode â€” running is
export default function ProgrammeSettings({
  profile,
  programState,
  updateSettings,
  regenerateProgram,
  refreshProfile,
  onOpenWeeklyLayout,
  onSaved,
  variant = "full",
  prefillGoal,
}: ProgrammeSettingsProps) {
  const liftOnly = variant === "lift";
  // â”€â”€ Persisted values (also the dirty-check baseline) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const saved = useMemo(
    () => ({
      primaryGoal: (profile.primaryGoal as PrimaryGoal) ?? "hypertrophy",
      nutritionPhase: getNutritionPhase(profile),
      experience: (profile.experience as Experience) ?? "intermediate",
      liftDays: profile.weeklyWorkoutsTarget ?? 4,
      preferredSplit: (VALID_SPLIT_CHOICES as readonly string[]).includes(
        profile.preferredSplit ?? ""
      )
        ? (profile.preferredSplit as SplitChoice)
        : "auto",
      equipment: (profile.equipment as Equipment) ?? "full_gym",
      injuries: profile.injuries ?? [],
      runMode: profile.runMode ?? "freeform",
      weeklyRunDays: getWeeklyRunTarget(profile) || 2,
      raceDistance: (profile.raceGoal?.distance as RaceDistance) ?? "10k",
      raceTargetDate: profile.raceGoal?.targetDate ?? "",
      // Optional event name â€” carried through the rebuild so a lifting-only
      // edit (configurePlan) can never wipe it off the stored raceGoal.
      raceEventName: profile.raceGoal?.eventName,
      // Pgm6 knobs â€” missing â†’ standard (same lazy default the engine uses).
      runVolume: runTuningFromProfile(profile).volume,
      runDifficulty: runTuningFromProfile(profile).difficulty,
    }),
    [profile]
  );

  // â”€â”€ Draft state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>(
    prefillGoal ?? saved.primaryGoal
  );
  // Nutrition phase is NO LONGER editable here â€” it's DERIVED from goal
  // weight vs current (the locked goalWeightPlan / MacroFactor model, owned
  // by /settings/nutrition). This editor showed a direct cut/lean-bulk/recomp
  // picker that wrote `program.goal` independently of goal weight, so the two
  // couldß¾ü¶‰Ëkºwµçh€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€ğ½1¥¹¬ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€¥ô((€€€€€€€€ñ‘¥Øø(€€€€€€€€€€ñM•Ñ¥½¹1…‰•°ùáÁ•É¥•¹”ğ½M•Ñ¥½¹1…‰•°ø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Èˆø(€€€€€€€€€€€íaAI%9}=AQ%=9L¹µ…À ¡½ÁĞ°¤¤€ôø€ (€€€€€€€€€€€€€€ñM•ÑÑ¥¹Í=ÁÑ¥½¹…É(€€€€€€€€€€€€€€€­•äõí½ÁĞ¹¥‘ô(€€€€€€€€€€€€€€€Í•±•Ñ•õí•áÁ•É¥•¹”€ôôô½ÁĞ¹¥‘ô(€€€€€€€€€€€€€€€½¹M•±•Ğõì ¤€ôøÍ•ÑáÁ•É¥•¹”¡½ÁĞ¹¥¥ô(€€€€€€€€€€€€€€€¥¹‘•àõí¥ô(€€€€€€€€€€€€€€€¥½¸õí½ÁĞ¹¥½¹ô(€€€€€€€€€€€€€€€±…‰•°õí½ÁĞ¹±…‰•±ô(€€€€€€€€€€€€€€€‘•ÍŒõí½ÁĞ¹‘•Íô(€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€¤¥ô(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½‘¥Øø(€€€€€€ğ½AÉ½É…µµ•M•ÑÑ¥¹ÍÉ½ÕÀø((€€€€€ì¼¨ƒŠRŠR É½ÕÀ€Èè]••­±äÁ±…¸ƒŠP€‰!½Ü‘½•ÌÑÉ…¥¹¥¹œ™¥Ğ¥¹Ñ¼µäİ••¬üˆƒŠRŠR €¨½ô(€€€€€€ñAÉ½É…µµ•M•ÑÑ¥¹ÍÉ½ÕÀ(€€€€€€€Ñ¥Ñ±”ô‰]••­±äÁ±…¸ˆ(€€€€€€€ÍÕ‰Ñ¥Ñ±”ô‰M•ĞÑ¡”ÑÉ…¥¹¥¹œÉ¡åÑ¡´İ”±°‰Õ¥±…É½Õ¹¸ˆ(€€€€€€ø(€€€€€€€€ñ‘¥Øø(€€€€€€€€€€ñM•Ñ¥½¹1…‰•°ù1¥™Ğ‘…åÌÁ•Èİ••¬ğ½M•Ñ¥½¹1…‰•°ø(€€€€€€€€€€ñM•µ•¹Ñ•‘½¹ÑÉ½°(€€€€€€€€€€€…É¥…1…‰•°ô‰1¥™Ğ‘…åÌÁ•Èİ••¬ˆ(€€€€€€€€€€€½ÁÑ¥½¹ÌõílÈ°€Ì°€Ğ°€Ô°€Ùt¹µ…À ¡¤€ôø€¡ì(€€€€€€€€€€€€€Ù…±Õ”è°(€€€€€€€€€€€€€€¼¼9Õµ•É¥ŒÁ¥­•È±…‰•±Ì™½±±½ÜÑ¡”‘•Í¥¸ÉÕ±”èµ½¹¼€¬Ñ…‰Õ±…È¸(€€€€€€€€€€€€€±…‰•°è€ñÍÁ…¸±…ÍÍ9…µ”ô‰™½¹Ğµµ½¹¼Ñ…‰Õ±…Èµ¹ÕµÌˆùí‘ôğ½ÍÁ…¸ø°(€€€€€€€€€€€ô¤¥ô(€€€€€€€€€€€Ù…±Õ”õí±¥™Ñ…åÍô(€€€€€€€€€€€½¹¡…¹”õíÍ•Ñ1¥™Ñ…åÍô(€€€€€€€€€€¼ø(€€€€€€€€ğ½‘¥Øø((€€€€€€€ì¼¨A´Ô€¡DÄ¤èÍÁ±¥Ğ¥Ì„‘•É¥Ù•%MA1dƒŠPÑ¡”½… Í•ÑÌ¥Ğ™É½´å½ÕÈ(€€€€€€€€€€€İ••­±äÑÉ…¥¹¥¹œ‘…åÌìÑ¡”ÕÍ•È•áÁÉ•ÍÍ•ÌÁÉ•™•É•¹”Ù¥„±¥™Ğµ‘…åÌ€¬(€€€€€€€€€€€Ñ¡”•á•É¥Í”•‘¥Ñ½È°¹½Ğ„ÍÁ±¥ĞÑ½±”¸€¨½ô(€€€€€€€€ñ‘¥Øø(€€€€€€€€€€ñM•Ñ¥½¹1…‰•°ùMÁ±¥Ğğ½M•Ñ¥½¹1…‰•°ø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘•µá°‰œµµÕÑ•Áà´ÌÁä´È¸Ôˆø(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´™½¹Ğµµ•‘¥Õ´Ñ•áĞµ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€íÕÉÉ•¹ÑMÁ±¥Ñ1…‰•±ô(€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µĞ´À¸ÔÑ•áĞµáÌ±•…‘¥¹œµÍ¹ÕœÑ•áĞµµÕÑ•µ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€íÍÁ±¥ÑI…Ñ¥½¹…±”¡±¥™Ñ…åÌ¥ô(€€€€€€€€€€€€€í±¥™Ñ…åÌ€„ôôÍ…Ù•¹±¥™Ñ…åÌ€˜˜€ (€€€€€€€€€€€€€€€€ğø(€€€€€€€€€€€€€€€€€ìˆ€‰ô(€€€€€€€€€€€€€€€€€Ğ€ñÍÁ…¸±…ÍÍ9…µ”ô‰™½¹Ğµµ½¹¼Ñ…‰Õ±…Èµ¹ÕµÌˆø(€€€€€€€€€€€€€€€€€€€í±¥™Ñ…åÍô(€€€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ùìˆ€‰ô(€€€€€€€€€€€€€€€€€í±¥™Ñ…åÌ€ôôô€Ä€ü€‰‘…äˆ€è€‰‘…åÌ‰ô¥Ğ‰•½µ•Íìˆ€‰ô(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰™½¹Ğµµ•‘¥Õ´Ñ•áĞµ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€€€€€€€í•¹•É…Ñ•‘MÁ±¥Ñ1…‰•±ô(€€€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€¸(€€€€€€€€€€€€€€€€ğ¼ø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½‘¥Øø((€€€€€€€ì¼¨ƒŠRŠR IÕ¹¹¥¹œƒŠPIµ=91dÍÕµµ…Éä€¡ÄĞ‘•‘ÕÁ”¤¸IÕ¸µÁ±…¸™¥•±‘Ì(€€€€€€€€€€€€¡µ½‘”°É…”½…°°ÉÕ¸‘…åÌ°A´ØÑÕ¹¥¹œ¤…É”•‘¥Ñ•¥¸=9(€€€€€€€€€€€Á±…”èÑ¡”™½ÕÍ•€½Í•ÑÑ¥¹Ì½ÉÕ¸µÁ±…¸•‘¥Ñ½È°İ¡½Í”ÉÕ¸µ½¹±ä(€€€€€€€€€€€İÉ¥Ñ•ÉÌ¹•Ù•ÈÑÉ¥•ÈÑ¡¥Ì•‘¥Ñ½ÈÌ™Õ±°µÁÉ½É…µµ”É•‰Õ¥±¸(€€€€€€€€€€€‘¥Ñ¥¹œÑ¡•´¡•É”Ñ½¼…Ù”Ñ¡”Í…µ”™¥•±‘ÌÑİ¼‘¥™™•É•¹ĞÍ…Ù”(€€€€€€€€€€€µ½‘•±Ì€¡É•‰Õ¥±ÙÌÉÕ¸µ½¹±äÁ…Ñ ¤ƒŠPÑ¡”Í…µ”Ñİ¼µ•‘¥Ñ½ÉÌ´(€€€€€€€€€€€‘É¥™Ğ™…¥±ÕÉ”Ñ¡”9ÕÑÉ¥Ñ¥½¸Á¡…Í”…É…‰½Ù”Í½±Ù•Ñ¡”Í…µ”(€€€€€€€€€€€İ…ä¸!¥‘‘•¸¥¸Ñ¡”±¥™Ğµ½¹±äÙ¥•Ü¸€¨½ô(€€€€€€€ì…±¥™Ñ=¹±ä€˜˜€ (€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€ñM•Ñ¥½¹1…‰•°ùIÕ¹¹¥¹œğ½M•Ñ¥½¹1…‰•°ø(€€€€€€€€€€€€ñ1¥¹¬(€€€€€€€€€€€€€Ñ¼ôˆ½Í•ÑÑ¥¹Ì½ÉÕ¸µÁ±…¸ˆ(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÌÉ½Õ¹‘•´Éá°‰½É‘•È‰½É‘•Èµ‰½É‘•È¼ÜÀ‰œµ…ÉÁà´Ì¸ÔÁä´ÌÍ¡…‘½ÜµÍ´ÑÉ…¹Í¥Ñ¥½¸µ…±°…Ñ¥Ù”éÍ…±”µlÀ¸äátˆ(€€€€€€€€€€€€ø(€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰É¥Í¥é”´äÍ¡É¥¹¬´ÀÁ±…”µ¥Ñ•µÌµ•¹Ñ•ÈÉ½Õ¹‘•µá°‰œµµÕÑ•¼ÔÀˆø(€€€€€€€€€€€€€€€€ñ½½ÑÁÉ¥¹ÑÌÍ¥é”õìÄáô±…ÍÍ9…µ”ô‰Ñ•áĞµÉÕ¹¹¥¹œˆ€¼ø(€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰µ¥¸µÜ´À™±•à´Äˆø(€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰‰±½¬Ñ•áĞµ‰½‘ä™½¹Ğµ‰½±±•…‘¥¹œµÑ¥¡Ğˆø(€€€€€€€€€€€€€€€€€íÍ…Ù•¹ÉÕ¹5½‘”€ôôô€‰É…•}ÁÉ•Àˆ(€€€€€€€€€€€€€€€€€€€€üI…”ÁÉ•Àƒ
Ü€‘íI}%MQ9}1	1MmÍ…Ù•¹É…•¥ÍÑ…¹•t€üüÍ…Ù•¹É…•¥ÍÑ…¹•õ€(€€€€€€€€€€€€€€€€€€€€è€‰É••™½É´ÉÕ¹¹¥¹œ‰ô(€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰µĞ´À¸Ô‰±½¬Ñ•áĞµáÌ±•…‘¥¹œµÍ¹ÕœÑ•áĞµµÕÑ•µ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€€€€€íÍ…Ù•¹ÉÕ¹5½‘”€ôôô€‰É…•}ÁÉ•Àˆ(€€€€€€€€€€€€€€€€€€€€ü€‘íÍ…Ù•¹İ••­±åIÕ¹…åÍôÉÕ¸€‘íÍ…Ù•¹İ••­±åIÕ¹…åÌ€ôôô€Ä€ü€‰‘…äˆ€è€‰‘…åÌ‰ô½İ••¬ƒŠPÑ…ÀÑ¼•‘¥Ğ¥¸IÕ¸Á±…¹€(€€€€€€€€€€€€€€€€€€€€è€‰IÕ¸İ¡•¹•Ù•Èå½Ô±¥­”ƒŠPÑ…ÀÑ¼Í•Ğ„É…”½…°‰ô(€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€ñ¡•ÙÉ½¹I¥¡Ğ(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Í¥é”´ĞÍ¡É¥¹¬´ÀÑ•áĞµµÕÑ•µ™½É•É½Õ¹ˆ(€€€€€€€€€€€€€€€…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ(€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€ğ½1¥¹¬ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€¥ô((€€€€€€€ì¼¨@Èèİ••­±äµ±…å½ÕĞÁÉ•Ù¥•ÜƒŠP½Õ¹ÑÌ‘•É¥Ù•™É½´Ñ¡”‘É…™Ğ±¥™Ğ½ÉÕ¸(€€€€€€€€€‘…åÌì½Á•¹ÌÑ¡”•á¥ÍÑ¥¹œ‘…äµ‰äµ‘…ä•‘¥Ñ½È€¡M¡•‘Õ±•1…å½ÕÑM¡••Ğ¤¸€¨½ô(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘•µá°‰œµµÕÑ•Áà´ÌÁä´È¸Ôˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ‰•Ñİ••¸…À´Ìˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¸µÜ´Àˆø(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´™½¹Ğµµ•‘¥Õ´Ñ•áĞµ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€€€]••­±ä±…å½ÕĞ(€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µĞ´À¸ÔÑ•áĞµáÌÑ•áĞµµÕÑ•µ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰™½¹Ğµµ½¹¼Ñ…‰Õ±…Èµ¹ÕµÌˆùíİ••­1¥™Ñ…åÍôğ½ÍÁ…¸ùìˆ€‰ô(€€€€€€€€€€€€€€€±¥™Ğ(€€€€€€€€€€€€€€€íİ••­IÕ¹…åÌ€ø€À€˜˜€ (€€€€€€€€€€€€€€€€€€ğø(€€€€€€€€€€€€€€€€€€€ìˆƒ
Ü€‰ô(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰™½¹Ğµµ½¹¼Ñ…‰Õ±…Èµ¹ÕµÌˆø(€€€€€€€€€€€€€€€€€€€€€íİ••­IÕ¹…åÍô(€€€€€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ùìˆ€‰ô(€€€€€€€€€€€€€€€€€€€ÉÕ¸(€€€€€€€€€€€€€€€€€€ğ¼ø(€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€íİ••­½Õ‰±•…åÌ€ø€À€˜˜€ (€€€€€€€€€€€€€€€€€€ğø(€€€€€€€€€€€€€€€€€€€ìˆƒ
Ü€‰ô(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰™½¹Ğµµ½¹¼Ñ…‰Õ±…Èµ¹ÕµÌˆø(€€€€€€€€€€€€€€€€€€€€€íİ••­½Õ‰±•…åÍô(€€€€€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ùìˆ€‰ô(€€€€€€€€€€€€€€€€€€€‘½Õ‰±”(€€€€€€€€€€€€€€€€€€ğ¼ø(€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€íİ••­I•ÍÑ…åÌ€ø€À€˜˜€ (€€€€€€€€€€€€€€€€€€ğø(€€€€€€€€€€€€€€€€€€€ìˆƒ
Ü€‰ô(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰™½¹Ğµµ½¹¼Ñ…‰Õ±…Èµ¹ÕµÌˆø(€€€€€€€€€€€€€€€€€€€€€íİ••­I•ÍÑ…åÍô(€€€€€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ùìˆ€‰ô(€€€€€€€€€€€€€€€€€€€É•ÍĞ(€€€€€€€€€€€€€€€€€€ğ¼ø(€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€½¹±¥¬õí½¹=Á•¹]••­±å1…å½ÕÑô(€€€€€€€€€€€€€±…ÍÍ9…µ”ôˆµµÈ´Ä¥¹±¥¹”µ™±•àµ¥¸µ µlĞÑÁátÍ¡É¥¹¬´À¥Ñ•µÌµ•¹Ñ•È…À´ÄÁà´ÄÑ•áĞµáÌ™½¹ĞµÍ•µ¥‰½±Ñ•áĞµÁÉ¥µ…ÉäÑÉ…¹Í¥Ñ¥½¸µÑÉ…¹Í™½É´…Ñ¥Ù”éÍ…±”µlÀ¸äİtˆ(€€€€€€€€€€€€ø(€€€€€€€€€€€€€‘¥Ğ‘…åÌ€™É…ÉÈì(€€€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½‘¥Øø(€€€€€€ğ½AÉ½É…µµ•M•ÑÑ¥¹ÍÉ½ÕÀø((€€€€€ì¼¨ƒŠRŠR É½ÕÀ€Ìè½¹ÍÑÉ…¥¹ÑÌƒŠP€‰]¡…ĞµÕÍĞÑ¡”Á±…¸…‘…ÁĞ…É½Õ¹üˆƒŠRŠR €¨½ô(€€€€€€ñAÉ½É…µµ•M•ÑÑ¥¹ÍÉ½ÕÀ(€€€€€€€Ñ¥Ñ±”ô‰½¹ÍÑÉ…¥¹ÑÌˆ(€€€€€€€ÍÕ‰Ñ¥Ñ±”ô‰]”±°¡½½Í”•á•É¥Í•Ì…É½Õ¹İ¡…Ğå½Ô¡…Ù”…¹İ¡…Ğå½Ô¹••Ñ¼…Ù½¥¸ˆ(€€€€€€ø(€€€€€€€€ñ‘¥Øø(€€€€€€€€€€ñM•Ñ¥½¹1…‰•°ùÅÕ¥Áµ•¹Ğ…•ÍÌğ½M•Ñ¥½¹1…‰•°ø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Èˆø(€€€€€€€€€€€íEU%A59Q}=AQ%=9L¹µ…À ¡½ÁĞ°¤¤€ôø€ (€€€€€€€€€€€€€€ñM•ÑÑ¥¹Í=ÁÑ¥½¹…É(€€€€€€€€€€€€€€€­•äõí½ÁĞ¹¥‘ô(€€€€€€€€€€€€€€€Í•±•Ñ•õí•ÅÕ¥Áµ•¹Ğ€ôôô½ÁĞ¹¥‘ô(€€€€€€€€€€€€€€€½¹M•±•Ğõì ¤€ôøÍ•ÑÅÕ¥Áµ•¹Ğ¡½ÁĞ¹¥¥ô(€€€€€€€€€€€€€€€¥¹‘•àõí¥ô(€€€€€€€€€€€€€€€¥½¸õí½ÁĞ¹¥½¹ô(€€€€€€€€€€€€€€€±…‰•°õí½ÁĞ¹±…‰•±ô(€€€€€€€€€€€€€€€‘•ÍŒõí½ÁĞ¹‘•Íô(€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€¤¥ô(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½‘¥Øø((€€€€€€€€ñ‘¥Øø(€€€€€€€€€€ñM•Ñ¥½¹1…‰•°ù%¹©ÕÉ¥•Ìğ½M•Ñ¥½¹1…‰•°ø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Èˆø(€€€€€€€€€€€í%9)UIe}=AQ%=9L¹µ…À ¡½ÁĞ°¤¤€ôø€ (€€€€€€€€€€€€€€ñM•ÑÑ¥¹Í=ÁÑ¥½¹…É(€€€€€€€€€€€€€€€­•äõí½ÁĞ¹¥‘ô(€€€€€€€€€€€€€€€Í•±•Ñ•õí¥¹©ÕÉ¥•Ì¹¥¹±Õ‘•Ì¡½ÁĞ¹¥¥ô(€€€€€€€€€€€€€€€½¹M•±•Ğõì ¤€ôøÑ½±•%¹©ÕÉä¡½ÁĞ¹¥¥ô(€€€€€€€€€€€€€€€¥¹‘•àõí¥ô(€€€€€€€€€€€€€€€¥½¸õí½ÁĞ¹¥½¹ô(€€€€€€€€€€€€€€€±…‰•°õí½ÁĞ¹±…‰•±ô(€€€€€€€€€€€€€€€‘•ÍŒõí½ÁĞ¹‘•Íô(€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€¤¥ô(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½‘¥Øø(€€€€€€ğ½AÉ½É…µµ•M•ÑÑ¥¹ÍÉ½ÕÀø((€€€€€ì¼¨ƒŠRŠR É½ÕÀ€Ğè‘Ù…¹•€¡•¹¥¹”Ñ½±•ÌƒŠP±¥Ù”µÍ…Ù”°¹¼É•‰Õ¥±¤ƒŠRŠR €¨½ô(€€€€€€ñAÉ½É…µµ•M•ÑÑ¥¹ÍÉ½ÕÀ(€€€€€€€Ñ¥Ñ±”ô‰‘Ù…¹•ˆ(€€€€€€€ÍÕ‰Ñ¥Ñ±”ô‰¥¹”µÑÕ¹”ÁÉ½É•ÍÍ¥½¸‰•¡…Ù¥½ÕÈ¸M…Ù•¥¹ÍÑ…¹Ñ±äƒŠP¹¼É•‰Õ¥±¸ˆ(€€€€€€ø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ìˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ‰•Ñİ••¸ˆø(€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´Ñ•áĞµ™½É•É½Õ¹ˆùÕÑ¼AÉ½É•ÍÍ¥½¸ğ½Àø(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµµÕÑ•µ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€€€	ÕµÁÌ¹•áĞÍ•ÍÍ¥½¸Ìİ•¥¡Ğİ¡•¸å½Ô½µÁ±•Ñ”•Ù•ÉäÍ•Ğ±•…¹±ä(€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€ñQ½±”(€€€€€€€€€€€€€¡•­•õíÍ•ÑÑ¥¹Ì¹…ÕÑ½AÉ½É•ÍÍ¥½¹ô(€€€€€€€€€€€€€±…‰•°ô‰ÕÑ¼ÁÉ½É•ÍÍ¥½¸ˆ(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µ°´Ìˆ(€€€€€€€€€€€€€½¹¡…¹”õì ¤€ôø(€€€€€€€€€€€€€€€ÕÁ‘…Ñ•M•ÑÑ¥¹Ì¡ì…ÕÑ½AÉ½É•ÍÍ¥½¸è€…Í•ÑÑ¥¹Ì¹…ÕÑ½AÉ½É•ÍÍ¥½¸ô¤(€€€€€€€€€€€€€ô(€€€€€€€€€€€€¼ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ‰•Ñİ••¸ˆø(€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´Ñ•áĞµ™½É•É½Õ¹ˆù5¥É½±½…‘¥¹œğ½Àø(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµµÕÑ•µ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€€€UÍ”ƒ
ô­œ©ÕµÁÌ½¸Íµ…±±•È±¥™ÑÌÍ¼ÁÉ½É•ÍÍ¥½¸­••ÁÌµ½Ù¥¹œÁ…ÍĞ(€€€€€€€€€€€€€€€ÍÑ…±±Ì(€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€ñQ½±”(€€€€€€€€€€€€€¡•­•õíÍ•ÑÑ¥¹Ì¹µ¥É½±½…‘¥¹ô(€€€€€€€€€€€€€±…‰•°ô‰5¥É½±½…‘¥¹œˆ(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µ°´Ìˆ(€€€€€€€€€€€€€½¹¡…¹”õì ¤€ôø(€€€€€€€€€€€€€€€ÕÁ‘…Ñ•M•ÑÑ¥¹Ì¡ìµ¥É½±½…‘¥¹œè€…Í•ÑÑ¥¹Ì¹µ¥É½±½…‘¥¹œô¤(€€€€€€€€€€€€€ô(€€€€€€€€€€€€¼ø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€ğ½‘¥Øø(€€€€€€ğ½AÉ½É…µµ•M•ÑÑ¥¹ÍÉ½ÕÀø((€€€€€ì¼¨ƒŠRŠR É½ÕÀ€Ôè…¹•Èé½¹”€¡‘•ÍÑÉÕÑ¥Ù”É•Í•Ğ°Í•Á…É…Ñ•™É½´ÑÕ¹¥¹œ¤ƒŠRŠR (€€€€€€€€€]¡½±”µÁÉ½É…µµ”É•Í•ĞƒŠP¡¥‘‘•¸¥¸Ñ¡”±¥™Ğµ½¹±äÙ¥•Ü€¡¥ĞÉ•Í•ÑÌ(€€€€€€€€€ÉÕ¹¹¥¹œ€¬¹ÕÑÉ¥Ñ¥½¸Ñ½¼°Í¼¥Ğ‰•±½¹ÌÑ¼Ñ¡”™Õ±°•‘¥Ñ½È¤¸€¨½ô(€€€€€ì…±¥™Ñ=¹±ä€˜˜€ (€€€€€€€€ñAÉ½É…µµ•M•ÑÑ¥¹ÍÉ½ÕÀ(€€€€€€€€€Ñ¥Ñ±”ô‰…¹•Èé½¹”ˆ(€€€€€€€€€Ñ½¹”ô‰‘…¹•Èˆ(€€€€€€€€€ÍÕ‰Ñ¥Ñ±”ô‰I•Í•ÑÑ¥¹œÉ•‰Õ¥±‘Ìå½ÕÈÁÉ½É…µµ”™É½´ÍÉ…Ñ ƒŠPå½Ô±°ÍÑ…ÉĞ…Ğ]••¬€Ä…¹Á…ÍĞİ••¬ÍÕµµ…É¥•Ì±•…È¸1½•İ½É­½ÕÑÌ…¹ÉÕ¹ÌÍÑ…ä¥¸!¥ÍÑ½Éä¸ˆ(€€€€€€€€ø(€€€€€€€€€€ñ	ÕÑÑ½¸(€€€€€€€€€€€Ù…É¥…¹Ğô‰‘•ÍÑÉÕÑ¥Ù”µÑ¥¹Ñ•ˆ(€€€€€€€€€€€™Õ±±]¥‘Ñ (€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•Ñ½¹™¥ÉµI•Í•Ğ¡ÑÉÕ”¥ô(€€€€€€€€€€ø(€€€€€€€€€€€I•Í•ĞAÉ½É…µµ”(€€€€€€€€€€ğ½	ÕÑÑ½¸ø(€€€€€€€€ğ½AÉ½É…µµ•M•ÑÑ¥¹ÍÉ½ÕÀø(€€€€€€¥ô((€€€€€ì¼¨ƒŠRŠR MÑ¥­äÍ…Ù”‰…ÈƒŠRŠR €¨½ô(€€€€€ì¡‘¥ÉÑäñğÍ…Ù¥¹œ¤€˜˜€ (€€€€€€€€ñ‘¥Ø(€€€€€€€€€±…ÍÍ9…µ”ô‰ÍÑ¥­äè´ÈÀ€µµà´ĞÁà´ĞÁĞ´ÌÁˆ´Ì‰œµ‰…­É½Õ¹¼äÈ‰…­‘É½Àµ‰±ÕÈ‰½É‘•ÈµĞ‰½É‘•Èµ‰½É‘•ÈÍ¡…‘½ÜµlÁ|´ÄÁÁá|ÈÑÁá}É‰„ ÄÔ°ÈÌ°ĞÈ°À¸Àà¥tˆ(€€€€€€€€€ÍÑå±”õíì‰½ÑÑ½´è€‰…±Œ¡Ù…È ´µÑ…ˆµ‰…Èµ¡•¥¡Ğ¤€¬Ù…È ´µÍ…™”µ‰½ÑÑ½´¤¤ˆõô(€€€€€€€€ø(€€€€€€€€€€ñA•¹‘¥¹¡…¹•ÍMÕµµ…Éä(€€€€€€€€€€€½Õ¹Ğõí¡…¹•Ì¹±•¹Ñ¡ô(€€€€€€€€€€€±…ÍÍ9…µ”ô‰µˆ´ÈÑ•áĞµ•¹Ñ•Èˆ(€€€€€€€€€€¼ø(€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•Ñ½¹™¥ÉµI•‰Õ¥±¡ÑÉÕ”¥ô(€€€€€€€€€€€‘¥Í…‰±•õì…‘¥ÉÑäñğÍ…Ù¥¹ô(€€€€€€€€€€€±…ÍÍ9…µ”õí¸ (€€€€€€€€€€€€€€‰Üµ™Õ±°Áä´Ì¸ÔÉ½Õ¹‘•´Éá°Ñ•áĞµÍ´™½¹Ğµ‰½±ÑÉ…¹Í¥Ñ¥½¸µ…±°…Ñ¥Ù”éÍ…±”µlÀ¸äátˆ°(€€€€€€€€€€€€€€…‘¥ÉÑäñğÍ…Ù¥¹œ(€€€€€€€€€€€€€€€€ü€‰‰œµµÕÑ•Ñ•áĞµµÕÑ•µ™½É•É½Õ¹½Á…¥Ñä´ØÀˆ(€€€€€€€€€€€€€€€€è€‰‰œµÁÉ¥µ…ÉäÑ•áĞµÁÉ¥µ…Éäµ™½É•É½Õ¹ˆ(€€€€€€€€€€€€¥ô(€€€€€€€€€€ø(€€€€€€€€€€€íÍ…Ù¥¹œ€ü€‰M…Ù¥¹ŸŠ˜ˆ€è€‰M…Ù”¡…¹•Ì‰ô(€€€€€€€€€€ğ½‰ÕÑÑ½¸ø(€€€€€€€€ğ½‘¥Øø(€€€€€€¥ô((€€€€€ì¼¨ƒŠRŠR ½¹™¥Éµ…Ñ¥½¸µ½‘…±ÌƒŠRŠR €¨½ô(€€€€€€ñ¹¥µ…Ñ•AÉ•Í•¹”ø(€€€€€€€ì¡½¹™¥ÉµI•‰Õ¥±ñğ½¹™¥ÉµI•Í•Ğ¤€˜˜€ (€€€€€€€€€€ğø(€€€€€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€Àõô(€€€€€€€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Äõô(€€€€€€€€€€€€€•á¥Ğõíì½Á…¥Ñäè€Àõô(€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøì(€€€€€€€€€€€€€€€Í•Ñ½¹™¥ÉµI•‰Õ¥±¡™…±Í”¤ì(€€€€€€€€€€€€€€€Í•Ñ½¹™¥ÉµI•Í•Ğ¡™…±Í”¤ì(€€€€€€€€€€€€€õô(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™¥á•¥¹Í•Ğ´À‰œµ‰±…¬¼ØÀèµlØÁtˆ(€€€€€€€€€€€€¼ø(€€€€€€€€€€€€ñµ½Ñ¥½¸¹‘¥Ø(€€€€€€€€€€€€€É½±”ô‰…±•ÉÑ‘¥…±½œˆ(€€€€€€€€€€€€€…É¥„µµ½‘…°ô‰ÑÉÕ”ˆ(€€€€€€€€€€€€€¥¹¥Ñ¥…°õíì½Á…¥Ñäè€À°Í…±”è€À¸äØõô(€€€€€€€€€€€€€…¹¥µ…Ñ”õíì½Á…¥Ñäè€Ä°Í…±”è€Äõô(€€€€€€€€€€€€€•á¥Ğõíì½Á…¥Ñäè€À°Í…±”è€À¸äØõô(€€€€€€€€€€€€€ÑÉ…¹Í¥Ñ¥½¸õíì‘ÕÉ…Ñ¥½¸è€À¸ÄÔõô(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™¥á•¥¹Í•Ğµà´ĞÑ½À´Ä¼È€µÑÉ…¹Í±…Ñ”µä´Ä¼ÈèµlØÅt‰œµ…ÉÉ½Õ¹‘•´Éá°À´ĞÍÁ…”µä´Ìµ…àµÜµÍ´µàµ…ÕÑ¼Í¡…‘½Üµá°ˆ(€€€€€€€€€€€€ø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµÍÑ…ÉĞ…À´Ìˆø(€€€€€€€€€€€€€€€€ñ‘¥Ø(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Í¥é”´äÉ½Õ¹‘•µá°™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÍ¡É¥¹¬´Àˆ(€€€€€€€€€€€€€€€€€ÍÑå±”õíì‰…­É½Õ¹‘½±½Èè€‘íQ!5¹…µ‰•ÉôÅ€õô(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€ñ±•ÉÑQÉ¥…¹±”(€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Í¥é”´Ğˆ(€€€€€€€€€€€€€€€€€€€ÍÑå±”õíì½±½ÈèQ!5¹…µ‰•Èõô(€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¸µÜ´Àˆø(€€€€€€€€€€€€€€€€€€ñ Ì±…ÍÍ9…µ”ô‰Ñ•áĞµÍ´™½¹ĞµÍ•µ¥‰½±Ñ•áĞµ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€€€€€€€í½¹™¥ÉµI•Í•Ğ€ü€‰I•Í•ĞÁÉ½É…µµ”üˆ€è€‰M…Ù”¡…¹•Ìü‰ô(€€€€€€€€€€€€€€€€€€ğ½ Ìø(€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµµÕÑ•µ™½É•É½Õ¹µĞ´Ä±•…‘¥¹œµÉ•±…á•ˆø(€€€€€€€€€€€€€€€€€€€í½¹™¥ÉµI•Í•Ğ(€€€€€€€€€€€€€€€€€€€€€€ü€‰]”±°É•‰Õ¥±å½ÕÈÁÉ½É…µµ”™É½´ÍÉ…Ñ İ¥Ñ å½ÕÈÕÉÉ•¹ĞÍ•ÑÑ¥¹Ì¸e½Ô±°ÍÑ…ÉĞ™É•Í …Ğ]••¬€ÄƒŠPÁ…ÍĞİ••¬ÍÕµµ…É¥•Ì±•…È¸e½ÕÈ±½•İ½É­½ÕÑÌ…¹ÉÕ¹ÌÍÑ…ä¥¸!¥ÍÑ½Éä¸ˆ(€€€€€€€€€€€€€€€€€€€€€€èÁÉ½É…µµ•AÉ•Í•ÉÙ…Ñ¥½¹9½Ñ”¡ì(€€€€€€€€€€€€€€€€€€€€€€€€€±¥™Ñ…åÍ¡…¹•°(€€€€€€€€€€€€€€€€€€€€€€€€€İ••­9Õµ‰•ÈèÁÉ½É…µMÑ…Ñ”ü¹İ••­9Õµ‰•È°(€€€€€€€€€€€€€€€€€€€€€€€ô¥ô(€€€€€€€€€€€€€€€€€€ğ½Àø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€ğ½‘¥Øø((€€€€€€€€€€€€€ì¼¨]¡…ĞÌ¡…¹¥¹œƒŠPÉ•…À½˜Ñ¡”Ñ½Õ¡•™¥•±‘Ì€¡É•‰Õ¥±½¹±ä¤¸€¨½ô(€€€€€€€€€€€€€ì…½¹™¥ÉµI•Í•Ğ€˜˜¡…¹•Ì¹±•¹Ñ €ø€À€˜˜€ (€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘•µá°‰œµµÕÑ•¼ØÀÁà´ÌÁä´È¸Ôˆø(€€€€€€€€€€€€€€€€€€ñ	…Í•M•Ñ¥½¹1…‰•°Ñ¥•Èô‰Í•Ñ¥½¸ˆ±…ÍÍ9…µ”ô‰µˆ´Ä¸Ôˆø(€€€€€€€€€€€€€€€€€€€¡…¹•Ì(€€€€€€€€€€€€€€€€€€ğ½	…Í•M•Ñ¥½¹1…‰•°ø(€€€€€€€€€€€€€€€€€€ñÕ°±…ÍÍ9…µ”ô‰ÍÁ…”µä´Äµ…àµ ´ĞĞ½Ù•É™±½Üµäµ…ÕÑ¼ˆø(€€€€€€€€€€€€€€€€€€€í¡…¹•Ì¹µ…À ¡Œ¤€ôø€ (€€€€€€€€€€€€€€€€€€€€€€ñ±¤(€€€€€€€€€€€€€€€€€€€€€€€­•äõíŒ¹±…‰•±ô(€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ‰…Í•±¥¹”©ÕÍÑ¥™äµ‰•Ñİ••¸…À´ÈÑ•áĞµáÌˆ(€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµµÕÑ•µ™½É•É½Õ¹Í¡É¥¹¬´Àˆø(€€€€€€€€€€€€€€€€€€€€€€€€€íŒ¹±…‰•±ô(€€€€€€€€€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰µ¥¸µÜ´ÀÑ•áĞµÉ¥¡Ğ™½¹Ğµµ•‘¥Õ´Ñ•áĞµ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµµÕÑ•µ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€€íŒ¹™É½µô(€€€€€€€€€€€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰µà´ÄÑ•áĞµµÕÑ•µ™½É•É½Õ¹ˆûŠHğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€íŒ¹Ñ½ô(€€€€€€€€€€€€€€€€€€€€€€€€ğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€ğ½±¤ø(€€€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€€€ğ½Õ°ø(€€€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à…À´ÈÁĞ´Äˆø(€€€€€€€€€€€€€€€€ñ	ÕÑÑ½¸(€€€€€€€€€€€€€€€€€Ù…É¥…¹Ğô‰Í•½¹‘…Éäˆ(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•à´Äˆ(€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøì(€€€€€€€€€€€€€€€€€€€Í•Ñ½¹™¥ÉµI•‰Õ¥±¡™…±Í”¤ì(€€€€€€€€€€€€€€€€€€€Í•Ñ½¹™¥ÉµI•Í•Ğ¡™…±Í”¤ì(€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€…¹•°(€€€€€€€€€€€€€€€€ğ½	ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€ñ	ÕÑÑ½¸(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•à´Äˆ(€€€€€€€€€€€€€€€€€½¹±¥¬õí½¹™¥ÉµI•Í•Ğ€ü…ÁÁ±åI•Í•Ğ€è…ÁÁ±åI•‰Õ¥±‘ô(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€í½¹™¥ÉµI•Í•Ğ€ü€‰I•Í•Ğˆ€è€‰M…Ù”‰ô(€€€€€€€€€€€€€€€€ğ½	ÕÑÑ½¸ø(€€€€€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€€€ğ½µ½Ñ¥½¸¹‘¥Øø(€€€€€€€€€€ğ¼ø(€€€€€€€€¥ô(€€€€€€ğ½¹¥µ…Ñ•AÉ•Í•¹”ø(€€€€ğ½‘¥Øø(€€¤ì)ô