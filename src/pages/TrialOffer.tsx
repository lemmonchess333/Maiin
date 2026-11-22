/**
 * The trial offer that ends setup (Biz1 call 3, Q72; A6 call 2).
 *
 * One screen, after `completeOnboarding` has built the plan and before
 * Home: what Pro does from the first day, the trial with what it then
 * costs, and a plain Not now. Every way off it goes Home: Not now, a
 * purchase, a sheet closed, a purchase that failed (its toast says why) and
 * one the store is still approving (its toast says what is awaited). One
 * trial per account (`meetsTrialOffer`): an account that has had one, or is
 * Pro, is sent Home before anything is drawn.
 *
 * On the iPhone the plans are the App Store's, read through RevenueCat
 * (`useProPlanPrices`), and no price shows until they arrive. On the web
 * build, the preview surface, it renders the same and, like /upgrade
 * there, says Pro is not on sale in place of the price and the button
 * (`canSellInThisBuild`).
 *
 * App Store Guideline 3.1.2 and DESIGN_GUIDE §14n (54): the price and its
 * period sit directly under the button (`RenewalDisclosure`), the trial
 * names the day it charges and the last day to cancel (`TrialTimeline`),
 * Restore is on the iPhone, and the Terms and the Privacy Policy are
 * linked. The trial itself is the store's introductory offer; the launch
 * event `trial_started` is sent once the server has it (`launchEvents.ts`).
 */
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DEFAULT_PLAN, findPlan, getCheckoutCtaLabel } from "@/lib/proPlans";
import type { PlanId } from "@/lib/proPlans";
import { canSellInThisBuild, isNativeIOS } from "@/lib/purchaseProvider";
import { PENDING_MESSAGE } from "@/lib/checkoutFlow";
import { useProCheckout } from "@/hooks/useProCheckout";
import { useProPlanPrices } from "@/hooks/useProPlanPrices";
import {
  offersTrial,
  useStoreTrialEligibility,
} from "@/hooks/useStoreTrialEligibility";
import { isCheckoutTrialEligible } from "@/lib/subscription";
import { track } from "@/lib/paywallAnalytics";
import { trackTrialOfferViewed } from "@/lib/firstRunEvents";
import { meetsTrialOffer, TRIAL_OFFER_COPY } from "@/lib/trialOffer";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import PlanPicker from "@/components/paywall/PlanPicker";
import RenewalDisclosure from "@/components/paywall/RenewalDisclosure";
import PlanPricesPending from "@/components/paywall/PlanPricesPending";
import ProNotOnSale from "@/components/paywall/ProNotOnSale";
import { PaywallLegalLinks } from "@/components/paywall/PaywallLegalLinks";
import TrialTimeline from "@/components/TrialTimeline";
import StepDetails from "@/components/StepDetails";

/** The analytics source of every paywall event this screen sends: the
 *  offer that follows setup. */
const SOURCE = "onboarding" as const;

