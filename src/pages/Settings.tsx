import { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { calculateTDEE } from "@/lib/tdee";
import type { ActivityLevel } from "@/lib/tdee";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useFeatureFlag, useFeatureFlagToggle } from "@/config/featureFlags";
import { haptic } from "@/lib/haptic";
import {
  Zap,
  Crown,
  ChevronRight,
} from "lucide-react";
import { useProgram } from "@/features/program/useProgram";
import { chooseSplit, splitLabel } from "@/features/program/programEngine";
import { generateSchedule } from "@/lib/scheduleUtils";
import type { ScheduleDay, DayType } from "@/lib/scheduleUtils";
import { usePrivacyZones } from "@/hooks/usePrivacyZones";
import { useMealReminders } from "@/hooks/useMealReminders";
import { useWorkoutReminders } from "@/hooks/useWorkoutReminders";
import { useCrews } from "@/hooks/useCrews";
import { useFocusTrap } from "@/hooks/useFocusTrap";

import ProfileInfoSection from "@/components/settings/ProfileInfoSection";
import TrainingSection from "@/components/settings/TrainingSection";
import NutritionSection from "@/components/settings/NutritionSection";
import WorkoutPrefsSection from "@/components/settings/WorkoutPrefsSection";
import UnitsAppearanceSection from "@/components/settings/UnitsAppearanceSection";
import ShoesSection from "@/components/settings/ShoesSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import PrivacySection from "@/components/settings/PrivacySection";
import AccountSection from "@/components/settings/AccountSection";
import SupportLegalSection from "@/components/settings/SupportLegalSection";
import SettingsAvatar from "@/components/settings/SettingsAvatar";

declare const __APP_VERSION__: string;

