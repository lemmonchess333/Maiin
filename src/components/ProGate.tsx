import { useState, type ReactNode, lazy, Suspense, useEffect } from "react";
import { useSubscription } from "@/lib/subscription";
import { useAuth } from "@/lib/auth";
import { Lock } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { getProFeature, type ProFeatureKey } from "@/lib/proFeatures";
import { track } from "@/lib/paywallAnalytics";

const ProModal = lazy(() => import("@/components/ProModal"));

interface Props {
  children: ReactNode;
  /** Typed feature key — looked up against PRO_FEATURES so ProModal
   *  gets the matching hero copy. Pre-unification this was a loose
   *  `feature?: string` accepting display labels like "Adaptive
   *  TDEE" which never matched ProModal's hero-key lookup; the
   *  closed union eliminates that drift. */
  featureKey?: ProFeatureKey;
  preview?: ReactNode;
}

export function ProGate({ children, featureKey, preview }: Props) {
  const { loading } = useAuth();
  const { isPro } = useSubscription();
  const [showPaywall, setShowPaywall] = useState(false);

  const feature = getProFeature(featureKey);

  // Show skeleton while auth is still loading to prevent flash of wrong content
  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl bg-muted/50 h-32 w-full" aria-hidden="true" />
    );
  }

  if (isPro) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="relative">
        <div className="opacity-40 pointer-events-none blur-[1px]">
          {preview || children}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Lock className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setShowPaywall(true)}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-lg hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Unlock with Pro
          </button>
          {feature ? (
            <p className="text-xs text-muted-foreground">{feature.label}</p>
          ) : null}
        </div>
      </div>

      {/* Pro Purchase Modal */}
      <AnimatePresence>
        {showPaywall && (
          <Suspense fallback={null}>
            <PaywallMount
              featureKey={featureKey}
              onClose={() => setShowPaywall(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Tiny wrapper around ProModal that emits the `paywall_viewed`
 * event exactly once on mount. Keeps the analytics call colocated
 * with the open-paywall code path rather than scattering it across
 * every callsite that opens ProModal.
 */
function PaywallMount({
  featureKey,
  onClose,
}: {
  featureKey?: ProFeatureKey;
  onClose: () => void;
}) {
  useEffect(() => {
    track("paywall_viewed", {
      source: "feature_gate",
      featureKey,
    });
  }, [featureKey]);

  return <ProModal onClose={onClose} featureKey={featureKey} />;
}
