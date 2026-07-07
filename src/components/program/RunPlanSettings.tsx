/**
 * RunPlanSettings — the focused, run-ONLY plan editor (Run-Split, 2026-07).
 *
 * Why this exists: every run-tab entry point ("Edit run plan", the race
 * cockpit "Edit", "Set a race goal", the race banners) used to deep-link to
 * `/settings/training` — the unified ProgrammeSettings editor that rebuilds
 * the WHOLE programme (goal, nutrition, experience, lift days, split,
 * equipment, injuries + running). Editing "the run plan" therefore dropped
 * the user into an onboarding-style edit-everything form. Product-owner call:
 * split running into its own section.
 *
 * This screen edits ONLY the running plan — mode (Freeform / Race prep),
 * race goal + runway, run days/week — and saves through the run-only writer
 * path (`setRaceGoalPatch` + `refreshRunSchedule`), so committing a run
 * change never regenerates the user's lifting. The full programme editor
 * stays one tap away via the footer link (and Settings).
 *
 * Save model mirrors the run slice of ProgrammeSettings/TrainingSection:
 * fields are a DRAFT; a single Save action commits. Race prep needs an
 * explicit commit (you're picking a date), and the RaceGoalPlanner CTA
 * carries the honest runway label (Save race plan / compressed / finish-
 * safely). The writers are copied verbatim from the proven TrainingSection
 * handlers — same setRaceGoalPatch + refreshRunSchedule pattern.
 */
import { useMemo, useState } from "react";
import { Footprints, Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";
import BaseSectionLabel from "@/components/ui/SectionLabel";
import RaceGoalPlanner from "@/components/program/RaceGoalPlanner";
import { getRaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import { setRaceGoalPatch } from "@/features/program/runModeResolution";
import {
  getWeeklyRunTarget,
  runTargetWriteFields,
  type ScheduleDay,
} from "@/lib/scheduleUtils";
import { localDateString } from "@/lib/dateHelpers";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import type { RaceDistance } from "@/features/program/programTypes";

type RunMode = "freeform" | "race_prep";

interface RefreshRunScheduleOverrides {
  weekSchedule?: ScheduleDay[];
  weeklyRunDaysTarget?: number;
}

interface RunPlanSettingsProps {
  profile: UserProfile;
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean; throwOnError?: boolean }
  ) => Promise<UpdateProfileResult>;
  refreshRunSchedule: (
    overrides?: RefreshRunScheduleOverrides
  ) => Promise<void>;
  /** Deep-link to the full programme editor (goal/nutrition/lift/…). */
  onOpenFullSettings: () => void;
}

