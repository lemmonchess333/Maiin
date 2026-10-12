import { useUid } from "../../lib/auth";
import { useFollowState } from "@/hooks/useFollowState";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { showRestrictedToast } from "@/lib/accountRestriction";
import { haptic } from "../../lib/haptic";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

interface FollowButtonProps {
  targetUid: string;
  /**
   * Fired after the follow state has settled server-side. Parents
   * can use this to react — e.g. Suggested People auto-removing a
   * person once you follow them, leaderboards re-running, etc.
   */
  onFollowChange?: (following: boolean) => void;
  /**
   * S4e-restricted-user gate: when true, the button visibly renders
   * but tap is suppressed (haptic + state machine skipped). Find tab
   * passes this when useRestrictedStatus reports the current user is
   * restricted. Distinct from showSpinner-disabled (which means a
   * write is in-flight) — restricted users get the muted styling
   * permanently, not a transient busy state.
   */
  disabled?: boolean;
  /** Width override. The fixed width suits a list row; a profile's
   *  action row stretches it (`flex-1`). */
  className?: string;
}

/**
 * Follow/Unfollow toggle with optimistic UI. On click we flip the
 * state immediately for snappiness, then reconcile against the
 * server response; if the write fails we revert. Fixed width keeps
 * the button from jittering across Follow / Following / loading
 * states, and the loading state uses a spinner instead of a literal
 * "..." string.
 */
export default function FollowButton({
  targetUid,
  onFollowChange,
  disabled,
  className,
}: FollowButtonProps) {
  const uid = useUid();
  /* Shared with every other control that shows this person (a post's
     Follow link, the People to follow row): one read a session, and a
     follow from any of them shows here at once. */
  const { following: known, settled, busy, toggle } = useFollowState(targetUid);
  // A failed check reads as not following, as it always has here.
  const following = known ?? false;
  /* A restricted account can unfollow but not follow (S4e). The button
     stays tappable so the tap can say why; every Follow control, the
     profile page's included, goes through here. */
  const { isRestricted } = useRestrictedStatus(uid ?? undefined);
  const refused = isRestricted && !following;

  const handleToggle = async () => {
    if (!uid || busy || disabled) return;
    if (refused) {
      haptic("error");
      showRestrictedToast();
      return;
    }
    const nextFollowing = !following;
    // Tactile confirmation on the commit — follow is stronger haptic
    // (meaningful new relationship), unfollow is lighter (undo action).
    haptic(nextFollowing ? "medium" : "light");
    // Optimistic: the shared state flips at once and is put back if the
    // write fails.
    if (await toggle(nextFollowing)) {
      onFollowChange?.(nextFollowing);
    } else {
      haptic("error");
    }
  };

  if (!uid || uid === targetUid) return null;

  const showSpinner = !settled || busy;

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={showSpinner || disabled}
      aria-disabled={refused || undefined}
      aria-label={
        disabled
          ? "Following actions are unavailable — your account is restricted"
          : following
            ? "Unfollow user"
            : "Follow user"
      }
      aria-busy={showSpinner}
      className={cn(
        "inline-flex items-center justify-center h-11 w-24 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 aria-disabled:opacity-50",
        following
          ? "bg-muted text-muted-foreground border border-border"
          : "bg-primary-strong text-white",
        className
      )}
    >
      {showSpinner ? (
        // The button itself sets the foreground colour (white for
        // not-following, muted-foreground for following), so the
        // Spinner inherits via variant="inverse" / "muted". Using
        // "inverse" universally because both states' contrast is
        // close enough — keeps the markup branch-free.
        <Spinner
          size="xs"
          variant={following ? "muted" : "inverse"}
          label={following ? "Unfollowing" : "Following"}
        />
      ) : following ? (
        "Following"
      ) : (
        "Follow"
      )}
    </button>
  );
}
