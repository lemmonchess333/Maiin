/**
 * Pgm4 — Unified Programme Settings editor.
 *
 * The single, FREE, scrollable destination for editing an existing
 * programme. Replaces three overlapping surfaces:
 *   - the onboarding-RETAKE (the "50%-cut-off onboarding"),
 *   - the 6-step Pro-gated ConfigurePlanModal wizard, and
 *   - the lighter ProgramSettingsPanel bottom-sheet.
 *
 * Reference-app audit (Pgm4 lock): Fitbod / Hevy / MacroFactor / Garmin /
 * Nike Run Club / Strava all edit goals/plan/equipment via grouped SETTINGS
 * fields with the plan re-deriving — none re-run onboarding, none use a
 * separate wizard, none gate basic plan-editing behind a paywall. This
 * screen matches that pattern.
 *
 * Save model:
 *   - The two engine toggles (auto-progression, microloading) live-save via
 *     `updateSettings` — no rebuild.
 *   - Every plan-shaping field (focus, nutrition phase, experience, lift
 *     days, split, equipment, injuries, run mode/days, race goal) is a DRAFT.
 *     A single "Save changes" action runs `buildPlan` then the `configurePlan`
 *     CF with `preserveHistory: true` (week number / weekHistory / fatigue
 *     survive — only the lift workouts + run plan regenerate), gated behind a
 *     single confirmation. This is the ConfigurePlanModal save path, now with
 *     equipment + injuries sourced from the form instead of threaded
 *     read-only — the capability gap the retake was poorly serving.
 *   - "Reset programme" calls the destructive `regenerateProgram` (Week 1 +
 *     cleared weekHistory), behind its own confirmation.
 *
 * NOT here (Pgm4 lock): identity edits (name/gender/age/body metrics/units)
 * stay in Settings → Profile / Units. The day-by-day weekly layout stays in
 * ScheduleLayoutSheet — this screen links to it.
 */
import { useMemo, useState } from "react";
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
  LayoutGrid,
  Check,
  AlertTriangle,
  BicepsFlexed,
  Flame,
  Heart,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { Toggle } from "@/components/ui/Toggle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { logger } from "@/lib/logger";
import { buildPlan } from "@/features/program/planBuilder";
import { computeProgrammeChanges } from "@/lib/programmeChanges";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import { localDateString } from "@/lib/dateHelpers";
import type {
  PrimaryGoal,
  Goal,
  ProgramState,
  ProgramSettings,
  SplitType,
} from "@/features/program/programTypes";
import type { UserProfile } from "@/lib/auth";

type RunMode = "freeform" | "structured" | "race_prep";
type RaceDistance = "5k" | "10k" | "half" | "marathon";
type Experience = "beginner" | "intermediate" | "advanced";
type Equipment = "full_gym" | "home_gym" | "minimal";
type SplitChoice = SplitType | "auto";

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
  /** Opens the day-by-day weekly-layout editor (ScheduleLayoutSheet). */
  onOpenWeeklyLayout: () => void;
  /** Optional hook so the host can refresh after a save. */
  onSaved?: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </p>
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
        <span className="block text-[15px] font-bold leading-tight">
          {label}
        </span>
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
// purple lifting accent — every option here is a lifting goal (primaryGoal
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
    desc: "Calorie deficit — lose fat, keep muscle",
  },
  {
    id: "lean bulk",
    label: "Lean bulk",
    desc: "Small surplus — build muscle slowly",
  },
  {
    id: "recomp",
    label: "Recomp",
    desc: "Maintenance — recompose at current weight",
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
    desc: "0 – 6 months of consistent training",
    icon: <Target size={20} style={{ color: THEME.success }} />,
  },
  {
    id: "intermediate",
    label: "Intermediate",
    desc: "6 months – 2 years of training",
    icon: <Award size={20} style={{ color: THEME.brand }} />,
  },
  {
    id: "advanced",
    label: "Advanced",
    desc: "2+ years of structured training",
    icon: <Sparkles size={20} style={{ color: THEME.warning }} />,
  },
];

