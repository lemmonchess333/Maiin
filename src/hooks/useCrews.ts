import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { parseCrew } from "@/lib/firestoreGuards";
import { logger } from "@/lib/logger";
import { httpsCallable, getFunctions } from "firebase/functions";

export interface CrewLeaderboardEntry {
  uid: string;
  displayName: string;
  score: number;
  km: number;
  kg: number;
  workoutCount: number;
  runCount: number;
  rank: number;
}

export interface Crew {
  id: string;
  name: string;
  description: string;
  icon: string;
  memberCount: number;
  leaderboardMetric: string;
  type: "default" | "custom";
  createdAt: unknown;
  createdBy: string;
  /** Top-N standings written by the crewWeeklyLeaderboardRollup CF.
   *  Absent until the CF has run at least once for this crew. */
  currentLeaderboard?: CrewLeaderboardEntry[];
  leaderboardWeek?: string;
  leaderboardUpdatedAt?: unknown;
}

const DEFAULT_CREWS: Omit<Crew, "id" | "memberCount" | "createdAt">[] = [
  {
    name: "Hybrid Athletes",
    description: "Lift and run — best of both worlds",
    icon: "dumbbell",
    leaderboardMetric: "hybrid_score",
    type: "default",
    createdBy: "system",
  },
  {
    name: "Runners",
    description: "Road, trail, track — all distances welcome",
    icon: "footprints",
    leaderboardMetric: "total_km",
    type: "default",
    createdBy: "system",
  },
  {
    name: "Lifters",
    description: "Strength, power, and muscle",
    icon: "dumbbell",
    leaderboardMetric: "total_volume",
    type: "default",
    createdBy: "system",
  },
  {
    name: "General Fitness",
    description: "Stay active, stay healthy",
    icon: "star",
    leaderboardMetric: "workout_count",
    type: "default",
    createdBy: "system",
  },
];

/**
 * Crew-load failure shape (issue #846).
 *
 *   - "unavailable" → Firestore rejected the read or it timed out
 *     (PERMISSION_DENIED on rules, network drop). The Social tab
 *     surfaces a "Crews are unavailable" hint instead of the
 *     normal "Join a crew" empty state so users don't think the
 *     feature is empty by design.
 *
 * Other codes can be added here if the UI grows (e.g. "restricted"
 * for the `globalRestrictedUids` path). Today only "unavailable"
 * is distinguishable from a normal `[]` result.
 */
export type CrewsLoadError = "unavailable";

