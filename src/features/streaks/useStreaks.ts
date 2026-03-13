import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { BADGE_DEFINITIONS, initBadges, type EarnedBadge } from "./badges";
import { format } from "date-fns";

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  totalActiveDays: number;
  badges: EarnedBadge[];
}

const DEFAULT_STREAKS: StreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: "",
  totalActiveDays: 0,
  badges: initBadges(),
};

export function useStreaks() {
  const { user } = useAuth();
  const [streakData, setStreakData] = useState<StreakData>(DEFAULT_STREAKS);
  const [loading, setLoading] = useState(true);
  const [newBadge, setNewBadge] = useState<EarnedBadge | null>(null);

  useEffect(() => {
    if (!user) {
      const reset = () => {
        setStreakData(DEFAULT_STREAKS);
        setLoading(false);
      };
      reset();
      return;
    }

    const ref = doc(db, "users", user.uid, "streaks", "data");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as StreakData;
        // Merge badge definitions with saved earned dates
        const savedBadges = data.badges || [];
        const merged = BADGE_DEFINITIONS.map((def) => {
          const saved = savedBadges.find((b: EarnedBadge) => b.id === def.id);
          return { ...def, earnedAt: saved?.earnedAt || null };
        });
        setStreakData({ ...data, badges: merged });
      } else {
        setStreakData(DEFAULT_STREAKS);
      }
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const recordActivity = useCallback(async () => {
    if (!user) return;

    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");

    let newStreak = streakData.currentStreak;
    if (streakData.lastActiveDate === today) return; // Already active today
    if (streakData.lastActiveDate === yesterday) {
      newStreak += 1;
    } else {
      newStreak = 1;
    }

    const longest = Math.max(newStreak, streakData.longestStreak);
    const totalDays = streakData.totalActiveDays + 1;

    const ref = doc(db, "users", user.uid, "streaks", "data");
    await setDoc(ref, {
      currentStreak: newStreak,
      longestStreak: longest,
      lastActiveDate: today,
      totalActiveDays: totalDays,
      badges: streakData.badges,
    }, { merge: true });
  }, [user, streakData]);

  const awardBadge = useCallback(async (badgeId: string) => {
    if (!user) return;

    const badge = streakData.badges.find((b) => b.id === badgeId);
    if (!badge || badge.earnedAt) return; // Already earned

    const now = new Date().toISOString();
    const updatedBadges = streakData.badges.map((b) =>
      b.id === badgeId ? { ...b, earnedAt: now } : b
    );

    const ref = doc(db, "users", user.uid, "streaks", "data");
    await setDoc(ref, { badges: updatedBadges }, { merge: true });

    setNewBadge({ ...badge, earnedAt: now });
  }, [user, streakData.badges]);

  const checkStreakBadges = useCallback(async () => {
    const s = streakData.currentStreak;
    if (s >= 7 && !streakData.badges.find((b) => b.id === "week_warrior")?.earnedAt) {
      await awardBadge("week_warrior");
    }
    if (s >= 30 && !streakData.badges.find((b) => b.id === "month_master")?.earnedAt) {
      await awardBadge("month_master");
    }
    if (s >= 100 && !streakData.badges.find((b) => b.id === "century_club")?.earnedAt) {
      await awardBadge("century_club");
    }
    if (streakData.totalActiveDays >= 1 && !streakData.badges.find((b) => b.id === "first_step")?.earnedAt) {
      await awardBadge("first_step");
    }
  }, [streakData, awardBadge]);

  const dismissNewBadge = useCallback(() => setNewBadge(null), []);

  const earnedBadges = streakData.badges.filter((b) => b.earnedAt);
  const lockedBadges = streakData.badges.filter((b) => !b.earnedAt);

  return {
    streakData,
    loading,
    recordActivity,
    awardBadge,
    checkStreakBadges,
    newBadge,
    dismissNewBadge,
    earnedBadges,
    lockedBadges,
  };
}
