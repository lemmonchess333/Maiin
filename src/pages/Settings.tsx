import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { detectPlateau, calculateAdaptiveMacros, phaseConfig } from "@/lib/plateauDetection";
import type { PhaseMode } from "@/lib/plateauDetection";
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
  Lock,
  Brain,
  Footprints,
} from "lucide-react";
import { exportWorkoutsCSV, exportMealsCSV, exportBodyweightCSV, downloadCSV } from "@/lib/export";
import { useProgram } from "@/features/program/useProgram";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getRacePhaseLabel } from "@/features/program/runScheduler";
import { generateSchedule, DAY_LABELS } from "@/lib/scheduleUtils";
import type { ScheduleDay, DayType } from "@/lib/scheduleUtils";
import { THEME } from "@/lib/theme";

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

function AIAdjustmentsSection() {
  const { profile, updateProfile } = useAuth();
  const { isPro } = useSubscription();
  const { currentWeek } = usePerformanceWeeks();

  const phase = (profile?.program?.currentPhase || "recomp") as PhaseMode;
  const sensitivity = phaseConfig[phase]?.plateauSensitivity ?? 1;

  const avgLiftChange = currentWeek
    ? (currentWeek.breakdown.liftLoadScore - 50) / 50
    : 0;
  const avgWeightChange = 0;

  const plateau = detectPlateau(avgLiftChange, avgWeightChange, sensitivity);
  const macros = calculateAdaptiveMacros(
    profile?.weightKg || 70,
    avgLiftChange,
    avgWeightChange,
    phase
  );

  const statusColors: Record<string, string> = {
    progressing: "text-green-500",
    stalling: "text-amber-500",
    regressing: "text-red-500",
    weight_only: "text-amber-500",
  };

  if (!isPro) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="w-5 h-5" />
          AI Adjustments
        </h2>
        <div className="p-4 rounded-2xl bg-muted/50 border border-border/50 flex items-center gap-3">
          <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Pro Feature</p>
            <p className="text-xs text-muted-foreground">
              Upgrade to unlock AI-driven plateau detection and macro adjustments.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Brain className="w-5 h-5" />
        AI Adjustments
      </h2>

      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Phase</span>
          <span className="text-sm font-medium text-foreground capitalize">{phase}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
          <span className={cn("text-sm font-semibold capitalize", statusColors[plateau.status] || "text-foreground")}>
            {plateau.status}
          </span>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">{plateau.message}</p>

        {plateau.calorieAdjust !== 0 && (
          <button
            onClick={async () => {
              const current = profile?.targetCalories || profile?.macroTargets?.calories || 2200;
              const adjusted = current + plateau.calorieAdjust;
              await updateProfile({ targetCalories: adjusted });
              toast.success(
                `Calories ${plateau.calorieAdjust > 0 ? "increased" : "decreased"} to ${adjusted}`,
                { description: plateau.macroNote }
              );
            }}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            Apply: {plateau.calorieAdjust > 0 ? "+" : ""}{plateau.calorieAdjust} cal
          </button>
        )}
      </div>

      <div className="p-4 rounded-2xl bg-card border border-border/50">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">AI Macro Targets</p>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-sm font-bold tabular-nums text-orange-500">{macros.calories}</p>
            <p className="text-[9px] text-muted-foreground">cal</p>
          </div>
          <div>
            <p className="text-sm font-bold tabular-nums text-blue-500">{macros.protein}g</p>
            <p className="text-[9px] text-muted-foreground">protein</p>
          </div>
          <div>
            <p className="text-sm font-bold tabular-nums text-amber-500">{macros.carbs}g</p>
            <p className="text-[9px] text-muted-foreground">carbs</p>
          </div>
          <div>
            <p className="text-sm font-bold tabular-nums text-purple-500">{macros.fat}g</p>
            <p className="text-[9px] text-muted-foreground">fat</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function RunScheduleSection() {
  const { profile, updateProfile } = useAuth();
  const { programState, overrideRunDay } = useProgram();

  const runMode = profile?.runMode ?? "freeform";
  const runDays = programState?.runDays ?? [];
  const runPlan = programState?.runPlan;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Footprints className="w-5 h-5" />
        Run Schedule
      </h2>

      {/* Mode selector */}
      <div className="flex gap-2">
        {(["freeform", "structured", "race_prep"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => updateProfile({ runMode: mode })}
            className={cn(
              "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
              runMode === mode
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {mode === "race_prep" ? "Race Prep" : mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {runMode !== "freeform" && (
        <>
          {/* Run days per week */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <span className="text-sm text-foreground">Run days / week</span>
            <select
              value={profile?.weeklyRunDaysTarget ?? 3}
              onChange={(e) => updateProfile({ weeklyRunDaysTarget: Number(e.target.value) })}
              className="bg-card rounded-lg px-2 py-1 text-sm border border-border/50"
            >
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Race prep details */}
          {runMode === "race_prep" && runPlan?.raceGoal && (
            <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Race</span>
                <span className="text-sm font-medium text-foreground">
                  {runPlan.raceGoal.distance.toUpperCase()} &mdash; {runPlan.raceGoal.targetDate}
                </span>
              </div>
              {runPlan.totalWeeks && runPlan.currentWeek != null && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Week</span>
                    <span className="text-sm font-medium text-foreground">
                      {runPlan.currentWeek + 1} / {runPlan.totalWeeks}
                      {" \u00B7 "}
                      {getRacePhaseLabel(runPlan.currentWeek, runPlan.totalWeeks)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: ((runPlan.currentWeek + 1) / runPlan.totalWeeks * 100) + "%" }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Weekly run day view */}
          {runDays.length > 0 && (
            <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">This week</p>
              {runDays.map((rd) => (
                <div key={rd.dayIndex} className="flex items-center gap-3 py-1.5">
                  <span className="text-xs font-medium text-foreground w-8">
                    {DAY_NAMES[rd.dayIndex]}
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
        </>
      )}
    </div>
  );
}

export default function Settings() {
  const { user, profile, updateProfile, signOut } = useAuth();
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
  const [showTDEE, setShowTDEE] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [autoRestTimer, setAutoRestTimer] = useState(profile?.autoRestTimer ?? true);
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(profile?.defaultRestSeconds ?? 120);
  const [defaultVisibility, setDefaultVisibility] = useState<"public" | "followers" | "private">(profile?.defaultVisibility ?? "public");
  const [autoPostRuns, setAutoPostRuns] = useState(profile?.autoPostRuns ?? true);
  const [autoPostWorkouts, setAutoPostWorkouts] = useState(profile?.autoPostWorkouts ?? false);
  const [audioCues, setAudioCues] = useState(profile?.audioCues ?? true);
  const [age, setAge] = useState(25);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");
  const [trainingPhase, setTrainingPhase] = useState<"cut" | "lean bulk" | "recomp">(
    (profile?.program?.goal as "cut" | "lean bulk" | "recomp") ?? "recomp"
  );
  const [runsTarget, setRunsTarget] = useState(profile?.weeklyRunsTarget || 2);
  const [customSchedule, setCustomSchedule] = useState<ScheduleDay[] | null>(
    profile?.weekSchedule && profile.weekSchedule.length === 7 ? profile.weekSchedule : null
  );

  const schedule = useMemo(() => {
    if (customSchedule) return customSchedule;
    return generateSchedule(workoutsTarget, runsTarget);
  }, [workoutsTarget, runsTarget, customSchedule]);

  const handleWorkoutsChange = (val: number) => {
    setWorkoutsTarget(val);
    setCustomSchedule(null);
  };

  const handleRunsChange = (val: number) => {
    setRunsTarget(val);
    setCustomSchedule(null);
  };

  const handleDayToggle = (day: number) => {
    const current = schedule.find((s) => s.day === day);
    if (!current) return;
    const cycle: DayType[] = ["lift", "run", "rest"];
    const nextIdx = (cycle.indexOf(current.type) + 1) % cycle.length;
    const updated = schedule.map((s) =>
      s.day === day ? { ...s, type: cycle[nextIdx] } : s
    );
    setCustomSchedule(updated);
    setWorkoutsTarget(updated.filter((s) => s.type === "lift").length);
    setRunsTarget(updated.filter((s) => s.type === "run").length);
  };

  const tdee = useMemo(() => {
    return calculateTDEE(weightKg, heightCm, age, activityLevel, trainingPhase);
  }, [weightKg, heightCm, age, activityLevel, trainingPhase]);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({
      displayName: name,
      weightKg,
      heightCm,
      weeklyWorkoutsTarget: workoutsTarget,
      weeklyRunsTarget: runsTarget,
      weeklyMealsTarget: mealsTarget,
      weekSchedule: schedule,
      program: {
        goal: trainingPhase,
        startWeight: profile?.program?.startWeight ?? weightKg,
        currentPhase: profile?.program?.currentPhase ?? "base",
      },
      targetCalories: tdee.targetCalories,
      targetProtein: tdee.protein,
      targetCarbs: tdee.carbs,
      targetFat: tdee.fat,
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
          Weekly Schedule
        </h2>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-muted-foreground flex items-center gap-2">
              <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
              Lift days ({workoutsTarget})
            </label>
          </div>
          <input
            type="range"
            min="0"
            max={7 - runsTarget}
            value={workoutsTarget}
            onChange={(e) => handleWorkoutsChange(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-muted-foreground flex items-center gap-2">
              <Footprints className="w-4 h-4" style={{ color: THEME.running }} />
              Run days ({runsTarget})
            </label>
          </div>
          <input
            type="range"
            min="0"
            max={7 - workoutsTarget}
            value={runsTarget}
            onChange={(e) => handleRunsChange(Number(e.target.value))}
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

        {/* Visual schedule editor */}
        <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
          <p className="text-xs font-medium text-foreground">Your week</p>
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
                      : undefined;
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
                    {color ? (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-muted" />
                    )}
                    <span
                      className="text-[9px] font-medium"
                      style={{ color: color || "var(--muted-foreground)" }}
                    >
                      {s.type === "lift" ? "Lift" : s.type === "run" ? "Run" : "Rest"}
                    </span>
                  </button>
                );
              })}
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Tap a day to change it &middot; {7 - workoutsTarget - runsTarget} rest day{7 - workoutsTarget - runsTarget !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* TDEE Calculator */}
      <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
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
      <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
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

        <p className="text-[10px] text-muted-foreground text-center">
          Changes apply when you tap Save Changes below
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

      {/* AI Adjustments (Pro) */}
      <AIAdjustmentsSection />

      {/* Run Schedule */}
      <RunScheduleSection />

      {/* Workout Preferences */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Timer className="w-5 h-5" />
          Workout Preferences
        </h2>

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

      {/* Social & Privacy */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" />
          Social & Privacy
        </h2>

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
      </div>

      {/* Export Data */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Download className="w-5 h-5" />
          Export Data
        </h2>

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
                downloadCSV(csv, `maiin-${key}-${new Date().toISOString().split("T")[0]}.csv`);
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
