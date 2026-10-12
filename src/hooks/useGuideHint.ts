import { useState } from "react";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import {
  guideAllowedHere,
  hintSeenKey,
  WALK_SEEN_KEY,
  type GuideHintId,
} from "@/lib/firstGuide";

/**
 * Whether this account is still owed one of the guide's hints (FV1): it
 * has met the guide (seen the first-visit walk) and hasn't seen this hint.
 * Accounts that never met the guide, every account older than its first
 * week when FV1 shipped included, never get hints unasked.
 *
 * A page that must pay to know whether the hint's moment has come (the
 * run screen reads every saved run to know there are none) asks this
 * first and pays only when the hint is owed.
 */
export function useGuideHint(id: GuideHintId): {
  /** The guide may show here at all (never under automation unless a
   *  capture spec turned it on). */
  allowed: boolean;
  /** The hint is owed: met the guide, not seen this one. */
  owed: boolean;
  markSeen: () => void;
} {
  const [allowed] = useState(guideAllowedHere);
  const { dismissed: met } = useDismissOnce(WALK_SEEN_KEY);
  const { dismissed: seen, dismiss } = useDismissOnce(hintSeenKey(id));
  return { allowed, owed: allowed && met && !seen, markSeen: dismiss };
}
