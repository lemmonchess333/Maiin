/**
 * The Node clock for server code a spec runs in its own process.
 *
 * A journey moves the browser's day with `page.clock.setFixedTime`. The
 * callables it routes into their real handlers (`realCallables.ts`) run here,
 * in the Playwright process, and read the time themselves:
 * `applyProgramCommand` stamps each command with `Date.now()`. Left on the
 * real clock, a command sent on a simulated Thursday ten weeks ahead would be
 * judged against today. So the journey moves this clock with the browser's.
 *
 * `Date` is replaced once, by the real `Date` behind a proxy whose "now" is
 * the real time plus an offset: `Date.now()`, `new Date()` and `Date()`.
 * Everything else is the real `Date`, so `instanceof Date` holds for every
 * date, whenever it was made, and the Admin SDK sees a date as a date.
 *
 * Playwright's own waits read `performance.now()`, not `Date`, so moving
 * this clock doesn't move a test's timeouts.
 *
 * An ID token is checked against "now": the Auth emulator mints it at the
 * real time, so `verifyIdToken` runs inside `onRealClock`.
 */

const RealDate = Date;
let offsetMs = 0;
/** Open `onRealClock` calls: while any is open, "now" is the real time. */
let onReal = 0;

function now(): number {
  return RealDate.now() + (onReal > 0 ? 0 : offsetMs);
}

const ShiftedDate = new Proxy(RealDate, {
  construct(target, args, newTarget) {
    return Reflect.construct(
      target,
      args.length === 0 ? [now()] : args,
      newTarget
    );
  },
  apply() {
    return new RealDate(now()).toString();
  },
  get(target, property, receiver) {
    if (property === "now") return now;
    return Reflect.get(target, property, receiver);
  },
});

let installed = false;

/** Replaces `Date` in this process, once. */
export function installNodeClock(): void {
  if (installed) return;
  globalThis.Date = ShiftedDate;
  installed = true;
}

/** Sets this process's clock to `at`, from where it runs on as normal. */
export function setNodeClock(at: Date | number): void {
  installNodeClock();
  offsetMs = (typeof at === "number" ? at : at.getTime()) - RealDate.now();
}

/** The real time, however this process's clock is set. */
export function realNow(): number {
  return RealDate.now();
}

/** Puts this process back on the real clock. */
export function resetNodeClock(): void {
  offsetMs = 0;
}

/** Runs `fn` with this process on the real clock, for the checks that
 *  compare against the moment something was really made, such as an ID
 *  token's expiry. Other code that runs meanwhile reads the real clock
 *  too. */
export async function onRealClock<T>(fn: () => Promise<T>): Promise<T> {
  onReal += 1;
  try {
    return await fn();
  } finally {
    onReal -= 1;
  }
}
