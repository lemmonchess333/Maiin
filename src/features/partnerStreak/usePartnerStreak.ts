import { useState, useEffect, useCallback } from "react";
import { useUid } from "@/lib/auth";
import { isFollowing } from "@/lib/socialApi";
import { logger } from "@/lib/logger";
import {
  getBond,
  createBond,
  dissolveBond,
  type PartnerBond,
} from "./partnerStreakApi";

export interface UsePartnerStreak {
  /** Initial eligibility + bond load still in flight. */
  loading: boolean;
  /** Both users follow each other — the gate for starting a bond. */
  mutualFollow: boolean;
  /** The active bond for this pair, or null if none exists. */
  bond: PartnerBond | null;
  /** A create/dissolve write is in flight. */
  busy: boolean;
  /** Start a bond (mutual-follow + cap enforced in the data layer). */
  start: () => Promise<void>;
  /** Dissolve the active bond. */
  end: () => Promise<void>;
}

/**
 * Per-profile partner-streak entry point (SOCIAL S3 — Soc6 locked
 * model: mutual-follow auto-eligible, no pending/accept ceremony).
 *
 * Resolves, for the authenticated user against `partnerUid`: are they
 * mutual-follow (the consent gate), and is there already a bond. Drives
 * the `PartnerStreakCard` states — start (eligible, no bond) vs the live
 * streak (bonded). `start`/`end` reconcile local state after the write.
 *
 * Returns inert state (not loading, not eligible) when `partnerUid` is
 * absent or is the current user — the card renders nothing in both.
 */
export function usePartnerStreak(partnerUid?: string): UsePartnerStreak {
  const uid = useUid();
  const me = uid;
  const isSelf = !!me && me === partnerUid;
  // The pair this hook resolves, or null when it is inert.
  const pairKey = me && partnerUid && !isSelf ? `${me}__${partnerUid}` : null;

  /* The eligibility read's answer, stamped with the pair it was read for.
     `loading`, `mutualFollow` and `bond` are derived from it against the
     CURRENT pair: a new profile reads as loading, with no bond, from the
     first render that names it, and a failed read for it settles on its
     own "not eligible" — never on the previous profile's answer. */
  const [resolved, setResolved] = useState<{
    pairKey: string;
    mutualFollow: boolean;
    bond: PartnerBond | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const current =
    resolved !== null && resolved.pairKey === pairKey ? resolved : null;
  const loading = pairKey !== null && current === null;
  const mutualFollow = current?.mutualFollow ?? false;
  const bond = current?.bond ?? null;

  useEffect(() => {
    if (!pairKey || !me || !partnerUid) return;
    let cancelled = false;
    Promise.all([
      isFollowing(me, partnerUid),
      isFollowing(partnerUid, me),
      getBond(me, partnerUid),
    ])
      .then(([iFollow, theyFollow, existing]) => {
        if (cancelled) return;
        setResolved({
          pairKey,
          mutualFollow: iFollow && theyFollow,
          bond: existing,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error("[usePartnerStreak] eligibility load failed", err);
        // Settle as not eligible so the card leaves its loading state and
        // renders nothing, rather than waiting on a read that failed.
        setResolved({ pairKey, mutualFollow: false, bond: null });
      });
    return () => {
      cancelled = true;
    };
  }, [pairKey, me, partnerUid]);

  const start = useCallback(async () => {
    if (!me || !partnerUid || busy) return;
    setBusy(true);
    try {
      await createBond(me, partnerUid);
      // Re-read the bond rather than synthesising it locally — the
      // doc carries the server `createdAt` and the canonical id, and
      // an idempotent create may have returned a pre-existing bond.
      const fresh = await getBond(me, partnerUid);
      // Only into the pair it was started for: a profile opened while
      // the write was in flight keeps its own answer.
      setResolved((prev) =>
        prev && prev.pairKey === pairKey ? { ...prev, bond: fresh } : prev
      );
    } finally {
      setBusy(false);
    }
  }, [me, partnerUid, busy, pairKey]);

  const end = useCallback(async () => {
    if (!bond || busy) return;
    setBusy(true);
    try {
      await dissolveBond(bond.id);
      setResolved((prev) =>
        prev && prev.pairKey === pairKey ? { ...prev, bond: null } : prev
      );
    } finally {
      setBusy(false);
    }
  }, [bond, busy, pairKey]);

  return { loading, mutualFollow, bond, busy, start, end };
}
