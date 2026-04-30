import Avatar from "@/components/Avatar";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";

interface Props {
  /** UID of the user this avatar represents — required for the block
   *  check. The current user's own avatar should NOT use this wrapper
   *  (the user can't block themselves and skipping the lookup is
   *  cheaper). Optional because pre-denormalization records (e.g.
   *  legacy comment docs) may not have it; in that case the block
   *  check no-ops and the photo renders normally. */
  uid: string | undefined;
  photoURL?: string | null;
  displayName?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * Drop-in Avatar replacement for cross-user social surfaces (kudos
 * lists, comment lists, leaderboard rows, search results, suggested
 * people). When the current user has blocked the target, the wrapper
 * suppresses the photoURL and forces an initial-only fallback —
 * preventing a malicious user from weaponizing their profile photo
 * to harass blockers.
 *
 * Why a wrapper rather than baking the check into Avatar itself:
 *
 *   - Avatar is also used in self-render contexts (the user's own
 *     row, their own comment thread). Those don't need the lookup
 *     and shouldn't pay the hook cost.
 *   - The block check requires a `uid` parameter Avatar doesn't have
 *     today and shouldn't gain unconditionally — it'd push the hook
 *     dependency into every Avatar render.
 *   - Keeping the wrapper explicit makes the call sites that have
 *     received the block-aware treatment grep-able: any direct
 *     `<Avatar>` usage in cross-user UI is now a flag that wants
 *     this wrapper instead.
 *
 * Display-name passes through unchanged. The blocked user's name is
 * still visible — only the photo is suppressed. This preserves
 * thread/conversation context (you can tell who a comment is from)
 * while neutralizing image-based harassment.
 */
export default function BlockAwareAvatar({
  uid,
  photoURL,
  displayName,
  size,
  className,
}: Props) {
  const { blocked } = useBlockedUsers();
  const isBlocked = !!uid && blocked.has(uid);
  return (
    <Avatar
      photoURL={isBlocked ? null : photoURL}
      displayName={displayName}
      size={size}
      className={className}
    />
  );
}