export default function TrialOffer() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  /* Read once: a trial started here turns the account Pro, and the screen
     must not send itself Home under the person mid-purchase. */
  const [meets] = useState(() => meetsTrialOffer(profile));
  const uid = user?.uid ?? "";
  const platform: "web" | "ios" = isNativeIOS() ? "ios" : "web";
  const onSale = canSellInThisBuild();
  const { plans, failed, retry } = useProPlanPrices(user?.uid);
  const storeTrialEligibility = useStoreTrialEligibility();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(DEFAULT_PLAN);
  const selected = plans ? findPlan(plans, selectedPlan) : null;
  const withTrial = offersTrial(
    isCheckoutTrialEligible(profile),
    storeTrialEligibility,
    selectedPlan
  );
  const { loading, error, startCheckout } = useProCheckout();

  useEffect(() => {
    if (!meets || !uid) return;
    trackTrialOfferViewed(uid);
    track("paywall_viewed", { source: SOURCE, platform });
  }, [meets, uid, platform]);

  if (!meets) return <Navigate to="/" replace />;

  /* Home opens at its top: the app keeps a page's scroll across a route
     change, and this screen can be scrolled on a small phone. */
  const goHome = () => {
    window.scrollTo(0, 0);
    navigate("/", { replace: true });
  };

  const startTrial = async () => {
    track("paywall_cta_clicked", { source: SOURCE, selectedPlan, platform });
    const outcome = await startCheckout(selectedPlan, {
      source: SOURCE,
      entryPoint: "upgrade",
      withTrial,
    });
    // Nothing began (one already running): stay.
    if (!outcome) return;
    // The web checkout has the window; it returns to /upgrade.
    if (outcome.kind === "redirected") return;
    if (outcome.kind === "pending")
      toast.success(PENDING_MESSAGE[outcome.pending]);
    // Bought, closed or failed (useProCheckout's toast says why): Home.
    goHome();
  };

  const restore = async () => {
    track("restore_purchases_clicked", { source: SOURCE, platform });
    const { restorePurchases } = await import("@/lib/purchaseProvider");
    const result = await restorePurchases();
    if (result.success) {
      toast.success("Purchases restored");
      goHome();
    } else if (result.error) {
      toast.error(result.error);
    }
  };

  const canBuy = onSale && !!plans && !!selected;

  return (
    <div
      className="h-dvh flex flex-col bg-background text-foreground px-[16px] max-w-lg mx-auto"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex-1 overflow-y-auto min-h-0 pt-8 pb-6 space-y-6">
        <section className="space-y-3" aria-labelledby="trial-offer-heading">
          <p className="text-sm font-semibold text-primary">
            {TRIAL_OFFER_COPY.kicker}
          </p>
          <h1
            id="trial-offer-heading"
            className="text-h1 leading-tight tracking-tight font-extrabold text-balance"
          >
            {TRIAL_OFFER_COPY.title(withTrial)}
          </h1>
          <p className="text-base text-muted-foreground">
            {TRIAL_OFFER_COPY.lead}
          </p>
          <ul
            aria-label="What Pro adds from your first day"
            className="space-y-2 pt-1"
          >
            {TRIAL_OFFER_COPY.dayOne.map((line) => (
              <li key={line} className="flex items-start gap-2 text-base">
                <Check
                  className="size-4 text-primary mt-1 shrink-0"
                  strokeWidth={3}
                  aria-hidden="true"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {!onSale ? (
          <ProNotOnSale />
        ) : !plans || !selected ? (
          <PlanPricesPending failed={failed} onRetry={retry} />
        ) : (
          <div className="space-y-4">
            <PlanPicker
              plans={plans}
              selectedPlan={selectedPlan}
              onSelect={(plan) => {
                setSelectedPlan(plan);
                track("paywall_plan_selected", {
                  source: SOURCE,
                  selectedPlan: plan,
                  platform,
                });
              }}
              disabled={loading}
            />
            {withTrial && <TrialTimeline plan={selected} />}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-xs text-destructive-strong bg-destructive/10 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        <div className="space-y-2">
          {platform === "ios" && onSale && (
            <p className="text-micro text-muted-foreground text-center">
              Already purchased?{" "}
              <button
                type="button"
                onClick={() => void restore()}
                disabled={loading}
                className="inline-flex items-center min-h-11 px-1 underline underline-offset-2 disabled:opacity-50"
              >
                Restore
              </button>
            </p>
          )}
          <PaywallLegalLinks />
        </div>
      </div>

      <footer className="shrink-0 border-t border-border pt-4 space-y-2">
        {canBuy && (
          <>
            <Button
              variant="neutral"
              size="lg"
              fullWidth
              loading={loading}
              onClick={() => void startTrial()}
            >
              {withTrial
                ? TRIAL_OFFER_COPY.start
                : getCheckoutCtaLabel(selected, false)}
            </Button>
            <RenewalDisclosure
              plan={selected}
              platform={platform}
              withTrial={withTrial}
            />
            <StepDetails failed={!!error} waiting={loading} />
          </>
        )}
        <Button
          variant={canBuy ? "ghost" : "secondary"}
          size={canBuy ? "md" : "lg"}
          fullWidth
          className={canBuy ? "text-muted-foreground" : undefined}
          disabled={loading}
          onClick={goHome}
        >
          {TRIAL_OFFER_COPY.notNow}
        </Button>
      </footer>
    </div>
  );
}
