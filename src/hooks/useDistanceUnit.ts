import { useAuth } from "@/lib/auth";
import { resolveDistanceUnit, type DistanceUnit } from "@/lib/distanceUnits";

/**
 * The unit this user reads distances and paces in.
 *
 * One place resolves the preference, so a surface can't accidentally read
 * the raw field and mis-handle the absent case — every unrecognised or
 * missing value is metric, which is the app's default and what every
 * existing user has.
 *
 * Read at the DISPLAY edge only. Storage stays metric everywhere (metres,
 * seconds per kilometre); this never reaches a write path.
 */
export function useDistanceUnit(): DistanceUnit {
  const { profile } = useAuth();
  return resolveDistanceUnit(profile?.preferredDistanceUnit);
}
