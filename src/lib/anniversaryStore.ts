/**
 * Where the account keeps its anniversaries (App1 Q58):
 * `users/{uid}/stats/anniversaries`, one mark a kind (`AnniversaryMark`).
 * Owner-read and owner-written under the rules' `stats` match, and swept
 * with the account (`USER_SUBCOLLECTIONS` holds `stats`).
 *
 * On the account rather than the device, so each anniversary is shown
 * once whichever phone or browser finishes the session that earns it.
 *
 * Deciding which a session earns is `anniversaries.ts`; reading the
 * history it needs is here, and only what the open anniversaries need:
 * every session while a session count is ahead, every run on a run while
 * 1,000 km is, and the newest few once the year's day has come. An
 * account with all four marked reads one document a finish.
 */
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { setDocGuarded } from "./firestoreWrite";
import { logger } from "./logger";
import { fetchSavedRuns, type SavedRun } from "./savedRuns";
import { fetchSavedWorkouts } from "./savedWorkouts";
import {
  ANNIVERSARY_KINDS,
  anniversariesToCheck,
  priorTally,
  settleAnniversaries,
  unshownAnniversaries,
  type AnniversaryKind,
  type AnniversaryMark,
  type AnniversaryMarks,
  type FinishedSession,
  type PriorTally,
} from "./anniversaries";

const marksRef = (uid: string) =>
  doc(db, "users", uid, "stats", "anniversaries");

/** The newest sessions of each kind read for the year's day: enough to
 *  find the latest that counts past a run saved anyway or two. */
const NEWEST = 5;

function marksOf(data: unknown): AnniversaryMarks {
  const marks: AnniversaryMarks = {};
  if (!data || typeof data !== "object") return marks;
  for (const kind of ANNIVERSARY_KINDS) {
    const raw = (data as Record<string, unknown>)[kind];
    if (!raw || typeof raw !== "object") continue;
    const { day, shown } = raw as { day?: unknown; shown?: unknown };
    marks[kind] = {
      day: typeof day === "string" ? day : null,
      shown: shown === true,
    };
  }
  return marks;
}

/** One anniversary due to be shown: what earned it and on which day. */
export interface DueAnniversary {
  kind: AnniversaryKind;
  day: string;
  /** The day counting began, for "since": the first session, or the
   *  first run for kilometres, or the account's start for a year. */
  since: string | null;
}

/**
 * The anniversaries this finished session leaves to show, after recording
 * what it decided: those it earned, and any earned earlier that never
 * drew. Nothing, and nothing recorded, offline or when a read fails: a
 * read answered from this phone's cache could miss sessions, and an
 * anniversary is never decided on a guess.
 *
 * `runs`, when the caller already holds every saved run (the run finish
 * does), saves reading them again.
 */
export async function anniversariesAfter(
  uid: string,
  session: FinishedSession,
  {
    startDay,
    runs: heldRuns,
  }: { startDay: string | null; runs?: readonly SavedRun[] | null }
): Promise<DueAnniversary[]> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return [];
  try {
    const snap = await getDoc(marksRef(uid));
    const marks = marksOf(snap.exists() ? snap.data() : null);
    const check = anniversariesToCheck(marks, session, startDay);
    let before: PriorTally | null = null;
    if (check.sessions || check.metres || check.year) {
      const wholeWorkouts = check.sessions;
      const wholeRuns = check.sessions || check.metres;
      const [workouts, runs] = await Promise.all([
        wholeWorkouts
          ? fetchSavedWorkouts(uid, { all: true })
          : check.year
            ? fetchSavedWorkouts(uid, { latest: NEWEST })
            : Promise.resolve([]),
        wholeRuns
          ? heldRuns
            ? Promise.resolve(heldRuns)
            : fetchSavedRuns(uid, { all: true })
          : check.year
            ? fetchSavedRuns(uid, { latest: NEWEST })
            : Promise.resolve([] as SavedRun[]),
      ]);
      before = priorTally(workouts, runs, session.id, {
        workouts: wholeWorkouts,
        runs: wholeRuns,
      });
    }
    const decided = before
      ? settleAnniversaries({ marks, before, session, startDay })
      : { earned: [], passed: [] };
    const written: AnniversaryMarks = {};
    for (const kind of decided.passed)
      written[kind] = { day: null, shown: true };
    for (const kind of decided.earned)
      written[kind] = { day: session.day, shown: false };
    if (Object.keys(written).length > 0)
      await setDocGuarded(marksRef(uid), written, { merge: true });
    const since = (kind: AnniversaryKind): string | null => {
      if (kind === "oneYear") return startDay;
      const first = kind === "km1000" ? before?.firstRunDay : before?.firstDay;
      return first ?? (decided.earned.includes(kind) ? session.day : null);
    };
    return unshownAnniversaries({ ...marks, ...written }).map(
      ({ kind, day }) => ({ kind, day, since: since(kind) })
    );
  } catch (err) {
    logger.warn("[anniversaries] not worked out", err);
    return [];
  }
}

/** Record that an anniversary has been shown, so it is never shown again. */
export async function markAnniversaryShown(
  uid: string,
  kind: AnniversaryKind,
  day: string
): Promise<void> {
  const mark: AnniversaryMark = { day, shown: true };
  try {
    await setDocGuarded(marksRef(uid), { [kind]: mark }, { merge: true });
  } catch (err) {
    logger.warn("[anniversaries] shown not recorded", err);
  }
}
