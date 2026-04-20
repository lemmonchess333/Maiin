import { useState } from "react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import {
  Target,
  ChevronRight,
  RefreshCw,
  Footprints,
  Check,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { DAY_LABELS } from "@/lib/scheduleUtils";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getRacePhaseLabel } from "@/features/program/runScheduler";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

interface TrainingSectionProps {
  profile: UserProfile;
  runsTarget: number;
  schedule: ScheduleDay[];
  hasUnsavedScheduleChanges: boolean;
  handleDayToggle: (day: number) => void;
  handleApplyScheduleChanges: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>, opts?: { allowProtected?: boolean }) => Promise<void>;
  navigate: (path: string, opts?: { state?: Record<string, unknown> }) => void;
  programState: ProgramState | null;
  overrideRunDay: (dayIndex: number, templateId: string) => void;
  refreshRunSchedule: () => Promise<void>;
}

export default function TrainingSection({
  profile,
  runsTarget,
  schedule,
  hasUnsavedScheduleChanges,
  handleDayToggle,
  handleApplyScheduleChanges,
  updateProfile,
  navigate,
  programState,
  overrideRunDay,
  refreshRunSchedule,
}: TrainingSectionProps) {
  const [raceDistance, setRaceDistance] = useState<"5k" | "10k" | "half" | "marathon">("10k");
  const [raceTargetDate, setRaceTargetDate] = useState("");
  const [savingRaceGoal, setSavingRaceGoal] = useState(false);

  const handleSaveRaceGoal = async () => {
    if (!raceTargetDate) {
      toast.error("Please select a target date");
      return;
    }
    const target = new Date(raceTargetDate);
    const now = new Date();
    if (target < now) {
      toast.error("Target date is in the past");
      return;
    }
    const weeksAway = Math.round((target.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeksAway < 3) {
      toast.error("Target date must be at least 3 weeks away");
      return;
    }
    setSavingRaceGoal(true);
    try {
      await updateProfile({
        runMode: "race_prep",
        raceGoal: { distance: raceDistance, targetDate: raceTargetDate },
      });
      await refreshRunSchedule();
      toast.success("Race plan created!");
    } catch {
      toast.error("Failed to save race goal");
    } finally {
      setSavingRaceGoal(false);
    }
  };

  return (
    <AccordionSection icon={<Target className="w-5 h-5 text-primary" />} title="Training" subtitle="Weekly schedule, run mode">
      {/* Reconfigure Programme */}
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
          <p className="text-sm font-medium">Reconfigure programme</p>
          <p className="text-xs text-muted-foreground">Re-run setup to generate a new training plan and targets</p>
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
            <p className="text-xs text-muted-foreground">
              {(profile?.runMode ?? "freeform") === "freeform"
                ? "Pick any run type when you start"
                : (profile?.runMode ?? "freeform") === "structured"
                  ? "Auto-assigns run templates to your run days"
                  : "Follows a race training plan"}
            </p>

            {/* Race goal setup form */}
            {profile?.runMode === "race_prep" && !programState?.runPlan?.raceGoal && (
              <div className="p-3 rounded-xl bg-card space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Flag className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-foreground">Set Your Race Goal</span>
                </div>
                <fieldset>
                  <legend className="text-xs text-muted-foreground uppercase tracking-wider">Distance</legend>
                  <div className="flex gap-1.5 mt-1">
                    {(["5k", "10k", "half", "marathon"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setRaceDistance(d)}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                          raceDistance === d
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {d === "half" ? "Half" : d === "marathon" ? "Full" : d.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="race-target-date" className="text-xs text-muted-foreground uppercase tracking-wider">Target Date</label>
                  <input
                    id="race-target-date"
                    type="date"
                    value={raceTargetDate}
                    onChange={(e) => setRaceTargetDate(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
                  />
                </div>
                <button
                  onClick={handleSaveRaceGoal}
                  disabled={savingRaceGoal || !raceTargetDate}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {savingRaceGoal ? "Creating plan..." : "Create Race Plan"}
                </button>
              </div>
            )}

            {/* Race prep details */}
            {profile?.runMode === "race_prep" && programState?.runPlan?.raceGoal && (
              <div className="p-3 rounded-xl bg-card space-y-2">
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
              <div className="p-3 rounded-xl bg-card space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">This week&apos;s runs</p>
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
  );
}
