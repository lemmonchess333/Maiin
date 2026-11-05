import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth";
import { setLeagueSharing } from "@/lib/leagueSharing";
import {
  isRestrictedRefusal,
  showRestrictedToast,
} from "@/lib/accountRestriction";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";

/**
 * Join or leave the weekly leagues from the card or the page: the callable,
 * then the profile (which holds the answer) and the league read again. A
 * restricted account's Join is refused with the app's own words.
 */
export function useLeagueJoin(onChanged: () => void) {
  const { refreshProfile } = useAuth();
  const [busy, setBusy] = useState<"join" | "leave" | null>(null);

  const change = useCallback(
    async (join: boolean): Promise<boolean> => {
      haptic("light");
      setBusy(join ? "join" : "leave");
      try {
        await setLeagueSharing(join);
        await refreshProfile();
        onChanged();
        toast.success(join ? "You're in the league" : "You've left the league");
        return true;
      } catch (err) {
        if (isRestrictedRefusal(err)) {
          showRestrictedToast();
        } else {
          logger.error("[league] join or leave failed", err);
          toast.error(
            join
              ? "Couldn't join the league. Try again."
              : "Couldn't leave the league. Try again."
          );
        }
        return false;
      } finally {
        setBusy(null);
      }
    },
    [refreshProfile, onChanged]
  );

  return {
    busy,
    join: useCallback(() => change(true), [change]),
    leave: useCallback(() => change(false), [change]),
  };
}
