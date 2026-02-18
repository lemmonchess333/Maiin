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