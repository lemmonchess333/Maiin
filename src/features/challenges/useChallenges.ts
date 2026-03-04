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
}

export interface ChallengeProgress {
  current: number;
  completed: boolean;
  lastUpdated: Timestamp;
}

export const GLOBAL_CHALLENGES: Omit<Challenge, "id" | "startDate" | "endDate" | "participants" | "createdBy">[] = [
  {
    name: "Iron Runner",
    description: "Complete 3 lifts + 3 runs this week",
    type: "hybrid",
    target: { metric: "hybrid_sessions", value: 6, unit: "sessions" },
    isGlobal: true,
  },
  {
    name: "100K Month",
    description: "Run 100km in a calendar month",
    type: "running",
    target: { metric: "distance_km", value: 100, unit: "km" },
    isGlobal: true,
  },
  {
    name: "Tonnage Titan",
    description: "Lift 50,000kg total in one week",
    type: "lifting",
    target: { metric: "tonnage_kg", value: 50000, unit: "kg" },
    isGlobal: true,
  },
  {
    name: "Macro Master",
    description: "Hit macros within 5% for 5 consecutive days",
    type: "nutrition",
    target: { metric: "macro_days", value: 5, unit: "days" },
    isGlobal: true,
  },
  {
    name: "Hybrid 30",
    description: "Log both a lift and run for 30 days",
    type: "hybrid",
    target: { metric: "hybrid_days", value: 30, unit: "days" },
    isGlobal: true,
  },
];

export function useChallenges() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [progress, setProgress] = useState<Record<string, ChallengeProgress>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = collection(db, "challenges");
    const unsub = onSnapshot(ref, (snap) => {
      setChallenges(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Challenge)));
      setLoading(false);
    });
    return unsub;
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
