import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { calculateTDEE } from "@/lib/tdee";
import type { ActivityLevel } from "@/lib/tdee";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  User,
  Zap,
  Crown,
  Sparkles,
} from "lucide-react";
import { useProgram } from "@/features/program/useProgram";
import { chooseSplit, splitLabel } from "@/features/program/programEngine";
import { generateSchedule } from "@/lib/scheduleUtils";
import type { ScheduleDay, DayType } from "@/lib/scheduleUtils";
import { usePrivacyZones } from "@/hooks/usePrivacyZones";
import { useMealReminders } from "@/hooks/useMealReminders";
import { useCrews } from "@/hooks/useCrews";
import { useFocusTrap } from "@/hooks/useFocusTrap";

import ProfileSection from "@/components/settings/ProfileSection";
import TDEESection from "@/components/settings/TDEESection";
import ScheduleSection from "@/components/settings/ScheduleSection";
import ShoesSection from "@/components/settings/ShoesSection";
import PreferencesSection from "@/components/settings/PreferencesSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import PrivacySection from "@/components/settings/PrivacySection";
import AccountSection from "@/components/settings/AccountSection";

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
  const navigate = useNavigate();
  const { user, profile, updateProfile, signOut } = useAuth();
  const { isPro, isInTrial, trialDaysLeft, tier } = useSubscription();
  const { checkout, loading: checkoutLoading, error: checkoutError } = useStripeCheckout();
  const { defaultCrews, currentCrew, joinCrew, leaveCrew } = useCrews();
  const [visibleTab, setVisibleTab] = useState<"profile" | "prefs" | "account">("profile");
  const { refreshRunSchedule, programState, overrideRunDay, regenerateProgram } = useProgram();
  const [name, setName] = useState(profile?.displayName || "");
  const [weightKg, setWeightKg] = useState(profile?.weightKg || 70);
  const [heightCm, setHeightCm] = useState(profile?.heightCm || 170);
  const [workoutsTarget, setWorkoutsTarget] = useState(
    profile?.weeklyWorkoutsTarget || 4
  );
  const [mealsTarget, setMealsTarget] = useState(
    Math.min(profile?.weeklyMealsTarget || 10, 20)
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTDEE, setShowTDEE] = useState(false);
  const [autoRestTimer, setAutoRestTimer] = useState(profile?.autoRestTimer ?? true);
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(profile?.defaultRestSeconds ?? 120);
  const [defaultVisibility, setDefaultVisibility] = useState<"public" | "followers" | "private">(profile?.defaultVisibility ?? "public");
  const [autoPostRuns, setAutoPostRuns] = useState(profile?.autoPostRuns ?? true);
  const [autoPostWorkouts, setAutoPostWorkouts] = useState(profile?.autoPostWorkouts ?? false);
  const [audioCues, setAudioCues] = useState(profile?.audioCues ?? true);
  const [age, setAge] = useState(profile?.age ?? 25);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>((profile?.activityLevel as ActivityLevel) ?? "moderate");
  const [trainingPhase, setTrainingPhase] = useState<"cut" | "lean bulk" | "recomp">(
    (profile?.program?.goal as "cut" | "lean bulk" | "recomp") ?? "recomp"
  );
  const [runsTarget, setRunsTarget] = useState(profile?.weeklyRunsTarget || 2);
  const [customSchedule, setCustomSchedule] = useState<ScheduleDay[] | null>(
    profile?.weekSchedule && profile.weekSchedule.length === 7 ? profile.weekSchedule : null
  );
  const { zones: privacyZones, addZone, removeZone } = usePrivacyZones();
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneRadius, setNewZoneRadius] = useState(500);
  const { reminders: mealReminders, updateReminders } = useMealReminders();

  // Restructure warning modal state
  const [showRestructureModal, setShowRestructureModal] = useState(false);
  const [pendingLiftDays, setPendingLiftDays] = useState<number | null>(null);
  const [restructuring, setRestructuring] = useState(false);
  const restructureModalRef = useFocusTrap<HTMLDivElement>(showRestructureModal);

  // Saved schedule tracking for unsaved-changes detection
  const [savedSchedule] = useState<ScheduleDay[] | null>(
    profile?.weekSchedule && profile.weekSchedule.length === 7 ? profile.weekSchedule : null
  );
  const savedLiftDays = useMemo(() => {
    if (savedSchedule) return savedSchedule.filter((s) => s.type === "lift" || s.type === "both").length;
    return profile?.weeklyWorkoutsTarget || 4;
  }, [savedSchedule, profile?.weeklyWorkoutsTarget]);

  const schedule = useMemo(() => {
    if (customSchedule) return customSchedule;
    return generateSchedule(workoutsTarget, runsTarget);
  }, [workoutsTarget, runsTarget, customSchedule]);

  const handleDayToggle = (day: number) => {
    const current = schedule.find((s) => s.day === day);
    if (!current) return;
    const cycle: DayType[] = ["rest", "lift", "run", "both"];
    const nextIdx = (cycle.indexOf(current.type) + 1) % cycle.length;
    const updated = schedule.map((s) =>
      s.day === day ? { ...s, type: cycle[nextIdx] } : s
    );
    setCustomSchedule(updated);
    const newLiftDays = updated.filter((s) => s.type === "lift" || s.type === "both").length;
    const newRunDays = updated.filter((s) => s.type === "run" || s.type === "both").length;
    setRunsTarget(newRunDays);
    setWorkoutsTarget(newLiftDays);
  };

  // Detect unsaved schedule changes
  const hasUnsavedScheduleChanges = useMemo(() => {
    if (!customSchedule) return false;
    if (!savedSchedule) return true;
    return customSchedule.some((s, i) => s.type !== savedSchedule[i]?.type);
  }, [customSchedule, savedSchedule]);

  // Detect any unsaved profile changes (not just schedule)
  const hasUnsavedProfileChanges = useMemo(() => {
    if (!profile) return false;
    return (
      name !== (profile.displayName || "") ||
      weightKg !== (profile.weightKg || 70) ||
      heightCm !== (profile.heightCm || 170) ||
      age !== (profile.age ?? 25) ||
      workoutsTarget !== (profile.weeklyWorkoutsTarget || 4) ||
      mealsTarget !== Math.min(profile.weeklyMealsTarget || 10, 20) ||
      runsTarget !== (profile.weeklyRunsTarget || 2) ||
      activityLevel !== ((profile.activityLevel as ActivityLevel) ?? "moderate") ||
      trainingPhase !== ((profile.program?.goal as "cut" | "lean bulk" | "recomp") ?? "recomp")
    );
  }, [name, weightKg, heightCm, age, workoutsTarget, mealsTarget, runsTarget, activityLevel, trainingPhase, profile]);

  const hasAnyUnsavedChanges = hasUnsavedScheduleChanges || hasUnsavedProfileChanges;

  const handleApplyScheduleChanges = async () => {
    const currentLiftDays = schedule.filter((s) => s.type === "lift" || s.type === "both").length;
    if (currentLiftDays !== savedLiftDays && currentLiftDays > 0) {
      setPendingLiftDays(currentLiftDays);
      setShowRestructureModal(true);
    } else {
      await updateProfile({ weekSchedule: schedule, weeklyWorkoutsTarget: workoutsTarget, weeklyRunsTarget: runsTarget });
      if (profile?.runMode && profile.runMode !== "freeform") {
        await refreshRunSchedule();
      }
      toast.success("Schedule saved");
    }
  };

  const handleConfirmRestructure = async () => {
    if (pendingLiftDays === null) return;
    setRestructuring(true);
    try {
      await new Promise((r) => setTimeout(r, 1500));
      await regenerateProgram(undefined, pendingLiftDays);
      await updateProfile({ weekSchedule: schedule, weeklyWorkoutsTarget: workoutsTarget, weeklyRunsTarget: runsTarget });
      if (profile?.runMode && profile.runMode !== "freeform") {
        await refreshRunSchedule();
      }
      setShowRestructureModal(false);
      const newSplit = chooseSplit(pendingLiftDays);
      setPendingLiftDays(null);
      toast.success(`Program updated to ${splitLabel(newSplit)}`);
    } catch (error) {
      console.error("handleConfirmRestructure failed:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setRestructuring(false);
    }
  };

  const tdee = useMemo(() => {
    return calculateTDEE(weightKg, heightCm, age, activityLevel, trainingPhase, profile?.sex || "male");
  }, [weightKg, heightCm, age, activityLevel, trainingPhase, profile?.sex]);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({
      displayName: name,
      weightKg,
      heightCm,
      age,
      activityLevel,
      weeklyWorkoutsTarget: workoutsTarget,
      weeklyRunsTarget: runsTarget,
      weeklyMealsTarget: mealsTarget,
      weekSchedule: schedule,
      program: {
        goal: trainingPhase,
        startWeight: profile?.program?.startWeight ?? weightKg,
        currentPhase: profile?.program?.currentPhase ?? "base",
      },
      tdeeBase: tdee.targetCalories,
      targetCalories: profile?.customCalorieTarget || tdee.targetCalories,
      targetProtein: tdee.protein,
      targetCarbs: tdee.carbs,
      targetFat: tdee.fat,
    });
    if (profile?.runMode && profile.runMode !== "freeform") {
      await refreshRunSchedule();
    }
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

  const toggleDark = () => {
    const next = !profile?.darkMode;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem('tropos-dark-mode', String(next));
    updateProfile({ darkMode: next });
  };

  const toggleDevPro = () => {
    if (!import.meta.env.DEV) return;
    const newTier = profile?.subscriptionTier === "pro" ? "free" : "pro";
    updateProfile({ subscriptionTier: newTier }, { allowProtected: true });
    toast.success(newTier === "pro" ? "Pro mode enabled" : "Pro mode disabled");
  };

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Customize your experience</p>
        </div>
        {user && (
          <button
            onClick={() => navigate(`/user/${user.uid}`)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors"
          >
            View Profile
          </button>
        )}
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
      <div className="bg-card rounded-2xl border-l-4 border-purple-500 p-4 space-y-3">
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
          <div className="bg-card rounded-2xl p-4 space-y-3">
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

      {/* Settings tabs — consolidated from 5 to 3 */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {([
          { key: "profile" as const, label: "Profile & Training" },
          { key: "prefs" as const, label: "Preferences" },
          { key: "account" as const, label: "Account" },
        ]).map(({ key, label }) => (
          <button key={key} onClick={() => setVisibleTab(key)}
            className={cn(
              "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
              visibleTab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}>
            {label}
          </button>
        ))}
      </div>

      {/* Profile & Goals */}
      {visibleTab === "profile" && (
      <>
        <ProfileSection
          profile={profile}
          name={name}
          setName={setName}
          weightKg={weightKg}
          setWeightKg={setWeightKg}
          heightCm={heightCm}
          setHeightCm={setHeightCm}
          mealsTarget={mealsTarget}
          setMealsTarget={setMealsTarget}
          runsTarget={runsTarget}
          schedule={schedule}
          hasUnsavedScheduleChanges={hasUnsavedScheduleChanges}
          handleDayToggle={handleDayToggle}
          handleApplyScheduleChanges={handleApplyScheduleChanges}
          updateProfile={updateProfile}
          navigate={navigate}
          programState={programState}
          overrideRunDay={overrideRunDay}
        />

        {/* Unsaved changes warning + save button */}
        <ScheduleSection
          hasAnyUnsavedChanges={hasAnyUnsavedChanges}
          saving={saving}
          saved={saved}
          handleSave={handleSave}
        />
      </>
      )}

      {/* Training Setup — merged into Profile & Training tab */}
      {visibleTab === "profile" && (
      <>
        <TDEESection
          profile={profile}
          showTDEE={showTDEE}
          setShowTDEE={setShowTDEE}
          age={age}
          setAge={setAge}
          activityLevel={activityLevel}
          setActivityLevel={setActivityLevel}
          trainingPhase={trainingPhase}
          setTrainingPhase={setTrainingPhase}
          tdee={tdee}
          updateProfile={updateProfile}
        />

        {/* Shoe Mileage Tracker */}
        <ShoesSection />
      </>
      )}

      {/* Preferences */}
      {visibleTab === "prefs" && (
      <>
        <PreferencesSection
          profile={profile}
          autoRestTimer={autoRestTimer}
          setAutoRestTimer={setAutoRestTimer}
          defaultRestSeconds={defaultRestSeconds}
          setDefaultRestSeconds={setDefaultRestSeconds}
          updateProfile={updateProfile}
          toggleUnit={toggleUnit}
          toggleDark={toggleDark}
        />

        {/* Meal Reminders */}
        <NotificationsSection
          mealReminders={mealReminders}
          updateReminders={updateReminders}
        />
      </>
      )}

      {/* Social & Privacy — merged into Account tab */}
      {visibleTab === "account" && (
        <PrivacySection
          user={user}
          updateProfile={updateProfile}
          defaultVisibility={defaultVisibility}
          setDefaultVisibility={setDefaultVisibility}
          autoPostRuns={autoPostRuns}
          setAutoPostRuns={setAutoPostRuns}
          autoPostWorkouts={autoPostWorkouts}
          setAutoPostWorkouts={setAutoPostWorkouts}
          audioCues={audioCues}
          setAudioCues={setAudioCues}
          privacyZones={privacyZones}
          addZone={addZone}
          removeZone={removeZone}
          newZoneName={newZoneName}
          setNewZoneName={setNewZoneName}
          newZoneRadius={newZoneRadius}
          setNewZoneRadius={setNewZoneRadius}
          defaultCrews={defaultCrews}
          currentCrew={currentCrew}
          joinCrew={joinCrew}
          leaveCrew={leaveCrew}
        />
      )}

      {/* Data & Account — also under Account tab */}
      {visibleTab === "account" && (
        <AccountSection
          user={user}
          signOut={signOut}
        />
      )}

      <p className="text-center text-xs text-muted-foreground">
        Tropos v1.1.0
      </p>

      {/* Restructure Warning Modal */}
      {showRestructureModal && pendingLiftDays !== null && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[1000]"
            onClick={() => {
              setShowRestructureModal(false);
            }}
          />
          <div ref={restructureModalRef} role="dialog" aria-modal="true" className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[1001] bg-card rounded-2xl p-5 space-y-4 max-w-sm mx-auto shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Restructure Program?</h3>
            <p className="text-sm text-muted-foreground">
              Changing your training days will restructure your program. Your workout history won&apos;t be affected, but your program will be rebuilt. This cannot be undone.
            </p>
            <p className="text-sm font-medium text-foreground">
              Your new program will use a <span className="text-primary">{splitLabel(chooseSplit(pendingLiftDays))}</span> split.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowRestructureModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRestructure}
                disabled={restructuring}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2"
              >
                {restructuring ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Rebuilding...
                  </>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
