import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Droplets, Plus, Minus } from "lucide-react";
import { useWaterLog } from "@/hooks/useWaterLog";
import { THEME } from "@/lib/theme";
import { toast } from "sonner";

export function WaterTracker() {
  const { glasses, target, logWater, setWaterAmount, progress } = useWaterLog();
  const [rippleKey, setRippleKey] = useState(0);

  const handleAdd = async () => {
    await logWater(1);
    setRippleKey((k) => k + 1);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
    if (glasses + 1 >= target) {
      toast.success("Water target hit! Stay hydrated!");
    }
  };

  const handleRemove = async () => {
    if (glasses <= 0) return;
    await setWaterAmount(glasses - 1);
  };

  const pct = Math.round(progress * 100);

  return (
    <div className="p-4 rounded-2xl bg-card overflow-hidden relative" style={{ minHeight: 180 }}>
      {/* Animated fill background */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        initial={{ height: "0%" }}
        animate={{ height: pct + "%" }}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
        style={{
          background: `linear-gradient(to top, ${THEME.semantic.hydration}2E, ${THEME.semantic.hydration}0A)`,
        }}
      />

      {/* Ripple effect */}
      <AnimatePresence>
        {rippleKey > 0 && (
          <motion.div
            key={rippleKey}
            className="absolute pointer-events-none rounded-full border-2 border-blue-400/40"
            style={{
              bottom: `calc(${pct}% - 24px)`,
              left: "50%",
              marginLeft: -24,
              width: 48,
              height: 48,
            }}
            initial={{ scale: 0.3, opacity: 0.6 }}
            animate={{ scale: 2.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="relative z-10 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Droplets size={16} style={{ color: THEME.semantic.hydration }} />
            <span className="text-xs uppercase tracking-[0.5px] font-medium" style={{ color: THEME.text.muted }}>Water</span>
          </div>
          <span className="text-xs text-muted-foreground">{pct}%</span>
        </div>

        {/* Big number */}
        <div className="text-center py-2">
          <p className="text-[32px] font-extrabold tabular-nums leading-tight" style={{ color: THEME.semantic.hydration }}>
            {Math.round(glasses * 250)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            of {target * 250} ml
          </p>
        </div>

        {/* Glass dots */}
        <div className="flex justify-center gap-1 flex-wrap">
          {Array.from({ length: target }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-colors duration-300"
              style={{
                backgroundColor: i < glasses ? THEME.semantic.hydration : `${THEME.semantic.hydration}26`,
              }}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex justify-center gap-3">
          <button
            onClick={handleRemove}
            disabled={glasses <= 0}
            className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition-all disabled:opacity-30"
          >
            <Minus size={18} className="text-muted-foreground" />
          </button>
          <button
            onClick={handleAdd}
            className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all"
            style={{ backgroundColor: `${THEME.semantic.hydration}26` }}
          >
            <Plus size={18} style={{ color: THEME.semantic.hydration }} />
          </button>
        </div>
      </div>
    </div>
  );
}
