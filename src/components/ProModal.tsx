/**
 * ProModal — gated-feature paywall bottom sheet.
 *
 * This is a conversion-critical surface. Users land here when they
 * tap a Pro-locked feature (via ProGate) or the "Upgrade to Pro" CTA
 * on the Upgrade.tsx page. The job is to make the purchase decision
 * obvious in <5 seconds.
 *
 * Recovery commit (claude/promodal-paywall-recovery)
 * ---------------------------------------------------
 * Pre-recovery this modal was the only surface in the app still
 * carrying the original dark-glass aesthetic — hardcoded `text-white`,
 * `text-white/60..80`, `bg-white/5..20`, `border-white/10..20`, and
 * `var(--surface-solid)` / `var(--glass-border)` which in light mode
 * resolve to literally `#ffffff` and near-invisible borders. Result:
 * the monthly tile rendered blank (white text on white background)
 * and the modal looked broken on every device that wasn't in dark
 * mode. This rewrite:
 *
 *   1. Replaces every dark-glass token with semantic Sprint 0 tokens
 *      (text-foreground / text-muted-foreground / bg-card /
 *      border-border) so the modal renders correctly in both themes.
 *   2. Routes the bottom-sheet through the Sprint 3 BottomSheet
 *      primitive instead of rolling its own backdrop + slide-in +
 *      focus trap + scroll lock.
 *   3. Pulls pricing copy from the shared `proPlans.ts` config so
 *      this surface and `Upgrade.tsx` can't drift from each other.
 *   4. Hardens the plan selector as a proper aria radiogroup with
 *      role=radio + aria-checked, keyboard-navigable.
 *   5. Surfaces checkout errors inline above the CTA (not just via
 *      a fading toast). Loading state disables both plan tiles and
 *      the CTA so double-submits are impossible.
 *   6. Hides "Restore purchases" on web — `restorePurchases()`
 *      returns an error on non-iOS so the link did nothing useful
 *      pre-recovery (anti-pattern: links that don't work).
 */
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { purchase, restorePurchases, isNativeIOS } from "@/lib/purchaseProvider";
import { THEME } from "@/lib/theme";
import {
  PRO_PLANS,
  DEFAULT_PLAN,
  getCheckoutCtaLabel,
  getRenewalDisclosure,
  type PlanId,
} from "@/lib/proPlans";
import {
  X,
  Sparkles,
  TrendingUp,
  Zap,
  BarChart2,
  Utensils,
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";

// Feature-specific hero configs — when ProGate opens the modal with
// a `feature` prop, the hero swaps to a feature-anchored title +
// tagline + blurred-preview card showing the user what they're about
// to unlock.
const FEATURE_HEROES: Record<
  string,
  { icon: React.ReactNode; title: string; tagline: string; preview: React.ReactNode }
> = {
  performance: {
    icon: <TrendingUp className="w-6 h-6" style={{ color: THEME.brand }} />,
    title: "Performance Engine",
    tagline: "Your 7-day load score and performance index are ready.",
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
                  style={{ height: v * 0.8, background: THEME.brand, opacity: 0.7 }}
                />
                <span className="text-xs text-muted-foreground">W{i + 1}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-2xl font-bold" style={{ color: THEME.brand }}>74</span>
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
    title: "AI Coaching Insights",
    tagline: "Personalised recommendations based on your training data.",
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
  food_logging: {
    icon: <Utensils className="w-6 h-6" style={{ color: THEME.warning }} />,
    title: "AI Food Logging",
    tagline: "Log meals instantly from a photo. No manual searching.",
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
                <p className="text-xs font-bold" style={{ color: String(c) }}>{v}</p>
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
  preview: null,
};

// Trimmed and tightened vs. pre-recovery:
//   - Removed "In-session workout tracking" — Free tier already has
//     full workout logging, so listing it as a Pro feature was
//     misleading (and the spec called this out).
//   - Consolidated overlapping "Advanced analytics" + "Advanced
//     insights" rows into a single line.
const PRO_FEATURES: { icon: React.ReactNode; label: string; sub: string; color: string }[] = [
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
  feature?: string;
}

export default function ProModal({ onClose, feature }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(DEFAULT_PLAN);

  const handleCheckout = async () => {
    if (!user || loading) return;
    setError(null);
    setLoading(true);
    // Capture the user's choice at the moment of submit so a fast
    // re-tap on a plan tile while in-flight can't swap the plan
    // mid-checkout.
    const plan = selectedPlan;
    const result = await purchase(plan, user.uid, user.email || "");
    if (!result.success) {
      const message =
        result.error || "Couldn't start checkout. Please try again.";
      setError(message);
      toast.error(message);
    }
    setLoading(false);
  };

  const handleRestore = async () => {
    setError(null);
    const result = await restorePurchases();
    if (result.success) {
      toast.success("Purchases restored successfully.");
    } else if (result.error) {
      setError(result.error);
      toast.error(result.error);
    }
  };

  const hero =
    feature && FEATURE_HEROES[feature] ? FEATURE_HEROES[feature] : DEFAULT_HERO;

  // Restore is iOS-only — `restorePurchases()` returns an error on
  // web. Hide the link rather than show a link that does nothing.
  const showRestore = isNativeIOS();

  return (
    <BottomSheet
      open
      onOpenChange={(next) => {
        if (!next && !loading) onClose();
      }}
      title={hero.title}
      hideHeader
      maxHeight="max-h-[92vh]"
      dismissible={!loading}
    >
      {/* Header strip — visual drag handle + close X. hideHeader on
          the primitive lets us own this layout (the Drawer.Title
          inside BottomSheet renders sr-only when hideHeader is set
          so SRs still get the accessible name). */}
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
            opened the modal). */}
        {hero.preview ? <div>{hero.preview}</div> : null}

        {/* Feature list — proper icon + label + sub rows. The icon
            container is aria-hidden because the row label carries
            the semantics. */}
        <ul className="space-y-3" aria-label="Pro features">
          {PRO_FEATURES.map((f) => (
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
                onClick={() => setSelectedPlan(plan.id)}
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
                  {/* Radio circle */}
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

      {/* Sticky footer — CTA + disclosure. Pinned outside the
          overflow-y-auto so the user can always reach the purchase
          button even when content overflows on small viewports. */}
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
          disabled={loading || !user}
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
            <span>{getCheckoutCtaLabel(selectedPlan)}</span>
          )}
        </button>

        <p className="text-[11px] text-muted-foreground text-center leading-snug">
          {getRenewalDisclosure(selectedPlan)}
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
