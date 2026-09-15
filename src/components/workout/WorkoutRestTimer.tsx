import { useEffect, useRef, useState } from "react";
import {
  elapsedSecondsSince,
  useElapsedSeconds,
} from "@/hooks/useElapsedSeconds";
import { haptic } from "@/lib/haptic";
import {
  restNotificationDelaySeconds,
  scheduleRestEndNotification,
  cancelRestEndNotification,
} from "@/lib/restTimerNotification";
import CompactRestTimer from "./CompactRestTimer";

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.frequency.value = 523;
    osc2.frequency.value = 659;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc2.onended = () => {
      void ctx.close().catch(() => {});
    };
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.15);
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.8);
  } catch {
    // AudioContext may not be available.
  }
}

/** One mounted instance per rest. Timer ticks and extensions stay inside
 * this row; only starting/ending a rest updates the workout editor. */
export default function WorkoutRestTimer({
  startedAt,
  initialTarget,
  exerciseName,
  onStop,
}: {
  startedAt: number;
  initialTarget: number;
  exerciseName?: string;
  onStop: () => void;
}) {
  const seconds = useElapsedSeconds(startedAt);
  const [target, setTarget] = useState(initialTarget);
  const chimeFired = useRef(false);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        const delay = restNotificationDelaySeconds({
          isResting: true,
          elapsedSeconds: elapsedSecondsSince(startedAt),
          targetSeconds: target,
          chimeFired: chimeFired.current,
        });
        if (delay !== null)
          void scheduleRestEndNotification(delay, exerciseName);
      } else {
        void cancelRestEndNotification();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void cancelRestEndNotification();
    };
  }, [startedAt, target, exerciseName]);

  useEffect(() => {
    if (seconds >= target && !chimeFired.current) {
      chimeFired.current = true;
      haptic([200, 100, 200]);
      playChime();
    }
  }, [seconds, target]);

  return (
    <CompactRestTimer
      seconds={seconds}
      target={target}
      onStop={onStop}
      onExtend={(extra) => {
        // Re-arm an expired rest, without carrying its extension to the next.
        if (elapsedSecondsSince(startedAt) >= target)
          chimeFired.current = false;
        setTarget((value) => value + extra);
      }}
    />
  );
}
