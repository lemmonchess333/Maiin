import { useState, type ReactNode } from "react";
import { useSubscription } from "@/lib/subscription";
import { Lock, Crown, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PRO_BENEFITS = [
  { id: "adaptive_tdee", label: "Adaptive TDEE Intelligence", desc: "Auto-adjust targets based on your body's response" },
  { id: "ai_coaching", label: "AI Coaching Insights", desc: "Personalized recommendations powered by AI" },
  { id: "advanced_analytics", label: "Advanced Analytics", desc: "Deep performance metrics and trend analysis" },
  { id: "rollover_calories", label: "Rollover Calories", desc: "Flexible weekly calorie budgeting" },
  { id: "custom_challenges", label: "Custom Challenges", desc: "Create and share challenges with friends" },
  { id: "streak_freeze", label: "Streak Freeze", desc: "Protect your streak on rest days" },
  { id: "programme_gen", label: "Programme Generation", desc: "AI-generated training programmes" },
];

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

  // Reorder benefits to show the triggering feature first
  const sortedBenefits = feature
    ? [
        ...PRO_BENEFITS.filter((b) => b.label.toLowerCase().includes(feature.toLowerCase()) || b.id === feature),
        ...PRO_BENEFITS.filter((b) => !b.label.toLowerCase().includes(feature.toLowerCase()) && b.id !== feature),
      ]
    : PRO_BENEFITS;

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

      {/* Contextual Paywall Modal */}
      <AnimatePresence>
        {showPaywall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
            onClick={() => setShowPaywall(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl p-6 space-y-5 max-h-[85vh] overflow-y-auto"
              style={{ background: "rgba(15, 15, 20, 0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.08)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-bold text-foreground">Maiin Pro</h3>
                </div>
                <button onClick={() => setShowPaywall(false)} className="p-1 rounded-lg hover:bg-muted">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="space-y-2">
                {sortedBenefits.slice(0, 5).map((benefit, i) => (
                  <div key={benefit.id} className={`flex items-start gap-3 p-3 rounded-xl ${i === 0 && feature ? 'bg-primary/5 border border-primary/20' : ''}`}>
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{benefit.label}</p>
                      <p className="text-[11px] text-muted-foreground">{benefit.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl border border-border/50 text-center">
                  <p className="text-lg font-bold text-foreground">£2.99</p>
                  <p className="text-xs text-muted-foreground">/month</p>
                </div>
                <div className="p-4 rounded-xl border-2 border-primary text-center relative">
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">BEST VALUE</span>
                  <p className="text-lg font-bold text-foreground">£29.99</p>
                  <p className="text-xs text-muted-foreground">/year</p>
                </div>
              </div>

              <button className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-bold shadow-[var(--ds-shadow-purple-glow)]">
                Start 7-Day Free Trial
              </button>

              <p className="text-[10px] text-muted-foreground text-center">
                Cancel anytime. No charge during trial.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
