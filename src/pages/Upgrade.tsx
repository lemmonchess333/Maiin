/**
 * Upgrade — the Pro offer, in two beats.
 *
 * Shape (after the 2026-09-13 reshape, from the Cal AI / MacroFactor
 * paywall pattern): the first thing on screen is the PRODUCT doing the
 * thing Pro sells, not a price list.
 *
 *   Beat 1 — offer.  Headline, the product preview rail, the one
 *   reassurance a trial-eligible user needs ("No payment due today"),
 *   one CTA ("Continue"), and a visible way to keep using Free. Footer
 *   carries Restore (iOS), the billing disclosure and the legal links —
 *   App Store Guideline 3.1.2 wants those on every purchase surface,
 *   and this beat is one.
 *
 *   Beat 2 — plans.  The monthly / yearly picker (`PlanPicker`, shared
 *   with ProModal so the two cannot drift), the honest trial timeline,
 *   the priced CTA, disclosure, Restore, legal.
 *
 * Entry points, read from `?from=`: onboarding's save lands here with
 * `state.next` = the first activity, and "Continue with Free" goes
 * there; the Food page's photo-logging strip sends `from=food`; every
 * other caller (Settings, Home's trial strip, the AI-usage section)
 * gets the plain page and "Not now" goes back. The source rides into
 * every paywall event so the funnel can be read per entry.
 *
 * Rules kept from the previous shape:
 *   - Plan cards select; the CTA purchases. No modal opens from here.
 *   - Pricing comes from `proPlans.ts` only (localised on the RC build).
 *   - Checkout state comes from `useProCheckout` — same hook as
 *     ProModal so they can't drift.
 *   - Already-Pro users see Manage; cross-platform Pro users are
 *     routed to the platform of record (Sub1 P2), never re-charged.
 *   - Returning from a Stripe round-trip shows a status banner and
 *     clears `?checkout=...` from the URL.
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useSubscription, hasLapsedOnboardingTrial } from "@/lib/subscription";
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
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  DEFAULT_PLAN,
  getCheckoutCtaLabel,
  getRenewalDisclosure,
  getInlinePriceSummary,
  type PlanId,
} from "@/lib/proPlans";
import { isNativeIOS, manageSubscription } from "@/lib/purchaseProvider";
import { useProCheckout } from "@/hooks/useProCheckout";
import TrialTimeline from "@/components/TrialTimeline";
import { useProPlanPrices } from "@/hooks/useProPlanPrices";
import { useAuth } from "@/lib/auth";
import { track, type PaywallSource } from "@/lib/paywallAnalytics";
import { THEME } from "@/lib/theme";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { PaywallLegalLinks } from "@/components/paywall/PaywallLegalLinks";
import PlanPicker from "@/components/paywall/PlanPicker";
import ProPreview from "@/components/paywall/ProPreview";
import ProDemoVideo from "@/components/paywall/ProDemoVideo";
import { framesForFeature } from "@/components/paywall/previewFrames";

type Beat = "offer" | "plans";

/** `?from=` → analytics source. Anything unrecognised is the plain page. */
function sourceFromParam(from: string | null): PaywallSource {
  if (from === "onboarding") return "onboarding";
  if (from === "food") return "food_page";
  if (from === "trial_end") return "trial_end";
  if (from === "trial_strip") return "trial_strip";
  if (from === "settings") return "settings";
  return "upgrade_page";
}

