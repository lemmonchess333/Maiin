import { motion } from "framer-motion";
import { Droplets, Plus } from "lucide-react";
import { useWaterLog } from "@/hooks/useWaterLog";
import { toast } from "sonner";

export function WaterTracker() {
  const { glasses, target, logWater, progress } = useWaterLog();

  const handleLog = async () => {
    await logWater(1);
    if (glasses + 1 >= target) {
      toast.success("Water target hit! Stay hydrated!");
    }
  };

  const circumference = 2 * Math.PI * 20;
  const offset = circumference * (1 - progress);

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <div className="flex items-center gap-4">
        {/* Progress ring */}
        <div className="relative w-12 h-12 shrink-0">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
            <circle
              cx="24" cy="24" r="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-muted/50"
            />
            <motion.circle
              cx="24" cy="24" r="20"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Droplets className="w-4 h-4 text-blue-500" />
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Water</p>
          <p className="text-sm font-semibold text-foreground">
            {glasses} / {target} glasses
          </p>
          <p className="text-[10px] text-muted-foreground">
            {Math.round(glasses * 250)}ml ({Math.round(glasses * 8.45)} fl oz)
          </p>
        </div>

        {/* Log button */}
        <button
          onClick={handleLog}
          className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center active:scale-90 transition-transform"
        >
          <Plus className="w-4 h-4 text-blue-500" />
        </button>
      </div>
    </div>
  );
}
