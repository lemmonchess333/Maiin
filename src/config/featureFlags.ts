import { createContext, useContext } from "react";

export const featureFlagDefaults = {
  foodHeroRing: false,
} as const;

export type FeatureFlagKey = keyof typeof featureFlagDefaults;

export type FlagState = Record<FeatureFlagKey, boolean>;

export interface FlagContextValue {
  flags: FlagState;
  toggle: (key: FeatureFlagKey) => void;
}

export const FlagContext = createContext<FlagContextValue>({
  flags: { ...featureFlagDefaults },
  toggle: () => {},
});

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return useContext(FlagContext).flags[key];
}

export function useFeatureFlagToggle(): (key: FeatureFlagKey) => void {
  return useContext(FlagContext).toggle;
}
