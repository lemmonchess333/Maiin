import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import {
  loadBoardWeeks,
  rankBoard,
  type BoardWeek,
  type ChallengeType,
  type LeaderboardEntry,
} from "@/lib/leaderboard";
import { logger } from "@/lib/logger";

export interface NamedBoardWeek extends BoardWeek {
  name: string;
  photoURL?: string;
}

export interface NamedBoardEntry extends LeaderboardEntry {
  photoURL?: string;
}

/** One board's order, named: only people with something this week. */
export function rankNamedBoard(
  weeks: NamedBoardWeek[],
  challenge: ChallengeType
): NamedBoardEntry[] {
  const byUid = new Map(weeks.map((w) => [w.uid, w]));
  return rankBoard(weeks, challenge)
    .filter((e) => e.value > 0)
    .map((e) => ({
      ...e,
      name: byUid.get(e.uid)?.name ?? "Athlete",
      photoURL: byUid.get(e.uid)?.photoURL,
    }));
}

/** Each week named from the cross-user-readable public profile. */
async function loadNamedWeeks(uid: string): Promise<NamedBoardWeek[]> {
  const weeks = await loadBoardWeeks(uid);
  return Promise.all(
    weeks.map(async (w) => {
      const fallback = w.uid === uid ? "You" : "Athlete";
      try {
        const snap = await getDoc(doc(db, "users", w.uid, "public", "profile"));
        const data = snap.data() as
          | { displayName?: string; photoURL?: string }
          | undefined;
        return {
          ...w,
          name: data?.displayName || fallback,
          photoURL: data?.photoURL,
        };
      } catch {
        return { ...w, name: fallback };
      }
    })
  );
}

/**
 * This week's board for the signed-in person: one read of each tally,
 * whichever board (sessions, distance, volume) is then shown from it.
 * Stamped with the account it was read for, so an account switch reads as
 * loading, never as the last person's board. A read that failed says so.
 */
export function useFriendsBoard() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [attempt, setAttempt] = useState(0);
  const [board, setBoard] = useState<{
    key: string;
    failed: boolean;
    weeks: NamedBoardWeek[];
  } | null>(null);
  const key = uid ? `${uid}:${attempt}` : null;

  useEffect(() => {
    if (!uid || key === null) return;
    let live = true;
    loadNamedWeeks(uid).then(
      (weeks) => live && setBoard({ key, failed: false, weeks }),
      (err) => {
        logger.error("[friendsBoard] load failed", err);
        if (live) setBoard({ key, failed: true, weeks: [] });
      }
    );
    return () => {
      live = false;
    };
  }, [uid, key]);

  const settled = board !== null && board.key === key ? board : null;
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return {
    loading: settled === null,
    failed: settled?.failed ?? false,
    weeks: settled?.weeks ?? [],
    reload,
  };
}
