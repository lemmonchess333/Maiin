import { Flame } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface PartnerStreakHeroProps {
  /** Navigate the user toward finding a partner (the Find tab). */
  onFindPartner: () => void;
}

/**
 * Generic partner-streak INVITE hero for the solo-first Social tab
 * (SOCIAL S4). Distinct from the per-profile `PartnerStreakCard` (S3),
 * which starts a bond with one specific person you're viewing — this is
 * the discovery prompt shown when you have no partners yet, pointing at
 * the Find tab to follow someone first (the mutual-follow consent gate).
 */
export default function PartnerStreakHero({
  onFindPartner,
}: PartnerStreakHeroProps) {
  return (
    <div className="rounded-2xl bg-card border border-border/50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-orange-500/10 shrink-0">
          <Flame className="size-6 text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold">Start a partner streak</h3>
          <p className="text-small text-muted-foreground mt-0.5">
            Pair up with a friend and keep each other consistent — log on the
            same day to build a shared streak.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={onFindPartner}
            className="mt-3"
          >
            Find a partner
          </Button>
        </div>
      </div>
    </div>
  );
}
