import { useState, useCallback, type ReactNode } from "react";
import { featureFlagDefaults, FlagContext, type FlagState, type FeatureFlagKey } from "./featureFlags";

const STORAGE_KEY = "tropos-feature-flags";

function loadFlags(): FlagState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...featureFlagDefaults, ...JSON.parse(stored) };
    }
  } catch {
    // ignore parse errors
  }
  return { ...featureFlagDefaults };
}

export function FeatureFlagProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FlagState>(loadFlags);

  const toggle = useCallback((key: FeatureFlagKey) => {
    setFlags((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <FlagContext.Provider value={{ flags, toggle }}>
      {children}
    </FlagContext.Provider>
  );
}
