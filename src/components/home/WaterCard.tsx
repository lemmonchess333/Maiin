import { useState } from "react";
import { THEME } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
import { Droplets, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import WaterWave from "@/components/home/WaterWave";
import WaterBubbles from "@/components/home/WaterBubbles";

export default function WaterCard({ waterGlasses, waterTarget, onAddWater, onRemoveWater }: {
  waterGlasses: number;
  waterTarget: number;
  onAddWater: () => void;
  onRemoveWater: () => void;
}) {
  const [rippleKey, setRippleKey] = useState(0);

  return (
    <div className="relative overflow-hidden p-4 rounded-2xl bg-card" style={{
      boxShadow: waterGlasses > 0
        ? 'inset 0 -4px 12px rgba(82, 163, 189, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
        : undefined
    }}>
      <motion.div
        className="absolute inset-x-0 bottom-0 pointer-events-none rounded-2xl"
        style={{
          background: waterGlasses > 0
            ? 'linear-gradient(0deg, rgba(30, 120, 155, 0.25) 0%, rgba(58, 153, 186, 0.15) 40%, rgba(82, 163, 189, 0.08) 100%)'
            : 'transparent'
        }}
        initial={{ height: 0 }}
        animate={{ height: Math.min((waterGlasses / waterTarget) * 100, 100) + "%" }}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
      >
        {waterGlasses > 0 && (
          <WaterWave
            fillPercent={Math.min((waterGlasses / waterTarget) * 100, 100)}
            splash={rippleKey}
          />
        )}
      </motion.div>
      <AnimatePresence>
        {rippleKey > 0 && (
          <motion.div
            key={rippleKey}
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(circle at 50% 80%, ${THEME.semantic.hydration}4D, transparent 70%)` }}
            initial={{ opacity: 1, scale: 0.5 }}
            animate={{ opacity: 0, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
      {waterGlasses > 2 && <WaterBubbles />}
      <div className="relative z-10 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <Droplets className="w-5 h-5" style={{ color: THEME.semantic.hydration }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium" style={{ color: THEME.text.muted }}>Water</p>
          <p className="text-2xl font-extrabold leading-none text-foreground font-mono tabular-nums">
            {waterGlasses}
            <span className="text-sm font-normal mx-1" style={{ color: THEME.text.muted }}>/</span>
            <span className="text-sm font-normal" style={{ color: THEME.text.muted }}>{waterTarget}</span>
          </p>
          <p className="text-micro font-normal font-mono tabular-nums mt-0.5" style={{ color: THEME.text.muted }}>
            {(waterGlasses * 250 / 1000).toFixed(2).replace(/\.?0+$/, "")} L
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={function(e) { e.stopPropagation(); haptic(); onRemoveWater(); }} aria-label="Remove water" disabled={waterGlasses <= 0} className={cn("size-12 rounded-full flex items-center justify-center active:scale-[0.95] flex-shrink-0 border", waterGlasses <= 0 && "opacity-30")} style={{ backgroundColor: THEME.iconBg, borderColor: THEME.semantic.hydration + "30" }}>
            <Minus className="w-4 h-4" style={{ color: THEME.semantic.hydration }} />
          </button>
          <button onClick={function(e) { e.stopPropagation(); haptic(); onAddWater(); setRippleKey(function(k) { return k + 1; }); }} aria-label="Add water" disabled={waterGlasses >= waterTarget} className={cn("size-12 rounded-full flex items-center justify-center active:scale-[0.95] flex-shrink-0", waterGlasses >= waterTarget && "opacity-30")} style={{ backgroundColor: THEME.semantic.hydration + "26", borderColor: "transparent" }}>
            <Plus className="w-4 h-4" style={{ color: THEME.semantic.hydration }} />
          </button>
        </div>
      </div>
    </div>
  );
}
