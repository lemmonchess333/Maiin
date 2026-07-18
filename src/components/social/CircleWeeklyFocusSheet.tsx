/**
 * SOCIAL-FOCUS-01 — pick (or change) one weekly focus for a Circle.
 *
 * A focus is a themed intention from the closed six-value enum, never
 * data — the sheet deliberately reads NOTHING from the private
 * Momentum Check-in or any log store, so there is nothing here that
 * could leak counts, calories, loads, photos or routes. Options are
 * ordered by the Circle's type (relevant first) but every focus stays
 * offered — a race-prep member may still protect recovery.
 *
 * Radio-group semantics on the option list (role="radio" +
 * aria-checked, same pattern as the app's SegmentedControl); the
 * primary action label follows state: "Set weekly focus" first time,
 * "Update focus" once this week's check-in exists. A member can also
 * check in without choosing a focus — the plain check-in stays a
 * first-class action, not a downgraded one.
 */

import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type {
  GoalSpaceType,
  WeeklyFocus,
} from "@/features/goalSpace/goalSpaceTypes";
import {
  WEEKLY_FOCUS_LABELS,
  orderWeeklyFocus,
} from "@/features/goalSpace/weeklyFocus";

interface CircleWeeklyFocusSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  circleType: GoalSpaceType;
  /** This week's already-set focus, if any (null = checked in without
   *  a focus, or not checked in yet — see hasCheckedIn). */
  currentFocus: WeeklyFocus | null;
  /** Whether this week's check-in event already exists. */
  hasCheckedIn: boolean;
  busy: boolean;
  /** null = check in without a focus. */
  onSubmit: (focus: WeeklyFocus | null) => void;
}

export default function CircleWeeklyFocusSheet({
  open,
  onOpenChange,
  circleType,
  currentFocus,
  hasCheckedIn,
  busy,
  onSubmit,
}: CircleWeeklyFocusSheetProps) {
  const [selected, setSelected] = useState<WeeklyFocus | null>(currentFocus);

  // Re-sync the selection whenever the sheet (re)opens — it may be a
  // different circle, or the focus may have changed since last open.
  useEffect(() => {
    if (open) setSelected(currentFocus);
  }, [open, currentFocus]);

  const options = orderWeeklyFocus(circleType);
  const unchanged = hasCheckedIn && selected === currentFocus;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Weekly focus"
      description="One shared intention for the week. Only the focus you choose is shared — never numbers, meals, photos or plans."
    >
      <div className="space-y-3 pb-2">
        <div className="space-y-2" role="radiogroup" aria-label="Weekly focus">
          {options.map((focus) => (
            <button
              key={focus}
              type="button"
              role="radio"
              aria-checked={selected === focus}
              onClick={() => {
                haptic("light");
                setSelected(focus);
              }}
              className={cn(
                "w-full min-h-[44px] p-3 rounded-xl text-left transition-colors active:scale-[0.97]",
                selected === focus
                  ? "bg-primary/10 border border-primary/40"
                  : "bg-muted border border-transparent"
              )}
            >
              <p className="text-sm font-semibold text-foreground">
                {WEEKLY_FOCUS_LABELS[focus]}
              </p>
            </button>
          ))}
        </div>

        <Button
          className="w-full"
          loading={busy}
          disabled={selected === null || unchanged}
          onClick={() => {
            haptic("light");
            onSubmit(selected);
          }}
        >
          {hasCheckedIn ? "Update focus" : "Set weekly focus"}
        </Button>

        {!hasCheckedIn && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[44px] w-full"
            disabled={busy}
            onClick={() => {
              haptic("light");
              onSubmit(null);
            }}
          >
            Check in without a focus
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
