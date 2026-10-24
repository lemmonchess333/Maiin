import { useState, useEffect, useMemo, type ReactNode } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import SectionHeading from "@/components/ui/SectionHeading";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import RangeInput from "@/components/ui/RangeInput";
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
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Toggle } from "@/components/ui/Toggle";
import { fetchSavedRuns } from "@/lib/savedRuns";
import { useAuth } from "@/lib/auth";
import { prescriptivePaceTableFromFitness } from "@/lib/runPaces";
import {
  getCurrentWeather,
  getWeatherIcon,
  getRunningTip,
  WEATHER_CREDIT,
  type WeatherData,
} from "@/lib/weather";
import { paceMinSec, distanceValue, runTitle } from "@/lib/runLabels";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import {
  paceUnitLabel,
  distanceUnitLabel,
  distancePresetsM,
  distanceToMetres,
  distanceIn,
  DISTANCE_TARGET_MIN_M,
  DISTANCE_TARGET_MAX_M,
} from "@/lib/distanceUnits";
import { parseLocalDate } from "@/lib/dateHelpers";
import { heatLine } from "@/lib/heatAdjustment";
import ShoeSelector from "./ShoeSelector";
import GuidedRunPicker from "./GuidedRunPicker";
import SessionStructureView from "./SessionStructureView";
import { segmentsFromGuided, segmentsFromIntervals } from "@/lib/runSegments";
import type { GuidedRunWorkout } from "@/lib/guidedRun";
import type { ActivityType, RunPlace } from "@/types/run";
import { isTreadmillRun, requiresManualDistance } from "@/lib/runGuards";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { getTargetValidationError } from "@/lib/runTargetValidation";
import { formatDayMonthYear, formatClock } from "@/utils/formatters";

/* Preset chip (duration / pace / distance quick-pick groups). Tokenised —
   the old inline rgba(0,0,0,…) styles were light-theme-only values that
   rendered near-invisible on the DEFAULT dark theme, and py-1.5 sat well
   under the 44px touch floor. Coral tint = running identity, per the
   closed palette. */
function presetChipClass(selected: boolean): string {
  return cn(
    "min-h-11 px-4 rounded-full text-xs font-medium border transition active:scale-[0.97]",
    selected
      ? "bg-running/12 text-running-strong border-running/30"
      : "bg-muted text-muted-foreground border-border/50"
  );
}
import {
  DEFAULT_CONFIG,
  ACTIVITY_TYPES,
  pacePatchForType as pacePatchForTypePure,
  chooserPaceFor as chooserPaceForPure,
  type RunConfig,
} from "./runConfigDefaults";

/* `ActivityType` now lives in `@/types/run` so non-component modules
   (e.g. `runGuards.ts`) can import it without pulling this component
   into their dep graph. The re-export below preserves backward
   compatibility for any code that imports `ActivityType` from here. */
export type { ActivityType };

/* RunConfig moved to ./runConfigDefaults (run fast-launch arc) so the launch
   card + tile picker share it. Re-exported here for the existing importers
   (Run.tsx, RunSummary.tsx, runResumeStorage.ts). */
export type { RunConfig };

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
  Headphones,
};

// getWeatherIcon() returns an icon-NAME ("cloud-drizzle"), not display text.
// Map it to the matching lucide component so the weather strip shows an icon
// instead of printing the raw id (the "cloud-drizzle" heading bug).
const WEATHER_ICON: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  "cloud-fog": CloudFog,
  "cloud-drizzle": CloudDrizzle,
  "cloud-rain": CloudRain,
  "cloud-snow": CloudSnow,
  "cloud-lightning": CloudLightning,
};

/* RunConfig, DEFAULT_CONFIG, ActivityTypeOption and ACTIVITY_TYPES moved to
   ./runConfigDefaults (run fast-launch arc) so RunLaunchCard + RunTilePicker
   share one config-from-type source of truth. Imported at the top. */

import type { ProgramContextStrip } from "@/lib/runContextStrip";
// Re-exported so the run surface keeps one import site for the strip shape.
export type { ProgramContextStrip };

