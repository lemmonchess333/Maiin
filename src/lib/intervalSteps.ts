/**
 * Interval step model — the pure derivations behind the in-run step shell
 * (Runna teardown #3: the guided-interval screen is a visible state machine —
 * big current-step prescription, "up next", a segmented per-step strip — not
 * a bare phase chip).
 *
 * `useIntervalWorkout` owns the LIVE state (phase / rep / elapsed); this
 * module derives everything the shell displays from (config, state):
 * the full step list, the current index into it, the step headline
 * ("1K at 5:05–5:12 /km"), and the up-next label. Pure — no React, no clock.
 */

import type {
  IntervalConfig,
  IntervalState,
} from "../hooks/useIntervalWorkout";
import { paceMinSec, paceBandLabel } from "./runLabels";

export type IntervalStepKind = "warmup" | "work" | "rest" | "cooldown";

export interface IntervalStep {
  kind: IntervalStepKind;
  /** 1-based rep for work/rest steps (the rest after rep N carries N). */
  rep?: number;
}

/** The whole session as an ordered step list:
 *  [warmup?] + work₁, rest₁, … work_N (no rest after the last rep) + [cooldown?] */
export function stepListFromConfig(config: IntervalConfig): IntervalStep[] {
  const steps: IntervalStep[] = [];
  if (config.warmupDuration) steps.push({ kind: "warmup" });
  for (let rep = 1; rep <= config.reps; rep++) {
    steps.push({ kind: "work", rep });
    if (rep < config.reps) steps.push({ kind: "rest", rep });
  }
  if (config.cooldownDuration) steps.push({ kind: "cooldown" });
  return steps;
}

/**
 * Index of the live phase in `stepListFromConfig`'s order. −1 before start
 * (idle), `steps.length` once complete — callers can render "all done".
 * The machine's rest phase keeps `currentRep` at the finished rep, which is
 * exactly the rest step's rep here.
 */
export function currentStepIndex(
  state: IntervalState,
  config: IntervalConfig
): number {
  const warmupOffset = config.warmupDuration ? 1 : 0;
  switch (state.phase) {
    case "idle":
      return -1;
    case "warmup":
      return 0;
    case "work":
      return warmupOffset + (state.currentRep - 1) * 2;
    case "rest":
      return warmupOffset + (state.currentRep - 1) * 2 + 1;
    case "cooldown":
      return stepListFromConfig(config).length - 1;
    case "complete":
      return stepListFromConfig(config).length;
  }
}

/** "1K" / "400m" — the register interval runners use. */
function workDistanceLabel(m: number): string {
  if (m >= 1000) {
    const km = m / 1000;
    return `${km % 1 === 0 ? km : km.toFixed(1)}K`;
  }
  return `${Math.round(m)}m`;
}

/** "90s" under 3 minutes, "3:30" beyond — matches how rests are spoken. */
export function stepDurationLabel(s: number): string {
  if (s < 180) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const ss = Math.round(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

/**
 * The step's one-line prescription. Work steps lead with the effort and
 * carry the personalized pace — BAND first (the honest coaching target,
 * #18's display rule), single work pace as the fallback, bare effort when
 * neither is known.
 */
export function stepHeadline(
  step: IntervalStep,
  config: IntervalConfig,
  band?: [number, number]
): string {
  switch (step.kind) {
    case "warmup":
      return "Warm up";
    case "cooldown":
      return "Cool down";
    case "rest":
      return `${stepDurationLabel(config.restDuration)} rest`;
    case "work": {
      const effort = config.workDistance
        ? workDistanceLabel(config.workDistance)
        : stepDurationLabel(config.workDuration || 60);
      if (band) return `${effort} at ${paceBandLabel(band)}`;
      if (config.workPace)
        return `${effort} at ${paceMinSec(config.workPace)} /km`;
      return `${effort} hard`;
    }
  }
}

/** The label of the step after the live one, or null on the last step /
 *  when the session hasn't started or has finished. */
export function upNextHeadline(
  state: IntervalState,
  config: IntervalConfig,
  band?: [number, number]
): string | null {
  const steps = stepListFromConfig(config);
  const idx = currentStepIndex(state, config);
  if (idx < 0 || idx + 1 >= steps.length) return null;
  return stepHeadline(steps[idx + 1], config, band);
}
