/**
 * P0-9: Configure Plan wizard — full-screen draft-state modal.
 *
 * Onboarding creates the plan; this is how existing users *edit*
 * the plan. Six steps:
 *   1. Training focus  (primaryGoal)
 *   2. Nutrition phase (Goal: cut / lean bulk / recomp)
 *   3. Lifting         (liftDays + preferredSplit)
 *   4. Running         (runMode + weeklyRunDays + raceGoal)
 *   5. Weekly preview  (visualised week from generateSchedule)
 *   6. Confirm         (summary + final commit)
 *
 * Draft state semantics — NO Firestore writes until Confirm. Cancel
 * = zero changes. On Confirm we run planBuilder(draft) locally and
 * hand the output to the `configurePlan` CF (P0-4), which validates
 * shape + atomic-writes profile + programState.
 *
 * Inputs deliberately scoped:
 *   - `equipment` + `injuries` are NOT editable here. Those are
 *     "stable identity" fields that rarely change between plan
 *     rebuilds — surfacing them on every reconfigure would be
 *     noise. They flow through from the current profile so the
 *     planBuilder call still gets a complete input.
 *   - `experience` similarly stable; threaded through from profile.
 *
 * Preserves history on the rebuild (`preserveHistory: true`) so
 * the user's current week number, weekHistory, fatigueScore stay
 * intact — only the lift workouts + run plan regenerate.
 */

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Footprints,
  Dumbbell,
  Flag,
  Target,
  Sparkles,
  Apple,
} from "lucide-react";
import { toast } from "sonner";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import OptionCard from "@/components/onboarding/OptionCard";
import { logger } from "@/lib/logger";
import { buildPlan } from "@/features/program/planBuilder";
import {
  generateSchedule,
  getWeeklyRunTarget,
  SCHEDULE_TYPE_META,
  type ScheduleDay,
} from "@/lib/scheduleUtils";
import { localDateString } from "@/lib/dateHelpers";
import type {
  PrimaryGoal,
  Goal,
  ProgramState,
  SplitType,
} from "@/features/program/programTypes";
import type { UserProfile } from "@/lib/auth";

type RunMode = "freeform" | "structured" | "race_prep";
type RaceDistance = "5k" | "10k" | "half" | "marathon";

interface ConfigurePlanModalProps {
  open: boolean;
  onClose: () => void;
  profile: UserProfile;
  programState: ProgramState | null;
  /** Called after a successful CF write so the parent can refresh
   *  any cached state. Optional — programState refreshes via the
   *  AuthProvider/useProgram pipeline anyway. */
  onSaved?: () => void;
  /** PR-0d: which step to land on when the modal opens. Defaults
   *  to 0 (Training focus — the full wizard from the top). The
   *  run-mode chips + race-goal CTA in ProgrammeRunSection pass
   *  CONFIGURE_PLAN_RUNNING_STEP so the user lands directly in
   *  the run-config view. The modal also resets to this step
   *  after a successful save, so re-opens from the same surface
   *  stay in context. */
  initialStep?: number;
}

/** Index of the Running step in STEP_META. Exported so callers
 *  don't hardcode 3 when deep-linking. */
export const CONFIGURE_PLAN_RUNNING_STEP = 3;

const STEP_META: { title: string; subtitle: string; icon: typeof Target }[] = [
  {
    title: "Training focus",
    subtitle: "What are you optimising for?",
    icon: Target,
  },
  {
    title: "Nutrition phase",
    subtitle: "Cutting, bulking, or staying put?",
    icon: Apple,
  },
  {
    title: "Lifting",
    subtitle: "Days per week and split style",
    icon: Dumbbell,
  },
  {
    title: "Running",
    subtitle: "How runs slot into your week",
    icon: Footprints,
  },
  {
    title: "Your week at a glance",
    subtitle: "Here's how we'll lay it out",
    icon: Sparkles,
  },
  { title: "Confirm", subtitle: "Review and rebuild your plan", icon: Flag },
];

const TOTAL_STEPS = STEP_META.length;

