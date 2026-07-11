/**
 * Weekly logging focus (NUTR-CONSISTENCY-01) — the Food page's
 * consistency commitment card.
 *
 * A member picks ONE small logging intent for the current week;
 * progress derives from meal-day dates already logged. Everything
 * here stays owner-only. The single social affordance — "Share with
 * your circle" — appears only when the commitment is MET, is opt-in
 * per tap, one-shot per week, and publishes the constant status line
 * (SHARED_MET_TEXT): no calories, macros, counts, meals or weight,
 * enforced by the model pin + the Goal Space event fence + rules.
 * Missing the target never produces a punitive state.
 */

import { useCallback, useEffect, useState } from "react";
import {
  doc,
  getDoc,
  getDocs,
  query,
  where,
  collection,
} from "firebase/firestore";
import { UtensilsCrossed } from "lucide-react";
import { db } from "@/lib/firebase";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { getWeekKey } from "@/lib/performanceEngine";
import { weekBounds } from "@/lib/weeklyReviewViewModel";
import {
  INTENT_OPTIONS,
  SHARED_MET_TEXT,
  deriveProgress,
  parseCommitment,
  type NutritionCommitment,
  type NutritionIntent,
} from "@/lib/nutritionConsistency";
import { useGoalSpaces } from "@/features/goalSpace/useGoalSpaces";

/** Compact segment labels — the card copy above carries the "logging
 *  focus" context, so the control itself stays glanceable at 375px. */
const INTENT_SHORT: Record<NutritionIntent, string> = {
  log_3_days: "3 days",
  log_5_days: "5 days",
  log_daily: "Every day",
};

export default function FoodConsistencyCard({ uid }: { uid: string }) {
  const weekKey = getWeekKey(new Date());
  // undefined = loading, null = none set this week
  const [commitment, setCommitment] = useState<
    NutritionCommitment | null | undefined
  >(undefined);
  const [mealDates, setMealDates] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [intent, setIntent] = useState<NutritionIntent>("log_3_days");
  const [saving, setSaving] = useState(false);
  const { circles, publishEvent } = useGoalSpaces(uid);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { start, end } = weekBounds(weekKey);
        const [snap, meals] = await Promise.all([
          getDoc(doc(db, "users", uid, "nutritionCommitments", weekKey)),
          getDocs(
            query(
              collection(db, "users", uid, "meals"),
              where("date", ">=", start),
              where("date", "<=", end)
            )
          ),
        ]);
        if (cancelled) return;
        setCommitment(snap.exists() ? parseCommitment(snap.data()) : null);
        setMealDates(
          meals.docs
            .map((d) => d.data()?.date)
            .filter((d): d is string => typeof d === "string")
        );
      } catch (err) {
        // Read failure → hide the card this session. Leaving the state
        // `undefined` does that; `parseCommitment(null)` is null — it
        // would have re-shown the picker and let a fresh save overwrite
        // a commitment we simply failed to read.
        logger.error("nutritionConsistency: load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, weekKey]);

  const save = useCallback(
    async (record: NutritionCommitment) => {
      try {
        await setDocGuarded(
          doc(db, "users", uid, "nutritionCommitments", weekKey),
          record
        );
        setCommitment(record);
        return true;
      } catch (err) {
        logger.error("nutritionConsistency: save failed", err);
        return false;
      }
    },
    [uid, weekKey]
  );

  const start = async () => {
    haptic("light");
    setSaving(true);
    const ok = await save({ weekKey, intent, createdAt: Date.now() });
    setSaving(false);
    setPicking(false);
    if (ok) toast.success("Focus set for this week.");
    else toast.error("Couldn't save. Please try again.");
  };

  const shareMet = async () => {
    if (!commitment) return;
    haptic("light");
    const activeCircles = circles.filter((c) => c.space.active);
    const results = await Promise.all(
      activeCircles.map((c) =>
        publishEvent(c.space.id, "milestone", SHARED_MET_TEXT)
      )
    );
    if (results.some(Boolean)) {
      await save({ ...commitment, sharedMet: true });
      toast.success("Shared with your circle.");
    } else {
      toast.error("Couldn't share. Please try again.");
    }
  };

  if (commitment === undefined) return null;

  // Unset — one quiet row; the picker expands in place.
  if (commitment === null) {
    return (
      <div className="p-3 rounded-xl bg-card space-y-2">
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setPicking((v) => !v);
          }}
          aria-expanded={picking}
          className="w-full min-h-[44px] flex items-center gap-3 text-left active:scale-[0.97] transition-transform"
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-nutrition/10 shrink-0">
            <UtensilsCrossed
              className="size-4 text-nutrition"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Set a weekly logging focus
            </p>
            <p className="text-xs text-muted-foreground">
              One small, realistic commitment — private by default.
            </p>
          </div>
        </button>
        {picking && (
          <div className="space-y-2">
            <SegmentedControl
              options={INTENT_OPTIONS.map((o) => ({
                value: o.value,
                label: INTENT_SHORT[o.value],
              }))}
              value={intent}
              onChange={(v) => {
                haptic("light");
                setIntent(v);
              }}
              ariaLabel="Logging focus"
            />
            <Button
              className="w-full"
              loading={saving}
              onClick={() => void start()}
            >
              Set focus
            </Button>
          </div>
        )}
      </div>
    );
  }

  const progress = deriveProgress(commitment.intent, mealDates, weekKey);
  return (
    <div className="p-3 rounded-xl bg-card space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-nutrition/10 shrink-0">
          <UtensilsCrossed
            className="size-4 text-nutrition"
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {INTENT_OPTIONS.find((o) => o.value === commitment.intent)?.label}
            <span className="font-mono tabular-nums font-normal text-muted-foreground">
              {" "}
              · {progress.done}/{progress.target}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{progress.line}</p>
        </div>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: progress.target }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < progress.done ? "bg-nutrition" : "bg-border"
            )}
          />
        ))}
      </div>
      {progress.met &&
        !commitment.sharedMet &&
        circles.some((c) => c.space.active) && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => void shareMet()}
          >
            Share with your circle
          </Button>
        )}
    </div>
  );
}
