import WeeklyVolumeCard from "@/components/program/WeeklyVolumeCard";
/**
 * SettingsLiftPlan — the dedicated lift-plan editing screen (Section-Split,
 * 2026-07). The lifting counterpart to SettingsRunPlan.
 *
 * A row on the Settings list, and the destination of Train's "Edit lift
 * plan". Renders ProgrammeSettings: training focus, experience, lift days
 * and split, equipment, injuries, the engine toggles. The nutrition and
 * running drafts thread through the (shared) buildPlan save unchanged, so
 * a lift edit never disturbs them.
 *
 * Since Trim1 calls 2 and 7 (the owner, 11 November 2026: "streamline
 * all") it also carries what two pages with little of their own held: the
 * rest timer's two controls, from Settings → Workouts, and Reset
 * programme, from Settings → Programme, a page that edited nothing and
 * that Lift plan and Run plan used to sit under.
 *
 * Composition: useAuth for profile, useProgram for the
 * settings/rebuild/refresh writers, ProgrammeSettings for the grouped
 * form, and a page-level ScheduleLayoutSheet the form links out to.
 *
 * It also carries the weekly sets-per-muscle table (D-LIFT-1), which used
 * to sit on the Train tab. There it was a verdict you could not act on
 * without leaving: collapsed it said "4 muscles below target", a count of
 * problems rather than a finding, and the fields that fix it were two
 * screens away. Here the finding and its remedy are on one page — it rates
 * the very days and focus this form edits — and Train keeps one fewer card.
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useProgram } from "@/features/program/useProgram";
import SettingsSection from "@/components/settings/SettingsSection";
import ProgrammeSettings from "@/components/program/ProgrammeSettings";
import RestTimerPrefs from "@/components/settings/RestTimerPrefs";
import TrackSettingsSectionView from "@/components/settings/TrackSettingsSectionView";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";
import type { PrimaryGoal } from "@/features/program/programTypes";
import { sessionMinutesFor } from "@/features/program/sessionFit";

/**
 * Blk1 (5): the block-creation hand-off arrives as route state. Validate
 * it at the boundary — nav state is client-internal but still untyped.
 * Only the lifting-shaped goals are prefillable from a block preset.
 */
const PREFILLABLE_GOALS: readonly PrimaryGoal[] = [
  "strength",
  "hypertrophy",
  "running",
];

function readBlockHandoff(state: unknown): {
  prefillGoal: PrimaryGoal | null;
  blockTitle: string | null;
} {
  if (state == null || typeof state !== "object") {
    return { prefillGoal: null, blockTitle: null };
  }
  const s = state as Record<string, unknown>;
  if (s.source !== "block") return { prefillGoal: null, blockTitle: null };
  const goal = PREFILLABLE_GOALS.find((g) => g === s.prefillGoal) ?? null;
  return {
    prefillGoal: goal,
    blockTitle: typeof s.blockTitle === "string" ? s.blockTitle : null,
  };
}

export default function SettingsLiftPlan() {
  const { profile, updateProfile, refreshProfile } = useAuth();
  const {
    programState,
    readiness,
    updateSettings,
    regenerateProgram,
    refreshRunSchedule,
    recentLayoff,
    recentRuns,
  } = useProgram();

  const [editLayoutOpen, setEditLayoutOpen] = useState(false);
  const { prefillGoal, blockTitle } = readBlockHandoff(useLocation().state);

  if (!profile) {
    // Brief auth-resolution window; route guards keep signed-out users out.
    return <SettingsSection title="Lift plan" />;
  }

  return (
    <>
      <SettingsSection
        title="Lift plan"
        subtitle="Focus, experience, lift days, equipment, injuries"
        section="training"
      >
        {prefillGoal && (
          <p className="mb-3 px-3 py-2.5 rounded-xl bg-primary/10 text-xs text-foreground">
            Prefilled for your{blockTitle ? ` ${blockTitle}` : ""} block —
            review and save. Nothing changes until you save.
          </p>
        )}
        <ProgrammeSettings
          profile={profile}
          programState={programState}
          readiness={readiness}
          recentLayoff={recentLayoff}
          recentRuns={recentRuns}
          updateSettings={updateSettings}
          regenerateProgram={regenerateProgram}
          refreshProfile={refreshProfile}
          onOpenWeeklyLayout={() => setEditLayoutOpen(true)}
          prefillGoal={prefillGoal ?? undefined}
          activeBlockFocus={
            programState?.trainingBlock?.owned
              ? programState.trainingBlock.focus
              : undefined
          }
          afterForm={
            <>
              {/* Reported under the name Settings → Workouts had, so
                  the count of people who reach the rest timer runs on. */}
              <TrackSettingsSectionView section="workout_prefs">
                <RestTimerPrefs
                  key={profile.uid}
                  profile={profile}
                  updateProfile={updateProfile}
                />
              </TrackSettingsSectionView>
              {/* Collapsed: it rates what the fields above prescribe, so
                  it reads as the result of this form rather than another
                  setting. The goal comes from programState, which is what
                  a running block owns and what the plan was built for —
                  the profile copy would rate a block's week against the
                  PRE-block band. */}
              <WeeklyVolumeCard
                workouts={programState?.workouts ?? []}
                primaryGoal={programState?.primaryGoal ?? profile.primaryGoal}
                experience={profile.experience}
                sessionMinutes={
                  programState?.sessionMinutes ??
                  sessionMinutesFor(profile.liftTimeBudgetMinutes)
                }
                kit={profile}
              />
            </>
          }
        />
      </SettingsSection>

      <ScheduleLayoutSheet
        open={editLayoutOpen}
        onClose={() => setEditLayoutOpen(false)}
        profile={profile}
        programState={programState}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        regenerateProgram={regenerateProgram}
      />
    </>
  );
}
