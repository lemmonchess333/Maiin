import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
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
  const { user } = useAuth();
  const me = user?.uid;
  const isSelf = !!me && me === partnerUid;

  const [loading, setLoading] = useState(true);
  const [mutualFollow, setMutualFollow] = useState(false);
  const [bond, setBond] = useState<PartnerBond | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!me || !partnerUid || isSelf) {
      setLoading(false);
      setMutualFollow(false);
      setBond(null);
      return;
    }
    setLoading(true);
    Promise.all([
      isFollowing(me, partnerUid),
      isFollowing(partnerUid, me),
      getBond(me, partnerUid),
    ])
      .then(([iFollow, theyFollow, existing]) => {
        if (cancelled) return;
        setMutualFollow(iFollow && theyFollow);
        setBond(existing);
      })
      .catch((err) => {
        if (!cancelled)
          logger.error("[usePartnerStreak] eligibility load failed", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [me, partnerUid, isSelf]);

  const start = useCallback(async () => {
    if (!me || !partnerUid || busy) return;
    setBusy(true);
    try {
      await createBond(me, partnerUid);
      // Re-read the bond rather than synthesising it locally — the
      // doc carries the server `createdAt` and the canonical id, and
      // an idempotent create may have returned a pre-existing bond.
      const fresh = await getBond(me, partnerUid);
      setBond(fresh);
    } finally {
      setBusy(false);
    }
  }, [me, partnerUid, busy]);

  const end = useCallback(async () => {
    if (!bond || busy) return;
    setBusy(true);
    try {
      await dissolveBond(bond.id);
      setBond(null);
    } finally {
      setBusy(false);
    }
  }, [bond, busy]);

  return { loading, mutualFollow, bond, busy, start, end };
}
