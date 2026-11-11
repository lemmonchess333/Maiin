import { useState } from "react";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { useAuth } from "@/lib/auth";
import { isActivationJourneyV2 } from "@/lib/activationJourney";
import {
  guideAllowedHere,
  guideHintsUnlocked,
  hintSeenKey,
  WALK_SEEN_KEY,
  type GuideHintId,
} from "@/lib/firstGuide";

/**
 * Whether this account is still owed one of the guide's hints (FV1): it
 * has met the guide (legacy accounts) or uses the version 2 activation
 * journey, and hasn't seen this hint. Version 2 reaches the action without
 * the automatic Home walk, so the walk cannot gate point-of-use teaching.
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
  const { profile } = useAuth();
  const [allowed] = useState(guideAllowedHere);
  const { dismissed: met } = useDismissOnce(WALK_SEEN_KEY);
  const { dismissed: seen, dismiss } = useDismissOnce(hintSeenKey(id));
  const unlocked = guideHintsUnlocked({
    activationJourneyV2: isActivationJourneyV2(profile),
    walkSeen: met,
  });
  return { allowed, owed: allowed && unlocked && !seen, markSeen: dismiss };
}
