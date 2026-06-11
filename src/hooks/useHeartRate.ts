import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  maxHrFromAge,
  hrZones,
  zoneForHr,
  type HrZone,
  type ZoneNumber,
} from "@/lib/hrZones";
import {
  getHeartRateSource,
  type HeartRateSubscription,
} from "@/lib/heartRateSource";

export interface HeartRateState {
  /** Effective max HR: user-measured if set, else the age estimate, else 0. */
  maxHr: number;
  /** Whether `maxHr` came from a real measurement vs the age estimate. */
  maxHrSource: "measured" | "estimate" | "unknown";
  /** The five zones for `maxHr` (empty when maxHr is unknown). */
  zones: HrZone[];
  /** Whether this platform can stream live HR (false on web). */
  liveAvailable: boolean;
  /** Latest live bpm, or null when not streaming / no source. */
  bpm: number | null;
  /** Current zone (1–5), 0 below Z1, or null when not streaming. */
  zone: 0 | ZoneNumber | null;
}

/**
 * Heart-rate hook — resolves the user's effective max HR and (when a live
 * source exists) the current bpm + zone.
 *
 * `maxHr` resolution mirrors the runFitness/maxHeartRate persistence intent: a
 * measured value (profile.maxHeartRate) always beats the age estimate
 * (Tanaka via hrZones.maxHrFromAge). With neither, `maxHr` is 0 and zones are
 * empty — consumers should prompt for age/max rather than render bogus bands.
 *
 * Live streaming is gated on `getHeartRateSource().available`, which is
 * `false` on web today (no browser HR API) and on native until the HealthKit
 * plugin lands. Passing `live: false` (the default) skips the subscription
 * entirely — the static zone preview (Settings) needs no stream.
 */
export function useHeartRate(opts: { live?: boolean } = {}): HeartRateState {
  const { live = false } = opts;
  const { profile } = useAuth();

  const measured = profile?.maxHeartRate ?? null;
  const age = profile?.age ?? 0;

  const { maxHr, maxHrSource } = useMemo(() => {
    if (measured && measured > 0) {
      return { maxHr: measured, maxHrSource: "measured" as const };
    }
    const est = maxHrFromAge(age);
    if (est > 0) return { maxHr: est, maxHrSource: "estimate" as const };
    return { maxHr: 0, maxHrSource: "unknown" as const };
  }, [measured, age]);

  const zones = useMemo(() => hrZones(maxHr), [maxHr]);

  const source = useMemo(() => getHeartRateSource(), []);
  const liveAvailable = source.available;

  const [bpm, setBpm] = useState<number | null>(null);
  const subRef = useRef<HeartRateSubscription | null>(null);

  useEffect(() => {
    // No synchronous setState here — bpm starts null and the cleanup below
    // resets it when `live`/availability flips off (avoids a cascading render).
    if (!live || !liveAvailable) return;
    subRef.current = source.subscribe((next) => setBpm(next));
    return () => {
      subRef.current?.stop();
      subRef.current = null;
      setBpm(null);
    };
  }, [live, liveAvailable, source]);

  const zone = useMemo<0 | ZoneNumber | null>(() => {
    if (bpm == null || maxHr <= 0) return null;
    return zoneForHr(bpm, maxHr);
  }, [bpm, maxHr]);

  return { maxHr, maxHrSource, zones, liveAvailable, bpm, zone };
}