export default function ConfigurePlanModal({
  open,
  onClose,
  profile,
  programState,
  onSaved,
  initialStep = 0,
}: ConfigurePlanModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>(open);
  const [step, setStep] = useState(initialStep);
  const [saving, setSaving] = useState(false);

  // Draft state — initialised from current profile/program. Mutations
  // stay local until Confirm calls planBuilder + configurePlan.
  // PR-0d: the hydration useEffect below re-reads these from
  // `profile` every time the modal opens — the initialisers here
  // only fire on first mount, and the modal returns null (does
  // not unmount) when !open, so without re-hydration the draft
  // would be stale on every subsequent open.
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>(
    (profile.primaryGoal as PrimaryGoal) ?? "hypertrophy"
  );
  const [nutritionPhase, setNutritionPhase] = useState<Goal>(
    (profile.program?.goal as Goal) ?? "recomp"
  );
  const [liftDays, setLiftDays] = useState<number>(
    profile.weeklyWorkoutsTarget ?? 4
  );
  const [preferredSplit, setPreferredSplit] = useState<SplitType | "auto">(
    (profile.preferredSplit as SplitType | "auto") ?? "auto"
  );
  const [runMode, setRunMode] = useState<RunMode>(
    profile.runMode ?? "freeform"
  );
  // PR-0c canonical reader — falls back to 2 only when totally unset
  // (the slider on this step has min=1 and renders only when
  // runMode is non-freeform, so 2 is the sensible default for a
  // user who has just affirmatively picked structured/race_prep).
  const [weeklyRunDays, setWeeklyRunDays] = useState<number>(
    getWeeklyRunTarget(profile) || 2
  );
  const [raceDistance, setRaceDistance] = useState<RaceDistance>(
    (profile.raceGoal?.distance as RaceDistance) ?? "10k"
  );
  const [raceTargetDate, setRaceTargetDate] = useState<string>(
    profile.raceGoal?.targetDate ?? ""
  );

  // PR-0d: hydrate draft state on every open transition. The modal
  // returns null when !open but does not unmount, so the useState
  // initialisers above only fire on the very first mount. Without
  // this effect, edits to `profile` between opens (Onboarding redo,
  // a sibling Cloud Function write, etc.) would be invisible —
  // the user would see a stale draft and could overwrite live
  // values via Confirm.
  //
  // Deps are intentionally `[open, initialStep]` only. Re-hydrating
  // on every `profile` change while open would clobber the user's
  // in-progress edits.
  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setSaving(false);
    setPrimaryGoal((profile.primaryGoal as PrimaryGoal) ?? "hypertrophy");
    setNutritionPhase((profile.program?.goal as Goal) ?? "recomp");
    setLiftDays(profile.weeklyWorkoutsTarget ?? 4);
    setPreferredSplit((profile.preferredSplit as SplitType | "auto") ?? "auto");
    setRunMode(profile.runMode ?? "freeform");
    setWeeklyRunDays(getWeeklyRunTarget(profile) || 2);
    setRaceDistance((profile.raceGoal?.distance as RaceDistance) ?? "10k");
    setRaceTargetDate(profile.raceGoal?.targetDate ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [open, initialStep]);

  const effectiveRunDays = useMemo(() => {
    if (runMode === "freeform") return 0;
    return weeklyRunDays;
  }, [runMode, weeklyRunDays]);

  // Preview — pure derivation, no side effects. Same generator as
  // Onboarding's preview step so the layout pattern is consistent.
  const previewWeekSchedule = useMemo<ScheduleDay[]>(
    () => generateSchedule(liftDays, effectiveRunDays),
    [liftDays, effectiveRunDays]
  );

  // Per-step advance gate.
  const canAdvance: boolean[] = [
    true, // step 0 — primaryGoal has a default
    true, // step 1 — nutritionPhase has a default
    liftDays >= 1 && liftDays <= 7, // step 2 — must pick a sensible count
    runMode !== "race_prep" || raceTargetDate !== "", // step 3 — race needs date
    true, // step 4 — preview is purely informational
    true, // step 5 — confirm
  ];

  function reset(toStep: number = initialStep) {
    // PR-0d: reset to `initialStep` rather than always 0 so a save
    // initiated from the Running deep-link returns to Running on
    // the next open (matches user mental model). The hydration
    // effect above also re-reads `step = initialStep` on every
    // open transition, so this `reset` call is really about the
    // close path within a single open session.
    setStep(toStep);
    setSaving(false);
  }

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    try {
      // Build the plan locally. Pure — no side effects. The output
      // shape is what configurePlan validates and writes.
      const plan = buildPlan({
        primaryGoal,
        nutritionPhase,
        experience:
          (profile.experience as "beginner" | "intermediate" | "advanced") ??
          "intermediate",
        liftDays,
        preferredSplit:
          preferredSplit === "auto" ? "full_body" : preferredSplit,
        runMode,
        weeklyRunDays: effectiveRunDays,
        ...(runMode === "race_prep" && raceTargetDate
          ? { raceGoal: { distance: raceDistance, targetDate: raceTargetDate } }
          : {}),
        equipment:
          (profile.equipment as "full_gym" | "home_gym" | "minimal") ??
          "full_gym",
        injuries: profile.injuries ?? [],
        currentDate: localDateString(new Date()),
        existingState: programState ?? undefined,
        preserveHistory: true,
      });

      // Send to the CF. profileUpdates is a partial patch; the CF
      // merges onto users/{uid} and replaces programState/current
      // atomically (P0-4).
      const configurePlanCallable = httpsCallable(functions, "configurePlan");
      await configurePlanCallable({
        profileUpdates: plan.profileUpdates,
        programState: plan.programState,
        weekSchedule: plan.weekSchedule,
      });

      toast.success("Plan rebuilt!");
      onSaved?.();
      reset();
      onClose();
    } catch (err) {
      logger.error("[ConfigurePlanModal] save failed:", err);
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

  if (!open) return null;

  const StepIcon = STEP_META[step].icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col bg-background"
        role="dialog"
        aria-modal="true"
        aria-label="Configure plan"
        ref={modalRef}
      >
        {/* Top bar — close + step indicator */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border safe-area-pt">
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={saving}
            className="p-2 -ml-2 rounded-lg active:scale-95 transition-transform"
            aria-label="Close"
          >
            <X className="size-5 text-muted-foreground" />
          </button>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Step {step + 1} of {TOTAL_STEPS}
          </span>
          <div className="w-9" />
        </header>

        {/* Progress bar */}
        <div className="flex gap-1 px-4 pt-3">
          {STEP_META.map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: "hsl(var(--muted) / 0.5)" }}
            >
              <motion.div
                className="h-full"
                initial={{ width: "0%" }}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.3 }}
                style={{ background: THEME.brand }}
              />
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 max-w-md mx-auto"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <StepIcon className="size-5" style={{ color: THEME.brand }} />
                  <h1 className="text-xl font-bold">{STEP_META[step].title}</h1>
                </div>
                <p className="text-sm text-muted-foreground">
                  {STEP_META[step].subtitle}
                </p>
              </div>

              {/* Step 0 — Training focus */}
              {step === 0 && (
                <div className="space-y-2">
                  {(
                    [
                      {
                        id: "hypertrophy",
                        label: "Build muscle",
                        desc: "Higher reps, more volume",
                      },
                      {
                        id: "strength",
                        label: "Get stronger",
                        desc: "Lower reps, heavier compounds",
                      },
                      {
                        id: "fat_loss",
                        label: "Lose fat",
                        desc: "Higher density, more conditioning",
                      },
                      {
                        id: "general",
                        label: "Stay fit",
                        desc: "Balanced general training",
                      },
                      {
                        id: "running",
                        label: "Running support",
                        desc: "Lifting that complements your runs",
                      },
                    ] as { id: PrimaryGoal; label: string; desc: string }[]
                  ).map((opt, i) => (
                    <OptionCard
                      key={opt.id}
                      selected={primaryGoal === opt.id}
                      onSelect={() => setPrimaryGoal(opt.id)}
                      index={i}
                      icon={<Target size={20} style={{ color: THEME.brand }} />}
                      label={opt.label}
                      desc={opt.desc}
                    />
                  ))}
                </div>
              )}

              {/* Step 1 — Nutrition phase */}
              {step === 1 && (
                <div className="space-y-2">
                  {(
                    [
                      {
                        id: "cut",
                        label: "Cutting",
                        desc: "Calorie deficit — lose fat while preserving muscle",
                      },
                      {
                        id: "lean bulk",
                        label: "Lean bulk",
                        desc: "Small surplus — build muscle slowly",
                      },
                      {
                        id: "recomp",
                        label: "Recomp",
                        desc: "Maintenance — recompose body at current weight",
                      },
                    ] as { id: Goal; label: string; desc: string }[]
                  ).map((opt, i) => (
                    <OptionCard
                      key={opt.id}
                      selected={nutritionPhase === opt.id}
                      onSelect={() => setNutritionPhase(opt.id)}
                      index={i}
                      icon={<Apple size={20} style={{ color: THEME.brand }} />}
                      label={opt.label}
                      desc={opt.desc}
                    />
                  ))}
                </div>
              )}

              {/* Step 2 — Lifting (days + split) */}
              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-2 text-muted-foreground">
                      Lift days per week
                    </p>
                    <div className="flex gap-2">
                      {[2, 3, 4, 5, 6].map((d) => (
                        <button
                          key={d}
                          onClick={() => setLiftDays(d)}
                          className={cn(
                            "flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95",
                            liftDays === d
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-2 text-muted-foreground">
                      Preferred split
                    </p>
                    <div className="space-y-2">
                      {(
                        [
                          {
                            id: "auto",
                            label: "Auto",
                            desc: "Let us pick the best split for your day count",
                          },
                          {
                            id: "full_body",
                            label: "Full body",
                            desc: "Every session hits everything",
                          },
                          {
                            id: "upper_lower",
                            label: "Upper / lower",
                            desc: "Split by region (≥4 days)",
                          },
                          {
                            id: "ppl",
                            label: "Push / pull / legs",
                            desc: "Classic 3-way split (≥5 days)",
                          },
                        ] as {
                          id: SplitType | "auto";
                          label: string;
                          desc: string;
                        }[]
                      ).map((opt, i) => (
                        <OptionCard
                          key={opt.id}
                          selected={preferredSplit === opt.id}
                          onSelect={() => setPreferredSplit(opt.id)}
                          index={i}
                          icon={
                            <Dumbbell
                              size={20}
                              style={{ color: THEME.lifting }}
                            />
                          }
                          label={opt.label}
                          desc={opt.desc}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3 — Running */}
              {step === 3 && (
                <div className="space-y-5">
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
                        label: "Race prep",
                        desc: "Periodised plan for a specific race",
                      },
                    ].map((opt, i) => (
                      <OptionCard
                        key={opt.id}
                        selected={runMode === opt.id}
                        onSelect={() => setRunMode(opt.id)}
                        index={i}
                        icon={
                          <Footprints
                            size={20}
                            style={{ color: THEME.running }}
                          />
                        }
                        label={opt.label}
                        desc={opt.desc}
                      />
                    ))}
                  </div>

                  {runMode !== "freeform" && (
                    <div>
                      <label
                        htmlFor="configure-run-days"
                        className="text-xs uppercase tracking-wider text-muted-foreground"
                      >
                        Run days per week ({weeklyRunDays})
                      </label>
                      <input
                        id="configure-run-days"
                        type="range"
                        min={1}
                        max={7}
                        value={weeklyRunDays}
                        onChange={(e) =>
                          setWeeklyRunDays(Number(e.target.value))
                        }
                        className="w-full mt-1 accent-primary"
                      />
                      {liftDays + weeklyRunDays > 7 && (
                        <p
                          className="text-xs mt-1"
                          style={{ color: "hsl(var(--muted-foreground))" }}
                        >
                          {liftDays} lift + {weeklyRunDays} run ={" "}
                          {liftDays + weeklyRunDays}. You'll see{" "}
                          {Math.min(
                            liftDays + weeklyRunDays - 7,
                            Math.min(liftDays, weeklyRunDays)
                          )}{" "}
                          double day
                          {Math.min(
                            liftDays + weeklyRunDays - 7,
                            Math.min(liftDays, weeklyRunDays)
                          ) === 1
                            ? ""
                            : "s"}
                          .
                        </p>
                      )}
                    </div>
                  )}

                  {runMode === "race_prep" && (
                    <div className="space-y-3 p-3 rounded-xl bg-card border border-border/50">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                          Distance
                        </p>
                        <div className="flex gap-1.5">
                          {(
                            ["5k", "10k", "half", "marathon"] as RaceDistance[]
                          ).map((d) => (
                            <button
                              key={d}
                              onClick={() => setRaceDistance(d)}
                              className={cn(
                                "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                                raceDistance === d
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              )}
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
                        <label
                          htmlFor="configure-race-date"
                          className="text-xs uppercase tracking-wider text-muted-foreground"
                        >
                          Target date
                        </label>
                        <input
                          id="configure-race-date"
                          type="date"
                          value={raceTargetDate}
                          onChange={(e) => setRaceTargetDate(e.target.value)}
                          className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4 — Weekly preview */}
              {step === 4 && (
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
                            style={{
                              color: "hsl(var(--muted-foreground) / 0.7)",
                            }}
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

              {/* Step 5 — Confirm */}
              {step === 5 && (
                <div
                  className="rounded-2xl p-5 space-y-0"
                  style={{
                    background: `${THEME.teal}08`,
                    border: `1px solid ${THEME.teal}25`,
                  }}
                >
                  {[
                    {
                      label: "Focus",
                      value: primaryGoal.replace("_", " "),
                      color: THEME.brand,
                    },
                    {
                      label: "Nutrition",
                      value: nutritionPhase,
                      color: THEME.warning,
                    },
                    {
                      label: "Lifting",
                      value: `${liftDays} days/week · ${preferredSplit === "auto" ? "Auto-split" : preferredSplit.replace("_", " ")}`,
                      color: THEME.lifting,
                    },
                    {
                      label: "Running",
                      value:
                        runMode === "freeform"
                          ? "Freeform"
                          : runMode === "race_prep"
                            ? `Race prep · ${raceDistance.toUpperCase()} on ${raceTargetDate || "—"}`
                            : `Structured · ${weeklyRunDays} run days`,
                      color: THEME.running,
                    },
                  ].map((row, i, arr) => (
                    <motion.div
                      key={row.label}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08, duration: 0.3 }}
                      className="flex items-start gap-3 py-3"
                      style={{
                        borderBottom:
                          i < arr.length - 1
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
                          style={{
                            color: "hsl(var(--muted-foreground) / 0.7)",
                          }}
                        >
                          {row.label}
                        </p>
                        <p className="text-sm font-semibold mt-0.5 capitalize">
                          {row.value}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom nav */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-border safe-area-pb">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={saving}
              className="px-4 py-3 rounded-xl text-sm font-medium active:scale-95"
              style={{
                background: "hsl(var(--muted))",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
          <button
            onClick={() => {
              if (step < TOTAL_STEPS - 1) {
                setStep((s) => s + 1);
              } else {
                handleConfirm();
              }
            }}
            disabled={!canAdvance[step] || saving}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95",
              (!canAdvance[step] || saving) && "opacity-40"
            )}
            style={{ background: THEME.teal, color: "#000" }}
          >
            {step === TOTAL_STEPS - 1 ? (
              saving ? (
                "Rebuilding…"
              ) : (
                <>
                  Rebuild plan <ChevronRight className="size-4" />
                </>
              )
            ) : (
              <>
                Continue <ChevronRight className="size-4" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
