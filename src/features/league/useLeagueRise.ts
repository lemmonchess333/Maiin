import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { parseMembership, parseStanding, type LeagueStanding } from "./league";
import { placeRise, type LeagueTier } from "./leagueRules";

/**
 * How long a finish listens for the server's recompute of your standing,
 * from when the session is on the server and the phone is online. The
 * session's trigger (onWorkoutCreated, onRunCreated) recomputes it as its
 * second step, after the challenges, a few seconds after the save; the
 * window allows a function starting cold. The run finish waits as long
 * for its segment efforts (`FINISH_SEGMENT_WAIT_MS`, Run30 call 1), for
 * the same reason: no line lands under someone who has read on. A Tropos
 * heuristic.
 */
export const LEAGUE_LINE_WAIT_MS = 15_000;

/** Where the finish is: before its save, saving (or saved on this phone
 *  only), or saved on the server. */
export type FinishStage = "before" | "saving" | "onServer";

export interface LeagueRise {
  tier: LeagueTier;
  rank: number;
  of: number;
}

interface Before {
  key: string;
  groupId: string;
  tier: LeagueTier;
  standings: LeagueStanding[];
}

/**
 * The place a session raised you to in this week's league group (Run30
 * call 2), or null.
 *
 * The finish reads your group's standings once while it is still before
 * the save, from the server (offline, it reads nothing), and keeps them
 * only if the read lands before the save starts: a read after could
 * already hold the session. Once the session is on the server and the
 * phone online, it listens to the group for `LEAGUE_LINE_WAIT_MS`, and the
 * first server snapshot in which the server has rewritten your points
 * settles it (`placeRise`). Nothing is shown while it waits, nothing when
 * the window closes first, and nothing for a finish opened after its save
 * (a resumed save, a receipt), whose before is gone.
 *
 * `enabled` is the caller's say: only someone who opted in, so nothing is
 * read for anyone else.
 */
export function useLeagueRise({
  uid,
  enabled,
  stage,
  isOnline,
}: {
  uid: string | null | undefined;
  enabled: boolean;
  stage: FinishStage;
  isOnline: boolean;
}): LeagueRise | null {
  const key = uid && enabled ? uid : null;
  /* Once the finish has left "before" it never reads a before again: a
     retried save may already be on the server. */
  const [frozen, setFrozen] = useState(stage !== "before");
  if (!frozen && stage !== "before") setFrozen(true);

  const [before, setBefore] = useState<Before | null>(null);
  useEffect(() => {
    if (!key || frozen) return;
    let live = true;
    (async () => {
      const memberSnap = await getDocFromServer(doc(db, "leagueMembers", key));
      const member = memberSnap.exists()
        ? parseMembership(memberSnap.data())
        : null;
      if (!member?.groupId) return;
      const snap = await getDocsFromServer(
        collection(db, "leagueGroups", member.groupId, "standings")
      );
      const standings = snap.docs.map((d) => parseStanding(d.id, d.data()));
      if (!live || !standings.some((s) => s.uid === key)) return;
      setBefore({ key, groupId: member.groupId, tier: member.tier, standings });
    })().catch((err) => {
      logger.warn("[league] the finish's before read failed", err);
    });
    return () => {
      live = false;
    };
  }, [key, frozen]);

  const mine = before && before.key === key ? before : null;

  /* The listen starts the first time the session is on the server with
     the phone online, and keeps its window if the phone goes offline. */
  const [listenFor, setListenFor] = useState<Before | null>(null);
  if (listenFor !== mine && mine && stage === "onServer" && isOnline)
    setListenFor(mine);

  const [settled, setSettled] = useState<{
    from: Before;
    rise: LeagueRise | null;
  } | null>(null);
  useEffect(() => {
    if (!listenFor) return;
    const from = listenFor;
    let done = false;
    let stop = () => {};
    let closeAt: ReturnType<typeof setTimeout> | undefined;
    const finish = (rise: LeagueRise | null) => {
      if (done) return;
      done = true;
      stop();
      clearTimeout(closeAt);
      setSettled({ from, rise });
    };
    const unsubscribe = onSnapshot(
      collection(db, "leagueGroups", from.groupId, "standings"),
      (snap) => {
        if (snap.metadata.fromCache) return;
        const after = snap.docs.map((d) => parseStanding(d.id, d.data()));
        const was = from.standings.find((s) => s.uid === from.key);
        const now = after.find((s) => s.uid === from.key);
        /* Out of the group, or the server has not rewritten you yet. */
        if (!was || !now) return finish(null);
        if (now.points === was.points) return;
        const place = placeRise(from.key, from.standings, after);
        finish(place ? { tier: from.tier, ...place } : null);
      },
      (err) => {
        logger.warn("[league] the finish's listen failed", err);
        finish(null);
      }
    );
    /* A first snapshot can settle it before onSnapshot returns. */
    stop = unsubscribe;
    if (done) unsubscribe();
    else closeAt = setTimeout(() => finish(null), LEAGUE_LINE_WAIT_MS);
    return () => {
      done = true;
      unsubscribe();
      clearTimeout(closeAt);
    };
  }, [listenFor]);

  if (!mine || settled?.from !== mine) return null;
  return settled.rise;
}
