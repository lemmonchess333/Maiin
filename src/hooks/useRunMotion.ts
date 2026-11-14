import { useEffect, useState } from "react";
import {
  EMPTY_MOTION,
  foldMotion,
  type MotionReading,
} from "@/lib/runAutoPause";
import { startRunMotion } from "@/lib/runMotionSource";

/**
 * The phone's motion sensors for one run's auto-pause, folded into one
 * reading (runAutoPause.ts). The sensors run while `sessionId` is set and
 * stop when it clears or changes, so a reading never carries from one run
 * to the next. Null until the first sample, and always on the web, where
 * there is no motion source and auto-pause reads GPS alone.
 */
export function useRunMotion(sessionId: string | null): MotionReading | null {
  const [held, setHeld] = useState<{
    sessionId: string;
    reading: MotionReading;
  } | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let stop: (() => void) | null = null;
    let reading = EMPTY_MOTION;
    void startRunMotion((sample) => {
      if (disposed) return;
      reading = foldMotion(reading, sample);
      setHeld({ sessionId, reading });
    }).then((stopSource) => {
      if (disposed) stopSource();
      else stop = stopSource;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [sessionId]);
  return held && held.sessionId === sessionId ? held.reading : null;
}
