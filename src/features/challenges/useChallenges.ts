import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  deleteDoc,
  Timestamp,
  getDocs,
  orderBy,
  limit,
  getDoc,
  where,
} from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";
import {
  resolveTier,
  isTierAchieved,
  type ChallengeTier,
} from "./challengeTiers";

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
}

export function getTimeRemaining(endDate: Timestamp | Date): string {
  const end = endDate instanceof Date ? endDate : endDate.toDate();
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const days = Math.floor(ms / 86400000);
  if (days > 1) return `${days} days left`;
  const hours = Math.floor(ms / 3600000);
  return `${hours}h left`;
}

export function useChallenges() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  /* Finale window (social features pass, 2026-07): challenges that ended
     within the last 7 days. The active list drops ended challenges, which
     meant a challenge you fought through simply VANISHED at its end date —
     no result, no closure. These feed the finale card in ChallengeList;
     progress + leaderboards load for them too. */
  const [endedChallenges, setEndedChallenges] = useState<Challenge[]>([]);
  const [myProgress, setMyProgress] = useState<
    Record<string, ChallengeParticipant>
  >({});
  const [leaderboards, setLeaderboards] = useState<
    Record<string, ChallengeParticipant[]>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /* Read-only subscription, gated on `user` so it runs after Firebase
       auth resolves. Challenge definitions are SERVER-OWNED: the
       rolloverChallenges scheduled Cloud Function materialises the current
       weekly/monthly/seasonal/fastest-5k/group-goal docs (Admin SDK), and
       Firestore rules deny client creates on /challenges. The client used to
       seed these here via seedChallenges() — removed: a browser shouldn't
       create global product metadata (the same lesson the repo applied to
       default crews).

       The dep on `user` is the uid object reference; AuthProvider holds it
       stable for the session so this doesn't re-run gratuitously. */
    if (!user) return;

    const timeout = setTimeout(() => setLoading(false), 3000);
    const unsub = onSnapshot(
      collection(db, "challenges"),
      (snap) => {
        clearTimeout(timeout);
        const now = new Date();
        const all = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Challenge
        );
        const active = all.filter((c) => {
          const end = c.endDate?.toDate?.();
          return end ? end > now : true;
        });
        const FINALE_WINDOW_MS = 7 * 86_400_000;
        const ended = all.filter((c) => {
          const end = c.endDate?.toDate?.();
          return (
            !!end &&
            end <= now &&
            end.getTime() > now.getTime() - FINALE_WINDOW_MS
          );
        });
        setChallenges(active);
        setEndedChallenges(ended);
        setLoading(false);
      },
      () => {
        clearTimeout(timeout);
        setChallenges([]);
        setLoading(false);
      }
    );
    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, [user]);

  useEffect(() => {
    const tracked = [...challenges, ...endedChallenges];
    if (!user || tracked.length === 0) return;
    const load = async () => {
      const prog: Record<string, ChallengeParticipant> = {};
      for (const ch of tracked) {
        const snap = await getDoc(
          doc(db, "challenges", ch.id, "participants", user.uid)
        );
        if (snap.exists()) prog[ch.id] = snap.data() as ChallengeParticipant;
      }
      setMyProgress(prog);
    };
    load();
  }, [user, challenges, endedChallenges]);

  useEffect(() => {
    const tracked = [...challenges, ...endedChallenges];
    if (tracked.length === 0) return;
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
        boards[ch.id] = snap.docs.map(
          (d) => ({ uid: d.id, ...d.data() }) as ChallengeParticipant
        );
      }
      setLeaderboards(boards);
    };
    load();
  }, [challenges, endedChallenges, myProgress]);

  const joinChallenge = useCallback(
    async (challengeId: string) => {
      if (!user) return;
      try {
        const participantRef = doc(
          db,
          "challenges",
          challengeId,
          "participants",
          user.uid
        );
        // Already a participant (double-tap, stale UI state)? Re-creating
        // would be an UPDATE in rules terms — rejected by the server-owned
        // currentValue/tierAchieved lockdown — and resetting progress on
        // rejoin would be wrong anyway. Just resync local state.
        const existingSnap = await getDoc(participantRef);
        if (existingSnap.exists()) {
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
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        const name = profileSnap.exists()
          ? profileSnap.data().displayName || "Athlete"
          : "Athlete";
        const photoURL = profileSnap.exists()
          ? ((profileSnap.data().photoURL as string | null | undefined) ?? null)
          : null;
        await setDocGuarded(participantRef, {
          currentValue: 0,
          tierAchieved: null,
          joinedAt: Timestamp.now(),
          displayName: name,
          ...(photoURL ? { photoURL } : {}),
        });
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
      } catch (error) {
        logger.error("[Challenges] Join failed:", error);
        toast.error("Couldn't join the challenge. Try again.");
      }
    },
    [user]
  );

  const leaveChallenge = useCallback(
    async (challengeId: string) => {
      if (!user) return;
      try {
        await deleteDoc(
          doc(db, "challenges", challengeId, "participants", user.uid)
        );
        // participantCount recomputed server-side by the participant-delete
        // trigger (see joinChallenge note).
        setMyProgress((prev) => {
          const n = { ...prev };
          delete n[challengeId];
          return n;
        });
      } catch (error) {
        logger.error("[Challenges] Leave failed:", error);
        toast.error("Couldn't leave the challenge. Try again.");
      }
    },
    [user]
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
  };
}
