import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { calculateTDEE, ACTIVITY_LABELS } from "@/lib/tdee";
import type { ActivityLevel } from "@/lib/tdee";
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
  Calculator,
  ChevronDown,
  ChevronUp,
  Download,
  Timer,
  Users,
  Footprints,
  MapPin,
  Trash2,
  Plus,
  Bell,
} from "lucide-react";
import { exportWorkoutsCSV, exportMealsCSV, exportBodyweightCSV, downloadCSV } from "@/lib/export";
import { useProgram } from "@/features/program/useProgram";
import { chooseSplit, splitLabel } from "@/features/program/programEngine";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getRacePhaseLabel } from "@/features/program/runScheduler";
import { generateSchedule, DAY_LABELS } from "@/lib/scheduleUtils";
import type { ScheduleDay, DayType } from "@/lib/scheduleUtils";
import { THEME } from "@/lib/theme";
import AccordionSection from "@/components/AccordionSection";
import { usePrivacyZones } from "@/hooks/usePrivacyZones";
import { useMealReminders } from "@/hooks/useMealReminders";
import ShoesManager from "@/components/settings/ShoesManager";
import { useCrews } from "@/hooks/useCrews";

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
  const { user, profile, updateProfile, signOut } = useAuth();
  const { isPro, isInTrial, trialDaysLeft, tier } = useSubscription();
  const { checkout, loading: checkoutLoading, error: checkoutError } = useStripeCheckout();
  const { defaultCrews, currentCrew, joinCrew, leaveCrew } = useCrews();
  const [showCrewPicker, setShowCrewPicker] = useState(false);
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
  const [exporting, setExporting] = useState<string | null>(null);
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
    // No modal here — free editing. Modal fires only on "Apply Changes".
  };

  // Detect unsaved schedule changes
  const hasUnsavedScheduleChanges = useMemo(() => {
    if (!customSchedule) return false;
    if (!savedSchedule) return true; // custom schedule set but no saved one
    return customSchedule.some((s, i) => s.type !== savedSchedule[i]?.type);
  }, [customSchedule, savedSchedule]);

  const handleApplyScheduleChanges = async () => {
    const currentLiftDays = schedule.filter((s) => s.type === "lift" || s.type === "both").length;
    // If lift days changed, show restructure modal
    if (currentLiftDays !== savedLiftDays && currentLiftDays > 0) {
      setPendingLiftDays(currentLiftDays);
      setShowRestructureModal(true);
    } else {
      // No lift day change — save silently
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
      // Show spinner for 1.5s then restructure
      await new Promise((r) => setTimeout(r, 1500));
      await regenerateProgram(undefined, pendingLiftDays);
      // Also save the updated schedule to Firestore
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
    // Refresh run schedule if user is in structured/race_prep mode
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
      <div className="bg-card rounded-2xl border border-border/50 border-l-4 border-purple-500 p-4 space-y-3">
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
          <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
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

      {/* Profile & Goals */}
      <AccordionSection icon={<User className="w-5 h-5 text-primary" />} title="Profile & Goals" subtitle="Name, body stats, weekly schedule" defaultOpen>
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

      {/* Weekly Schedule */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <Target className="w-4 h-4" />
          Weekly Schedule
        </p>
        <div>
          <label className="text-sm text-muted-foreground">
            Weekly meal logging target ({mealsTarget})
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

        {/* Visual schedule editor */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
          <p className="text-xs font-medium text-foreground">
            Your week
            {hasUnsavedScheduleChanges && (
              <span style={{ color: "#d97706", fontWeight: 400 }}> · unsaved changes</span>
            )}
          </p>
          <div className="grid grid-cols-7 gap-1.5">
            {schedule
              .slice()
              .sort((a, b) => a.day - b.day)
              .map((s) => {
                const color =
                  s.type === "lift"
                    ? THEME.lifting
                    : s.type === "run"
                      ? THEME.running
                      : s.type === "both"
                        ? THEME.lifting
                        : undefined;
                const label = s.type === "lift" ? "Lift" : s.type === "run" ? "Run" : s.type === "both" ? "Both" : "Rest";
                return (
                  <button
                    key={s.day}
                    onClick={() => handleDayToggle(s.day)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all text-center",
                      s.type !== "rest"
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/50 bg-muted/30"
                    )}
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {DAY_LABELS[s.day].charAt(0)}
                    </span>
                    {s.type === "both" ? (
                      <div className="w-3 h-3 rounded-full overflow-hidden flex">
                        <div className="w-1/2 h-full" style={{ backgroundColor: THEME.lifting }} />
                        <div className="w-1/2 h-full" style={{ backgroundColor: THEME.running }} />
                      </div>
                    ) : color ? (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-muted" />
                    )}
                    <span
                      className="text-[9px] font-medium"
                      style={{ color: s.type === "both" ? THEME.lifting : (color || "var(--muted-foreground)") }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Tap any day to cycle between Rest &rarr; Lift &rarr; Run &rarr; Both
          </p>
          {hasUnsavedScheduleChanges && (
            <button
              onClick={handleApplyScheduleChanges}
              style={{
                width: "100%",
                padding: "14px",
                background: "#8b5cf6",
                color: "white",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15,
                border: "none",
                cursor: "pointer",
                marginTop: 12,
              }}
            >
              Apply Changes
            </button>
          )}
        </div>

        {/* Run mode — controls how run days get templates */}
        {runsTarget > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-foreground flex items-center gap-2">
              <Footprints className="w-4 h-4" style={{ color: THEME.running }} />
              Run Mode
            </p>
            <div className="flex gap-2">
              {(["freeform", "structured", "race_prep"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => updateProfile({ runMode: mode })}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                    (profile?.runMode ?? "freeform") === mode
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {mode === "race_prep" ? "Race Prep" : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {(profile?.runMode ?? "freeform") === "freeform"
                ? "Pick any run type when you start"
                : (profile?.runMode ?? "freeform") === "structured"
                  ? "Auto-assigns run templates to your run days"
                  : "Follows a race training plan"}
            </p>

            {/* Race prep details */}
            {profile?.runMode === "race_prep" && programState?.runPlan?.raceGoal && (
              <div className="p-3 rounded-xl bg-card border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Race</span>
                  <span className="text-sm font-medium text-foreground">
                    {programState.runPlan.raceGoal.distance.toUpperCase()} &mdash; {programState.runPlan.raceGoal.targetDate}
                  </span>
                </div>
                {programState.runPlan.totalWeeks && programState.runPlan.currentWeek != null && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Week</span>
                      <span className="text-sm font-medium text-foreground">
                        {programState.runPlan.currentWeek + 1} / {programState.runPlan.totalWeeks}
                        {" \u00B7 "}
                        {getRacePhaseLabel(programState.runPlan.currentWeek, programState.runPlan.totalWeeks)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: ((programState.runPlan.currentWeek + 1) / programState.runPlan.totalWeeks * 100) + "%" }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Template overrides per run day */}
            {profile?.runMode && profile.runMode !== "freeform" && (programState?.runDays ?? []).length > 0 && (
              <div className="p-3 rounded-xl bg-card border border-border/50 space-y-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">This week&apos;s runs</p>
                {(programState?.runDays ?? []).map((rd) => (
                  <div key={rd.dayIndex} className="flex items-center gap-3 py-1">
                    <span className="text-xs font-medium text-foreground w-8">
                      {DAY_LABELS[rd.dayIndex]}
                    </span>
                    <select
                      value={rd.userOverride || rd.templateId}
                      onChange={(e) => overrideRunDay(rd.dayIndex, e.target.value)}
                      className="flex-1 bg-muted rounded-lg px-2 py-1.5 text-xs border border-border/50"
                    >
                      {RUN_TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                      ))}
                    </select>
                    {rd.completed && (
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </AccordionSection>

      {/* Save — always visible */}
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

      {/* Training Setup */}
      <AccordionSection icon={<Calculator className="w-5 h-5 text-primary" />} title="Training Setup" subtitle="TDEE & training phase">

      {/* TDEE Calculator */}
      <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
        <button
          onClick={() => setShowTDEE(!showTDEE)}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-3">
            <Calculator className="w-5 h-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">TDEE Calculator</p>
              <p className="text-xs text-muted-foreground">
                {tdee.targetCalories} cal/day target
              </p>
            </div>
          </div>
          {showTDEE ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {showTDEE && (
          <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
            <div>
              <label className="text-sm text-muted-foreground">Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value) || 25)}
                className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="text-sm text-muted-foreground">Activity Level</label>
              <div className="mt-1 space-y-1">
                {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActivityLevel(key)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors",
                      activityLevel === key
                        ? "bg-primary/10 text-primary font-medium"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* TDEE Results */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{tdee.bmr}</p>
                <p className="text-[10px] text-muted-foreground">BMR</p>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{tdee.tdee}</p>
                <p className="text-[10px] text-muted-foreground">TDEE</p>
              </div>
            </div>

            <div className="bg-primary/5 rounded-xl p-4 space-y-2">
              <p className="text-xs font-medium text-foreground">
                Daily Target: <span className="text-primary">{tdee.targetCalories} cal</span>
                {tdee.deficit !== 0 && (
                  <span className="text-muted-foreground">
                    {" "}({tdee.deficit > 0 ? "+" : ""}{tdee.deficit})
                  </span>
                )}
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-bold text-blue-500">{tdee.protein}g</p>
                  <p className="text-[10px] text-muted-foreground">Protein</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-500">{tdee.carbs}g</p>
                  <p className="text-[10px] text-muted-foreground">Carbs</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-pink-500">{tdee.fat}g</p>
                  <p className="text-[10px] text-muted-foreground">Fat</p>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Training Phase */}
      <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Training Phase</p>
            <p className="text-xs text-muted-foreground">
              Adjusts macro targets and performance insights
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([
            { value: "lean bulk" as const, label: "Lean Bulk", desc: "Muscle gain", color: "#22c55e" },
            { value: "cut" as const, label: "Cut", desc: "Fat loss", color: "#ef4444" },
            { value: "recomp" as const, label: "Recomp", desc: "Body recomp", color: "#a855f7" },
          ]).map((phase) => (
            <button
              key={phase.value}
              onClick={() => setTrainingPhase(phase.value)}
              className={cn(
                "p-3 rounded-xl border text-center transition-all",
                trainingPhase === phase.value
                  ? "border-primary bg-primary/10"
                  : "border-border/50 bg-muted/30 hover:border-border"
              )}
            >
              <div
                className="w-2 h-2 rounded-full mx-auto mb-2"
                style={{ backgroundColor: phase.color }}
              />
              <p className={cn(
                "text-xs font-medium",
                trainingPhase === phase.value ? "text-primary" : "text-foreground"
              )}>
                {phase.label}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {phase.desc}
              </p>
            </button>
          ))}
        </div>

        <p className="text-xs text-primary/60 italic text-center">
          Tap Save Changes to apply
        </p>

        <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Daily targets for {trainingPhase}
          </p>
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="text-sm font-bold text-foreground">{tdee.targetCalories}</p>
              <p className="text-[9px] text-muted-foreground">cal</p>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="text-center flex-1">
              <p className="text-sm font-bold text-blue-500">{tdee.protein}g</p>
              <p className="text-[9px] text-muted-foreground">protein</p>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="text-center flex-1">
              <p className="text-sm font-bold text-amber-500">{tdee.carbs}g</p>
              <p className="text-[9px] text-muted-foreground">carbs</p>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="text-center flex-1">
              <p className="text-sm font-bold text-pink-500">{tdee.fat}g</p>
              <p className="text-[9px] text-muted-foreground">fat</p>
            </div>
          </div>
          {tdee.deficit !== 0 && (
            <p className="text-[10px] text-muted-foreground text-center">
              {tdee.deficit > 0 ? "+" : ""}{tdee.deficit} cal vs maintenance
            </p>
          )}
            {/* Manual calorie override */}
            <div className="mt-3 pt-3 border-t border-border/50">
              <label className="text-sm text-muted-foreground">
                Custom daily target (optional)
              </label>
              <p className="text-[10px] text-muted-foreground mt-0.5 mb-2">
                Leave blank to use your calculated TDEE of {tdee.targetCalories} cal
              </p>
              <input
                type="number"
                value={profile?.customCalorieTarget ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  updateProfile({ customCalorieTarget: val || undefined });
                }}
                placeholder={String(tdee.targetCalories)}
                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
        </div>
      </div>


      </AccordionSection>

      {/* Shoe Mileage Tracker */}
      <AccordionSection icon={<Footprints className="w-5 h-5 text-primary" />} title="My Shoes" subtitle="Track mileage, get replacement alerts">
        <ShoesManager />
      </AccordionSection>

      {/* Preferences */}
      <AccordionSection icon={<Timer className="w-5 h-5 text-primary" />} title="Preferences" subtitle="Rest timer, units, dark mode">
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Workout Preferences</p>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Auto-start rest timer</p>
            <p className="text-[10px] text-muted-foreground">Timer starts after completing a set</p>
          </div>
          <button
            onClick={async () => {
              const next = !autoRestTimer;
              setAutoRestTimer(next);
              await updateProfile({ autoRestTimer: next });
            }}
            className={cn("w-10 h-6 rounded-full transition-colors relative", autoRestTimer ? "bg-primary" : "bg-muted border border-border")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", autoRestTimer ? "translate-x-5" : "translate-x-1")} />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <span className="text-sm text-foreground">Default rest time</span>
          <select
            value={defaultRestSeconds}
            onChange={async (e) => {
              const val = Number(e.target.value);
              setDefaultRestSeconds(val);
              await updateProfile({ defaultRestSeconds: val });
            }}
            className="bg-card rounded-lg px-2 py-1 text-sm border border-border/50"
          >
            <option value={60}>1:00</option>
            <option value={90}>1:30</option>
            <option value={120}>2:00</option>
            <option value={150}>2:30</option>
            <option value={180}>3:00</option>
            <option value={240}>4:00</option>
            <option value={300}>5:00</option>
          </select>
        </div>
      </div>

      <p className="text-sm font-medium text-foreground mt-2">Units & Appearance</p>
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
      </AccordionSection>

      {/* Meal Reminders */}
      <AccordionSection icon={<Bell className="w-5 h-5 text-primary" />} title="Meal Reminders" subtitle="Notification timings & timezone">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <div>
              <p className="text-sm text-foreground">Enable reminders</p>
              <p className="text-[10px] text-muted-foreground">Get notified when it's time to eat</p>
            </div>
            <button
              onClick={async () => {
                const next = !mealReminders.enabled;
                if (next && 'Notification' in window && Notification.permission === 'default') {
                  await Notification.requestPermission();
                }
                await updateReminders({ enabled: next });
              }}
              className={cn("w-10 h-6 rounded-full transition-colors relative", mealReminders.enabled ? "bg-primary" : "bg-muted border border-border")}
            >
              <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", mealReminders.enabled ? "translate-x-5" : "translate-x-1")} />
            </button>
          </div>

          {mealReminders.enabled && (
            <>
              {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
                <div key={meal} className="flex items-center justify-between p-4 rounded-lg bg-muted">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateReminders({ [meal]: { ...mealReminders[meal], enabled: !mealReminders[meal].enabled } })}
                      className={cn("w-8 h-5 rounded-full transition-colors relative", mealReminders[meal].enabled ? "bg-primary" : "bg-muted border border-border")}
                    >
                      <div className={cn("w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform shadow-sm", mealReminders[meal].enabled ? "translate-x-[14px]" : "translate-x-[3px]")} />
                    </button>
                    <span className="text-sm text-foreground capitalize">{meal}</span>
                  </div>
                  <input
                    type="time"
                    value={mealReminders[meal].time}
                    onChange={(e) => updateReminders({ [meal]: { ...mealReminders[meal], time: e.target.value } })}
                    className="bg-card rounded-lg px-2 py-1 text-sm border border-border/50"
                    disabled={!mealReminders[meal].enabled}
                  />
                </div>
              ))}

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                <span className="text-sm text-foreground">Timezone</span>
                <p className="text-xs text-muted-foreground">{mealReminders.timezone}</p>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                Notifications work best when installed as an app
              </p>
            </>
          )}
        </div>
      </AccordionSection>

      {/* Social & Privacy */}
      <AccordionSection icon={<Users className="w-5 h-5 text-primary" />} title="Social & Privacy" subtitle="Crew, visibility, auto-post">
        {/* Crew switcher */}
        <div className="p-4 rounded-lg bg-muted space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Your crew</p>
              <p className="text-[10px] text-muted-foreground">
                {currentCrew ? `${currentCrew.icon} ${currentCrew.name}` : 'Not in a crew'}
              </p>
            </div>
            <button
              onClick={() => setShowCrewPicker(!showCrewPicker)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground"
            >
              {currentCrew ? 'Switch' : 'Join'}
            </button>
          </div>
          {showCrewPicker && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              {defaultCrews.map(crew => (
                <button
                  key={crew.id}
                  onClick={async () => { await joinCrew(crew.id); setShowCrewPicker(false); toast.success(`Joined ${crew.name}`); }}
                  className={cn(
                    "w-full flex items-center gap-2 p-2.5 rounded-lg text-left text-xs transition-colors",
                    currentCrew?.id === crew.id ? "bg-primary/10 border border-primary/30" : "bg-background hover:bg-muted"
                  )}
                >
                  <span className="text-lg">{crew.icon}</span>
                  <div className="flex-1">
                    <p className="font-medium">{crew.name}</p>
                    <p className="text-[10px] text-muted-foreground">{crew.description}</p>
                  </div>
                  {currentCrew?.id === crew.id && <Check className="w-3.5 h-3.5 text-primary" />}
                </button>
              ))}
              {currentCrew && (
                <button
                  onClick={async () => { await leaveCrew(); setShowCrewPicker(false); toast.success('Left crew'); }}
                  className="w-full text-center text-[11px] text-muted-foreground hover:text-red-400 py-1"
                >
                  Leave crew
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Default visibility</p>
            <p className="text-[10px] text-muted-foreground">Who can see your posts</p>
          </div>
          <select
            value={defaultVisibility}
            onChange={async (e) => {
              const val = e.target.value as "public" | "followers" | "private";
              setDefaultVisibility(val);
              await updateProfile({ defaultVisibility: val });
            }}
            className="bg-card rounded-lg px-2 py-1 text-sm border border-border/50"
          >
            <option value="public">Public</option>
            <option value="followers">Followers</option>
            <option value="private">Private</option>
          </select>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Auto-post runs</p>
            <p className="text-[10px] text-muted-foreground">Share runs to feed automatically</p>
          </div>
          <button
            onClick={async () => {
              const next = !autoPostRuns;
              setAutoPostRuns(next);
              await updateProfile({ autoPostRuns: next });
            }}
            className={cn("w-10 h-6 rounded-full transition-colors relative", autoPostRuns ? "bg-primary" : "bg-muted border border-border")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", autoPostRuns ? "translate-x-5" : "translate-x-1")} />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Auto-post workouts</p>
            <p className="text-[10px] text-muted-foreground">Share workouts to feed automatically</p>
          </div>
          <button
            onClick={async () => {
              const next = !autoPostWorkouts;
              setAutoPostWorkouts(next);
              await updateProfile({ autoPostWorkouts: next });
            }}
            className={cn("w-10 h-6 rounded-full transition-colors relative", autoPostWorkouts ? "bg-primary" : "bg-muted border border-border")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", autoPostWorkouts ? "translate-x-5" : "translate-x-1")} />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Audio cues</p>
            <p className="text-[10px] text-muted-foreground">Voice announcements during runs</p>
          </div>
          <button
            onClick={async () => {
              const next = !audioCues;
              setAudioCues(next);
              await updateProfile({ audioCues: next });
            }}
            className={cn("w-10 h-6 rounded-full transition-colors relative", audioCues ? "bg-primary" : "bg-muted border border-border")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", audioCues ? "translate-x-5" : "translate-x-1")} />
          </button>
        </div>

        {/* Privacy Zones */}
        <div className="p-4 rounded-lg bg-muted space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Privacy Zones</p>
              <p className="text-[10px] text-muted-foreground">Hide route start/end near saved locations</p>
            </div>
          </div>

          {privacyZones.map((z) => (
            <div key={z.id} className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border/50">
              <div>
                <p className="text-xs font-medium text-foreground">{z.name}</p>
                <p className="text-[10px] text-muted-foreground">{z.radiusMeters}m radius</p>
              </div>
              <button
                onClick={() => removeZone(z.id)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <div className="flex gap-2">
            <input
              type="text"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              placeholder="Zone name (e.g. Home)"
              className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-sm"
            />
            <select
              value={newZoneRadius}
              onChange={(e) => setNewZoneRadius(Number(e.target.value))}
              className="px-2 py-2 rounded-lg bg-card border border-border text-sm"
            >
              <option value={200}>200m</option>
              <option value={500}>500m</option>
              <option value={750}>750m</option>
              <option value={1000}>1km</option>
            </select>
          </div>
          <button
            onClick={async () => {
              if (!newZoneName.trim()) { toast.error("Enter a zone name"); return; }
              try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                  navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
                );
                await addZone({ name: newZoneName.trim(), lat: pos.coords.latitude, lon: pos.coords.longitude, radiusMeters: newZoneRadius });
                setNewZoneName("");
                toast.success("Privacy zone added");
              } catch {
                toast.error("Could not get your location");
              }
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> Add Current Location
          </button>
        </div>
      </AccordionSection>

      {/* Data & Account */}
      <AccordionSection icon={<Download className="w-5 h-5 text-primary" />} title="Data & Account" subtitle="Export, privacy, sign out">
        <div className="space-y-2">
          {[
            { label: "Export Workouts (CSV)", key: "workouts" },
            { label: "Export Meals (CSV)", key: "meals" },
            { label: "Export Bodyweight (CSV)", key: "bodyweight" },
          ].map(({ label, key }) => (
            <button
              key={key}
              disabled={exporting !== null}
              onClick={async () => {
                if (!user) return;
                setExporting(key);
                try {
                  let csv: string;
                  if (key === "workouts") csv = await exportWorkoutsCSV(user.uid);
                  else if (key === "meals") csv = await exportMealsCSV(user.uid);
                  else csv = await exportBodyweightCSV(user.uid);
                  downloadCSV(csv, `tropos-${key}-${new Date().toISOString().split("T")[0]}.csv`);
                  toast.success(`${key.charAt(0).toUpperCase() + key.slice(1)} exported!`);
                } catch (err) {
                  toast.error("Export failed");
                  console.error(err);
                }
                setExporting(null);
              }}
              className="w-full p-3 rounded-xl bg-card border border-border text-sm text-left hover:bg-muted transition-colors disabled:opacity-50"
            >
              {exporting === key ? "Exporting..." : label}
            </button>
          ))}
        </div>

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

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={signOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </motion.button>
      </AccordionSection>

      <p className="text-center text-xs text-muted-foreground">
        Tropos v1.1.0
      </p>

      {/* Restructure Warning Modal */}
      {showRestructureModal && pendingLiftDays !== null && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[1000]"
            onClick={() => {
              // Cancel — keep grid in edited state, just close modal
              setShowRestructureModal(false);
            }}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[1001] bg-card rounded-2xl border border-border/50 p-5 space-y-4 max-w-sm mx-auto shadow-xl">
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
                  // Cancel — close modal but keep grid in edited (unsaved) state
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