// Engine-valid splits only. The profile's PreferredSplit type also allows
// "bro_split", but the programme engine's SplitType (what buildPlan consumes)
// does not — so, like the old ConfigurePlanModal, this offers Auto + the three
// supported splits. A legacy "bro_split" profile value is normalised to "auto"
// below.
const VALID_SPLIT_CHOICES = [
  "auto",
  "full_body",
  "upper_lower",
  "ppl",
] as const;

const SPLIT_OPTIONS: {
  id: SplitChoice;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "auto",
    label: "No preference",
    desc: "We'll pick the best split for you",
    icon: <Sparkles size={20} style={{ color: THEME.brand }} />,
  },
  {
    id: "full_body",
    label: "Full Body",
    desc: "Hit everything each session",
    icon: <User size={20} style={{ color: THEME.success }} />,
  },
  {
    id: "upper_lower",
    label: "Upper / Lower",
    desc: "Alternate upper and lower days (4+ days)",
    icon: <LayoutGrid size={20} style={{ color: THEME.brand }} />,
  },
  {
    id: "ppl",
    label: "Push / Pull / Legs",
    desc: "Classic PPL rotation (5-6 days)",
    icon: <Dumbbell size={20} style={{ color: THEME.lifting }} />,
  },
];

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
    icon: <Warehouse size={20} style={{ color: THEME.lifting }} />,
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
    desc: "All clear — no limitations",
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

// Run9 (3a): `structured` retired as a user-selectable mode — running is
// freeform by default; a race goal is the only "plan". The type keeps it for
// legacy data + migration.
const RUN_MODE_OPTIONS: { id: RunMode; label: string; desc: string }[] = [
  {
    id: "freeform",
    label: "Freeform",
    desc: "Run whenever you want, no auto-scheduling",
  },
  {
    id: "race_prep",
    label: "Race prep",
    desc: "Periodised plan for a specific race",
  },
];

