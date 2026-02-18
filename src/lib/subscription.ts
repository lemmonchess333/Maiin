export type Tier = "free" | "pro";

export const pricing = {
  monthly: 2.99,
  yearly: 29.99,
  currency: "GBP",
};

export const featureAccess = {
  free: {
    workoutLogging: true,
    foodLogging: true,
    basicSummary: true,
    aiAdjustments: false,
    plateauDetection: false,
    phaseModes: false,
    performanceInsights: false,
  },
  pro: {
    workoutLogging: true,
    foodLogging: true,
    basicSummary: true,
    aiAdjustments: true,
    plateauDetection: true,
    phaseModes: true,
    performanceInsights: true,
  },
};

export function useSubscription(): { tier: Tier; features: typeof featureAccess.free } {
  // TODO: Replace with real Stripe/RevenueCat check
  const tier: Tier = "free";
  return {
    tier,
    features: featureAccess[tier],
  };
}
