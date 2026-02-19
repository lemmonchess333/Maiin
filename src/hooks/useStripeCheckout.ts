import { useState } from "react";
import { useAuth } from "@/lib/auth";

// Stripe price IDs — replace with your real Stripe price IDs
const PRICE_IDS = {
  monthly: import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID || "price_monthly",
  yearly: import.meta.env.VITE_STRIPE_YEARLY_PRICE_ID || "price_yearly",
  lifetime: import.meta.env.VITE_STRIPE_LIFETIME_PRICE_ID || "price_lifetime",
} as const;

type PlanType = keyof typeof PRICE_IDS;

// Your Cloud Function URL for creating checkout sessions
const CREATE_CHECKOUT_URL =
  import.meta.env.VITE_STRIPE_CHECKOUT_URL ||
  "/api/create-checkout-session";

export function useStripeCheckout() {
  const { user } = useAuth();
  const [loading, setLoading] = useState<PlanType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkout = async (plan: PlanType) => {
    if (!user) {
      setError("You must be signed in to subscribe.");
      return;
    }

    setLoading(plan);
    setError(null);

    try {
      const response = await fetch(CREATE_CHECKOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: PRICE_IDS[plan],
          uid: user.uid,
          email: user.email,
          successUrl: `${window.location.origin}/Maiin/settings?checkout=success`,
          cancelUrl: `${window.location.origin}/Maiin/settings?checkout=cancelled`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create checkout session");
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(null);
    }
  };

  return { checkout, loading, error };
}