export default function ProgrammeSettings({
  profile,
  programState,
  updateSettings,
  regenerateProgram,
  onOpenWeeklyLayout,
  onSaved,
}: ProgrammeSettingsProps) {
  // ── Persisted values (also the dirty-check baseline) ──────────────
  const saved = useMemo(
    () => ({
      primaryGoal: (profile.primaryGoal as PrimaryGoal) ?? "hypertrophy",
      nutritionPhase: (profile.program?.goal as Goal) ?? "recomp",
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
    }),
    [profile]
  );

  // ── Draft state ───────────────────────────────────────────────────
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>(
    saved.primaryGoal
  );
  const [nutritionPhase, setNutritionPhase] = useState<Goal>(
    saved.nutritionPhase
  );
  const [experience, setExperience] = useState<Experience>(saved.experience);
  const [liftDays, setLiftDays] = useState<number>(saved.liftDays);
  const [preferredSplit, setPreferredSplit] = useState<SplitChoice>(
    saved.preferredSplit
  );
  const [equipment, setEquipment] = useState<Equipment>(saved.equipment);
  const [injuries, setInjuries] = useState<string[]>(saved.injuries);
  const [runMode, setRunMode] = useState<RunMode>(saved.runMode);
  const [weeklyRunDays, setWeeklyRunDays] = useState<number>(
    saved.weeklyRunDays
  );
  const [raceDistance, setRaceDistance] = useState<RaceDistance>(
    saved.raceDistance
  );
  const [raceTargetDate, setRaceTargetDate] = useState<string>(
    saved.raceTargetDate
  );

  const [saving, setSaving] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const settings = programState?.settings ?? {
    autoProgression: true,
    microloading: true,
  };

  // Split-availability mirrors onboarding: PPL/bro need ≥5 days, U/L ≥4.
  function isSplitDisabled(split: SplitChoice): boolean {
    if (split === "ppl" && liftDays < 5) return true;
    if (split === "upper_lower" && liftDays < 4) return true;
    return false;
  }

  // The per-field diff is the single source of truth: the recap shown in the
  // confirm modal and the dirty state both derive from it, so they can't drift.
  const changes = computeProgrammeChanges(saved, {
    primaryGoal,
    nutritionPhase,
    experience,
    liftDays,
    preferredSplit,
    equipment,
    injuries,
    runMode,
    weeklyRunDays,
    raceDistance,
    raceTargetDate,
  });
  const dirty = changes.length > 0;

  // A race-prep plan needs a target date that isn't in the past.
  const raceDateInvalid =
    runMode === "race_prep" &&
    (!raceTargetDate || raceTargetDate < localDateString(new Date()));

  const effectiveRunDays = runMode === "freeform" ? 0 : weeklyRunDays;

  function toggleInjury(id: string) {
    if (id === "none") {
      setInjuries((prev) => (prev.includes("none") ? [] : ["none"]));
      return;
    }
    setInjuries((prev) => {
      const withoutNone = prev.filter((i) => i !== "none");
      return prev.includes(id)
        ? withoutNone.filter((i) => i !== id)
        : [...withoutNone, id];
    });
  }

  async function applyRebuild() {
    if (saving) return;
    setConfirmRebuild(false);
    setSaving(true);
    try {
      const plan = buildPlan({
        primaryGoal,
        nutritionPhase,
        experience,
        liftDays,
        preferredSplit:
          preferredSplit === "auto" ? "full_body" : preferredSplit,
        runMode,
        weeklyRunDays: effectiveRunDays,
        ...(runMode === "race_prep" && raceTargetDate
          ? { raceGoal: { distance: raceDistance, targetDate: raceTargetDate } }
          : {}),
        equipment,
        injuries,
        currentDate: localDateString(new Date()),
        existingState: programState ?? undefined,
        preserveHistory: true,
      });

      const configurePlanCallable = httpsCallable(functions, "configurePlan");
      await configurePlanCallable({
        profileUpdates: plan.profileUpdates,
        programState: plan.programState,
        weekSchedule: plan.weekSchedule,
      });

      toast.success("Plan updated");
      onSaved?.();
    } catch (err) {
      logger.error("[ProgrammeSettings] save failed:", err);
      const code = (err as { code?: string })?.code;
      if (code === "functions/unauthenticated" || code === "unauthenticated") {
        toast.error("Please sign in again to update your plan.");
      } else if (
        code === "functions/invalid-argument" ||
        code === "invalid-argument"
      ) {
        toast.error("Plan didn't validate — try a different combination.");
      } else {
        toast.error("Couldn't save your plan. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function applyReset() {
    setConfirmReset(false);
    await regenerateProgram();
    toast.success("Programme reset");
  }

  return (
    <div className="space-y-5 pb-6">
      {/* ── Goal & Nutrition ── */}
      <div>
        <SectionLabel>Training focus</SectionLabel>
        <div className="space-y-2">
          {FOCUS_OPTIONS.map((opt, i) => (
            <SettingsOptionCard
              key={opt.id}
              selected={primaryGoal === opt.id}
              onSelect={() => setPrimaryGoal(opt.id)}
              index={i}
              icon={opt.icon}
              accent={THEME.brand}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Nutrition phase</SectionLabel>
        <div className="space-y-2">
          {NUTRITION_OPTIONS.map((opt, i) => (
            <SettingsOptionCard
              key={opt.id}
              selected={nutritionPhase === opt.id}
              onSelect={() => setNutritionPhase(opt.id)}
              index={i}
              icon={<Apple size={18} style={{ color: THEME.warning }} />}
              accent={THEME.warning}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Experience</SectionLabel>
        <div className="space-y-2">
          {EXPERIENCE_OPTIONS.map((opt, i) => (
            <SettingsOptionCard
              key={opt.id}
              selected={experience === opt.id}
              onSelect={() => setExperience(opt.id)}
              index={i}
              icon={opt.icon}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </div>
      </div>

      {/* ── Lifting ── */}
      <div>
        <SectionLabel>Lift days per week</SectionLabel>
        <SegmentedControl
          ariaLabel="Lift days per week"
          options={[2, 3, 4, 5, 6].map((d) => ({ value: d, label: String(d) }))}
          value={liftDays}
          onChange={setLiftDays}
        />
      </div>

      <div>
        <SectionLabel>Preferred split</SectionLabel>
        <div className="space-y-2">
          {SPLIT_OPTIONS.map((opt, i) => (
            <SettingsOptionCard
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
      </div>

      {/* ── Running ── */}
      <div>
        <SectionLabel>Running</SectionLabel>
        <div className="space-y-2">
          {RUN_MODE_OPTIONS.map((opt, i) => (
            <SettingsOptionCard
              key={opt.id}
              selected={runMode === opt.id}
              onSelect={() => setRunMode(opt.id)}
              index={i}
              icon={<Footprints size={18} style={{ color: THEME.running }} />}
              accent={THEME.running}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </div>

        {runMode !== "freeform" && (
          <div className="mt-3">
            <label
              htmlFor="ps-run-days"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Run days per week ({weeklyRunDays})
            </label>
            <input
              id="ps-run-days"
              type="range"
              min={1}
              max={7}
              value={weeklyRunDays}
              onChange={(e) => setWeeklyRunDays(Number(e.target.value))}
              className="w-full mt-1"
              style={{ accentColor: THEME.running }}
            />
            {liftDays + weeklyRunDays > 7 && (
              <p className="text-xs mt-1 text-muted-foreground">
                {liftDays} lift + {weeklyRunDays} run ={" "}
                {liftDays + weeklyRunDays}. You'll see double days.
              </p>
            )}
          </div>
        )}

        {runMode === "race_prep" && (
          <div className="mt-3 space-y-3 p-3 rounded-xl bg-card border border-border/50">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Distance
              </p>
              <SegmentedControl
                ariaLabel="Race distance"
                tone="running"
                options={(
                  ["5k", "10k", "half", "marathon"] as RaceDistance[]
                ).map((d) => ({
                  value: d,
                  label:
                    d === "half"
                      ? "Half"
                      : d === "marathon"
                        ? "Full"
                        : d.toUpperCase(),
                }))}
                value={raceDistance}
                onChange={setRaceDistance}
              />
            </div>
            <div>
              <label
                htmlFor="ps-race-date"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Target date
              </label>
              <input
                id="ps-race-date"
                type="date"
                value={raceTargetDate}
                onChange={(e) => setRaceTargetDate(e.target.value)}
                min={localDateString(new Date())}
                className="w-full mt-1 px-3 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm [color-scheme:light_dark]"
              />
              {raceDateInvalid && (
                <p className="text-xs mt-1 text-destructive" role="alert">
                  Pick a race date in the future.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Equipment & Injuries ── */}
      <div>
        <SectionLabel>Equipment access</SectionLabel>
        <div className="space-y-2">
          {EQUIPMENT_OPTIONS.map((opt, i) => (
            <SettingsOptionCard
              key={opt.id}
              selected={equipment === opt.id}
              onSelect={() => setEquipment(opt.id)}
              index={i}
              icon={opt.icon}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Injuries</SectionLabel>
        <div className="space-y-2">
          {INJURY_OPTIONS.map((opt, i) => (
            <SettingsOptionCard
              key={opt.id}
              selected={injuries.includes(opt.id)}
              onSelect={() => toggleInjury(opt.id)}
              index={i}
              icon={opt.icon}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </div>
      </div>

      {/* ── Weekly layout link (ScheduleLayoutSheet owns the day grid) ── */}
      <div className="px-3 py-2.5 rounded-xl bg-muted">
        <p className="text-sm font-medium text-foreground">Weekly layout</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Arrange which days are lift, run, or rest.
        </p>
        <button
          type="button"
          onClick={onOpenWeeklyLayout}
          className="mt-2 -mb-0.5 min-h-[44px] -ml-1 px-1 inline-flex items-center gap-1 text-xs font-semibold text-primary active:scale-[0.97] transition-transform"
        >
          Edit weekly layout &rarr;
        </button>
      </div>

      {/* ── Advanced toggles (live-save, no rebuild) ── */}
      <div className="space-y-3">
        <SectionLabel>Advanced</SectionLabel>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Auto Progression</p>
            <p className="text-xs text-muted-foreground">
              Bumps next session's weight when you complete every set cleanly
            </p>
          </div>
          <Toggle
            checked={settings.autoProgression}
            label="Auto progression"
            className="ml-3"
            onChange={() =>
              updateSettings({ autoProgression: !settings.autoProgression })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Microloading</p>
            <p className="text-xs text-muted-foreground">
              Use ½ kg jumps on smaller lifts so progression keeps moving past
              stalls
            </p>
          </div>
          <Toggle
            checked={settings.microloading}
            label="Microloading"
            className="ml-3"
            onChange={() =>
              updateSettings({ microloading: !settings.microloading })
            }
          />
        </div>
      </div>

      {/* ── Reset (destructive) ── */}
      <button
        type="button"
        onClick={() => setConfirmReset(true)}
        className="w-full py-2.5 rounded-xl bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors"
      >
        Reset Programme
      </button>

      {/* ── Sticky save bar ── */}
      {(dirty || raceDateInvalid || saving) && (
        <div
          className="sticky z-20 -mx-4 px-4 pt-3 pb-3 bg-background/92 backdrop-blur border-t border-border shadow-[0_-10px_24px_rgba(15,23,42,0.08)]"
          style={{ bottom: "calc(var(--tab-bar-height) + var(--safe-bottom))" }}
        >
          <button
            type="button"
            onClick={() => setConfirmRebuild(true)}
            disabled={!dirty || raceDateInvalid || saving}
            className={cn(
              "w-full py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98]",
              !dirty || raceDateInvalid || saving
                ? "bg-muted text-muted-foreground opacity-60"
                : "bg-primary text-primary-foreground"
            )}
          >
            {saving
              ? "Saving…"
              : raceDateInvalid
                ? "Fix race date"
                : "Save changes"}
          </button>
        </div>
      )}

      {/* ── Confirmation modals ── */}
      <AnimatePresence>
        {(confirmRebuild || confirmReset) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setConfirmRebuild(false);
                setConfirmReset(false);
              }}
              className="fixed inset-0 bg-black/60 z-[60]"
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[61] bg-card rounded-2xl p-4 space-y-3 max-w-sm mx-auto shadow-xl"
            >
              <div className="flex items-start gap-3">
                <div
                  className="size-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${THEME.amber}1F` }}
                >
                  <AlertTriangle
                    className="size-4"
                    style={{ color: THEME.amber }}
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">
                    {confirmReset ? "Reset programme?" : "Save changes?"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {confirmReset
                      ? "We'll rebuild your programme from scratch with your current settings. You'll start fresh at Week 1 — past week summaries clear. Your logged workouts and runs stay in History."
                      : "We'll regenerate your upcoming workouts and run plan with these settings. Your current week and past summaries are kept, and your logged workouts and runs stay in History."}
                  </p>
                </div>
              </div>

              {/* What's changing — recap of the touched fields (rebuild only). */}
              {!confirmReset && changes.length > 0 && (
                <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Changes
                  </p>
                  <ul className="space-y-1 max-h-44 overflow-y-auto">
                    {changes.map((c) => (
                      <li
                        key={c.label}
                        className="flex items-baseline justify-between gap-2 text-xs"
                      >
                        <span className="text-muted-foreground shrink-0">
                          {c.label}
                        </span>
                        <span className="min-w-0 text-right font-medium text-foreground">
                          <span className="text-muted-foreground">
                            {c.from}
                          </span>
                          <span className="mx-1 text-muted-foreground">→</span>
                          {c.to}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRebuild(false);
                    setConfirmReset(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReset ? applyReset : applyRebuild}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                >
                  {confirmReset ? "Reset" : "Save"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
