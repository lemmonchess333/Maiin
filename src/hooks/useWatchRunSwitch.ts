import { useEffect, useRef } from "react";
import { getWatchRunStatus, setWatchRunEnabled } from "@/lib/watchRunBridge";

/**
 * The account's choice to use the Watch for runs and this phone's native
 * switch must agree. Signing out clears the native switch
 * (`clearWatchRunAccountState`), and Settings → Apple Health
 * (`HealthSection`) was the only place that turned it on again, so after
 * signing back in every snapshot the run page sent was refused natively
 * until Settings was opened. A run the Watch can join turns the switch on
 * when it is off, once per account; turning it off stays with Settings
 * and the account's own choice.
 */
export function useWatchRunSwitch(
  uid: string | null | undefined,
  eligible: boolean
) {
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!eligible || !uid || synced.current === uid) return;
    synced.current = uid;
    void getWatchRunStatus().then((status) => {
      // Still this account's run: a switch made since is the new one's.
      if (synced.current !== uid) return;
      if (status.available && !status.enabled) void setWatchRunEnabled(true);
    });
  }, [uid, eligible]);
}
