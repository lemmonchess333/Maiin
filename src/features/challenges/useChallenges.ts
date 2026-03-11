import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  arrayUnion,
  Timestamp,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export interface Challenge {
  id: string;
  name: string;
  description: string;
  type: "lifting" | "running" | "hybrid" | "nutrition";
  target: { metric: string; value: number; unit: string };
  startDate: Timestamp;
  endDate: Timestamp;
  participants: string[];
  createdBy: string;
  isGlobal: boolean;
  rotation?: "weekly" | "monthly" | "seasonal" | "permanent";
  season?: "summer" | "winter" | "spring" | "autumn";
}

export interface ChallengeProgress {
  current: number;
  completed: boolean;
  lastUpdated: Timestamp;
}

export const GLOBAL_CHALLENGES: Omit<Challenge, "id" | "startDate" | "endDate" | "participants" | "createdBy">[] = [
  // Permanent challenges
  {
    name: "Iron Runner",
    description: "Complete 3 lifts + 3 runs this week",
    type: "hybrid",
    target: { metric: "hybrid_sessions", value: 6, unit: "sessions" },
    isGlobal: true,
    rotation: "permanent",
  },
  {
    name: "100K Month",
    description: "Run 100km in a calendar month",
    type: "running",
    target: { metric: "distance_km", value: 100, unit: "km" },
    isGlobal: true,
    rotation: "permanent",
  },
  {
    name: "Tonnage Titan",
    description: "Lift 50,000kg total in one week",
    type: "lifting",
    target: { metric: "tonnage_kg", value: 50000, unit: "kg" },
    isGlobal: true,
    rotation: "permanent",
  },
  {
    name: "Macro Master",
    description: "Hit macros within 5% for 5 consecutive days",
    type: "nutrition",
    target: { metric: "macro_days", value: 5, unit: "days" },
    isGlobal: true,
    rotation: "permanent",
  },
  {
    name: "Hybrid 30",
    description: "Log both a lift and run for 30 days",
    type: "hybrid",
    target: { metric: "hybrid_days", value: 30, unit: "days" },
    isGlobal: true,
    rotation: "permanent",
  },
  // Weekly challenges
  {
    name: "Weekly Warrior",
    description: "Log the most workouts this week",
    type: "hybrid",
    target: { metric: "workout_count", value: 7, unit: "workouts" },
    isGlobal: true,
    rotation: "weekly",
  },
  {
    name: "Mile Chaser",
    description: "Run the most km this week",
    type: "running",
    target: { metric: "total_km", value: 50, unit: "km" },
    isGlobal: true,
    rotation: "weekly",
  },
  {
    name: "Volume King",
    description: "Lift the most total kg this week",
    type: "lifting",
    target: { metric: "total_volume_kg", value: 100000, unit: "kg" },
    isGlobal: true,
    rotation: "weekly",
  },
  // Monthly challenges
  {
    name: "Iron Month",
    description: "Most total volume lifted this month",
    type: "lifting",
    target: { metric: "total_volume_kg", value: 500000, unit: "kg" },
    isGlobal: true,
    rotation: "monthly",
  },
  {
    name: "Consistency Crown",
    description: "Longest streak of daily logging this month",
    type: "hybrid",
    target: { metric: "streak_days", value: 30, unit: "days" },
    isGlobal: true,
    rotation: "monthly",
  },
  // Seasonal challenges
  {
    name: "Summer Shred",
    description: "Combined km + workout count for the summer",
    type: "hybrid",
    target: { metric: "summer_score", value: 200, unit: "points" },
    isGlobal: true,
    rotation: "seasonal",
    season: "summer",
  },
  {
    name: "Winter Bulk",
    description: "Total volume lifted during winter",
    type: "lifting",
    target: { metric: "total_volume_kg", value: 1000000, unit: "kg" },
    isGlobal: true,
    rotation: "seasonal",
    season: "winter",
  },
];

export function getActiveChallenges(challenges: Challenge[]): Challenge[] {
  const now = new Date();
  const month = now.getMonth();

  return challenges.filter(c => {
    if (c.rotation === 'permanent') return true;
    if (c.rotation === 'weekly') return true; // Always show weekly
    if (c.rotation === 'monthly') return true; // Always show monthly
    if (c.rotation === 'seasonal') {
      if (c.season === 'summer' && month >= 5 && month <= 7) return true;
      if (c.season === 'winter' && (month >= 11 || month <= 1)) return true;
      if (c.season === 'spring' && month >= 2 && month <= 4) return true;
      if (c.season === 'autumn' && month >= 8 && month <= 10) return true;
    }
    // Challenges without a rotation field default to active
    if (!c.rotation) return true;
    return false;
  });
}

export function useChallenges() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [progress, setProgress] = useState<Record<string, ChallengeProgress>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = collection(db, "challenges");
    // Timeout fallback: if Firestore doesn't respond in 3s, stop loading
    const timeout = setTimeout(() => setLoading(false), 3000);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        clearTimeout(timeout);
        setChallenges(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Challenge)));
        setLoading(false);
      },
      () => {
        // On error (e.g. collection doesn't exist), gracefully resolve
        clearTimeout(timeout);
        setChallenges([]);
        setLoading(false);
      }
    );
    return () => { clearTimeout(timeout); unsub(); };
  }, []);

  // Load user's progress
  useEffect(() => {
    if (!user || challenges.length === 0) return;

    const loadProgress = async () => {
      const prog: Record<string, ChallengeProgress> = {};
      for (const ch of challenges) {
        try {
          const snap = await getDocs(
            query(collection(db, "challenges", ch.id, "progress"), where("__name__", "==", user.uid))
          );
          if (!snap.empty) {
            prog[ch.id] = snap.docs[0].data() as ChallengeProgress;
          }
        } catch {
          // Skip errors for individual challenges
        }
      }
      setProgress(prog);
    };
    loadProgress();
  }, [user, challenges]);

  const joinChallenge = useCallback(
    async (challengeId: string) => {
      if (!user) return;
      const ref = doc(db, "challenges", challengeId);
      await updateDoc(ref, { participants: arrayUnion(user.uid) });

      const progRef = doc(db, "challenges", challengeId, "progress", user.uid);
      await setDoc(progRef, {
        current: 0,
        completed: false,
        lastUpdated: Timestamp.now(),
      });
    },
    [user]
  );

  const updateProgress = useCallback(
    async (challengeId: string, current: number) => {
      if (!user) return;
      const challenge = challenges.find((c) => c.id === challengeId);
      const completed = challenge ? current >= challenge.target.value : false;

      const ref = doc(db, "challenges", challengeId, "progress", user.uid);
      await setDoc(ref, {
        current,
        completed,
        lastUpdated: Timestamp.now(),
      });
    },
    [user, challenges]
  );

  const myChallenges = challenges.filter(
    (c) => user && c.participants?.includes(user.uid)
  );

  const availableChallenges = challenges.filter(
    (c) => user && !c.participants?.includes(user.uid)
  );

  return {
    challenges,
    myChallenges,
    availableChallenges,
    progress,
    loading,
    joinChallenge,
    updateProgress,
  };
}