export default function Settings() {
  const navigate = useNavigate();
  const { user, profile, updateProfile, signOut } = useAuth();
  const { isInTrial, trialDaysLeft, tier } = useSubscription();
  const { defaultCrews, currentCrew, joinCrew, leaveCrew } = useCrews();
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
  const { reminders: mealReminders, updateReminders: updateMealReminders } = useMealReminders();
  const { reminders: workoutReminders, updateReminders: updateWorkoutReminders } = useWorkoutReminders();

  // Restructure warning modal state
  const [showRestructureModal, setShowRestructureModal] = useState(false);
  const [pendingLiftDays, setPendingLiftDays] = useState<number | null>(null);
  const [restructuring, setRestructuring] = useState(false);
  const restructureModalRef = useFocusTrap<HTMLDivElement>(showRestructureModal);

  // Schedule tracking for unsaved-changes detection
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

  const hasUnsavedScheduleChanges = useMemo(() => {
    if (!customSchedule) return false;
    if (!savedSchedule) return true;
    return customSchedule.some((s, i) => s.type !== savedSchedule[i]?.type);
  }, [customSchedule, savedSchedule]);

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

  // Reactive TDEE persistence — auto-save derived values when inputs change
  const prevTdeeRef = useRef(tdee);
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return; }
    if (prevTdeeRef.current.targetCalories !== tdee.targetCalories) {
      updateProfile({
        tdeeBase: tdee.targetCalories,
        targetCalories: profile?.customCalorieTarget || tdee.targetCalories,
        targetProtein: tdee.protein,
        targetCarbs: tdee.carbs,
        targetFat: tdee.fat,
      });
    }
    prevTdeeRef.current = tdee;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tdee]);

  const handlePhaseChange = async (phase: "cut" | "lean bulk" | "recomp") => {
    await updateProfile({
      program: {
        goal: phase,
        startWeight: profile?.program?.startWeight ?? weightKg,
        currentPhase: profile?.program?.currentPhase ?? "base",
      },
    });
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

  const foodHeroRing = useFeatureFlag("foodHeroRing");
  const toggleFlag = useFeatureFlagToggle();

  const toggleDevPro = () => {
    if (!import.meta.env.DEV) return;
    const newTier = profile?.subscriptionTier === "pro" ? "free" : "pro";
    updateProfile({ subscriptionTier: newTier }, { allowProtected: true });
    toast.success(newTier === "pro" ? "Pro mode enabled" : "Pro mode disabled");
  };

  if (!profile) return null;

  const itemVariant = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

  return (
    <motion.div className="space-y-4" initial="hidden" animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}>
      {/* Header with avatar */}
      <motion.header variants={itemVariant}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <SettingsAvatar profile={profile} />
            <div>
              <h1 className="text-xl font-extrabold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">Customize your experience</p>
            </div>
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
      </motion.header>

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

      <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-orange-500/10 rounded-xl border border-orange-500/20 p-4"
        >
          <button
            onClick={() => { toggleFlag("foodHeroRing"); haptic("light"); toast.success(foodHeroRing ? "Hero ring off" : "Hero ring on"); }}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-orange-500" />
              <div className="text-left">
                <span className="text-sm font-medium text-foreground">
                  Dev: Food Hero Ring
                </span>
                <p className="text-xs text-muted-foreground">
                  Only visible in development
                </p>
              </div>
            </div>
            <div
              className={cn(
                "w-12 h-7 rounded-full transition-all flex items-center",
                foodHeroRing
                  ? "bg-orange-500 justify-end"
                  : "bg-muted justify-start"
              )}
            >
              <div className="w-5 h-5 bg-white rounded-full mx-1 shadow-sm" />
            </div>
          </button>
        </motion.div>

      {/* 1. Profile */}
      <ProfileInfoSection
        name={name}
        setName={setName}
        weightKg={weightKg}
        setWeightKg={setWeightKg}
        heightCm={heightCm}
        setHeightCm={setHeightCm}
        updateProfile={updateProfile}
      />

      {/* 2. Training */}
      <TrainingSection
        profile={profile}
        runsTarget={runsTarget}
        schedule={schedule}
        hasUnsavedScheduleChanges={hasUnsavedScheduleChanges}
        handleDayToggle={handleDayToggle}
        handleApplyScheduleChanges={handleApplyScheduleChanges}
        updateProfile={updateProfile}
        navigate={navigate}
        programState={programState}
        overrideRunDay={overrideRunDay}
        refreshRunSchedule={refreshRunSchedule}
      />

      {/* 3. Nutrition */}
      <NutritionSection
        profile={profile}
        age={age}
        setAge={setAge}
        activityLevel={activityLevel}
        setActivityLevel={setActivityLevel}
        trainingPhase={trainingPhase}
        setTrainingPhase={setTrainingPhase}
        mealsTarget={mealsTarget}
        setMealsTarget={setMealsTarget}
        tdee={tdee}
        updateProfile={updateProfile}
        onPhaseChange={handlePhaseChange}
      />

      {/* 4. Workout Preferences */}
      <WorkoutPrefsSection
        autoRestTimer={autoRestTimer}
        setAutoRestTimer={setAutoRestTimer}
        defaultRestSeconds={defaultRestSeconds}
        setDefaultRestSeconds={setDefaultRestSeconds}
        audioCues={audioCues}
        setAudioCues={setAudioCues}
        updateProfile={updateProfile}
      />

      {/* 5. Units & Appearance */}
      <UnitsAppearanceSection
        profile={profile}
        toggleUnit={toggleUnit}
        toggleDark={toggleDark}
      />

      {/* 6. Social & Privacy */}
      <PrivacySection
        user={user}
        updateProfile={updateProfile}
        defaultVisibility={defaultVisibility}
        setDefaultVisibility={setDefaultVisibility}
        autoPostRuns={autoPostRuns}
        setAutoPostRuns={setAutoPostRuns}
        autoPostWorkouts={autoPostWorkouts}
        setAutoPostWorkouts={setAutoPostWorkouts}
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

      {/* 7. My Shoes */}
      <ShoesSection />

      {/* 8. Notifications */}
      <NotificationsSection
        mealReminders={mealReminders}
        updateMealReminders={updateMealReminders}
        workoutReminders={workoutReminders}
        updateWorkoutReminders={updateWorkoutReminders}
      />

      {/* 9. Subscription — navigation row, not accordion */}
      <button
        onClick={() => navigate("/upgrade")}
        className="w-full flex items-center justify-between p-4 rounded-2xl bg-card"
      >
        <div className="flex items-center gap-3">
          <Crown className="w-5 h-5 text-primary" />
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Subscription</p>
            <p className="text-xs text-muted-foreground">
              {tier === "pro"
                ? "Pro — Full access"
                : isInTrial
                  ? `Pro trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left`
                  : "Free — Upgrade"}
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* 10. Support & Legal */}
      <SupportLegalSection />

      {/* 11. Account */}
      <AccountSection
        user={user}
        signOut={signOut}
      />

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground">
        Tropos v{__APP_VERSION__}
      </p>

      {/* Restructure Warning Modal */}
      {showRestructureModal && pendingLiftDays !== null && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            role="button" tabIndex={0} aria-label="Close dialog"
            onClick={() => {
              setShowRestructureModal(false);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowRestructureModal(false); }}
          />
          <div ref={restructureModalRef} role="dialog" aria-modal="true" className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-card rounded-2xl p-4 space-y-4 max-w-sm mx-auto shadow-xl">
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
    </motion.div>
  );
}
