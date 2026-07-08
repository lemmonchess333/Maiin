/**
 * RunLaunchCard — the planned-run "launch surface" (run fast-launch arc,
 * 2026-07).
 *
 * When Run.tsx resolves a confident, named planned run (a real RUN_TEMPLATE —
 * `metadata.actualTemplateId !== null`), the waiting phase shows THIS instead
 * of the full RunSetupModal config form. It's a glanceable "here's your run →
 * go" card: identity + metric + pace + phase eyebrow + one Start.
 *
 * The Start is a real on-screen gesture, so `useAudioCues.prime()` (called in
 * Run.tsx's handleStart) unlocks speech on iOS — a countdown auto-fired from
 * an effect would be silent. "Customize" swaps to the full modal for the rare
 * case that needs it. See scratchpad spec `spec-run-fast-launch.md` §4.
 */
import {
  ArrowLeft,
  Play,
  Footprints,
  PersonStanding,
  Zap,
  RefreshCw,
  Wind,
  Route,
  Flag,
} from "lucide-react";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import ShoeSelector from "./ShoeSelector";
import { paceMinSec } from "@/lib/runLabels";
import type { RunTemplate } from "@/lib/workoutTemplates";
import type { RunConfig } from "./runConfigDefaults";
import type { ProgramContextStrip } from "./RunSetupModal";

const RUN_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "person-standing": PersonStanding,
  zap: Zap,
  "refresh-cw": RefreshCw,
  wind: Wind,
  route: Route,
  flag: Flag,
};

interface RunLaunchCardProps {
  workout: RunTemplate;
  /** Resolved prefill — carries the pace/distance/interval target to display. */
  prefill: Partial<RunConfig>;
  /** Programme context (phase / week) — null for structured-today non-race. */
  strip: ProgramContextStrip | null;
  /** The planned slot is already terminal → this is a bonus run. */
  isExtra: boolean;
  selectedShoeId: string | null;
  onSelectShoe: (shoeId: string) => void;
  onStart: () => void;
  onCustomize: () => void;
  onBack: () => void;
}

/** Compact interval summary, e.g. "5 × 1K" or "6 × 3min". */
function intervalSummary(intervals: RunConfig["intervals"]): string | null {
  if (!intervals) return null;
  const { reps, workDistance, workDuration } = intervals;
  if (workDistance) {
    const unit =
      workDistance >= 1000 ? `${workDistance / 1000}K` : `${workDistance}m`;
    return `${reps} × ${unit}`;
  }
  if (workDuration) return `${reps} × ${Math.round(workDuration / 60)}min`;
  return `${reps} reps`;
}

export default function RunLaunchCard({
  workout,
  prefill,
  strip,
  isExtra,
  selectedShoeId,
  onSelectShoe,
  onStart,
  onCustomize,
  onBack,
}: RunLaunchCardProps) {
  const Icon = RUN_ICON_MAP[workout.icon] ?? Footprints;

  const target = prefill.target;
  // Primary metric shown next to the name: distance or a timed target.
  const distanceKm =
    target?.type === "distance" && target.value
      ? target.value / 1000
      : (workout.config.targetDistance ?? null);
  const timeMin =
    target?.type === "time" && target.value
      ? Math.round(target.value / 60)
      : null;
  const paceLabel =
    target?.type === "pace" && target.value
      ? `${paceMinSec(target.value)}/km`
      : null;
  const intervals = intervalSummary(prefill.intervals);

  const eyebrow = isExtra
    ? "Extra run"
    : strip?.weekLabel
      ? `Race prep · ${strip.weekLabel}`
      : "Today · Run day";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground px-4">
      <header className="flex items-center h-14 shrink-0">
        <IconButton
          aria-label="Back"
          variant="ghost"
          icon={<ArrowLeft className="size-5" />}
          onClick={onBack}
        />
      </header>

      <div className="flex-1 flex flex-col justify-center gap-4 min-h-0">
        <div className="rounded-2xl bg-running/8 p-5">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl flex items-center justify-center bg-running/9 shrink-0">
              <Icon className="size-6 text-running" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-running">{eyebrow}</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="text-2xl font-bold truncate">{workout.name}</h1>
                {distanceKm != null && (
                  <span className="text-xl font-bold font-mono tabular-nums text-running">
                    {distanceKm} km
                  </span>
                )}
                {distanceKm == null && timeMin != null && (
                  <span className="text-xl font-bold font-mono tabular-nums text-running">
                    {timeMin} min
                  </span>
                )}
              </div>
            </div>
          </div>

          {(paceLabel || intervals) && (
            <p className="text-sm font-mono tabular-nums text-muted-foreground mt-3">
              {[intervals, paceLabel].filter(Boolean).join("  ·  ")}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            {workout.description}
          </p>
        </div>

        <ShoeSelector selectedShoeId={selectedShoeId} onSelect={onSelectShoe} />
      </div>

      <div className="safe-area-pb pb-5 pt-3 space-y-2 shrink-0">
        <Button
          variant="sport"
          size="lg"
          fullWidth
          leftIcon={<Play className="size-5" fill="currentColor" />}
          onClick={onStart}
          className="btn-start-run-pulse text-lg"
        >
          Start {workout.name}
        </Button>
        <Button variant="ghost" fullWidth onClick={onCustomize}>
          Customize
        </Button>
      </div>
    </div>
  );
}
