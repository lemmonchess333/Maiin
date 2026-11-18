import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import CircuitFinish from "@/components/circuit/CircuitFinish";
import CircuitPicker from "@/components/circuit/CircuitPicker";
import CircuitRunner from "@/components/circuit/CircuitRunner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { builtInCircuits } from "@/features/circuit/builtInCircuits";
import {
  CIRCUIT_DONE_CUE,
  circuitEndLine,
} from "@/features/circuit/circuitCopy";
import { circuitKit } from "@/features/circuit/circuitMoves";
import { circuitCounts } from "@/features/circuit/circuitRules";
import {
  CIRCUIT_SESSION_START,
  stepCircuitSession,
} from "@/features/circuit/circuitSession";
import {
  circuitProgress,
  circuitSegments,
  circuitSteps,
  stepEndsPassed,
} from "@/features/circuit/circuitSteps";
import type { Circuit as CircuitShape } from "@/features/circuit/circuitTypes";
import { useAudioCues } from "@/hooks/useAudioCues";
import { useRunTimer } from "@/hooks/useRunTimer";
import { useSessionPlayer } from "@/hooks/useSessionPlayer";
import { useWakeLock } from "@/hooks/useWakeLock";
import { createWorkoutCompletionId } from "@/hooks/useWorkoutDraft";
import { useAuth } from "@/lib/auth";
import { completeCircuit } from "@/lib/circuitCompletion";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";

/**
 * Circuit mode (Circ1): pick one of your six built-in circuits, run it on
 * the clock, say how it felt, save it as a workout. Full screen, without
 * the tab bar, as a run is.
 *
 * The timer is the run's: `useRunTimer` keeps a clock that pauses, and
 * `useSessionPlayer` walks the circuit's steps as a run's segments (Circ1
 * (10)). Each step ends on the clock, not on the tick that noticed
 * (`stepEndsPassed`), so a circuit whose screen slept picks up where the
 * clock says it is. The states are `circuitSession.ts`'s.
 */
