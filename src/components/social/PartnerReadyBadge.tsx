import { Flame } from "lucide-react";
import { useUid } from "@/lib/auth";
import { useFollowersOfMe } from "../../hooks/useFollowersOfMe";
import { usePartnerStreak } from "@/features/partnerStreak/usePartnerStreak";
import { THEME } from "@/lib/theme";

/**
 * SOC-P2d — the partner-streak discovery chip.
 *
 * The feature's surfaces were UserProfile (mutual follows only) and the
 * 0-follow SoloFirstFeed hero — an ESTABLISHED user with mutual follows
 * but no bond never encountered partner streaks at all (the code-map
 * gap). This chip closes it at the discovery surface: on People rows
 * where the relationship is MUTUAL and no bond exists yet, a quiet
 * coral flame reads "Streak ready" — the row already links to the
 * profile, where PartnerStreakCard carries the actual Start action.
 *
 * Read discipline: unless the candidate follows the current user (the
 * shared useFollowersOfMe cache — free), the hook below receives
 * undefined and is INERT (no reads). Only genuine candidates pay the
 * eligibility reads, and those are the rare rows.
 */
export default function PartnerReadyBadge({ uid }: { uid: string }) {
  // `uid` is the CANDIDATE row; `viewerUid` is the signed-in reader. The
  // second clause is "and it isn't me".
  const viewerUid = useUid();
  const { followers } = useFollowersOfMe();
  const candidate = followers.has(uid) && uid !== viewerUid;
  const { loading, mutualFollow, bond } = usePartnerStreak(
    candidate ? uid : undefined
  );

  if (!candidate || loading || !mutualFollow || bond) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-caption font-medium px-1.5 py-0.5 rounded shrink-0"
      style={{ background: `${THEME.running}14`, color: THEME.running }}
      aria-label="Partner streak ready — you follow each other"
    >
      <Flame className="size-3" aria-hidden />
      Streak ready
    </span>
  );
}
