/**
 * A lift's rest, seen from outside the app (Mob2 call 1, lifting finding
 * 7): lifters lock the phone or switch apps between sets.
 *
 * - On the web, the page's title counts the rest down ("1:23 rest", then
 *   "Rest over"), so the browser's tab and the app switcher show it. Its
 *   own clock keeps going while the page is hidden, which the screen's
 *   repaint pulse does not (`useElapsedSeconds`), and it reads the time
 *   left from the rest's start each tick, so a throttled timer is late,
 *   never wrong. The title goes back as the rest ends.
 * - On the phone, the lock screen's Live Activity (`restLiveActivity.ts`).
 *   NATIVE HALF DEFERRED: until its widget extension is built in Xcode
 *   it shows nothing. Loaded only on a phone, so the web never fetches
 *   it. The rest-end notification (`restTimerNotification.ts`) is
 *   separate and already works there.
 */
import { isNativePlatform } from "@/lib/platform";
import { elapsedSecondsSince } from "@/hooks/useElapsedSeconds";
import { formatClock } from "@/utils/formatters";

/** The rest shown now, if any: a rest made longer replaces itself, and
 *  the end of the one it replaced must not take the new one away. */
let shown: object | null = null;

/** The page's title while a rest runs. */
export function restTitle(secondsLeft: number): string {
  return secondsLeft > 0 ? `${formatClock(secondsLeft)} rest` : "Rest over";
}

/**
 * Shows a rest outside the app until the returned function is called: the
 * page's title, and on a phone the lock screen. Called again for the same
 * rest made longer, it shows the new end.
 */
export function showRestOutside(rest: {
  startedAt: number;
  /** The rest's length, in seconds. */
  target: number;
  exerciseName?: string;
}): () => void {
  const before = document.title;
  const show = () => {
    document.title = restTitle(
      rest.target - elapsedSecondsSince(rest.startedAt)
    );
  };
  show();
  const timer = setInterval(show, 1000);
  const token = {};
  shown = token;
  const native = isNativePlatform()
    ? import("@/lib/restLiveActivity").catch(() => null)
    : null;
  void native?.then((activity) => {
    if (shown === token)
      void activity?.startRestActivity({
        endsAt: rest.startedAt + rest.target * 1000,
        exerciseName: rest.exerciseName,
      });
  });
  return () => {
    clearInterval(timer);
    document.title = before;
    if (shown !== token) return;
    shown = null;
    void native?.then((activity) => {
      // A rest shown since takes this one's place itself.
      if (shown === null) void activity?.endRestActivity();
    });
  };
}
