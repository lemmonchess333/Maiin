import { track as trackSocialEvent } from "@/lib/socialAnalytics";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  Timestamp,
  getDocs,
  orderBy,
  limit,
  getDoc,
  where,
} from "firebase/firestore";
import { setDocGuarded, deleteDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { showRestrictedToast } from "@/lib/accountRestriction";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";
import {
  resolveTier,
  isTierAchieved,
  type ChallengeTier,
} from "./challengeTiers";
import { parseLocalDate } from "@/lib/dateHelpers";
import { useLiveParticipationProgress } from "./useLiveParticipationProgress";

// Re-exported so existing importers (ChallengeCard, tests) keep one import site.
// The tier logic lives in ./challengeTiers (mirrored server-side).
export { resolveTier, isTierAchieved };
export type { ChallengeTier };

export const TIER_COLORS: Record<ChallengeTier, string> = {
  bronze: THEME.tier.bronze,
  silver: THEME.tier.silver,
  gold: THEME.tier.gold,
};

export interface Challenge {
  id: string;
  name: string;
  description: string;
  type: string;
  metric: string;
  icon: string;
  tiers: { bronze: number; silver: number; gold: number };
  startDate: Timestamp;
  endDate: Timestamp;
  participantCount: number;
  season?: string;
  /** PR 5: target distance in metres for `fastest_effort` challenges
   *  (e.g. 5000 = fastest 5K). Ignored for other metrics. */
  targetDistance?: number;
  /** PR 5: shared collective target for `group_goal` challenges (e.g.
   *  "100km combined this month"). When present, the UI renders a
   *  collective progress bar above the leaderboard instead of the
   *  per-user tier ladder. The `tiers` field is still set to a stub
   *  (gold = collectiveTarget) so existing sync logic doesn't break. */
  collectiveTarget?: number;
}

export interface ChallengeParticipant {
  currentValue: number;
  tierAchieved: ChallengeTier | null;
  joinedAt: Timestamp;
  displayName?: string;
  /**
   * Denormalised avatar URL — stored at join time so leaderboard
   * entries can render without a per-user profile fetch. Absent on
   * pre-W1d participant docs; the UI falls back to initials.
   */
  photoURL?: string;
  uid?: string;
  /** Place on the board, shared by a tie (1, 1, 3). Set by
   *  `rankLeaderboard`, never stored. */
  rank?: number;
}

/**
 * A board in the order it is shown, each entry with its place. Equal
 * values share a place and the next value skips the places they took
 * (1, 1, 3). Within a tie entries go by name, so who sits first is not
 * decided by how account ids happen to sort. A time-based metric
 * (fastest_effort) ranks the lowest value first.
 */
export function rankLeaderboard(
  entries: readonly ChallengeParticipant[],
  metric: string
): ChallengeParticipant[] {
  const ascending = metric === "fastest_effort";
  const sorted = [...entries].sort((a, b) => {
    const byValue = ascending
      ? a.currentValue - b.currentValue
      : b.currentValue - a.currentValue;
    if (byValue !== 0) return byValue;
    const byName = (a.displayName ?? "").localeCompare(
      b.displayName ?? "",
      "en-GB",
      { sensitivity: "base" }
    );
    if (byName !== 0) return byName;
    return (a.uid ?? "") < (b.uid ?? "")
      ? -1
      : (a.uid ?? "") > (b.uid ?? "")
        ? 1
        : 0;
  });
  let rank = 0;
  return sorted.map((entry, i) => {
    if (i === 0 || entry.currentValue !== sorted[i - 1].currentValue) {
      rank = i + 1;
    }
    return { ...entry, rank };
  });
}

/* ── Local-day challenge window (mirror of the server's crediting rule) ──
 *
 * The server credits an activity by its LOCAL calendar day against the
 * challenge's UTC [startDate, endDate) window, as day-key strings
 * (functions/lib/challengeActivityWindow.js — fail-closed, pinned). The
 * client used to gate "active" and the countdown on the UTC INSTANT
 * instead, and the two disagree by up to a day at period boundaries: an NZ
 * user at local Aug 1 09:00 saw July's card promise "3h left" while the
 * server was already refusing to credit July with their Aug-1-dated runs —
 * and a UTC-negative user saw "Ended" while their Jul-31-dated runs still
 * credited fine (probe sweep 2026-08-05, verifier-confirmed HIGH).
 *
 * These helpers make the card's promise and the server's crediting the SAME
 * predicate: a challenge is active for you exactly while an activity logged
 * TODAY (your local day) would credit it, and it "ends" at YOUR local
 * midnight of the end day. A cross-test pins this equal to the server
 * predicate on shared fixtures (challengeWindowParity.cross.test.ts).
 * This is also what keeps the rollover's one-day-early materialisation
 * invisible: a not-yet-started challenge fails `startKey <= today` and
 * never renders as a second live card.
 */

/** UTC day key of a boundary instant (the timestamp IS the UTC-midnight
 *  boundary marker, so UTC extraction — never local — recovers the key). */
export function boundaryDayKey(
  value: Timestamp | Date | undefined | null
): string | null {
  const d =
    value instanceof Date
      ? value
      : value && typeof value.toDate === "function"
        ? value.toDate()
        : null;
  if (!d || !Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Would an activity logged on `localDayKey` credit this challenge?
 *  Identical semantics to the server's challengeContainsActivityDate. */
export function isChallengeActiveOnDay(
  c: { startDate?: Timestamp | Date; endDate?: Timestamp | Date },
  localDayKey: string
): boolean {
  const startKey = boundaryDayKey(c.startDate);
  const endKey = boundaryDayKey(c.endDate);
  if (!startKey || !endKey || startKey >= endKey) return false;
  return startKey <= localDayKey && localDayKey < endKey;
}

/** The instant this challenge ends FOR THIS DEVICE: local midnight of the
 *  end day — the moment a newly logged activity stops crediting it. */
export function challengeLocalEndMs(
  endDate: Timestamp | Date | undefined | null
): number | null {
  const endKey = boundaryDayKey(endDate);
  if (!endKey) return null;
  return parseLocalDate(endKey).getTime();
}

/**
 * The collapsed entry to the not-joined challenges. It used to read
 * "See all challenges · 1 · 20 days left" — a count and a deadline with
 * nothing telling the reader what the number counted. Says what it is:
 * how many more there are, and how soon the nearest one closes.
 */
export function moreChallengesLabel(
  count: number,
  soonest: string | null
): string {
  const noun = count === 1 ? "challenge" : "challenges";
  return `See ${count} more ${noun}${soonest ? ` · ${soonest}` : ""}`;
}

export function getTimeRemaining(
  endDate: Timestamp | Date,
  now: number = Date.now()
): string {
  const endMs = challengeLocalEndMs(endDate);
  if (endMs === null) return "";
  const ms = endMs - now;
  if (ms <= 0) return "Ended";
  const days = Math.floor(ms / 86400000);
  if (days > 1) return `${days} days left`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours}h left`;
  // Final hour: floor-to-hours read "0h left" for the whole last hour
  // (probe sweep 2026-08-05, verified) — count minutes instead, never
  // dropping below "1m left" while the challenge is still live.
  const minutes = Math.max(1, Math.floor(ms / 60000));
  return `${minutes}m left`;
}

/**
 * The soonest-ending challenge of a list, by each challenge's LOCAL end
 * instant — null-safe. The previous inline reduce dereferenced
 * `endDate.toDate()` unguarded, but the active list deliberately KEEPS
 * docs with no endDate (lenient for malformed defs), so one malformed doc
 * crashed the whole challenge section (probe sweep 2026-08-05, verified).
 * Docs with no resolvable end simply don't compete for "soonest".
 */
export function soonestEndingChallenge<
  T extends { endDate?: Timestamp | Date },
>(list: readonly T[]): T | null {
  let best: T | null = null;
  let bestMs = Infinity;
  for (const c of list) {
    const endMs = challengeLocalEndMs(c.endDate);
    if (endMs === null) continue;
    if (endMs < bestMs) {
      best = c;
      bestMs = endMs;
    }
  }
  return best;
}

/** The user's participant doc for each tracked challenge, keyed by
 *  challenge id: present for the ones they have joined. One read at a
 *  time, in list order. */
async function readMyProgress(
  uid: string,
  tracked: readonly TrackedChallenge[]
): Promise<Record<string, ChallengeParticipant>> {
  const prog: Record<string, ChallengeParticipant> = {};
  for (const ch of tracked) {
    const snap = await getDoc(
      doc(db, "challenges", ch.id, "participants", uid)
    );
    if (snap.exists()) prog[ch.id] = snap.data() as ChallengeParticipant;
  }
  return prog;
}

/** What the progress and leaderboard reads need from a challenge. */
type TrackedChallenge = Pick<Challenge, "id" | "metric">;

/** How far back the listener reaches: the finale window's seven days, and
 *  one more, since a challenge ends at local midnight of its UTC end day,
 *  up to half a day after its stored `endDate`. Challenges are never
 *  deleted, so an unbounded listener grew by a hundred-odd a year, and
 *  every one of them changing re-ran the reads below for every viewer. */
const CHALLENGE_LOOKBACK_MS = 8 * 86_400_000;

/** A stable key for a list of challenges: their ids and metrics, sorted.
 *  The reads below follow it, so a snapshot that changes only a
 *  challenge's `participantCount` (every join or leave, anywhere) starts
 *  none of them. */
function trackedKeyOf(lists: readonly (readonly Challenge[])[]): string {
  return JSON.stringify(
    lists
      .flat()
      .map((c) => [c.id, c.metric])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  );
}

export function useChallenges() {
  const uid = useUid();
  const todayKey = useLocalDateKey();
  // A restricted account can leave a challenge but not join one (S4e).
  const { isRestricted } = useRestrictedStatus(uid ?? undefined);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  /* Finale window (social features pass, 2026-07): challenges that ended
     within the last 7 days. The active list drops ended challenges, which
     meant a challenge you fought through simply VANISHED at its end date —
     no result, no closure. These feed the finale card in ChallengeList;
     progress + leaderboards load for them too. */
  const [endedChallenges, setEndedChallenges] = useState<Challenge[]>([]);
  const [progressState, setProgressState] = useState<{
    uid: string;
    values: Record<string, ChallengeParticipant>;
  } | null>(null);
  const sessionRef = useRef<{ uid: string | null; active: boolean } | null>(
    null
  );
  useEffect(() => {
    const session = { uid, active: true };
    sessionRef.current = session;
    return () => {
      session.active = false;
    };
  }, [uid]);
  const setMyProgress = useCallback(
    (
      update: (
        previous: Record<string, ChallengeParticipant>
      ) => Record<string, ChallengeParticipant>
    ) => {
      const session = sessionRef.current;
      if (!uid || !session?.active || session.uid !== uid) return;
      setProgressState((previous) => ({
        uid,
        values: update(previous?.uid === uid ? previous.values : {}),
      }));
    },
    [uid]
  );
  const liveProgress = useLiveParticipationProgress<ChallengeParticipant>(uid, [
    ...challenges,
    ...endedChallenges,
  ]);
  const myProgress = useMemo(() => {
    const combined = {
      ...(progressState?.uid === uid ? progressState.values : {}),
    };
    for (const [id, value] of Object.entries(liveProgress)) {
      if (value === null) delete combined[id];
      else combined[id] = value;
    }
    return combined;
  }, [uid, progressState, liveProgress]);
  const [leaderboards, setLeaderboards] = useState<
    Record<string, ChallengeParticipant[]>
  >({});
  const [loading, setLoading] = useState(true);

  // Upcoming definitions may not change at midnight. The day dependency also
  // re-reads the cached snapshot on app resume, without needing a server write.
  useEffect(() => {
    /* Read-only subscription, gated on `user` so it runs after Firebase
       auth resolves. Challenge definitions are SERVER-OWNED: the
       rolloverChallenges scheduled Cloud Function materialises the current
       weekly/monthly/seasonal/fastest-5k/group-goal docs (Admin SDK), and
       Firestore rules deny client creates on /challenges. The client used to
       seed these here via seedChallenges() — removed: a browser shouldn't
       create global product metadata (the same lesson the repo applied to
       retired default crews).

       The dep on `user` is the uid object reference; AuthProvider holds it
       stable for the session so this doesn't re-run gratuitously. */
    if (!uid) return;

    let subscribed = true;
    const timeout = setTimeout(() => {
      if (subscribed) setLoading(false);
    }, 3000);
    const unsub = onSnapshot(
      query(
        collection(db, "challenges"),
        where(
          "endDate",
          ">",
          Timestamp.fromMillis(Date.now() - CHALLENGE_LOOKBACK_MS)
        )
      ),
      (snap) => {
        if (!subscribed) return;
        clearTimeout(timeout);
        const now = new Date();
        const all = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Challenge
        );
        // Active = an activity logged TODAY (local day) would credit it —
        // the server's own predicate, so the card never promises counting
        // the server will refuse, and the rollover's one-day-early docs
        // stay hidden until their day arrives locally. A doc with no end
        // date is not in the query, and the server credits none.
        const active = all.filter((c) => isChallengeActiveOnDay(c, todayKey));
        const FINALE_WINDOW_MS = 7 * 86_400_000;
        const ended = all.filter((c) => {
          const endMs = challengeLocalEndMs(c.endDate);
          return (
            endMs !== null &&
            endMs <= now.getTime() &&
            endMs > now.getTime() - FINALE_WINDOW_MS
          );
        });
        setChallenges(active);
        setEndedChallenges(ended);
        setLoading(false);
      },
      () => {
        if (!subscribed) return;
        clearTimeout(timeout);
        setChallenges([]);
        setLoading(false);
      }
    );
    return () => {
      subscribed = false;
      clearTimeout(timeout);
      unsub();
    };
  }, [uid, todayKey]);

  const trackedKey = trackedKeyOf([challenges, endedChallenges]);
  const tracked = useMemo(
    (): TrackedChallenge[] =>
      (JSON.parse(trackedKey) as [string, Challenge["metric"]][]).map(
        ([id, metric]) => ({ id, metric })
      ),
    [trackedKey]
  );
  /* The person's own values, as a key: the boards are read again when
     their own standing moves, not when anything else in the snapshot
     does. */
  const ownValuesKey = JSON.stringify(
    tracked.map(({ id }) => myProgress[id]?.currentValue ?? null)
  );
  /* Bumped by pull-to-refresh, so the boards are read again with it. */
  const [boardsNonce, setBoardsNonce] = useState(0);

  /* Pull-to-refresh still reloads every goal (SOC-P1d). Participation goals
     additionally receive live server backfill/edit results; those snapshots
     override this one-shot read, including observed membership deletions. */
  const loadMyProgress = useCallback((): Promise<void> => {
    const session = sessionRef.current;
    if (!uid || !session?.active || session.uid !== uid || tracked.length === 0)
      return Promise.resolve();
    // State is set in the continuation, once every read has landed, so
    // the effect below that starts the reads sets nothing synchronously.
    return readMyProgress(uid, tracked).then((values) => {
      if (session.active && sessionRef.current === session)
        setProgressState({ uid, values });
    });
  }, [uid, tracked]);

  useEffect(() => {
    void loadMyProgress();
  }, [loadMyProgress]);

  const refreshProgress = useCallback((): Promise<void> => {
    setBoardsNonce((n) => n + 1);
    return loadMyProgress();
  }, [loadMyProgress]);

  useEffect(() => {
    if (!uid || tracked.length === 0) return;
    let active = true;
    const load = async () => {
      const boards: Record<string, ChallengeParticipant[]> = {};
      for (const ch of tracked) {
        /* Sort direction depends on the challenge's metric semantics.
           For SUM-style metrics (workout_count / total_volume / total_km
           / hybrid_score / streak_days / combined_score) higher is
           better, so the leaderboard is descending. For fastest_effort
           the metric is time-in-seconds where lower wins, so the
           leaderboard must sort ascending — and entries with
           currentValue == 0 (no qualifying run yet) need to be
           excluded entirely rather than ranked first. Without this
           gate the slowest runner appeared at #1 on Fastest 5K. */
        const isTimeBased = ch.metric === "fastest_effort";
        let qRef;
        if (isTimeBased) {
          qRef = query(
            collection(db, "challenges", ch.id, "participants"),
            where("currentValue", ">", 0),
            orderBy("currentValue", "asc"),
            limit(20)
          );
        } else {
          qRef = query(
            collection(db, "challenges", ch.id, "participants"),
            orderBy("currentValue", "desc"),
            limit(20)
          );
        }
        const snap = await getDocs(qRef);
        boards[ch.id] = rankLeaderboard(
          snap.docs.map(
            (d) => ({ uid: d.id, ...d.data() }) as ChallengeParticipant
          ),
          ch.metric
        );
      }
      if (active) setLeaderboards(boards);
    };
    load();
    return () => {
      active = false;
    };
  }, [uid, tracked, ownValuesKey, boardsNonce]);

  const joinChallenge = useCallback(
    async (challengeId: string) => {
      const session = sessionRef.current;
      if (!uid || !session?.active || session.uid !== uid) return;
      if (isRestricted) {
        showRestrictedToast();
        return;
      }
      try {
        const participantRef = doc(
          db,
          "challenges",
          challengeId,
          "participants",
          uid
        );
        // Already a participant (double-tap, stale UI state)? Re-creating
        // would be an UPDATE in rules terms — rejected by the server-owned
        // currentValue/tierAchieved lockdown — and resetting progress on
        // rejoin would be wrong anyway. Just resync local state.
        const existingSnap = await getDoc(participantRef);
        if (existingSnap.exists()) {
          if (!session.active || sessionRef.current !== session) return;
          const data = existingSnap.data();
          setMyProgress((prev) => ({
            ...prev,
            [challengeId]: {
              currentValue: (data.currentValue as number) ?? 0,
              tierAchieved: (data.tierAchieved as ChallengeTier | null) ?? null,
              joinedAt: (data.joinedAt as Timestamp) ?? Timestamp.now(),
            },
          }));
          return;
        }
        const profileSnap = await getDoc(doc(db, "users", uid));
        const name = profileSnap.exists()
          ? profileSnap.data().displayName || "Athlete"
          : "Athlete";
        const photoURL = profileSnap.exists()
          ? ((profileSnap.data().photoURL as string | null | undefined) ?? null)
          : null;
        if (!session.active || sessionRef.current !== session) return;
        await setDocGuarded(participantRef, {
          currentValue: 0,
          tierAchieved: null,
          joinedAt: Timestamp.now(),
          displayName: name,
          ...(photoURL ? { photoURL } : {}),
        });
        if (!session.active || sessionRef.current !== session) return;
        // participantCount is maintained server-side by the
        // onChallengeParticipantCreated/Deleted triggers — the parent
        // challenge doc is server-owned (rules deny client writes). The old
        // client-side increment() here was already rejected by those rules,
        // throwing AFTER the participant write landed and surfacing a false
        // "Couldn't join the challenge. Try again." toast.
        setMyProgress((prev) => ({
          ...prev,
          [challengeId]: {
            currentValue: 0,
            tierAchieved: null,
            joinedAt: Timestamp.now(),
          },
        }));
        trackSocialEvent("challenge_joined", { challengeId });
      } catch (error) {
        if (!session.active || sessionRef.current !== session) return;
        logger.error("[Challenges] Join failed:", error);
        toast.error("Couldn't join the challenge. Try again.");
      }
    },
    [uid, isRestricted, setMyProgress]
  );

  const leaveChallenge = useCallback(
    async (challengeId: string) => {
      const session = sessionRef.current;
      if (!uid || !session?.active || session.uid !== uid) return;
      try {
        await deleteDocGuarded(
          doc(db, "challenges", challengeId, "participants", uid)
        );
        if (!session.active || sessionRef.current !== session) return;
        // participantCount recomputed server-side by the participant-delete
        // trigger (see joinChallenge note).
        setMyProgress((prev) => {
          const n = { ...prev };
          delete n[challengeId];
          return n;
        });
      } catch (error) {
        if (!session.active || sessionRef.current !== session) return;
        logger.error("[Challenges] Leave failed:", error);
        toast.error("Couldn't leave the challenge. Try again.");
      }
    },
    [uid, setMyProgress]
  );

  /* 2026-06-07 audit (HIGH): challenge progress is SERVER-OWNED.
     currentValue + tierAchieved on participants/{uid} are written ONLY
     by the Admin SDK triggers (syncChallengeProgress /
     syncFastestEffortProgress in functions/index.js), which the
     firestore.rules participant block now enforces — a client write to
     either field is rejected. The old client `updateProgress()` wrote a
     client-computed currentValue/tierAchieved directly, which the server
     then incremented on top of, baking a forged base value into the
     world-readable leaderboard. It had no callers (progress is driven by
     run/workout saves → triggers), so it is removed rather than neutered.
     The UI derives tier from currentValue + challenge tiers at render
     time via resolveTier (see ChallengeCard); the stored tierAchieved is
     a server-written denormalisation, still read but never client-written. */

  const myChallenges = challenges.filter((c) => !!myProgress[c.id]);
  const availableChallenges = challenges.filter((c) => !myProgress[c.id]);
  // Finale candidates: ended in the last 7 days AND the user took part.
  const myEndedChallenges = endedChallenges.filter((c) => !!myProgress[c.id]);

  return {
    challenges,
    myChallenges,
    availableChallenges,
    myEndedChallenges,
    myProgress,
    leaderboards,
    loading,
    joinChallenge,
    leaveChallenge,
    /** SOC-P1d: on-demand progress refetch, preserving newer live participation
     *  snapshots and cascading leaderboard reads — the pull-to-refresh handle. */
    refreshProgress,
    restricted: isRestricted,
  };
}
