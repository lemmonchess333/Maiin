import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useUid } from "@/lib/auth";
import { aiConsentStatus, type AiConsentStatus } from "@/lib/aiConsent";

/**
 * What the person said when asked:
 *  - `allowed`   — Allow. Stored as `true`; the action goes ahead.
 *  - `declined`  — Not now (or the answer was already off). Stored as
 *                  `false`; nothing is sent.
 *  - `dismissed` — closed without answering. Nothing is stored or sent,
 *                  and the next request asks again.
 */
export type AiConsentAnswer = "allowed" | "declined" | "dismissed";

/** The gate the AI call sites hold. Food owns it and passes it down, so
 *  the scanner and the composer share one question and one answer. */
export interface AiConsentGate {
  status: AiConsentStatus;
  /** Answers at once when the person has already said (allowed, or
   *  declined when off), and asks first when they have not. */
  ensure: () => Promise<AiConsentAnswer>;
  /** Asks whatever the stored answer: the photo tabs' "Turn on". */
  ask: () => Promise<AiConsentAnswer>;
}

export interface AiConsentSheetState {
  open: boolean;
  onAllow: () => void;
  onDecline: () => void;
  onDismiss: () => void;
}

/**
 * Permission before food goes to AI (src/lib/aiConsent.ts has the rule).
 *
 * The answer is written to the profile with a guarded update and NOT
 * awaited: offline the write waits for the connection, and the action the
 * person started (a typed meal falling back to the on-device parser) must
 * not wait with it. Until the profile catches up, this screen goes by the
 * answer just given, so nobody is asked twice; once the stored value moves
 * — to the answer, or anything else — the stored value is what counts.
 */
export function useAiConsent(): {
  gate: AiConsentGate;
  sheet: AiConsentSheetState;
} {
  const { profile, updateProfile } = useAuth();
  const uid = useUid();
  const stored = profile?.aiAnalysisEnabled;
  const [answered, setAnswered] = useState<{
    uid: string | null;
    allowed: boolean;
    /** The stored value when the answer was given. */
    over: boolean | undefined;
  } | null>(null);
  const status: AiConsentStatus =
    answered && answered.uid === uid && answered.over === stored
      ? answered.allowed
        ? "allowed"
        : "off"
      : aiConsentStatus(stored);

  const [asking, setAsking] = useState(false);
  const resolverRef = useRef<((answer: AiConsentAnswer) => void) | null>(null);

  /* A question still open when the screen goes away answers as dismissed,
     so whatever was waiting on it ends rather than hanging. */
  useEffect(
    () => () => {
      resolverRef.current?.("dismissed");
      resolverRef.current = null;
    },
    []
  );

  const settle = useCallback((answer: AiConsentAnswer) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setAsking(false);
    resolve?.(answer);
  }, []);

  const ask = useCallback(
    () =>
      new Promise<AiConsentAnswer>((resolve) => {
        // One question at a time: a second request replaces the first,
        // which ends as dismissed.
        resolverRef.current?.("dismissed");
        resolverRef.current = resolve;
        setAsking(true);
      }),
    []
  );

  const ensure = useCallback(async (): Promise<AiConsentAnswer> => {
    if (status === "allowed") return "allowed";
    if (status === "off") return "declined";
    return ask();
  }, [status, ask]);

  const answer = (allowed: boolean) => {
    setAnswered({ uid, allowed, over: stored });
    void updateProfile({ aiAnalysisEnabled: allowed });
    settle(allowed ? "allowed" : "declined");
  };

  return {
    gate: { status, ensure, ask },
    sheet: {
      open: asking,
      onAllow: () => answer(true),
      onDecline: () => answer(false),
      onDismiss: () => settle("dismissed"),
    },
  };
}
