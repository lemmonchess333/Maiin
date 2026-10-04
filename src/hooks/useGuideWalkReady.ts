import { useEffect, useState } from "react";

/** How often to look, and when to stop. The launch animation can hold the
 *  screen for up to ten seconds on a slow start (LaunchSplash). */
const LOOK_EVERY_MS = 150;
const GIVE_UP_MS = 12_000;

export type GuideWalkReadiness = "waiting" | "ready" | "gave-up";

/**
 * Whether Home can show the first-visit walk yet (FV1): its first target is
 * drawn with a size, and the launch animation has left the screen (it
 * exposes no signal of its own; its overlay leaving is the signal). Gives
 * up after a while, so a walk that can't start stops holding back what
 * waits for it (the Health steps prompt).
 *
 * Under jsdom nothing has a size, so the walk never becomes ready in a
 * unit test that doesn't draw one; GuideWalk's own tests give theirs a
 * size.
 */
export function useGuideWalkReady(
  enabled: boolean,
  target: string | undefined
): GuideWalkReadiness {
  const [state, setState] = useState<GuideWalkReadiness>("waiting");

  useEffect(() => {
    if (!enabled || !target || state !== "waiting") return;
    const started = Date.now();
    const look = () => {
      const covered = document.querySelector("[data-launch-splash]");
      const el = document.querySelector(`[data-guide-stop="${target}"]`);
      const r = el?.getBoundingClientRect();
      if (!covered && r && r.width > 0 && r.height > 0) {
        setState("ready");
        return true;
      }
      if (Date.now() - started > GIVE_UP_MS) {
        setState("gave-up");
        return true;
      }
      return false;
    };
    const t = window.setInterval(() => {
      if (look()) window.clearInterval(t);
    }, LOOK_EVERY_MS);
    return () => window.clearInterval(t);
  }, [enabled, target, state]);

  return enabled ? state : "waiting";
}
