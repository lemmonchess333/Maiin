import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";

/**
 * Accept and Decline for one follow request. People's list and the
 * notification tray answer with this pair, each through
 * `useFollowRequests`' own accept and decline, so a request reads and
 * answers the same wherever it is met.
 */
export default function FollowRequestAnswer({
  name,
  onAccept,
  onDecline,
}: {
  /** The asker's name, so each pair says whose request it answers. */
  name: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button
        aria-label={`Accept ${name}`}
        onClick={() => {
          haptic("medium");
          onAccept();
        }}
      >
        Accept
      </Button>
      <Button
        variant="ghost"
        aria-label={`Decline ${name}`}
        onClick={() => {
          haptic("light");
          onDecline();
        }}
      >
        Decline
      </Button>
    </div>
  );
}
