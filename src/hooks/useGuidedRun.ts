import { useState, useEffect, useRef } from "react";
import type { GuidedRunWorkout, RunSegment } from "@/lib/guidedRun";

interface GuidedRunState {
  currentSegmentIndex: number;
  timeRemaining: number;
  segmentProgress: number;
  totalProgress: number;
  totalElapsed: number;
  isComplete: boolean;
  currentSegment: RunSegment | null;
  nextSegment: RunSegment | null;
}

function speak(text: string) {
  if (!window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const enGB = voices.find((v) => v.lang.startsWith("en-GB"));
  if (enGB) utter.voice = enGB;
  window.speechSynthesis.speak(utter);
}

export function useGuidedRun(workout: GuidedRunWorkout | null, isRunning: boolean) {
  const [state, setState] = useState<GuidedRunState>({
    currentSegmentIndex: 0,
    timeRemaining: 0,
    segmentProgress: 0,
    totalProgress: 0,
    totalElapsed: 0,
    isComplete: false,
    currentSegment: null,
    nextSegment: null,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spokenRef = useRef(-1);
  /** Epoch ms when the current segment started */
  const segStartRef = useRef(0);
  /** Accumulated seconds elapsed before the current segment */
  const elapsedBeforeSegRef = useRef(0);
  /** Accumulated pause time (ms) to subtract from Date.now() diffs */
  const pausedAtRef = useRef<number | null>(null);
  const pauseAccumRef = useRef(0);

  const totalDuration = workout
    ? workout.segments.reduce((s, seg) => s + seg.durationSeconds, 0)
    : 0;

  // Initialize
  useEffect(() => {
    if (!workout) return;
    const init = () => {
      setState({
        currentSegmentIndex: 0,
        timeRemaining: workout.segments[0]?.durationSeconds ?? 0,
        segmentProgress: 0,
        totalProgress: 0,
        totalElapsed: 0,
        isComplete: false,
        currentSegment: workout.segments[0] ?? null,
        nextSegment: workout.segments[1] ?? null,
      });
      spokenRef.current = -1;
      segStartRef.current = 0;
      elapsedBeforeSegRef.current = 0;
      pausedAtRef.current = null;
      pauseAccumRef.current = 0;
    };
    init();
  }, [workout]);

  // Track pause/resume via isRunning so Date.now() diffs stay accurate
  useEffect(() => {
    if (!isRunning) {
      if (pausedAtRef.current === null) pausedAtRef.current = Date.now();
    } else {
      if (pausedAtRef.current !== null) {
        pauseAccumRef.current += Date.now() - pausedAtRef.current;
        pausedAtRef.current = null;
      }
    }
  }, [isRunning]);

  // Tick — use ref for isComplete to avoid re-creating interval on state change
  const isCompleteRef = useRef(false);
  useEffect(() => { isCompleteRef.current = state.isComplete; }, [state.isComplete]);

  useEffect(() => {
    if (!workout || !isRunning || isCompleteRef.current) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Seed segment start time on first tick
    if (segStartRef.current === 0) {
      segStartRef.current = Date.now();
    }

    timerRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.isComplete || !workout) return prev;

        const seg = workout.segments[prev.currentSegmentIndex];
        if (!seg) return { ...prev, isComplete: true };

        // Use Date.now() for accurate timing even after background throttling
        const now = Date.now();
        const segElapsed = (now - segStartRef.current - pauseAccumRef.current) / 1000;
        const newTotalElapsed = elapsedBeforeSegRef.current + segElapsed;
        const newRemaining = Math.max(0, seg.durationSeconds - segElapsed);
        const segProgress = Math.min(1, segElapsed / seg.durationSeconds);
        const totalProg = Math.min(1, newTotalElapsed / totalDuration);

        // TTS on segment start
        if (spokenRef.current !== prev.currentSegmentIndex) {
          spokenRef.current = prev.currentSegmentIndex;
          speak(`${seg.label}. ${seg.instruction}`);
        }

        if (newRemaining <= 0) {
          // Move to next segment
          const nextIdx = prev.currentSegmentIndex + 1;
          elapsedBeforeSegRef.current += seg.durationSeconds;

          if (nextIdx >= workout.segments.length) {
            speak("Workout complete. Great job!");
            return { ...prev, isComplete: true, totalProgress: 1, segmentProgress: 1, timeRemaining: 0, totalElapsed: Math.floor(newTotalElapsed) };
          }

          const nextSeg = workout.segments[nextIdx];
          segStartRef.current = now;
          pauseAccumRef.current = 0;
          spokenRef.current = -1; // Reset so next segment gets spoken
          return {
            currentSegmentIndex: nextIdx,
            timeRemaining: nextSeg.durationSeconds,
            segmentProgress: 0,
            totalProgress: totalProg,
            totalElapsed: Math.floor(newTotalElapsed),
            isComplete: false,
            currentSegment: nextSeg,
            nextSegment: workout.segments[nextIdx + 1] ?? null,
          };
        }

        return {
          ...prev,
          timeRemaining: Math.floor(newRemaining),
          segmentProgress: segProgress,
          totalProgress: totalProg,
          totalElapsed: Math.floor(newTotalElapsed),
        };
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [workout, isRunning, totalDuration]);

  return state;
}
