import { useFollowersOfMe } from "../../hooks/useFollowersOfMe";

interface Props {
  /** The candidate user's uid — the one being looked at, not the
   *  current user. The badge renders only if they follow the current
   *  user (i.e. they're in the current user's followers set). */
  uid: string;
}

/**
 * Tiny "Follows you" chip rendered next to a user row's displayName
 * in suggested-people lists, search results, and (later) profile
 * headers. Reads from the shared useFollowersOfMe cache so it doesn't
 * re-query Firestore per row.
 *
 * Renders nothing when the candidate doesn't follow the current user.
 * That's the desired UX — no chip is the absence of the signal, not a
 * negative one.
 */
export default function FollowsYouBadge({ uid }: Props) {
  const { followers } = useFollowersOfMe();
  if (!followers.has(uid)) return null;
  return (
    <span
      className="inline-flex items-center text-caption font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0"
      aria-label="This athlete follows you"
    >
      Follows you
    </span>
  );
}
