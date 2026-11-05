import { useCallback, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import {
  parseMembership,
  parseStanding,
  parseStatus,
  type LeagueMembership,
  type LeagueStanding,
  type LeagueStatus,
} from "./league";

export interface LeagueData {
  /** The first read has not settled yet. */
  loading: boolean;
  /** The status or the membership could not be read. */
  failed: boolean;
  status: LeagueStatus | null;
  member: LeagueMembership | null;
  /** This week's group, every row as the server wrote it, unranked and
   *  unfiltered: ranks count everyone, a block only hides a row. */
  standings: LeagueStanding[];
  reload: () => void;
}

/**
 * The signed-in person's league (Soc15 call 3): the figure, their
 * membership and, when they are in a group this week, its standings. Read
 * once when it mounts and again on `reload` (after joining or leaving).
 *
 * A group that cannot be read (settled and cleared by Monday's turn a
 * moment ago, or the person taken out of it) reads as no group, so the card
 * falls back to waiting for Monday rather than to an error.
 */
export function useLeague(uid: string | null | undefined): LeagueData {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<LeagueData, "reload">>({
    loading: true,
    failed: false,
    status: null,
    member: null,
    standings: [],
  });

  useEffect(() => {
    if (!uid) return;
    let live = true;
    (async () => {
      const [statusSnap, memberSnap] = await Promise.all([
        getDoc(doc(db, "leagueStatus", "current")),
        getDoc(doc(db, "leagueMembers", uid)),
      ]);
      const status = statusSnap.exists()
        ? parseStatus(statusSnap.data())
        : null;
      const member = memberSnap.exists()
        ? parseMembership(memberSnap.data())
        : null;
      let standings: LeagueStanding[] = [];
      if (member?.groupId) {
        try {
          const snap = await getDocs(
            collection(db, "leagueGroups", member.groupId, "standings")
          );
          standings = snap.docs.map((d) => parseStanding(d.id, d.data()));
        } catch (err) {
          logger.warn("[league] group read failed", err);
        }
      }
      if (!live) return;
      setState({ loading: false, failed: false, status, member, standings });
    })().catch((err) => {
      logger.error("[league] read failed", err);
      if (live) setState((s) => ({ ...s, loading: false, failed: true }));
    });
    return () => {
      live = false;
    };
  }, [uid, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
