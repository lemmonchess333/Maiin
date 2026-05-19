import { useState } from "react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { Target, ChevronRight, RefreshCw, Minus, Plus, Check } from "lucide-react";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import { generateSchedule, getWeeklyRunTarget, runTargetWriteFields } from "@/lib/scheduleUtils";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Set1.1 + A1c: TrainingSection hosts post-onboarding plan-structure
 * editing.
 *
 * Pre-PR-2 this owned the weekly schedule editor. Pre-A1c (Run7
 * follow-up) it had degraded to link-only — "Change plan ›" on the
 * Programme page opened a 6-step ConfigurePlanModal for what was
 * really a small handful of structural edits (lift days, run days,
 * split, schedule reorder). That modal was the wrong shape; iOS
 * Settings is. Per Set1's locked decision, plan structure now lives
 * here as inline controls.
 *
 * Controls:
 *   - Lift days/week stepper (2–7).
 *   - Lift split picker (Full Body / Upper-Lower / PPL / Bro Split /
 *     Auto). Auto = engine picks based on day count.
 *   - Run days/week stepper (0–7).
 *
 * Each control writes immediately on change (iOS Settings live-save
 * convention) with throwOnError so the auth.tsx generic toast stays
 * suppressed; local state reverts on failure. Each write also
 * generates a fresh weekSchedule via `generateSchedule(liftDays,
 * runDays)` so the engine's downstream consumers see consistent
 * counts and a layout that matches. Custom day arrangements are
 * preserved via the dedicated "Edit weekly layout" sheet on the
 * Programme page, which writes the schedule explicitly — Settings
 * does the count-driven default; Programme does the manual override.
 *
 * What stays from the link-only era:
 *   - "Programme" link card → /program.
 *   - "Edit programme" (retake onboarding) button — distinct action
 *     for identity-level rebuilds (goal / equipment / injuries),
 *     not structural tweaks.
 */
type PreferredSplit = "full_body" | "upper_lower" | "ppl" | "bro_split" | "auto";

const SPLIT_OPTIONS: { id: PreferredSplit; label: string }[] = [
  { id: "full_body", label: "Full Body" },
  { id: "upper_lower", label: "Upper / Lower" },
  { id: "ppl", label: "Push / Pull / Legs" },
  { id: "bro_split", label: "Bro Split" },
  { id: "auto", label: "Auto" },
];

interface TrainingSectionProps {
  profile: UserProfile;
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean; throwOnError?: boolean },
  ) => Promise<UpdateProfileResult>;
  navigate: (path: string, opts?: { state?: Record<string, unknown> }) => void;
}

