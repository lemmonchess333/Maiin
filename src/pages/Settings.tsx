import { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { calculateTDEE } from "@/lib/tdee";
import type { ActivityLevel } from "@/lib/tdee";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, ChevronRight, Target } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import { usePrivacyZones } from "@/hooks/usePrivacyZones";
import {
  useMealReminders,
  useWorkoutReminders,
  useStreakReminder,
} from "@/hooks/RemindersProvider";
import { useCrews } from "@/hooks/useCrews";
import { useProgram } from "@/features/program/useProgram";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";

import ProfileInfoSection from "@/components/settings/ProfileInfoSection";
import TrainingSection from "@/components/settings/TrainingSection";
import NutritionSection from "@/components/settings/NutritionSection";
import WorkoutPrefsSection from "@/components/settings/WorkoutPrefsSection";
import UnitsAppearanceSection from "@/components/settings/UnitsAppearanceSection";
import ShoesSection from "@/components/settings/ShoesSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import PrivacySection from "@/components/settings/PrivacySection";
import AccountSection from "@/components/settings/AccountSection";
import AiUsageSection from "@/components/settings/AiUsageSection";
import TrackSettingsSectionView from "@/components/settings/TrackSettingsSectionView";
import SupportLegalSection from "@/components/settings/SupportLegalSection";
import SettingsAvatar from "@/components/settings/SettingsAvatar";

declare const __APP_VERSION__: string;

