import { getSegmentColor, type GuidedRunWorkout } from "@/lib/guidedRun";
import { paceMinSec } from "@/lib/runLabels";

interface IntervalSpec {
  reps: number;
  workDistance?: number;
  workDuration?: number;
  workPace?: number;
  restDuration: number;
  warmupDuration?: number;
  cooldownDuration?: number;
}

type Props =
  | { kind: "intervals"; intervals: IntervalSpec }
  | { kind: "guided"; workout: GuidedRunWorkout };

function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatWorkLabel(spec: IntervalSpec): string {
  if (spec.workDistance && spec.workDistance >= 1000) {
    return `${(spec.workDistance / 1000).toFixed(spec.workDistance % 1000 === 0 ? 0 : 1)}K`;
  }
  if (spec.workDistance) return `${spec.workDistance}m`;
  if (spec.workDuration) return formatMinutes(spec.workDuration);
  return "interval";
}

function Block({
  color,
  label,
  detail,
}: {
  color: string;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-1.5 h-10 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground leading-tight mt-0.5">
          {detail}
        </p>
      </div>
    </div>
  );
}

export default function SessionStructureView(props: Props) {
  if (props.kind === "intervals") {
    const s = props.intervals;
    const workLabel = formatWorkLabel(s);
    const paceLabel = s.workPace ? ` @ ${paceMinSec(s.workPace)}/km` : "";
    const mainLabel = `${s.reps} × ${workLabel}${paceLabel}`;
    const mainDetail = `${formatRest(s.restDuration)} recovery between reps`;

    return (
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <h3 className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
          Session structure
        </h3>
        <div className="space-y-3">
          {s.warmupDuration ? (
            <Block
              color={getSegmentColor("warmup")}
              label="Warm-up"
              detail={`${formatMinutes(s.warmupDuration)} easy`}
            />
          ) : null}
          <Block
            color={getSegmentColor("hard")}
            label={mainLabel}
            detail={mainDetail}
          />
          {s.cooldownDuration ? (
            <Block
              color={getSegmentColor("cooldown")}
              label="Cool-down"
              detail={`${formatMinutes(s.cooldownDuration)} easy`}
            />
          ) : null}
        </div>
      </div>
    );
  }

  const segments = props.workout.segments;
  return (
    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
      <h3 className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
        Session structure
      </h3>
      <div className="space-y-3">
        {segments.map((seg, idx) => (
          <Block
            key={`${seg.type}-${idx}`}
            color={getSegmentColor(seg.type)}
            label={seg.label}
            detail={`${formatMinutes(seg.durationSeconds)} · ${seg.instruction}`}
          />
        ))}
      </div>
    </div>
  );
}
