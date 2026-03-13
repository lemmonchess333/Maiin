import { useState, useEffect, useCallback } from "react";
import {
  collection, query, onSnapshot, doc, setDoc, deleteDoc,
  updateDoc, Timestamp, getDocs, orderBy, limit, getDoc,
  serverTimestamp, increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

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
}

export interface ChallengeParticipant {
  currentValue: number;
  tierAchieved: ChallengeTier | null;
  joinedAt: Timestamp;
  displayName?: string;
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
    seedChallenges().catch(console.error);
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
  }, []);

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
        const snap = await getDocs(
          query(collection(db, "challenges", ch.id, "participants"), orderBy("currentValue", "desc"), limit(20))
        );
        boards[ch.id] = snap.docs.map(d => ({ uid: d.id, ...d.data() } as ChallengeParticipant));
      }
      setLeaderboards(boards);
    };
    load();
  }, [challenges, myProgress]);

  const joinChallenge = useCallback(async (challengeId: string) => {
    if (!user) return;
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const name = profileSnap.exists() ? profileSnap.data().displayName || 'Athlete' : 'Athlete';
    await setDoc(doc(db, "challenges", challengeId, "participants", user.uid), {
      currentValue: 0, tierAchieved: null, joinedAt: Timestamp.now(), displayName: name,
    });
    await updateDoc(doc(db, "challenges", challengeId), { participantCount: increment(1) });
    setMyProgress(prev => ({ ...prev, [challengeId]: { currentValue: 0, tierAchieved: null, joinedAt: Timestamp.now() } }));
  }, [user]);

  const leaveChallenge = useCallback(async (challengeId: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "challenges", challengeId, "participants", user.uid));
    await updateDoc(doc(db, "challenges", challengeId), { participantCount: increment(-1) });
    setMyProgress(prev => { const n = { ...prev }; delete n[challengeId]; return n; });
  }, [user]);

  const updateProgress = useCallback(async (challengeId: string, newValue: number) => {
    if (!user) return;
    const ch = challenges.find(c => c.id === challengeId);
    if (!ch) return;
    const tier = computeTier(newValue, ch.tiers);
    await setDoc(doc(db, "challenges", challengeId, "participants", user.uid), {
      currentValue: newValue, tierAchieved: tier,
    }, { merge: true });
    setMyProgress(prev => ({
      ...prev,
      [challengeId]: { ...prev[challengeId], currentValue: newValue, tierAchieved: tier, joinedAt: prev[challengeId]?.joinedAt || Timestamp.now() },
    }));
  }, [user, challenges, myProgress]);

  const myChallenges = challenges.filter(c => !!myProgress[c.id]);
  const availableChallenges = challenges.filter(c => !myProgress[c.id]);

  return { challenges, myChallenges, availableChallenges, myProgress, leaderboards, loading, joinChallenge, leaveChallenge, updateProgress };
}
