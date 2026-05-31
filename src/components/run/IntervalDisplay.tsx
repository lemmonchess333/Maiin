import type { IntervalState } from "../../hooks/useIntervalWorkout";

// Module-scope constants — these never depend on render state, so building
// them once avoids re-allocating on every tick of a live interval workout.
const PHASE_COLORS: Record<string, string> = {
  warmup: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  work: "bg-green-500/20 text-green-400 border-green-500/30",
  rest: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cooldown: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

export default function IntervalDisplay({ state }: { state: IntervalState }) {
  if (state.phase === "idle" || state.phase === "complete") return null;

  // `work` carries the live rep count, so its label is render-dependent and
  // stays inline; the rest are static.
  const phaseLabels: Record<string, string> = {
    warmup: "WARM UP",
    work: `REP ${state.currentRep}/${state.totalReps}`,
    rest: "REST",
    cooldown: "COOL DOWN",
  };

  const color = PHASE_COLORS[state.phase] || "";
  const label = phaseLabels[state.phase] || "";
  const remaining = Math.max(
    0,
    Math.ceil(state.phaseTarget - state.phaseElapsed)
  );

  return (
    <div className={`mx-4 p-3 rounded-xl border ${color}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-wider">{label}</p>
      </div>
      {state.phase === "work" && state.isDistanceBased ? (
        <p className="text-2xl font-mono tabular-nums font-bold mt-1">
          {Math.max(
            0,
            Math.round(state.phaseTarget - state.phaseDistanceCovered)
          )}
          m left
        </p>
      ) : (
        <p className="text-2xl font-mono tabular-nums font-bold mt-1">
          {Math.floor(remaining / 60)}:
          {(remaining % 60).toString().padStart(2, "0")}
        </p>
      )}
    </div>
  );
}
