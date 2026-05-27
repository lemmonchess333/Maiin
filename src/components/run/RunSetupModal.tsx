import { useState, useEffect } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  Footprints,
  PersonStanding,
  Zap,
  RefreshCw,
  Route,
  Flag,
  Dumbbell,
  Headphones,
} from "lucide-react";
import { THEME } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import {
  getCurrentWeather,
  getWeatherIcon,
  getRunningTip,
  type WeatherData,
} from "@/lib/weather";
import { paceMinSec } from "@/lib/runLabels";
import ShoeSelector from "./ShoeSelector";
import GuidedRunPicker from "./GuidedRunPicker";
import SessionStructureView from "./SessionStructureView";
import type { GuidedRunWorkout } from "@/lib/guidedRun";
import type { ActivityType } from "@/types/run";
import { requiresManualDistance } from "@/lib/runGuards";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { getTargetValidationError } from "@/lib/runTargetValidation";
import {
  freeformPlanMetadata,
  type RunPlanMetadata,
} from "@/lib/runPlanMetadata";

/* `ActivityType` now lives in `@/types/run` so non-component modules
   (e.g. `runGuards.ts`) can import it without pulling this component
   into their dep graph. The re-export below preserves backward
   compatibility for any code that imports `ActivityType` from here. */
export type { ActivityType };

const ICON_MAP: Record<
  string,
  React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>
> = {
  Footprints,
  PersonStanding,
  Zap,
  RefreshCw,
  Route,
  Flag,
  Dumbbell,
  Headphones,
};

export interface RunConfig {
  activityType: ActivityType;
  autoPause: boolean;
  audioCues: boolean;
  audioCueFrequency: "every_km" | "every_500m" | "every_5min" | "off";
  paceAlerts: boolean;
  voiceRate: number;
  displayStats: (
    | "pace"
    | "distance"
    | "time"
    | "calories"
    | "elevation"
    | "avgPace"
  )[];
  /**
   * Activity target. `value`'s unit depends on `type` — single
   * canonical contract used by every layer that touches a target:
   *
   *   - "distance": metres            (e.g. 10000 = 10km)
   *   - "time":     seconds           (e.g. 1800  = 30min)
   *   - "pace":     seconds/kilometre (e.g. 270   = 4:30/km)
   *   - "none":     value omitted
   *
   * Source of truth: the distance + time inputs below already
   * divide value/1000 and value/60 for display, and multiply back
   * on write. Bridge layers (e.g. templateToPrefill in
   * `src/lib/runPlanMetadata.ts`) MUST convert their inputs to
   * metres / seconds / s-per-km BEFORE assigning to target.value.
   *
   * Audio-cue consumers in `src/pages/Run.tsx` read target.value
   * as the unit above with no further conversion.
   */
  target: {
    type: "none" | "distance" | "time" | "pace";
    value?: number;
  };
  intervals?: {
    reps: number;
    workDistance?: number;
    workDuration?: number;
    workPace?: number;
    restDuration: number;
    warmupDuration?: number;
    cooldownDuration?: number;
  };
  guidedWorkout?: GuidedRunWorkout;
  shoeId?: string;
  /**
   * Plan-adherence metadata block, Phase B1.
   * Snapshot of the programme context active at Start; persisted to
   * the run doc so History / adherence surfaces can reason about
   * which runs were on-plan vs off-plan without re-deriving from
   * programState. See `src/lib/runPlanMetadata.ts` for the field
   * semantics and computation rules.
   *
   * Always present (even on freeform runs — they get the freeform
   * default shape) so downstream code never has to branch on
   * "is this field there".
   */
  planMetadata: RunPlanMetadata;
}

const DEFAULT_CONFIG: RunConfig = {
  activityType: "easy",
  autoPause: true,
  audioCues: true,
  audioCueFrequency: "every_km",
  paceAlerts: true,
  voiceRate: 0.9,
  displayStats: ["pace", "distance", "time", "calories"],
  target: { type: "none" },
  // Freeform default — Run.tsx overrides this via savedPreferences
  // when programme prefill applies. See computePlanMetadata.
  planMetadata: freeformPlanMetadata("freeform"),
};

/* Run-type registry. `name` is the long-form label used by the
   selected-run card, the chooser, and the Start CTA ("Start Free
   Run"). Two chip fields:
     `cardChip`    — long form for the selected-run card at the top
                     of the setup ("Outdoor GPS", "Manual distance",
                     "Audio"). The card has horizontal room for the
                     fuller phrasing.
     `chooserChip` — short form for the chooser rows ("GPS",
                     "Manual", "Audio"). The chooser packs more
                     info per row, so the chip stays terse.
   Both disclose the measurement source so users understand why
   pace metrics work for outdoor types but not for treadmill.
   `cardDescription` and `chooserDescription` allow the chooser to
   carry slightly more detail per row (e.g. "Indoor, manual
   distance" in the chooser vs "Indoor" on the card where the chip
   already says "Manual distance").
   `group` drives the chooser's Outdoor / Other section split.
   `'manual'` is deliberately absent — that activityType is set
   programmatically by the GPS-fallback "Track without GPS" path,
   never picked directly by the user. */
