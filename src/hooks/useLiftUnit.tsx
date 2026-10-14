import { createContext, use, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { resolveLiftUnit, type LiftUnit } from "@/lib/liftLoad";

/**
 * The signed-in lifter's unit for lifting loads (Lift18), for every surface
 * that shows one. Kg outside the provider, so a component rendered on its
 * own (a test, a share card) reads loads the way the app always has.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const LiftUnitContext = createContext<LiftUnit>("kg");

/** Mounted once, at the authenticated root, from the profile. */
export function LiftUnitProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  return (
    <LiftUnitContext value={resolveLiftUnit(profile?.liftingWeightUnit)}>
      {children}
    </LiftUnitContext>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLiftUnit(): LiftUnit {
  return use(LiftUnitContext);
}
