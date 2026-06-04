import { useState, useEffect, useCallback, useRef } from "react";
import { getFeed, toggleKudos } from "@/lib/socialApi";
import {
  pickKudosCandidate,
  localDayKey,
  type KudosCandidate,
  type KudosFeedItemLike,
} from "@/lib/postCompletionKudos";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";

/**
 * Phase 2 — post-completion kudos prompt.
 *
 * Mounted on a completion surface (SessionCompleteScreen / RunSummary). After
 * the user finishes, if someone they follow also trained TODAY, surface a calm,
 * one-tap "Send kudos?" prompt. Social after achievement, never before action.
 *
 * Guardrails:
 *  - Rate-limited to once per local day per uid (localStorage), so finishing
 *    several sessions in a day doesn't nag. The day-slot is only consumed when
 *    a prompt is actually shown (a candidate was found) — a no-candidate
 *    completion doesn't burn the day.
 *  - uid-scoped storage key (no cross-account leakage on a shared device).
 *  - Fails silent: a feed-read error just means no prompt, never an error UI.
 */
function storageKey(uid: string): string {
  return `tropos.kudosPrompt.${uid}`;
}

export function usePostCompletionKudos(opts: {
  uid?: string;
  fromName?: string;
  enabled?: boolean;
}) {
  const { uid, fromName, enabled = true } = opts;
  const [candidate, setCandidate] = useState<KudosCandidate | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || !uid || ranRef.current) return;
    ranRef.current = true;

    const today = localDayKey(new Date());
    let alreadyShown = false;
    try {
      alreadyShown = localStorage.getItem(storageKey(uid)) === today;
    } catch {
      /* localStorage unavailable (private mode / webview) — treat as not shown */
    }
    if (alreadyShown) return;

    let cancelled = false;
    getFeed(uid, 20)
      .then((res) => {
        if (cancelled) return;
        const c = pickKudosCandidate(
          res.items as unknown as KudosFeedItemLike[],
          uid,
          new Date()
        );
        if (!c) return;
        setCandidate(c);
        try {
          localStorage.setItem(storageKey(uid), today);
        } catch {
          /* ignore */
        }
      })
      .catch((e) => logger.warn("[kudos] feed fetch failed", e));

    return () => {
      cancelled = true;
    };
  }, [enabled, uid]);

  const sendKudos = useCallback(async () => {
    if (!candidate || !uid || sending || sent) return;
    setSending(true);
    haptic("light");
    try {
      await toggleKudos(
        candidate.activityId,
        uid,
        fromName ? { fromName } : undefined
      );
      setSent(true);
      toast.success(`Kudos sent to ${candidate.authorName}`);
    } catch (e) {
      logger.error("[kudos] send failed", e);
      toast.error("Couldn't send kudos");
    } finally {
      setSending(false);
    }
  }, [candidate, uid, fromName, sending, sent]);

  const dismiss = useCallback(() => {
    haptic("light");
    setCandidate(null);
  }, []);

  return { candidate, sending, sent, sendKudos, dismiss };
}
