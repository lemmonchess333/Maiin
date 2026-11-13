import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { isNativePlatform } from "@/lib/platform";
import { readString, scopedKey, writeString } from "@/lib/localStore";
import {
  readDailyAverages,
  readSleepSamples,
  requestBodySignalsReadPermission,
} from "@/lib/healthKit";
import {
  BASELINE_DAYS,
  nightAsleepMinutes,
  todayAgainstUsual,
  usualSleepMinutes,
} from "@/lib/bodySignals";
import type { BodySignals } from "@/lib/readiness";

/** This phone has asked Health for sleep and heart, for this account.
 *  Health's permission belongs to the install, so the flag lives here. */
export const BODY_SIGNALS_ASKED_KEY = "tropos-body-signals-asked";

export interface UseBodySignals {
  /** Today's sleep and heart, or null: off the phone, not Pro, not yet
   *  asked, or still reading. */
  signals: BodySignals | null;
  /** On the phone, for a Pro account, before Health has been asked. */
  canConnect: boolean;
  /** Ask Health to read sleep and heart, then read them. */
  connect: () => Promise<void>;
}

/**
 * Sleep and heart from Apple Health for readiness (whole-app grill Q39-Q44,
 * Q76 as recommended: these are Pro). Read on the phone from Health's own
 * record each time Home opens on a new day; nothing is stored or sent.
 *
 * `enabled` is the caller's Pro check. Off the phone, or when not enabled,
 * this reads nothing and asks nothing.
 */
export function useBodySignals(enabled: boolean): UseBodySignals {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const today = useLocalDateKey();
  const native = isNativePlatform();
  const key = uid ? scopedKey(BODY_SIGNALS_ASKED_KEY, uid) : null;
  const [asked, setAsked] = useState(() =>
    key ? readString(key) === "1" : false
  );
  const [signals, setSignals] = useState<BodySignals | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- another account's flag
    setAsked(key ? readString(key) === "1" : false);
  }, [key]);

  useEffect(() => {
    if (!native || !enabled || !asked) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to read
      setSignals(null);
      return;
    }
    let cancelled = false;
    const [y, m, d] = today.split("-").map(Number);
    // The first night read ends the morning BASELINE_DAYS ago, so its
    // window opens the evening before.
    const start = new Date(y, m - 1, d - BASELINE_DAYS - 1, 18, 0, 0, 0);
    const end = new Date();
    void Promise.all([
      readSleepSamples(start, end),
      readDailyAverages("restingHeartRate", start, end),
      readDailyAverages("heartRateVariability", start, end),
    ]).then(([sleep, rhr, hrv]) => {
      if (cancelled) return;
      const heart = todayAgainstUsual(rhr ?? [], today);
      const variability = todayAgainstUsual(hrv ?? [], today);
      setSignals({
        sleepMinutes: sleep ? nightAsleepMinutes(sleep, today) : null,
        usualSleepMinutes: sleep ? usualSleepMinutes(sleep, today) : null,
        restingHr: heart.today,
        usualRestingHr: heart.usual,
        hrv: variability.today,
        usualHrv: variability.usual,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [native, enabled, asked, today]);

  const connect = useCallback(async () => {
    if (!native || !enabled) return;
    await requestBodySignalsReadPermission();
    if (key) writeString(key, "1");
    setAsked(true);
  }, [native, enabled, key]);

  return {
    signals: native && enabled && asked ? signals : null,
    canConnect: native && enabled && !asked,
    connect,
  };
}
