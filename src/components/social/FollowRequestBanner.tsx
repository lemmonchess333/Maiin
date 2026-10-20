import { Button } from "@/components/ui/Button";
import { useFollowRequestFrom } from "@/hooks/useFollowRequests";
import { haptic } from "@/lib/haptic";

/**
 * On the profile of someone who has asked to follow you: the request and
 * its answer, where its notification opens (Polish2). Nothing otherwise.
 */
export default function FollowRequestBanner({
  requesterUid,
  name,
  onAccepted,
}: {
  requesterUid: string;
  name: string;
  /** After a yes: they follow you now. */
  onAccepted?: () => void;
}) {
  const { asked, busy, accept, decline } = useFollowRequestFrom(requesterUid);
  if (!asked) return null;

  return (
    <div
      role="status"
      className="space-y-3 rounded-xl border border-border/50 bg-card p-3"
    >
      <p className="text-sm font-medium text-foreground">
        {name} asked to follow you
      </p>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            haptic("medium");
            if (await accept()) onAccepted?.();
          }}
        >
          Accept
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onClick={() => {
            haptic("light");
            void decline();
          }}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