interface RunSetupModalProps {
  onStart: (config: RunConfig) => void;
  onCancel: () => void;
  savedPreferences?: Partial<RunConfig>;
  /** Read-only context-strip data. Null when no strip should render. */
  programContext?: ProgramContextStrip | null;
  /** The route actions: plan one, follow one, or the route being
   *  followed. They sit under the title and scroll with the page, so the
   *  screen opens on its own Back and heading. */
  routeSection?: ReactNode;
  /** The planned session's name, as its launch card and Home give it
   *  ("Easy 30"), when the setup opened on a planned run. */
  sessionName?: string;
}

/**
 * Read-only programme context strip. Same coral tint as the
 * selected-run card icon (rgba(212,99,122,0.10)) so the strip feels
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
        ? `Target ${formatDayMonthYear(parseLocalDate(ctx.targetDate))}`
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
      style={{ background: `${THEME.running}1A` }}
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
  routeSection,
  sessionName,
}: RunSetupModalProps) {
  const { user, profile } = useAuth();
  const unit = useDistanceUnit();
  const motionSafe = useMotionSafe();
  // Adaptive Paces: the user's pace table (null when no benchmark). Used to
  // personalize the prescription when picking a run type in the ad-hoc
  // launcher (the programme path personalizes via templateToPrefill).
  const paceTable = useMemo(
    () => prescriptivePaceTableFromFitness(profile?.runFitness ?? null),
    [profile?.runFitness]
  );
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
    place?: RunPlace;
  } | null>(null);
  const updateConfig = (partial: Partial<RunConfig>) =>
    setConfig((prev) => ({ ...prev, ...partial }));
  /* Pgm8: the treadmill is where the run is done, set by its own switch
     below the run type. It never touches `activityType`, so a planned run
     done on the treadmill is still the planned run. */
  const onTreadmill = isTreadmillRun(config);
  const intervalConfig = config.intervals ?? {
    reps: 5,
    workDistance: 1000,
    restDuration: 90,
  };

  /* Adaptive Paces — thin wrappers over the pure helpers in
     ./runConfigDefaults so the modal, launch card, and tile picker all derive
     config-from-type identically. `pacePatchForType` seeds intervals from the
     current config (falling back to the default) exactly as before. */
  const pacePatchForType = (type: ActivityType): Partial<RunConfig> =>
    pacePatchForTypePure(type, paceTable, config.intervals ?? intervalConfig);

  const chooserPaceFor = (type: ActivityType): string | null =>
    chooserPaceForPure(type, paceTable, unit);

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
        const runs = await fetchSavedRuns(user.uid, { latest: 5 });
        if (cancelled) return;
        for (const run of runs) {
          if (!isVolumeEligible(run)) continue;
          setLastRun({
            distanceM: run.distance,
            durationS: run.duration,
            activityType: run.activityType,
            place: run.place,
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
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 min-h-[44px] pr-3 -my-1.5 text-sm text-muted-foreground active:scale-[0.97] transition-transform"
        >
          <ArrowLeft className="size-4" />
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

        {routeSection}

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
              <div className="size-11 rounded-xl flex items-center justify-center shrink-0 bg-running/10">
                {SelectedIcon && (
                  <SelectedIcon className="size-5 text-running" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-foreground">
                  {selected.name}
                </p>
                {/* Description and mode are facts, so one metadata line
                    (" · "-joined) rather than a chip — the description
                    truncates first and the mode stays whole on narrow
                    viewports. On the treadmill the mode is the treadmill,
                    whatever the type (Pgm8). */}
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <span className="truncate min-w-0">
                    {selected.cardDescription}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">
                    {onTreadmill ? "Treadmill" : selected.cardChip}
                  </span>
                </div>
              </div>
              <ChevronRight
                className="size-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              />
            </button>
          );
        })()}

        {/* Where the run is done (Pgm8). The treadmill is a place, not a
            run type: the type above stays the session (a planned run's
            own), and this switch says it is run on a treadmill, with no
            GPS and the distance typed in at the end (TreadmillMode). */}
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-border/50 bg-card">
          <div className="min-w-0">
            <p className="text-sm text-foreground">On a treadmill</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No GPS. Enter the distance from the treadmill at the end.
            </p>
          </div>
          <Toggle
            checked={onTreadmill}
            label="On a treadmill"
            onChange={() =>
              updateConfig({ place: onTreadmill ? undefined : "treadmill" })
            }
          />
        </div>

        {/* Last-run card — small empty-state context. Renders only
            when an eligible last run exists; nothing otherwise.
            Intentionally narrow surface (label + distance + duration
            + type) so it doesn't compete with the selected-run card
            visually. Read-only — tapping it doesn't navigate
            anywhere from the launcher. */}
        {lastRun &&
          (() => {
            const labelMap: Record<string, string> = {
              freerun: "Free run",
              easy: "Easy run",
              tempo: "Tempo",
              intervals: "Intervals",
              long: "Long run",
              longrun: "Long run",
              race: "Race",
              manual: "Manual run",
              guided: "Guided",
            };
            const km = distanceValue(lastRun.distanceM, unit, 2);
            const time = formatClock(Math.floor(lastRun.durationS));
            // A treadmill run says so, old or new (Pgm8): "Treadmill",
            // or its type with the treadmill, "Easy run · Treadmill".
            const type = isTreadmillRun(lastRun)
              ? runTitle(lastRun)
              : labelMap[lastRun.activityType] || "Run";
            return (
              <div className="px-4 py-2.5 rounded-xl bg-muted/40 border border-border/50">
                <SectionLabel>Last run</SectionLabel>
                <p className="text-sm font-mono tabular-nums text-foreground mt-0.5">
                  {km}
                  {distanceUnitLabel(unit)} · {time} ·{" "}
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
            initial={motionSafe({ opacity: 0, y: -4 })}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {(() => {
              const WIcon =
                WEATHER_ICON[getWeatherIcon(weather.weatherCode)] ?? Cloud;
              return (
                <WIcon className="size-6 shrink-0 text-muted-foreground" />
              );
            })()}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {weather.temperature}°C
                {weather.feelsLike !== weather.temperature && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (feels {weather.feelsLike}°)
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-1.5">
                  · {weather.description}
                </span>
              </p>
              {(() => {
                // Null when conditions warrant no advice — the card then
                // shows its headline and (if it fires) the heat line, with
                // no filler line restating the temperature between them.
                const tip = getRunningTip(weather, config.activityType);
                if (!tip) return null;
                return (
                  <motion.p
                    key={config.activityType}
                    initial={motionSafe({ opacity: 0 })}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs text-muted-foreground"
                  >
                    {tip}
                  </motion.p>
                );
              })()}
              {/* Pgm8 (E8): on a hot day, one line to run by feel, with no
                  number in it; nothing below hot. It never touches the
                  plan's paces, and the tip above leaves heat to it. */}
              {(() => {
                const line = heatLine(weather);
                if (!line) return null;
                return (
                  <p className="text-xs text-muted-foreground mt-0.5">{line}</p>
                );
              })()}
              {/* MET Norway's licence (CC BY 4.0) asks for this wherever
                  its weather is shown. */}
              <p className="text-xs text-muted-foreground mt-0.5">
                {WEATHER_CREDIT}
              </p>
            </div>
          </motion.div>
        )}

        {/* Shoe selector */}
        <ShoeSelector
          selectedShoeId={config.shoeId ?? null}
          onSelect={(id) => updateConfig({ shoeId: id })}
        />

        {/* STRUCT-SESS-01: prefilled structure for non-interval, non-guided
            sessions (tempo warmup/blocks/cooldown, easy + strides). The
            interval and guided branches below own their own previews. */}
        {config.activityType !== "intervals" &&
          config.activityType !== "guided" &&
          (config.segments?.length ?? 0) > 0 && (
            <SessionStructureView segments={config.segments!} />
          )}

        {/* Interval config — only shown for intervals */}
        <AnimatePresence>
          {config.activityType === "intervals" && (
            <motion.div
              initial={motionSafe({ opacity: 0, height: 0 })}
              animate={{ opacity: 1, height: "auto" }}
              exit={motionSafe({ opacity: 0, height: 0 })}
              className="overflow-hidden space-y-2"
            >
              <SessionStructureView
                segments={segmentsFromIntervals(intervalConfig, unit)}
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
                    initial={motionSafe({ opacity: 0, height: 0 })}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={motionSafe({ opacity: 0, height: 0 })}
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
                              className="ds-input mt-1 text-sm text-center font-mono tabular-nums"
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
                            className="ds-input mt-1 text-sm text-center font-mono tabular-nums"
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
              initial={motionSafe({ opacity: 0, height: 0 })}
              animate={{ opacity: 1, height: "auto" }}
              exit={motionSafe({ opacity: 0, height: 0 })}
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
                <SessionStructureView
                  segments={segmentsFromGuided(selectedGuided)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Goal — for non-interval runs, and not on the treadmill, which
            has no live distance to hold a goal against */}
        {config.activityType !== "intervals" && !onTreadmill && (
          <div>
            {/* Visible-label rename only ("Target (optional)" → "Goal").
                The internal `target.type` config field is unchanged
                (RunConfig, localStorage, Firestore, analytics events
                all keep `target` as the key) so existing data and
                callers stay working. */}
            <SectionHeading size="compact" className="mb-2">
              Goal
            </SectionHeading>
            {/* Goal type — shared SegmentedControl (tone=running). Was a
                  hand-rolled pill row that hardcoded the coral hex and used
                  rgba(0,0,0,…) inactive styling (not dark-mode-safe); now the
                  radiogroup primitive with tokens + keyboard nav. */}
            <SegmentedControl
              ariaLabel="Run goal"
              tone="running"
              value={config.target.type}
              onChange={(type) =>
                updateConfig({
                  target: {
                    type,
                    value:
                      type === "distance"
                        ? 5000
                        : type === "time"
                          ? 1800
                          : type === "pace"
                            ? 330
                            : undefined,
                  },
                })
              }
              options={[
                { value: "none", label: "None" },
                { value: "distance", label: "Distance" },
                { value: "time", label: "Time" },
                { value: "pace", label: "Pace" },
              ]}
            />
          </div>
        )}

        {/* Goal value inputs */}
        {config.target.type !== "none" &&
          config.activityType !== "intervals" &&
          !onTreadmill && (
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
                  const presets = distancePresetsM(unit);
                  const currentValueM = config.target.value ?? 0;
                  const isCustom = !presets.includes(currentValueM);
                  return (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Distance
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {presets.map((m) => {
                          const active = currentValueM === m;
                          return (
                            <button
                              type="button"
                              key={m}
                              onClick={() =>
                                updateConfig({
                                  target: { type: "distance", value: m },
                                })
                              }
                              className={presetChipClass(active)}
                            >
                              {distanceValue(m, unit).replace(/\.0$/, "")}{" "}
                              {distanceUnitLabel(unit)}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => {
                            if (!isCustom)
                              updateConfig({
                                target: { type: "distance", value: 7500 },
                              });
                          }}
                          className={presetChipClass(isCustom)}
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
                            Distance ({distanceUnitLabel(unit)})
                          </label>
                          <input
                            id="target-distance"
                            type="number"
                            step="0.5"
                            /* The BOUNDS are absolute metres, shown
                               converted — an imperial reader must not get a
                               160 km ceiling because "100" is round in
                               their box. */
                            min={distanceIn(
                              DISTANCE_TARGET_MIN_M,
                              unit
                            ).toFixed(2)}
                            max={distanceIn(
                              DISTANCE_TARGET_MAX_M,
                              unit
                            ).toFixed(2)}
                            value={
                              config.target.value
                                ? distanceValue(config.target.value, unit)
                                : distanceValue(5000, unit)
                            }
                            onChange={(e) =>
                              updateConfig({
                                target: {
                                  type: "distance",
                                  value: distanceToMetres(
                                    Number(e.target.value),
                                    unit
                                  ),
                                },
                              })
                            }
                            onBlur={(e) => {
                              const typed = distanceToMetres(
                                Number(e.target.value),
                                unit
                              );
                              const clamped = Number.isFinite(typed)
                                ? Math.max(
                                    DISTANCE_TARGET_MIN_M,
                                    Math.min(DISTANCE_TARGET_MAX_M, typed)
                                  )
                                : 5000;
                              if (clamped !== typed) {
                                updateConfig({
                                  target: {
                                    type: "distance",
                                    value: clamped,
                                  },
                                });
                              }
                            }}
                            className="ds-input mt-1 text-sm text-center font-mono tabular-nums"
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
                              type="button"
                              key={s}
                              onClick={() =>
                                updateConfig({
                                  target: { type: "time", value: s },
                                })
                              }
                              className={presetChipClass(active)}
                            >
                              {s / 60} min
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => {
                            if (!isCustom)
                              updateConfig({
                                target: { type: "time", value: 1500 },
                              });
                          }}
                          className={presetChipClass(isCustom)}
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
                            /* Truthful display: an empty field shows EMPTY.
                               The old `value ? … : 30` fallback rendered a
                               phantom "30" while the config actually held 0
                               (clearing the field stored Number("")*60 = 0),
                               so "Duration must be at least 1 minute" showed
                               under a field reading 30 and Start was blocked
                               — the falsy-zero display-mismatch class. */
                            value={
                              config.target.value && config.target.value > 0
                                ? Math.round(config.target.value / 60)
                                : ""
                            }
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              updateConfig({
                                target: {
                                  type: "time",
                                  // Empty mid-typing = UNSET (undefined), not
                                  // 0 — validation stays quiet until there is
                                  // a real value to judge.
                                  value:
                                    raw === "" ? undefined : Number(raw) * 60,
                                },
                              });
                            }}
                            onBlur={(e) => {
                              const mins = Number(e.target.value);
                              if (!Number.isFinite(mins) || mins <= 0) {
                                // Left empty/invalid → settle on the 30-min
                                // default rather than an error state.
                                updateConfig({
                                  target: { type: "time", value: 1800 },
                                });
                                return;
                              }
                              const clamped = Math.max(1, Math.min(300, mins));
                              if (clamped !== mins) {
                                updateConfig({
                                  target: { type: "time", value: clamped * 60 },
                                });
                              }
                            }}
                            className="ds-input mt-1 text-sm text-center font-mono tabular-nums"
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
                              type="button"
                              key={s}
                              onClick={() =>
                                updateConfig({
                                  target: { type: "pace", value: s },
                                })
                              }
                              className={presetChipClass(active)}
                            >
                              {paceMinSec(s, unit)} {paceUnitLabel(unit)}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => {
                            if (!isCustom)
                              updateConfig({
                                target: { type: "pace", value: 315 },
                              });
                          }}
                          className={presetChipClass(isCustom)}
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
                            defaultValue={paceMinSec(
                              currentValueS || 330,
                              unit
                            )}
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
                            className="ds-input mt-1 text-sm text-center font-mono tabular-nums"
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
                  style={{ color: THEME.running }}
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
          const isManualDistance = requiresManualDistance(config);
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
              type="button"
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
                <ChevronUp className="size-4 text-muted-foreground shrink-0 mt-1" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground shrink-0 mt-1" />
              )}
            </button>
          );
        })()}

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={motionSafe({ opacity: 0, height: 0 })}
              animate={{ opacity: 1, height: "auto" }}
              exit={motionSafe({ opacity: 0, height: 0 })}
              className="overflow-hidden space-y-2"
            >
              {/* Auto-pause hides for manual-distance modes —
                  treadmill/manual run on a fixed surface or have no
                  GPS, so the GPS-derived auto-pause logic is a
                  visible no-op. State is preserved (we don't reset
                  config.autoPause) so switching the treadmill off
                  restores the user's choice. */}
              {[
                {
                  label: "Auto-pause",
                  key: "autoPause" as const,
                  hidden: requiresManualDistance(config),
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
                    <Toggle
                      checked={config[setting.key]}
                      label={setting.label}
                      onChange={() =>
                        updateConfig({ [setting.key]: !config[setting.key] })
                      }
                    />
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
                  {!requiresManualDistance(config) &&
                    config.target.type === "pace" && (
                      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-card">
                        <span className="text-sm">Pace alerts</span>
                        <Toggle
                          checked={config.paceAlerts}
                          label="Pace alerts"
                          onChange={() =>
                            updateConfig({ paceAlerts: !config.paceAlerts })
                          }
                        />
                      </div>
                    )}
                  <div className="p-3.5 rounded-xl border border-border/50 bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">Voice speed</span>
                      <span className="text-xs text-muted-foreground font-mono tabular-nums">
                        {config.voiceRate.toFixed(1)}×
                      </span>
                    </div>
                    <RangeInput
                      aria-label="Voice speed"
                      min={0.6}
                      max={1.4}
                      step="0.1"
                      value={config.voiceRate}
                      onChange={(e) =>
                        updateConfig({ voiceRate: Number(e.target.value) })
                      }
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
          Start text is contextual per run type ("Start free run",
          "Start guided run") so the button mirrors the user's
          selection; on the treadmill it says where the run starts
          ("Start on the treadmill"), whatever its type (Pgm8). */}
      {/* Pinned to the viewport bottom with `fixed` (was `sticky bottom-0`).
          As a sibling of the scroll area the sticky element had no scrolling
          ancestor, so it degraded to `relative` and floated UP over the
          "Ready to run?" title on short-content layouts (race-prep Easy Run
          etc.). `fixed` pins it to the screen bottom regardless of how the
          flex-height chain resolves on iOS. The scroll area's pb-40 reserves
          space so the last options never hide behind it. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 px-5 pt-3 pb-5 safe-area-pb"
        style={{
          background:
            "linear-gradient(to top, var(--color-background) 80%, transparent)",
        }}
      >
        {(() => {
          const selected =
            ACTIVITY_TYPES.find((a) => a.type === config.activityType) ??
            ACTIVITY_TYPES[1];
          const Icon = onTreadmill ? Dumbbell : Footprints;
          /* The planned session keeps the name its card gave it ("Start
             Easy 30") until the run stops being it: another type, target
             or set of intervals starts as its type ("Start tempo run"). */
          const isPlannedSession =
            sessionName !== undefined &&
            config.activityType === savedPreferences?.activityType &&
            JSON.stringify(config.target) ===
              JSON.stringify(savedPreferences?.target) &&
            JSON.stringify(config.intervals) ===
              JSON.stringify(savedPreferences?.intervals);
          return (
            <button
              type="button"
              onClick={() => {
                if (!targetError)
                  onStart(
                    config.activityType === "intervals"
                      ? { ...config, intervals: intervalConfig }
                      : config
                  );
              }}
              disabled={!!targetError}
              // Run7 Q4 — Sport-primary CTA. Was an orange→pink gradient
              // with orange-glow shadow which read as "nutrition" given
              // the codebase's semantic palette. Now: flat coral solid
              // (THEME.running) — matches the Programme Run section's
              // Next · Pending Start button + Pgm3 Start CTA discipline.
              // The pulse animation stays via btn-start-run-pulse.
              className="btn-start-run-pulse w-full py-5 rounded-2xl text-white font-semibold text-lg transition-transform active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed bg-running-fill"
            >
              <Icon className="inline size-5 mr-1" />{" "}
              {onTreadmill
                ? "Start on the treadmill"
                : `Start ${isPlannedSession ? sessionName : selected.name.toLowerCase()}`}
            </button>
          );
        })()}
      </div>

      {/* Run-type chooser drawer. Replaces the in-CTA inline picker.
          Grouped Outdoor / Other rows; each shows icon + name +
          description + measurement chip + selected check. On the
          treadmill the first group is the treadmill's, and its rows
          drop the GPS chip: every type is run there with the
          distance typed in (Pgm8).
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
                <SectionLabel className="px-2">
                  {group === "outdoor"
                    ? onTreadmill
                      ? "Treadmill"
                      : "Outdoor"
                    : "Other"}
                </SectionLabel>
                {items.map((at) => {
                  const IC = ICON_MAP[at.icon];
                  const isActive = config.activityType === at.type;
                  return (
                    <button
                      type="button"
                      key={at.type}
                      onClick={() => {
                        updateConfig(pacePatchForType(at.type));
                        setShowChooser(false);
                      }}
                      // Run7 Q4 — coral discipline. Selected card uses
                      // coral-tinted bg + coral icon container + coral
                      // checkmark, replacing the legacy purple-tinted
                      // selected state. Brand purple stays reserved for
                      // lifting / Save buttons.
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left motion-safe:transition motion-safe:active:scale-[0.98]${isActive ? " bg-running/10" : ""}`}
                    >
                      <div
                        className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? "bg-running/18" : "bg-muted"}`}
                      >
                        {IC && (
                          <IC
                            className={`size-5 ${isActive ? "text-running" : "text-muted-foreground"}`}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-sm font-bold ${isActive ? "text-running-strong" : "text-foreground"}`}
                          >
                            {at.name}
                          </p>
                          {!(onTreadmill && at.group === "outdoor") && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {at.chooserChip}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {at.chooserDescription}
                        </p>
                        {(() => {
                          const pace = chooserPaceFor(at.type);
                          return pace ? (
                            <p className="text-xs font-mono tabular-nums text-running-strong mt-0.5">
                              {pace}
                            </p>
                          ) : null;
                        })()}
                      </div>
                      {isActive && (
                        <Check
                          className="size-4 shrink-0 text-running"
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
