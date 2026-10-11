import { useStreaks } from "@/features/streaks/useStreaks";
import { BadgeEarnedContent } from "@/features/streaks/BadgeEarnedModal";

/**
 * The badge a session earned, sealed until it is tapped, on that
 * session's finish screen (FW1 (6)). Any other badge waits on Home as a
 * `NewBadgeRow`. The workout's finish screen shows it under the session's
 * new bests (Pol1); the run's, among its extras, above Done.
 */
export default function SessionBadge() {
  const { newBadge, dismissNewBadge } = useStreaks();
  if (!newBadge) return null;
  return (
    <BadgeEarnedContent
      key={newBadge.id}
      badge={newBadge}
      onDismiss={dismissNewBadge}
      inline
    />
  );
}
