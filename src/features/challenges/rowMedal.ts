import type { DistanceUnit } from "@/lib/distanceUnits";
import type { LiftUnit } from "@/lib/liftLoad";
import {
  MEDAL_TIER_RANK,
  medalFace,
  medalFromChallenge,
  type MedalTier,
} from "./medals";
import type { Challenge, ChallengeParticipant } from "./useChallenges";

const TIERS: readonly MedalTier[] = ["bronze", "silver", "gold"];

/**
 * The medal a challenge's row shows on Together (Soc16): the tier the
 * person is working toward. Bronze for a challenge they have not joined
 * or have not reached a tier in yet, the next tier once they have one,
 * and gold once gold is theirs. A tier the challenge does not set is
 * passed over for the next one it does.
 */
export function rowMedalTier(
  challenge: Pick<Challenge, "tiers">,
  progress?: Pick<ChallengeParticipant, "tierAchieved"> | null
): MedalTier | null {
  const set = TIERS.filter((t) => (challenge.tiers?.[t] ?? 0) > 0);
  if (set.length === 0) return null;
  const achieved = progress?.tierAchieved;
  const reached =
    achieved === "bronze" || achieved === "silver" || achieved === "gold"
      ? MEDAL_TIER_RANK[achieved]
      : -1;
  return set.find((t) => MEDAL_TIER_RANK[t] > reached) ?? set[set.length - 1];
}

/** What MedalArt draws on a challenge's row, or null for a challenge that
 *  awards no medal (the community goal) or sets no tiers. */
export function rowMedalFace(
  challenge: Challenge,
  progress: ChallengeParticipant | null | undefined,
  liftUnit: LiftUnit,
  distanceUnit: DistanceUnit
): ReturnType<typeof medalFace> | null {
  const tier = rowMedalTier(challenge, progress);
  if (!tier) return null;
  const medal = medalFromChallenge(challenge, {
    tierAchieved: tier,
    currentValue: progress?.currentValue ?? 0,
  });
  return medal ? medalFace(medal, liftUnit, distanceUnit) : null;
}

/** Whether a challenge has a medal to show: tiers to win, and not the
 *  community goal, which awards none. */
export function challengeHasMedal(
  challenge: Pick<Challenge, "tiers" | "collectiveTarget">
): boolean {
  return (
    (challenge.collectiveTarget ?? 0) <= 0 && rowMedalTier(challenge) !== null
  );
}
