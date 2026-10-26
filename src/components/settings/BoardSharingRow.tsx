import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { haptic } from "@/lib/haptic";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import { setBoardSharing } from "@/lib/boardSharing";
import {
  isRestrictedRefusal,
  showRestrictedToast,
} from "@/lib/accountRestriction";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";

/**
 * Show my week on friends' boards (Polish2 call 5). Off until the person
 * says yes, here or on the board's own "Show my week" row: nothing of
 * their week is computed or stored before then. The answer is the
 * server's to store (the setBoardSharing callable writes it and this
 * week's tally together), so the switch shows the answer it is waiting
 * for and settles once the profile has it.
 */
export default function BoardSharingRow({
  shared,
  refreshProfile,
}: {
  shared: boolean | undefined;
  refreshProfile: () => Promise<void>;
}) {
  const [pending, setPending] = useState<boolean | null>(null);
  const checked = pending ?? shared === true;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3 rounded-lg bg-muted">
      <div className="min-w-[min(100%,8em)] flex-1">
        <p className="text-sm font-medium text-foreground">
          Show my week on friends&rsquo; boards
        </p>
        <p className="text-xs text-muted-foreground">
          Followers see this week&rsquo;s sessions, distance and weight lifted.
          Off, none of it is kept.
        </p>
      </div>
      <Toggle
        checked={checked}
        disabled={pending !== null}
        label="Toggle showing my week on friends' boards"
        onChange={async () => {
          if (pending !== null) return;
          const next = shared !== true;
          haptic("light");
          trackSettingsEvent("settings_toggle_changed", {
            toggle: "show_week_on_board",
            value: next,
          });
          setPending(next);
          try {
            await setBoardSharing(next);
            await refreshProfile();
          } catch (err) {
            if (isRestrictedRefusal(err)) {
              showRestrictedToast();
            } else {
              logger.error("[friendsBoard] sharing change failed", err);
              toast.error("Couldn't change who sees your week. Try again.");
            }
          } finally {
            setPending(null);
          }
        }}
      />
    </div>
  );
}
