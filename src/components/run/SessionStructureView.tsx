import { getSegmentColor } from "@/lib/guidedRun";
import {
  segmentTargetLabel,
  segmentsDurationSeconds,
  type SessionSegment,
} from "@/lib/runSegments";
import SectionLabel from "@/components/ui/SectionLabel";

/**
 * STRUCT-SESS-01: ONE renderer over the canonical `SessionSegment[]`.
 *
 * The previous version was a discriminated union over two structural
 * models (a local interval spec + the guided workout), with two separate
 * render branches assembling the same <Block> primitive. The canonical
 * segment list (runSegments.ts) collapses it to a single map — and gives
 * tempo and strided-easy sessions a structure preview for the first time
 * (their structure used to be prose in the template description).
 *
 * Long interval sessions render each rep as its own row deliberately —
 * the row count IS the honest preview of the session's shape.
 */
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

export default function SessionStructureView({
  segments,
}: {
  segments: SessionSegment[];
}) {
  if (segments.length === 0) return null;
  // Total line only when every segment is time-based — with distance reps
  // in the mix a seconds sum would silently undercount the session.
  const allTimed = segments.every((s) => s.target.kind === "duration");
  const totalSec = segmentsDurationSeconds(segments);
  return (
    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
      <div className="flex items-baseline justify-between">
        <SectionLabel as="h3">Session structure</SectionLabel>
        {allTimed && totalSec > 0 && (
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {Math.round(totalSec / 60)} min
          </span>
        )}
      </div>
      <div className="space-y-3">
        {segments.map((seg, idx) => (
          <Block
            key={`${seg.type}-${idx}`}
            color={getSegmentColor(seg.type)}
            label={seg.label}
            detail={`${segmentTargetLabel(seg.target)} \u00b7 ${seg.instruction}`}
          />
        ))}
      </div>
    </div>
  );
}