export default function Upgrade() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  // Sub1a P1 — see ProModal.tsx for the corresponding logic;
  // missing profile defaults to trial-eligible (server is
  // authoritative).
  const withTrial = !profile || !profile.hasUsedTrial;
  // The card trial after a lapsed free week is the same offer, framed
  // as an extension: they know the product, they are keeping it.
  const extension = withTrial && hasLapsedOnboardingTrial(profile);
  const { isPro, isInTrial, trialDaysLeft, tier } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get("from");
  const source = sourceFromParam(from);
  const fromOnboarding = source === "onboarding";
  const next = (location.state as { next?: string } | null)?.next ?? null;

  // Sub1 P2 — cross-platform Pro guard. When the user holds an
  // active Pro entitlement that originated on a DIFFERENT platform
  // than the surface they're currently viewing, route them back to
  // the platform of record instead of offering checkout (would
  // double-charge) or the standard Manage button (would open the
  // wrong portal). Apple has no admin-cancellation API for IAP, so
  // for ios_iap-Pro the message is unconditional (the user must
  // self-serve through the App Store sheet).
  const subscriptionSource = profile?.subscriptionSource ?? null;
  const currentPlatform: "stripe" | "ios_iap" = isNativeIOS()
    ? "ios_iap"
    : "stripe";
  const crossPlatformPro =
    isPro && subscriptionSource && subscriptionSource !== currentPlatform
      ? subscriptionSource
      : null;

  const [beat, setBeat] = useState<Beat>("offer");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(DEFAULT_PLAN);
  const [manageLoading, setManageLoading] = useState(false);
  // Apple-localized prices on the RC build; hardcoded proPlans fallback
  // elsewhere (IAP slice 3, #1099).
  const plans = useProPlanPrices();

  const { loading, error, startCheckout } = useProCheckout();

  const platform: "web" | "ios" = isNativeIOS() ? "ios" : "web";

  // Restore purchases is iOS-only (Guideline 3.1.2 parity with ProModal —
  // same handler shape; `restorePurchases()` on web returns an error, so
  // the button below is gated to native rather than rendering a dead link).
  const handleRestore = async () => {
    track("restore_purchases_clicked", { source, platform });
    const { restorePurchases } = await import("@/lib/purchaseProvider");
    const result = await restorePurchases();
    const { toast } = await import("sonner");
    if (result.success) {
      toast.success("Purchases restored");
    } else if (result.error) {
      toast.error(result.error);
    }
  };

  // Paywall view event — once per page load. Trial users count too;
  // they're a meaningful conversion target.
  useEffect(() => {
    track("paywall_viewed", { source, platform });
  }, [source, platform]);

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
      track("checkout_cancelled_returned", {
        source: "upgrade_page",
        platform,
      });
    }
    // Strip the query param after one render so a refresh doesn't
    // re-render the banner. Keep the rest of the search params.
    const params = new URLSearchParams(searchParams);
    params.delete("checkout");
    setSearchParams(params, { replace: true });
    // We intentionally don't depend on `setSearchParams` because
    // its identity changes every render under react-router v7.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutStatus, platform]);

  /** Leave without buying. Onboarding handed us where to go next; a
   *  reload loses that state, so the onboarding entry falls back to
   *  Home rather than to a Back that has nowhere to go. */
  const leave = () => {
    if (next) {
      navigate(next, { replace: true });
    } else if (fromOnboarding) {
      navigate("/", { replace: true });
    } else {
      navigate(-1);
    }
  };

  const handleContinue = () => {
    track("paywall_cta_clicked", { source, platform });
    setBeat("plans");
  };

  const handlePlanSelect = (plan: PlanId) => {
    setSelectedPlan(plan);
    track("paywall_plan_selected", {
      source,
      selectedPlan: plan,
      platform,
    });
  };

  const handleCheckout = () => {
    track("paywall_cta_clicked", {
      source,
      selectedPlan,
      platform,
    });
    void startCheckout(selectedPlan, {
      source,
      entryPoint: "upgrade",
      withTrial,
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
  const [statusBanner, setStatusBanner] = useState<{
    kind: "success" | "cancelled" | "error";
    message: string;
  } | null>(null);
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
        message: "Something went wrong with checkout. Try again.",
      });
    }
  }, [checkoutStatus]);

  const canBuy = (!isPro || isInTrial) && !crossPlatformPro;
  const leaveLabel = fromOnboarding ? "Continue with Free" : "Not now";

  const footer = (
    <div className="space-y-2">
      {platform === "ios" ? (
        <p className="text-caption text-muted-foreground text-center">
          Already purchased?{" "}
          <button
            type="button"
            onClick={handleRestore}
            disabled={loading}
            className="underline underline-offset-2 disabled:opacity-50"
          >
            Restore
          </button>
        </p>
      ) : null}
      <PaywallLegalLinks />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header: back on the plans beat, close on the offer beat. */}
      <header className="flex items-center justify-between min-h-11">
        {beat === "plans" ? (
          <button
            onClick={() => setBeat("offer")}
            type="button"
            className="size-11 inline-flex items-center justify-center -ml-2 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="Back to the Pro overview"
          >
            <ArrowLeft className="size-5 text-foreground" />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        {/* Same exit as the text button below; a distinct name so the two
            are not one control announced twice. */}
        <button
          onClick={leave}
          type="button"
          className="size-11 inline-flex items-center justify-center -mr-2 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Close"
        >
          <X className="size-5 text-muted-foreground" />
        </button>
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
              "bg-destructive/10 text-destructive-strong"
          )}
        >
          {statusBanner.kind === "success" && (
            <CheckCircle2
              className="size-4 mt-0.5 shrink-0"
              aria-hidden="true"
            />
          )}
          {statusBanner.kind === "cancelled" && (
            <AlertCircle
              className="size-4 mt-0.5 shrink-0"
              aria-hidden="true"
            />
          )}
          {statusBanner.kind === "error" && (
            <XCircle className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <p className="text-xs leading-snug">{statusBanner.message}</p>
        </div>
      )}

      {/* Sub1 P2 — Cross-platform Pro notice. Replaces the standard
          Manage button when the user is Pro on a different platform.
          Same visual frame as the regular Pro tile (consistent layout)
          but the copy + action route them to the correct platform. */}
      {crossPlatformPro === "ios_iap" && (
        <div
          className="bg-card rounded-2xl border-l-4 border-primary p-4 space-y-3"
          role="note"
        >
          <div className="flex items-center gap-2">
            <Crown className="size-5 text-primary" aria-hidden="true" />
            <p className="text-base font-semibold text-foreground">
              You&apos;re a Pro member via the App Store
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage your subscription from your Apple ID — Apple doesn&apos;t let
            us cancel or refund App Store subscriptions on your behalf.
          </p>
          <a
            href="https://apps.apple.com/account/subscriptions"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "w-full flex items-center justify-center gap-2 min-h-[44px] mt-1 rounded-xl",
              "bg-muted text-foreground text-sm font-semibold",
              "hover:bg-muted/80 active:scale-[0.98] transition-transform duration-150"
            )}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            <span>Open App Store subscriptions</span>
          </a>
        </div>
      )}

      {crossPlatformPro === "stripe" && (
        <div
          className="bg-card rounded-2xl border-l-4 border-primary p-4 space-y-3"
          role="note"
        >
          <div className="flex items-center gap-2">
            <Crown className="size-5 text-primary" aria-hidden="true" />
            <p className="text-base font-semibold text-foreground">
              You&apos;re a Pro member on the web
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage your subscription at troposfit.com — Apple&apos;s App Store
            isn&apos;t the billing platform for this account.
          </p>
        </div>
      )}

      {/* Already-Pro state — same-platform Pro user, standard Manage flow */}
      {!crossPlatformPro && tier === "pro" && !isInTrial && (
        <div className="bg-card rounded-2xl border-l-4 border-primary p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Crown className="size-5 text-primary" aria-hidden="true" />
            <p className="text-base font-semibold text-foreground">
              You&apos;re on Pro
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Full access to all features.
          </p>
          <ul className="space-y-1.5 text-sm text-foreground">
            {[
              "Unlimited AI photo food logging",
              "A calorie target that adapts to you",
              "Macros that shift with your training",
            ].map((f) => (
              <li key={f} className="flex items-start gap-1.5">
                <Check
                  className="size-3.5 text-primary mt-0.5 shrink-0"
                  aria-hidden="true"
                />
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
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
          >
            {manageLoading ? (
              <Spinner
                size="sm"
                variant="muted"
                label="Opening subscription management"
              />
            ) : (
              <>
                <ExternalLink className="size-4" aria-hidden="true" />
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
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              Full Pro access
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left on your
            free trial. Subscribe anytime to keep all Pro features.
          </p>
        </div>
      )}

      {/* ── Beat 1: the offer ─────────────────────────────────────── */}
      {canBuy && beat === "offer" && (
        <section className="space-y-4" aria-labelledby="pro-offer-heading">
          <div className="text-center space-y-2 pt-2">
            <h1
              id="pro-offer-heading"
              className="text-h1 font-extrabold text-foreground leading-tight"
            >
              Log a meal from a photo.
            </h1>
            <p className="text-sm text-muted-foreground max-w-[340px] mx-auto leading-relaxed">
              {extension
                ? "Your free week is over. Keep Pro with 7 more days free, then the plan you choose. Cancel before it ends and you pay nothing."
                : fromOnboarding
                  ? "Your plan is ready. Pro logs the meals around it, and keeps your calorie target honest as your weight moves."
                  : "Pro reads the plate and fills in the macros, then keeps your calorie target honest as your weight moves."}
            </p>
          </div>

          {/* The recording of the real app when there is one to play; the
              drawn frames otherwise, and as the poster meanwhile. The
              feature that brought the user leads the rail. Only the Food
              entry names one today; the contextual sheet (ProModal) covers
              the per-feature gates. */}
          <ProDemoVideo
            label="Sample: Tropos reading a meal photo and filling in the macros, then the calorie target on Home"
            fallback={
              <ProPreview
                frames={framesForFeature(
                  source === "food_page" ? "ai_food_logging" : undefined
                )}
              />
            }
          />

          {withTrial ? (
            <p className="flex items-center justify-center gap-2 text-base font-bold text-foreground">
              <Check
                className="size-5"
                strokeWidth={3}
                aria-hidden="true"
                style={{ color: THEME.success }}
              />
              No payment due today
            </p>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              {getInlinePriceSummary()}. Cancel any time.
            </p>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleContinue}
              className={cn(
                "w-full min-h-[52px] rounded-2xl text-white font-bold text-base",
                "flex items-center justify-center gap-2",
                "active:scale-[0.98] transition-transform duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              style={{
                background: `linear-gradient(135deg, ${THEME.brand}, ${THEME.teal})`,
              }}
            >
              Continue
            </button>
            <Button
              variant="ghost"
              fullWidth
              className="text-muted-foreground"
              onClick={leave}
            >
              {leaveLabel}
            </Button>
          </div>

          <p className="text-caption text-muted-foreground text-center leading-snug">
            {withTrial
              ? "Billing starts when your free trial ends, unless you cancel before then."
              : `${getInlinePriceSummary()}. Renews until cancelled.`}
          </p>
          {footer}
        </section>
      )}

      {/* ── Beat 2: choose a plan ─────────────────────────────────── */}
      {canBuy && beat === "plans" && (
        <section className="space-y-4" aria-labelledby="pro-plans-heading">
          <div className="space-y-1">
            <h1
              id="pro-plans-heading"
              className="text-h1 font-extrabold text-foreground"
            >
              Choose your plan
            </h1>
            <p className="text-sm text-muted-foreground">
              {extension
                ? "7 more days free on either plan. Cancel before it ends and you pay nothing."
                : withTrial
                  ? "7 days free on either plan. Cancel before it ends and you pay nothing."
                  : "Both plans include everything in Pro."}
            </p>
          </div>

          {/* Plan cards select; the CTA below purchases. This page is the
              full pricing surface — it does not delegate to ProModal. */}
          <PlanPicker
            plans={plans}
            selectedPlan={selectedPlan}
            onSelect={handlePlanSelect}
            disabled={loading}
          />

          {/* Inline error from the checkout hook */}
          {error ? (
            <p
              role="alert"
              className="text-xs text-destructive-strong bg-destructive/10 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          ) : null}

          {/* Sub1a trial transparency — what actually happens, before the ask. */}
          {withTrial ? <TrialTimeline /> : null}

          {/* Direct purchase CTA — never opens another modal. */}
          <button
            type="button"
            onClick={handleCheckout}
            disabled={loading}
            className={cn(
              "w-full min-h-[52px] rounded-2xl text-white font-bold text-base",
              "flex items-center justify-center gap-2",
              "active:scale-[0.98] transition-transform duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
            style={{
              background: `linear-gradient(135deg, ${THEME.brand}, ${THEME.teal})`,
            }}
          >
            {loading ? (
              <>
                <Spinner
                  size="sm"
                  variant="inverse"
                  label="Starting checkout"
                />
                <span>Starting checkout…</span>
              </>
            ) : (
              <span>
                {getCheckoutCtaLabel(selectedPlan, withTrial, extension)}
              </span>
            )}
          </button>

          <p className="text-xs text-muted-foreground text-center">
            {getRenewalDisclosure(selectedPlan, platform)}
          </p>

          {footer}

          {/* Inline price-summary fallback for users who scrolled past
              the plan cards on a small viewport. */}
          <p className="sr-only">Pricing: {getInlinePriceSummary()}.</p>
        </section>
      )}
    </div>
  );
}
