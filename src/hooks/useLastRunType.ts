/**
 * useLastRunType — the RunTilePicker's "Repeat <type>" memory (RUN-04, the
 * RunFast1 lock's explicitly-deferred last-used-type follow-up, un-deferred
 * with the retention-audit arc).
 *
 * Fetches the user's most recent runs once per mount (same cheap limit-5
 * newest-first scan RunSetupModal uses for its last-run card) and resolves
 * the repeat offer via the pure `resolveRepeatType` rule: the two most
 * recent volume-eligible runs must share the same DIRECT-launch type.
 * Failure is silent — the picker just renders without the repeat row.
 *
 * The answer is stored with the uid it was read for, and only returned
 * while that uid is signed in. Signed out, or switched to another account
 * whose read has not landed (or failed), the hook offers nothing — never
 * the previous account's habit, not even for the render before an effect
 * could have cleared it.
 */
import { useEffect, useState } from "react";
import { fetchSavedRuns } from "@/lib/savedRuns";
import { useUid } from "@/lib/auth";
import { resolveRepeatType } from "@/components/run/runConfigDefaults";
import type { ActivityType } from "@/types/run";

interface RepeatAnswer {
  uid: string | null;
  type: ActivityType | null;
}

export function useLastRunType(): ActivityType | null {
  const uid = useUid();
  const [answer, setAnswer] = useState<RepeatAnswer>({
    uid: null,
    type: null,
  });

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const runs = await fetchSavedRuns(uid, { latest: 5 });
        if (cancelled) return;
        setAnswer({ uid, type: resolveRepeatType(runs) });
      } catch {
        // Silent — the tile picker renders without the repeat row.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return uid !== null && answer.uid === uid ? answer.type : null;
}
