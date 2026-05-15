import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import {
  Target,
  ChevronRight,
  RefreshCw,
  Footprints,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { DAY_LABELS } from "@/lib/scheduleUtils";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

/**
 * P0-8: TrainingSection scope narrowed.
 *
 * Pre-P0-8 this component owned the run mode picker, race goal form,
 * race progress strip, and per-day template override list. Those
 * have moved to Programme's `<ProgrammeRunSection />` — Settings now
 * just provides the retake button, the weekly schedule editor, and
 * a deep-link banner pointing the user at the new home for their
 * plan controls.
 *
 * The schedule-editor state itself is owned by
 * `useProgrammeScheduleEditor()` (P0-7) — this component is a render
 * surface only.
 */
interface TrainingSectionProps {
  profile: UserProfile;
  runsTarget: number;
  schedule: ScheduleDay[];
  hasUnsavedScheduleChanges: boolean;
  handleDayToggle: (day: number) => void;
  handleApplyScheduleChanges: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>, opts?: { allowProtected?: boolean }) => Promise<UpdateProfileResult>;
  navigate: (path: string, opts?: { state?: Record<string, unknown> }) => void;
}

export default function TrainingSection({
  profile: _profile,
  runsTarget,
  schedule,
  hasUnsavedScheduleChanges,
  handleDayToggle,
  handleApplyScheduleChanges,
  updateProfile,
  navigate,
}: TrainingSectionProps) {
  return (
    <AccordionSection icon={<Target className="w-5 h-5 text-primary" />} title="Training" subtitle="Weekly schedule, plan link">
      {/* Edit Programme */}
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
          <p className="text-xs text-muted-foreground">Update goals, days, equipment or injuries — we'll rebuild your plan</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </motion.button>

      {/* Weekly Schedule */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          Weekly Schedule
        </p>

        {/* Visual schedule editor */}
        <div className="bg-card rounded-2xl p-4 space-y-3">
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
                    <span className="text-xs text-muted-foreground">
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
                      className="text-xs font-medium"
                      style={{ color: s.type === "both" ? THEME.lifting : (color || "hsl(var(--muted-foreground))") }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
          </div>
          <p className="text-xs text-muted-foreground text-center">
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

        {/* P0-8: active-plan controls (run mode picker, race goal form,
            race progress strip, per-day template overrides) moved to
            the Programme tab. This banner is the deep-link from
            Settings to where those controls now live. Only shown when
            the user actually has run days scheduled — freeform-only
            users have nothing to manage on the Programme run section. */}
        {runsTarget > 0 && (
          <button
            onClick={() => {
              haptic();
              navigate("/program");
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            <Footprints className="w-4 h-4" style={{ color: THEME.running }} />
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">Manage your run plan</p>
              <p className="text-xs text-muted-foreground">
                Run mode, race goal, weekly run templates — now in the Programme tab
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </AccordionSection>
  );
}
