import { useUid } from "../../lib/auth";
import { useFollowState, type FollowState } from "@/hooks/useFollowState";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { showRestrictedToast } from "@/lib/accountRestriction";
import { haptic } from "../../lib/haptic";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

interface FollowButtonProps {
  targetUid: string;
  /**
   * Fired after the follow state has settled server-side, with where it
   * now stands and where it stood. Parents react — Suggested People
   * dropping someone once followed or asked, a profile's follower count.
   */
  onFollowChange?: (now: FollowState, before: FollowState) => void;
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
  const {
    following: known,
    requested,
    settled,
    busy,
    toggle,
  } = useFollowState(targetUid);
  // A failed check reads as not following, as it always has here.
  const following = known ?? false;
  /* Following, or asked to (Polish2: an account approves each follower
     unless it turns that off). Either way a tap undoes it. */
  const engaged = following || requested;
  /* A restricted account can unfollow but not follow (S4e). The button
     stays tappable so the tap can say why; every Follow control, the
     profile page's included, goes through here. */
  const { isRestricted } = useRestrictedStatus(uid ?? undefined);
  const refused = isRestricted && !engaged;

  const handleToggle = async () => {
    if (!uid || busy || disabled) return;
    if (refused) {
      haptic("error");
      showRestrictedToast();
      return;
    }
    const before: FollowState = following
      ? "following"
      : requested
        ? "requested"
        : "not-following";
    // Tactile confirmation on the commit — follow is stronger haptic
    // (meaningful new relationship), unfollow is lighter (undo action).
    haptic(engaged ? "light" : "medium");
    // Undoing flips the shared state at once and is put back if the write
    // fails; a follow waits to hear whether it became a request.
    const now = await toggle(!engaged);
    if (now) {
      onFollowChange?.(now, before);
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
            : requested
              ? "Cancel follow request"
              : "Follow user"
      }
      aria-busy={showSpinner}
      className={cn(
        "inline-flex items-center justify-center h-11 w-24 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 aria-disabled:opacity-50",
        engaged
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
          variant={engaged ? "muted" : "inverse"}
          label={
            following ? "Unfollowing" : requested ? "Cancelling" : "Following"
          }
        />
      ) : following ? (
        "Following"
      ) : requested ? (
        "Requested"
      ) : (
        "Follow"
      )}
    </button>
  );
}
