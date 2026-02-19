import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  User,
  Ruler,
  Weight,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  Shield,
  Target,
  Save,
  Check,
  Crown,
  Sparkles,
  Zap,
} from "lucide-react";

const PLANS = [
  {
    id: "monthly" as const,
    label: "Monthly",
    price: "\u00A32.99",
    period: "/month",
    badge: null,
  },
  {
    id: "yearly" as const,
    label: "Yearly",
    price: "\u00A329.99",
    period: "/year",
    badge: "Save 17%",
  },
  {
    id: "lifetime" as const,
    label: "Lifetime",
    price: "\u00A399",
    period: "one-time",
    badge: "Best value",
  },
];

export default function Settings() {
  const { profile, updateProfile, signOut } = useAuth();
  const { isPro, isInTrial, trialDaysLeft, tier } = useSubscription();
  const { checkout, loading: checkoutLoading, error: checkoutError } = useStripeCheckout();
  const [name, setName] = useState(profile?.displayName || "");
  const [weightKg, setWeightKg] = useState(profile?.weightKg || 70);
  const [heightCm, setHeightCm] = useState(profile?.heightCm || 170);
  const [workoutsTarget, setWorkoutsTarget] = useState(
    profile?.weeklyWorkoutsTarget || 4
  );
  const [mealsTarget, setMealsTarget] = useState(
    profile?.weeklyMealsTarget || 10
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({
      displayName: name,
      weightKg,
      heightCm,
      weeklyWorkoutsTarget: workoutsTarget,
      weeklyMealsTarget: mealsTarget,
    });
    setSaving(false);
    setSaved(true);
    toast.success("Settings saved!");
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleUnit = async (
    key: "preferredWeightUnit" | "preferredHeightUnit",
    current: string
  ) => {
    if (key === "preferredWeightUnit") {
      await updateProfile({
        preferredWeightUnit: current === "kg" ? "lbs" : "kg",
      });
    } else {
      await updateProfile({
        preferredHeightUnit: current === "cm" ? "ft" : "cm",
      });
    }
  };

  const toggleDark = async () => {
    await updateProfile({ darkMode: !profile?.darkMode });
  };

  const toggleDevPro = async () => {
    const newTier = profile?.subscriptionTier === "pro" ? "free" : "pro";
    await updateProfile({ subscriptionTier: newTier });
    toast.success(newTier === "pro" ? "Pro mode enabled" : "Pro mode disabled");
  };

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Customize your experience</p>
      </div>

      {/* Dev: Force Pro toggle — only in dev mode */}
      {import.meta.env.DEV && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-orange-500/10 rounded-xl border border-orange-500/20 p-4"
        >
          <button
            onClick={toggleDevPro}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-orange-500" />
              <div className="text-left">
                <span className="text-sm font-medium text-foreground">
                  Dev: Force Pro Mode
                </span>
                <p className="text-xs text-muted-foreground">
                  Only visible in development
                </p>
              </div>
            </div>
            <div
              className={cn(
                "w-12 h-7 rounded-full transition-all flex items-center",
                profile.subscriptionTier === "pro"
                  ? "bg-orange-500 justify-end"
                  : "bg-muted justify-start"
              )}
            >
              <div className="w-5 h-5 bg-white rounded-full mx-1 shadow-sm" />
            </div>
          </button>
        </motion.div>
      )}

      {/* Current plan & trial banner */}
      <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Your Plan</p>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <div
            className={cn(
              "p-2 rounded-lg",
              isPro ? "bg-primary/10" : "bg-muted"
            )}
          >
            {isPro ? (
              <Sparkles className="w-4 h-4 text-primary" />
            ) : (
              <User className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {tier === "pro" ? "Pro" : isInTrial ? "Pro Trial" : "Free"}
            </p>
            <p className="text-xs text-muted-foreground">
              {tier === "pro"
                ? "Full access to all features"
                : isInTrial
                ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining — upgrade to keep Pro!`
                : "Basic features — upgrade for full access"}
            </p>
          </div>
        </div>
      </div>

      {/* Upgrade section — shown when not on paid Pro */}
      {tier !== "pro" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Upgrade to Pro
          </p>

          {/* Free vs Pro comparison */}
          <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-2">
                <p className="font-medium text-muted-foreground uppercase tracking-wider text-[10px]">
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
              <div className="space-y-2">
                <p className="font-medium text-primary uppercase tracking-wider text-[10px]">
                  Pro
                </p>
                <ul className="space-y-1.5 text-foreground">
                  <li>Everything in Free +</li>
                  <li>Unlimited AI photo food logging</li>
                  <li>Full Performance Engine</li>
                  <li>AI adaptive macros</li>
                  <li>Advanced insights</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Pricing cards */}
          <div className="space-y-2">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => checkout(plan.id)}
                disabled={checkoutLoading !== null}
                className={cn(
                  "w-full flex items-center justify-between p-4 rounded-xl border transition-all",
                  "bg-card border-border/50 hover:border-primary/50",
                  checkoutLoading === plan.id && "opacity-50"
                )}
              >
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
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {plan.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {checkoutLoading === plan.id ? "..." : plan.price}
                </p>
              </button>
            ))}
          </div>

          {checkoutError && (
            <p className="text-xs text-red-500 text-center">{checkoutError}</p>
          )}
        </div>
      )}

      {/* Profile section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <User className="w-5 h-5" />
          Profile
        </h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground">Weight (kg)</label>
            <input
              type="number"
              value={weightKg}
              onChange={(e) => setWeightKg(Number(e.target.value))}
              className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Height (cm)</label>
            <input
              type="number"
              value={heightCm}
              onChange={(e) => setHeightCm(Number(e.target.value))}
              className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      </div>

      {/* Goals */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Target className="w-5 h-5" />
          Weekly Goals
        </h2>
        <div>
          <label className="text-sm text-muted-foreground">
            Workouts per week ({workoutsTarget})
          </label>
          <input
            type="range"
            min="0"
            max="7"
            value={workoutsTarget}
            onChange={(e) => setWorkoutsTarget(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">
            Protein meals per week ({mealsTarget})
          </label>
          <input
            type="range"
            min="0"
            max="20"
            value={mealsTarget}
            onChange={(e) => setMealsTarget(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      </div>

      {/* Save */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saved ? (
          <>
            <Check className="w-4 h-4" />
            Saved!
          </>
        ) : saving ? (
          "Saving..."
        ) : (
          <>
            <Save className="w-4 h-4" />
            Save Changes
          </>
        )}
      </motion.button>

      {/* Preferences */}
      <div className="space-y-2">
        <button
          onClick={() => toggleUnit("preferredWeightUnit", profile.preferredWeightUnit)}
          className="w-full flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Weight className="w-5 h-5" />
            <span>Weight Unit</span>
          </div>
          <span className="font-medium">
            {profile.preferredWeightUnit.toUpperCase()}
          </span>
        </button>

        <button
          onClick={() => toggleUnit("preferredHeightUnit", profile.preferredHeightUnit)}
          className="w-full flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Ruler className="w-5 h-5" />
            <span>Height Unit</span>
          </div>
          <span className="font-medium">
            {profile.preferredHeightUnit.toUpperCase()}
          </span>
        </button>

        <button
          onClick={toggleDark}
          className="w-full flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            {profile.darkMode ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
            <span>Dark Mode</span>
          </div>
          <span className="font-medium">
            {profile.darkMode ? "ON" : "OFF"}
          </span>
        </button>
      </div>

      {/* Links */}
      <div className="pt-4 border-t border-border/50">
        <Link
          to="/privacy"
          className="flex items-center justify-between p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5" />
            <span>Privacy Policy</span>
          </div>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Sign out */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
      >
        <LogOut className="w-4 h-4" /> Sign Out
      </motion.button>

      <p className="text-center text-xs text-muted-foreground">
        Adaptive Fitness v1.1.0
      </p>
    </div>
  );
}
