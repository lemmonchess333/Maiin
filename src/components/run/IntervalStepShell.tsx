import { useEffect, useRef, useState } from "react";
import type {
  IntervalState,
  IntervalConfig,
} from "../../hooks/useIntervalWorkout";
import {
  stepListFromConfig,
  currentStepIndex,
  stepHeadline,
  upNextHeadline,
} from "@/lib/intervalSteps";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * The in-run interval step shell (Runna teardown #3) — replaces the bare
 * phase chip (`IntervalDisplay`) with a visible state machine:
 *
 *  - segmented per-step strip (whole session at a glance, current filling)
 *  - the live step's PRESCRIPTION as the headline ("1K at 5:05–5:12 /km"),
 *    with the personalized band (#18's display rule) when the runner has one
 *  - big countdown / distance-left, "Up next", a step-complete flash,
 *    a manual "Skip step" override, and a terminal all-steps-done state
 *
 * Colour vocabulary carries over from the old chip (and matches Runna's,
 * coincidentally): work = green, rest = blue, warmup/cooldown = amber.
 * Pinned to the always-dark active-run screen like GuidedRunOverlay —
 * deliberately NOT theme vars. Animation is opacity/width only
 * (WKWebView-safe); reduced motion gets settled states.
 */

const KIND_COLOR: Record<string, string> = {
  warmup: "rgb(234,179,8)", // amber-500
  work: "rgb(34,197,94)", // green-500
  rest: "rgb(59,130,246)", // blue-500
  cooldown: "rgb(234,179,8)",
};
const KIND_TEXT: Record<string, string> = {
  warmup: "text-yellow-400",
  work: "text-green-400",
  rest: "text-blue-400",
  cooldown: "text-yellow-400",
};

function countdownLabel(remainingS: number): string {
  const r = Math.max(0, Math.ceil(remainingS));
  return `${Math.floor(r / 60)}:${(r % 60).toString().padStart(2, "0")}`;
}

export default function IntervalStepShell({
  state,
  config,
  band,
  onSkip,
}: {
  state: IntervalState;
  config: IntervalConfig;
  band?: [number, number];
  onSkip: () => void;
}) {
  const reduce = useReducedMotion();
  const steps = stepListFromConfig(config);
  const idx = currentStepIndex(state, config);

  // Step-complete flash: when the live index moves past a step, show its
  // headline with a check for a beat. Plain state + timeout (no motion lib
  // on the hot in-run path); reduced motion skips the flash entirely.
  const prevIdxRef = useRef(idx);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    const prev = prevIdxRef.current;
    prevIdxRef.current = idx;
    if (idx > prev && prev >= 0 && prev < steps.length && !reduce) {
      setFlash(stepHeadline(steps[prev], config, band));
      const t = setTimeout(() => setFlash(null), 2200);
      return () => clearTimeout(t);
    }
    // steps/config/band identities are stable per run config; idx is the
    // real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (state.phase === "idle") return null;

  if (state.phase === "complete") {
    return (
      <div
        className="mx-4 p-4 rounded-2xl text-center"
        style={{
          background: "rgba(34,197,94,0.12)",
          border: "1px solid rgba(34,197,94,0.3)",
        }}
      >
        <p className="text-lg font-bold text-green-400">All steps complete</p>
        <p className="text-xs text-green-400/70 mt-1">
          Cruise home at whatever feels good — then finish the run to save it.
        </p>
      </div>
    );
  }

  const live = steps[idx];
  const text = KIND_TEXT[live.kind];
  const upNext = upNextHeadline(state, config, band);
  const eyebrow =
    live.kind === "work"
      ? `REP ${state.currentRep}/${state.totalReps}`
      : live.kind === "rest"
        ? `AFTER REP ${state.currentRep}/${state.totalReps}`
        : live.kind.toUpperCase();

  // Live progress within the current step (drives its strip segment).
  const liveProgress = state.isDistanceBased
    ? Math.min(1, state.phaseDistanceCovered / Math.max(1, state.phaseTarget))
    : Math.min(1, state.phaseElapsed / Math.max(1, state.phaseTarget));

  return (
    <div
      className="mx-4 rounded-2xl overflow-hidden"
      style={{
        // Same pinned dark glass as GuidedRunOverlay (always-dark run screen).
        background: "rgba(18, 18, 20, 0.97)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* Segmented per-step strip — the whole session at a glance. */}
      <div className="flex gap-1 px-3 pt-3" aria-hidden="true">
        {steps.map((s, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.10)" }}
          >
            <div
              className={
                reduce ? "h-full" : "h-full transition-all duration-1000"
              }
              style={{
                background: KIND_COLOR[s.kind],
                width:
                  i < idx
                    ? "100%"
                    : i === idx
                      ? `${liveProgress * 100}%`
                      : "0%",
              }}
            />
          </div>
        ))}
      </div>

      <div className="p-4 pt-3 space-y-1.5">
        {/* Step-complete flash (transient) or the live eyebrow. */}
        {flash ? (
          <p className="text-[11px] font-bold tracking-wider text-green-400">
            ✓ COMPLETED — {flash.toUpperCase()}
          </p>
        ) : (
          <p className={`text-[11px] font-bold tracking-wider ${text}`}>
            {eyebrow}
          </p>
        )}

        <div className="flex items-end justify-between gap-3">
          {/* The prescription IS the headline. */}
          <p className={`text-xl font-extrabold leading-tight ${text}`}>
            {stepHeadline(live, config, band)}
          </p>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-white shrink-0">
            {state.phase === "work" && state.isDistanceBased
              ? `${Math.max(0, Math.round(state.phaseTarget - state.phaseDistanceCovered))}m`
              : countdownLabel(state.phaseTarget - state.phaseElapsed)}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-white/50 min-w-0 truncate">
            {upNext ? (
              <>
                Up next:{" "}
                <span className="text-white/70 font-medium">{upNext}</span>
              </>
            ) : (
              "Last step — bring it home."
            )}
          </p>
          <button
            type="button"
            onClick={onSkip}
            className="shrink-0 min-h-[44px] px-3 -my-2 text-xs font-semibold text-white/70 active:scale-[0.97]"
            aria-label="Skip to the next step"
          >
            Skip step
          </button>
        </div>
      </div>
    </div>
  );
}
