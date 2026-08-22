import { getSegmentColor } from "@/lib/guidedRun";
import { segmentsDurationSeconds } from "@/lib/runSegments";
import type { SessionPlayer } from "@/hooks/useSessionPlayer";
import { THEME } from "@/lib/theme";

/**
 * STRUCT-SESS-03: the guided overlay now consumes the ONE session player
 * (`useSessionPlayer`) instead of the deleted `useGuidedRun` — same visual,
 * one structure engine. Guided segments are all duration-based, so the
 * whole-session progress bar derives from the duration sums.
 */

function formatTime(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function GuidedRunOverlay({
  player,
}: {
  player: SessionPlayer;
}) {
  const { segments, state, current, next, isComplete } = player;
  if (!current && !isComplete) return null;

  if (isComplete) {
    return (
      <div
        className="mx-4 mb-3 p-4 rounded-2xl text-center"
        style={{
          /* Fixed THEME.success family, not theme-aware tokens: the run
             surface is always-dark by its own values while CSS vars
             follow the user's theme. (Was raw green-500 rgba + Tailwind
             green-400 classes — off-palette greens.) */
          background: `${THEME.success}1F`,
          border: `1px solid ${THEME.success}4D`,
        }}
      >
        <p className="text-lg font-bold" style={{ color: THEME.success }}>
          Workout Complete!
        </p>
        <p className="text-xs mt-1" style={{ color: THEME.success }}>
          Great session — keep it up
        </p>
      </div>
    );
  }

  const segColor = current ? getSegmentColor(current.type) : THEME.brand;
  const segTarget =
    current?.target.kind === "duration" ? current.target.seconds : 0;
  const timeRemaining = Math.max(0, segTarget - state.phaseElapsed);
  const segmentProgress =
    segTarget > 0 ? Math.min(1, state.phaseElapsed / segTarget) : 0;
  const totalSec = segmentsDurationSeconds(segments);
  const doneSec =
    segmentsDurationSeconds(segments.slice(0, Math.max(0, state.index))) +
    state.phaseElapsed;
  const totalProgress = totalSec > 0 ? Math.min(1, doneSec / totalSec) : 0;
  const nextTarget = next?.target.kind === "duration" ? next.target.seconds : 0;

  return (
    <div
      className="mx-4 mb-3 rounded-2xl overflow-hidden"
      style={{
        /* Pinned DARK glass, deliberately NOT var(--glass-bg). This overlay
           only mounts on the active-run screen, which is always-dark by
           design (THEME.bg + text-white full-screen map) regardless of the
           app theme. The theme-aware glass vars flipped to white in light
           mode here, rendering a white card with this component's white
           text/tracks on the dark map — unreadable. Values = the .dark
           definitions of --glass-bg / --glass-border in index.css. */
        background: "rgba(18, 18, 20, 0.97)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* Overall progress bar */}
      <div className="h-1 bg-white/5">
        <div
          className="h-full transition-all duration-1000"
          style={{ width: `${totalProgress * 100}%`, background: segColor }}
        />
      </div>

      <div className="p-4 space-y-2">
        {/* Segment label + countdown */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="size-2.5 rounded-full"
              style={{ background: segColor }}
            />
            <span className="text-sm font-bold text-white">
              {current?.label}
            </span>
          </div>
          <span className="text-2xl font-extrabold font-mono tabular-nums text-white">
            {formatTime(timeRemaining)}
          </span>
        </div>

        {/* Instruction */}
        <p className="text-xs text-white/70">{current?.instruction}</p>

        {/* Segment progress bar */}
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${segmentProgress * 100}%`, background: segColor }}
          />
        </div>

        {/* Up next */}
        {next && (
          <p className="text-xs text-white/50">
            Up next:{" "}
            <span className="text-white/70 font-medium">{next.label}</span> —{" "}
            {formatTime(nextTarget)}
          </p>
        )}
      </div>
    </div>
  );
}
