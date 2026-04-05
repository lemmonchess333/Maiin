import { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Crown,
  Sparkles,
} from "lucide-react";

const ProModal = lazy(() => import("@/components/ProModal"));

const PLANS = [
  { id: "monthly" as const, label: "Monthly", price: "\u00A33.99", period: "/month", badge: null, recommended: false },
  { id: "yearly" as const, label: "Yearly", price: "\u00A334.99", period: "/year", badge: "Save 27%", recommended: true },
];

export default function Upgrade() {
  const navigate = useNavigate();
  const { isPro, isInTrial, trialDaysLeft, tier } = useSubscription();
  const [showProModal, setShowProModal] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/settings")}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Back to Settings"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-foreground">Upgrade to Pro</h1>
            <p className="text-sm text-muted-foreground">Unlock the full experience</p>
          </div>
        </div>
      </header>

      {/* Already Pro */}
      {tier === "pro" && !isInTrial && (
        <div className="bg-card rounded-2xl border-l-4 border-primary p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            <p className="text-base font-semibold text-foreground">You&apos;re on Pro</p>
          </div>
          <p className="text-sm text-muted-foreground">Full access to all features.</p>
          <ul className="space-y-1.5 text-sm text-foreground">
            {["Unlimited AI photo food logging", "Full Performance Engine", "AI adaptive macros", "Advanced insights"].map((f) => (
              <li key={f} className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trial active */}
      {isInTrial && (
        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Full Pro access</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left on your free trial. Subscribe anytime to keep all Pro features.
          </p>
        </div>
      )}

      {/* Comparison + Pricing — shown when not paid Pro */}
      {(!isPro || isInTrial) && (
        <div className="space-y-3">
          {/* Free vs Pro comparison */}
          <div className="bg-card rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-2">
                <p className="font-medium text-muted-foreground uppercase tracking-wider text-xs">
                  Free (forever)
                </p>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li>Weight tracking + trend chart</li>
                  <li>Manual meal logging</li>
                  <li>Full workout logging</li>
                  <li>Basic PR detection</li>
                  <li>Simple summaries</li>
                </ul>
              </div>
              <div className="space-y-2 bg-primary/5 rounded-lg p-2 -m-1">
                <p className="font-medium text-primary uppercase tracking-wider text-xs">
                  Pro
                </p>
                <ul className="space-y-1.5 text-foreground">
                  {["Everything in Free +", "Unlimited AI photo food logging", "Full Performance Engine", "AI adaptive macros", "Advanced insights"].map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Pricing cards */}
          <div className="space-y-2">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setShowProModal(true)}
                className={cn(
                  "w-full flex items-center justify-between p-4 rounded-xl border transition-all relative",
                  plan.recommended
                    ? "bg-primary/10 border-primary ring-2 ring-primary/30"
                    : "bg-card border-border/50 hover:border-primary/50"
                )}
              >
                {plan.recommended && (
                  <span className="absolute -top-2.5 left-4 text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold uppercase tracking-wider">
                    Most popular
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">
                      {plan.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {plan.period}
                    </p>
                  </div>
                  {plan.badge && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
                      {plan.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {plan.price}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showProModal && (
          <Suspense fallback={null}>
            <ProModal onClose={() => setShowProModal(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
