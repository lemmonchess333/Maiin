import { useState, useEffect, useCallback, useRef } from "react";
import { getFeed, toggleKudos } from "@/lib/socialApi";
import { readString, writeString } from "@/lib/localStore";
import {
  pickKudosCandidate,
  localDayKey,
  type KudosCandidate,
  type KudosFeedItemLike,
} from "@/lib/postCompletionKudos";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import {
  isRestrictedRefusal,
  showRestrictedToast,
} from "@/lib/accountRestriction";

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
 *  - Never offered to a restricted account (S4e), which cannot give props.
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
  const { isRestricted } = useRestrictedStatus(uid);

  useEffect(() => {
    if (!enabled || !uid || isRestricted || ranRef.current) return;
    ranRef.current = true;

    const today = localDayKey(new Date());
    // Unavailable storage (private mode / webview) reads as not shown.
    if (readString(storageKey(uid)) === today) return;

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
        writeString(storageKey(uid), today);
      })
      .catch((e) => logger.warn("[kudos] feed fetch failed", e));

    return () => {
      cancelled = true;
    };
  }, [enabled, uid, isRestricted]);

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
      if (isRestrictedRefusal(e)) showRestrictedToast();
      else toast.error("Couldn't send kudos");
    } finally {
      setSending(false);
    }
  }, [candidate, uid, fromName, sending, sent]);

  // A restriction that lands while the prompt is up takes it away.
  const offered = isRestricted ? null : candidate;

  const dismiss = useCallback(() => {
    haptic("light");
    setCandidate(null);
  }, []);

  return { candidate: offered, sending, sent, sendKudos, dismiss };
}
