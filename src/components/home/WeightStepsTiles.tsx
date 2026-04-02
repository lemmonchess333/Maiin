import { THEME } from "@/lib/theme";
import { Scale, Footprints, ArrowRight, ChevronRight } from "lucide-react";
import { haptic } from "@/lib/haptic";

export default function WeightStepsTiles({ lastWeight, weightUnit, onLogWeight, lastWeightDate }: {
  lastWeight: string | null;
  weightUnit: string;
  onLogWeight: () => void;
  lastWeightDate: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={function() { haptic(); onLogWeight(); }} className="p-3 rounded-xl text-left active:scale-[0.97] bg-muted relative" style={{ border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: THEME.iconBg }}>
            <Scale className="w-3.5 h-3.5" style={{ color: THEME.semantic.activity }} />
          </div>
          <p className="text-micro uppercase tracking-wider font-medium" style={{ color: THEME.text.muted }}>Weight</p>
        </div>
        <div className="flex items-baseline gap-1">
          <p className="text-xl font-bold leading-none text-foreground font-mono tabular-nums">
            {lastWeight ? lastWeight : "\u2014"}
          </p>
          {lastWeight && <span className="text-xs" style={{ color: THEME.text.muted }}>{weightUnit === "lbs" ? "lb" : weightUnit}</span>}
        </div>
        <p className="text-micro mt-1" style={{ color: THEME.text.muted }}>{lastWeightDate}</p>
        <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: THEME.text.muted }} />
      </button>
      <button onClick={function() { haptic(); }} className="p-3 rounded-xl text-left active:scale-[0.97] bg-muted group" style={{ border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: THEME.iconBg }}>
            <Footprints className="w-3.5 h-3.5" style={{ color: THEME.semantic.positive }} />
          </div>
          <p className="text-micro uppercase tracking-wider font-medium" style={{ color: THEME.text.muted }}>Steps</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium" style={{ color: THEME.brand }}>Connect Health</span>
          <ArrowRight className="w-3 h-3" style={{ color: THEME.brand }} />
        </div>
      </button>
    </div>
  );
}