type ActivityTypeOption = {
  type: ActivityType;
  label: string;
  name: string;
  icon: string;
  cardDescription: string;
  cardChip: string;
  chooserDescription: string;
  chooserChip: string;
  group: "outdoor" | "other";
};

const ACTIVITY_TYPES: ActivityTypeOption[] = [
  {
    type: "freerun",
    label: "Free",
    name: "Free Run",
    icon: "Footprints",
    cardDescription: "Run at your own pace",
    cardChip: "Outdoor GPS",
    chooserDescription: "Run at your own pace",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "easy",
    label: "Easy",
    name: "Easy Run",
    icon: "PersonStanding",
    cardDescription: "Recovery pace",
    cardChip: "Outdoor GPS",
    chooserDescription: "Recovery pace",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "tempo",
    label: "Tempo",
    name: "Tempo Run",
    icon: "Zap",
    cardDescription: "Sustained effort",
    cardChip: "Outdoor GPS",
    chooserDescription: "Sustained effort",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "intervals",
    label: "Intervals",
    name: "Intervals",
    icon: "RefreshCw",
    cardDescription: "Repeats + rest",
    cardChip: "Outdoor GPS",
    chooserDescription: "Repeats + rest",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "long",
    label: "Long",
    name: "Long Run",
    icon: "Route",
    cardDescription: "Distance-focused",
    cardChip: "Outdoor GPS",
    chooserDescription: "Distance-focused",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "race",
    label: "Race",
    name: "Race",
    icon: "Flag",
    cardDescription: "All-out effort",
    cardChip: "Outdoor GPS",
    chooserDescription: "All-out effort",
    chooserChip: "GPS",
    group: "outdoor",
  },
  {
    type: "treadmill",
    label: "Treadmill",
    name: "Treadmill",
    icon: "Dumbbell",
    cardDescription: "Indoor",
    cardChip: "Manual distance",
    chooserDescription: "Indoor, manual distance",
    chooserChip: "Manual",
    group: "other",
  },
  {
    type: "guided",
    label: "Guided",
    name: "Guided Run",
    icon: "Headphones",
    cardDescription: "Coach-led workout",
    cardChip: "Audio",
    chooserDescription: "Coach-led workout",
    chooserChip: "Audio",
    group: "other",
  },
];

/**
 * Read-only programme context strip data, computed in Run.tsx from
 * useProgram + URL params. Drives the strip rendered above the
 * selected-run card. Null = no strip (freeform user, or programme
 * has no opinion on today).
 *
 * Six visible states:
 *   - race_prep today_plan         → "Race prep · Week N of M · {distance}"
 *   - structured today_plan        → "This week's plan · {todayLabel}"
 *   - race_prep / structured rest_day      → "Rest day in your plan."
 *   - race_prep / structured completed_day → completed-day copy
 *   - race_prep elapsed            → "Race prep ended" + Settings link
 *   - freeform / no plan           → strip not rendered (null)
 */
export interface ProgramContextStrip {
  kind:
    | "race_prep_today"
    | "structured_today"
    | "rest_day"
    | "completed_day"
    | "race_prep_elapsed";
  /** For race_prep today: "Week 3 of 8" */
  weekLabel?: string;
  /** For race_prep today: "10K" / "Half Marathon" etc. */
  distanceLabel?: string;
  /** For race_prep today: ISO target date, rendered as a secondary line. */
  targetDate?: string;
  /** For structured today: "Tempo Run" / "Easy 30" — the day's template name. */
  todayLabel?: string;
}

interface RunSetupModalProps {
  onStart: (config: RunConfig) => void;
  onCancel: () => void;
  savedPreferences?: Partial<RunConfig>;
  /** Read-only context-strip data. Null when no strip should render. */
  programContext?: ProgramContextStrip | null;
}

/**
 * Read-only programme context strip. Same purple tint as the
 * selected-run card icon (rgba(123,114,233,0.10)) so the strip feels
 * like it lives in the same family. No interactive controls — the
 * user reads, the chooser below is where they act.
 */
function ProgramContextStripView({ ctx }: { ctx: ProgramContextStrip }) {
  let line1: string;
  let line2: string | null = null;
  switch (ctx.kind) {
    case "race_prep_today":
      line1 = `Race prep · ${ctx.weekLabel} · ${ctx.distanceLabel}`;
      line2 = ctx.targetDate
        ? `Target ${new Date(ctx.targetDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
        : null;
      break;
    case "structured_today":
      line1 = `This week's plan${ctx.todayLabel ? ` · ${ctx.todayLabel}` : ""}`;
      break;
    case "rest_day":
      line1 = "Rest day in your plan.";
      break;
    case "completed_day":
      line1 =
        "Today’s planned run completed. Starting another run will be recorded as extra.";
      break;
    case "race_prep_elapsed":
      line1 = "Race prep ended";
      line2 = "Update your plan in Settings.";
      break;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl px-3.5 py-2.5"
      style={{ background: "rgba(123,114,233,0.10)" }}
    >
      <p className="text-sm font-semibold text-foreground">{line1}</p>
      {line2 && <p className="text-xs text-muted-foreground mt-0.5">{line2}</p>}
    </div>
  );
}

