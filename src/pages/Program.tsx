import { useProgram } from "@/features/program/useProgram";
import { useSubscription } from "@/lib/subscription";
import { useAuth } from "@/lib/auth";
import { Lock } from "lucide-react";

export default function Program() {
  const { profile } = useAuth();
  const { features } = useSubscription();

  const program = useProgram({
    currentWeek: 2,
    primaryTrend: 0.03,
    fatigueScore: 14,
  });

  if (!features.phaseModes) {
    return (
      <div className="p-6 text-center space-y-4">
        <Lock className="w-8 h-8 text-muted-foreground mx-auto" />
        <h1 className="text-xl font-bold text-foreground">Program Engine</h1>
        <p className="text-sm text-muted-foreground">
          Unlock the adaptive Program Engine with Pro to get weekly intensity
          prescriptions, volume auto-adjustment, deload logic, and variation
          rotation.
        </p>
        <p className="text-xs font-semibold text-foreground">
          Upgrade to Pro in Settings
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Program Engine</h1>
        <p className="text-sm text-muted-foreground">
          Adaptive weekly prescription based on your performance
        </p>
      </div>

      {/* Current Goal */}
      {profile?.program && (
        <div className="bg-card rounded-xl border border-border/50 p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Current Goal</p>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-sm font-medium capitalize">
              {profile.program.goal}
            </span>
            <span className="text-xs text-muted-foreground">
              Phase: {profile.program.currentPhase}
            </span>
          </div>
        </div>
      )}

      {/* Weekly Prescription */}
      <div className="bg-card rounded-xl border border-border/50 p-4 space-y-4">
        <p className="text-sm font-medium text-foreground">This Week's Prescription</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-foreground">
              {program.intensityMultiplier.toFixed(2)}x
            </p>
            <p className="text-xs text-muted-foreground">Intensity</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-foreground">
              {program.volumeModifier.toFixed(2)}x
            </p>
            <p className="text-xs text-muted-foreground">Volume</p>
          </div>
        </div>

        <div className={`p-3 rounded-lg text-center text-sm font-medium ${
          program.deload
            ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
            : "bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400"
        }`}>
          {program.deload ? "Deload Week — Reduce load & recover" : "Progression Week — Push forward"}
        </div>
      </div>

      {/* Week Info */}
      <div className="bg-card rounded-xl border border-border/50 p-4">
        <p className="text-sm text-muted-foreground">
          Week <span className="font-semibold text-foreground">{program.week}</span> of mesocycle
        </p>
      </div>
    </div>
  );
}
