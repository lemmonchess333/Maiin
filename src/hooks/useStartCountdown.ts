import { useEffect, useEffectEvent, useRef, useState } from "react";

/**
 * Run27 (1): Start counts down 3-2-1 before a run, and a tap skips it.
 * Strava's watch app, Apple Workout and Nike Run Club all count down and
 * let you skip (the Run27 row); three seconds is theirs.
 */
export const START_COUNTDOWN_MS = 3000;

export interface StartCountdown {
  /** The second on screen while counting (3, 2, then 1); null otherwise. */
  seconds: number | null;
  /** Start counting, from now. */
  begin: () => void;
  /** Go now, once: the tap that skips the rest. */
  skip: () => void;
}

/**
 * The countdown before a run's clock. `onGo` is called once, with the
 * instant of Go: when the last second runs out, or at the tap that skips
 * it. Nothing runs while it counts but the seconds on screen, and leaving
 * the screen stops it without a Go.
 *
 * Every second and Go are set from the moment counting begins, so a render
 * that runs late moves none of them. A timer the phone held while the app
 * was behind goes when it fires, so the clock that starts at Go never
 * counts time the person did not see.
 */
export function useStartCountdown(onGo: (at: number) => void): StartCountdown {
  const [count, setCount] = useState<{ endsAt: number; now: number } | null>(
    null
  );
  // Read only in the timers and the tap: whether a Go is still owed, so a
  // tap and the last second running out together go once.
  const owedRef = useRef(false);
  const fire = (at: number) => {
    if (!owedRef.current) return;
    owedRef.current = false;
    setCount(null);
    onGo(at);
  };
  const go = useEffectEvent(fire);

  const endsAt = count?.endsAt ?? null;
  useEffect(() => {
    if (endsAt === null) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (moment: number, then: () => void) =>
      timers.push(setTimeout(then, Math.max(0, moment - Date.now())));
    // Each whole second on screen, then Go.
    for (let left = START_COUNTDOWN_MS - 1000; left > 0; left -= 1000)
      at(endsAt - left, () => setCount({ endsAt, now: Date.now() }));
    at(endsAt, () => go(Date.now()));
    return () => timers.forEach(clearTimeout);
  }, [endsAt]);

  useEffect(
    () => () => {
      owedRef.current = false;
    },
    []
  );

  return {
    seconds: count
      ? Math.min(
          START_COUNTDOWN_MS / 1000,
          Math.max(1, Math.ceil((count.endsAt - count.now) / 1000))
        )
      : null,
    begin: () => {
      const now = Date.now();
      owedRef.current = true;
      setCount({ endsAt: now + START_COUNTDOWN_MS, now });
    },
    skip: () => fire(Date.now()),
  };
}
