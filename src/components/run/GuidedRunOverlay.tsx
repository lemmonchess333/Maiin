import { getSegmentColor } from "@/lib/guidedRun";
import type { RunSegment } from "@/lib/guidedRun";

interface Props {
  currentSegment: RunSegment | null;
  nextSegment: RunSegment | null;
  timeRemaining: number;
  segmentProgress: number;
  totalProgress: number;
  isComplete: boolean;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function GuidedRunOverlay({
  currentSegment,
  nextSegment,
  timeRemaining,
  segmentProgress,
  totalProgress,
  isComplete,
}: Props) {
  if (!currentSegment && !isComplete) return null;

  if (isComplete) {
    return (
      <div className="mx-4 mb-3 p-4 rounded-2xl text-center"
        style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}>
        <p className="text-lg font-bold text-green-400">Workout Complete!</p>
        <p className="text-xs text-green-400/70 mt-1">Great session — keep it up</p>
      </div>
    );
  }

  const segColor = currentSegment ? getSegmentColor(currentSegment.type) : "#8b5cf6";

  return (
    <div className="mx-4 mb-3 rounded-2xl overflow-hidden"
      style={{ background: "rgba(15,15,20,0.8)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Overall progress bar */}
      <div className="h-1 bg-white/5">
        <div className="h-full transition-all duration-1000" style={{ width: `${totalProgress * 100}%`, background: segColor }} />
      </div>

      <div className="p-4 space-y-2">
        {/* Segment label + countdown */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: segColor }} />
            <span className="text-sm font-bold text-white">{currentSegment?.label}</span>
          </div>
          <span className="text-2xl font-extrabold tabular-nums text-white">{formatTime(timeRemaining)}</span>
        </div>

        {/* Instruction */}
        <p className="text-xs text-white/60">{currentSegment?.instruction}</p>

        {/* Segment progress bar */}
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${segmentProgress * 100}%`, background: segColor }}
          />
        </div>

        {/* Up next */}
        {nextSegment && (
          <p className="text-[10px] text-white/40">
            Up next: <span className="text-white/60 font-medium">{nextSegment.label}</span> — {formatTime(nextSegment.durationSeconds)}
          </p>
        )}
      </div>
    </div>
  );
}
