/**
 * ProModal — gated-feature paywall bottom sheet.
 *
 * Conversion-critical surface. Users land here when they tap a
 * Pro-locked feature (via ProGate) or any "Upgrade to Pro" entry
 * point that wants a quick checkout flow rather than full-page
 * pricing.
 *
 * Architecture (after the unification commit)
 * -------------------------------------------
 * Three things changed beyond the visual recovery:
 *
 *   1. `feature?: string` → `featureKey?: ProFeatureKey`. Closed
 *      TypeScript union, looked up against the shared
 *      `proFeatures` registry. Pre-unification ProGate forwarded
 *      display strings like "Adaptive TDEE" that never matched
 *      the modal's hero-key map — feature-specific copy never
 *      rendered for those callsites.
 *
 *   2. `initialPlan?: PlanId`. The Upgrade page used to open this
 *      modal as the checkout step regardless of which plan tile
 *      the user tapped, so a Monthly tap silently became a
 *      Yearly checkout (the spec's headline bug). The Upgrade
 *      page now does its own selection + direct checkout; this
 *      prop exists for any future callsite that wants to pre-
 *      select a plan when opening the modal.
 *
 *   3. Checkout state moved to the shared `useProCheckout` hook —
 *      one implementation for ProModal and Upgrade.tsx so they
 *      can't diverge on loading / error / auth handling.
 */
