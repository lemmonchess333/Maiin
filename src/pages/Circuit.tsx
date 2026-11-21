import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import CircuitFinish from "@/components/circuit/CircuitFinish";
import CircuitPicker from "@/components/circuit/CircuitPicker";
import CircuitRunner from "@/components/circuit/CircuitRunner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { builtInCircuits } from "@/features/circuit/builtInCircuits";
import {
  CIRCUIT_DONE_CUE,
  CIRCUIT_SWITCH_CUE,
  circuitEndLine,
} from "@/features/circuit/circuitCopy";
import {
  CIRCUIT_HISTORY_WORKOUTS,
  circuitForToday,
  circuitReward,
  lastTimeOf,
  savedCircuits,
  type DatedCircuit,
} from "@/features/circuit/circuitHistory";
import { circuitKit } from "@/features/circuit/circuitMoves";
import { circuitCounts } from "@/features/circuit/circuitRules";
import {
  CIRCUIT_SESSION_START,
  circuitClockRuns,
  stepCircuitSession,
} from "@/features/circuit/circuitSession";
import {
  circuitProgress,
  circuitSegments,
  circuitSteps,
  circuitSwitchAt,
  stepEndsPassed,
  stepSecondsRan,
} from "@/features/circuit/circuitSteps";
import type { Circuit as CircuitShape } from "@/features/circuit/circuitTypes";
import { useAudioCues } from "@/hooks/useAudioCues";
import { useRunTimer } from "@/hooks/useRunTimer";
import { useSessionPlayer } from "@/hooks/useSessionPlayer";
import { useWakeLock } from "@/hooks/useWakeLock";
import { createWorkoutCompletionId } from "@/hooks/useWorkoutDraft";
import { useAuth } from "@/lib/auth";
import { useBackDismiss } from "@/lib/backDismiss";
import { completeCircuit } from "@/lib/circuitCompletion";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import type { SessionShareAction } from "@/lib/sessionPost";
import { toast } from "@/lib/toast";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";

/** How long the picker waits for the circuit history before offering the
 *  circuits at their first rung. Tropos heuristic: offline, the read can
 *  hang, and a circuit should never wait on it. */
const HISTORY_WAIT_MS = 4000;

/** The person's recent circuits: still being read, read (newest first),
 *  or unknown, when the read failed or outlasted the wait. Unknown is not
 *  none: it offers each circuit at its first rung, marked so that the
 *  ladder leaves it out once saved, and never a first circuit's reward. */
type CircuitHistory =
  | { status: "reading" }
  | { status: "unknown" }
  | { status: "read"; circuits: DatedCircuit[] };

