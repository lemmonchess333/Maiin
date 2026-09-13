import { useState } from "react";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import type { WorkoutDay } from "@/features/program/programTypes";
import {
  buildTimeBudgetSession,
  isLiftTimeBudget,
} from "@/features/program/liftTimeBudget";
import {
  estimateSessionMinutes,
  summarizeTrim,
} from "@/features/program/expressSession";
import Button from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";

export default function LiftTimeBudgetSettings({
  profile,
  workouts,
  updateProfile,
}: {
  profile: UserProfile;
  workouts: WorkoutDay[];
  updateProfile: (
    updates: Partial<UserProfile>
  ) => Promise<UpdateProfileResult>;
}) {
  const saved = isLiftTimeBudget(profile.liftTimeBudgetMinutes)
    ? profile.liftTimeBudgetMinutes
    : null;
  const [minutes, setMinutes] = useState<number | null>(saved);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (saving || minutes === saved) return;
    setSaving(true);
    try {
      const result = await updateProfile({ liftTimeBudgetMinutes: minutes });
      if (!result.ok) throw result.error;
      toast.success(
        minutes === null
          ? "Full sessions are your default"
          : "Usual session time saved"
      );
    } catch (error) {
      logger.error("Lift time preference save failed", error);
      toast.error("Couldn’t save your session time. Try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      aria-label="Usual lifting time"
      className="ds-card p-4 space-y-3 mt-4"
    >
      <label className="block space-y-2 text-sm text-foreground">
        <span>Usual time for lifting</span>
        <select
          className="ds-input min-h-11 w-full font-mono tabular-nums"
          value={minutes ?? ""}
          onChange={(e) =>
            setMinutes(e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">Full sessions</option>
          {[30, 45, 60, 75, 90, 120].map((n) => (
            <option key={n} value={n}>
              {n} min
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Start workout will prepare a session for this time, including in future
        weeks. Main lifts stay; accessories or sets may be trimmed. You can
        still choose the full session.
      </p>
      <div aria-live="polite" className="space-y-2">
        {workouts.map((day, index) => {
          const plan =
            minutes === null ? null : buildTimeBudgetSession(day, minutes);
          const estimate =
            plan?.estimatedMinutes ?? estimateSessionMinutes(day.exercises);
          return (
            <div key={index} className="text-xs text-muted-foreground">
              <p className="text-sm text-foreground">
                {day.dayName} · about{" "}
                <span className="font-mono tabular-nums">{estimate}</span> min
              </p>
              {plan && (
                <p>
                  {summarizeTrim(plan.trim)}
                  {estimate > minutes!
                    ? ". The main lifts still take longer than your available time."
                    : "."}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Estimates include rests, warm-ups and setup. Actual time can vary. Your
        full programme and completed history stay available.
      </p>
      <Button
        fullWidth
        loading={saving}
        disabled={saving || minutes === saved}
        onClick={() => void save()}
      >
        Save session time
      </Button>
    </section>
  );
}
