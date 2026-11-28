import { Card } from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import {
  ZONE_COVERAGE_MIN,
  ZONE_NAMES,
  isHeartRateSourceKind,
  type AerobicDecouplingSummary,
  type HeartRateSourceKind,
  type HeartRateSummary,
} from "@/lib/hrZones";

/** Who read the heart rate, in the card's words. */
const SOURCE_WORD: Record<HeartRateSourceKind, string> = {
  "apple-watch": "Watch",
  bluetooth: "Sensor",
};

function savedDecoupling(value: unknown): AerobicDecouplingSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const d = value as Partial<AerobicDecouplingSummary>;
  if (
    !Number.isFinite(d.pct) ||
    !Number.isFinite(d.firstHalfAvgBpm) ||
    !Number.isFinite(d.secondHalfAvgBpm) ||
    (d.status !== "steady" &&
      d.status !== "mild_drift" &&
      d.status !== "high_drift")
  ) {
    return undefined;
  }
  return {
    pct: d.pct!,
    firstHalfAvgBpm: d.firstHalfAvgBpm!,
    secondHalfAvgBpm: d.secondHalfAvgBpm!,
    status: d.status,
  };
}

function savedSummary(value: unknown): HeartRateSummary | null {
  if (!value || typeof value !== "object") return null;
  const summary = value as Partial<HeartRateSummary>;
  if (
    !isHeartRateSourceKind(summary.source) ||
    !Number.isFinite(summary.averageBpm) ||
    !Number.isFinite(summary.maxBpm) ||
    !Number.isFinite(summary.coveredSeconds) ||
    !Number.isFinite(summary.movingSeconds) ||
    !Number.isFinite(summary.coverage) ||
    !Number.isFinite(summary.maxHr) ||
    (summary.coverage ?? 0) < 0 ||
    (summary.coverage ?? 0) > 1 ||
    !Array.isArray(summary.zoneSeconds) ||
    summary.zoneSeconds.length !== 5 ||
    !summary.zoneSeconds.every(
      (seconds) => Number.isFinite(seconds) && seconds >= 0
    )
  )
    return null;
  const decoupling = savedDecoupling(summary.decoupling);
  return {
    ...(summary as HeartRateSummary),
    ...(decoupling ? { decoupling } : { decoupling: undefined }),
  };
}

function decouplingNote(decoupling: AerobicDecouplingSummary): string {
  const halves = `${decoupling.firstHalfAvgBpm} to ${decoupling.secondHalfAvgBpm} bpm`;
  if (decoupling.status === "steady") {
    return `Held steady across both halves (${halves}).`;
  }
  if (decoupling.status === "mild_drift") {
    return `Mild second-half drift (${halves}). Heat, pacing, or fueling can add to this.`;
  }
  return `Noticeable second-half drift (${halves}). Often a sign of heat, pacing, or low fuel.`;
}

function duration(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

/**
 * A saved summary only. Never renders raw beats or a fabricated zero. Time
 * in zone is elapsed time (`summarizeHeartRate`), shown only when readings
 * covered at least half the moving time (connected training proposal,
 * heart-rate rule 5); under that the card says the reading was partial.
 */
export default function HeartRateSummaryCard({
  summary: value,
}: {
  summary: unknown;
}) {
  const summary = savedSummary(value);
  if (!summary) return null;
  const coveragePercent = Math.round(summary.coverage * 100);
  const enoughCoverage = summary.coverage >= ZONE_COVERAGE_MIN;
  const zonesAvailable = summary.maxHr > 0;
  return (
    <Card tone="flat" className="space-y-3">
      <SectionLabel>Heart rate</SectionLabel>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Average</p>
          <p className="font-figure text-h3 font-bold tabular-nums text-foreground">
            {summary.averageBpm}{" "}
            <span className="font-sans text-sm font-medium text-muted-foreground">
              bpm
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Highest</p>
          <p className="font-figure text-h3 font-bold tabular-nums text-foreground">
            {summary.maxBpm}{" "}
            <span className="font-sans text-sm font-medium text-muted-foreground">
              bpm
            </span>
          </p>
        </div>
      </div>
      {enoughCoverage && zonesAvailable ? (
        <div className="space-y-1 border-t border-border pt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Time in zone · {SOURCE_WORD[summary.source]} covered{" "}
            {coveragePercent}% of moving time
          </p>
          {summary.zoneSeconds.map((seconds, index) => (
            <div
              key={index}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="text-foreground">
                Z{index + 1} · {ZONE_NAMES[(index + 1) as 1 | 2 | 3 | 4 | 5]}
              </span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {duration(seconds)}
              </span>
            </div>
          ))}
        </div>
      ) : enoughCoverage ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Set a maximum heart rate in Settings to see time in zones.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Partial reading: heart rate covered {coveragePercent}% of moving time,
          so time in zones isn’t shown.
        </p>
      )}
      {summary.decoupling && (
        <div className="space-y-1 border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">
              Heart rate drift
            </span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {summary.decoupling.pct.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {decouplingNote(summary.decoupling)}
          </p>
        </div>
      )}
    </Card>
  );
}
