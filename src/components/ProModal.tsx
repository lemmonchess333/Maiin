import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { purchase, restorePurchases, type PlanId } from "@/lib/purchaseProvider";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { X, Sparkles, TrendingUp, Zap, BarChart2, Utensils, Brain, Dumbbell } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const PLANS = [
  { id: "monthly" as const, label: "Monthly", price: "£2.99", period: "/mo" },
  { id: "yearly" as const, label: "Yearly", price: "£29.99", period: "/yr", badge: "Save 17%" },
  { id: "lifetime" as const, label: "Lifetime", price: "£99", period: "", badge: "Best value" },
];

// Feature-specific hero configs — what to show when a specific feature gate was hit
const FEATURE_HEROES: Record<string, {
  icon: React.ReactNode;
  title: string;
  tagline: string;
  preview: React.ReactNode;
}> = {
  performance: {
    icon: <TrendingUp className="w-6 h-6" style={{ color: THEME.brand }} />,
    title: "Performance Engine",
    tagline: "Your 7-day load score and performance index are ready.",
    preview: (
      <div className="relative rounded-xl overflow-hidden">
        {/* Blurred preview of Performance tab */}
        <div className="blur-sm pointer-events-none select-none p-4 rounded-xl border border-white/10"
          style={{ background: `${THEME.brand}12` }}>
          <div className="flex items-end justify-between mb-2">
            {[42, 55, 61, 58, 70, 74, 68].map((v, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-6 rounded-t-sm" style={{ height: v * 0.8, background: THEME.brand, opacity: 0.7 }} />
                <span className="text-[11px] text-muted-foreground">W{i + 1}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-2xl font-bold" style={{ color: THEME.brand }}>74</span>
            <span className="text-xs text-green-400">↑ +6 this week</span>
          </div>
        </div>
        {/* Lock overlay */}
        <div className="absolute inset-0 flex items-center justify-center rounded-xl"
          style={{ background: 'var(--glass-bg)' }}>
          <div className="flex flex-col items-center gap-1">
            <Sparkles className="w-7 h-7" style={{ color: THEME.brand }} />
            <p className="text-xs font-semibold text-white">Unlock your score</p>
          </div>
        </div>
      </div>
    ),
  },
  ai_coaching: {
    icon: <Brain className="w-6 h-6" style={{ color: THEME.teal }} />,
    title: "AI Coaching Insights",
    tagline: "Personalised recommendations based on your training data.",
    preview: (
      <div className="relative rounded-xl overflow-hidden">
        <div className="blur-sm pointer-events-none select-none p-4 rounded-xl border border-white/10 space-y-2"
          style={{ background: `${THEME.teal}12` }}>
          {["Your lift volume is trending up — consider a deload next week", "Running cadence improved 4% vs last month"].map((t, i) => (
            <div key={i} className="p-2 rounded-lg text-[11px]" style={{ background: `${THEME.teal}18` }}>
              {t}
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-xl"
          style={{ background: 'var(--glass-bg)' }}>
          <div className="flex flex-col items-center gap-1">
            <Brain className="w-7 h-7" style={{ color: THEME.teal }} />
            <p className="text-xs font-semibold text-white">Unlock insights</p>
          </div>
        </div>
      </div>
    ),
  },
  food_logging: {
    icon: <Utensils className="w-6 h-6" style={{ color: THEME.warning }} />,
    title: "AI Food Logging",
    tagline: "Log meals instantly from a photo. No manual searching.",
    preview: (
      <div className="relative rounded-xl overflow-hidden">
        <div className="blur-sm pointer-events-none select-none p-4 rounded-xl border border-white/10"
          style={{ background: `${THEME.warning}12` }}>
          <div className="text-[11px] text-muted-foreground mb-2">Detected: Chicken & rice bowl</div>
          <div className="flex gap-2">
            {[['P', '42g', THEME.teal], ['C', '58g', THEME.brand], ['F', '12g', THEME.warning]].map(([l, v, c]) => (
              <div key={String(l)} className="flex-1 text-center p-2 rounded-lg" style={{ background: `${c}18` }}>
                <p className="text-xs font-bold" style={{ color: String(c) }}>{v}</p>
                <p className="text-[11px] text-muted-foreground">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-xl"
          style={{ background: 'var(--glass-bg)' }}>
          <div className="flex flex-col items-center gap-1">
            <Utensils className="w-7 h-7" style={{ color: THEME.warning }} />
            <p className="text-xs font-semibold text-white">Unlock AI logging</p>
          </div>
        </div>
      </div>
    ),
  },
};

const DEFAULT_HERO = {
  icon: <Sparkles className="w-6 h-6" style={{ color: THEME.brand }} />,
  title: "Upgrade to Pro",
  tagline: "Unlock the full Tropos experience for hybrid athletes.",
  preview: null,
};

const PRO_FEATURES = [
  { icon: <BarChart2 className="w-3.5 h-3.5" />, label: "Performance Engine & load scoring", color: THEME.brand },
  { icon: <Utensils className="w-3.5 h-3.5" />, label: "AI photo food logging", color: THEME.warning },
  { icon: <Brain className="w-3.5 h-3.5" />, label: "AI adaptive macros & coaching", color: THEME.teal },
  { icon: <Dumbbell className="w-3.5 h-3.5" />, label: "In-session workout tracking", color: THEME.lifting },
  { icon: <Zap className="w-3.5 h-3.5" />, label: "Advanced analytics & insights", color: THEME.running },
];

interface Props {
  onClose: () => void;
  feature?: string;
}

export default function ProModal({ onClose, feature }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("yearly");
  const focusTrapRef = useFocusTrap<HTMLDivElement>();

  const handleCheckout = async (plan: PlanId) => {
    if (!user) return;
    setLoading(plan);
    const result = await purchase(plan, user.uid, user.email || '');
    if (!result.success && result.error) {
      toast.error(result.error);
    }
    setLoading(null);
  };

  const handleRestore = async () => {
    const result = await restorePurchases();
    if (result.success) toast.success('Purchases restored successfully.');
    else if (result.error) toast.error(result.error);
  };

  const hero = (feature && FEATURE_HEROES[feature]) ? FEATURE_HEROES[feature] : DEFAULT_HERO;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
      />
      <motion.div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pro-modal-title"
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl max-h-[92vh] overflow-y-auto safe-area-pb"
        style={{ background: 'var(--surface-solid)', borderTop: '1px solid var(--glass-border)' }}
      >
        <div className="max-w-md mx-auto p-5 space-y-5">
          {/* Handle */}
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />

          {/* Close */}
          <button onClick={onClose} className="absolute top-6 right-5 p-1.5 rounded-lg"
            style={{ background: 'var(--glass-border)' }}
            aria-label="Close">
            <X className="w-4 h-4 text-white/60" />
          </button>

          {/* Hero */}
          <div className="text-center space-y-1 pt-1">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: 'var(--glass-border)' }}>
              {hero.icon}
            </div>
            <h2 id="pro-modal-title" className="text-xl font-bold text-white">{hero.title}</h2>
            <p className="text-sm text-white/70">{hero.tagline}</p>
          </div>

          {/* Feature-specific blurred preview */}
          {hero.preview && (
            <div>
              {hero.preview}
            </div>
          )}

          {/* Feature list */}
          <div className="space-y-2">
            {PRO_FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${f.color}20`, color: f.color }}>
                  {f.icon}
                </div>
                <p className="text-sm text-white/80">{f.label}</p>
              </div>
            ))}
          </div>

          {/* Plan selector */}
          <div className="space-y-2">
            {PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-2xl border transition-all",
                    isSelected
                      ? "border-transparent"
                      : "border-white/10 bg-white/5"
                  )}
                  style={isSelected ? {
                    background: `${THEME.brand}18`,
                    borderColor: THEME.brand,
                    boxShadow: `0 0 0 1px ${THEME.brand}40`,
                  } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                    )}
                      style={{ borderColor: isSelected ? THEME.brand : 'rgba(255,255,255,0.3)' }}>
                      {isSelected && <div className="w-2 h-2 rounded-full" style={{ background: THEME.brand }} />}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-white">{plan.label}</p>
                      {plan.badge && (
                        <span className="text-[11px] font-medium" style={{ color: THEME.teal }}>{plan.badge}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {plan.price}<span className="text-white/60 text-xs">{plan.period}</span>
                  </p>
                </button>
              );
            })}
          </div>

          {/* CTA */}
          <button
            onClick={() => handleCheckout(selectedPlan)}
            disabled={loading !== null}
            className="w-full py-4 rounded-2xl text-white font-bold text-base transition-all disabled:opacity-50 brand-cta"
          >
            {loading ? "Loading…" : `Start Pro — ${PLANS.find(p => p.id === selectedPlan)?.price}${PLANS.find(p => p.id === selectedPlan)?.period}`}
          </button>

          {/* Subscription terms (App Store Guideline 3.1.2(c)) */}
          <div className="text-center space-y-1 pb-1">
            <p className="text-[11px] text-white/50">
              {selectedPlan === 'lifetime'
                ? 'One-time purchase. No recurring charges.'
                : `Subscription auto-renews ${selectedPlan === 'monthly' ? 'monthly' : 'annually'} unless cancelled at least 24 hours before the end of the current period.`}
            </p>
            <p className="text-[11px] text-white/50">
              {selectedPlan !== 'lifetime' && 'Manage or cancel anytime in your device settings. '}
              No hidden fees.
            </p>
            <button onClick={handleRestore} className="text-[11px] text-white/60 underline">
              Restore purchases
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
