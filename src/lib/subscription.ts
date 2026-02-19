import { useAuth } from "./auth";

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
  const { profile } = useAuth();
  
  const tier: Tier = profile?.subscriptionTier || "free";

  return {
    tier,
    features: featureAccess[tier],
  };
}