import { useState } from "react";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import {
  guideAllowedHere,
  hintSeenKey,
  type GuideHintId,
} from "@/lib/firstGuide";

/**
 * Whether this account is still owed one of the guide's hints (FV1): it
 * hasn't seen this hint. Every account is taught at the point of use, with
 * nothing to meet first (App1: Home's walk, which once gated the hints for
 * older accounts, is gone).
 *
 * A page that must pay to know whether the hint's moment has come (the
 * run screen reads every saved run to know there are none) asks this
 * first and pays only when the hint is owed.
 */
export function useGuideHint(id: GuideHintId): {
  /** The guide may show here at all (never under automation unless a
   *  capture spec turned it on). */
  allowed: boolean;
  /** The hint is owed: the guide may show, and this one hasn't been seen. */
  owed: boolean;
  markSeen: () => void;
} {
  const [allowed] = useState(guideAllowedHere);
  const { dismissed: seen, dismiss } = useDismissOnce(hintSeenKey(id));
  return { allowed, owed: allowed && !seen, markSeen: dismiss };
}