export default function TrainingSection({
  profile,
  updateProfile,
  navigate,
}: TrainingSectionProps) {
  const [liftDays, setLiftDays] = useState<number>(profile.weeklyWorkoutsTarget ?? 4);
  const [runDays, setRunDays] = useState<number>(getWeeklyRunTarget(profile));
  const [split, setSplit] = useState<PreferredSplit>(
    (profile.preferredSplit as PreferredSplit | undefined) ?? "auto",
  );
  // Track in-flight writes per control so we don't fire overlapping
  // updates while the user holds a stepper button.
  const [pending, setPending] = useState<"liftDays" | "runDays" | "split" | null>(null);

  async function persist(
    field: "liftDays" | "runDays" | "split",
    patch: Partial<UserProfile>,
    revert: () => void,
  ): Promise<void> {
    if (pending) return;
    setPending(field);
    try {
      // throwOnError so the caller (this function) owns the error
      // path. The generic auth.tsx toast stays suppressed and we
      // surface a specific failure message via sonner.
      await updateProfile(patch, { throwOnError: true });
    } catch (e) {
      logger.error(`[TrainingSection] ${field} write failed`, e);
      revert();
      toast.error("Couldn't save plan structure. Try again.", {
        id: "training-prefs-save",
      });
    } finally {
      setPending(null);
    }
  }

  function handleLiftDaysChange(delta: number): void {
    const next = Math.max(2, Math.min(7, liftDays + delta));
    if (next === liftDays) return;
    const prev = liftDays;
    setLiftDays(next);
    haptic();
    void persist(
      "liftDays",
      {
        weeklyWorkoutsTarget: next,
        weekSchedule: generateSchedule(next, runDays),
      },
      () => setLiftDays(prev),
    );
  }

  function handleRunDaysChange(delta: number): void {
    const next = Math.max(0, Math.min(7, runDays + delta));
    if (next === runDays) return;
    const prev = runDays;
    setRunDays(next);
    haptic();
    void persist(
      "runDays",
      {
        ...runTargetWriteFields(next),
        weekSchedule: generateSchedule(liftDays, next),
      },
      () => setRunDays(prev),
    );
  }

  function handleSplitChange(nextSplit: PreferredSplit): void {
    if (nextSplit === split) return;
    const prev = split;
    setSplit(nextSplit);
    haptic();
    void persist(
      "split",
      { preferredSplit: nextSplit },
      () => setSplit(prev),
    );
  }

  return (
    /* Bare body — the legacy Settings.tsx wraps this in an
       AccordionSection at the call site; the new nested
       SettingsTraining page renders it inline in a SettingsSection.
       Either way the controls live at the same level so a refactor
       can swap the chrome without touching the controls. */
    <div className="space-y-3">
      {/* A1c — inline plan-structure controls. Replace the
          ConfigurePlanModal flow for the structural edits that don't
          warrant a full wizard (lift days, split, run days). */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Plan structure
        </p>

        {/* Lift days stepper */}
        <div className="flex items-center justify-between rounded-xl bg-card border border-border/40 px-3 py-2.5">
          <span className="text-sm font-medium text-foreground">Lift days / week</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease lift days"
              onClick={() => handleLiftDaysChange(-1)}
              disabled={pending !== null || liftDays <= 2}
              className="w-9 h-9 rounded-lg bg-muted text-foreground inline-flex items-center justify-center motion-safe:active:scale-95 disabled:opacity-40"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="font-mono tabular-nums text-sm font-semibold min-w-[1.5rem] text-center">
              {liftDays}
            </span>
            <button
              type="button"
              aria-label="Increase lift days"
              onClick={() => handleLiftDaysChange(1)}
              disabled={pending !== null || liftDays >= 7}
              className="w-9 h-9 rounded-lg bg-muted text-foreground inline-flex items-center justify-center motion-safe:active:scale-95 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lift split picker */}
        <div className="rounded-xl bg-card border border-border/40 px-3 py-2.5 space-y-2">
          <p className="text-sm font-medium text-foreground">Lift split</p>
          <div
            role="radiogroup"
            aria-label="Lift split"
            className="flex flex-wrap gap-1.5"
          >
            {SPLIT_OPTIONS.map((opt) => {
              const isSelected = split === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSplitChange(opt.id)}
                  disabled={pending !== null && pending !== "split"}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1",
                    "motion-safe:transition-colors motion-safe:active:scale-[0.97]",
                    isSelected
                      ? "bg-primary-strong text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                    pending !== null && pending !== "split" && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {isSelected ? <Check className="w-3 h-3" aria-hidden="true" /> : null}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Run days stepper */}
        <div className="flex items-center justify-between rounded-xl bg-card border border-border/40 px-3 py-2.5">
          <span className="text-sm font-medium text-foreground">Run days / week</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease run days"
              onClick={() => handleRunDaysChange(-1)}
              disabled={pending !== null || runDays <= 0}
              className="w-9 h-9 rounded-lg bg-muted text-foreground inline-flex items-center justify-center motion-safe:active:scale-95 disabled:opacity-40"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="font-mono tabular-nums text-sm font-semibold min-w-[1.5rem] text-center">
              {runDays}
            </span>
            <button
              type="button"
              aria-label="Increase run days"
              onClick={() => handleRunDaysChange(1)}
              disabled={pending !== null || runDays >= 7}
              className="w-9 h-9 rounded-lg bg-muted text-foreground inline-flex items-center justify-center motion-safe:active:scale-95 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground pt-1">
          Changes save automatically. To rearrange which days are lift vs run, open
          {" "}
          <button
            type="button"
            onClick={() => {
              haptic();
              navigate("/program");
            }}
            className="underline underline-offset-2 motion-safe:active:scale-95"
          >
            Edit weekly layout
          </button>
          {" "}on the Programme page.
        </p>
      </div>

      {/* Existing controls (unchanged) ─────────────────────────────
          Programme link + Retake-onboarding escape hatch. Both kept
          for the cases the inline controls don't cover: deep-linking
          into the live programme view, and full identity reshape. */}
      <button
        type="button"
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
    </div>
  );
}