import { useEffect, useState } from "react";
import { THEME } from "@/lib/theme";
import {
  PRO_PLANS,
  DEFAULT_PLAN,
  getCheckoutCtaLabel,
  getRenewalDisclosure,
  type PlanId,
} from "@/lib/proPlans";
import { getProFeature, type ProFeatureKey } from "@/lib/proFeatures";
import { isNativeIOS } from "@/lib/purchaseProvider";
import { useProCheckout } from "@/hooks/useProCheckout";
import { track } from "@/lib/paywallAnalytics";
import {
  X,
  Sparkles,
  TrendingUp,
  Zap,
  BarChart2,
  Utensils,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Feature-specific blurred-preview cards. Keyed by `ProFeatureKey`
 * so the lookup is type-safe — any drift between proFeatures.ts
 * and this map gets caught by the compiler.
 *
 * Not every feature key has a custom preview (the registry has 6
 * entries; this map covers the 3 we have visual previews for). The
 * other keys fall back to the registry's title + tagline without a
 * preview card.
 */
const FEATURE_PREVIEWS: Partial<
  Record<ProFeatureKey, { icon: React.ReactNode; preview: React.ReactNode }>
> = {
  performance_engine: {
    icon: <TrendingUp className="w-6 h-6" style={{ color: THEME.brand }} />,
    preview: (
      <div className="relative rounded-xl overflow-hidden">
        <div
          className="blur-sm pointer-events-none select-none p-4 rounded-xl border border-border"
          style={{ background: `${THEME.brand}12` }}
        >
          <div className="flex items-end justify-between mb-2">
            {[42, 55, 61, 58, 70, 74, 68].map((v, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className="w-6 rounded-t-sm"
                  style={{
                    height: v * 0.8,
                    background: THEME.brand,
                    opacity: 0.7,
                  }}
                />
                <span className="text-xs text-muted-foreground">W{i + 1}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-2xl font-bold" style={{ color: THEME.brand }}>
              74
            </span>
            <span className="text-xs text-success">↑ +6 this week</span>
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/85">
          <div className="flex flex-col items-center gap-1">
            <Sparkles className="w-7 h-7" style={{ color: THEME.brand }} />
            <p className="text-xs font-semibold text-foreground">Unlock your score</p>
          </div>
        </div>
      </div>
    ),
  },
  ai_coaching: {
    icon: <Brain className="w-6 h-6" style={{ color: THEME.teal }} />,
    preview: (
      <div className="relative rounded-xl overflow-hidden">
        <div
          className="blur-sm pointer-events-none select-none p-4 rounded-xl border border-border space-y-2"
          style={{ background: `${THEME.teal}12` }}
        >
          {[
            "Your lift volume is trending up — consider a deload next week",
            "Running cadence improved 4% vs last month",
          ].map((t, i) => (
            <div
              key={i}
              className="p-2 rounded-lg text-xs text-foreground"
              style={{ background: `${THEME.teal}18` }}
            >
              {t}
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/85">
          <div className="flex flex-col items-center gap-1">
            <Brain className="w-7 h-7" style={{ color: THEME.teal }} />
            <p className="text-xs font-semibold text-foreground">Unlock insights</p>
          </div>
        </div>
      </div>
    ),
  },
  ai_food_logging: {
    icon: <Utensils className="w-6 h-6" style={{ color: THEME.warning }} />,
    preview: (
      <div className="relative rounded-xl overflow-hidden">
        <div
          className="blur-sm pointer-events-none select-none p-4 rounded-xl border border-border"
          style={{ background: `${THEME.warning}12` }}
        >
          <div className="text-xs text-muted-foreground mb-2">
            Detected: Chicken &amp; rice bowl
          </div>
          <div className="flex gap-2">
            {[
              ["P", "42g", THEME.teal],
              ["C", "58g", THEME.brand],
              ["F", "12g", THEME.warning],
            ].map(([l, v, c]) => (
              <div
                key={String(l)}
                className="flex-1 text-center p-2 rounded-lg"
                style={{ background: `${c}18` }}
              >
                <p className="text-xs font-bold" style={{ color: String(c) }}>
                  {v}
                </p>
                <p className="text-xs text-muted-foreground">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/85">
          <div className="flex flex-col items-center gap-1">
            <Utensils className="w-7 h-7" style={{ color: THEME.warning }} />
            <p className="text-xs font-semibold text-foreground">Unlock AI logging</p>
          </div>
        </div>
      </div>
    ),
  },
};

const DEFAULT_HERO = {
  icon: <Sparkles className="w-6 h-6" style={{ color: THEME.brand }} />,
  title: "Upgrade to Pro",
  tagline: "Unlock smarter logging, deeper insights and adaptive coaching.",
};

const PRO_FEATURE_BULLETS: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  color: string;
}[] = [
  {
    icon: <BarChart2 className="w-4 h-4" />,
    label: "Performance Engine",
    sub: "Recovery, consistency and training-load signals.",
    color: THEME.brand,
  },
  {
    icon: <Utensils className="w-4 h-4" />,
    label: "Unlimited AI food photo logging",
    sub: "Log meals from a photo. No manual searching.",
    color: THEME.warning,
  },
  {
    icon: <Brain className="w-4 h-4" />,
    label: "Adaptive macros",
    sub: "Targets that adjust to your weight and activity.",
    color: THEME.teal,
  },
  {
    icon: <Zap className="w-4 h-4" />,
    label: "Advanced insights",
    sub: "Trends across food, lifting and running.",
    color: THEME.running,
  },
];

interface Props {
  onClose: () => void;
  featureKey?: ProFeatureKey;
  /** Pre-select a plan when the modal opens. Defaults to the
   *  recommended plan (DEFAULT_PLAN). Used by entry points that
   *  want a specific plan focused — e.g. a "Save 27% with yearly"
   *  promo could pass "yearly" explicitly. */
  initialPlan?: PlanId;
}

export default function ProModal({ onClose, featureKey, initialPlan }: Props) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(
    initialPlan ?? DEFAULT_PLAN,
  );
  const { loading, error, startCheckout, requiresSignIn } = useProCheckout();

  const platform: "web" | "ios" = isNativeIOS() ? "ios" : "web";
  const showRestore = isNativeIOS();

  const feature = getProFeature(featureKey);
  const featurePreview = featureKey ? FEATURE_PREVIEWS[featureKey] : undefined;

  // Hero derived from the registry when a featureKey is supplied,
  // otherwise the generic upgrade hero.
  const hero = feature
    ? {
        icon: featurePreview?.icon ?? DEFAULT_HERO.icon,
        title: feature.title,
        tagline: feature.tagline,
      }
    : DEFAULT_HERO;

  const handlePlanSelect = (plan: PlanId) => {
    setSelectedPlan(plan);
    track("paywall_plan_selected", {
      source: featureKey ? "feature_gate" : "unknown",
      featureKey,
      selectedPlan: plan,
      platform,
    });
  };

  const handleCheckout = () => {
    track("paywall_cta_clicked", {
      source: featureKey ? "feature_gate" : "unknown",
      featureKey,
      selectedPlan,
      platform,
    });
    void startCheckout(selectedPlan, {
      source: featureKey ? "feature_gate" : "unknown",
      featureKey,
    });
  };

  // Restore purchases is iOS-only. `restorePurchases()` on web
  // returns an error — rendering the link there was an anti-pattern
  // (links that don't work).
  const handleRestore = async () => {
    track("restore_purchases_clicked", {
      source: featureKey ? "feature_gate" : "unknown",
      featureKey,
      platform,
    });
    const { restorePurchases } = await import("@/lib/purchaseProvider");
    const result = await restorePurchases();
    const { toast } = await import("sonner");
    if (result.success) {
      toast.success("Purchases restored successfully.");
    } else if (result.error) {
      toast.error(result.error);
    }
  };

  // CTA label flips when there's no user — never leave a checkout
  // button disabled with no explanation.
  const ctaLabel = requiresSignIn
    ? "Sign in to start Pro"
    : getCheckoutCtaLabel(selectedPlan);

  // Reset selection if the parent remounts the modal with a different
  // initialPlan (defensive — current callsites always remount on open
  // so the useState initial covers it, but if the component ever
  // becomes controlled while staying mounted, this keeps it in sync).
  useEffect(() => {
    if (initialPlan) setSelectedPlan(initialPlan);
  }, [initialPlan]);

  return (
    <BottomSheet
      open
      onOpenChange={(next) => {
        if (!next && !loading) onClose();
      }}
      title={hero.title}
      description={hero.tagline}
      hideHeader
      maxHeight="max-h-[92dvh]"
      dismissible={!loading}
    >
      {/* Header strip — visual drag handle + close X. hideHeader on
          the primitive lets us own this layout; BottomSheet emits a
          sr-only Drawer.Title + Drawer.Description for SRs. */}
      <div className="relative shrink-0 px-5 pt-3 pb-2">
        <div className="w-10 h-1 rounded-full bg-border mx-auto" aria-hidden="true" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close upgrade modal"
          disabled={loading}
          className="absolute top-2 right-3 w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-[0.97] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 space-y-5">
        {/* Hero */}
        <div className="text-center space-y-2">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: `${THEME.brand}14` }}
          >
            {hero.icon}
          </div>
          <h2 className="text-xl font-extrabold text-foreground">{hero.title}</h2>
          <p className="text-sm text-muted-foreground max-w-[320px] mx-auto leading-relaxed">
            {hero.tagline}
          </p>
        </div>

        {/* Feature-specific blurred preview (only when a feature gate
            opened the modal AND we have a preview for that key). */}
        {featurePreview ? <div>{featurePreview.preview}</div> : null}

        {/* Feature bullet list. */}
        <ul className="space-y-3" aria-label="Pro features">
          {PRO_FEATURE_BULLETS.map((f) => (
            <li key={f.label} className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                aria-hidden="true"
                style={{ background: `${f.color}1A`, color: f.color }}
              >
                {f.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">
                  {f.label}
                </p>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                  {f.sub}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {/* Plan selector — radiogroup. */}
        <div
          role="radiogroup"
          aria-label="Choose Pro billing plan"
          className="space-y-2"
        >
          {PRO_PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={loading}
                onClick={() => handlePlanSelect(plan.id)}
                className={cn(
                  "relative w-full flex items-center justify-between p-4 rounded-2xl border transition-colors text-left",
                  "min-h-[64px]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                {plan.topBadge ? (
                  <span className="absolute -top-2.5 left-4 text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold uppercase tracking-wider">
                    {plan.topBadge}
                  </span>
                ) : null}

                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                      isSelected ? "border-primary" : "border-border",
                    )}
                    aria-hidden="true"
                  >
                    {isSelected ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-tight">
                      {plan.label}
                    </p>
                    {plan.savingsLabel ? (
                      <p className="text-xs font-medium text-success mt-0.5">
                        {plan.savingsLabel}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Billed {plan.billingFrequency}
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-base font-bold text-foreground tabular-nums">
                  {plan.price}
                  <span className="text-xs font-medium text-muted-foreground">
                    {plan.period}
                  </span>
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sticky footer — CTA + disclosure + optional restore. */}
      <div className="shrink-0 border-t border-border bg-background px-5 pt-3 pb-3 space-y-2">
        {error ? (
          <p
            role="alert"
            className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={loading}
          className={cn(
            "w-full min-h-[52px] rounded-2xl text-white font-bold text-base",
            "flex items-center justify-center gap-2",
            "active:scale-[0.98] transition-transform duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
          style={{
            background: `linear-gradient(135deg, ${THEME.brand}, ${THEME.teal})`,
          }}
        >
          {loading ? (
            <>
              <Spinner size="sm" variant="inverse" label="Starting checkout" />
              <span>Starting checkout…</span>
            </>
          ) : (
            <span>{ctaLabel}</span>
          )}
        </button>

        <p className="text-[11px] text-muted-foreground text-center leading-snug">
          {getRenewalDisclosure(selectedPlan, platform)}
        </p>

        {showRestore ? (
          <button
            type="button"
            onClick={handleRestore}
            disabled={loading}
            className="block mx-auto text-[11px] text-muted-foreground underline underline-offset-2 disabled:opacity-50"
          >
            Restore purchases
          </button>
        ) : null}
      </div>
    </BottomSheet>
  );
}
