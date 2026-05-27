/**
 * PR-L L4 client UI — fell-behind prompt sheet (Q24 — adaptive plan).
 *
 * Surfaced when `programState.pendingFellBehindPrompt` is set by the
 * server-side `weeklyFellBehindCheck` Cloud Function (Mondays 05:00
 * UTC, after a week where the user ran <50% of their weekly target).
 *
 * Three choices per the Q24 lock — matches NRC's adaptive-plan
 * pattern:
 *
 *   1. Shift plan back 1 week — race date +7d, regen plan
 *   2. Compress remaining weeks — keep date, accept compressed prep
 *   3. Skip and continue — dismiss without plan change
 *
 * All three clear `pendingFellBehindPrompt` so the sheet won't
 * re-surface until next Monday's check writes a fresh flag.
 *
 * Mounted from Home so the prompt lands on the user's first app
 * open after Monday's sweep.
 */

import { useState } from "react";
import { Footprints } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { logger } from "@/lib/logger";

interface FellBehindSheetProps {
  open: boolean;
  /** Closes the sheet without writing — leaves the flag in place so
   *  the sheet re-opens on next app launch. Use sparingly; the
   *  three action buttons are the intended dismissal path. */
  onClose: () => void;
  /** Server-written flag payload — drives the body copy. */
  prompt: {
    weekKey: string;
    completedRatio: number;
    realRunCount: number;
    weeklyTarget: number;
  };
  /** Writers from useProgram. */
  dismissFellBehindPrompt: () => Promise<void>;
  shiftRacePlanBackOneWeek: () => Promise<void>;
  compressRacePlan: () => Promise<void>;
  /** True when the user is in race_prep mode AND has a raceGoal.
   *  When false, the shift / compress buttons are hidden — only the
   *  dismiss path applies (e.g. structured-mode users). */
  raceModeActive: boolean;
}

export default function FellBehindSheet({
  open,
  onClose,
  prompt,
  dismissFellBehindPrompt,
  shiftRacePlanBackOneWeek,
  compressRacePlan,
  raceModeActive,
}: FellBehindSheetProps) {
  const [pending, setPending] = useState<"shift" | "compress" | "skip" | null>(
    null
  );

  async function handle(
    action: "shift" | "compress" | "skip",
    writer: () => Promise<void>
  ): Promise<void> {
    if (pending) return;
    setPending(action);
    try {
      await writer();
      onClose();
    } catch (err) {
      logger.warn(`[fellBehind] ${action} writer failed`, err);
      setPending(null);
    }
  }

  const percent = Math.round(prompt.completedRatio * 100);

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Last week didn't go to plan"
      description="Pick how you want to adjust"
      hideHeader
    >
      <div className="px-5 pb-6 pt-4 space-y-4">
        <div className="w-9 h-1 rounded-full bg-border mx-auto" />

        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${THEME.running}1A` }}
          >
            <Footprints className="w-5 h-5" style={{ color: THEME.running }} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Last week
            </p>
            <p className="text-base font-semibold text-foreground mt-0.5">
              {prompt.realRunCount} of {prompt.weeklyTarget} runs ({percent}%)
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {raceModeActive
            ? "Want to adjust the plan to match where you are now?"
            : "No worries — your weekly target stays the same."}
        </p>

        <div className="space-y-2">
          {raceModeActive && (
            <>
              <button
                type="button"
                onClick={() => handle("shift", shiftRacePlanBackOneWeek)}
                disabled={!!pending}
                className={cn(
                  "w-full py-2.5 rounded-xl text-sm font-semibold",
                  "bg-primary text-primary-foreground",
                  "active:scale-[0.97] transition-transform",
                  pending && pending !== "shift" && "opacity-40"
                )}
              >
                {pending === "shift" ? "Shifting…" : "Shift plan back 1 week"}
              </button>
              <button
                type="button"
                onClick={() => handle("compress", compressRacePlan)}
                disabled={!!pending}
                className={cn(
                  "w-full py-2.5 rounded-xl text-sm font-semibold",
                  "bg-card border border-border text-foreground",
                  "active:scale-[0.97] transition-transform",
                  pending && pending !== "compress" && "opacity-40"
                )}
              >
                {pending === "compress"
                  ? "Compressing…"
                  : "Compress remaining weeks"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => handle("skip", dismissFellBehindPrompt)}
            disabled={!!pending}
            className={cn(
              "w-full py-2.5 rounded-xl text-sm font-medium",
              "text-muted-foreground hover:text-foreground",
              "active:scale-[0.97] transition-transform",
              pending && pending !== "skip" && "opacity-40"
            )}
          >
            {pending === "skip" ? "Dismissing…" : "Skip and continue"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
