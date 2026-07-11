/**
 * SettingsLiftPlan — the dedicated lift-plan editing screen (Section-Split,
 * 2026-07). The lifting counterpart to SettingsRunPlan.
 *
 * The focused destination for the Programme page's "Edit lift plan" entry.
 * Renders ProgrammeSettings in `variant="lift"` — training focus, experience,
 * lift days + split, equipment, injuries, engine toggles — so editing the lift
 * plan no longer drops the user into the full goal+nutrition+running editor.
 * The nutrition + running drafts thread through the (shared) buildPlan save
 * unchanged, so a lift edit never disturbs them. The full programme editor
 * stays reachable from Settings and the Programme ⋯ "Edit programme" menu.
 *
 * Composition mirrors SettingsTraining: useAuth for profile, useProgram for
 * the settings/rebuild/refresh writers, ProgrammeSettings for the grouped
 * form, and a page-level ScheduleLayoutSheet the form links out to.
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useProgram } from "@/features/program/useProgram";
import SettingsSection from "@/components/settings/SettingsSection";
import ProgrammeSettings from "@/components/program/ProgrammeSettings";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";
import type { PrimaryGoal } from "@/features/program/programTypes";

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
  const { profile, updateProfile } = useAuth();
  const {
    programState,
    updateSettings,
    regenerateProgram,
    refreshRunSchedule,
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
      >
        {prefillGoal && (
          <p className="mb-3 px-3 py-2.5 rounded-xl bg-primary/10 text-xs text-foreground">
            Prefilled for your{blockTitle ? ` ${blockTitle}` : ""} block —
            review and save. Nothing changes until you save.
          </p>
        )}
        <ProgrammeSettings
          variant="lift"
          profile={profile}
          programState={programState}
          updateSettings={updateSettings}
          regenerateProgram={regenerateProgram}
          onOpenWeeklyLayout={() => setEditLayoutOpen(true)}
          prefillGoal={prefillGoal ?? undefined}
        />
      </SettingsSection>

      <ScheduleLayoutSheet
        open={editLayoutOpen}
        onClose={() => setEditLayoutOpen(false)}
        profile={profile}
        updateProfile={updateProfile}
        refreshRunSchedule={refreshRunSchedule}
        regenerateProgram={regenerateProgram}
      />
    </>
  );
}
