import { Zap } from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { THEME } from "@/lib/theme";

/**
 * SOC-P1c — the honest zero-week "Your week" slot.
 *
 * On a week with no sessions, the Feed used to stack a dead "Build
 * recap" button (nothing to build) on top of a full trajectory card of
 * zeros (0 pts · 0.0 km · 0 kg) — two heavy cards both saying nothing,
 * and the state EVERY user sees each Monday morning. This card merges
 * both slots into one compact line: the week is open, here's the number
 * to beat, and the one action that changes it (train). The full recap +
 * trajectory cards return the moment a session exists.
 */
export default function WeekOpenerCard({
  lastWeekScore,
  onStartTraining,
}: {
  lastWeekScore: number;
  onStartTraining: () => void;
}) {
  return (
    <div className="mt-4 p-4 rounded-2xl bg-card card-shadow space-y-2">
      <SectionLabel>Your week</SectionLabel>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="size-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${THEME.brand}14` }}
          >
            <Zap size={16} style={{ color: THEME.brand }} />
          </div>
          <p className="text-small text-muted-foreground leading-snug">
            {lastWeekScore > 0 ? (
              <>
                Week&apos;s open —{" "}
                <span className="font-mono tabular-nums font-semibold text-foreground">
                  {lastWeekScore.toLocaleString()}
                </span>{" "}
                pts to beat from last week
              </>
            ) : (
              "Week's open — your first session starts your trajectory"
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onStartTraining}
          className="text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0 min-h-[44px]"
        >
          Start training
        </button>
      </div>
    </div>
  );
}