/**
 * Circuit mode (Circ1): pick one of your six built-in circuits, run it on
 * the clock, say how it felt, save it as a workout. Full screen, without
 * the tab bar, as a run is.
 *
 * Each circuit is offered at the rung its history steers it to (Circ1
 * (7)). The timer is the run's: `useRunTimer` keeps a clock that pauses,
 * and `useSessionPlayer` walks the circuit's steps as a run's segments
 * (Circ1 (10)). Each step ends on the clock, not on the tick that noticed
 * (`stepEndsPassed`), so a step that ended while the screen looked away
 * ends on time. Back from away with more than one step gone, the circuit
 * pauses where it was left and none of the time away counts: nobody was
 * following it, so a circuit left in the background is never finished.
 * What was done is measured from the seconds each step really ran, so
 * skipping to the end is not finishing. The states are
 * `circuitSession.ts`'s.
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

  const [history, setHistory] = useState<CircuitHistory>({
    status: "reading",
  });
  // Until a circuit is chosen, a read that lands after the wait replaces
  // the wait's answer: the offers move to their rungs. Once one is chosen,
  // the history it was chosen from stands.
  const pickingRef = useRef(true);
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let live = true;
    const unknown = () => {
      if (live)
        setHistory((current) =>
          current.status === "reading" ? { status: "unknown" } : current
        );
    };
    const wait = window.setTimeout(unknown, HISTORY_WAIT_MS);
    fetchSavedWorkouts(uid, { latest: CIRCUIT_HISTORY_WORKOUTS })
      .then((workouts) => {
        if (live && pickingRef.current)
          setHistory({ status: "read", circuits: savedCircuits(workouts) });
      })
      .catch((error) => {
        logger.warn("[Circuit] history read failed", error);
        unknown();
      });
    return () => {
      live = false;
      window.clearTimeout(wait);
    };
  }, [uid]);

  const offers = useMemo(
    () =>
      history.status === "reading"
        ? null
        : builtInCircuits({ kit, injuries }).map((base) => {
            const known = history.status === "read" ? history.circuits : null;
            return {
              circuit: circuitForToday(base, known, injuries),
              last: known ? lastTimeOf(base.id, known) : null,
            };
          }),
    [history, kit, injuries]
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
  const { rehydrate: setClock, recalcNow } = timer;
  const player = useSessionPlayer(segments, "manual");
  const [voice, setVoice] = useState(true);
  const audio = useAudioCues(voice, "off");
  const wakeLock = useWakeLock({ onNative: true });
  const [completionId] = useState(createWorkoutCompletionId);
  const [share, setShare] = useState<SessionShareAction | null>(null);
  const startedAtRef = useRef(0);
  // The session clock at the last tick the player was given: with the
  // player's seconds into its step, where that step began.
  const lastTickRef = useRef(0);

  const { phase } = session;
  const running = circuitClockRuns(phase);

  const choose = useCallback(
    (chosen: CircuitShape) => {
      audio.prime();
      haptic("light");
      startedAtRef.current = Date.now();
      lastTickRef.current = 0;
      pickingRef.current = false;
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
  // where the clock is. While the page is hidden nothing moves on; the
  // way back judges the time away. One step ended meanwhile (a glance at
  // a message) ends on time; more than one, and the circuit pauses at the
  // last second it was followed, with the clock put back there.
  useEffect(() => {
    if (!running || document.visibilityState === "hidden") return;
    const { index, phaseElapsed } = player.state;
    if (index < 0 || index >= stepSeconds.length) return;
    const stepStartedAt = lastTickRef.current - phaseElapsed;
    const ends = stepEndsPassed(
      stepSeconds,
      index,
      stepStartedAt,
      timer.elapsed
    );
    if (ends.length > 1) {
      setClock({ accumulatedSeconds: lastTickRef.current, isRunning: false });
      void wakeLock.release();
      dispatch({ type: "pause" });
      return;
    }
    for (const end of ends) player.skip(end, 0);
    player.tick(timer.elapsed, 0);
    lastTickRef.current = timer.elapsed;
  }, [running, timer.elapsed, player, stepSeconds, setClock, wakeLock]);

  // Back on the page, the clock is read at once rather than on its next
  // second, so the time away is judged before anything is drawn.
  useEffect(() => {
    if (!running) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") recalcNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [running, recalcNow]);

  // Each step says itself as it starts; a one-sided move says when to
  // switch, once, halfway.
  const spokenIndexRef = useRef(-1);
  const switchedIndexRef = useRef(-1);
  useEffect(() => {
    const { index, phaseElapsed } = player.state;
    if (index < 0 || player.isComplete) return;
    if (index !== spokenIndexRef.current) {
      spokenIndexRef.current = index;
      const segment = player.current;
      if (segment?.cue) audio.speak(segment.cue);
      if (segment?.type === "hard" || segment?.type === "recovery")
        haptic("medium");
      return;
    }
    const switchAt = steps[index] ? circuitSwitchAt(steps[index]) : null;
    if (
      switchAt !== null &&
      phaseElapsed >= switchAt &&
      switchedIndexRef.current !== index
    ) {
      switchedIndexRef.current = index;
      audio.speak(CIRCUIT_SWITCH_CUE);
      haptic("light");
    }
  }, [player, audio, steps]);

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

  // The count in is not part of the circuit's minutes (Circ1 (K)), and
  // neither is any clock past the last step's end: a clock that jumps past
  // it is time after the circuit.
  const starts = player.checkpoint?.segmentStarts;
  const countInEnd = starts?.[1]?.elapsed;
  const clockEnd = Math.min(
    timer.elapsed,
    starts?.[steps.length]?.elapsed ?? timer.elapsed
  );
  const activeSeconds =
    countInEnd === undefined ? 0 : Math.max(0, clockEnd - countInEnd);
  const saves = circuitCounts(activeSeconds);

  // What was done: only the work each step really ran.
  const progress = useMemo(
    () =>
      circuit
        ? circuitProgress(
            circuit,
            steps,
            stepSecondsRan(starts ?? [], steps.length, timer.elapsed)
          )
        : null,
    [circuit, steps, starts, timer.elapsed]
  );

  // The screen is held on only while the clock runs.
  const pause = () => {
    timer.pause();
    void wakeLock.release();
    dispatch({ type: "pause" });
  };
  const resume = () => {
    timer.resume();
    void wakeLock.request();
    dispatch({ type: "resume" });
  };
  const askEnd = () => {
    timer.pause();
    void wakeLock.release();
    dispatch({ type: "askEnd" });
  };
  const keepGoing = () => {
    timer.resume();
    void wakeLock.request();
    dispatch({ type: "keepGoing" });
  };
  const askDiscard = () => dispatch({ type: "askDiscard" });
  // Back (the browser's, or a phone's) asks before it leaves anything
  // unsaved, as the buttons do: during a circuit, whether to end it; on a
  // finish that saves, whether to discard it; and while it saves, it
  // waits. Sticky, so a second back after Keep going or Cancel asks
  // again. A finish under 7 minutes keeps nothing, so Back just leaves.
  const unsaved = saves && (phase === "finish" || phase === "saving");
  useBackDismiss(
    phase === "running" || phase === "paused" || unsaved,
    () => {
      if (phase === "running" || phase === "paused") askEnd();
      else if (phase === "finish") askDiscard();
    },
    { sticky: true }
  );
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
      const receipt = await completeCircuit({
        uid: user.uid,
        completionId,
        startedAt: startedAtRef.current,
        circuit,
        outcome: {
          intervalsDone: progress.intervalsDone,
          roundsDone: progress.roundsDone,
          workSecondsDone: progress.workSecondsDone,
          activeSeconds,
          finished: progress.complete,
          effort: session.effort,
        },
        bodyweightKg: profile?.weightKg ?? 0,
        author: {
          displayName: profile?.displayName,
          photoURL: profile?.photoURL,
        },
      });
      // The finish stays, saved, with its post (Circ1 (11)): shared on the
      // person's standing answer, or the one question.
      setShare(receipt.share);
      dispatch({ type: "saved", workoutId: receipt.workoutId });
      toast.success(
        receipt.syncStatus === "queued"
          ? "Circuit saved. It syncs when you’re back online."
          : "Circuit saved"
      );
    } catch (error) {
      logger.warn("[Circuit] save failed", error);
      dispatch({ type: "failed", error: "Couldn’t save. Try again." });
    }
  };

  if (!circuit || phase === "picking")
    return (
      <CircuitPicker
        offers={offers}
        kit={kit}
        onChoose={choose}
        onClose={() => navigate("/program", { replace: true })}
      />
    );

  if (
    phase === "finish" ||
    phase === "discarding" ||
    phase === "saving" ||
    phase === "saved"
  )
    return (
      <>
        <CircuitFinish
          circuit={circuit}
          finished={progress?.complete ?? false}
          roundsDone={progress?.roundsDone ?? 0}
          activeSeconds={activeSeconds}
          saves={saves}
          reward={
            history.status === "read" ? circuitReward(history.circuits) : null
          }
          effort={session.effort}
          saving={phase === "saving" || phase === "saved"}
          share={phase === "saved" ? share : null}
          error={session.error}
          onRate={(effort) => dispatch({ type: "rate", effort })}
          onSave={() => void save()}
          onDiscard={askDiscard}
          onClose={leave}
          onDone={() => navigate("/program", { replace: true })}
        />
        <ConfirmDialog
          open={phase === "discarding"}
          title="Discard this circuit?"
          description="This can’t be undone."
          confirmLabel="Discard"
          destructive
          onConfirm={leave}
          onCancel={() => dispatch({ type: "keep" })}
        />
      </>
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