export default function RunSetupModal({
  onStart,
  onCancel,
  savedPreferences,
  programContext,
}: RunSetupModalProps) {
  const { user } = useAuth();
  const [config, setConfig] = useState<RunConfig>({
    ...DEFAULT_CONFIG,
    ...savedPreferences,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [showCustomise, setShowCustomise] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [selectedGuided, setSelectedGuided] = useState<GuidedRunWorkout | null>(
    null
  );
  /* Last-run snapshot for the empty-state context card. Single
     latest doc, volume-eligibility filtered (so a saved-anyway
     misclick doesn't masquerade as the user's last real run).
     Null while loading or when no eligible run exists; the card
     renders nothing in either case rather than showing
     "Last run: never" — neutral over filler. */
  const [lastRun, setLastRun] = useState<{
    distanceM: number;
    durationS: number;
    activityType: string;
  } | null>(null);
  const updateConfig = (partial: Partial<RunConfig>) =>
    setConfig((prev) => ({ ...prev, ...partial }));
  const intervalConfig = config.intervals ?? {
    reps: 5,
    workDistance: 1000,
    restDuration: 90,
  };

  /* Pre-flight target validation. Catches the case where the user
     types a sub-threshold distance / duration / pace and taps Start
     before the input loses focus (which would have triggered the
     existing onBlur clamp). Disables the Start CTA + surfaces an
     inline error so the user understands why. */
  const targetError = getTargetValidationError(config);

  // Fetch weather on mount
  useEffect(() => {
    getCurrentWeather().then((w) => {
      setWeather(w);
      setWeatherLoading(false);
    });
  }, []);

  /* Fetch the most recent volume-eligible run on mount. Cheap —
     pulls 5 docs (oldest-first scans) and walks them for the
     first eligible one in client memory rather than a Firestore
     compound query that would need an index. Failure is silent;
     the card just doesn't render. */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "users", user.uid, "runs"),
            orderBy("completedAt", "desc"),
            limit(5)
          )
        );
        if (cancelled) return;
        for (const d of snap.docs) {
          const data = d.data() as {
            distance?: number;
            duration?: number;
            activityType?: string;
            isInvalid?: boolean;
            savedAnyway?: boolean;
          };
          if (!isVolumeEligible(data)) continue;
          setLastRun({
            distanceM: data.distance ?? 0,
            durationS: data.duration ?? 0,
            activityType: data.activityType ?? "freerun",
          });
          return;
        }
      } catch {
        // Silent — empty state stays neutral.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Back lives in a non-scrolling header row so it stays visible
          regardless of how far the content scrolls. Previously sat
          inside the scroll container and disappeared when users
          scrolled past it (seen on the empty/short-content layout
          where the sticky CTA pulls upward). */}
      <header className="px-5 pt-4 pb-2">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-muted-foreground active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </header>
      <div
        className="flex-1 overflow-y-auto px-5 pt-2 pb-40 space-y-5 min-h-0"
        style={{ overscrollBehavior: "none" }}
      >
        {/* Page header. Subhead removed — the selected-run card
            below disclosed the run type and a chevron Change
            affordance, making "Pick a type or just go" redundant
            and visually casual. Defensive bump from pb-36 → pb-40
            so the sticky-CTA gradient overlay can't fade into
            content on short viewports. */}
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">
            Ready to run?
          </h2>
        </div>

        {/* Programme context strip — Phase B1. Renders only when the
            user is on a structured/race_prep plan AND today resolves
            to one of the four documented states (today's plan, rest
            day, completed day, elapsed race-prep). Freeform users get
            no strip — the surface stays clean. */}
        {programContext && <ProgramContextStripView ctx={programContext} />}

        {/* Selected-run card. Replaces the underlined "Change type"
            link with a tappable native-feeling control showing the
            chosen run type, its description, and the measurement
            source chip. Tapping opens the chooser drawer below. */}
        {(() => {
          const selected =
            ACTIVITY_TYPES.find((a) => a.type === config.activityType) ??
            ACTIVITY_TYPES[1]; // Easy fallback
          const SelectedIcon = ICON_MAP[selected.icon];
          return (
            <button
              type="button"
              onClick={() => setShowChooser(true)}
              className="w-full p-4 rounded-2xl bg-card border border-border flex items-center gap-3 active:scale-[0.98] transition-transform text-left"
              aria-label={`Selected run type: ${selected.name}. Tap to change.`}
            >
              {/* Run7 Q4 — coral icon container (was purple 10%). The
                  selected-run card sits within a sport-discipline
                  context; brand purple is reserved for lifting. */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${THEME.running}1A` }}
              >
                {SelectedIcon && (
                  <SelectedIcon
                    className="w-5 h-5"
                    style={{ color: THEME.running }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-foreground">
                  {selected.name}
                </p>
                {/* Description and chip sit tight against each
                    other (gap-2, no separator dot) — the chip pill
                    visually separates the metadata on its own, so
                    the explicit "·" was making it feel detached.
                    Description truncates first, chip is shrink-0
                    so it stays whole on narrow viewports. */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground truncate min-w-0">
                    {selected.cardDescription}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                    {selected.cardChip}
                  </span>
                </div>
              </div>
              <ChevronRight
                className="w-4 h-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              />
            </button>
          );
        })()}

        {/* Last-run card — small empty-state context. Renders only
            when an eligible last run exists; nothing otherwise.
            Intentionally narrow surface (label + distance + duration
            + type) so it doesn't compete with the selected-run card
            visually. Read-only — tapping it doesn't navigate
            anywhere from the launcher. */}
        {lastRun &&
          (() => {
            const labelMap: Record<string, string> = {
              freerun: "Free Run",
              easy: "Easy Run",
              tempo: "Tempo",
              intervals: "Intervals",
              long: "Long Run",
              longrun: "Long Run",
              race: "Race",
              treadmill: "Treadmill",
              manual: "Manual Run",
              guided: "Guided",
            };
            const km = (lastRun.distanceM / 1000).toFixed(2);
            const mins = Math.floor(lastRun.durationS / 60);
            const secs = Math.floor(lastRun.durationS % 60);
            const time = `${mins}:${secs.toString().padStart(2, "0")}`;
            const type = labelMap[lastRun.activityType] || "Run";
            return (
              <div className="px-4 py-2.5 rounded-xl bg-muted/40 border border-border/50">
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
                  Last run
                </p>
                <p className="text-sm font-mono tabular-nums text-foreground mt-0.5">
                  {km}km · {time} ·{" "}
                  <span className="font-sans text-muted-foreground">
                    {type}
                  </span>
                </p>
              </div>
            );
          })()}

        {/* Weather strip */}
        {!weatherLoading && weather && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span className="text-2xl">
              {getWeatherIcon(weather.weatherCode)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {weather.temperature}°C
                {weather.feelsLike !== weather.temperature && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (feels {weather.feelsLike}°)
                  </span>
                )}
              </p>
              <motion.p
                key={config.activityType}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="text-xs text-muted-foreground"
              >
                {getRunningTip(weather, config.activityType)}
              </motion.p>
            </div>
          </motion.div>
        )}

        {/* Shoe selector */}
        <ShoeSelector
          selectedShoeId={config.shoeId ?? null}
          onSelect={(id) => updateConfig({ shoeId: id })}
        />

        {/* Interval config — only shown for intervals */}
        <AnimatePresence>
          {config.activityType === "intervals" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden space-y-2"
            >
              <SessionStructureView
                kind="intervals"
                intervals={intervalConfig}
              />
              <button
                type="button"
                onClick={() => setShowCustomise((v) => !v)}
                aria-expanded={showCustomise}
                aria-controls="interval-customise-panel"
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-medium active:scale-[0.98] transition-transform"
              >
                <span>Customise</span>
                {showCustomise ? (
                  <ChevronUp size={16} className="text-muted-foreground" />
                ) : (
                  <ChevronDown size={16} className="text-muted-foreground" />
                )}
              </button>
              <AnimatePresence>
                {showCustomise && (
                  <motion.div
                    id="interval-customise-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 rounded-xl border border-border space-y-3 bg-card">
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          {
                            label: "Repeats",
                            field: "reps" as const,
                            value: intervalConfig.reps,
                            min: 1,
                            max: 20,
                            step: 1,
                          },
                          {
                            label: "Work (m)",
                            field: "workDistance" as const,
                            value: intervalConfig.workDistance ?? 1000,
                            min: 100,
                            max: 5000,
                            step: 100,
                          },
                          {
                            label: "Rest (s)",
                            field: "restDuration" as const,
                            value: intervalConfig.restDuration,
                            min: 10,
                            max: 300,
                            step: 10,
                          },
                        ].map((f) => (
                          <div key={f.field}>
                            <label
                              htmlFor={`interval-${f.field}`}
                              className="text-xs text-muted-foreground"
                            >
                              {f.label}
                            </label>
                            <input
                              id={`interval-${f.field}`}
                              type="number"
                              min={f.min}
                              max={f.max}
                              step={f.step}
                              value={f.value}
                              onChange={(e) =>
                                updateConfig({
                                  intervals: {
                                    ...intervalConfig,
                                    [f.field]: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center"
                            />
                          </div>
                        ))}
                        <div>
                          <label
                            htmlFor="interval-target-pace"
                            className="text-xs text-muted-foreground"
                          >
                            Target pace (/km)
                          </label>
                          <input
                            id="interval-target-pace"
                            type="text"
                            placeholder="4:30"
                            className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center"
                            onChange={(e) => {
                              const [m, s] = e.target.value
                                .split(":")
                                .map(Number);
                              if (Number.isFinite(m) && Number.isFinite(s)) {
                                updateConfig({
                                  intervals: {
                                    ...intervalConfig,
                                    workPace: m * 60 + s,
                                  },
                                });
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Guided run picker — shown for guided type */}
        <AnimatePresence>
          {config.activityType === "guided" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden space-y-2"
            >
              <GuidedRunPicker
                selected={selectedGuided}
                onSelect={(w) => {
                  setSelectedGuided(w);
                  updateConfig({ guidedWorkout: w });
                }}
              />
              {selectedGuided && (
                <SessionStructureView kind="guided" workout={selectedGuided} />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Goal — for non-interval, non-treadmill */}
        {config.activityType !== "intervals" &&
          config.activityType !== "treadmill" && (
            <div>
              {/* Visible-label rename only ("Target (optional)" → "Goal").
                The internal `target.type` config field is unchanged
                (RunConfig, localStorage, Firestore, analytics events
                all keep `target` as the key) so existing data and
                callers stay working. */}
              <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-widest">
                Goal
              </p>
              <div className="flex gap-2">
                {(["none", "distance", "time", "pace"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() =>
                      updateConfig({
                        target: {
                          type: t,
                          value:
                            t === "distance"
                              ? 5000
                              : t === "time"
                                ? 1800
                                : t === "pace"
                                  ? 330
                                  : undefined,
                        },
                      })
                    }
                    className="flex-1 py-2 rounded-xl text-xs font-medium transition-all"
                    style={
                      config.target.type === t
                        ? {
                            background: "rgba(123,114,233,0.12)",
                            color: "#7B72E9",
                            border: "1px solid rgba(123,114,233,0.3)",
                          }
                        : {
                            background: "rgba(0,0,0,0.04)",
                            color: "var(--color-muted-foreground)",
                            border: "1px solid rgba(0,0,0,0.08)",
                          }
                    }
                  >
                    {t === "none"
                      ? "None"
                      : t === "distance"
                        ? "Distance"
                        : t === "time"
                          ? "Time"
                          : "Pace"}
                  </button>
                ))}
              </div>
            </div>
          )}

        {/* Goal value inputs */}
        {config.target.type !== "none" &&
          config.activityType !== "intervals" &&
          config.activityType !== "treadmill" && (
            <div className="p-4 rounded-xl border border-border space-y-3 bg-card">
              {config.target.type === "distance" &&
                (() => {
                  /* Preset chips — selecting a preset populates the
                 same `target.value` field the input writes to;
                 Custom keeps the existing input visible. The
                 active state ("Custom") is computed by checking
                 whether the current value matches any preset.
                 Validation from runTargetValidation.ts still
                 applies — clicking a preset writes a valid value;
                 typing 0.005 in Custom still blocks Start. */
                  const distancePresetsM = [1000, 3000, 5000, 10000];
                  const currentValueM = config.target.value ?? 0;
                  const isCustom = !distancePresetsM.includes(currentValueM);
                  return (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Distance
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {distancePresetsM.map((m) => {
                          const active = currentValueM === m;
                          return (
                            <button
                              key={m}
                              onClick={() =>
                                updateConfig({
                                  target: { type: "distance", value: m },
                                })
                              }
                              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                              style={
                                active
                                  ? {
                                      background: "rgba(123,114,233,0.12)",
                                      color: "#7B72E9",
                                      border: "1px solid rgba(123,114,233,0.3)",
                                    }
                                  : {
                                      background: "rgba(0,0,0,0.04)",
                                      color: "var(--color-muted-foreground)",
                                      border: "1px solid rgba(0,0,0,0.08)",
                                    }
                              }
                            >
                              {m / 1000} km
                            </button>
                          );
                        })}
                        <button
                          onClick={() => {
                            if (!isCustom)
                              updateConfig({
                                target: { type: "distance", value: 7500 },
                              });
                          }}
                          className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                          style={
                            isCustom
                              ? {
                                  background: "rgba(123,114,233,0.12)",
                                  color: "#7B72E9",
                                  border: "1px solid rgba(123,114,233,0.3)",
                                }
                              : {
                                  background: "rgba(0,0,0,0.04)",
                                  color: "var(--color-muted-foreground)",
                                  border: "1px solid rgba(0,0,0,0.08)",
                                }
                          }
                        >
                          Custom
                        </button>
                      </div>
                      {isCustom && (
                        <>
                          <label
                            htmlFor="target-distance"
                            className="text-xs text-muted-foreground"
                          >
                            Distance (km)
                          </label>
                          <input
                            id="target-distance"
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="100"
                            value={
                              config.target.value
                                ? config.target.value / 1000
                                : 5
                            }
                            onChange={(e) =>
                              updateConfig({
                                target: {
                                  type: "distance",
                                  value: Number(e.target.value) * 1000,
                                },
                              })
                            }
                            onBlur={(e) => {
                              const km = Number(e.target.value);
                              const clamped = Number.isFinite(km)
                                ? Math.max(0.5, Math.min(100, km))
                                : 5;
                              if (clamped !== km) {
                                updateConfig({
                                  target: {
                                    type: "distance",
                                    value: clamped * 1000,
                                  },
                                });
                              }
                            }}
                            className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center"
                          />
                        </>
                      )}
                    </div>
                  );
                })()}
              {config.target.type === "time" &&
                (() => {
                  const timePresetsS = [600, 1200, 1800, 2700, 3600];
                  const currentValueS = config.target.value ?? 0;
                  const isCustom = !timePresetsS.includes(currentValueS);
                  return (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Duration
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {timePresetsS.map((s) => {
                          const active = currentValueS === s;
                          return (
                            <button
                              key={s}
                              onClick={() =>
                                updateConfig({
                                  target: { type: "time", value: s },
                                })
                              }
                              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                              style={
                                active
                                  ? {
                                      background: "rgba(123,114,233,0.12)",
                                      color: "#7B72E9",
                                      border: "1px solid rgba(123,114,233,0.3)",
                                    }
                                  : {
                                      background: "rgba(0,0,0,0.04)",
                                      color: "var(--color-muted-foreground)",
                                      border: "1px solid rgba(0,0,0,0.08)",
                                    }
                              }
                            >
                              {s / 60} min
                            </button>
                          );
                        })}
                        <button
                          onClick={() => {
                            if (!isCustom)
                              updateConfig({
                                target: { type: "time", value: 1500 },
                              });
                          }}
                          className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                          style={
                            isCustom
                              ? {
                                  background: "rgba(123,114,233,0.12)",
                                  color: "#7B72E9",
                                  border: "1px solid rgba(123,114,233,0.3)",
                                }
                              : {
                                  background: "rgba(0,0,0,0.04)",
                                  color: "var(--color-muted-foreground)",
                                  border: "1px solid rgba(0,0,0,0.08)",
                                }
                          }
                        >
                          Custom
                        </button>
                      </div>
                      {isCustom && (
                        <>
                          <label
                            htmlFor="target-time"
                            className="text-xs text-muted-foreground"
                          >
                            Duration (minutes)
                          </label>
                          <input
                            id="target-time"
                            type="number"
                            step="5"
                            min="1"
                            max="300"
                            value={
                              config.target.value
                                ? Math.round(config.target.value / 60)
                                : 30
                            }
                            onChange={(e) =>
                              updateConfig({
                                target: {
                                  type: "time",
                                  value: Number(e.target.value) * 60,
                                },
                              })
                            }
                            onBlur={(e) => {
                              const mins = Number(e.target.value);
                              const clamped = Number.isFinite(mins)
                                ? Math.max(1, Math.min(300, mins))
                                : 30;
                              if (clamped !== mins) {
                                updateConfig({
                                  target: { type: "time", value: clamped * 60 },
                                });
                              }
                            }}
                            className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center"
                          />
                        </>
                      )}
                    </div>
                  );
                })()}
              {config.target.type === "pace" &&
                (() => {
                  const pacePresetsS = [300, 330, 360]; // 5:00, 5:30, 6:00 /km
                  const currentValueS = config.target.value ?? 0;
                  const isCustom = !pacePresetsS.includes(currentValueS);
                  return (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Pace</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {pacePresetsS.map((s) => {
                          const active = currentValueS === s;
                          return (
                            <button
                              key={s}
                              onClick={() =>
                                updateConfig({
                                  target: { type: "pace", value: s },
                                })
                              }
                              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                              style={
                                active
                                  ? {
                                      background: "rgba(123,114,233,0.12)",
                                      color: "#7B72E9",
                                      border: "1px solid rgba(123,114,233,0.3)",
                                    }
                                  : {
                                      background: "rgba(0,0,0,0.04)",
                                      color: "var(--color-muted-foreground)",
                                      border: "1px solid rgba(0,0,0,0.08)",
                                    }
                              }
                            >
                              {paceMinSec(s)}/km
                            </button>
                          );
                        })}
                        <button
                          onClick={() => {
                            if (!isCustom)
                              updateConfig({
                                target: { type: "pace", value: 315 },
                              });
                          }}
                          className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                          style={
                            isCustom
                              ? {
                                  background: "rgba(123,114,233,0.12)",
                                  color: "#7B72E9",
                                  border: "1px solid rgba(123,114,233,0.3)",
                                }
                              : {
                                  background: "rgba(0,0,0,0.04)",
                                  color: "var(--color-muted-foreground)",
                                  border: "1px solid rgba(0,0,0,0.08)",
                                }
                          }
                        >
                          Custom
                        </button>
                      </div>
                      {isCustom && (
                        <>
                          <label
                            htmlFor="target-pace"
                            className="text-xs text-muted-foreground"
                          >
                            Pace (/km)
                          </label>
                          <input
                            id="target-pace"
                            type="text"
                            placeholder="5:30"
                            /* `key` forces a remount when the user
                           toggles back to Custom from a preset so
                           defaultValue picks up the freshly-set
                           preset value rather than the stale one
                           from first mount. */
                            key={`pace-${currentValueS}`}
                            defaultValue={paceMinSec(currentValueS || 330)}
                            onChange={(e) => {
                              const [m, s] = e.target.value
                                .split(":")
                                .map(Number);
                              if (Number.isFinite(m) && Number.isFinite(s)) {
                                updateConfig({
                                  target: { type: "pace", value: m * 60 + s },
                                });
                              }
                            }}
                            className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-center"
                          />
                        </>
                      )}
                    </div>
                  );
                })()}
              {/* Inline target validation. Surfaces the
                getTargetValidationError verdict so users see why
                the Start button is disabled before tapping it.
                Coral tint matches the running-flow accent without
                being alarm-red. */}
              {targetError && (
                <p
                  className="text-xs mt-1"
                  style={{ color: "#D4637A" }}
                  role="alert"
                >
                  {targetError}
                </p>
              )}
            </div>
          )}

        {/* Run controls — collapsed by default. Internal state names
            (autoPause / audioCues / paceAlerts) unchanged; only the
            visible header copy + the Audio cues label change to
            "Voice cues" — RunConfig fields, localStorage, analytics
            stay stable. The summary line below the header reflects
            the current toggle state when collapsed so users don't
            have to expand to see the configuration. */}
        {(() => {
          const isManualDistance = requiresManualDistance(config.activityType);
          /* Pace alerts are only relevant when the user has set a
             pace goal — that's the signal the alert reads against.
             Without a pace target the toggle was a visible no-op
             that misleadingly read "Pace alerts on" when there
             were no alerts to fire. Gate both the summary entry
             and the toggle (below) on outdoor + audioCues + pace
             goal. State (config.paceAlerts) is preserved when
             hidden so toggling Goal back to Pace restores the
             user's choice. */
          const paceAlertsRelevant =
            !isManualDistance &&
            config.audioCues &&
            config.target.type === "pace";
          const summaryParts: string[] = [];
          if (!isManualDistance) {
            /* Auto-pause is GPS-derived; surface it only when the
               run will use GPS. */
            summaryParts.push(`Auto-pause ${config.autoPause ? "on" : "off"}`);
          }
          summaryParts.push(`Voice cues ${config.audioCues ? "on" : "off"}`);
          if (paceAlertsRelevant) {
            summaryParts.push(
              `Pace alerts ${config.paceAlerts ? "on" : "off"}`
            );
          }
          const summary = summaryParts.join(" · ");
          return (
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-start justify-between w-full py-2.5 text-left gap-3"
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm text-muted-foreground">
                  Run controls
                </span>
                {!showAdvanced && (
                  /* Bumped from /70 to full muted-foreground —
                     /70 read as disabled rather than informational
                     against the page background. */
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {summary}
                  </p>
                )}
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              )}
            </button>
          );
        })()}

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden space-y-2"
            >
              {/* Auto-pause hides for manual-distance modes —
                  treadmill/manual run on a fixed surface or have no
                  GPS, so the GPS-derived auto-pause logic is a
                  visible no-op. State is preserved (we don't reset
                  config.autoPause) so toggling activityType back
                  restores the user's choice. */}
              {[
                {
                  label: "Auto-pause",
                  key: "autoPause" as const,
                  hidden: requiresManualDistance(config.activityType),
                },
                {
                  label: "Voice cues",
                  key: "audioCues" as const,
                  hidden: false,
                },
              ]
                .filter((s) => !s.hidden)
                .map((setting) => (
                  <div
                    key={setting.key}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-card"
                  >
                    <span className="text-sm">{setting.label}</span>
                    <button
                      onClick={() =>
                        updateConfig({ [setting.key]: !config[setting.key] })
                      }
                      role="switch"
                      aria-checked={config[setting.key]}
                      aria-label={setting.label}
                      className="w-11 h-6 rounded-full transition-colors relative"
                      style={{
                        background: config[setting.key]
                          ? "#7B72E9"
                          : "rgba(0,0,0,0.1)",
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                        style={{
                          transform: config[setting.key]
                            ? "translateX(20px)"
                            : "translateX(2px)",
                        }}
                      />
                    </button>
                  </div>
                ))}
              {config.audioCues && (
                <>
                  {/* Pace alerts hidden when irrelevant. Three
                      conditions must hold: outdoor (the alert is
                      GPS-derived via audioCues.checkPaceAlert in
                      Run.tsx), audioCues on (no voice = no alert),
                      and Goal type === 'pace' (the alert reads
                      against the pace target — without one it has
                      nothing to compare to and previously surfaced
                      as a misleading "Pace alerts on" in the
                      collapsed Run controls summary).
                      State (config.paceAlerts) is preserved when
                      hidden so toggling Goal back to Pace restores
                      the user's choice. */}
                  {!requiresManualDistance(config.activityType) &&
                    config.target.type === "pace" && (
                      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-card">
                        <span className="text-sm">Pace alerts</span>
                        <button
                          onClick={() =>
                            updateConfig({ paceAlerts: !config.paceAlerts })
                          }
                          role="switch"
                          aria-checked={config.paceAlerts}
                          aria-label="Pace alerts"
                          className="w-11 h-6 rounded-full transition-colors relative"
                          style={{
                            background: config.paceAlerts
                              ? "#7B72E9"
                              : "rgba(0,0,0,0.1)",
                          }}
                        >
                          <div
                            className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                            style={{
                              transform: config.paceAlerts
                                ? "translateX(20px)"
                                : "translateX(2px)",
                            }}
                          />
                        </button>
                      </div>
                    )}
                  <div className="p-3.5 rounded-xl border border-border/50 bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">Voice speed</span>
                      <span className="text-xs text-muted-foreground">
                        {config.voiceRate.toFixed(1)}×
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.6"
                      max="1.4"
                      step="0.1"
                      value={config.voiceRate}
                      onChange={(e) =>
                        updateConfig({ voiceRate: Number(e.target.value) })
                      }
                      className="w-full accent-primary"
                    />
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sticky CTA. Underlined "Change type" link removed — the
          selected-run card at the top now owns that affordance.
          Start text is contextual per run type ("Start Free Run",
          "Start Treadmill", "Start Guided Run") so the button
          mirrors the user's selection. */}
      <div
        className="sticky bottom-0 px-5 pt-3 pb-5 safe-area-pb"
        style={{
          background:
            "linear-gradient(to top, var(--color-background) 80%, transparent)",
        }}
      >
        {(() => {
          const selected =
            ACTIVITY_TYPES.find((a) => a.type === config.activityType) ??
            ACTIVITY_TYPES[1];
          const Icon =
            config.activityType === "treadmill" ? Dumbbell : Footprints;
          return (
            <button
              onClick={() => {
                if (!targetError) onStart(config);
              }}
              disabled={!!targetError}
              // Run7 Q4 — Sport-primary CTA. Was an orange→pink gradient
              // with orange-glow shadow which read as "nutrition" given
              // the codebase's semantic palette. Now: flat coral solid
              // (THEME.running) — matches the Programme Run section's
              // Next · Pending Start button + Pgm3 Start CTA discipline.
              // The pulse animation stays via btn-start-run-pulse.
              className="btn-start-run-pulse w-full py-5 rounded-2xl text-white font-semibold text-lg active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed"
              style={{ background: THEME.running }}
            >
              <Icon className="inline w-5 h-5 mr-1" /> Start {selected.name}
            </button>
          );
        })()}
      </div>

      {/* Run-type chooser drawer. Replaces the in-CTA inline picker.
          Grouped Outdoor / Other rows; each shows icon + name +
          description + measurement chip + selected check.
          'manual' is deliberately excluded — that activityType is
          set programmatically by the GPS-fallback "Track without
          GPS" path, never picked by the user. */}
      {/* Sprint 3 follow-up sweep: vaul boilerplate replaced with
          BottomSheet primitive. Title rendered inside children
          because the header uses a bespoke border-b border-border/40
          and pb-3 spacing that the primitive's standard
          border-border/30 header doesn't match. hideHeader keeps the
          drag handle / sr-only Drawer.Title for aria-labelledby. */}
      <BottomSheet
        open={showChooser}
        onOpenChange={setShowChooser}
        title="Choose run type"
        description="Pick how you want to record this run."
        hideHeader
        className="border-t border-border"
      >
        {/* Header is shrink-0 with a faint bottom border so the
                visual transition between fixed header and scrolling
                content is explicit. The pb-3 below the title plus
                the scroll container's pt-3 keeps the first row's
                section header ("Outdoor") clear of the title — the
                pre-fix screenshot showed Free Run clipping under
                the title on small viewports. */}
        <div className="px-5 pt-3 pb-3 shrink-0 border-b border-border/40">
          <div
            className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/20 mb-3"
            aria-hidden="true"
          />
          <h2 className="text-lg font-bold text-foreground">Choose run type</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pt-3 pb-6 space-y-4">
          {(["outdoor", "other"] as const).map((group) => {
            const items = ACTIVITY_TYPES.filter((a) => a.group === group);
            return (
              <div key={group} className="space-y-1">
                <p className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {group === "outdoor" ? "Outdoor" : "Other"}
                </p>
                {items.map((at) => {
                  const IC = ICON_MAP[at.icon];
                  const isActive = config.activityType === at.type;
                  return (
                    <button
                      key={at.type}
                      onClick={() => {
                        updateConfig({ activityType: at.type });
                        setShowChooser(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left motion-safe:transition-colors motion-safe:active:scale-[0.98]"
                      // Run7 Q4 — coral discipline. Selected card uses
                      // coral-tinted bg + coral icon container + coral
                      // checkmark, replacing the legacy purple-tinted
                      // selected state. Brand purple stays reserved for
                      // lifting / Save buttons.
                      style={
                        isActive ? { background: `${THEME.running}1A` } : {}
                      }
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: isActive
                            ? `${THEME.running}2E`
                            : "var(--color-muted)",
                        }}
                      >
                        {IC && (
                          <IC
                            className="w-5 h-5"
                            style={{
                              color: isActive
                                ? THEME.running
                                : "var(--color-muted-foreground)",
                            }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className="text-sm font-bold"
                            style={{
                              color: isActive
                                ? THEME.running
                                : "var(--color-foreground)",
                            }}
                          >
                            {at.name}
                          </p>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                            {at.chooserChip}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {at.chooserDescription}
                        </p>
                      </div>
                      {isActive && (
                        <Check
                          className="w-4 h-4 shrink-0"
                          style={{ color: THEME.running }}
                          aria-label="Selected"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </BottomSheet>
    </div>
  );
}