export function useCrews() {
  const { user, profile, updateProfile } = useAuth();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CrewsLoadError | null>(null);
  const currentCrewId = profile?.crewId;
  const mutatingRef = useRef(false);

  const fetchCrews = useCallback(async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "groups"), orderBy("memberCount", "desc"))
      );
      let list = snap.docs.map((d) => parseCrew(d.id, d.data()) as Crew);

      // Seed defaults if no default crews exist
      const hasDefaults = list.some((c) => c.type === "default");
      if (!hasDefaults) {
        for (const crew of DEFAULT_CREWS) {
          await addDoc(collection(db, "groups"), {
            ...crew,
            memberCount: 0,
            createdAt: serverTimestamp(),
          });
        }
        const snap2 = await getDocs(
          query(collection(db, "groups"), orderBy("memberCount", "desc"))
        );
        list = snap2.docs.map((d) => parseCrew(d.id, d.data()) as Crew);
      }

      setCrews(list);
      setError(null);
    } catch (e) {
      // Issue #846: surface the failure so the Social tab can show
      // "Crews are unavailable" instead of the normal "Join a crew"
      // empty state (the latter implies "no crews exist", not "we
      // couldn't load any").
      logger.error("Failed to fetch crews:", e);
      setError("unavailable");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const load = async () => {
      await fetchCrews();
    };
    load();
  }, [fetchCrews]);

  const joinCrew = useCallback(
    async (crewId: string) => {
      if (!user?.uid || mutatingRef.current) return;
      mutatingRef.current = true;

      // Capture snapshot via functional setState for accurate rollback
      let snapshot: Crew[] = [];
      setCrews((prev) => {
        snapshot = prev;
        let updated = prev;
        if (currentCrewId && currentCrewId !== crewId) {
          updated = updated.map((c) =>
            c.id === currentCrewId
              ? { ...c, memberCount: Math.max(0, c.memberCount - 1) }
              : c
          );
        }
        return updated.map((c) =>
          c.id === crewId ? { ...c, memberCount: c.memberCount + 1 } : c
        );
      });

      try {
        // 2026-05-26 audit PR 2 (finding #5) — memberCount writes
        // route through `setCrewMembershipCallable`. The CF flips
        // the member sub-doc + memberCount atomically per txn;
        // client direct writes are denied at the rules layer.
        const setMembership = httpsCallable<
          { crewId: string; action: "join" | "leave"; displayName?: string },
          { ok: boolean }
        >(getFunctions(), "setCrewMembershipCallable");
        if (currentCrewId && currentCrewId !== crewId) {
          await setMembership({ crewId: currentCrewId, action: "leave" });
        }
        await setMembership({
          crewId,
          action: "join",
          displayName: profile?.displayName || "Athlete",
        });
        await updateProfile({ crewId });
      } catch (e) {
        setCrews(snapshot);
        throw e;
      } finally {
        mutatingRef.current = false;
      }
    },
    [user, currentCrewId, profile, updateProfile]
  );

  const leaveCrew = useCallback(async () => {
    if (!user?.uid || !currentCrewId || mutatingRef.current) return;
    mutatingRef.current = true;

    let snapshot: Crew[] = [];
    setCrews((prev) => {
      snapshot = prev;
      return prev.map((c) =>
        c.id === currentCrewId
          ? { ...c, memberCount: Math.max(0, c.memberCount - 1) }
          : c
      );
    });

    try {
      // 2026-05-26 audit PR 2 (finding #5) — see joinCrew above.
      const setMembership = httpsCallable<
        { crewId: string; action: "join" | "leave" },
        { ok: boolean }
      >(getFunctions(), "setCrewMembershipCallable");
      await setMembership({ crewId: currentCrewId, action: "leave" });
      await updateProfile({ crewId: undefined });
    } catch (e) {
      setCrews(snapshot);
      throw e;
    } finally {
      mutatingRef.current = false;
    }
  }, [user, currentCrewId, updateProfile]);

  const createCrew = useCallback(
    async (name: string, description: string, icon: string) => {
      if (!user?.uid) return;

      // 2026-05-26 audit PR 2 (finding #5) — member doc writes are
      // server-only. Sequence:
      //   1. Leave current crew via callable.
      //   2. Create the crew doc directly (rules still allow creator
      //      to create the crew). memberCount starts at 0 — step 3
      //      brings it to 1.
      //   3. Join the new crew via callable (this writes the member
      //      sub-doc + increments memberCount atomically).
      const setMembership = httpsCallable<
        { crewId: string; action: "join" | "leave"; displayName?: string },
        { ok: boolean }
      >(getFunctions(), "setCrewMembershipCallable");

      if (currentCrewId) {
        await setMembership({ crewId: currentCrewId, action: "leave" });
      }

      const ref = await addDoc(collection(db, "groups"), {
        name,
        description,
        icon,
        memberCount: 0,
        leaderboardMetric: "workout_count",
        type: "custom",
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      await setMembership({
        crewId: ref.id,
        action: "join",
        displayName: profile?.displayName || "Athlete",
      });
      await updateProfile({ crewId: ref.id });
      const newCrew: Crew = {
        id: ref.id,
        name,
        description,
        icon,
        memberCount: 1,
        leaderboardMetric: "workout_count",
        type: "custom",
        createdAt: new Date(),
        createdBy: user.uid,
      };
      setCrews((prev) => [newCrew, ...prev]);
    },
    [user, currentCrewId, profile?.displayName, updateProfile]
  );

  const currentCrew = crews.find((c) => c.id === currentCrewId) || null;
  const defaultCrews = crews.filter((c) => c.type === "default");
  const customCrews = crews.filter((c) => c.type === "custom");

  return {
    crews,
    defaultCrews,
    customCrews,
    currentCrew,
    currentCrewId,
    loading,
    error,
    joinCrew,
    leaveCrew,
    createCrew,
    refresh: fetchCrews,
  };
}
