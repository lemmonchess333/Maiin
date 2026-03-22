import { useState, type ReactNode, lazy, Suspense } from "react";
import { useSubscription } from "@/lib/subscription";
import { useAuth } from "@/lib/auth";
import { Lock } from "lucide-react";
import { AnimatePresence } from "framer-motion";

const ProModal = lazy(() => import("@/components/ProModal"));

interface Props {
  children: ReactNode;
  feature?: string;
  preview?: ReactNode;
}

export function ProGate({ children, feature, preview }: Props) {
  const { loading } = useAuth();
  const { isPro } = useSubscription();
  const [showPaywall, setShowPaywall] = useState(false);

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
          <Lock className="w-5 h-5 text-muted-foreground" />
          <button
            onClick={() => setShowPaywall(true)}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-lg hover:opacity-90 transition-opacity"
          >
            Unlock with Pro
          </button>
          {feature && (
            <p className="text-[11px] text-muted-foreground">{feature}</p>
          )}
        </div>
      </div>

      {/* Pro Purchase Modal */}
      <AnimatePresence>
        {showPaywall && (
          <Suspense fallback={null}>
            <ProModal onClose={() => setShowPaywall(false)} feature={feature} />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}
