import { useState } from "react";
import { Flame } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { usePartnerStreak } from "./usePartnerStreak";

interface PartnerStreakCardProps {
  /** The profile being viewed. */
  partnerUid: string;
  /** Display name for copy ("Start a streak with Alex"). */
  partnerName: string;
}

/**
 * Partner-streak entry point on a user's profile (SOCIAL S3 — Soc6
 * mutual-follow auto-eligible model). Renders nothing unless the two
 * users follow each other; then either a "Start streak" CTA or the live
 * streak with an inline end-confirm.
 *
 * Cold-start note: a freshly-created bond sits at `streak === 0` until
 * both partners log on the same day (the activity-persist slice). That
 * is the correct cold state, not a bug — the copy reads "Streak ready"
 * rather than showing a misleading "0 days".
 */
export default function PartnerStreakCard({
  partnerUid,
  partnerName,
}: PartnerStreakCardProps) {
  const { loading, mutualFollow, bond, busy, start, end } =
    usePartnerStreak(partnerUid);
  const [confirming, setConfirming] = useState(false);

  // Hidden until eligibility resolves — avoids a flash of the start CTA
  // before we know whether a bond already exists.
  if (loading || !mutualFollow) return null;

  const handleStart = async () => {
    haptic("medium");
    try {
      await start();
      toast.success(`Streak started with ${partnerName}`);
    } catch (err) {
      logger.error("[PartnerStreakCard] start failed", err);
      haptic("error");
      toast.error("Couldn't start the streak. Try again.");
    }
  };

  const handleEnd = async () => {
    haptic("light");
    try {
      await end();
      setConfirming(false);
      toast.success("Streak ended");
    } catch (err) {
      logger.error("[PartnerStreakCard] end failed", err);
      haptic("error");
      toast.error("Couldn't end the streak. Try again.");
    }
  };

  // ---- Bonded: live streak ----
  if (bond) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-orange-500/10">
          <Flame className="size-5 text-orange-500" />
        </div>
        <div className="flex-1">
          {bond.streak > 0 ? (
            <p className="text-sm font-bold">
              <span className="font-mono tabular-nums">{bond.streak}</span>
              {" day streak"}
            </p>
          ) : (
            <p className="text-sm font-bold">Streak ready</p>
          )}
          <p className="text-xs text-muted-foreground">
            {bond.streak > 0
              ? `Keep logging on the same day as ${partnerName}`
              : `Log on the same day as ${partnerName} to begin`}
          </p>
        </div>
        {confirming ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEnd}
              loading={busy}
            >
              End
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            className="text-muted-foreground"
          >
            End
          </Button>
        )}
      </div>
    );
  }

  // ---- Eligible, no bond: start CTA ----
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-orange-500/10">
        <Flame className="size-5 text-orange-500" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold">Start a streak</p>
        <p className="text-xs text-muted-foreground">
          Log on the same day as {partnerName} to build a streak together
        </p>
      </div>
      <Button variant="primary" size="sm" onClick={handleStart} loading={busy}>
        Start streak
      </Button>
    </div>
  );
}
