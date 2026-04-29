import { useState, useEffect, useCallback } from "react";
import {
  collection, query, onSnapshot, doc, setDoc, deleteDoc,
  updateDoc, Timestamp, getDocs, orderBy, limit, getDoc,
  serverTimestamp, increment, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export type ChallengeTier = "bronze" | "silver" | "gold";

export const TIER_COLORS: Record<ChallengeTier, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
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

function getWeekStart(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.getFullYear(), d.getMonth(), diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getWeekEnd(): Date {
  const start = getWeekStart();
  return new Date(start.getTime() + 7 * 86400000);
}

function getMonthStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getMonthEnd(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

function getSeason() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return { name: "Spring Reset", description: "Longest consistency streak — days with any logged activity", metric: "streak_days", icon: "sprout", tiers: { bronze: 5, silver: 14, gold: 30 } };
  if (month >= 5 && month <= 7) return { name: "Summer Shred", description: "Combined workout count + km run", metric: "combined_score", icon: "sun", tiers: { bronze: 20, silver: 50, gold: 100 } };
  if (month >= 8 && month <= 10) return { name: "Autumn Push", description: "Hybrid score: km x 100 + volume kg x 0.1", metric: "hybrid_score", icon: "leaf", tiers: { bronze: 500, silver: 2000, gold: 5000 } };
  return { name: "Winter Bulk", description: "Highest total volume lifted (kg)", metric: "total_volume", icon: "snowflake", tiers: { bronze: 5000, silver: 25000, gold: 50000 } };
}

function getSeasonStart(): Date {
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  if (month >= 2 && month <= 4) return new Date(year, 2, 1);
  if (month >= 5 && month <= 7) return new Date(year, 5, 1);
  if (month >= 8 && month <= 10) return new Date(year, 8, 1);
  return month >= 11 ? new Date(year, 11, 1) : new Date(year - 1, 11, 1);
}

function getSeasonEnd(): Date {
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  if (month >= 2 && month <= 4) return new Date(year, 5, 1);
  if (month >= 5 && month <= 7) return new Date(year, 8, 1);
  if (month >= 8 && month <= 10) return new Date(year, 11, 1);
  return month >= 11 ? new Date(year + 1, 2, 1) : new Date(year, 2, 1);
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function computeTier(value: number, tiers: { bronze: number; silver: number; gold: number }): ChallengeTier | null {
  if (value >= tiers.gold) return "gold";
  if (value >= tiers.silver) return "silver";
  if (value >= tiers.bronze) return "bronze";
  return null;
}

/* Tier-achievement helper. Encapsulates the lower-is-better semantic
 * for `fastest_effort` (a time-based metric where smaller is faster
 * and a value of 0 means "no qualifying effort yet") and the standard
 * higher-is-better semantic for cumulative metrics. ChallengeCard
 * used to inline this comparison three times — once per tier marker —
 * with the same `metric === "fastest_effort"` branch each time. */
export function isTierAchieved(value: number, tierThreshold: number, metric: string): boolean {
  if (metric === "fastest_effort") {
    return value > 0 && value <= tierThreshold;
  }
  return value >= tierThreshold;
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

async function seedChallenges() {
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();
  const monthStart = getMonthStart();
  const monthEnd = getMonthEnd();
  const seasonStart = getSeasonStart();
  const seasonEnd = getSeasonEnd();
  const season = getSeason();
  const monthName = MONTH_NAMES[new Date().getMonth()];

  const defs = [
    {
      docId: `weekly-${weekStart.toISOString().split("T")[0]}`,
      name: "Weekly Warrior",
      description: "Log workouts this week (Mon-Sun)",
      type: "weekly",
      metric: "workout_count",
      icon: "trophy",
      tiers: { bronze: 2, silver: 4, gold: 6 },
      startDate: Timestamp.fromDate(weekStart),
      endDate: Timestamp.fromDate(weekEnd),
    },
    {
      docId: `monthly-${monthStart.toISOString().split("T")[0]}`,
      name: `${monthName} Mileage`,
      description: "Total km run this month",
      type: "monthly",
      metric: "total_km",
      icon: "footprints",
      tiers: { bronze: 10, silver: 25, gold: 50 },
      startDate: Timestamp.fromDate(monthStart),
      endDate: Timestamp.fromDate(monthEnd),
    },
    {
      docId: `seasonal-${seasonStart.toISOString().split("T")[0]}`,
      name: season.name,
      description: season.description,
      type: "seasonal",
      metric: season.metric,
      icon: season.icon,
      tiers: season.tiers,
      startDate: Timestamp.fromDate(seasonStart),
      endDate: Timestamp.fromDate(seasonEnd),
    },
    /* PR 5: fastest 5K this month. Pace-based challenge; lower
       currentValue is better. Tiers are pace targets in seconds —
       gold = sub-25min, silver = sub-30min, bronze = sub-35min for
       a 5K. Sync logic in functions/index.js MIN-updates currentValue
       instead of incrementing it for fastest_effort metric. */
    {
      docId: `fastest-5k-${monthStart.toISOString().split("T")[0]}`,
      name: "Fastest 5K",
      description: "Quickest 5km this month — set your benchmark",
      type: "monthly",
      metric: "fastest_effort",
      icon: "footprints",
      targetDistance: 5000,
      tiers: { bronze: 35 * 60, silver: 30 * 60, gold: 25 * 60 },
      startDate: Timestamp.fromDate(monthStart),
      endDate: Timestamp.fromDate(monthEnd),
    },
    /* PR 5: group goal — collective km this month from everyone who
       opts in. Uses the same total_km sync path as the individual
       Mileage challenge so we don't duplicate sync logic; the UI
       differentiates by checking collectiveTarget. */
    {
      docId: `group-goal-${monthStart.toISOString().split("T")[0]}`,
      name: "Together: 1,000km",
      description: "Combined distance from everyone running this month",
      type: "monthly",
      metric: "total_km",
      icon: "footprints",
      collectiveTarget: 1000,
      tiers: { bronze: 1000, silver: 1000, gold: 1000 },
      startDate: Timestamp.fromDate(monthStart),
      endDate: Timestamp.fromDate(monthEnd),
    },
  ];

  for (const def of defs) {
    const ref = doc(db, "challenges", def.docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const { docId: _docId, ...data } = def;
      await setDoc(ref, { ...data, participantCount: 0, createdAt: serverTimestamp() });
    }
  }
}

export function useChallenges() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [myProgress, setMyProgress] = useState<Record<string, ChallengeParticipant>>({});
  const [leaderboards, setLeaderboards] = useState<Record<string, ChallengeParticipant[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /* Gated on `user` so we only seed and subscribe AFTER Firebase
       auth has resolved. Previously this effect ran on first mount
       with an empty deps array, which fired before AuthProvider had
       a uid — Firestore rejected the writes/reads as anonymous and
       the silent .catch swallowed the errors. Net effect: the
       challenges collection was never created on the project (the
       Weekly Workout Challenge UI rendered anyway because it's
       computed locally from the user's workouts data, not from the
       challenges collection — masked the bug for months).

       The dep on `user` is the uid object reference; AuthProvider
       holds it stable for the session so this doesn't re-run
       gratuitously. */
    if (!user) return;

    seedChallenges().catch(e => logger.error(e));
    const timeout = setTimeout(() => setLoading(false), 3000);
    const unsub = onSnapshot(
      collection(db, "challenges"),
      (snap) => {
        clearTimeout(timeout);
        const now = new Date();
        const active = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Challenge))
          .filter(c => {
            const end = c.endDate?.toDate?.();
            return end ? end > now : true;
          });
        setChallenges(active);
        setLoading(false);
      },
      () => { clearTimeout(timeout); setChallenges([]); setLoading(false); }
    );
    return () => { clearTimeout(timeout); unsub(); };
  }, [user]);

  useEffect(() => {
    if (!user || challenges.length === 0) return;
    const load = async () => {
      const prog: Record<string, ChallengeParticipant> = {};
      for (const ch of challenges) {
        const snap = await getDoc(doc(db, "challenges", ch.id, "participants", user.uid));
        if (snap.exists()) prog[ch.id] = snap.data() as ChallengeParticipant;
      }
      setMyProgress(prog);
    };
    load();
  }, [user, challenges]);

  useEffect(() => {
    if (challenges.length === 0) return;
    const load = async () => {
      const boards: Record<string, ChallengeParticipant[]> = {};
      for (const ch of challenges) {
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
            limit(20),
          );
        } else {
          qRef = query(
            collection(db, "challenges", ch.id, "participants"),
            orderBy("currentValue", "desc"),
            limit(20),
          );
        }
        const snap = await getDocs(qRef);
        boards[ch.id] = snap.docs.map(d => ({ uid: d.id, ...d.data() } as ChallengeParticipant));
      }
      setLeaderboards(boards);
    };
    load();
  }, [challenges, myProgress]);

  const joinChallenge = useCallback(async (challengeId: string) => {
    if (!user) return;
    try {
      const profileSnap = await getDoc(doc(db, "users", user.uid));
      const name = profileSnap.exists() ? profileSnap.data().displayName || 'Athlete' : 'Athlete';
      const photoURL = profileSnap.exists() ? (profileSnap.data().photoURL as string | null | undefined) ?? null : null;
      await setDoc(doc(db, "challenges", challengeId, "participants", user.uid), {
        currentValue: 0, tierAchieved: null, joinedAt: Timestamp.now(), displayName: name,
        ...(photoURL ? { photoURL } : {}),
      });
      await updateDoc(doc(db, "challenges", challengeId), { participantCount: increment(1) });
      setMyProgress(prev => ({ ...prev, [challengeId]: { currentValue: 0, tierAchieved: null, joinedAt: Timestamp.now() } }));
    } catch (error) {
      logger.error('[Challenges] Join failed:', error);
      toast.error('Failed to join challenge');
    }
  }, [user]);

  const leaveChallenge = useCallback(async (challengeId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "challenges", challengeId, "participants", user.uid));
      await updateDoc(doc(db, "challenges", challengeId), { participantCount: increment(-1) });
      setMyProgress(prev => { const n = { ...prev }; delete n[challengeId]; return n; });
    } catch (error) {
      logger.error('[Challenges] Leave failed:', error);
      toast.error('Failed to leave challenge');
    }
  }, [user]);

  const updateProgress = useCallback(async (challengeId: string, newValue: number) => {
    if (!user) return;
    const ch = challenges.find(c => c.id === challengeId);
    if (!ch) return;
    const tier = computeTier(newValue, ch.tiers);
    try {
      await setDoc(doc(db, "challenges", challengeId, "participants", user.uid), {
        currentValue: newValue, tierAchieved: tier,
      }, { merge: true });
      setMyProgress(prev => ({
        ...prev,
        [challengeId]: { ...prev[challengeId], currentValue: newValue, tierAchieved: tier, joinedAt: prev[challengeId]?.joinedAt || Timestamp.now() },
      }));
    } catch (error) {
      logger.error('[Challenges] Progress update failed:', error);
      toast.error('Failed to update challenge progress');
    }
  }, [user, challenges]);

  const myChallenges = challenges.filter(c => !!myProgress[c.id]);
  const availableChallenges = challenges.filter(c => !myProgress[c.id]);

  return { challenges, myChallenges, availableChallenges, myProgress, leaderboards, loading, joinChallenge, leaveChallenge, updateProgress };
}