export default function Circuit() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [session, dispatch] = useReducer(
    stepCircuitSession,
    CIRCUIT_SESSION_START
  );
  const kit = circuitKit(profile?.equipment);
  const injuries = profile?.injuries;
  const circuits = useMemo(
    () => builtInCircuits({ kit, injuries }),
    [kit, injuries]
  );

  const circuit = session.circuit;
  const steps = useMemo(
    () => (circuit ? circuitSteps(circuit) : []),
    [circuit]
  );
  const segments = useMemo(
    () => (circuit ? circuitSegments(circuit, steps) : null),
    [circuit, steps]
  );
  const stepSeconds = useMemo(() => steps.map((step) => step.seconds), [steps]);

  const timer = useRunTimer();
  const player = useSessionPlayer(segments, "manual");
  const [voice, setVoice] = useState(true);
  const audio = useAudioCues(voice, "off");
  const wakeLock = useWakeLock({ onNative: true });
  const [completionId] = useState(createWorkoutCompletionId);
  const startedAtRef = useRef(0);
  // The session clock at the last tick the player was given: with the
  // player's seconds into its step, where that step began.
  const lastTickRef = useRef(0);

  const { phase } = session;
  const running = phase === "running";

  const choose = useCallback(
    (chosen: CircuitShape) => {
      audio.prime();
      haptic("light");
      startedAtRef.current = Date.now();
      lastTickRef.current = 0;
      dispatch({ type: "choose", circuit: chosen });
      void wakeLock.request();
    },
    [audio, wakeLock]
  );

  // The player and the clock start once the chosen circuit's segments
  // are in the player.
  useEffect(() => {
    if (phase !== "running" || !segments || player.state.index !== -1) return;
    player.start();
    timer.start();
  }, [phase, segments, player, timer]);

  // Each second: end every step the clock has passed, then tell the player
  // where the clock is.
  useEffect(() => {
    if (!running) return;
    const { index, phaseElapsed } = player.state;
    if (index < 0 || index >= stepSeconds.length) return;
    const stepStartedAt = lastTickRef.current - phaseElapsed;
    for (const end of stepEndsPassed(
      stepSeconds,
      index,
      stepStartedAt,
      timer.elapsed
    ))
      player.skip(end, 0);
    player.tick(timer.elapsed, 0);
    lastTickRef.current = timer.elapsed;
  }, [running, timer.elapsed, player, stepSeconds]);

  // Each step says itself as it starts; the end is said once.
  const spokenIndexRef = useRef(-1);
  useEffect(() => {
    const { index } = player.state;
    if (index < 0 || index === spokenIndexRef.current) return;
    spokenIndexRef.current = index;
    if (player.isComplete) return;
    const segment = player.current;
    if (segment?.cue) audio.speak(segment.cue);
    if (segment?.type === "hard" || segment?.type === "recovery")
      haptic("medium");
  }, [player, audio]);

  // The last step done: the clock stops and the finish takes the screen.
  useEffect(() => {
    if (!player.isComplete || phase === "finish" || phase === "saving") return;
    if (phase !== "running" && phase !== "paused" && phase !== "ending") return;
    timer.pause();
    audio.speak(CIRCUIT_DONE_CUE);
    haptic("medium");
    void wakeLock.release();
    dispatch({ type: "complete" });
  }, [player.isComplete, phase, timer, audio, wakeLock]);

  // The count in is not part of the circuit's minutes (Circ1 (K)).
  const countInEnd = player.checkpoint?.segmentStarts[1]?.elapsed;
  const activeSeconds =
    countInEnd === undefined ? 0 : Math.max(0, timer.elapsed - countInEnd);
  const saves = circuitCounts(activeSeconds);

  const progress = useMemo(
    () =>
      circuit
        ? circuitProgress(
            circuit,
            steps,
            player.state.index,
            player.state.phaseElapsed
          )
        : null,
    [circuit, steps, player.state.index, player.state.phaseElapsed]
  );

  const pause = () => {
    timer.pause();
    dispatch({ type: "pause" });
  };
  const resume = () => {
    timer.resume();
    dispatch({ type: "resume" });
  };
  const askEnd = () => {
    timer.pause();
    dispatch({ type: "askEnd" });
  };
  const keepGoing = () => {
    timer.resume();
    dispatch({ type: "keepGoing" });
  };
  const leave = () => {
    void wakeLock.release();
    dispatch({ type: "discard" });
    navigate("/program", { replace: true });
  };
  const end = () => {
    void wakeLock.release();
    dispatch({ type: "end" });
  };

  const save = async () => {
    if (!circuit || !progress || !user) return;
    dispatch({ type: "save" });
    try {
      const work = player.workPortion(timer.elapsed, 0);
      const receipt = await completeCircuit({
        uid: user.uid,
        completionId,
        startedAt: startedAtRef.current,
        circuit,
        outcome: {
          intervalsDone: progress.intervalsDone,
          roundsDone: progress.roundsDone,
          workSecondsDone: work?.seconds ?? progress.workSecondsDone,
          activeSeconds,
          finished: session.finished,
          effort: session.effort,
        },
        bodyweightKg: profile?.weightKg ?? 0,
      });
      dispatch({ type: "saved", workoutId: receipt.workoutId });
      toast.success(
        receipt.syncStatus === "queued"
          ? "Circuit saved. It syncs when you’re back online."
          : "Circuit saved"
      );
      navigate("/program", { replace: true });
    } catch (error) {
      logger.warn("[Circuit] save failed", error);
      dispatch({ type: "failed", error: "Couldn’t save. Try again." });
    }
  };

  if (!circuit || phase === "picking")
    return (
      <CircuitPicker
        circuits={circuits}
        kit={kit}
        onChoose={choose}
        onClose={() => navigate("/program", { replace: true })}
      />
    );

  if (phase === "finish" || phase === "saving" || phase === "saved")
    return (
      <CircuitFinish
        circuit={circuit}
        finished={session.finished}
        roundsDone={progress?.roundsDone ?? 0}
        activeSeconds={activeSeconds}
        saves={saves}
        effort={session.effort}
        saving={phase !== "finish"}
        error={session.error}
        onRate={(effort) => dispatch({ type: "rate", effort })}
        onSave={() => void save()}
        onClose={leave}
      />
    );

  const index = Math.max(0, Math.min(steps.length - 1, player.state.index));
  const step = steps[index];
  const secondsLeft = Math.max(
    0,
    Math.ceil(step.seconds - player.state.phaseElapsed)
  );
  return (
    <>
      <CircuitRunner
        circuit={circuit}
        step={step}
        secondsLeft={secondsLeft}
        stepDone={
          step.seconds > 0 ? player.state.phaseElapsed / step.seconds : 1
        }
        paused={phase !== "running"}
        voice={voice}
        onPause={pause}
        onResume={resume}
        onSkip={() => player.skip(timer.elapsed, 0)}
        onEnd={askEnd}
        onToggleVoice={() => setVoice((on) => !on)}
      />
      <ConfirmDialog
        open={phase === "ending"}
        title="End circuit?"
        description={circuitEndLine(activeSeconds, saves)}
        confirmLabel={saves ? "End circuit" : "End without saving"}
        cancelLabel="Keep going"
        destructive={!saves}
        onConfirm={saves ? end : leave}
        onCancel={keepGoing}
      />
    </>
  );
}
