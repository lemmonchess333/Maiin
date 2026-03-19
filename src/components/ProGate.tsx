import { useState, type ReactNode, lazy, Suspense } from "react";
import { useSubscription } from "@/lib/subscription";
import { Lock } from "lucide-react";
import { AnimatePresence } from "framer-motion";

const ProModal = lazy(() => import("@/components/ProModal"));

interface Props {
  children: ReactNode;
  feature?: string;
  preview?: ReactNode;
}

export function ProGate({ children, feature, preview }: Props) {
  const { isPro } = useSubscription();
  const [showPaywall, setShowPaywall] = useState(false);

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
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
          >
            Unlock with Pro
          </button>
          {feature && (
            <p className="text-[10px] text-muted-foreground">{feature}</p>
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
