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

  const totalDuration = workout
    ? workout.segments.reduce((s, seg) => s + seg.durationSeconds, 0)
    : 0;

  // Initialize
  useEffect(() => {
    if (!workout) return;
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
  }, [workout]);

  // Tick
  useEffect(() => {
    if (!workout || !isRunning || state.isComplete) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.isComplete || !workout) return prev;

        const seg = workout.segments[prev.currentSegmentIndex];
        if (!seg) return { ...prev, isComplete: true };

        const newRemaining = prev.timeRemaining - 1;
        const newTotalElapsed = prev.totalElapsed + 1;
        const elapsed = seg.durationSeconds - newRemaining;
        const segProgress = elapsed / seg.durationSeconds;
        const totalProg = newTotalElapsed / totalDuration;

        // TTS on segment start
        if (spokenRef.current !== prev.currentSegmentIndex) {
          spokenRef.current = prev.currentSegmentIndex;
          speak(`${seg.label}. ${seg.instruction}`);
        }

        if (newRemaining <= 0) {
          // Move to next segment
          const nextIdx = prev.currentSegmentIndex + 1;
          if (nextIdx >= workout.segments.length) {
            speak("Workout complete. Great job!");
            return { ...prev, isComplete: true, totalProgress: 1, segmentProgress: 1, timeRemaining: 0, totalElapsed: newTotalElapsed };
          }

          const nextSeg = workout.segments[nextIdx];
          spokenRef.current = -1; // Reset so next segment gets spoken
          return {
            currentSegmentIndex: nextIdx,
            timeRemaining: nextSeg.durationSeconds,
            segmentProgress: 0,
            totalProgress: totalProg,
            totalElapsed: newTotalElapsed,
            isComplete: false,
            currentSegment: nextSeg,
            nextSegment: workout.segments[nextIdx + 1] ?? null,
          };
        }

        return {
          ...prev,
          timeRemaining: newRemaining,
          segmentProgress: segProgress,
          totalProgress: totalProg,
          totalElapsed: newTotalElapsed,
        };
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [workout, isRunning, state.isComplete, totalDuration]);

  return state;
}
