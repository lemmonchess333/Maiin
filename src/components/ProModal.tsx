import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { cn } from "@/lib/utils";
import { X, Sparkles, Check } from "lucide-react";
import { motion } from "framer-motion";

const PLANS = [
  { id: "monthly" as const, label: "Monthly", price: "\u00A32.99", period: "/mo" },
  { id: "yearly" as const, label: "Yearly", price: "\u00A329.99", period: "/yr", badge: "Save 17%" },
  { id: "lifetime" as const, label: "Lifetime", price: "\u00A399", period: "", badge: "Best value" },
];

const PRO_FEATURES = [
  "Unlimited AI photo food logging",
  "Full Performance Engine & program",
  "AI adaptive macros & coaching",
  "Advanced analytics & insights",
  "Food database search",
  "In-session workout tracking",
];

interface Props {
  onClose: () => void;
  feature?: string;
}

export default function ProModal({ onClose, feature }: Props) {
  const { checkout, loading } = useStripeCheckout();

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-50"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl max-h-[90vh] overflow-y-auto safe-area-pb"
        style={{ background: "rgba(15, 15, 20, 0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.08)" }}
      >
        <div className="max-w-md mx-auto p-5 space-y-5">
          {/* Handle */}
          <div className="w-10 h-1 rounded-full bg-border mx-auto" />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Upgrade to Pro</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {feature && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{feature}</span> is a Pro feature.
              Upgrade to unlock it.
            </p>
          )}

          {/* Feature list */}
          <div className="space-y-2">
            {PRO_FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-green-500 shrink-0" />
                <p className="text-sm text-foreground">{f}</p>
              </div>
            ))}
          </div>

          {/* Pricing */}
          <div className="space-y-2">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => checkout(plan.id)}
                disabled={loading !== null}
                className={cn(
                  "w-full flex items-center justify-between p-4 rounded-xl border transition-all",
                  "bg-card border-border/50 hover:border-primary/50",
                  loading === plan.id && "opacity-50",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">{plan.label}</p>
                    {plan.badge && (
                      <span className="text-[10px] text-primary font-medium">{plan.badge}</span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {loading === plan.id ? "..." : `${plan.price}${plan.period}`}
                </p>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}
