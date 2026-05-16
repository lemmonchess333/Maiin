import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { Target, ChevronRight, RefreshCw } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

/**
 * PR-2: TrainingSection becomes link-only.
 *
 * Pre-PR-2 this section hosted the weekly schedule editor (day
 * chips + Apply Changes), the schedule editor state via
 * `useProgrammeScheduleEditor`, and a deep-link banner pointing at
 * Programme for run-mode / race-goal. Programme already owns
 * run-mode + race-goal (PR-0d) and now also owns the weekly layout
 * editor (PR-2 → Programme overflow → "Edit weekly layout"). So
 * Settings → Training has nothing left to render except a single
 * entry-point card that takes the user to Programme.
 *
 * What stays here:
 *   - "Programme" link card → /program.
 *   - "Edit programme" (retake onboarding) button — different
 *     action; it intentionally lives in Settings because retaking
 *     onboarding is a full identity-reshape, not a tweak.
 */
interface TrainingSectionProps {
  profile: UserProfile;
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean },
  ) => Promise<UpdateProfileResult>;
  navigate: (path: string, opts?: { state?: Record<string, unknown> }) => void;
}

export default function TrainingSection({
  profile: _profile,
  updateProfile,
  navigate,
}: TrainingSectionProps) {
  return (
    <AccordionSection
      icon={<Target className="w-5 h-5 text-primary" />}
      title="Training"
      subtitle="Programme controls"
    >
      {/* PR-2: link card → Programme. Programme owns weekly layout,
          run mode, race goal, per-day overrides, configure plan, and
          reset programme. Settings is a defaults + identity surface
          only. */}
      <button
        onClick={() => {
          haptic();
          navigate("/program");
        }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
      >
        <Target className="w-4 h-4 text-primary" />
        <div className="flex-1 text-left">
          <p className="text-sm font-medium">Programme</p>
          <p className="text-xs text-muted-foreground">
            Manage programme, weekly layout, race prep and run schedule
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Retake onboarding — full programme rebuild starting from the
          goal/equipment/injuries questionnaire. Distinct from the
          Programme overflow's "Reset programme" (which keeps the
          user's answers and just regenerates the lift split + clears
          week history). */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={async () => {
          haptic("error");
          await updateProfile({ onboardingComplete: false });
          navigate("/onboarding", { state: { retake: true } });
        }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
      >
        <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 text-left">
          <p className="text-sm font-medium">Edit programme</p>
          <p className="text-xs text-muted-foreground">
            Update goals, days, equipment or injuries &mdash; we&apos;ll rebuild your plan
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </motion.button>
    </AccordionSection>
  );
}
