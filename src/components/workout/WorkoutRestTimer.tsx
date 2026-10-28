import { useEffect, useEffectEvent, useRef, useState } from "react";
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
import { formatClock } from "@/utils/formatters";
import { showRestOutside } from "@/lib/restOutside";
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
 * this row; only starting/ending a rest updates the workout editor.
 *
 * A screen reader hears the rest begin ("Rest, 1:30") and end ("Rest
 * over"), and nothing in between: the countdown is plain text that ticks
 * every second, and the end is otherwise a buzz and a chime. The words go
 * to the session's live region through `onAnnounce`, since a region that
 * arrives with the card, its words already in it, is often not read at
 * all. A rest that goes takes its words with it. */
export default function WorkoutRestTimer({
  startedAt,
  initialTarget,
  exerciseName,
  onStop,
  onAnnounce,
}: {
  startedAt: number;
  initialTarget: number;
  exerciseName?: string;
  onStop: () => void;
  onAnnounce?: (words: string) => void;
}) {
  const seconds = useElapsedSeconds(startedAt);
  const [target, setTarget] = useState(initialTarget);
  const chimeFired = useRef(false);

  const announce = useEffectEvent((words: string) => onAnnounce?.(words));
  useEffect(() => {
    announce(
      `Rest, ${formatClock(initialTarget - elapsedSecondsSince(startedAt))}`
    );
    return () => announce("");
  }, [initialTarget, startedAt]);

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
        // A rest that ended while the app was away has said so already,
        // on the lock screen or in the tab's title: coming back to it
        // does not sound it again.
        if (!chimeFired.current && elapsedSecondsSince(startedAt) >= target) {
          chimeFired.current = true;
          announce("Rest over");
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void cancelRestEndNotification();
    };
  }, [startedAt, target, exerciseName]);

  // The rest outside the app: the tab's title, and the lock screen.
  useEffect(
    () => showRestOutside({ startedAt, target, exerciseName }),
    [startedAt, target, exerciseName]
  );

  useEffect(() => {
    if (seconds >= target && !chimeFired.current) {
      chimeFired.current = true;
      haptic([200, 100, 200]);
      playChime();
      announce("Rest over");
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