const MODE_OPTIONS: { id: RunMode; label: string; desc: string }[] = [
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

export default function RunPlanSettings({
  profile,
  updateProfile,
  refreshRunSchedule,
  onOpenFullSettings,
}: RunPlanSettingsProps) {
  // ── Saved baseline (the dirty-check reference) ──────────────────────
  const saved = useMemo(
    () => ({
      runMode: (profile.runMode === "race_prep" ? "race_prep" : "freeform") as
        | "freeform"
        | "race_prep",
      weeklyRunDays: getWeeklyRunTarget(profile) || 3,
      raceDistance: (profile.raceGoal?.distance as RaceDistance) ?? "10k",
      raceTargetDate: profile.raceGoal?.targetDate ?? "",
    }),
    [profile]
  );

  // ── Draft state ─────────────────────────────────────────────────────
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

  const today = localDateString(new Date());
  const liftDays = profile.weeklyWorkoutsTarget ?? 4;

  // Runway preview — same engine the save commits (raceGoalPlanner.ts).
  const plannerState = useMemo(
    () =>
      getRaceGoalPlannerState({
        distance: raceDistance,
        targetDate: raceTargetDate,
        currentDate: today,
        liftDays,
        weeklyRunDays,
      }),
    [raceDistance, raceTargetDate, today, liftDays, weeklyRunDays]
  );

  const raceDateInvalid =
    runMode === "race_prep" && (!raceTargetDate || raceTargetDate < today);

  const dirty =
    runMode !== saved.runMode ||
    (runMode === "race_prep" &&
      (raceDistance !== saved.raceDistance ||
        raceTargetDate !== saved.raceTargetDate ||
        weeklyRunDays !== saved.weeklyRunDays));

  // ── Save (run-only — never rebuilds lifting) ────────────────────────
  async function handleSave(): Promise<void> {
    if (saving || !dirty || raceDateInvalid) return;
    setSaving(true);
    try {
      if (runMode === "race_prep") {
        // Materialize raceGoal → runMode in one patch, and persist the run
        // target so getWeeklyRunTarget agrees with the schedule we refresh.
        await updateProfile(
          {
            ...(setRaceGoalPatch({
              distance: raceDistance,
              targetDate: raceTargetDate,
            }) as Partial<UserProfile>),
            ...runTargetWriteFields(weeklyRunDays),
          },
          { throwOnError: true }
        );
        try {
          await refreshRunSchedule({
            weekSchedule: profile.weekSchedule,
            weeklyRunDaysTarget: weeklyRunDays,
          });
        } catch (e) {
          logger.warn("[RunPlanSettings] race refresh failed once, retry", e);
          await refreshRunSchedule({
            weekSchedule: profile.weekSchedule,
            weeklyRunDaysTarget: weeklyRunDays,
          });
        }
        toast.success("Race plan saved", { id: "run-plan" });
      } else {
        // Freeform: clear the goal + flip runMode. refreshRunSchedule
        // early-returns for freeform, so the updateProfile is the whole save.
        await updateProfile(setRaceGoalPatch(null) as Partial<UserProfile>, {
          throwOnError: true,
        });
        toast.success("Switched to freeform running", { id: "run-plan" });
      }
    } catch (e) {
      logger.error("[RunPlanSettings] save failed", e);
      toast.error("Couldn't save your run plan. Please try again.", {
        id: "run-plan",
      });
    } finally {
      setSaving(false);
    }
  }

  const saveLabel = saving
    ? "Saving…"
    : raceDateInvalid
      ? "Fix race date"
      : runMode === "race_prep" && plannerState.ctaLabel
        ? plannerState.ctaLabel
        : "Save run plan";

  return (
    <div className="space-y-5 pb-6">
      {/* ── Mode ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <BaseSectionLabel tier="section">Run mode</BaseSectionLabel>
        <div
          role="radiogroup"
          aria-label="Run mode"
          className="grid grid-cols-2 gap-2"
        >
          {MODE_OPTIONS.map((opt) => {
            const selected = runMode === opt.id;
            return (
              <motion.button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  haptic();
                  setRunMode(opt.id);
                }}
                className={cn(
                  "min-h-[68px] rounded-2xl border px-3.5 py-3 text-left bg-card shadow-sm transition-all",
                  selected ? "border-transparent" : "border-border/70"
                )}
                style={
                  selected
                    ? {
                        background: `${THEME.running}14`,
                        borderColor: `${THEME.running}45`,
                      }
                    : undefined
                }
              >
                <span className="flex items-center gap-2">
                  <Footprints
                    className="size-4 shrink-0 text-running"
                    aria-hidden="true"
                  />
                  <span className="text-body font-bold leading-tight text-foreground">
                    {opt.label}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                  {opt.desc}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Race goal + runway (race prep only) ──────────────────────── */}
      {runMode === "race_prep" && (
        <RaceGoalPlanner
          distance={raceDistance}
          targetDate={raceTargetDate}
          minDate={today}
          state={plannerState}
          onDistanceChange={setRaceDistance}
          onTargetDateChange={setRaceTargetDate}
        />
      )}

      {/* ── Run days / week (race prep only — freeform has no schedule) ── */}
      {runMode === "race_prep" && (
        <div className="flex items-center justify-between rounded-2xl bg-card border border-border/40 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Run days / week
            </p>
            {liftDays + weeklyRunDays > 7 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{liftDays}</span> lift
                +{" "}
                <span className="font-mono tabular-nums">{weeklyRunDays}</span>{" "}
                run — some days combine both.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label="Decrease run days"
              onClick={() => {
                haptic();
                setWeeklyRunDays((n) => Math.max(1, n - 1));
              }}
              disabled={weeklyRunDays <= 1}
              className="size-11 rounded-lg bg-muted text-foreground inline-flex items-center justify-center motion-safe:active:scale-95 disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <span className="font-mono tabular-nums text-sm font-semibold min-w-[1.5rem] text-center">
              {weeklyRunDays}
            </span>
            <button
              type="button"
              aria-label="Increase run days"
              onClick={() => {
                haptic();
                setWeeklyRunDays((n) => Math.min(7, n + 1));
              }}
              disabled={weeklyRunDays >= 7}
              className="size-11 rounded-lg bg-muted text-foreground inline-flex items-center justify-center motion-safe:active:scale-95 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Full programme settings escape hatch ─────────────────────── */}
      <button
        type="button"
        onClick={() => {
          haptic();
          onOpenFullSettings();
        }}
        className="w-full text-left rounded-2xl bg-card border border-border/40 px-3.5 py-3 hover:bg-muted/40 transition-colors"
      >
        <p className="text-sm font-medium text-foreground">
          Full programme settings
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Goal, nutrition, lifting, equipment, injuries
        </p>
      </button>

      {/* ── Sticky save bar (only when there's a run-plan change) ─────── */}
      {(dirty || saving) && (
        <div
          className="sticky z-20 -mx-4 px-4 pt-3 pb-3 bg-background/92 backdrop-blur border-t border-border"
          style={{ bottom: "calc(var(--tab-bar-height) + var(--safe-bottom))" }}
        >
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || raceDateInvalid || saving}
            className={cn(
              "w-full py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98]",
              !dirty || raceDateInvalid || saving
                ? "bg-muted text-muted-foreground opacity-60"
                : "bg-running text-white"
            )}
          >
            {saveLabel}
          </button>
        </div>
      )}
    </div>
  );
}
