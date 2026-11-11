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
import { appendHeartRateSample } from "@/lib/heartRateSession";

export interface HeartRateState {
  /** Effective max HR: user-measured if set, else the age estimate, else 0. */
  maxHr: number;
  /** Whether `maxHr` came from a real measurement vs the age estimate. */
  maxHrSource: "measured" | "estimate" | "unknown";
  /** The five zones for `maxHr` (empty when maxHr is unknown). */
  zones: HrZone[];
  /* No `liveAvailable` here: its one reader, Settings' zones section, said
     heart rate "streams" while no source exists, and now says where the
     zones come from instead. A surface that needs it when a source lands
     can return it again; `bpm` is null until then. */
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
 * Live streaming starts only for a named, opted-in run. Passing `live: false`
 * (the default) keeps the Settings zone preview independent of the Watch.
 */
export function useHeartRate(
  opts: {
    live?: boolean;
    enabled?: boolean;
    sessionId?: string | null;
    uid?: string | null;
  } = {}
): HeartRateState {
  const { live = false, enabled = false, sessionId = null, uid = null } = opts;
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
    if (!live || !enabled || !sessionId || !uid || !liveAvailable) return;
    let lastSampleAt = 0;
    subRef.current = source.subscribe(
      (next, at, id) => {
        appendHeartRateSample(uid, sessionId, {
          bpm: next,
          at,
          id,
          source: "apple-watch",
        });
        // A beat retransmitted after reconnect belongs in the summary, but
        // is not a live reading on the run HUD.
        if (Date.now() - at > 20_000 || at > Date.now() + 5_000) return;
        lastSampleAt = Date.now();
        setBpm(next);
      },
      undefined,
      sessionId
    );
    const staleTimer = window.setInterval(() => {
      if (lastSampleAt && Date.now() - lastSampleAt > 20_000) setBpm(null);
    }, 5_000);
    return () => {
      window.clearInterval(staleTimer);
      subRef.current?.stop();
      subRef.current = null;
      setBpm(null);
    };
  }, [live, enabled, sessionId, uid, liveAvailable, source]);

  const zone = useMemo<0 | ZoneNumber | null>(() => {
    if (bpm == null || maxHr <= 0) return null;
    return zoneForHr(bpm, maxHr);
  }, [bpm, maxHr]);

  return { maxHr, maxHrSource, zones, bpm, zone };
}
