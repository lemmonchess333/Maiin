import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { setBoardSharing } from "@/lib/boardSharing";
import {
  isRestrictedRefusal,
  showRestrictedToast,
} from "@/lib/accountRestriction";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";

/**
 * The signed-in person's own row on a friends board until they choose
 * (Polish2 call 5): their week shows to their followers only once they say
 * so. Nothing is shown for someone who chose not to (Settings → Social &
 * privacy), and nothing once they share, when their row is a row like the
 * others.
 */
export default function ShowMyWeekRow({ onShared }: { onShared: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!profile || profile.showWeekOnBoard !== undefined) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-muted p-3">
      <p className="min-w-[min(100%,10em)] flex-1 text-xs text-muted-foreground">
        Your week shows here once you share it with your followers.
      </p>
      <Button
        variant="secondary"
        loading={busy}
        onClick={async () => {
          haptic("light");
          setBusy(true);
          try {
            await setBoardSharing(true);
            await refreshProfile();
            onShared();
          } catch (err) {
            if (isRestrictedRefusal(err)) {
              showRestrictedToast();
            } else {
              logger.error("[friendsBoard] share failed", err);
              toast.error("Couldn't share your week. Try again.");
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        Show my week
      </Button>
    </div>
  );
}
