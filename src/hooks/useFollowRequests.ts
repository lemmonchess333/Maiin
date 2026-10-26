import { useCallback, useEffect, useState } from "react";
import { useUid } from "@/lib/auth";
import {
  acceptFollowRequest,
  declineFollowRequest,
  getFollowRequests,
  hasFollowRequestFrom,
  type FollowRequest,
} from "@/lib/socialApi";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";

/**
 * Follow requests waiting for the signed-in person (Polish2: an account
 * approves each follower unless it turns that off in Settings → Privacy).
 *
 * The list sits at the top of People; one request also shows on the
 * asker's profile, where its notification opens. Either way, answering
 * takes the row away at once and puts it back if the write fails.
 */

type Status = "loading" | "ready" | "failed";

export function useFollowRequests(enabled: boolean) {
  const uid = useUid();
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  // Try again reads once more.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !uid) return;
    let live = true;
    getFollowRequests(uid)
      .then((next) => {
        if (!live) return;
        setRequests(next);
        setStatus("ready");
      })
      .catch((err) => {
        if (!live) return;
        logger.error("[followRequests] load failed", err);
        setStatus("failed");
      });
    return () => {
      live = false;
    };
  }, [enabled, uid, attempt]);

  const respond = useCallback(
    async (requesterUid: string, accept: boolean): Promise<boolean> => {
      if (!uid) return false;
      const before = requests;
      setRequests((list) => list.filter((r) => r.uid !== requesterUid));
      try {
        if (accept) await acceptFollowRequest(uid, requesterUid);
        else await declineFollowRequest(uid, requesterUid);
        return true;
      } catch (err) {
        logger.error("[followRequests] answer failed", err);
        setRequests(before);
        toast.error(
          accept
            ? "Couldn't accept the request. Try again."
            : "Couldn't decline the request. Try again."
        );
        return false;
      }
    },
    [uid, requests]
  );

  const reload = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  return {
    requests,
    status,
    reload,
    accept: (requesterUid: string) => respond(requesterUid, true),
    decline: (requesterUid: string) => respond(requesterUid, false),
  };
}

/** Whether `requesterUid` has asked to follow the signed-in person, and
 *  the answer, for their profile page. */
export function useFollowRequestFrom(requesterUid: string | undefined) {
  const uid = useUid();
  /* Keyed by who it is about, so moving to the next profile shows no
     answer until that one's is read. */
  const [found, setFound] = useState<{ from: string; asked: boolean } | null>(
    null
  );
  const asked = found !== null && found.from === requesterUid && found.asked;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    if (!uid || !requesterUid || uid === requesterUid) return;
    hasFollowRequestFrom(uid, requesterUid)
      .then((v) => live && setFound({ from: requesterUid, asked: v }))
      .catch((err) => logger.error("[followRequests] check failed", err));
    return () => {
      live = false;
    };
  }, [uid, requesterUid]);

  const answer = useCallback(
    async (accept: boolean): Promise<boolean> => {
      if (!uid || !requesterUid) return false;
      setBusy(true);
      try {
        if (accept) await acceptFollowRequest(uid, requesterUid);
        else await declineFollowRequest(uid, requesterUid);
        setFound({ from: requesterUid, asked: false });
        return true;
      } catch (err) {
        logger.error("[followRequests] answer failed", err);
        toast.error(
          accept
            ? "Couldn't accept the request. Try again."
            : "Couldn't decline the request. Try again."
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [uid, requesterUid]
  );

  return {
    asked,
    busy,
    accept: () => answer(true),
    decline: () => answer(false),
  };
}
