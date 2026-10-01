import { useState } from "react";
import { useFollowState } from "@/hooks/useFollowState";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { track as trackSocialEvent } from "@/lib/socialAnalytics";

/**
 * Follow, beside a post's author: following someone from what they did,
 * rather than only from People search or their profile.
 *
 * Shown only once it is known the viewer doesn't follow them, so it never
 * flashes onto someone they already follow. Once tapped it says
 * "Following" and stays put; unfollowing lives on the profile, away from
 * a stray tap in a scrolling feed.
 */
export default function InlineFollow({
  targetUid,
  targetName,
}: {
  targetUid: string;
  targetName: string;
}) {
  const { following, busy, toggle } = useFollowState(targetUid);
  const [followedHere, setFollowedHere] = useState(false);

  if (followedHere && following) {
    return (
      <span className="shrink-0 px-2 text-sm font-medium text-muted-foreground">
        Following
      </span>
    );
  }
  if (following !== false) return null;

  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Follow ${targetName || "this person"}`}
      onClick={async () => {
        haptic("medium");
        setFollowedHere(true);
        if (await toggle(true)) {
          trackSocialEvent("social_follow", { followSource: "post" });
        } else {
          setFollowedHere(false);
          haptic("error");
          toast.error("Couldn't follow. Try again.");
        }
      }}
      className="shrink-0 inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-lifting-strong hover:text-lifting-strong/80 active:scale-[0.97] transition-[color,transform] disabled:opacity-50"
    >
      Follow
    </button>
  );
}
