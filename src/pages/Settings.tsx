import { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { calculateTDEE } from "@/lib/tdee";
import type { ActivityLevel } from "@/lib/tdee";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Crown,
  ChevronRight,
} from "lucide-react";
import { usePrivacyZones } from "@/hooks/usePrivacyZones";
import {
  useMealReminders,
  useWorkoutReminders,
  useStreakReminder,
} from "@/hooks/RemindersProvider";
import { useCrews } from "@/hooks/useCrews";

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
  // PR-2: Settings no longer owns the schedule editor — the hook
  // and its restructure modal moved to Programme's "Edit weekly
  // layout" sheet. TrainingSection is link-only here.

  const [name, setName] = useState(profile?.displayName || "");
  const [weightKg, setWeightKg] = useState(profile?.weightKg || 70);
  const [heightCm, setHeightCm] = useState(profile?.heightCm || 170);
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
  const { zones: privacyZones, addZone, removeZone } = usePrivacyZones();
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneRadius, setNewZoneRadius] = useState(500);
  const { reminders: mealReminders, updateReminders: updateMealReminders } = useMealReminders();
  const { reminders: workoutReminders, updateReminders: updateWorkoutReminders } = useWorkoutReminders();
  const { prefs: streakReminder, updatePrefs: updateStreakReminder } = useStreakReminder();

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
    const prevPhase = trainingPhase;
    const result = await updateProfile({
      program: {
        goal: phase,
        startWeight: profile?.program?.startWeight ?? weightKg,
        currentPhase: profile?.program?.currentPhase ?? "base",
      },
    });
    // NutritionSection set trainingPhase optimistically before
    // calling onPhaseChange — revert if the write failed so the
    // pills don't claim a phase that didn't persist.
    if (!result.ok) setTrainingPhase(prevPhase);
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
    const prev = !!profile?.darkMode;
    const next = !prev;
    // Optimistic DOM + localStorage swap so the visual change is
    // instant; revert both if the Firestore write fails so the user
    // doesn't see a flicker (theme stays applied) while their setting
    // was never saved.
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem('tropos-dark-mode', String(next));
    const result = await updateProfile({ darkMode: next });
    if (!result.ok) {
      document.documentElement.classList.toggle("dark", prev);
      localStorage.setItem('tropos-dark-mode', String(prev));
    }
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

      {/* 1. Profile */}
      <ProfileInfoSection
        profile={profile}
        name={name}
        setName={setName}
        weightKg={weightKg}
        setWeightKg={setWeightKg}
        heightCm={heightCm}
        setHeightCm={setHeightCm}
        updateProfile={updateProfile}
      />

      {/* 2. Training — PR-2: link-only. Programme owns the weekly
          layout editor, run-mode picker, race-goal flow, per-day
          overrides, configure plan, reset. Settings keeps the
          retake-onboarding action because that's a full identity
          rebuild, not a tweak. */}
      <TrainingSection
        profile={profile}
        updateProfile={updateProfile}
        navigate={navigate}
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
        streakReminder={streakReminder}
        updateStreakReminder={updateStreakReminder}
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

    </motion.div>
  );
}
