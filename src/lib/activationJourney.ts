/** Release switch for the direct plan-to-Today activation journey. */
export const ACTIVATION_JOURNEY_V2_ENABLED = true;

/** A server-stamped profile marker is the source of truth after onboarding. */
export function isActivationJourneyV2(
  profile: { activationJourneyVersion?: number | null } | null | undefined
): boolean {
  return (
    ACTIVATION_JOURNEY_V2_ENABLED && profile?.activationJourneyVersion === 2
  );
}
