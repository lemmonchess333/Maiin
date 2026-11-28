import { setUsageAnalytics } from "@/lib/analyticsProvider";
import { accountSharesUsageAnalytics } from "@/lib/usageAnalytics";
import { Suspense, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import HealthConsentGate from "@/components/healthConsent/HealthConsentGate";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/lib/auth";
import { hasCurrentHealthConsent } from "@/lib/healthConsent";
import { lazyRetry } from "@/lib/lazyRetry";
import { logger } from "@/lib/logger";

const SettingsAccount = lazyRetry(
  () => import("@/pages/settings/SettingsAccount")
);
const PrivacyPolicy = lazyRetry(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazyRetry(() => import("@/pages/TermsOfService"));
const Support = lazyRetry(() => import("@/pages/Support"));

/** Account's way back to the agreement. */
const BACK_TO_AGREEMENT = { to: "/", label: "Health details" } as const;

function Checking() {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center">
      <Spinner size="lg" label="Loading Tropos" />
    </div>
  );
}

/**
 * Everything an account set up before setup asked for the agreement to
 * store health details can reach until it agrees (Priv1 call 1): the
 * agreement (`HealthConsentGate`) wherever it opens, Account, where
 * Delete account is, and the legal and support pages, as an unfinished
 * setup has them, so the policy can be read before agreeing.
 *
 * App routes here on the profile it holds, which can be this device's copy
 * of the account from before the person agreed on another device. So the
 * account is read once more first, and the gate shows only if that read
 * still carries no agreement (or could not be made): an account that has
 * agreed never sees it flash. Kept mounted across its two routes, so going
 * to Account and back does not read again.
 */
export default function HealthConsentRoutes() {
  const { user, profile, refreshProfile, signOut, updateProfile } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let live = true;
    refreshProfile()
      .catch((err: unknown) =>
        logger.warn("[HealthConsentRoutes] couldn't read the account", err)
      )
      .finally(() => {
        if (live) setChecked(true);
      });
    return () => {
      live = false;
    };
  }, [refreshProfile]);

  if (!checked || !user) return <Checking />;

  return (
    <Suspense fallback={<Checking />}>
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/support" element={<Support />} />
        <Route
          path="/settings/account"
          element={
            <RouteErrorBoundary>
              <main
                className="min-h-dvh bg-background text-foreground px-4 py-6 max-w-lg mx-auto"
                style={{
                  paddingTop: "max(1.5rem, env(safe-area-inset-top))",
                  paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
                }}
              >
                <SettingsAccount back={BACK_TO_AGREEMENT} />
              </main>
            </RouteErrorBoundary>
          }
        />
        <Route
          path="*"
          element={
            <HealthConsentGate
              uid={user.uid}
              analyticsOff={
                profile ? !accountSharesUsageAnalytics(profile) : false
              }
              onTurnOffAnalytics={async () => {
                // As the Settings switch: this device at once, then the
                // account; a save that fails puts the device back.
                setUsageAnalytics(false);
                const saved = await updateProfile({ usageAnalytics: false });
                if (!saved.ok) setUsageAnalytics(true);
                return saved.ok;
              }}
              onAgreed={async () => {
                // What the last read said: the gate says so if none showed
                // the agreement.
                let shown = false;
                await refreshProfile({
                  until: (data) =>
                    (shown = hasCurrentHealthConsent(data.healthDataConsent)),
                });
                return shown;
              }}
              onSignOut={signOut}
            />
          }
        />
      </Routes>
    </Suspense>
  );
}