export default function Settings() {
  const navigate = useNavigate();
  const { user, profile, updateProfile, signOut } = useAuth();
  const { isInTrial, trialDaysLeft, tier } = useSubscription();
  const { defaultCrews, currentCrew, joinCrew, leaveCrew } = useCrews();
  // Run8: TrainingSection gained mode + race writers; both need
  // refreshRunSchedule. Legacy Settings page must continue working
  // for /settings/legacy users — mount the same wiring as
  // SettingsTraining (useProgram + ScheduleLayoutSheet).
  const { refreshRunSchedule, regenerateProgram } = useProgram();
  const [editLayoutOpen, setEditLayoutOpen] = useState(false);

  const [name, setName] = useState(profile?.displayName || "");
  const [weightKg, setWeightKg] = useState(profile?.weightKg || 70);
  const [heightCm, setHeightCm] = useState(profile?.heightCm || 170);
  const [mealsTarget, setMealsTarget] = useState(() =>
    Math.min(profile?.weeklyMealsTarget || 10, 20)
  );
  const [autoRestTimer, setAutoRestTimer] = useState(
    profile?.autoRestTimer ?? true
  );
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(
    profile?.defaultRestSeconds ?? 120
  );
  const [defaultVisibility, setDefaultVisibility] = useState<
    "public" | "followers" | "private"
  >(profile?.defaultVisibility ?? "public");
  const [autoPostRuns, setAutoPostRuns] = useState(
    profile?.autoPostRuns ?? true
  );
  const [autoPostWorkouts, setAutoPostWorkouts] = useState(
    profile?.autoPostWorkouts ?? false
  );
  const [audioCues, setAudioCues] = useState(profile?.audioCues ?? true);
  const [age, setAge] = useState(profile?.age ?? 25);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    (profile?.activityLevel as ActivityLevel) ?? "moderate"
  );
  const [trainingPhase, setTrainingPhase] = useState<
    "cut" | "lean bulk" | "recomp"
  >((profile?.program?.goal as "cut" | "lean bulk" | "recomp") ?? "recomp");
  const { zones: privacyZones, addZone, removeZone } = usePrivacyZones();
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneRadius, setNewZoneRadius] = useState(500);
  const { reminders: mealReminders, updateReminders: updateMealReminders } =
    useMealReminders();
  const {
    reminders: workoutReminders,
    updateReminders: updateWorkoutReminders,
  } = useWorkoutReminders();
  const { prefs: streakReminder, updatePrefs: updateStreakReminder } =
    useStreakReminder();

  const tdee = useMemo(() => {
    return calculateTDEE(
      weightKg,
      heightCm,
      age,
      activityLevel,
      trainingPhase,
      profile?.sex || "male"
    );
  }, [weightKg, heightCm, age, activityLevel, trainingPhase, profile?.sex]);

  // Reactive TDEE persistence — auto-save derived values when inputs change
  const prevTdeeRef = useRef(tdee);
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
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
    // was never saved. localStorage.setItem is wrapped in try/catch
    // — Safari private mode throws synchronously on setItem and
    // would otherwise skip the Firestore write entirely, dropping
    // the user's choice with no toast.
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("tropos-dark-mode", String(next));
    } catch {
      // Best-effort persistence; Firestore is the source of truth.
    }
    const result = await updateProfile({ darkMode: next });
    if (!result.ok) {
      document.documentElement.classList.toggle("dark", prev);
      try {
        localStorage.setItem("tropos-dark-mode", String(prev));
      } catch {
        // see above
      }
    }
  };

  // #984 "Hide the number" anti-anxiety mode. Mirrors toggleDark's
  // profile-update path (no raw setDoc — goes through updateProfile,
  // which routes the guarded write). No optimistic DOM swap needed:
  // the consuming surfaces re-render off profile.hideWeightNumber.
  const toggleHideWeightNumber = async () => {
    await updateProfile({ hideWeightNumber: !profile?.hideWeightNumber });
  };

  if (!profile) return null;

  const itemVariant = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  return (
    <motion.div
      className="space-y-4"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.04 } },
      }}
    >
      {/* Header with avatar */}
      <motion.header variants={itemVariant}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <SettingsAvatar profile={profile} />
            <div>
              <h1 className="text-xl font-extrabold text-foreground">
                Settings
              </h1>
              <p className="text-sm text-muted-foreground">
                Customize your experience
              </p>
            </div>
          </div>
          {user && (
            <button
              type="button"
              onClick={() => navigate(`/user/${user.uid}`)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors"
            >
              View Profile
            </button>
          )}
        </div>
      </motion.header>

      {/* 1. Profile */}
      <TrackSettingsSectionView section="profile_info">
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
      </TrackSettingsSectionView>

      {/* 2. Training — PR-2: link-only. Programme owns the weekly
          layout editor, run-mode picker, race-goal flow, per-day
          overrides, configure plan, reset. Settings keeps the
          retake-onboarding action because that's a full identity
          rebuild, not a tweak. */}
      {/* A1c refactor: TrainingSection no longer wraps itself in an
          AccordionSection (the new /settings/training nested page
          renders it inline). The legacy flat page composes the
          accordion chrome here so the visual stays unchanged. */}
      <TrackSettingsSectionView section="training">
        <AccordionSection
          icon={<Target className="size-5 text-primary" />}
          title="Training"
          subtitle="Plan structure"
        >
          <TrainingSection
            profile={profile}
            updateProfile={updateProfile}
            refreshRunSchedule={refreshRunSchedule}
            navigate={navigate}
            onOpenWeeklyLayout={() => setEditLayoutOpen(true)}
          />
        </AccordionSection>
      </TrackSettingsSectionView>

      {/* 3. Nutrition */}
      <TrackSettingsSectionView section="nutrition">
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
      </TrackSettingsSectionView>

      {/* 4. Workout Preferences */}
      <TrackSettingsSectionView section="workout_prefs">
        <WorkoutPrefsSection
          autoRestTimer={autoRestTimer}
          setAutoRestTimer={setAutoRestTimer}
          defaultRestSeconds={defaultRestSeconds}
          setDefaultRestSeconds={setDefaultRestSeconds}
          audioCues={audioCues}
          setAudioCues={setAudioCues}
          updateProfile={updateProfile}
        />
      </TrackSettingsSectionView>

      {/* 5. Units & Appearance */}
      <TrackSettingsSectionView section="units_appearance">
        <UnitsAppearanceSection
          profile={profile}
          toggleUnit={toggleUnit}
          toggleDark={toggleDark}
          toggleHideWeightNumber={toggleHideWeightNumber}
        />
      </TrackSettingsSectionView>

      {/* 6. Social & Privacy */}
      <TrackSettingsSectionView section="privacy">
        <PrivacySection
          user={user}
          profile={profile}
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
      </TrackSettingsSectionView>

      {/* 7. My Shoes */}
      <TrackSettingsSectionView section="shoes">
        <ShoesSection />
      </TrackSettingsSectionView>

      {/* 8. Notifications */}
      <TrackSettingsSectionView section="notifications">
        <NotificationsSection
          mealReminders={mealReminders}
          updateMealReminders={updateMealReminders}
          workoutReminders={workoutReminders}
          updateWorkoutReminders={updateWorkoutReminders}
          streakReminder={streakReminder}
          updateStreakReminder={updateStreakReminder}
        />
      </TrackSettingsSectionView>

      {/* 9. Subscription — navigation row, not accordion */}
      <TrackSettingsSectionView section="subscription">
        <button
          type="button"
          onClick={() => navigate("/upgrade")}
          className="w-full flex items-center justify-between p-4 rounded-2xl bg-card"
        >
          <div className="flex items-center gap-3">
            <Crown className="size-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">
                Subscription
              </p>
              <p className="text-xs text-muted-foreground">
                {tier === "pro"
                  ? "Pro — Full access"
                  : isInTrial
                    ? `Pro trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left`
                    : "Free — Upgrade"}
              </p>
            </div>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      </TrackSettingsSectionView>

      {/* 9b. AI usage — F1b lock pin #6 daily-usage pill */}
      <TrackSettingsSectionView section="ai_usage">
        <AiUsageSection />
      </TrackSettingsSectionView>

      {/* 10. Support & Legal */}
      <SupportLegalSection />

      {/* 11. Account */}
      <TrackSettingsSectionView section="account">
        <AccountSection user={user} signOut={signOut} />
      </TrackSettingsSectionView>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground">
        Tropos v{__APP_VERSION__}
      </p>

      {/* Run8 — schedule layout editor mounted at page level so
          TrainingSection's "Edit weekly layout" entry can launch it
          without prop-drilling the sheet itself. Mirrors the wiring
          in /settings/training (SettingsTraining.tsx). */}
      <ScheduleLayoutSheet
        open={editLayoutOpen}
        onClose={() => setEditLayoutOpen(false)}
        profile={profile}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        regenerateProgram={regenerateProgram}
      />
    </motion.div>
  );
}
