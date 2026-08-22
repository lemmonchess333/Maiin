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
 * race goal + runway, run days/week. RUN-EV-02 (owner decision, P0): the
 * save is ONE current-draft computation (`buildPlan`, threading the lift
 * slice unchanged from the saved profile with `preserveHistory: true`, so
 * committing a run change never regenerates the user's lifting) and ONE
 * atomic commit (the `configurePlan` callable's single batch over profile +
 * programState). The previous path made two sequential writes
 * (`setRaceGoalPatch` + `refreshRunSchedule`) and read `runMode`/`raceGoal`
 * from a stale closure — a first freeform→race_prep save early-returned and
 * wrote NO plan while toasting success, and `weeklyRunDaysTarget` could
 * diverge from the actual schedule slots. The full programme editor stays
 * one tap away via the footer link (and Settings).
 *
 * Save model mirrors ProgrammeSettings: fields are a DRAFT; a single Save
 * action commits through buildPlan + configurePlan. Race prep needs an
 * explicit commit (you're picking a date), and the RaceGoalPlanner CTA
 * carries the honest runway label (Save race plan / compressed /
 * mostly-easy). Preview ≡ commit: the planner preview and buildPlan derive
 * the week from the same `generateSchedule(liftDays, weeklyRunDays)`
 * derivation, so what the runway preview shows is what the save writes.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  Footprints,
  Minus,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";
import BaseSectionLabel from "@/components/ui/SectionLabel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import RaceGoalPlanner from "@/components/program/RaceGoalPlanner";
import {
  getRaceGoalPlannerState,
  raceTargetVerdict,
} from "@/lib/raceGoalPlanner";
import { parseRaceTimeToSeconds } from "@/lib/runPaces";
import { resolveDistanceUnit } from "@/lib/distanceUnits";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import { buildPlan } from "@/features/program/planBuilder";
import { getNutritionPhase } from "@/lib/nutritionPhase";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { localDateString } from "@/lib/dateHelpers";
import { spaceDef, type SpaceDef } from "@/features/spaces/spaceDefs";
import {
  upcomingResolvedRaceDefs,
  useRaceEventOverrides,
} from "@/features/spaces/raceEventOverrides";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  RaceDistance,
} from "@/features/program/programTypes";
import {
  runTuningFromProfile,
  type RunVolumePreset,
  type RunDifficultyPreset,
} from "@/features/program/runScheduler";

type RunMode = "freeform" | "race_prep";

const RACE_DISTANCES: RaceDistance[] = ["5k", "10k", "half", "marathon"];

interface RaceDeepLink {
  distance: RaceDistance;
  date: string;
  eventName: string;
  /** Known race-space id, or "" when absent/unknown. */
  spaceId: string;
}

/**
 * Door 1 (races plan Q1): the race space page's "Train for this race"
 * deep-links here with `?distance&date&eventName&spaceId`. Parsed ONCE
 * on mount into the draft — the editor still owns prefill review, the
 * replace-existing-goal decision, and the explicit Save. Invalid or
 * past params are ignored wholesale (no half-seeded drafts); an
 * unknown spaceId degrades to a normal manual goal.
 */
function parseRaceDeepLink(params: URLSearchParams): RaceDeepLink | null {
  const distance = params.get("distance") as RaceDistance | null;
  const date = params.get("date") ?? "";
  if (!distance || !RACE_DISTANCES.includes(distance)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < localDateString())
    return null;
  const spaceIdRaw = params.get("spaceId") ?? "";
  const spaceId = spaceDef(spaceIdRaw)?.kind === "race" ? spaceIdRaw : "";
  return {
    distance,
    date,
    eventName: (params.get("eventName") ?? "").slice(0, 60),
    spaceId,
  };
}

interface RunPlanSettingsProps {
  profile: UserProfile;
  /** Current programme state — threaded so buildPlan can preserve the
   *  lift prescription (`preserveHistory: true`) through a run-only save. */
  programState: ProgramState | null;
  /** Re-hydrate the authoritative profile after the configurePlan batch
   *  (the callable writes via Admin SDK, outside updateProfile's
   *  optimistic local state). */
  refreshProfile: () => Promise<void>;
  /** Deep-link to the full programme editor (goal/nutrition/lift/…). */
  onOpenFullSettings: () => void;
}

/** Seconds → the string the goal-time input round-trips ("24:30",
 *  "3:59:00"). */
function formatRaceTime(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const sec = Math.round(totalS % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
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
  programState,
  refreshProfile,
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
      raceEventName: profile.raceGoal?.eventName ?? "",
      raceTargetTimeS: profile.raceGoal?.targetTimeS ?? 0,
      raceEventSpaceId: profile.raceGoal?.eventSpaceId ?? "",
      // Pgm6 knobs — missing → standard (same lazy default the engine uses).
      runVolume: runTuningFromProfile(profile).volume,
      runDifficulty: runTuningFromProfile(profile).difficulty,
    }),
    [profile]
  );

  // Door 1 deep-link — read once on mount (URLSearchParams identity
  // churns; the draft must not reseed on re-render).
  const [searchParams] = useSearchParams();
  const [deepLink] = useState<RaceDeepLink | null>(() =>
    parseRaceDeepLink(searchParams)
  );

  // ── Draft state ─────────────────────────────────────────────────────
  const [runMode, setRunMode] = useState<RunMode>(
    deepLink ? "race_prep" : saved.runMode
  );
  const [weeklyRunDays, setWeeklyRunDays] = useState<number>(
    saved.weeklyRunDays
  );
  const [raceDistance, setRaceDistance] = useState<RaceDistance>(
    deepLink?.distance ?? saved.raceDistance
  );
  const [raceTargetDate, setRaceTargetDate] = useState<string>(
    deepLink?.date ?? saved.raceTargetDate
  );
  const [raceEventName, setRaceEventName] = useState<string>(
    deepLink?.eventName ?? saved.raceEventName
  );
  // A2: optional goal finish time, drafted as the string the user types
  // ("3:59:00" / "22:30") and parsed on the fly. Empty = no goal time.
  const [raceTimeStr, setRaceTimeStr] = useState<string>(
    saved.raceTargetTimeS ? formatRaceTime(saved.raceTargetTimeS) : ""
  );
  const raceTimeParsed = raceTimeStr.trim()
    ? parseRaceTimeToSeconds(raceTimeStr.trim())
    : null;
  const raceTimeInvalid = raceTimeStr.trim() !== "" && raceTimeParsed === null;
  /** The catalogue binding (Q4). Cleared by any manual distance/date
   *  edit — the goal is then no longer that event. */
  const [raceEventSpaceId, setRaceEventSpaceId] = useState<string>(
    deepLink ? deepLink.spaceId : saved.raceEventSpaceId
  );
  const [runVolume, setRunVolume] = useState<RunVolumePreset>(saved.runVolume);
  const [runDifficulty, setRunDifficulty] = useState<RunDifficultyPreset>(
    saved.runDifficulty
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
        // Pgm6: preview with the same knobs the save will commit.
        tuning: { volume: runVolume, difficulty: runDifficulty },
      }),
    [
      raceDistance,
      raceTargetDate,
      today,
      liftDays,
      weeklyRunDays,
      runVolume,
      runDifficulty,
    ]
  );

  const raceDateInvalid =
    runMode === "race_prep" && (!raceTargetDate || raceTargetDate < today);

  const dirty =
    runMode !== saved.runMode ||
    (runMode === "race_prep" &&
      (raceDistance !== saved.raceDistance ||
        raceTargetDate !== saved.raceTargetDate ||
        raceEventName.trim() !== saved.raceEventName ||
        (raceTimeParsed ?? 0) !== saved.raceTargetTimeS ||
        raceEventSpaceId !== saved.raceEventSpaceId ||
        weeklyRunDays !== saved.weeklyRunDays ||
        runVolume !== saved.runVolume ||
        runDifficulty !== saved.runDifficulty));

  // Door 2 (races plan amendment): the same catalogue the directory
  // reads, soonest first, past dates hidden — on RESOLVED dates
  // (RACE-EVENTS-REMOTE), so picking a race always writes the
  // current edition's date even on a stale binary.
  const raceEventOverrides = useRaceEventOverrides();
  const upcomingRaces = useMemo(
    () => upcomingResolvedRaceDefs(raceEventOverrides, today),
    [raceEventOverrides, today]
  );

  function handleDistanceChange(d: RaceDistance): void {
    setRaceDistance(d);
    setRaceEventSpaceId("");
  }

  function handleTargetDateChange(v: string): void {
    setRaceTargetDate(v);
    setRaceEventSpaceId("");
  }

  function handlePickRace(def: SpaceDef): void {
    if (!def.event) return;
    setRaceDistance(def.event.distance);
    setRaceTargetDate(def.event.dateKey);
    setRaceEventName(def.name);
    setRaceEventSpaceId(def.id);
  }

  // ── Save (RUN-EV-02: one draft computation, one atomic commit) ──────
  async function handleSave(): Promise<void> {
    if (saving || !dirty || raceDateInvalid || raceTimeInvalid) return;
    setSaving(true);
    try {
      // Everything derives from the CURRENT DRAFT in one buildPlan call:
      // effective weekSchedule (the same generateSchedule(liftDays,
      // weeklyRunDays) derivation the planner preview uses), run targets,
      // goal, mode, tuning, runDays and plan — so none of them can
      // disagree. The lift slice threads unchanged from the saved profile
      // with preserveHistory: true (run edits never rebuild lifting).
      const plan = buildPlan({
        primaryGoal: profile.primaryGoal ?? "general",
        nutritionPhase: getNutritionPhase(profile),
        experience: profile.experience ?? "beginner",
        previousExperience: profile.experience ?? "beginner",
        bodyweightKg: profile.weightKg,
        sex: profile.sex,
        liftDays: profile.weeklyWorkoutsTarget ?? 0,
        preferredSplit:
          !profile.preferredSplit || profile.preferredSplit === "auto"
            ? "full_body"
            : profile.preferredSplit,
        runMode,
        weeklyRunDays,
        runTuning: { volume: runVolume, difficulty: runDifficulty },
        ...(runMode === "race_prep"
          ? {
              raceGoal: {
                distance: raceDistance,
                targetDate: raceTargetDate,
                // Optional free-text; blank → key omitted (never undefined).
                ...(raceEventName.trim()
                  ? { eventName: raceEventName.trim() }
                  : {}),
                ...(raceTimeParsed ? { targetTimeS: raceTimeParsed } : {}),
              },
            }
          : {}),
        equipment: profile.equipment ?? "full_gym",
        injuries: profile.injuries ?? [],
        currentDate: localDateString(new Date()),
        existingState: programState ?? undefined,
        preserveHistory: true,
      });

      if (runMode === "race_prep") {
        if (raceEventSpaceId && plan.profileUpdates.raceGoal) {
          // buildPlan's raceGoal input carries no catalogue binding (Q4) —
          // re-attach it so a picker-sourced goal keeps its space link.
          plan.profileUpdates.raceGoal = {
            ...plan.profileUpdates.raceGoal,
            eventSpaceId: raceEventSpaceId,
          };
        }
      } else {
        // buildPlan omits raceGoal on freeform; clear it explicitly — the
        // CF sanitizer preserves a literal null (RUN-EV-02).
        plan.profileUpdates.raceGoal = null;
      }

      // ONE atomic commit: configurePlan batches the profile merge and the
      // programState set together (functions/index.js). The old two-write
      // path could land the goal and lose the plan.
      const configurePlanCallable = httpsCallable(functions, "configurePlan");
      await configurePlanCallable({
        profileUpdates: plan.profileUpdates,
        programState: plan.programState,
        weekSchedule: plan.weekSchedule,
      });
      await refreshProfile();
      toast.success(
        runMode === "race_prep"
          ? "Race plan saved"
          : "Switched to freeform running",
        { id: "run-plan" }
      );
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
          eventName={raceEventName}
          minDate={today}
          state={plannerState}
          onDistanceChange={handleDistanceChange}
          onTargetDateChange={handleTargetDateChange}
          onEventNameChange={setRaceEventName}
          upcomingRaces={upcomingRaces}
          selectedEventSpaceId={raceEventSpaceId}
          onPickRace={handlePickRace}
        />
      )}

      {/* ── A2: goal time (optional) + feasibility verdict ───────────── */}
      {runMode === "race_prep" && (
        <div className="rounded-2xl bg-card border border-border/40 px-3.5 py-3 space-y-2">
          <label
            htmlFor="ps-race-time"
            className="text-sm font-medium text-foreground"
          >
            Goal time (optional)
          </label>
          <input
            id="ps-race-time"
            type="text"
            inputMode="numeric"
            value={raceTimeStr}
            onChange={(e) => setRaceTimeStr(e.target.value)}
            placeholder={
              raceDistance === "marathon" || raceDistance === "half"
                ? "e.g. 3:59:00"
                : "e.g. 24:30"
            }
            className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm font-mono tabular-nums"
          />
          {raceTimeInvalid && (
            <p className="text-xs text-destructive-strong">
              Enter a time like 24:30, or 3:59:00 for longer races.
            </p>
          )}
          {(() => {
            const verdict = raceTargetVerdict({
              distance: raceDistance,
              targetTimeS: raceTimeParsed ?? undefined,
              runFitness: profile.runFitness ?? null,
              /* From the profile PROP rather than the auth hook: this
                 component is handed the authoritative profile it saves
                 against, and reading the unit from anywhere else could
                 disagree with the one being edited. */
              unit: resolveDistanceUnit(profile.preferredDistanceUnit),
            });
            if (!verdict) {
              return raceTimeParsed && !profile.runFitness ? (
                <p className="text-xs text-muted-foreground leading-snug">
                  Set your running fitness in Settings to see how this goal
                  compares with your recent running.
                </p>
              ) : null;
            }
            return (
              <p className="text-xs text-muted-foreground leading-snug">
                {verdict.line}
              </p>
            );
          })()}
        </div>
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

      {/* ── Pgm6 tuning knobs (race prep only — they shape the periodised
          generator; freeform has no scheduled sessions to tune). Moved here
          from ProgrammeSettings' full variant (D14 dedupe): the focused
          run editor is the ONE place run-plan fields are edited. Bounded
          presets; `standard` is byte-identical to the untuned plan. */}
      {runMode === "race_prep" && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Long-run volume
            </p>
            <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
              How big your long runs build — Lighter caps them at 10K.
            </p>
            <SegmentedControl
              options={[
                { value: "lighter", label: "Lighter" },
                { value: "standard", label: "Standard" },
                { value: "bigger", label: "Bigger" },
              ]}
              value={runVolume}
              onChange={(v) => setRunVolume(v as RunVolumePreset)}
              ariaLabel="Long-run volume"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Intensity</p>
            <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
              How much tempo &amp; interval work each week carries. Paces stay
              personalised either way.
            </p>
            <SegmentedControl
              options={[
                { value: "gentler", label: "Gentler" },
                { value: "standard", label: "Standard" },
                { value: "harder", label: "Harder" },
              ]}
              value={runDifficulty}
              onChange={(v) => setRunDifficulty(v as RunDifficultyPreset)}
              ariaLabel="Plan intensity"
            />
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
        className="w-full text-left rounded-2xl bg-card border border-border/40 px-3.5 py-3 min-h-[56px] flex items-center gap-3 hover:bg-muted/40 transition-colors"
      >
        {/* Icon container + trailing chevron, i.e. the row shape every
            other drill-in in Settings uses (`SettingsIndex.tsx`). Without
            them this was the only cross-page navigation row in Settings
            with neither affordance, so the one escape hatch out to
            /settings/training read as a static description card. */}
        <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            Full programme settings
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Goal, nutrition, lifting, equipment, injuries
          </p>
        </div>
        <ChevronRight
          className="size-4 text-muted-foreground shrink-0"
          aria-hidden="true"
        />
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
                : "bg-running-fill text-white"
            )}
          >
            {saveLabel}
          </button>
        </div>
      )}
    </div>
  );
}
