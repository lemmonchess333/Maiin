import { useEffect, useLayoutEffect, useRef } from "react";
import type { WatchRunPhase } from "@/lib/watchRunBridge";

/** About once a second while running: the Watch's clock and distance. */
export const WATCH_RUNNING_BEAT_MS = 1_000;
/** While paused nothing moves, but the Watch greys its controls after 15 s
 *  without word from the phone, so a heartbeat keeps them live. */
export const WATCH_PAUSED_BEAT_MS = 5_000;

/**
 * Publishes the Watch's run snapshot on a steady beat rather than on every
 * render: at once when the phase or session changes, then every second while
 * running and every five while paused. A render never publishes, and
 * `publish` is read when the beat fires, so it always sends the latest
 * figures without restarting the beat.
 */
export function useWatchSnapshotBeat(
  phase: WatchRunPhase | null,
  sessionId: string | null,
  publish: () => void
): void {
  const publishRef = useRef(publish);
  useLayoutEffect(() => {
    publishRef.current = publish;
  });
  useEffect(() => {
    if (!sessionId || (phase !== "running" && phase !== "paused")) return;
    const beat = () => publishRef.current();
    beat();
    const id = setInterval(
      beat,
      phase === "running" ? WATCH_RUNNING_BEAT_MS : WATCH_PAUSED_BEAT_MS
    );
    return () => clearInterval(id);
  }, [phase, sessionId]);
}
