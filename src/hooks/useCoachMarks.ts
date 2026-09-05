import { useState } from "react";
import { useUidForStorageKey } from "@/lib/auth";
import { readString, writeString } from "@/lib/localStore";

const STORAGE_KEY_BASE = "tropos-coach-marks-dismissed";

/**
 * One-shot dismissible coach mark state, optionally keyed.
 *
 * Without a key (legacy): a single global "have we shown the welcome yet?"
 * flag. Dismissing it hides all unkeyed coach marks forever.
 *
 * With a key: per-mark dismissal. Each feature gets its own flag so the
 * user can dismiss the Home welcome without auto-dismissing every other
 * coach mark on the app. Use this for targeted explainers (e.g. the Food
 * hero's "+250 FUEL" caption explainer).
 *
 * The uid prefix is this hook's job — see `useDismissOnce` for the full
 * reasoning. It matters more here than anywhere else, because a coach mark
 * is by definition something you see ONCE, at the start: a second account
 * on a shared device inheriting the first's dismissals never gets shown
 * the app at all. Per CLAUDE.md's design-for-the-user-base rule, cold
 * start is one of the most-seen states across a user base, not a rare one.
 */
export function useCoachMarks(key?: string) {
  const base = key ? `${STORAGE_KEY_BASE}:${key}` : STORAGE_KEY_BASE;
  const storageKey = `${useUidForStorageKey()}:${base}`;
  const [state, setState] = useState(() => ({
    key: storageKey,
    dismissed: readDismissed(storageKey),
  }));

  /* Re-read on a uid change without an effect — see useDismissOnce's note.
     A once-only `useState` initializer would answer with the previous
     account's dismissals for as long as the component stayed mounted. */
  if (state.key !== storageKey) {
    setState({ key: storageKey, dismissed: readDismissed(storageKey) });
  }

  const dismiss = () => {
    setState({ key: storageKey, dismissed: true });
    // Storage unavailable (private mode etc) — state still updates in memory.
    writeString(storageKey, "1");
  };

  return { showCoachMarks: !state.dismissed, dismiss };
}

function readDismissed(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  return !!readString(storageKey);
}
