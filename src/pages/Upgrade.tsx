/**
 * Upgrade — full Pro pricing + purchase page.
 *
 * Architecture
 * ------------
 * Pre-unification this page opened ProModal whenever the user
 * tapped a plan tile. Because ProModal defaulted to the recommended
 * plan, tapping "Monthly" silently became a Yearly checkout — the
 * spec's headline bug. The fix isn't to pass `initialPlan` (that
 * would be the shallow fix); it's to make this page do its own
 * selection + direct checkout. ProModal stays for the contextual
 * paywall opened from feature gates — two roles, two surfaces.
 *
 * Rules this page follows (from the spec):
 *   - Plan cards select; CTA purchases.
 *   - The full Upgrade page does not open another paywall modal.
 *   - Pricing comes from `proPlans.ts` only.
 *   - Checkout state comes from `useProCheckout` — same hook as
 *     ProModal so they can't drift.
 *   - Already-Pro users see a Manage subscription action.
 *   - Returning from a Stripe round-trip shows a status banner
 *     and clears `?checkout=...` from the URL.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSubscription } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  Crown,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  PRO_PLANS,
  DEFAULT_PLAN,
  getCheckoutCtaLabel,
  getRenewalDisclosure,
  getInlinePriceSummary,
  type PlanId,
} from "@/lib/proPlans";
import { isNativeIOS, manageSubscription } from "@/lib/purchaseProvider";
import { useProCheckout } from "@/hooks/useProCheckout";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/paywallAnalytics";
import { THEME } from "@/lib/theme";
import { Spinner } from "@/components/ui/Spinner";

export default function Upgrade() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro, isInTrial, trialDaysLeft, tier } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(DEFAULT_PLAN);
  const [manageLoading, setManageLoading] = useState(false);

  const { loading, error, startCheckout } = useProCheckout();

  const platform: "web" | "ios" = isNativeIOS() ? "ios" : "web";

  // Paywall view event — once per page load. Trial users count too;
  // they're a meaningful conversion target.
  useEffect(() => {
    track("paywall_viewed", { source: "upgrade_page", platform });
  }, [platform]);

  // Checkout round-trip status. Stripe redirects back here with
  // ?checkout=success or ?checkout=cancelled. Show a banner, emit
  // the analytics event, and clear the query so a reload doesn't
  // double-fire the banner / toast.
  const checkoutStatus = searchParams.get("checkout");
  useEffect(() => {
    if (!checkoutStatus) return;
    if (checkoutStatus === "success") {
      track("checkout_success_returned", { source: "upgrade_page", platform });
    } else if (checkoutStatus === "cancelled") {
      track("checkout_cancelled_returned", { source: "upgrade_page", platform });
    }
    // Strip the query param after one render so a refresh doesn't
    // re-render the banner. Keep the rest of the search params.
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    setSearchParams(next, { replace: true });
    // We intentionally don't depend on `setSearchParams` because
    // its identity changes every render under react-router v7.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutStatus, platform]);

  const handlePlanSelect = (plan: PlanId) => {
    setSelectedPlan(plan);
    track("paywall_plan_selected", {
      source: "upgrade_page",
      selectedPlan: plan,
      platform,
    });
  };

  const handleCheckout = () => {
    track("paywall_cta_clicked", {
      source: "upgrade_page",
      selectedPlan,
      platform,
    });
    void startCheckout(selectedPlan, {
      source: "upgrade_page",
      entryPoint: "upgrade",
    });
  };

  const handleManageSubscription = async () => {
    if (!user || manageLoading) return;
    track("manage_subscription_clicked", { source: "upgrade_page", platform });
    setManageLoading(true);
    const result = await manageSubscription(user.uid);
    if (!result.success && result.error) {
      toast.error(result.error);
    }
    setManageLoading(false);
  };

  // Visible status banner for checkout round-trip. Persists for the
  // duration of this render — the effect above strips the URL param
  // on next paint, but we capture the status here so the banner
  // renders this paint.
  const [statusBanner, setStatusBanner] = useState<
    | { kind: "success" | "cancelled" | "error"; message: string }
    | null
  >(null);
  useEffect(() => {
    if (checkoutStatus === "success") {
      setStatusBanner({
        kind: "success",
        message:
          "Payment received. Your Pro access is being activated — this usually takes a few seconds.",
      });
    } else if (checkoutStatus === "cancelled") {
      setStatusBanner({
        kind: "cancelled",
        message: "Checkout cancelled. No payment was taken.",
      });
    } else if (checkoutStatus === "error") {
      setStatusBanner({
        kind: "error",
        message: "Something went wrong with checkout. Please try again.",
      });
    }
  }, [checkoutStatus]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/settings")}
            type="button"
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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

      {/* Checkout round-trip status banner */}
      {statusBanner && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex items-start gap-3 p-3 rounded-xl",
            statusBanner.kind === "success" &&
              "bg-success-bg text-success-foreground",
            statusBanner.kind === "cancelled" &&
              "bg-muted text-muted-foreground",
            statusBanner.kind === "error" &&
              "bg-destructive/10 text-destructive",
          )}
        >
          {statusBanner.kind === "success" && (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          {statusBanner.kind === "cancelled" && (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          {statusBanner.kind === "error" && (
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <p className="text-xs leading-snug">{statusBanner.message}</p>
        </div>
      )}

      {/* Already-Pro state */}
      {tier === "pro" && !isInTrial && (
        <div className="bg-card rounded-2xl border-l-4 border-primary p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" aria-hidden="true" />
            <p className="text-base font-semibold text-foreground">You&apos;re on Pro</p>
          </div>
          <p className="text-sm text-muted-foreground">Full access to all features.</p>
          <ul className="space-y-1.5 text-sm text-foreground">
            {[
              "Unlimited AI photo food logging",
              "Full Performance Engine",
              "AI adaptive macros",
              "Advanced insights",
            ].map((f) => (
              <li key={f} className="flex items-start gap-1.5">
                <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleManageSubscription}
            disabled={manageLoading}
            className={cn(
              "w-full flex items-center justify-center gap-2 min-h-[44px] mt-1 rounded-xl",
              "bg-muted text-foreground text-sm font-semibold",
              "hover:bg-muted/80 active:scale-[0.98] transition-transform duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            )}
          >
            {manageLoading ? (
              <Spinner size="sm" variant="muted" label="Opening subscription management" />
            ) : (
              <>
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                <span>Manage subscription</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Trial state */}
      {isInTrial && (
        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Full Pro access</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left on your free trial.
            Subscribe anytime to keep all Pro features.
          </p>
        </div>
      )}

      {/* Comparison + pricing — shown when not paid Pro (trial users
          still see this so they can subscribe before their trial
          runs out). */}
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
                  {[
                    "Everything in Free +",
                    "Unlimited AI photo food logging",
                    "Full Performance Engine",
                    "AI adaptive macros",
                    "Advanced insights",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Plan selector — radio group. Plan cards select; the CTA
              below purchases. This page is the full pricing surface —
              it does not delegate to ProModal. */}
          <div
            role="radiogroup"
            aria-label="Choose Pro billing plan"
            className="space-y-2 pt-2"
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
                    "relative w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left",
                    "min-h-[64px]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    isSelected
                      ? "bg-primary/10 border-primary ring-2 ring-primary/30"
                      : "bg-card border-border/50 hover:border-primary/50",
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
                      <p className="text-sm font-semibold text-foreground">
                        {plan.label}
                      </p>
                      {plan.savingsLabel ? (
                        <p className="text-xs font-medium text-success">
                          {plan.savingsLabel}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
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

          {/* Inline error from the checkout hook */}
          {error ? (
            <p
              role="alert"
              className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          ) : null}

          {/* Direct purchase CTA — never opens another modal. */}
          <button
            type="button"
            onClick={handleCheckout}
            disabled={loading}
            className={cn(
              "w-full min-h-[52px] rounded-2xl text-white font-bold text-base mt-1",
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

          <p className="text-xs text-muted-foreground text-center">
            {getRenewalDisclosure(selectedPlan, platform)}
          </p>

          {/* Inline price-summary fallback for users who scrolled past
              the plan cards on a small viewport. */}
          <p className="sr-only">Pricing: {getInlinePriceSummary()}.</p>
        </div>
      )}
    </div>
  );
}
