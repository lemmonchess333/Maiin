/**
 * A session's own page (TrainWk1 call 2): a lift's and a run's, each at
 * its own address under Train.
 *
 * The lift's is its day in the plan's week, numbered as Train's `?day=`
 * is (0 for the week's first lift). The run's is its date, as Train's
 * `?rday=` is, since a run keeps its day and a day holds one planned run.
 * `App.tsx` declares the two routes; `sessionPages.test.ts` holds them to
 * these addresses.
 */

/** A lift's page: `/program/lift/2` for the week's third lift. */
export function liftSessionPath(dayIndex: number): string {
  return `/program/lift/${dayIndex}`;
}

/** A run's page: `/program/run/YYYY-MM-DD`, by its local date. */
export function runSessionPath(dateKey: string): string {
  return `/program/run/${dateKey}`;
}

/** Train and the session pages under it: they share one programme engine
 *  (`ProgramEngineRoute`), mounted once for all of them. */
const TRAIN_ENGINE_PATH = /^\/program(?:\/(?:lift|run)\/[^/]+)?\/?$/;

/**
 * The key `Layout` mounts a screen under. A new address is a new screen
 * (`/user/a` to `/user/b` starts fresh), except that Train and its session
 * pages share one key, so the engine they share stays mounted between
 * them: a session opens with the plan already on screen, and a change made
 * on its page is the one Train shows on the way back.
 */
export function layoutKey(pathname: string): string {
  return TRAIN_ENGINE_PATH.test(pathname) ? "/program" : pathname;
}
