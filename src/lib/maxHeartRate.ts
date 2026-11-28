/**
 * The max heart rate every zone in the app is drawn on, read one way.
 *
 * A measured max (`profile.maxHeartRate`, set in Settings → Run plan) beats
 * the age estimate (Tanaka, `maxHrFromAge`), and the estimate reads the one
 * age the app keeps (`profileAge`). Settings' zones, the run HUD, a run's
 * summary, the day sheet and Train's run card each worked this out on
 * their own, three with `?? 0` and two with `??` on the measured value, so
 * a stored 0 read as measured on some and not on others. This is the one
 * reading; `useHeartRate` adds only the live part.
 */
import { profileAge } from "./age";
import { maxHrFromAge } from "./hrZones";

export type MaxHrSource = "measured" | "estimate" | "unknown";

export interface MaxHr {
  /** Measured if set, else the age estimate, else 0. */
  maxHr: number;
  source: MaxHrSource;
}

export function profileMaxHr(
  profile:
    | {
        maxHeartRate?: number | null;
        birthYear?: number | null;
        age?: number | null;
      }
    | null
    | undefined,
  today?: string
): MaxHr {
  const measured = profile?.maxHeartRate;
  if (typeof measured === "number" && Number.isFinite(measured) && measured > 0)
    return { maxHr: measured, source: "measured" };
  const age = profileAge(profile, today);
  const estimate = age === undefined ? 0 : maxHrFromAge(age);
  return estimate > 0
    ? { maxHr: estimate, source: "estimate" }
    : { maxHr: 0, source: "unknown" };
}
