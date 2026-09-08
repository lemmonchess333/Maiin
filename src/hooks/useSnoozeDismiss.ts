import { useState } from "react";
import { readString, writeString } from "@/lib/localStore";

/**
 * Snoozeable dismissal (home-declutter 6b, locked 2026-07-20) — the
 * sibling of `useDismissOnce` for surfaces that should come BACK.
 * Dismissing stores a timestamp; the surface stays hidden for
 * `days` and then resurfaces. First use: the post-trial "Upgrade to
 * Pro" strip on Home (monthly resurface keeps the funnel without a
 * permanent ad at the top of every session).
 *
 * Keys must be uid-scoped by the caller (the PR #820 shared-device
 * rule): one user's snooze must never hide the strip for the next
 * account on the same browser.
 */

const DAY_MS = 86_400_000;

/** Pure core: is a stored snooze timestamp still active? Malformed or
 *  future-dated (clock skew) values fail open — the surface shows. */
export function isSnoozed(
  raw: string | null,
  nowMs: number,
  days: number
): boolean {
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  if (ts > nowMs) return false; // future timestamp — treat as invalid
  return nowMs - ts < days * DAY_MS;
}

export function useSnoozeDismiss(
  key: string,
  days: number
): { snoozed: boolean; snooze: () => void } {
  const [snoozed, setSnoozed] = useState(() => {
    if (typeof window === "undefined") return false;
    return isSnoozed(readString(key), Date.now(), days);
  });

  const snooze = () => {
    setSnoozed(true);
    // Best-effort — private mode degrades to a single-session snooze.
    writeString(key, String(Date.now()));
  };

  return { snoozed, snooze };
}
