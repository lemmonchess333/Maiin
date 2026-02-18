export type Tier = "free" | "pro";

export const featureAccess = {
  free: {
    aiAdjustments: false,
    plateauDetection: false,
    phaseModes: false,
  },
  pro: {
    aiAdjustments: true,
    plateauDetection: true,
    phaseModes: true,
  },
};

export function useSubscription() {
  const tier: Tier = "free"; // Replace later with Stripe/Firebase
  return {
    tier,
    features: featureAccess[tier],
  };
}