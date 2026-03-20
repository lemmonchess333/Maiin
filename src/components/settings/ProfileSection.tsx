import { motion } from "framer-motion";
import {
  User,
  Target,
  ChevronRight,
  RefreshCw,
  Footprints,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { DAY_LABELS } from "@/lib/scheduleUtils";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getRacePhaseLabel } from "@/features/program/runScheduler";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

interface ProfileSectionProps {
  profile: UserProfile;
  name: string;
  setName: (v: string) => void;
  weightKg: number;
  setWeightKg: (v: number) => void;
  heightCm: number;
  setHeightCm: (v: number) => void;
  mealsTarget: number;
  setMealsTarget: (v: number) => void;
  runsTarget: number;
  schedule: ScheduleDay[];
  hasUnsavedScheduleChanges: boolean;
  handleDayToggle: (day: number) => void;
  handleApplyScheduleChanges: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>, opts?: { allowProtected?: boolean }) => Promise<void>;
  navigate: (path: string, opts?: { state?: Record<string, unknown> }) => void;
  programState: ProgramState | null;
  overrideRunDay: (dayIndex: number, templateId: string) => void;
}

export default function ProfileSection({
  profile,
  name,
  setName,
  weightKg,
  setWeightKg,
  heightCm,
  setHeightCm,
  mealsTarget,
  setMealsTarget,
  runsTarget,
  schedule,
  hasUnsavedScheduleChanges,
  handleDayToggle,
  handleApplyScheduleChanges,
  updateProfile,
  navigate,
  programState,
  overrideRunDay,
}: ProfileSectionProps) {
  return (
    <AccordionSection icon={<User className="w-5 h-5 text-primary" />} title="Profile & Goals" subtitle="Name, body stats, weekly schedule" defaultOpen>
      {/* Retake Onboarding Quiz */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={async () => {
          await updateProfile({ onboardingComplete: false });
          navigate("/onboarding", { state: { retake: true } });
        }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/50 border border-border/30 hover:bg-muted transition-colors"
      >
        <RefreshCw className="w-4 h-4 text-primary" />
        <div className="flex-1 text-left">
          <p className="text-sm font-medium">Retake quiz</p>
          <p className="text-[11px] text-muted-foreground">Re-run the onboarding quiz and get a new program</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </motion.button>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="profile-weight" className="text-sm text-muted-foreground">Weight (kg)</label>
          <input
            id="profile-weight"
            type="number"
            value={weightKg}
            onChange={(e) => setWeightKg(Number(e.target.value))}
            className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-[10px] text-muted-foreground/60 mt-1">For TDEE calc. Log daily weight from Home.</p>
        </div>
        <div>
          <label htmlFor="profile-height" className="text-sm text-muted-foreground">Height (cm)</label>
          <input
            id="profile-height"
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
  );
}
