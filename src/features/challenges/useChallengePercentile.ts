import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  getCountFromServer,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { shouldShowChallengePercentile } from "@/lib/socialGates";
import { logger } from "@/lib/logger";

/**
 * "Top N%" from a 1-based `rank` within a field of `total`. Floored at 1
 * (you're never "top 0%") and capped at 100.
 */
export function topPercent(rank: number, total: number): number {
  if (total <= 0) return 100;
  // (rank * 100) / total — not (rank/total)*100 — so exact bands stay exact
  // (20/50*100 = 40.0000001 → ceil → 41; 20*100/50 = 40 → ceil → 40).
  return Math.max(1, Math.min(100, Math.ceil((rank * 100) / total)));
}

/**
 * Resolve the user's percentile in a challenge (SOCIAL S4) — but ONLY once
 * the challenge has ≥50 participants (`shouldShowChallengePercentile`);
 * below that, ranking individuals is meaningless and exposing, so this
 * returns null and the card shows personal progress only.
 *
 * Uses a Firestore `count()` AGGREGATION — one cheap server-side query for
 * "how many participants are ahead of me" — instead of loading the full
 * participant list (which can be hundreds of docs). Rank = ahead + 1.
 * Metric direction matters: `fastest_effort` is lower-is-better (and 0 =
 * no effort yet); everything else is higher-is-better.
 *
 * Returns the top-N% integer, or null when the gate isn't met / not joined
 * / no progress yet / the query fails.
 */
export function useChallengePercentile(params: {
  challengeId: string;
  participantCount: number;
  metric: string;
  myValue: number;
  joined: boolean;
}): number | null {
  const { challengeId, participantCount, metric, myValue, joined } = params;
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // No synchronous reset needed: eligibility is monotonic (participant
    // count + myValue only ever grow) and ChallengeCard is keyed per
    // challenge, so we only ever transition null → a value, never back.
    if (
      !joined ||
      myValue <= 0 ||
      !shouldShowChallengePercentile(participantCount)
    ) {
      return;
    }
    const participants = collection(
      db,
      "challenges",
      challengeId,
      "participants"
    );
    const aheadQuery =
      metric === "fastest_effort"
        ? query(
            participants,
            where("currentValue", ">", 0),
            where("currentValue", "<", myValue)
          )
        : query(participants, where("currentValue", ">", myValue));

    getCountFromServer(aheadQuery)
      .then((snap) => {
        if (cancelled) return;
        const rank = snap.data().count + 1;
        setPct(topPercent(rank, participantCount));
      })
      .catch((err) => {
        if (!cancelled)
          logger.error("[useChallengePercentile] count query failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [challengeId, participantCount, metric, myValue, joined]);

  return pct;
}
