import { useState, useCallback, useRef } from "react";

export type IntervalPhase =
  | "idle"
  | "warmup"
  | "work"
  | "rest"
  | "cooldown"
  | "complete";

export interface IntervalConfig {
  reps: number;
  workDistance?: number;
  workDuration?: number;
  workPace?: number;
  restDuration: number;
  warmupDuration?: number;
  cooldownDuration?: number;
}

export interface IntervalState {
  phase: IntervalPhase;
  currentRep: number;
  totalReps: number;
  phaseElapsed: number;
  phaseTarget: number;
  phaseDistanceCovered: number;
  isDistanceBased: boolean;
}

export function useIntervalWorkout(config: IntervalConfig | undefined) {
  const [state, setState] = useState<IntervalState>({
    phase: "idle",
    currentRep: 0,
    totalReps: config?.reps || 0,
    phaseElapsed: 0,
    phaseTarget: 0,
    phaseDistanceCovered: 0,
    isDistanceBased: !!config?.workDistance,
  });

  const phaseStartDistance = useRef(0);
  const phaseStartTime = useRef(0);

  const start = useCallback(() => {
    if (!config) return;
    phaseStartTime.current = Date.now();
    phaseStartDistance.current = 0;
    if (config.warmupDuration) {
      setState((s) => ({
        ...s,
        phase: "warmup",
        currentRep: 0,
        totalReps: config.reps,
        phaseTarget: config.warmupDuration || 0,
      }));
      return;
    }
    setState((s) => ({
      ...s,
      phase: "work",
      currentRep: 1,
      totalReps: config.reps,
      phaseTarget: config.workDistance || config.workDuration || 60,
      phaseElapsed: 0,
      phaseDistanceCovered: 0,
      isDistanceBased: !!config.workDistance,
    }));
  }, [config]);

  const tick = useCallback(
    (_totalElapsed: number, totalDistance: number) => {
      if (!config) return;
      setState((prev) => {
        const phaseElapsed = (Date.now() - phaseStartTime.current) / 1000;
        const phaseDistance = totalDistance - phaseStartDistance.current;
        const next = {
          ...prev,
          phaseElapsed,
          phaseDistanceCovered: phaseDistance,
        };

        if (
          prev.phase === "warmup" &&
          phaseElapsed >= (config.warmupDuration || 0)
        ) {
          phaseStartTime.current = Date.now();
          phaseStartDistance.current = totalDistance;
          return {
            ...next,
            phase: "work",
            currentRep: 1,
            phaseElapsed: 0,
            phaseDistanceCovered: 0,
            phaseTarget: config.workDistance || config.workDuration || 60,
            isDistanceBased: !!config.workDistance,
          };
        }

        if (prev.phase === "work") {
          const workDone = config.workDistance
            ? phaseDistance >= config.workDistance
            : phaseElapsed >= (config.workDuration || 60);
          if (workDone) {
            if (prev.currentRep >= config.reps) {
              if (config.cooldownDuration) {
                phaseStartTime.current = Date.now();
                return {
                  ...next,
                  phase: "cooldown",
                  phaseElapsed: 0,
                  phaseTarget: config.cooldownDuration,
                };
              }
              return { ...next, phase: "complete" };
            }
            phaseStartTime.current = Date.now();
            phaseStartDistance.current = totalDistance;
            return {
              ...next,
              phase: "rest",
              phaseElapsed: 0,
              phaseDistanceCovered: 0,
              phaseTarget: config.restDuration,
              isDistanceBased: false,
            };
          }
        }

        if (prev.phase === "rest" && phaseElapsed >= config.restDuration) {
          const nextRep = prev.currentRep + 1;
          if (nextRep > config.reps) {
            if (config.cooldownDuration) {
              phaseStartTime.current = Date.now();
              return {
                ...next,
                phase: "cooldown",
                phaseElapsed: 0,
                phaseTarget: config.cooldownDuration,
              };
            }
            return { ...next, phase: "complete" };
          }
          phaseStartTime.current = Date.now();
          phaseStartDistance.current = totalDistance;
          return {
            ...next,
            phase: "work",
            currentRep: nextRep,
            phaseElapsed: 0,
            phaseDistanceCovered: 0,
            phaseTarget: config.workDistance || config.workDuration || 60,
            isDistanceBased: !!config.workDistance,
          };
        }

        if (
          prev.phase === "cooldown" &&
          phaseElapsed >= (config.cooldownDuration || 0)
        ) {
          return { ...next, phase: "complete" };
        }

        return next;
      });
    },
    [config]
  );

  /**
   * Manual step advance (the shell's "Skip step" — Runna's Next Lap). Forces
   * the transition `tick` would take when the live phase's threshold is met;
   * the two switches must stay mirrored. GPS distance keeps accruing on the
   * caller's side, so only the phase clock/odometer refs reset here — the
   * next tick's `totalDistance` re-anchors `phaseStartDistance` implicitly
   * via the same refs.
   */
  const skip = useCallback(
    (totalDistance: number) => {
      if (!config) return;
      setState((prev) => {
        const resetClock = () => {
          phaseStartTime.current = Date.now();
          phaseStartDistance.current = totalDistance;
        };
        const workPhase = (rep: number) => {
          resetClock();
          return {
            ...prev,
            phase: "work" as const,
            currentRep: rep,
            phaseElapsed: 0,
            phaseDistanceCovered: 0,
            phaseTarget: config.workDistance || config.workDuration || 60,
            isDistanceBased: !!config.workDistance,
          };
        };
        const cooldownOrComplete = () => {
          if (config.cooldownDuration) {
            resetClock();
            return {
              ...prev,
              phase: "cooldown" as const,
              phaseElapsed: 0,
              phaseDistanceCovered: 0,
              phaseTarget: config.cooldownDuration,
              isDistanceBased: false,
            };
          }
          return { ...prev, phase: "complete" as const };
        };
        switch (prev.phase) {
          case "warmup":
            return workPhase(1);
          case "work":
            if (prev.currentRep >= config.reps) return cooldownOrComplete();
            resetClock();
            return {
              ...prev,
              phase: "rest" as const,
              phaseElapsed: 0,
              phaseDistanceCovered: 0,
              phaseTarget: config.restDuration,
              isDistanceBased: false,
            };
          case "rest":
            return workPhase(prev.currentRep + 1);
          case "cooldown":
            return { ...prev, phase: "complete" as const };
          default:
            return prev;
        }
      });
    },
    [config]
  );

  return { state, start, tick, skip };
}
